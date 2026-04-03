const { query } = require('./db');
const { getCached, setCache } = require('./cache');

/**
 * TF-IDF based job recommendation engine
 * 
 * Scoring formula:
 *   - Skills match score (40%)
 *   - Experience level match (20%)
 *   - Location preference (15%)
 *   - Recency of posting (15%)
 *   - Popularity/CTR (10%)
 */

const WEIGHTS = {
  SKILLS: 0.40,
  EXPERIENCE: 0.20,
  LOCATION: 0.15,
  RECENCY: 0.15,
  POPULARITY: 0.10,
};

/**
 * Compute TF-IDF-like similarity between two skill sets
 */
function computeSkillSimilarity(userSkills, jobSkills) {
  if (!userSkills.length || !jobSkills.length) return 0;

  const userSet = new Set(userSkills.map(s => s.toLowerCase()));
  const jobSet = new Set(jobSkills.map(s => s.toLowerCase()));

  // Intersection
  let matches = 0;
  for (const skill of jobSet) {
    if (userSet.has(skill)) matches++;
  }

  // Jaccard similarity
  const union = new Set([...userSet, ...jobSet]);
  const jaccard = matches / union.size;

  // Also compute recall: how many job requirements does user meet?
  const recall = matches / jobSet.size;

  // Combine: weight recall more (meeting job requirements is more important)
  return (jaccard * 0.3 + recall * 0.7);
}

/**
 * Compute experience match score
 */
function computeExperienceScore(userYears, jobMinYears, jobMaxYears) {
  if (jobMinYears === null && jobMaxYears === null) return 0.5; // neutral
  const min = jobMinYears || 0;
  const max = jobMaxYears || 30;
  
  if (userYears >= min && userYears <= max) return 1.0;
  if (userYears < min) {
    const diff = min - userYears;
    return Math.max(0, 1 - diff * 0.2); // lose 20% per year under
  }
  const diff = userYears - max;
  return Math.max(0, 1 - diff * 0.1); // lose 10% per year over (overqualified is less bad)
}

/**
 * Compute location match
 */
function computeLocationScore(userLocation, jobLocation, jobWorkType) {
  if (jobWorkType === 'remote') return 1.0; // Remote jobs match everyone
  if (!userLocation || !jobLocation) return 0.5;
  
  const uLoc = userLocation.toLowerCase().trim();
  const jLoc = jobLocation.toLowerCase().trim();
  
  if (uLoc === jLoc) return 1.0;
  // Check if either contains the other (city vs "city, state")
  if (uLoc.includes(jLoc) || jLoc.includes(uLoc)) return 0.8;
  return 0.2;
}

/**
 * Compute recency score (newer jobs scored higher)
 */
function computeRecencyScore(createdAt) {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  
  if (ageDays <= 1) return 1.0;
  if (ageDays <= 7) return 0.9;
  if (ageDays <= 14) return 0.7;
  if (ageDays <= 30) return 0.5;
  return Math.max(0.1, 1 - ageDays / 180);
}

/**
 * Compute popularity score based on views and applications
 */
function computePopularityScore(viewsCount, applicationsCount, allJobs) {
  if (allJobs.length === 0) return 0.5;
  
  const maxViews = Math.max(...allJobs.map(j => j.views_count || 0), 1);
  const maxApps = Math.max(...allJobs.map(j => j.applications_count || 0), 1);
  
  const viewScore = (viewsCount || 0) / maxViews;
  const appScore = (applicationsCount || 0) / maxApps;
  
  return viewScore * 0.4 + appScore * 0.6;
}

/**
 * Get personalized job recommendations for a user
 */
