const { query } = require('./db');
const { getCached, setCache, invalidateCache } = require('./cache');
const {
  analyzeJobContent,
  analyzeSkillGap,
  analyzeResumeAgainstJob,
  buildLearningPath,
  buildPrioritySignal,
  buildReferralReason,
  normalizeSkillEntries,
  predictCareerTrajectory,
} = require('@jobmatch/shared');

const WEIGHTS = {
  SKILLS: 0.4,
  EXPERIENCE: 0.2,
  LOCATION: 0.15,
  RECENCY: 0.15,
  POPULARITY: 0.1,
};

const EXPERIMENT_KEY = 'recommendation-ranking-v1';
const FEEDBACK_DELTAS = {
  click: 1.5,
  apply: 3,
  skip: -0.75,
  not_interested: -2.5,
};

function hashVariantSeed(value = '') {
  return Array.from(String(value)).reduce((total, char) => total + char.charCodeAt(0), 0);
}

function getVariantWeights(variant) {
  if (variant === 'skills_first') {
    return {
      SKILLS: 0.5,
      EXPERIENCE: 0.18,
      LOCATION: 0.12,
      RECENCY: 0.1,
      POPULARITY: 0.1,
    };
  }

  return WEIGHTS;
}

function skillNames(skills = []) {
  return normalizeSkillEntries(skills).map((skill) => skill.displayName);
}

function computeSkillSimilarity(userSkills, jobSkills) {
  const userNormalized = normalizeSkillEntries(userSkills);
  const jobNormalized = normalizeSkillEntries(jobSkills);

  if (!userNormalized.length || !jobNormalized.length) return 0;

  const userSet = new Set(userNormalized.map((skill) => skill.key));
  const jobSet = new Set(jobNormalized.map((skill) => skill.key));

  let matches = 0;
  for (const skill of jobSet) {
    if (userSet.has(skill)) matches++;
  }

  const union = new Set([...userSet, ...jobSet]);
  const jaccard = matches / union.size;
  const recall = matches / jobSet.size;

  return (jaccard * 0.3 + recall * 0.7);
}

function computeExperienceScore(userYears, jobMinYears, jobMaxYears) {
  if (jobMinYears === null && jobMaxYears === null) return 0.5;
  const min = jobMinYears || 0;
  const max = jobMaxYears || 30;

  if (userYears >= min && userYears <= max) return 1;
  if (userYears < min) {
    return Math.max(0, 1 - (min - userYears) * 0.2);
  }
  return Math.max(0, 1 - (userYears - max) * 0.1);
}

function computeLocationScore(userLocation, jobLocation, jobWorkType) {
  if (jobWorkType === 'remote') return 1;
  if (!userLocation || !jobLocation) return 0.5;

  const userLoc = userLocation.toLowerCase().trim();
  const jobLoc = jobLocation.toLowerCase().trim();

  if (userLoc === jobLoc) return 1;
  if (userLoc.includes(jobLoc) || jobLoc.includes(userLoc)) return 0.8;
  return 0.2;
}

function computeRecencyScore(createdAt) {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays <= 1) return 1;
  if (ageDays <= 7) return 0.9;
  if (ageDays <= 14) return 0.7;
  if (ageDays <= 30) return 0.5;
  return Math.max(0.1, 1 - ageDays / 180);
}

function computePopularityScore(viewsCount, applicationsCount, allJobs) {
  if (!allJobs.length) return 0.5;

  const maxViews = Math.max(...allJobs.map((job) => job.views_count || 0), 1);
  const maxApplications = Math.max(...allJobs.map((job) => job.applications_count || 0), 1);
  const viewScore = (viewsCount || 0) / maxViews;
  const applicationScore = (applicationsCount || 0) / maxApplications;

  return viewScore * 0.4 + applicationScore * 0.6;
}

function buildColdStartInsight(user, gapAnalysis, scoreBreakdown) {
  const userSkillCount = normalizeSkillEntries(user.skills).length;
  const profileSignals = [
    Boolean(user.location),
    Number(user.experience_years || 0) > 0,
    userSkillCount >= 3,
    Boolean(user.career_goal),
    (user.preferred_roles || []).length > 0,
    (user.interest_tags || []).length > 0,
  ].filter(Boolean).length;

  const isColdStart = profileSignals <= 2;
  if (!isColdStart) return null;

  return {
    isColdStart: true,
    summary: 'These recommendations lean on trending roles, location fit, and demand signals until your profile becomes richer.',
    nextBestActions: [
      'Add 3 to 5 core skills to unlock stronger matching.',
      'Write a headline that clearly states your target role.',
      'Set your preferred location or remote preference for better ranking.',
    ],
    profileSignals,
    gapPressure: gapAnalysis.missingRequiredSkills.length,
    currentBreakdown: scoreBreakdown,
  };
}

