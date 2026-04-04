const { Pool } = require('pg');
const { createPgConfig } = require('./config');
const { EventTypes } = require('./events');

let pool = null;
let redis = null;
let redisReady = false;
let redisAttempted = false;

function getPool() {
  if (!pool) {
    pool = new Pool(createPgConfig({
      max: 10,
      idleTimeoutMillis: 30000,
    }));
  }

  return pool;
}

async function getRedis() {
  if (redisReady && redis) {
    return redis;
  }

  if (redisAttempted) {
    return null;
  }

  redisAttempted = true;

  try {
    const Redis = require('ioredis');
    const redisUrl = process.env.REDIS_URL || process.env.KEY_VALUE_URL || process.env.KEY_VALUE_REDIS_URL;
    const redisOptions = {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 1) return null;
        return Math.min(times * 200, 500);
      },
    };

    redis = redisUrl
      ? new Redis(redisUrl, redisOptions)
      : new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          ...redisOptions,
        });

    redis.on('error', () => {
      redisReady = false;
    });

    await Promise.race([
      redis.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 2000)),
    ]);
    await redis.ping();
    redisReady = true;
    return redis;
  } catch {
    redis = null;
    redisReady = false;
    return null;
  }
}

async function invalidateCache(patterns = []) {
  const client = await getRedis();
  if (!client) {
    return;
  }

  for (const pattern of patterns.filter(Boolean)) {
    try {
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } catch {
      // Ignore cache invalidation failures for local event fallbacks.
    }
  }
}

async function runQuery(text, params = []) {
  return getPool().query(text, params);
}

