const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { authMiddleware, optionalAuth, requireRole } = require('../auth');
const { publishEvent } = require('../kafka');
const { indexJob, searchJobs, removeJob } = require('../elasticsearch');
const { EventTypes, KafkaTopics, createEvent } = require('@jobmatch/shared');

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
          FILTER (WHERE s.id IS NOT NULL), '[]') AS skills
      FROM job_service.jobs j
      LEFT JOIN job_service.job_skills s ON j.id = s.job_id
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

    sql += ` GROUP BY j.id ORDER BY j.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
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
          FILTER (WHERE s.id IS NOT NULL), '[]') AS skills
       FROM job_service.jobs j
       LEFT JOIN job_service.job_skills s ON j.id = s.job_id
       WHERE j.recruiter_id = $1
       GROUP BY j.id
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
          FILTER (WHERE s.id IS NOT NULL), '[]') AS skills
       FROM job_service.jobs j
       LEFT JOIN job_service.job_skills s ON j.id = s.job_id
       WHERE j.id = $1
       GROUP BY j.id`,
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
    await indexJob({ ...job, skills: (data.skills || []).map(s => s.skillName) });

    const event = createEvent(EventTypes.JOB_UPDATED, { jobId: job.id, changes: data }, { source: 'job-service' });
    await publishEvent(KafkaTopics.JOB_EVENTS, event);

    res.json(formatJob(job));
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
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
    skills: row.skills || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.score !== undefined && { score: row.score }),
    ...(row.highlight && { highlight: row.highlight }),
  };
}

module.exports = router;