function normalizePreferenceRows(rows = []) {
  return rows.reduce((acc, row) => {
    if (!acc[row.signal_type]) {
      acc[row.signal_type] = new Map();
    }
    acc[row.signal_type].set(String(row.signal_value).toLowerCase(), Number(row.score || 0));
    return acc;
  }, {});
}

function computePreferenceBoost(job, preferenceSignals) {
  if (!preferenceSignals) return 0;

  let total = 0;

  for (const skill of normalizeSkillEntries(job.skills)) {
    total += preferenceSignals.skill?.get(skill.key.toLowerCase()) || 0;
  }

  total += preferenceSignals.company?.get(String(job.company || '').toLowerCase()) || 0;
  total += preferenceSignals.location?.get(String(job.location || '').toLowerCase()) || 0;
  total += preferenceSignals.work_type?.get(String(job.work_type || '').toLowerCase()) || 0;

  for (const word of String(job.title || '').toLowerCase().split(/\s+/).filter(Boolean)) {
    total += preferenceSignals.title_keyword?.get(word) || 0;
  }

  return Math.max(-12, Math.min(12, total));
}

async function getExperimentAssignment(userId) {
  const existing = await query(
    `SELECT variant
     FROM analytics_service.experiment_assignments
     WHERE user_id = $1 AND experiment_key = $2`,
    [userId, EXPERIMENT_KEY]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].variant;
  }

  const variant = hashVariantSeed(userId) % 2 === 0 ? 'balanced' : 'skills_first';
  await query(
    `INSERT INTO analytics_service.experiment_assignments (user_id, experiment_key, variant)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, experiment_key) DO NOTHING`,
    [userId, EXPERIMENT_KEY, variant]
  );

  return variant;
}

async function getPreferenceSignals(userId) {
  const result = await query(
    `SELECT signal_type, signal_value, score
     FROM analytics_service.user_preference_signals
     WHERE user_id = $1`,
    [userId]
  );

  return normalizePreferenceRows(result.rows);
}

