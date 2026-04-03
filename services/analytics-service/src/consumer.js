const { Kafka, logLevel } = require('kafkajs');
const { KafkaTopics, EventTypes, getKafkaBrokers, isKafkaEnabled } = require('@jobmatch/shared');
const { query } = require('./db');

const kafkaEnabled = isKafkaEnabled();
const kafka = kafkaEnabled ? new Kafka({
  clientId: 'analytics-service',
  brokers: getKafkaBrokers(),
  retry: { initialRetryTime: 300, retries: 2 },
  connectionTimeout: 3000,
  logLevel: logLevel.ERROR,
}) : null;

let consumer = null;
let kafkaAvailable = false;
let retryTimer = null;

async function trackEvent(eventType, entityType, entityId, userId, data) {
  await query(
    `INSERT INTO analytics_service.events (event_type, entity_type, entity_id, user_id, data)
     VALUES ($1, $2, $3, $4, $5)`,
    [eventType, entityType, entityId, userId, JSON.stringify(data)]
  );
}

async function updateJobMetrics(jobId) {
  const viewsResult = await query(
    `SELECT COUNT(*) as total, COUNT(DISTINCT user_id) as unique_views
     FROM analytics_service.events
     WHERE entity_type = 'job' AND entity_id = $1 AND event_type = 'job.viewed'`,
    [jobId]
  );
  const appsResult = await query(
    `SELECT COUNT(*) as total FROM analytics_service.events
     WHERE entity_type = 'job' AND entity_id = $1 AND event_type = 'application.submitted'`,
    [jobId]
  );

  const views = parseInt(viewsResult.rows[0].total) || 0;
  const uniqueViews = parseInt(viewsResult.rows[0].unique_views) || 0;
  const apps = parseInt(appsResult.rows[0].total) || 0;
  const ctr = views > 0 ? apps / views : 0;

  await query(
    `INSERT INTO analytics_service.job_metrics (job_id, views_count, unique_views_count, applications_count, click_through_rate, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (job_id) DO UPDATE SET
       views_count = $2, unique_views_count = $3, applications_count = $4, click_through_rate = $5, updated_at = NOW()`,
    [jobId, views, uniqueViews, apps, ctr]
  );
}

function scheduleRetry(delayMs = 3000) {
  if (retryTimer) {
    return;
  }

  retryTimer = setTimeout(() => {
    retryTimer = null;
    startConsumer().catch(() => {});
  }, delayMs);
}

async function disconnectConsumer() {
  if (!consumer) {
    return;
  }

  try {
    await consumer.disconnect();
  } catch {
    // Ignore disconnect errors during retry recovery
  } finally {
    consumer = null;
  }
}

async function startConsumer() {
  try {
    if (!kafkaEnabled || !kafka) {
      console.log('ℹ️  Kafka disabled, analytics consumer will stay idle');
      return null;
    }

    if (kafkaAvailable) {
      return true;
    }

    consumer = kafka.consumer({ groupId: 'analytics-service-group' });

    consumer.on(consumer.events.CRASH, () => {
      kafkaAvailable = false;
      console.warn('⚠️  Kafka consumer crashed, retrying in background');
      disconnectConsumer().catch(() => {});
      scheduleRetry();
    });

    await Promise.race([
      consumer.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    await consumer.subscribe({
      topics: [KafkaTopics.USER_EVENTS, KafkaTopics.JOB_EVENTS, KafkaTopics.APPLICATION_EVENTS],
      fromBeginning: false,
    });

    consumer.run({
      eachMessage: async ({ topic, message }) => {
        try {
          const event = JSON.parse(message.value.toString());
          console.log(`[ANALYTICS] Tracking ${event.type}`);

          let entityType = 'unknown', entityId = null, userId = null;

          switch (event.type) {
            case EventTypes.USER_REGISTERED:
            case EventTypes.USER_PROFILE_UPDATED:
            case EventTypes.USER_SKILLS_UPDATED:
              entityType = 'user'; entityId = event.payload.userId; userId = event.payload.userId; break;
            case EventTypes.JOB_CREATED:
            case EventTypes.JOB_UPDATED:
            case EventTypes.JOB_VIEWED:
              entityType = 'job'; entityId = event.payload.jobId; userId = event.payload.userId || event.payload.recruiterId; break;
            case EventTypes.APPLICATION_SUBMITTED:
              entityType = 'job'; entityId = event.payload.jobId; userId = event.payload.userId; break;
            case EventTypes.APPLICATION_STATUS_CHANGED:
              entityType = 'application'; entityId = event.payload.applicationId || event.payload.jobId; userId = event.payload.userId; break;
          }

          await trackEvent(event.type, entityType, entityId, userId, event.payload);

          if (event.type === EventTypes.JOB_VIEWED || event.type === EventTypes.APPLICATION_SUBMITTED) {
            await updateJobMetrics(event.payload.jobId);
          }
        } catch (err) {
          console.error('[ANALYTICS] Error processing event:', err.message);
        }
      },
    }).catch(async () => {
      kafkaAvailable = false;
      console.warn('⚠️  Kafka consumer stopped, retrying in background');
      await disconnectConsumer();
      scheduleRetry();
    });
    kafkaAvailable = true;
    return true;
  } catch (err) {
    kafkaAvailable = false;
    console.warn('⚠️  Kafka consumer not available yet, retrying in background');
    await disconnectConsumer();
    scheduleRetry();
    return false;
  }
}

module.exports = { startConsumer };
