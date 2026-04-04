const express = require('express');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { getRecruiterTrustScore } = require('../trust-score');

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

// ── GET /api/analytics/platform-overview ──────────────
router.get('/platform-overview', async (req, res, next) => {
  try {
    const [jobsResult, candidatesResult, metricsResult] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS total
         FROM job_service.jobs
         WHERE status = 'active'`
      ),
      query(
        `SELECT COUNT(*)::int AS total
         FROM user_service.users
         WHERE role = 'candidate' AND is_active = true`
      ),
      query(
        `SELECT
           COUNT(*)::int AS tracked_jobs,
           COALESCE(AVG(click_through_rate), 0) AS avg_ctr
         FROM analytics_service.job_metrics`
      ),
    ]);

    const activeJobs = jobsResult.rows[0]?.total || 0;
    const candidates = candidatesResult.rows[0]?.total || 0;
    const trackedJobs = metricsResult.rows[0]?.tracked_jobs || 0;
    const averageCtr = parseFloat(metricsResult.rows[0]?.avg_ctr || 0);

    res.json({
      activeJobs,
      candidates,
      matchAccuracy: trackedJobs > 0 ? Math.round(averageCtr * 100) : 0,
      searchSpeedMs: 0,
      trackedJobs,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/analytics/recruiters/:id/trust-score ─────
router.get('/recruiters/:id/trust-score', async (req, res, next) => {
  try {
    const trustScore = await getRecruiterTrustScore(req.params.id);
    res.json(trustScore);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/analytics/jobs/:id ───────────────────────
router.get('/jobs/:id', authMiddleware, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM analytics_service.job_metrics WHERE job_id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.json({
        jobId: req.params.id,
        viewsCount: 0,
        uniqueViewsCount: 0,
        applicationsCount: 0,
        clickThroughRate: 0,
      });
    }

    const m = result.rows[0];
    res.json({
      jobId: m.job_id,
      viewsCount: m.views_count,
      uniqueViewsCount: m.unique_views_count,
      applicationsCount: m.applications_count,
      clickThroughRate: parseFloat(m.click_through_rate),
      avgTimeToApplyHours: m.avg_time_to_apply_hours ? parseFloat(m.avg_time_to_apply_hours) : null,
      updatedAt: m.updated_at,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/analytics/recruiter/dashboard ────────────
router.get('/recruiter/dashboard', authMiddleware, async (req, res, next) => {
  try {
    if (req.user.role !== 'recruiter' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Recruiters only' });
    }

    const trustScore = await getRecruiterTrustScore(req.user.id);

    // Get recruiter's job IDs
    const jobsResult = await query(
      'SELECT id, title FROM job_service.jobs WHERE recruiter_id = $1',
      [req.user.id]
    );

    const jobIds = jobsResult.rows.map(j => j.id);

    if (jobIds.length === 0) {
      return res.json({
        totalJobs: 0,
        totalViews: 0,
        totalApplications: 0,
        avgCTR: 0,
        trustScore,
        jobMetrics: [],
      });
    }

    // Aggregate metrics
    const metricsResult = await query(
      `SELECT jm.*, j.title 
       FROM analytics_service.job_metrics jm
       JOIN job_service.jobs j ON jm.job_id = j.id
       WHERE jm.job_id = ANY($1)
       ORDER BY jm.views_count DESC`,
      [jobIds]
    );

    const totalViews = metricsResult.rows.reduce((s, m) => s + m.views_count, 0);
    const totalApps = metricsResult.rows.reduce((s, m) => s + m.applications_count, 0);
    const avgCTR = totalViews > 0 ? totalApps / totalViews : 0;
    res.json({
      totalJobs: jobIds.length,
      totalViews,
      totalApplications: totalApps,
      avgCTR: Math.round(avgCTR * 10000) / 100,
      trustScore,
      jobMetrics: metricsResult.rows.map(m => ({
        jobId: m.job_id,
        title: m.title,
        viewsCount: m.views_count,
        uniqueViewsCount: m.unique_views_count,
        applicationsCount: m.applications_count,
        clickThroughRate: parseFloat(m.click_through_rate),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/analytics/trends ─────────────────────────
router.get('/trends', authMiddleware, async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const result = await query(
      `SELECT * FROM analytics_service.daily_stats
       WHERE stat_date >= CURRENT_DATE - $1::integer
       ORDER BY stat_date ASC`,
      [parseInt(days)]
    );

    res.json({
      trends: result.rows.map(r => ({
        date: r.stat_date,
        jobsPosted: r.total_jobs_posted,
        applications: r.total_applications,
        newUsers: r.total_users_registered,
        activeUsers: r.active_users,
        avgCTR: parseFloat(r.avg_ctr),
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