async function recordExperimentMetric({ userId, entityId = null, metricKey, metricValue = 1 }) {
  const variant = await getExperimentAssignment(userId);
  await query(
    `INSERT INTO analytics_service.experiment_events
      (experiment_key, variant, metric_key, metric_value, user_id, entity_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [EXPERIMENT_KEY, variant, metricKey, metricValue, userId, entityId]
  );
  return variant;
}

function buildFeedReasons({ gapAnalysis, scoreBreakdown, coldStartInsight, jobInsights }) {
  if (coldStartInsight) {
    return [
      'This role is being boosted while the system learns your preferences.',
      `Top demand keywords here: ${jobInsights.keywords.slice(0, 3).join(', ') || 'generalist fit'}.`,
    ];
  }

  const reasons = [];
  if (gapAnalysis.matchedSkills.length > 0) {
    reasons.push(`Matched skills: ${gapAnalysis.matchedSkills.slice(0, 3).join(', ')}.`);
  }
  if (scoreBreakdown.experience >= 70) {
    reasons.push('Your experience level is aligned with the role expectation.');
  }
  if (scoreBreakdown.location >= 80) {
    reasons.push('Location or work-style preference is a strong fit.');
  }
  if (gapAnalysis.missingRequiredSkills.length > 0) {
    reasons.push(`Main gap: ${gapAnalysis.missingRequiredSkills.slice(0, 2).join(', ')}.`);
  }

  return reasons.slice(0, 3);
}

function buildJobRecommendation(user, job, allJobs, context = {}) {
  const weights = getVariantWeights(context.variant);
  const skillScore = computeSkillSimilarity(user.skills, job.skills);
  const normalizedUserSkills = normalizeSkillEntries(user.skills);
  const coldStartSkillScore = normalizedUserSkills.length === 0 ? 0.55 : skillScore;
  const experienceScore = computeExperienceScore(user.experience_years, job.experience_min, job.experience_max);
  const locationScore = computeLocationScore(user.location, job.location, job.work_type);
  const recencyScore = computeRecencyScore(job.created_at);
  const popularityScore = computePopularityScore(job.views_count, job.applications_count, allJobs);
  const preferenceBoost = computePreferenceBoost(job, context.preferenceSignals);
  const totalScore =
    coldStartSkillScore * weights.SKILLS +
    experienceScore * weights.EXPERIENCE +
    locationScore * weights.LOCATION +
    recencyScore * weights.RECENCY +
    popularityScore * weights.POPULARITY +
    (preferenceBoost / 100);

  const matchPercent = Math.round(totalScore * 100);
  const scoreBreakdown = {
    skills: Math.round(coldStartSkillScore * 100),
    experience: Math.round(experienceScore * 100),
    location: Math.round(locationScore * 100),
    recency: Math.round(recencyScore * 100),
    popularity: Math.round(popularityScore * 100),
  };
  const gapAnalysis = analyzeSkillGap(user.skills, job.skills);
  const jobInsights = analyzeJobContent({
    title: job.title,
    description: job.description,
    skills: job.skills,
    experienceMin: job.experience_min,
    experienceMax: job.experience_max,
  });
  const prioritySignal = buildPrioritySignal({
    matchPercent,
    recencyScore,
    missingRequiredCount: gapAnalysis.missingRequiredSkills.length,
  });
  const coldStartInsight = buildColdStartInsight(user, gapAnalysis, scoreBreakdown);

  return {
    id: job.id,
    title: job.title,
    company: job.company,
    description: job.description,
    location: job.location,
    workType: job.work_type,
    salaryMin: job.salary_min,
    salaryMax: job.salary_max,
    currency: job.currency,
    experienceMin: job.experience_min,
    experienceMax: job.experience_max,
    skills: job.skills,
    viewsCount: job.views_count,
    applicationsCount: job.applications_count,
    createdAt: job.created_at,
    matchScore: Math.round(totalScore * 100) / 100,
    matchPercent,
    scoreBreakdown,
    experimentVariant: context.variant || 'balanced',
    preferenceBoost: Math.round(preferenceBoost),
    matchedSkills: gapAnalysis.matchedSkills,
    missingSkills: [...gapAnalysis.missingRequiredSkills, ...gapAnalysis.missingOptionalSkills],
    missingRequiredSkills: gapAnalysis.missingRequiredSkills,
    skillCoverage: {
      totalPercent: gapAnalysis.totalCoveragePercent,
      requiredPercent: gapAnalysis.requiredCoveragePercent,
    },
    learningPath: buildLearningPath(gapAnalysis.missingRequiredSkills.length > 0
      ? gapAnalysis.missingRequiredSkills
      : gapAnalysis.missingOptionalSkills),
    prioritySignal,
    feedReasons: buildFeedReasons({ gapAnalysis, scoreBreakdown, coldStartInsight, jobInsights }),
    coldStartInsight,
    jobInsights,
  };
}

async function getUserProfile(userId) {
  const result = await query(
    `SELECT u.id, u.location, u.experience_years, u.headline, u.career_goal,
            u.preferred_roles, u.interest_tags, u.current_company, u.education_school,
            COALESCE(
              json_agg(
                json_build_object('skillName', s.skill_name, 'proficiency', s.proficiency)
              ) FILTER (WHERE s.id IS NOT NULL),
              '[]'
            ) AS skills
     FROM user_service.users u
     LEFT JOIN user_service.user_skills s ON u.id = s.user_id
     WHERE u.id = $1
     GROUP BY u.id`,
    [userId]
  );

  return result.rows[0] || null;
}

async function getJobRecord(jobId) {
  const result = await query(
    `SELECT j.*,
            COALESCE(
              json_agg(
                json_build_object('skillName', s.skill_name, 'isRequired', s.is_required)
              ) FILTER (WHERE s.id IS NOT NULL),
              '[]'
            ) AS skills
     FROM job_service.jobs j
     LEFT JOIN job_service.job_skills s ON j.id = s.job_id
     WHERE j.id = $1
     GROUP BY j.id`,
    [jobId]
  );

  return result.rows[0] || null;
}

async function getJobRecommendations(userId, limit = 20) {
  const cacheKey = `recommendations:jobs:${userId}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const user = await getUserProfile(userId);
  if (!user) return { recommendations: [], experiment: null };
  const [variant, preferenceSignals] = await Promise.all([
    getExperimentAssignment(userId),
    getPreferenceSignals(userId),
  ]);

  const jobsResult = await query(
    `SELECT j.*,
            COALESCE(
              json_agg(
                json_build_object('skillName', s.skill_name, 'isRequired', s.is_required)
              ) FILTER (WHERE s.id IS NOT NULL),
              '[]'
            ) AS skills
     FROM job_service.jobs j
     LEFT JOIN job_service.job_skills s ON j.id = s.job_id
     WHERE j.status = 'active'
       AND j.id NOT IN (SELECT job_id FROM job_service.applications WHERE user_id = $1)
     GROUP BY j.id
     ORDER BY j.created_at DESC
     LIMIT 200`,
    [userId]
  );

  const allJobs = jobsResult.rows;
  const recommendations = allJobs
    .map((job) => buildJobRecommendation(user, job, allJobs, { variant, preferenceSignals }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);

  const payload = { recommendations, experiment: { key: EXPERIMENT_KEY, variant } };
  await setCache(cacheKey, payload, 1800);
  return payload;
}

async function getJobRecommendationAnalysis(userId, jobId) {
  const cacheKey = `recommendations:job-analysis:${userId}:${jobId}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const user = await getUserProfile(userId);
  const job = await getJobRecord(jobId);

  if (!user || !job) return null;

  const [variant, preferenceSignals] = await Promise.all([
    getExperimentAssignment(userId),
    getPreferenceSignals(userId),
  ]);

  const analysis = buildJobRecommendation(user, job, [job], { variant, preferenceSignals });
  await setCache(cacheKey, analysis, 900);
  return analysis;
}

function skillSignalPayload(job) {
  return normalizeSkillEntries(job.skills).map((skill) => skill.key);
}

async function upsertPreferenceSignal(userId, signalType, signalValue, delta) {
  if (!signalValue) return;

  await query(
    `INSERT INTO analytics_service.user_preference_signals (user_id, signal_type, signal_value, score, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, signal_type, signal_value)
     DO UPDATE SET
       score = analytics_service.user_preference_signals.score + EXCLUDED.score,
       updated_at = NOW()`,
    [userId, signalType, String(signalValue).toLowerCase(), delta]
  );
}

async function recordUserFeedback(userId, jobId, action) {
  const delta = FEEDBACK_DELTAS[action];
  if (!delta) {
    throw new Error('Unsupported feedback action');
  }

  const job = await getJobRecord(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  const signals = [
    ...skillSignalPayload(job).map((skill) => ['skill', skill]),
    ['company', job.company],
    ['location', job.location],
    ['work_type', job.work_type],
    ...String(job.title || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 4).map((word) => ['title_keyword', word]),
  ];

  for (const [signalType, signalValue] of signals) {
    await upsertPreferenceSignal(userId, signalType, signalValue, delta);
  }

  await trackFeedbackEvent({ userId, jobId, action, delta });
  await invalidateCache(`recommendations:jobs:${userId}*`);
  await invalidateCache(`recommendations:job-analysis:${userId}:*`);
}

async function trackFeedbackEvent({ userId, jobId, action, delta }) {
  await query(
    `INSERT INTO analytics_service.events (event_type, entity_type, entity_id, user_id, data)
     VALUES ($1, 'job', $2, $3, $4)`,
    [`recommendation.${action}`, jobId, userId, JSON.stringify({ action, delta })]
  );

  await recordExperimentMetric({
    userId,
    entityId: jobId,
    metricKey: action,
    metricValue: 1,
  });
}

async function getReferralMatches(userId, jobId, limit = 5) {
  const job = await getJobRecord(jobId);
  if (!job) return [];

  const requesterResult = await query(
    `SELECT education_school
     FROM user_service.users
     WHERE id = $1`,
    [userId]
  );
  const requester = requesterResult.rows[0] || {};

  const result = await query(
    `SELECT
       u.id,
       u.first_name,
       u.last_name,
       u.headline,
       u.current_company,
       u.education_school,
       u.location,
       COALESCE(
         json_agg(json_build_object('skillName', s.skill_name, 'proficiency', s.proficiency))
         FILTER (WHERE s.id IS NOT NULL),
         '[]'
       ) AS skills
     FROM user_service.users u
     LEFT JOIN user_service.user_skills s ON s.user_id = u.id
     WHERE u.id <> $1
       AND u.is_active = true
       AND (
         LOWER(COALESCE(u.current_company, '')) = LOWER($2)
         OR (
           $3 <> ''
           AND LOWER(COALESCE(u.education_school, '')) = LOWER($3)
         )
       )
     GROUP BY u.id
     ORDER BY
       CASE WHEN LOWER(COALESCE(u.current_company, '')) = LOWER($2) THEN 0 ELSE 1 END,
       u.updated_at DESC
     LIMIT $4`,
    [userId, job.company || '', requester.education_school || '', limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    fullName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    headline: row.headline,
    currentCompany: row.current_company,
    educationSchool: row.education_school,
    location: row.location,
    skills: skillNames(row.skills),
    reason: buildReferralReason({
      currentCompany: row.current_company,
      educationSchool: row.education_school,
      targetCompany: job.company,
    }),
  }));
}

async function getCareerInsights(userId) {
  const user = await getUserProfile(userId);
  if (!user) return null;

  const trajectory = predictCareerTrajectory({
    headline: user.headline,
    currentSkills: skillNames(user.skills),
    experienceYears: user.experience_years,
    targetRoles: user.preferred_roles || [],
    careerGoal: user.career_goal,
  });

  const matchingJobsResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM job_service.jobs
     WHERE status = 'active'
       AND (
         title ILIKE ANY($1)
         OR description ILIKE ANY($1)
       )`,
    [trajectory.nextRoles.map((role) => `%${role}%`)]
  );

  return {
    ...trajectory,
    marketOpenings: Number(matchingJobsResult.rows[0]?.total || 0),
  };
}

async function getExperimentSummary() {
  const result = await query(
    `SELECT
       variant,
       metric_key,
       COUNT(*)::int AS events,
       COALESCE(SUM(metric_value), 0) AS total_value
     FROM analytics_service.experiment_events
     WHERE experiment_key = $1
     GROUP BY variant, metric_key
     ORDER BY variant, metric_key`,
    [EXPERIMENT_KEY]
  );

  const summaryByVariant = {};
  for (const row of result.rows) {
    if (!summaryByVariant[row.variant]) {
      summaryByVariant[row.variant] = {
        variant: row.variant,
        clicks: 0,
        applies: 0,
        skips: 0,
        notInterested: 0,
      };
    }

    if (row.metric_key === 'click') summaryByVariant[row.variant].clicks = Number(row.events);
    if (row.metric_key === 'apply') summaryByVariant[row.variant].applies = Number(row.events);
    if (row.metric_key === 'skip') summaryByVariant[row.variant].skips = Number(row.events);
    if (row.metric_key === 'not_interested') summaryByVariant[row.variant].notInterested = Number(row.events);
  }

  return {
    experimentKey: EXPERIMENT_KEY,
    variants: Object.values(summaryByVariant).map((variant) => ({
      ...variant,
      clickThroughRate: variant.clicks > 0 ? Math.round((variant.applies / variant.clicks) * 1000) / 10 : 0,
    })),
  };
}

function computeProfileCompleteness(candidate) {
  const signals = [
    Boolean(candidate.headline),
    Boolean(candidate.location),
    Number(candidate.experience_years || 0) > 0,
    normalizeSkillEntries(candidate.skills).length >= 3,
  ];

  return signals.filter(Boolean).length / signals.length;
}

function buildActivitySignal(candidate) {
  const recentApplications = Number(candidate.recent_applications_count || 0);
  const lastApplicationAt = candidate.last_application_at ? new Date(candidate.last_application_at) : null;
  const daysSinceActive = lastApplicationAt
    ? Math.floor((Date.now() - lastApplicationAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  if (recentApplications >= 5 || (daysSinceActive !== null && daysSinceActive <= 7)) {
    return {
      level: 'high',
      label: 'High activity',
      reason: 'Recently active in the job market and likely to notice outreach quickly.',
    };
  }

  if (recentApplications >= 2 || (daysSinceActive !== null && daysSinceActive <= 30)) {
    return {
      level: 'medium',
      label: 'Moderate activity',
      reason: 'Shows recent search behavior with a reasonable chance of replying.',
    };
  }

  return {
    level: 'low',
    label: 'Lower activity',
    reason: 'Less recent job-search activity, so follow-up may take longer.',
  };
}

function computeResponseProbability(candidate, scores) {
  const profileCompleteness = computeProfileCompleteness(candidate);
  const activityBoost = Math.min(Number(candidate.recent_applications_count || 0) / 5, 1);
  const positiveSignal = candidate.recent_positive_outcomes_count > 0
    ? Math.min(candidate.recent_positive_outcomes_count / Math.max(candidate.recent_applications_count || 1, 1), 1)
    : 0.4;

  const probability =
    scores.skill * 0.5 +
    scores.experience * 0.15 +
    scores.location * 0.1 +
    activityBoost * 0.15 +
    positiveSignal * 0.05 +
    profileCompleteness * 0.05;

  return Math.max(0.25, Math.min(0.95, probability));
}

async function getCandidateRecommendations(jobId, limit = 20) {
  const cacheKey = `recommendations:candidates:${jobId}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const job = await getJobRecord(jobId);
  if (!job) return [];

  const candidatesResult = await query(
    `SELECT
       u.id,
       u.first_name,
       u.last_name,
       u.headline,
       u.location,
       u.experience_years,
       u.updated_at,
       COALESCE(
         json_agg(
           json_build_object('skillName', s.skill_name, 'proficiency', s.proficiency)
         ) FILTER (WHERE s.id IS NOT NULL),
         '[]'
       ) AS skills,
       COALESCE(app_stats.recent_applications_count, 0) AS recent_applications_count,
       COALESCE(app_stats.recent_positive_outcomes_count, 0) AS recent_positive_outcomes_count,
       app_stats.last_application_at
     FROM user_service.users u
     LEFT JOIN user_service.user_skills s ON u.id = s.user_id
     LEFT JOIN (
       SELECT
         user_id,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS recent_applications_count,
         COUNT(*) FILTER (WHERE status IN ('shortlisted', 'hired') AND created_at >= NOW() - INTERVAL '90 days') AS recent_positive_outcomes_count,
         MAX(created_at) AS last_application_at
       FROM job_service.applications
       GROUP BY user_id
     ) app_stats ON app_stats.user_id = u.id
     WHERE u.role = 'candidate' AND u.is_active = true
     GROUP BY u.id, app_stats.recent_applications_count, app_stats.recent_positive_outcomes_count, app_stats.last_application_at
     LIMIT 500`
  );

  const scoredCandidates = candidatesResult.rows.map((candidate) => {
    const skillScore = computeSkillSimilarity(candidate.skills, job.skills);
    const experienceScore = computeExperienceScore(candidate.experience_years, job.experience_min, job.experience_max);
    const locationScore = computeLocationScore(candidate.location, job.location, job.work_type);
    const responseProbability = computeResponseProbability(candidate, {
      skill: skillScore,
      experience: experienceScore,
      location: locationScore,
    });
    const totalScore = skillScore * 0.5 + experienceScore * 0.25 + locationScore * 0.1 + responseProbability * 0.15;
    const gapAnalysis = analyzeSkillGap(candidate.skills, job.skills);
    const activitySignal = buildActivitySignal(candidate);

    return {
      id: candidate.id,
      firstName: candidate.first_name,
      lastName: candidate.last_name,
      headline: candidate.headline,
      location: candidate.location,
      experienceYears: candidate.experience_years,
      skills: skillNames(candidate.skills),
      matchScore: Math.round(totalScore * 100) / 100,
      matchPercent: Math.round(totalScore * 100),
      matchedSkills: gapAnalysis.matchedSkills,
      missingSkills: [...gapAnalysis.missingRequiredSkills, ...gapAnalysis.missingOptionalSkills],
      responseProbability: {
        percent: Math.round(responseProbability * 100),
        label: responseProbability >= 0.75 ? 'Very likely to respond' : responseProbability >= 0.55 ? 'Likely to respond' : 'Requires warm outreach',
      },
      activitySignal,
      recruiterReasons: [
        gapAnalysis.matchedSkills.length > 0 ? `Skill alignment: ${gapAnalysis.matchedSkills.slice(0, 3).join(', ')}.` : 'Profile has a general fit for the role.',
        experienceScore >= 0.7 ? 'Experience level is close to your target band.' : 'Experience fit is partial, so screen depth matters.',
        activitySignal.reason,
      ],
    };
  });

  const recommendations = scoredCandidates
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);

  await setCache(cacheKey, recommendations, 1800);
  return recommendations;
}

module.exports = {
  getJobRecommendations,
  getJobRecommendationAnalysis,
  getCandidateRecommendations,
  recordUserFeedback,
  getReferralMatches,
  getCareerInsights,
  getExperimentSummary,
};
