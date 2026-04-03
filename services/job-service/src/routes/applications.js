const express = require('express');
const { z } = require('zod');
const { pool, query } = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const { publishEvent } = require('../kafka');
const { EventTypes, KafkaTopics, createEvent } = require('@jobmatch/shared');

const router = express.Router();

const STATUS_CONFIG = {
  submitted: {
    title: 'Application submitted',
    defaultDescription: 'Your application was delivered successfully.',
    progressPercent: 20,
  },
  reviewed: {
    title: 'Recruiter reviewed your profile',
    defaultDescription: 'Your profile is now under recruiter review.',
    progressPercent: 45,
  },
  shortlisted: {
    title: 'Shortlisted for next step',
    defaultDescription: 'You moved forward in the hiring process.',
    progressPercent: 75,
  },
  rejected: {
    title: 'Process closed',
    defaultDescription: 'This application is no longer moving forward.',
    progressPercent: 100,
  },
  hired: {
    title: 'Offer accepted',
    defaultDescription: 'This role has been marked as hired.',
    progressPercent: 100,
  },
  note: {
    title: 'Recruiter update',
    defaultDescription: 'The recruiter added a hiring update.',
    progressPercent: null,
  },
};

const applySchema = z.object({
  coverLetter: z.string().max(5000).optional(),
});

const statusSchema = z.object({
  status: z.enum(['reviewed', 'shortlisted', 'rejected', 'hired']),
  note: z.string().trim().max(500).optional(),
});

function buildTimelineDetails(eventType, note) {
  const config = STATUS_CONFIG[eventType] || STATUS_CONFIG.note;
  const trimmedNote = note?.trim();

  return {
    title: config.title,
    description: trimmedNote || config.defaultDescription,
  };
}

