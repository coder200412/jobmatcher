const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { authMiddleware, optionalAuth, requireRole } = require('../auth');
const { publishEvent } = require('../kafka');
const { indexJob, searchJobs, removeJob } = require('../elasticsearch');
const { EventTypes, KafkaTopics, createEvent, analyzeJobContent, normalizeSkillEntries } = require('@jobmatch/shared');

const router = express.Router();

// Validation schemas
const createJobSchema = z.object({
  title: z.string().min(3).max(255),
  company: z.string().min(1).max(255),
  description: z.string().min(20).max(10000),
  location: z.string().max(255).optional(),
  workType: z.enum(['remote', 'hybrid', 'onsite']).default('onsite'),
  salaryMin: z.number().int().min(0).optional(),
  salaryMax: z.number().int().min(0).optional(),
  currency: z.string().length(3).default('USD'),
  experienceMin: z.number().int().min(0).default(0),
  experienceMax: z.number().int().min(0).optional(),
  skills: z.array(z.object({
    skillName: z.string().min(1).max(100),
    isRequired: z.boolean().default(true),
  })).max(20).optional(),
  status: z.enum(['active', 'draft']).default('active'),
});

const updateJobSchema = createJobSchema.partial();
const reportJobSchema = z.object({
  reason: z.enum(['spam', 'fake_company', 'misleading_description', 'offensive_content', 'other']),
  details: z.string().max(500).optional(),
});

function computeJobPriorityScore(job, normalizedSkills) {
  let score = 55;
  if ((job.salary_max || 0) >= 150000) score += 10;
  if ((job.work_type || job.workType) === 'remote') score += 8;
  score += Math.min((normalizedSkills || []).length * 3, 15);
  if ((job.experience_min || 0) <= 3) score += 5;
  return Math.max(0, Math.min(100, score));
}

function computeCandidateAlertMatch(candidate, job, normalizedSkills) {
  const candidateSkillSet = new Set((candidate.skills || []).map((skill) => String(skill).toLowerCase()));
  const jobSkillKeys = normalizedSkills.map((skill) => skill.key);
  const matchedSkills = jobSkillKeys.filter((skill) => candidateSkillSet.has(skill));
  const skillScore = jobSkillKeys.length > 0 ? matchedSkills.length / jobSkillKeys.length : 0.4;
  const experienceScore = Number(candidate.experience_years || 0) >= Number(job.experience_min || 0) ? 1 : 0.55;
  const locationScore = (job.work_type === 'remote' || !candidate.location || !job.location)
    ? 0.85
    : (String(candidate.location).toLowerCase().includes(String(job.location).toLowerCase()) ? 1 : 0.5);

  return Math.round((skillScore * 0.55 + experienceScore * 0.25 + locationScore * 0.2) * 100);
}

