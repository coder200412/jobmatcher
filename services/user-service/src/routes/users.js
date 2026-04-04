const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { authMiddleware } = require('../auth');
const { publishEvent } = require('../kafka');
const {
  EventTypes,
  KafkaTopics,
  createEvent,
  analyzeResumeAgainstJob,
  predictCareerTrajectory,
} = require('@jobmatch/shared');

const router = express.Router();

// ── GET /api/users/me ─────────────────────────────────
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.role, u.first_name, u.last_name, u.headline, u.bio,
              u.location, u.experience_years, u.avatar_url, u.resume_url, u.created_at,
              u.education_school, u.current_company, u.company_history, u.career_goal,
              u.preferred_roles, u.interest_tags, u.resume_text, u.resume_keywords, u.last_resume_analysis_at,
              u.verified_recruiter,
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
      educationSchool: user.education_school,
      currentCompany: user.current_company,
      companyHistory: user.company_history || [],
      careerGoal: user.career_goal,
      preferredRoles: user.preferred_roles || [],
      interestTags: user.interest_tags || [],
      resumeText: user.resume_text || '',
      resumeKeywords: user.resume_keywords || [],
      lastResumeAnalysisAt: user.last_resume_analysis_at,
      verifiedRecruiter: user.verified_recruiter,
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
  educationSchool: z.string().max(255).optional(),
  currentCompany: z.string().max(255).optional(),
  companyHistory: z.array(z.string().min(1).max(255)).max(10).optional(),
  careerGoal: z.string().max(255).optional(),
  preferredRoles: z.array(z.string().min(1).max(255)).max(10).optional(),
  interestTags: z.array(z.string().min(1).max(100)).max(15).optional(),
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
        education_school = COALESCE($7, education_school),
        current_company = COALESCE($8, current_company),
        company_history = COALESCE($9::jsonb, company_history),
        career_goal = COALESCE($10, career_goal),
        preferred_roles = COALESCE($11::jsonb, preferred_roles),
        interest_tags = COALESCE($12::jsonb, interest_tags),
        updated_at = NOW()
       WHERE id = $13
       RETURNING id, email, role, first_name, last_name, headline, bio, location, experience_years,
                 education_school, current_company, company_history, career_goal, preferred_roles, interest_tags, verified_recruiter`,
      [
        data.firstName,
        data.lastName,
        data.headline,
        data.bio,
        data.location,
        data.experienceYears,
        data.educationSchool,
        data.currentCompany,
        data.companyHistory ? JSON.stringify(data.companyHistory) : null,
        data.careerGoal,
        data.preferredRoles ? JSON.stringify(data.preferredRoles) : null,
        data.interestTags ? JSON.stringify(data.interestTags) : null,
        req.user.id,
      ]
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
      educationSchool: user.education_school,
      currentCompany: user.current_company,
      companyHistory: user.company_history || [],
      careerGoal: user.career_goal,
      preferredRoles: user.preferred_roles || [],
      interestTags: user.interest_tags || [],
      verifiedRecruiter: user.verified_recruiter,
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

const resumeAnalysisSchema = z.object({
  resumeText: z.string().min(80).max(25000),
  targetJobId: z.string().uuid().optional(),
});

async function findTargetJob(userId, profile, targetJobId) {
  if (targetJobId) {
    const directJob = await query(
      `SELECT j.id, j.title, j.company, j.description, j.experience_min, j.experience_max,
              COALESCE(
                json_agg(json_build_object('skillName', s.skill_name, 'isRequired', s.is_required))
                FILTER (WHERE s.id IS NOT NULL),
                '[]'
              ) AS skills
       FROM job_service.jobs j
       LEFT JOIN job_service.job_skills s ON s.job_id = j.id
       WHERE j.id = $1
       GROUP BY j.id`,
      [targetJobId]
    );

    return directJob.rows[0] || null;
  }

  const targetHint = profile.career_goal || profile.headline || (profile.preferred_roles || [])[0] || '';
  const targetResult = await query(
    `SELECT j.id, j.title, j.company, j.description, j.experience_min, j.experience_max,
            COALESCE(
              json_agg(json_build_object('skillName', s.skill_name, 'isRequired', s.is_required))
              FILTER (WHERE s.id IS NOT NULL),
              '[]'
            ) AS skills
     FROM job_service.jobs j
     LEFT JOIN job_service.job_skills s ON s.job_id = j.id
     WHERE j.status = 'active'
     GROUP BY j.id
     ORDER BY
       CASE
         WHEN $1 <> '' AND (j.title ILIKE '%' || $1 || '%' OR j.description ILIKE '%' || $1 || '%') THEN 0
         ELSE 1
       END,
       j.priority_score DESC,
       j.created_at DESC
     LIMIT 1`,
    [targetHint]
  );

  return targetResult.rows[0] || null;
}

router.post('/me/resume-analysis', authMiddleware, async (req, res, next) => {
  try {
    const { resumeText, targetJobId } = resumeAnalysisSchema.parse(req.body);

    const profileResult = await query(
      `SELECT u.id, u.headline, u.experience_years, u.career_goal, u.preferred_roles,
              COALESCE(
                json_agg(json_build_object('skillName', s.skill_name, 'proficiency', s.proficiency))
                FILTER (WHERE s.id IS NOT NULL),
                '[]'
              ) AS skills
       FROM user_service.users u
       LEFT JOIN user_service.user_skills s ON s.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [req.user.id]
    );

    const profile = profileResult.rows[0];
    if (!profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetJob = await findTargetJob(req.user.id, profile, targetJobId);
    if (!targetJob) {
      return res.status(404).json({ error: 'No suitable target job found for resume analysis yet.' });
    }

    const analysis = analyzeResumeAgainstJob({
      resumeText,
      jobTitle: targetJob.title,
      userSkills: profile.skills,
      jobDescription: targetJob.description,
      jobSkills: targetJob.skills,
      experienceMin: targetJob.experience_min,
      experienceMax: targetJob.experience_max,
    });

    await query(
      `UPDATE user_service.users
       SET resume_text = $1,
           resume_keywords = $2::jsonb,
           last_resume_analysis_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [resumeText, JSON.stringify(analysis.extractedKeywords || []), req.user.id]
    );

    res.json({
      targetJob: {
        id: targetJob.id,
        title: targetJob.title,
        company: targetJob.company,
      },
      analysis,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    next(err);
  }
});

router.get('/me/career-trajectory', authMiddleware, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT headline, experience_years, career_goal, preferred_roles,
              COALESCE(
                json_agg(json_build_object('skillName', s.skill_name, 'proficiency', s.proficiency))
                FILTER (WHERE s.id IS NOT NULL),
                '[]'
              ) AS skills
       FROM user_service.users u
       LEFT JOIN user_service.user_skills s ON s.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = result.rows[0];
    const trajectory = predictCareerTrajectory({
      headline: profile.headline,
      currentSkills: profile.skills.map((skill) => skill.skillName || skill.skill_name),
      experienceYears: profile.experience_years,
      targetRoles: profile.preferred_roles || [],
      careerGoal: profile.career_goal,
    });

    res.json(trajectory);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/users/:id ────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.id, u.role, u.first_name, u.last_name, u.headline, u.bio,
              u.location, u.experience_years, u.avatar_url, u.created_at,
              u.education_school, u.current_company, u.career_goal, u.preferred_roles,
              u.interest_tags, u.verified_recruiter,
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
      educationSchool: user.education_school,
      currentCompany: user.current_company,
      careerGoal: user.career_goal,
      preferredRoles: user.preferred_roles || [],
      interestTags: user.interest_tags || [],
      verifiedRecruiter: user.verified_recruiter,
      skills: user.skills,
      createdAt: user.created_at,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