async function createNotification(userId, type, title, message, data = {}) {
  await runQuery(
    `INSERT INTO notification_service.notifications (user_id, type, title, message, data)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, type, title, message, JSON.stringify(data)]
  );
}

async function createNotifications(notifications = []) {
  for (const notification of notifications) {
    await createNotification(
      notification.userId,
      notification.type,
      notification.title,
      notification.message,
      notification.data || {}
    );
  }
}

async function trackAnalyticsEvent(eventType, entityType, entityId, userId, data = {}) {
  await runQuery(
    `INSERT INTO analytics_service.events (event_type, entity_type, entity_id, user_id, data)
     VALUES ($1, $2, $3, $4, $5)`,
    [eventType, entityType, entityId, userId, JSON.stringify(data)]
  );
}

async function upsertDailyStatIncrement(field) {
  const columnMap = new Map([
    ['jobs', 'total_jobs_posted'],
    ['applications', 'total_applications'],
    ['users', 'total_users_registered'],
  ]);

  const column = columnMap.get(field);
  if (!column) {
    return;
  }

  await runQuery(
    `INSERT INTO analytics_service.daily_stats (stat_date, ${column})
     VALUES (CURRENT_DATE, 1)
     ON CONFLICT (stat_date)
     DO UPDATE SET ${column} = analytics_service.daily_stats.${column} + 1`,
    []
  );
}

async function refreshActiveUsers() {
  await runQuery(
    `INSERT INTO analytics_service.daily_stats (stat_date, active_users)
     VALUES (
       CURRENT_DATE,
       (
         SELECT COUNT(DISTINCT user_id)::int
         FROM analytics_service.events
         WHERE user_id IS NOT NULL
           AND created_at::date = CURRENT_DATE
       )
     )
     ON CONFLICT (stat_date)
     DO UPDATE SET active_users = EXCLUDED.active_users`,
    []
  );
}

async function refreshAvgCtr() {
  await runQuery(
    `INSERT INTO analytics_service.daily_stats (stat_date, avg_ctr)
     VALUES (
       CURRENT_DATE,
       COALESCE(
         (
           SELECT AVG(click_through_rate)::decimal(5,4)
           FROM analytics_service.job_metrics
         ),
         0
       )
     )
     ON CONFLICT (stat_date)
     DO UPDATE SET avg_ctr = EXCLUDED.avg_ctr`,
    []
  );
}

async function updateJobMetrics(jobId) {
  const viewsResult = await runQuery(
    `SELECT COUNT(*) AS total, COUNT(DISTINCT user_id) AS unique_views
     FROM analytics_service.events
     WHERE entity_type = 'job' AND entity_id = $1 AND event_type = $2`,
    [jobId, EventTypes.JOB_VIEWED]
  );

  const appsResult = await runQuery(
    `SELECT COUNT(*) AS total
     FROM analytics_service.events
     WHERE entity_type = 'job' AND entity_id = $1 AND event_type = $2`,
    [jobId, EventTypes.APPLICATION_SUBMITTED]
  );

  const views = parseInt(viewsResult.rows[0]?.total || '0', 10);
  const uniqueViews = parseInt(viewsResult.rows[0]?.unique_views || '0', 10);
  const apps = parseInt(appsResult.rows[0]?.total || '0', 10);
  const ctr = views > 0 ? apps / views : 0;

  await runQuery(
    `INSERT INTO analytics_service.job_metrics (job_id, views_count, unique_views_count, applications_count, click_through_rate, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (job_id) DO UPDATE SET
       views_count = EXCLUDED.views_count,
       unique_views_count = EXCLUDED.unique_views_count,
       applications_count = EXCLUDED.applications_count,
       click_through_rate = EXCLUDED.click_through_rate,
       updated_at = NOW()`,
    [jobId, views, uniqueViews, apps, ctr]
  );

  await refreshAvgCtr();
}

async function handleUserRegistered(event) {
  await trackAnalyticsEvent(EventTypes.USER_REGISTERED, 'user', event.payload.userId, event.payload.userId, event.payload);
  await upsertDailyStatIncrement('users');
  await refreshActiveUsers();
  await createNotification(
    event.payload.userId,
    'welcome',
    'Welcome to Workvanta!',
    `Hi ${event.payload.firstName}, your account is ready. Start exploring job opportunities!`,
    { type: 'welcome' }
  );
}

async function handleUserProfileUpdated(event) {
  await trackAnalyticsEvent(EventTypes.USER_PROFILE_UPDATED, 'user', event.payload.userId, event.payload.userId, event.payload);
  await refreshActiveUsers();
  await invalidateCache([
    `recommendations:jobs:${event.payload.userId}*`,
    `recommendations:job-analysis:${event.payload.userId}:*`,
  ]);
}

async function handleUserSkillsUpdated(event) {
  await trackAnalyticsEvent(EventTypes.USER_SKILLS_UPDATED, 'user', event.payload.userId, event.payload.userId, event.payload);
  await refreshActiveUsers();
  await invalidateCache([
    `recommendations:jobs:${event.payload.userId}*`,
    `recommendations:job-analysis:${event.payload.userId}:*`,
  ]);
}

async function handleJobCreated(event) {
  await trackAnalyticsEvent(EventTypes.JOB_CREATED, 'job', event.payload.jobId, event.payload.recruiterId || null, event.payload);
  await upsertDailyStatIncrement('jobs');
  await refreshActiveUsers();
  await invalidateCache([
    'recommendations:jobs:*',
    `recommendations:candidates:${event.payload.jobId}`,
    `recommendations:job-analysis:*:${event.payload.jobId}`,
  ]);
}

async function handleJobUpdated(event) {
  await trackAnalyticsEvent(EventTypes.JOB_UPDATED, 'job', event.payload.jobId, event.payload.recruiterId || null, event.payload);
  await refreshActiveUsers();
  await invalidateCache([
    'recommendations:jobs:*',
    `recommendations:candidates:${event.payload.jobId}`,
    `recommendations:job-analysis:*:${event.payload.jobId}`,
  ]);
}

async function handleJobDeleted(event) {
  await trackAnalyticsEvent(EventTypes.JOB_DELETED, 'job', event.payload.jobId, event.payload.recruiterId || null, event.payload);
  await invalidateCache([
    'recommendations:jobs:*',
    `recommendations:candidates:${event.payload.jobId}`,
    `recommendations:job-analysis:*:${event.payload.jobId}`,
  ]);
}

async function handleJobViewed(event) {
  await trackAnalyticsEvent(EventTypes.JOB_VIEWED, 'job', event.payload.jobId, event.payload.userId || null, event.payload);
  await refreshActiveUsers();
  await updateJobMetrics(event.payload.jobId);
}

async function handleApplicationSubmitted(event) {
  await trackAnalyticsEvent(EventTypes.APPLICATION_SUBMITTED, 'job', event.payload.jobId, event.payload.userId, event.payload);
  await upsertDailyStatIncrement('applications');
  await refreshActiveUsers();
  await updateJobMetrics(event.payload.jobId);
  await invalidateCache([
    `recommendations:jobs:${event.payload.userId}*`,
    `recommendations:job-analysis:${event.payload.userId}:*`,
    `recommendations:candidates:${event.payload.jobId}`,
  ]);
  await createNotifications([
    {
      userId: event.payload.recruiterId,
      type: 'application_update',
      title: 'New Application Received',
      message: `Someone applied to your "${event.payload.jobTitle}" position at ${event.payload.company}.`,
      data: { jobId: event.payload.jobId, applicationId: event.payload.applicationId },
    },
    {
      userId: event.payload.userId,
      type: 'application_update',
      title: 'Application Submitted',
      message: `Your application for "${event.payload.jobTitle}" at ${event.payload.company} has been submitted.`,
      data: { jobId: event.payload.jobId, applicationId: event.payload.applicationId },
    },
  ]);
}

async function handleApplicationStatusChanged(event) {
  await trackAnalyticsEvent(
    EventTypes.APPLICATION_STATUS_CHANGED,
    'application',
    event.payload.applicationId || event.payload.jobId,
    event.payload.userId,
    event.payload
  );
  await refreshActiveUsers();
  await invalidateCache([
    `recommendations:jobs:${event.payload.userId}*`,
    `recommendations:job-analysis:${event.payload.userId}:*`,
    `recommendations:candidates:${event.payload.jobId}`,
  ]);

  const feedbackSuffix = event.payload.note ? ` Feedback: ${event.payload.note}` : '';
  await createNotification(
    event.payload.userId,
    'application_update',
    `Application ${event.payload.newStatus.charAt(0).toUpperCase() + event.payload.newStatus.slice(1)}`,
    `Your application for "${event.payload.jobTitle}" has been ${event.payload.newStatus}.${feedbackSuffix}`,
    { jobId: event.payload.jobId, status: event.payload.newStatus }
  );
}

async function handleLocalEvent(event) {
  if (!event?.type) {
    return;
  }

  switch (event.type) {
    case EventTypes.USER_REGISTERED:
      await handleUserRegistered(event);
      break;
    case EventTypes.USER_PROFILE_UPDATED:
      await handleUserProfileUpdated(event);
      break;
    case EventTypes.USER_SKILLS_UPDATED:
      await handleUserSkillsUpdated(event);
      break;
    case EventTypes.JOB_CREATED:
      await handleJobCreated(event);
      break;
    case EventTypes.JOB_UPDATED:
      await handleJobUpdated(event);
      break;
    case EventTypes.JOB_DELETED:
      await handleJobDeleted(event);
      break;
    case EventTypes.JOB_VIEWED:
      await handleJobViewed(event);
      break;
    case EventTypes.APPLICATION_SUBMITTED:
      await handleApplicationSubmitted(event);
      break;
    case EventTypes.APPLICATION_STATUS_CHANGED:
      await handleApplicationStatusChanged(event);
      break;
    default:
      break;
  }
}

module.exports = {
  createNotification,
  createNotifications,
  trackAnalyticsEvent,
  updateJobMetrics,
  handleLocalEvent,
};