async function getJobRecommendations(userId, limit = 20) {
  // Check cache
  const cacheKey = `recommendations:jobs:${userId}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  // Get user profile
  const userResult = await query(
    `SELECT u.id, u.location, u.experience_years,
            COALESCE(array_agg(s.skill_name) FILTER (WHERE s.id IS NOT NULL), '{}') as skills
     FROM user_service.users u
     LEFT JOIN user_service.user_skills s ON u.id = s.user_id
     WHERE u.id = $1
     GROUP BY u.id`,
    [userId]
  );

  if (userResult.rows.length === 0) return [];

  const user = userResult.rows[0];

  // Get active jobs (exclude already applied)
  const jobsResult = await query(
    `SELECT j.*, 
            COALESCE(array_agg(s.skill_name) FILTER (WHERE s.id IS NOT NULL), '{}') as skills
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

  // Score each job
  const scoredJobs = allJobs.map(job => {
    const skillScore = computeSkillSimilarity(user.skills, job.skills);
    const experienceScore = computeExperienceScore(user.experience_years, job.experience_min, job.experience_max);
    const locationScore = computeLocationScore(user.location, job.location, job.work_type);
    const recencyScore = computeRecencyScore(job.created_at);
    const popularityScore = computePopularityScore(job.views_count, job.applications_count, allJobs);

    const totalScore =
      skillScore * WEIGHTS.SKILLS +
      experienceScore * WEIGHTS.EXPERIENCE +
      locationScore * WEIGHTS.LOCATION +
      recencyScore * WEIGHTS.RECENCY +
      popularityScore * WEIGHTS.POPULARITY;

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
      scoreBreakdown: {
        skills: Math.round(skillScore * 100),
        experience: Math.round(experienceScore * 100),
        location: Math.round(locationScore * 100),
        recency: Math.round(recencyScore * 100),
        popularity: Math.round(popularityScore * 100),
      },
    };
  });

  // Sort by total score descending
  scoredJobs.sort((a, b) => b.matchScore - a.matchScore);

  const recommendations = scoredJobs.slice(0, limit);

  // Cache for 30 minutes
  await setCache(cacheKey, recommendations, 1800);

  return recommendations;
}

/**
 * Get recommended candidates for a job (for recruiters)
 */
async function getCandidateRecommendations(jobId, limit = 20) {
  const cacheKey = `recommendations:candidates:${jobId}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  // Get job details
  const jobResult = await query(
    `SELECT j.*, COALESCE(array_agg(s.skill_name) FILTER (WHERE s.id IS NOT NULL), '{}') as skills
     FROM job_service.jobs j
     LEFT JOIN job_service.job_skills s ON j.id = s.job_id
     WHERE j.id = $1
     GROUP BY j.id`,
    [jobId]
  );

  if (jobResult.rows.length === 0) return [];

  const job = jobResult.rows[0];

  // Get candidates
  const candidatesResult = await query(
    `SELECT u.id, u.first_name, u.last_name, u.headline, u.location, u.experience_years,
            COALESCE(array_agg(s.skill_name) FILTER (WHERE s.id IS NOT NULL), '{}') as skills
     FROM user_service.users u
     LEFT JOIN user_service.user_skills s ON u.id = s.user_id
     WHERE u.role = 'candidate' AND u.is_active = true
     GROUP BY u.id
     LIMIT 500`
  );

  const scoredCandidates = candidatesResult.rows.map(candidate => {
    const skillScore = computeSkillSimilarity(candidate.skills, job.skills);
    const experienceScore = computeExperienceScore(candidate.experience_years, job.experience_min, job.experience_max);
    const locationScore = computeLocationScore(candidate.location, job.location, job.work_type);

    const totalScore = skillScore * 0.5 + experienceScore * 0.3 + locationScore * 0.2;

    return {
      id: candidate.id,
      firstName: candidate.first_name,
      lastName: candidate.last_name,
      headline: candidate.headline,
      location: candidate.location,
      experienceYears: candidate.experience_years,
      skills: candidate.skills,
      matchScore: Math.round(totalScore * 100) / 100,
    };
  });

  scoredCandidates.sort((a, b) => b.matchScore - a.matchScore);

  const recommendations = scoredCandidates.slice(0, limit);
  await setCache(cacheKey, recommendations, 1800);

  return recommendations;
}

module.exports = { getJobRecommendations, getCandidateRecommendations };
