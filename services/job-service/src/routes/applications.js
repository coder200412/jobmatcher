const express = require('express');
const { z } = require('zod');
const { pool, query } = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const { publishEvent } = require('../kafka');
const { indexJob, removeJob } = require('../elasticsearch');
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
  round_pending: {
    title: 'Round updated',
    defaultDescription: 'The recruiter updated your round status.',
    progressPercent: null,
  },
  round_cleared: {
    title: 'Round cleared',
    defaultDescription: 'You cleared this hiring round.',
    progressPercent: null,
  },
  round_not_cleared: {
    title: 'Round not cleared',
    defaultDescription: 'You did not clear this hiring round.',
    progressPercent: null,
  },
};

const applySchema = z.object({
  coverLetter: z.string().max(5000).optional(),
});

const statusSchema = z.object({
  status: z.enum(['reviewed', 'shortlisted', 'rejected', 'hired']),
  note: z.string().trim().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.status === 'rejected' && !value.note?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['note'],
      message: 'A valid reason is required when rejecting an application.',
    });
  }
});

const roundResultSchema = z.object({
  status: z.enum(['pending', 'cleared', 'not_cleared']),
  reason: z.string().trim().max(500).optional(),
  note: z.string().trim().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.status === 'not_cleared' && !value.reason?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reason'],
      message: 'A valid reason is required when the candidate does not clear a round.',
    });
  }
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

function formatRound(row) {
  return {
    id: row.id,
    roundId: row.roundId || row.id,
    name: row.name,
    order: Number(row.order || 0),
    status: row.status || 'pending',
    recruiterReason: row.recruiterReason || null,
    recruiterNote: row.recruiterNote || null,
    evaluatedAt: row.evaluatedAt || null,
    evaluatedBy: row.evaluatedBy || null,
  };
}

function buildRoundsSummary(rounds = []) {
  const normalized = rounds.map(formatRound).sort((a, b) => a.order - b.order);
  const totalRounds = normalized.length;
  const clearedCount = normalized.filter((round) => round.status === 'cleared').length;
  const failedRounds = normalized.filter((round) => round.status === 'not_cleared');
  const failedRound = failedRounds[0] || null;
  const pendingRound = normalized.find((round) => round.status === 'pending') || null;
  const completionPercent = totalRounds > 0
    ? Math.max(20, Math.round((clearedCount / totalRounds) * 100))
    : 0;

  return {
    totalRounds,
    clearedCount,
    failedCount: failedRounds.length,
    pendingCount: normalized.filter((round) => round.status === 'pending').length,
    failedRound,
    nextPendingRound: pendingRound,
    allCleared: totalRounds > 0 && clearedCount === totalRounds,
    completionPercent,
  };
}

function buildTransparency(timeline, fallbackStatus, createdAt, rounds = []) {
  const normalized = timeline.map(formatTimelineEvent);
  const recruiterEvents = normalized.filter((event) => event.actorRole === 'recruiter' || event.actorRole === 'admin');
  const firstRecruiterResponseAt = recruiterEvents[0]?.createdAt || null;
  const latestEvent = normalized[normalized.length - 1] || null;
  const roundsSummary = buildRoundsSummary(rounds);

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
    progressPercent: roundsSummary.totalRounds > 0
      ? (roundsSummary.failedRound
          ? 100
          : roundsSummary.allCleared
            ? 100
            : roundsSummary.completionPercent)
      : (STATUS_CONFIG[latestEvent?.eventType || fallbackStatus]?.progressPercent || 20),
    totalEvents: normalized.length,
    roundsSummary,
  };
}

