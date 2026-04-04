const express = require('express');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const {
  getJobRecommendations,
  getJobRecommendationAnalysis,
  getCandidateRecommendations,
  recordUserFeedback,
  getReferralMatches,
  getCareerInsights,
  getExperimentSummary,
} = require('../matcher');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret';
const feedbackSchema = z.object({
  jobId: z.string().uuid(),
  action: z.enum(['click', 'apply', 'skip', 'not_interested']),
});

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access token required' });
  }
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

// ── GET /api/recommendations/jobs ─────────────────────
router.get('/jobs', authMiddleware, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit || '20');
    const payload = await getJobRecommendations(req.user.id, limit);
    res.json({
      recommendations: payload.recommendations || [],
      total: payload.recommendations?.length || 0,
      experiment: payload.experiment || null,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/jobs/:jobId/analysis', authMiddleware, async (req, res, next) => {
  try {
    const analysis = await getJobRecommendationAnalysis(req.user.id, req.params.jobId);
    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not available for this job' });
    }
    res.json(analysis);
  } catch (err) {
    next(err);
  }
});

router.post('/feedback', authMiddleware, async (req, res, next) => {
  try {
    const { jobId, action } = feedbackSchema.parse(req.body);
    await recordUserFeedback(req.user.id, jobId, action);
    res.json({ ok: true, action });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    next(err);
  }
});

router.get('/referrals/:jobId', authMiddleware, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit || '5');
    const referrals = await getReferralMatches(req.user.id, req.params.jobId, limit);
    res.json({ referrals, total: referrals.length });
  } catch (err) {
    next(err);
  }
});

router.get('/career-path', authMiddleware, async (req, res, next) => {
  try {
    const career = await getCareerInsights(req.user.id);
    if (!career) {
      return res.status(404).json({ error: 'Career insights unavailable' });
    }
    res.json(career);
  } catch (err) {
    next(err);
  }
});

router.get('/experiments/summary', authMiddleware, async (req, res, next) => {
  try {
    if (req.user.role !== 'recruiter' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Recruiters only' });
    }
    const summary = await getExperimentSummary();
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/recommendations/candidates/:jobId ────────
router.get('/candidates/:jobId', authMiddleware, async (req, res, next) => {
  try {
    if (req.user.role !== 'recruiter' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Recruiters only' });
    }
    const limit = parseInt(req.query.limit || '20');
    const recommendations = await getCandidateRecommendations(req.params.jobId, limit);
    res.json({ recommendations, total: recommendations.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
