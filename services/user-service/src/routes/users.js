const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { authMiddleware } = require('../auth');
const { publishEvent } = require('../kafka');
const { EventTypes, KafkaTopics, createEvent } = require('@jobmatch/shared');

const router = express.Router();

// ── GET /api/users/me ─────────────────────────────────
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.role, u.first_name, u.last_name, u.headline, u.bio,
              u.location, u.experience_years, u.avatar_url, u.resume_url, u.created_at,
              COALESCE(json_agg(json_build_object('skillName', s.skill_name, 'proficiency', s.proficiency))
                FILTER (WHERE s.id IS NOT NULL), '[]') AS skills
       FROM user_service.users u
       LEFT JOIN user_service.user_skills s ON u.id = s.user_id
       WHERE u.id = $1
       GROUP BY u.id`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
      headline: user.headline,
      bio: user.bio,
      location: user.location,
      experienceYears: user.experience_years,
      avatarUrl: user.avatar_url,
      resumeUrl: user.resume_url,
      skills: user.skills,
      createdAt: user.created_at,
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/users/me ─────────────────────────────────
const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  headline: z.string().max(255).optional(),
  bio: z.string().max(5000).optional(),
  location: z.string().max(255).optional(),
  experienceYears: z.number().int().min(0).max(50).optional(),
});

router.put('/me', authMiddleware, async (req, res, next) => {
  try {
    const data = updateProfileSchema.parse(req.body);

    const result = await query(
      `UPDATE user_service.users SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        headline = COALESCE($3, headline),
        bio = COALESCE($4, bio),
        location = COALESCE($5, location),
        experience_years = COALESCE($6, experience_years),
        updated_at = NOW()
       WHERE id = $7
       RETURNING id, email, role, first_name, last_name, headline, bio, location, experience_years`,
      [data.firstName, data.lastName, data.headline, data.bio, data.location, data.experienceYears, req.user.id]
    );

    const user = result.rows[0];

    // Publish event
    const event = createEvent(EventTypes.USER_PROFILE_UPDATED, {
      userId: user.id,
      changes: data,
    }, { source: 'user-service' });
    await publishEvent(KafkaTopics.USER_EVENTS, event);

    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
      headline: user.headline,
      bio: user.bio,
      location: user.location,
      experienceYears: user.experience_years,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    next(err);
  }
});

// ── PUT /api/users/me/skills ──────────────────────────
const updateSkillsSchema = z.object({
  skills: z.array(z.object({
    skillName: z.string().min(1).max(100),
    proficiency: z.enum(['beginner', 'intermediate', 'expert']).default('intermediate'),
  })).max(50),
});

router.put('/me/skills', authMiddleware, async (req, res, next) => {
  try {
    const data = updateSkillsSchema.parse(req.body);

    // Replace all skills atomically
    await query('DELETE FROM user_service.user_skills WHERE user_id = $1', [req.user.id]);

    if (data.skills.length > 0) {
      const values = data.skills.map((s, i) =>
        `($1, $${i * 2 + 2}, $${i * 2 + 3})`
      ).join(', ');
      const params = [req.user.id, ...data.skills.flatMap(s => [s.skillName, s.proficiency])];
      await query(
        `INSERT INTO user_service.user_skills (user_id, skill_name, proficiency) VALUES ${values}`,
        params
      );
    }

    // Publish event
    const event = createEvent(EventTypes.USER_SKILLS_UPDATED, {
      userId: req.user.id,
      skills: data.skills,
    }, { source: 'user-service' });
    await publishEvent(KafkaTopics.USER_EVENTS, event);

    res.json({ skills: data.skills });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    next(err);
  }
});

// ── GET /api/users/:id ────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.id, u.role, u.first_name, u.last_name, u.headline, u.bio,
              u.location, u.experience_years, u.avatar_url, u.created_at,
              COALESCE(json_agg(json_build_object('skillName', s.skill_name, 'proficiency', s.proficiency))
                FILTER (WHERE s.id IS NOT NULL), '[]') AS skills
       FROM user_service.users u
       LEFT JOIN user_service.user_skills s ON u.id = s.user_id
       WHERE u.id = $1 AND u.is_active = true
       GROUP BY u.id`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
      headline: user.headline,
      bio: user.bio,
      location: user.location,
      experienceYears: user.experience_years,
      avatarUrl: user.avatar_url,
      skills: user.skills,
      createdAt: user.created_at,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