function formatApplication(row) {
  const timeline = (row.timeline || []).map(formatTimelineEvent);
  const rounds = (row.rounds || []).map(formatRound).sort((a, b) => a.order - b.order);

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
    rounds,
    transparency: buildTransparency(timeline, row.status, row.created_at, rounds),
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

async function syncJobSearchDocument(jobId) {
  const result = await query(
    `SELECT j.*,
            COALESCE(
              json_agg(s.skill_name) FILTER (WHERE s.id IS NOT NULL),
              '[]'
            ) AS skills
     FROM job_service.jobs j
     LEFT JOIN job_service.job_skills s ON s.job_id = j.id
     WHERE j.id = $1
     GROUP BY j.id`,
    [jobId]
  );

  if (result.rows.length === 0) {
    return;
  }

  const job = result.rows[0];
  if (job.status === 'closed') {
    await removeJob(jobId);
    return;
  }

  await indexJob(job);
}

async function ensureApplicationRoundResults(client, applicationId, jobId) {
  await client.query(
    `INSERT INTO job_service.application_round_results (application_id, round_id, status)
     SELECT $1, jr.id, 'pending'
     FROM job_service.job_rounds jr
     WHERE jr.job_id = $2
       AND jr.is_active = true
     ON CONFLICT (application_id, round_id) DO NOTHING`,
    [applicationId, jobId]
  );
}

async function syncRoundsAcrossApplications(client, jobId) {
  await client.query(
    `INSERT INTO job_service.application_round_results (application_id, round_id, status)
     SELECT a.id, jr.id, 'pending'
     FROM job_service.applications a
     JOIN job_service.job_rounds jr ON jr.job_id = a.job_id
     WHERE a.job_id = $1
       AND jr.is_active = true
     ON CONFLICT (application_id, round_id) DO NOTHING`,
    [jobId]
  );
}

async function getApplicationRoundCounts(client, applicationId, jobId) {
  const result = await client.query(
    `SELECT
       COUNT(jr.id)::int AS total_rounds,
       COUNT(*) FILTER (WHERE arr.status = 'cleared')::int AS cleared_count,
       COUNT(*) FILTER (WHERE arr.status = 'not_cleared')::int AS failed_count
     FROM job_service.job_rounds jr
     LEFT JOIN job_service.application_round_results arr
       ON arr.round_id = jr.id
      AND arr.application_id = $1
     WHERE jr.job_id = $2
       AND jr.is_active = true`,
    [applicationId, jobId]
  );

  return result.rows[0] || { total_rounds: 0, cleared_count: 0, failed_count: 0 };
}

function deriveApplicationStatusFromRounds(currentStatus, counts) {
  const total = Number(counts.total_rounds || 0);
  const cleared = Number(counts.cleared_count || 0);
  const failed = Number(counts.failed_count || 0);

  if (failed > 0) return 'rejected';
  if (total > 0 && cleared === total) return currentStatus === 'hired' ? 'hired' : 'shortlisted';
  if (cleared > 0) return 'reviewed';
  return currentStatus === 'hired' ? 'hired' : 'submitted';
}

router.post('/:id/apply', authMiddleware, async (req, res, next) => {
  const client = await pool.connect();

  try {
    const data = applySchema.parse(req.body);

    await client.query('BEGIN');

    const job = await client.query(
      'SELECT id, title, company, recruiter_id, status, positions_count, applications_count FROM job_service.jobs WHERE id = $1 FOR UPDATE',
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
    if (Number(job.rows[0].applications_count || 0) >= Number(job.rows[0].positions_count || 1)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'All positions for this job have already been filled' });
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

    const updatedJob = await client.query(
      `UPDATE job_service.jobs
       SET applications_count = applications_count + 1,
           status = CASE
             WHEN applications_count + 1 >= positions_count THEN 'closed'
             ELSE status
           END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING applications_count, positions_count, status`,
      [req.params.id]
    );

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

    await ensureApplicationRoundResults(client, result.rows[0].id, req.params.id);

    await client.query('COMMIT');
    await syncJobSearchDocument(req.params.id);

    const event = createEvent(EventTypes.APPLICATION_SUBMITTED, {
      applicationId: result.rows[0].id,
      jobId: req.params.id,
      userId: req.user.id,
      jobTitle: job.rows[0].title,
      company: job.rows[0].company,
      recruiterId: job.rows[0].recruiter_id,
      positionsCount: updatedJob.rows[0]?.positions_count || job.rows[0].positions_count,
      applicationsCount: updatedJob.rows[0]?.applications_count || Number(job.rows[0].applications_count || 0) + 1,
      jobStatus: updatedJob.rows[0]?.status || job.rows[0].status,
    }, { source: 'job-service' });
    await publishEvent(KafkaTopics.APPLICATION_EVENTS, event);

    res.status(201).json({
      id: result.rows[0].id,
      jobId: result.rows[0].job_id,
      status: result.rows[0].status,
      coverLetter: result.rows[0].cover_letter,
      createdAt: result.rows[0].created_at,
      transparency: buildTransparency([], result.rows[0].status, result.rows[0].created_at),
      jobStatus: updatedJob.rows[0]?.status || job.rows[0].status,
      positionsCount: updatedJob.rows[0]?.positions_count || job.rows[0].positions_count,
      applicationsCount: updatedJob.rows[0]?.applications_count || Number(job.rows[0].applications_count || 0) + 1,
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
         ) AS timeline,
         COALESCE(
           (
             SELECT jsonb_agg(
               jsonb_build_object(
                 'id', jr.id,
                 'roundId', jr.id,
                 'name', jr.round_name,
                 'order', jr.round_order,
                 'status', COALESCE(arr.status, 'pending'),
                 'recruiterReason', arr.recruiter_reason,
                 'recruiterNote', arr.recruiter_note,
                 'evaluatedAt', arr.evaluated_at,
                 'evaluatedBy', arr.evaluated_by
               )
               ORDER BY jr.round_order ASC
             )
             FROM job_service.job_rounds jr
             LEFT JOIN job_service.application_round_results arr
               ON arr.round_id = jr.id
              AND arr.application_id = a.id
             WHERE jr.job_id = j.id
               AND jr.is_active = true
           ),
           '[]'::jsonb
         ) AS rounds
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
         ) AS timeline,
         COALESCE(
           (
             SELECT jsonb_agg(
               jsonb_build_object(
                 'id', jr.id,
                 'roundId', jr.id,
                 'name', jr.round_name,
                 'order', jr.round_order,
                 'status', COALESCE(arr.status, 'pending'),
                 'recruiterReason', arr.recruiter_reason,
                 'recruiterNote', arr.recruiter_note,
                 'evaluatedAt', arr.evaluated_at,
                 'evaluatedBy', arr.evaluated_by
               )
               ORDER BY jr.round_order ASC
             )
             FROM job_service.job_rounds jr
             LEFT JOIN job_service.application_round_results arr
               ON arr.round_id = jr.id
              AND arr.application_id = a.id
             WHERE jr.job_id = j.id
               AND jr.is_active = true
           ),
           '[]'::jsonb
         ) AS rounds
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

router.put('/:id/rounds/:roundId', authMiddleware, requireRole('recruiter', 'admin'), async (req, res, next) => {
  const client = await pool.connect();

  try {
    const data = roundResultSchema.parse(req.body);

    await client.query('BEGIN');

    const app = await client.query(
      `SELECT a.*, j.recruiter_id, j.title AS job_title, jr.id AS round_id, jr.round_name, jr.round_order
       FROM job_service.applications a
       JOIN job_service.jobs j ON j.id = a.job_id
       JOIN job_service.job_rounds jr ON jr.id = $2 AND jr.job_id = a.job_id AND jr.is_active = true
       WHERE a.id = $1
       FOR UPDATE`,
      [req.params.id, req.params.roundId]
    );

    if (app.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Application or round not found' });
    }
    if (app.rows[0].recruiter_id !== req.user.id && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not authorized' });
    }

    await client.query(
      `INSERT INTO job_service.application_round_results
        (application_id, round_id, status, recruiter_reason, recruiter_note, evaluated_by, evaluated_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (application_id, round_id) DO UPDATE SET
         status = EXCLUDED.status,
         recruiter_reason = EXCLUDED.recruiter_reason,
         recruiter_note = EXCLUDED.recruiter_note,
         evaluated_by = EXCLUDED.evaluated_by,
         evaluated_at = EXCLUDED.evaluated_at,
         updated_at = NOW()`,
      [
        req.params.id,
        req.params.roundId,
        data.status,
        data.status === 'not_cleared' ? data.reason?.trim() || null : null,
        data.note?.trim() || null,
        req.user.id,
      ]
    );

    const counts = await getApplicationRoundCounts(client, req.params.id, app.rows[0].job_id);
    const derivedStatus = deriveApplicationStatusFromRounds(app.rows[0].status, counts);

    const updatedApplication = await client.query(
      'UPDATE job_service.applications SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [derivedStatus, req.params.id]
    );

    const eventTypeMap = {
      pending: 'round_pending',
      cleared: 'round_cleared',
      not_cleared: 'round_not_cleared',
    };

    const timelineEvent = await recordTimelineEvent(client, {
      applicationId: req.params.id,
      jobId: app.rows[0].job_id,
      candidateId: app.rows[0].user_id,
      actorId: req.user.id,
      actorRole: req.user.role,
      eventType: eventTypeMap[data.status],
      note: data.status === 'not_cleared'
        ? `${app.rows[0].round_name}: ${data.reason?.trim()}`
        : `${app.rows[0].round_name}${data.note?.trim() ? ` — ${data.note.trim()}` : ''}`,
      metadata: {
        roundId: app.rows[0].round_id,
        roundName: app.rows[0].round_name,
        roundOrder: app.rows[0].round_order,
        result: data.status,
        recruiterReason: data.reason?.trim() || null,
        recruiterNote: data.note?.trim() || null,
      },
    });

    await client.query('COMMIT');

    if (app.rows[0].status !== derivedStatus) {
      const event = createEvent(EventTypes.APPLICATION_STATUS_CHANGED, {
        applicationId: req.params.id,
        jobId: app.rows[0].job_id,
        userId: app.rows[0].user_id,
        recruiterId: app.rows[0].recruiter_id,
        jobTitle: app.rows[0].job_title,
        oldStatus: app.rows[0].status,
        newStatus: derivedStatus,
        note: data.status === 'not_cleared'
          ? `Did not clear ${app.rows[0].round_name}. ${data.reason?.trim()}`
          : `Updated ${app.rows[0].round_name} to ${data.status}.${data.note?.trim() ? ` ${data.note.trim()}` : ''}`,
        hasFeedback: Boolean(data.reason?.trim() || data.note?.trim()),
      }, { source: 'job-service' });
      await publishEvent(KafkaTopics.APPLICATION_EVENTS, event);
    }

    res.json({
      id: updatedApplication.rows[0].id,
      status: updatedApplication.rows[0].status,
      updatedAt: updatedApplication.rows[0].updated_at,
      timelineEvent,
      roundResult: {
        roundId: app.rows[0].round_id,
        name: app.rows[0].round_name,
        order: app.rows[0].round_order,
        status: data.status,
        recruiterReason: data.status === 'not_cleared' ? data.reason?.trim() || null : null,
        recruiterNote: data.note?.trim() || null,
        evaluatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    next(err);
  } finally {
    client.release();
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