async function recordTimelineEvent(client, {
  applicationId,
  jobId,
  candidateId,
  actorId,
  actorRole,
  eventType,
  note,
  metadata = {},
}) {
  const details = buildTimelineDetails(eventType, note);

  await client.query(
    `INSERT INTO job_service.application_timeline_events
      (application_id, job_id, candidate_id, actor_id, actor_role, event_type, title, description, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      applicationId,
      jobId,
      candidateId,
      actorId || null,
      actorRole || 'system',
      eventType,
      details.title,
      details.description,
      JSON.stringify(metadata),
    ]
  );

  return {
    eventType,
    title: details.title,
    description: details.description,
    actorRole: actorRole || 'system',
    createdAt: new Date().toISOString(),
    metadata,
  };
}

function formatTimelineEvent(row) {
  return {
    id: row.id,
    eventType: row.eventType,
    title: row.title,
    description: row.description,
    actorRole: row.actorRole,
    actorId: row.actorId,
    createdAt: row.createdAt,
    metadata: row.metadata || {},
  };
}

function buildTransparency(timeline, fallbackStatus, createdAt) {
  const normalized = timeline.map(formatTimelineEvent);
  const recruiterEvents = normalized.filter((event) => event.actorRole === 'recruiter' || event.actorRole === 'admin');
  const firstRecruiterResponseAt = recruiterEvents[0]?.createdAt || null;
  const latestEvent = normalized[normalized.length - 1] || null;

  let firstResponseHours = null;
  if (firstRecruiterResponseAt && createdAt) {
    const diffMs = new Date(firstRecruiterResponseAt).getTime() - new Date(createdAt).getTime();
    firstResponseHours = Math.max(0, Math.round((diffMs / 36e5) * 10) / 10);
  }

  return {
    currentStage: latestEvent?.eventType || fallbackStatus,
    latestEventTitle: latestEvent?.title || (STATUS_CONFIG[fallbackStatus]?.title || 'Application update'),
    latestEventAt: latestEvent?.createdAt || createdAt,
    hasRecruiterResponse: recruiterEvents.length > 0,
    firstRecruiterResponseAt,
    firstResponseHours,
    progressPercent: STATUS_CONFIG[latestEvent?.eventType || fallbackStatus]?.progressPercent || 20,
    totalEvents: normalized.length,
  };
}

function formatApplication(row) {
  const timeline = (row.timeline || []).map(formatTimelineEvent);

  return {
    id: row.id,
    jobId: row.job_id,
    recruiterId: row.recruiter_id,
    userId: row.user_id,
    jobTitle: row.job_title,
    jobCompany: row.job_company,
    jobLocation: row.job_location,
    jobWorkType: row.job_work_type,
    status: row.status,
    coverLetter: row.cover_letter,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    timeline,
    transparency: buildTransparency(timeline, row.status, row.created_at),
    candidate: row.candidate_first_name ? {
      id: row.user_id,
      firstName: row.candidate_first_name,
      lastName: row.candidate_last_name,
      fullName: `${row.candidate_first_name || ''} ${row.candidate_last_name || ''}`.trim(),
      headline: row.candidate_headline || null,
      location: row.candidate_location || null,
    } : null,
  };
}

router.post('/:id/apply', authMiddleware, async (req, res, next) => {
  const client = await pool.connect();

  try {
    const data = applySchema.parse(req.body);

    await client.query('BEGIN');

    const job = await client.query(
      'SELECT id, title, company, recruiter_id, status FROM job_service.jobs WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (job.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Job not found' });
    }
    if (job.rows[0].status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Job is not accepting applications' });
    }
    if (job.rows[0].recruiter_id === req.user.id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot apply to your own listing' });
    }

    const existing = await client.query(
      'SELECT id FROM job_service.applications WHERE job_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Already applied' });
    }

    const result = await client.query(
      `INSERT INTO job_service.applications (job_id, user_id, cover_letter)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, req.user.id, data.coverLetter]
    );

    await client.query('UPDATE job_service.jobs SET applications_count = applications_count + 1 WHERE id = $1', [req.params.id]);

    await recordTimelineEvent(client, {
      applicationId: result.rows[0].id,
      jobId: req.params.id,
      candidateId: req.user.id,
      actorId: req.user.id,
      actorRole: 'candidate',
      eventType: 'submitted',
      metadata: {
        coverLetterProvided: Boolean(data.coverLetter?.trim()),
      },
    });

    await client.query('COMMIT');

    const event = createEvent(EventTypes.APPLICATION_SUBMITTED, {
      applicationId: result.rows[0].id,
      jobId: req.params.id,
      userId: req.user.id,
      jobTitle: job.rows[0].title,
      company: job.rows[0].company,
      recruiterId: job.rows[0].recruiter_id,
    }, { source: 'job-service' });
    await publishEvent(KafkaTopics.APPLICATION_EVENTS, event);

    res.status(201).json({
      id: result.rows[0].id,
      jobId: result.rows[0].job_id,
      status: result.rows[0].status,
      coverLetter: result.rows[0].cover_letter,
      createdAt: result.rows[0].created_at,
      transparency: buildTransparency([], result.rows[0].status, result.rows[0].created_at),
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    next(err);
  } finally {
    client.release();
  }
});

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT
         a.*,
         j.title AS job_title,
         j.company AS job_company,
         j.location AS job_location,
         j.work_type AS job_work_type,
         j.recruiter_id,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id', t.id,
               'eventType', t.event_type,
               'title', t.title,
               'description', t.description,
               'actorRole', t.actor_role,
               'actorId', t.actor_id,
               'createdAt', t.created_at,
               'metadata', t.metadata
             ) ORDER BY t.created_at ASC
           ) FILTER (WHERE t.id IS NOT NULL),
           '[]'::jsonb
         ) AS timeline
       FROM job_service.applications a
       JOIN job_service.jobs j ON a.job_id = j.id
       LEFT JOIN job_service.application_timeline_events t ON t.application_id = a.id
       WHERE a.user_id = $1
       GROUP BY a.id, j.id
       ORDER BY a.created_at DESC`,
      [req.user.id]
    );

    res.json({
      applications: result.rows.map(formatApplication),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/applications', authMiddleware, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const job = await query('SELECT recruiter_id FROM job_service.jobs WHERE id = $1', [req.params.id]);
    if (job.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    if (job.rows[0].recruiter_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your listing' });
    }

    const result = await query(
      `SELECT
         a.*,
         j.title AS job_title,
         j.company AS job_company,
         j.location AS job_location,
         j.work_type AS job_work_type,
         j.recruiter_id,
         u.first_name AS candidate_first_name,
         u.last_name AS candidate_last_name,
         u.headline AS candidate_headline,
         u.location AS candidate_location,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id', t.id,
               'eventType', t.event_type,
               'title', t.title,
               'description', t.description,
               'actorRole', t.actor_role,
               'actorId', t.actor_id,
               'createdAt', t.created_at,
               'metadata', t.metadata
             ) ORDER BY t.created_at ASC
           ) FILTER (WHERE t.id IS NOT NULL),
           '[]'::jsonb
         ) AS timeline
       FROM job_service.applications a
       JOIN job_service.jobs j ON a.job_id = j.id
       LEFT JOIN user_service.users u ON u.id = a.user_id
       LEFT JOIN job_service.application_timeline_events t ON t.application_id = a.id
       WHERE a.job_id = $1
       GROUP BY a.id, j.id, u.id
       ORDER BY a.created_at DESC`,
      [req.params.id]
    );

    res.json({
      applications: result.rows.map(formatApplication),
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/status', authMiddleware, requireRole('recruiter', 'admin'), async (req, res, next) => {
  const client = await pool.connect();

  try {
    const data = statusSchema.parse(req.body);
    const note = data.note?.trim() || null;

    await client.query('BEGIN');

    const app = await client.query(
      `SELECT a.*, j.recruiter_id, j.title AS job_title
       FROM job_service.applications a
       JOIN job_service.jobs j ON a.job_id = j.id
       WHERE a.id = $1
       FOR UPDATE`,
      [req.params.id]
    );

    if (app.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Application not found' });
    }
    if (app.rows[0].recruiter_id !== req.user.id && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (app.rows[0].status === data.status && !note) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Application is already in that stage' });
    }

    const result = await client.query(
      'UPDATE job_service.applications SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [data.status, req.params.id]
    );

    const timelineEvent = await recordTimelineEvent(client, {
      applicationId: req.params.id,
      jobId: app.rows[0].job_id,
      candidateId: app.rows[0].user_id,
      actorId: req.user.id,
      actorRole: req.user.role,
      eventType: data.status,
      note,
      metadata: {
        oldStatus: app.rows[0].status,
        newStatus: data.status,
      },
    });

    await client.query('COMMIT');

    const event = createEvent(EventTypes.APPLICATION_STATUS_CHANGED, {
      applicationId: req.params.id,
      jobId: app.rows[0].job_id,
      userId: app.rows[0].user_id,
      recruiterId: app.rows[0].recruiter_id,
      jobTitle: app.rows[0].job_title,
      oldStatus: app.rows[0].status,
      newStatus: data.status,
      note,
      hasFeedback: Boolean(note),
    }, { source: 'job-service' });
    await publishEvent(KafkaTopics.APPLICATION_EVENTS, event);

    res.json({
      id: result.rows[0].id,
      status: result.rows[0].status,
      updatedAt: result.rows[0].updated_at,
      timelineEvent,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
