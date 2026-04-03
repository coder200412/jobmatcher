const express = require('express');
const jwt = require('jsonwebtoken');
const { getJobRecommendations, getCandidateRecommendations } = require('../matcher');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret';

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
    const recommendations = await getJobRecommendations(req.user.id, limit);
    res.json({ recommendations, total: recommendations.length });
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