async function distributePriorityAlerts(job, skills) {
  const normalizedSkills = normalizeSkillEntries(skills);
  const priorityScore = computeJobPriorityScore(job, normalizedSkills);

  await query('UPDATE job_service.jobs SET priority_score = $1 WHERE id = $2', [priorityScore, job.id]);
  if (job.status !== 'active') {
    return;
  }

  const candidatesResult = await query(
    `SELECT
       u.id,
       u.first_name,
       u.location,
       u.experience_years,
       COALESCE(array_agg(s.skill_name) FILTER (WHERE s.id IS NOT NULL), '{}') AS skills,
       COALESCE(np.min_match_score, 70) AS min_match_score,
       COALESCE(np.only_high_priority, false) AS only_high_priority
     FROM user_service.users u
     LEFT JOIN user_service.user_skills s ON s.user_id = u.id
     LEFT JOIN notification_service.notification_preferences np ON np.user_id = u.id
     WHERE u.role = 'candidate' AND u.is_active = true
     GROUP BY u.id, np.min_match_score, np.only_high_priority
     LIMIT 200`
  );

  const notifications = [];
  for (const candidate of candidatesResult.rows) {
    const matchPercent = computeCandidateAlertMatch(candidate, job, normalizedSkills);
    const threshold = candidate.only_high_priority ? 85 : Number(candidate.min_match_score || 70);
    if (matchPercent < threshold) continue;

    notifications.push({
      userId: candidate.id,
      type: 'new_job_match',
      title: matchPercent >= 85 ? '🔥 High match job alert' : '🎯 New job match',
      message: `${job.title} at ${job.company} looks like a ${matchPercent}% match for you. ${matchPercent >= 85 ? 'Apply within 24 hours.' : 'Take a look when you can.'}`,
      data: {
        jobId: job.id,
        matchPercent,
        priorityScore,
      },
    });
  }

  for (const notification of notifications.slice(0, 25)) {
    await query(
      `INSERT INTO notification_service.notifications (user_id, type, title, message, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [notification.userId, notification.type, notification.title, notification.message, JSON.stringify(notification.data)]
    );
  }
}

function buildCredibility(row) {
  const reportCount = Number(row.report_count || 0);
  const verifiedRecruiter = Boolean(row.recruiter_verified);
  let score = 78;

  if (verifiedRecruiter) score += 12;
  if (row.salary_min || row.salary_max) score += 4;
  if ((row.skills || []).length >= 3) score += 3;
  score -= Math.min(reportCount * 12, 40);

  const bounded = Math.max(0, Math.min(100, score));

  return {
    score: bounded,
    label: bounded >= 85 ? 'Trusted' : bounded >= 65 ? 'Promising' : bounded >= 45 ? 'Needs review' : 'Caution',
    reportCount,
    verifiedRecruiter,
  };
}

// ── GET /api/jobs — Search & List ─────────────────────
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { q, location, workType, salaryMin, salaryMax, experienceMin, experienceMax, skills, page = 1, limit = 20 } = req.query;

    // Try Elasticsearch first
    const esResult = await searchJobs({
      q, location, workType, salaryMin, salaryMax,
      experienceMin, experienceMax, skills,
      page: parseInt(page), limit: parseInt(limit),
    });

    if (esResult) {
      return res.json(esResult);
    }

    // Fallback to PostgreSQL
    let sql = `
      SELECT j.*,
        COALESCE(json_agg(json_build_object('skillName', s.skill_name, 'isRequired', s.is_required))
          FILTER (WHERE s.id IS NOT NULL), '[]') AS skills,
        COALESCE(rc.report_count, 0) AS report_count,
        COALESCE(u.verified_recruiter, false) AS recruiter_verified
      FROM job_service.jobs j
      LEFT JOIN job_service.job_skills s ON j.id = s.job_id
      LEFT JOIN (
        SELECT job_id, COUNT(*)::int AS report_count
        FROM job_service.job_reports
        GROUP BY job_id
      ) rc ON rc.job_id = j.id
      LEFT JOIN user_service.users u ON u.id = j.recruiter_id
      WHERE j.status = 'active'
    `;
    const params = [];
    let paramIdx = 1;

    if (q) {
      sql += ` AND (j.title ILIKE $${paramIdx} OR j.description ILIKE $${paramIdx} OR j.company ILIKE $${paramIdx})`;
      params.push(`%${q}%`);
      paramIdx++;
    }
    if (location) {
      sql += ` AND j.location ILIKE $${paramIdx}`;
      params.push(`%${location}%`);
      paramIdx++;
    }
    if (workType) {
      sql += ` AND j.work_type = $${paramIdx}`;
      params.push(workType);
      paramIdx++;
    }
    if (salaryMin) {
      sql += ` AND j.salary_max >= $${paramIdx}`;
      params.push(parseInt(salaryMin));
      paramIdx++;
    }
    if (salaryMax) {
      sql += ` AND j.salary_min <= $${paramIdx}`;
      params.push(parseInt(salaryMax));
      paramIdx++;
    }

    sql += ` GROUP BY j.id, rc.report_count, u.verified_recruiter ORDER BY j.priority_score DESC, j.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const result = await query(sql, params);

    // Count total
    let countSql = `SELECT COUNT(*) FROM job_service.jobs WHERE status = 'active'`;
    const countResult = await query(countSql);

    res.json({
      jobs: result.rows.map(formatJob),
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/jobs/recruiter/mine ──────────────────────
router.get('/recruiter/mine', authMiddleware, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT j.*,
        COALESCE(json_agg(json_build_object('skillName', s.skill_name, 'isRequired', s.is_required))
          FILTER (WHERE s.id IS NOT NULL), '[]') AS skills,
        COALESCE(rc.report_count, 0) AS report_count,
        COALESCE(u.verified_recruiter, false) AS recruiter_verified
       FROM job_service.jobs j
       LEFT JOIN job_service.job_skills s ON j.id = s.job_id
       LEFT JOIN (
         SELECT job_id, COUNT(*)::int AS report_count
         FROM job_service.job_reports
         GROUP BY job_id
       ) rc ON rc.job_id = j.id
       LEFT JOIN user_service.users u ON u.id = j.recruiter_id
       WHERE j.recruiter_id = $1
       GROUP BY j.id, rc.report_count, u.verified_recruiter
       ORDER BY j.created_at DESC`,
      [req.user.id]
    );
    res.json({ jobs: result.rows.map(formatJob) });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/jobs/:id ─────────────────────────────────
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT j.*, 
        COALESCE(json_agg(json_build_object('skillName', s.skill_name, 'isRequired', s.is_required))
          FILTER (WHERE s.id IS NOT NULL), '[]') AS skills,
        COALESCE(rc.report_count, 0) AS report_count,
        COALESCE(u.verified_recruiter, false) AS recruiter_verified
       FROM job_service.jobs j
       LEFT JOIN job_service.job_skills s ON j.id = s.job_id
       LEFT JOIN (
         SELECT job_id, COUNT(*)::int AS report_count
         FROM job_service.job_reports
         GROUP BY job_id
       ) rc ON rc.job_id = j.id
       LEFT JOIN user_service.users u ON u.id = j.recruiter_id
       WHERE j.id = $1
       GROUP BY j.id, rc.report_count, u.verified_recruiter`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Increment views
    await query('UPDATE job_service.jobs SET views_count = views_count + 1 WHERE id = $1', [req.params.id]);

    // Publish view event
    const event = createEvent(EventTypes.JOB_VIEWED, {
      jobId: req.params.id,
      userId: req.user?.id || null,
    }, { source: 'job-service' });
    await publishEvent(KafkaTopics.JOB_EVENTS, event);

    res.json(formatJob(result.rows[0]));
  } catch (err) {
    next(err);
  }
});

// ── POST /api/jobs — Create Job (Recruiter) ───────────
router.post('/', authMiddleware, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const data = createJobSchema.parse(req.body);

    const result = await query(
      `INSERT INTO job_service.jobs (recruiter_id, title, company, description, location, work_type, salary_min, salary_max, currency, experience_min, experience_max, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [req.user.id, data.title, data.company, data.description, data.location, data.workType, data.salaryMin, data.salaryMax, data.currency, data.experienceMin, data.experienceMax, data.status]
    );

    const job = result.rows[0];
    job.priority_score = computeJobPriorityScore(job, normalizeSkillEntries(data.skills || []));

    // Insert skills
    if (data.skills && data.skills.length > 0) {
      const skillValues = data.skills.map((s, i) =>
        `($1, $${i * 2 + 2}, $${i * 2 + 3})`
      ).join(', ');
      const skillParams = [job.id, ...data.skills.flatMap(s => [s.skillName, s.isRequired])];
      await query(
        `INSERT INTO job_service.job_skills (job_id, skill_name, is_required) VALUES ${skillValues}`,
        skillParams
      );
    }

    // Index in Elasticsearch
    await indexJob({
      ...job,
      skills: (data.skills || []).map(s => s.skillName),
    });

    await distributePriorityAlerts(job, data.skills || []);

    // Publish event
    const event = createEvent(EventTypes.JOB_CREATED, {
      jobId: job.id,
      recruiterId: req.user.id,
      title: job.title,
      company: job.company,
      skills: (data.skills || []).map(s => s.skillName),
      workType: job.work_type,
      location: job.location,
    }, { source: 'job-service' });
    await publishEvent(KafkaTopics.JOB_EVENTS, event);

    res.status(201).json(formatJob({ ...job, skills: data.skills || [] }));
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    next(err);
  }
});

// ── PUT /api/jobs/:id — Update Job ────────────────────
router.put('/:id', authMiddleware, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const data = updateJobSchema.parse(req.body);

    // Check ownership
    const existing = await query('SELECT recruiter_id FROM job_service.jobs WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    if (existing.rows[0].recruiter_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your job listing' });
    }

    const setClauses = [];
    const params = [];
    let idx = 1;

    const fieldMap = {
      title: 'title', company: 'company', description: 'description',
      location: 'location', workType: 'work_type', salaryMin: 'salary_min',
      salaryMax: 'salary_max', currency: 'currency', experienceMin: 'experience_min',
      experienceMax: 'experience_max', status: 'status',
    };

    for (const [jsKey, dbKey] of Object.entries(fieldMap)) {
      if (data[jsKey] !== undefined) {
        setClauses.push(`${dbKey} = $${idx}`);
        params.push(data[jsKey]);
        idx++;
      }
    }

    if (setClauses.length === 0 && !data.skills) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const result = await query(
      `UPDATE job_service.jobs SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    // Update skills if provided
    if (data.skills) {
      await query('DELETE FROM job_service.job_skills WHERE job_id = $1', [req.params.id]);
      if (data.skills.length > 0) {
        const sv = data.skills.map((s, i) => `($1, $${i*2+2}, $${i*2+3})`).join(', ');
        const sp = [req.params.id, ...data.skills.flatMap(s => [s.skillName, s.isRequired])];
        await query(`INSERT INTO job_service.job_skills (job_id, skill_name, is_required) VALUES ${sv}`, sp);
      }
    }

    const job = result.rows[0];
    const currentSkills = data.skills || (await query(
      'SELECT skill_name AS "skillName", is_required AS "isRequired" FROM job_service.job_skills WHERE job_id = $1',
      [req.params.id]
    )).rows;
    job.priority_score = computeJobPriorityScore(job, normalizeSkillEntries(currentSkills));
    await indexJob({ ...job, skills: currentSkills.map(s => s.skillName) });
    await distributePriorityAlerts(job, currentSkills);

    const event = createEvent(EventTypes.JOB_UPDATED, { jobId: job.id, changes: data }, { source: 'job-service' });
    await publishEvent(KafkaTopics.JOB_EVENTS, event);

    res.json(formatJob(job));
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    next(err);
  }
});

router.post('/:id/report', authMiddleware, async (req, res, next) => {
  try {
    const data = reportJobSchema.parse(req.body);

    const jobResult = await query(
      `SELECT j.*,
              COALESCE(rc.report_count, 0) AS report_count,
              COALESCE(u.verified_recruiter, false) AS recruiter_verified,
              COALESCE(
                json_agg(json_build_object('skillName', s.skill_name, 'isRequired', s.is_required))
                FILTER (WHERE s.id IS NOT NULL),
                '[]'
              ) AS skills
       FROM job_service.jobs j
       LEFT JOIN (
         SELECT job_id, COUNT(*)::int AS report_count
         FROM job_service.job_reports
         GROUP BY job_id
       ) rc ON rc.job_id = j.id
       LEFT JOIN user_service.users u ON u.id = j.recruiter_id
       LEFT JOIN job_service.job_skills s ON s.job_id = j.id
       WHERE j.id = $1
       GROUP BY j.id, rc.report_count, u.verified_recruiter`,
      [req.params.id]
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    await query(
      `INSERT INTO job_service.job_reports (job_id, reporter_id, reason, details)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (job_id, reporter_id) DO UPDATE SET
         reason = EXCLUDED.reason,
         details = EXCLUDED.details`,
      [req.params.id, req.user.id, data.reason, data.details || null]
    );

    const reportCountResult = await query(
      'SELECT COUNT(*)::int AS total FROM job_service.job_reports WHERE job_id = $1',
      [req.params.id]
    );

    const credibility = buildCredibility({
      ...jobResult.rows[0],
      report_count: reportCountResult.rows[0]?.total || 0,
    });

    res.status(201).json({
      message: 'Thanks for reporting this job. Our trust layer has been updated.',
      credibility,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    next(err);
  }
});

// ── DELETE /api/jobs/:id ──────────────────────────────
router.delete('/:id', authMiddleware, requireRole('recruiter', 'admin'), async (req, res, next) => {
  try {
    const existing = await query('SELECT recruiter_id FROM job_service.jobs WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    if (existing.rows[0].recruiter_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your job listing' });
    }

    await query('DELETE FROM job_service.jobs WHERE id = $1', [req.params.id]);
    await removeJob(req.params.id);

    const event = createEvent(EventTypes.JOB_DELETED, { jobId: req.params.id }, { source: 'job-service' });
    await publishEvent(KafkaTopics.JOB_EVENTS, event);

    res.json({ message: 'Job deleted' });
  } catch (err) {
    next(err);
  }
});

function formatJob(row) {
  const normalizedSkills = row.skills || [];
  const jobInsights = analyzeJobContent({
    title: row.title,
    description: row.description,
    skills: normalizedSkills,
    experienceMin: row.experience_min,
    experienceMax: row.experience_max,
  });

  return {
    id: row.id,
    recruiterId: row.recruiter_id,
    title: row.title,
    company: row.company,
    description: row.description,
    location: row.location,
    workType: row.work_type,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    currency: row.currency,
    experienceMin: row.experience_min,
    experienceMax: row.experience_max,
    status: row.status,
    viewsCount: row.views_count,
    applicationsCount: row.applications_count,
    skills: normalizedSkills,
    jobInsights,
    priorityScore: row.priority_score || 0,
    credibility: buildCredibility({
      ...row,
      skills: normalizedSkills,
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.score !== undefined && { score: row.score }),
    ...(row.highlight && { highlight: row.highlight }),
  };
}

module.exports = router;
