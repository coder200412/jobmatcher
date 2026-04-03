const { query } = require('./db');

function round(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }

  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor) / factor;
}

function getTrustLevel(score) {
  if (score === null) return 'New';
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Strong';
  if (score >= 55) return 'Fair';
  return 'Improving';
}

function getSpeedScore(avgFirstResponseHours) {
  if (avgFirstResponseHours === null || avgFirstResponseHours === undefined) return 0;
  if (avgFirstResponseHours <= 12) return 100;
  if (avgFirstResponseHours <= 24) return 92;
  if (avgFirstResponseHours <= 48) return 80;
  if (avgFirstResponseHours <= 72) return 68;
  if (avgFirstResponseHours <= 168) return 50;
  if (avgFirstResponseHours <= 336) return 30;
  return 15;
}

async function getRecruiterTrustScore(recruiterId) {
  const jobSummaryResult = await query(
    `SELECT
       COUNT(*)::int AS total_jobs,
       COUNT(*) FILTER (WHERE status = 'active')::int AS active_jobs
     FROM job_service.jobs
     WHERE recruiter_id = $1`,
    [recruiterId]
  );

  const summary = jobSummaryResult.rows[0];
  const totalJobs = Number(summary?.total_jobs || 0);
  const activeJobs = Number(summary?.active_jobs || 0);

  const metricsResult = await query(
    `WITH recruiter_jobs AS (
       SELECT id
       FROM job_service.jobs
       WHERE recruiter_id = $1
     ),
     application_metrics AS (
       SELECT
         a.id,
         a.status,
         a.created_at,
         EXISTS (
           SELECT 1
           FROM job_service.application_timeline_events t
           WHERE t.application_id = a.id
             AND t.actor_role IN ('recruiter', 'admin')
         ) AS has_recruiter_response,
         (
           SELECT MIN(t.created_at)
           FROM job_service.application_timeline_events t
           WHERE t.application_id = a.id
             AND t.actor_role IN ('recruiter', 'admin')
         ) AS first_recruiter_response_at,
         (
           SELECT MIN(t.created_at)
           FROM job_service.application_timeline_events t
           WHERE t.application_id = a.id
             AND t.actor_role IN ('recruiter', 'admin')
             AND t.event_type IN ('rejected', 'hired')
         ) AS final_decision_at,
         EXISTS (
           SELECT 1
           FROM job_service.application_timeline_events t
           WHERE t.application_id = a.id
             AND t.actor_role IN ('recruiter', 'admin')
             AND COALESCE(NULLIF(BTRIM(t.description), ''), NULL) IS NOT NULL
             AND t.description <> 'Your profile is now under recruiter review.'
             AND t.description <> 'You moved forward in the hiring process.'
             AND t.description <> 'This application is no longer moving forward.'
             AND t.description <> 'This role has been marked as hired.'
         ) AS has_feedback
       FROM job_service.applications a
       JOIN recruiter_jobs j ON j.id = a.job_id
     )
     SELECT
       COUNT(*)::int AS total_applications,
       COUNT(*) FILTER (WHERE has_recruiter_response)::int AS responded_applications,
       COUNT(*) FILTER (WHERE status IN ('shortlisted', 'hired'))::int AS shortlisted_applications,
       COUNT(*) FILTER (WHERE status = 'hired')::int AS hired_applications,
       COUNT(*) FILTER (WHERE status IN ('rejected', 'hired'))::int AS decided_applications,
       COUNT(*) FILTER (
         WHERE created_at <= NOW() - INTERVAL '7 days'
           AND NOT has_recruiter_response
       )::int AS ghosted_applications,
       COUNT(*) FILTER (WHERE has_feedback)::int AS feedback_applications,
       AVG(EXTRACT(EPOCH FROM (first_recruiter_response_at - created_at)) / 3600)
         FILTER (WHERE first_recruiter_response_at IS NOT NULL) AS avg_first_response_hours,
       AVG(EXTRACT(EPOCH FROM (final_decision_at - created_at)) / 3600)
         FILTER (WHERE final_decision_at IS NOT NULL) AS avg_decision_hours
     FROM application_metrics`,
    [recruiterId]
  );

  const metrics = metricsResult.rows[0] || {};
  const totalApplications = Number(metrics.total_applications || 0);
  const respondedApplications = Number(metrics.responded_applications || 0);
  const shortlistedApplications = Number(metrics.shortlisted_applications || 0);
  const hiredApplications = Number(metrics.hired_applications || 0);
  const decidedApplications = Number(metrics.decided_applications || 0);
  const ghostedApplications = Number(metrics.ghosted_applications || 0);
  const feedbackApplications = Number(metrics.feedback_applications || 0);

  const responseRate = totalApplications > 0 ? respondedApplications / totalApplications : 0;
  const shortlistRate = totalApplications > 0 ? shortlistedApplications / totalApplications : 0;
  const hireRate = totalApplications > 0 ? hiredApplications / totalApplications : 0;
  const decisionRate = totalApplications > 0 ? decidedApplications / totalApplications : 0;
  const ghostRate = totalApplications > 0 ? ghostedApplications / totalApplications : 0;
  const feedbackRate = respondedApplications > 0 ? feedbackApplications / respondedApplications : 0;
  const avgFirstResponseHours = round(metrics.avg_first_response_hours, 1);
  const avgDecisionHours = round(metrics.avg_decision_hours, 1);

  let trustScore = null;
  if (totalApplications > 0) {
    const speedScore = getSpeedScore(avgFirstResponseHours);
    const responseScore = responseRate * 100;
    const feedbackScore = feedbackRate * 100;
    const decisionScore = decisionRate * 100;
    const ghostScore = (1 - ghostRate) * 100;

    trustScore = round(
      responseScore * 0.35 +
      speedScore * 0.25 +
      feedbackScore * 0.15 +
      decisionScore * 0.15 +
      ghostScore * 0.10,
      1
    );
  }

  return {
    recruiterId,
    trustScore,
    trustLevel: getTrustLevel(trustScore),
    totalJobs,
    activeJobs,
    totalApplications,
    respondedApplications,
    shortlistedApplications,
    hiredApplications,
    ghostedApplications,
    feedbackApplications,
    responseRate: round(responseRate * 100, 1),
    shortlistRate: round(shortlistRate * 100, 1),
    hireRate: round(hireRate * 100, 1),
    decisionRate: round(decisionRate * 100, 1),
    feedbackRate: round(feedbackRate * 100, 1),
    ghostRate: round(ghostRate * 100, 1),
    avgFirstResponseHours,
    avgDecisionHours,
    summary: trustScore === null
      ? 'Not enough application history yet.'
      : `Responds to ${round(responseRate * 100, 0)}% of applicants with an average first reply in ${avgFirstResponseHours ?? 'n/a'} hours.`,
  };
}

module.exports = { getRecruiterTrustScore };
