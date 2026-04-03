const { Kafka, logLevel } = require('kafkajs');
const { KafkaTopics, EventTypes, getKafkaBrokers, isKafkaEnabled } = require('@jobmatch/shared');
const { query } = require('./db');

let consumer = null;
let retryTimer = null;
let kafkaAvailable = false;
const kafkaEnabled = isKafkaEnabled();

async function createNotification(userId, type, title, message, data = {}) {
  await query(
    `INSERT INTO notification_service.notifications (user_id, type, title, message, data)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, type, title, message, JSON.stringify(data)]
  );
  console.log(`📧 [EMAIL-MOCK] To: ${userId} | Subject: ${title} | ${message}`);
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
    // Ignore disconnect errors during crash recovery
  } finally {
    consumer = null;
  }
}

async function runConsumer() {
  if (!kafkaEnabled) {
    return false;
  }

  const kafka = new Kafka({
    clientId: 'notification-service',
    brokers: getKafkaBrokers(),
    retry: { initialRetryTime: 500, retries: 1 },
    connectionTimeout: 3000,
    logLevel: logLevel.ERROR,
  });

  consumer = kafka.consumer({
    groupId: 'notification-service-group',
    retry: { initialRetryTime: 500, retries: 1 },
  });

  consumer.on(consumer.events.CRASH, async () => {
    kafkaAvailable = false;
    console.warn('⚠️  Kafka consumer crashed, retrying in background');
    await disconnectConsumer();
    scheduleRetry();
  });

  await consumer.connect();
  await consumer.subscribe({
    topics: [KafkaTopics.USER_EVENTS, KafkaTopics.APPLICATION_EVENTS, KafkaTopics.JOB_EVENTS],
    fromBeginning: false,
  });

  consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        console.log(`[KAFKA] Received ${event.type}`);

        switch (event.type) {
          case EventTypes.USER_REGISTERED:
            await createNotification(
              event.payload.userId, 'welcome', 'Welcome to JobMatch! 🎉',
              `Hi ${event.payload.firstName}, your account is ready. Start exploring job opportunities!`,
              { type: 'welcome' }
            );
            break;
          case EventTypes.APPLICATION_SUBMITTED:
            await createNotification(
              event.payload.recruiterId, 'application_update', 'New Application Received',
              `Someone applied to your "${event.payload.jobTitle}" position at ${event.payload.company}.`,
              { jobId: event.payload.jobId, applicationId: event.payload.applicationId }
            );
            await createNotification(
              event.payload.userId, 'application_update', 'Application Submitted ✅',
              `Your application for "${event.payload.jobTitle}" at ${event.payload.company} has been submitted.`,
              { jobId: event.payload.jobId }
            );
            break;
            case EventTypes.APPLICATION_STATUS_CHANGED:
              {
                const feedbackSuffix = event.payload.note
                  ? ` Feedback: ${event.payload.note}`
                  : '';
              await createNotification(
                event.payload.userId, 'application_update',
                `Application ${event.payload.newStatus.charAt(0).toUpperCase() + event.payload.newStatus.slice(1)}`,
                `Your application for "${event.payload.jobTitle}" has been ${event.payload.newStatus}.${feedbackSuffix}`,
                { jobId: event.payload.jobId, status: event.payload.newStatus }
              );
              break;
              }
          case EventTypes.JOB_CREATED:
            console.log(`[NOTIF] New job posted: ${event.payload.title}`);
            break;
        }
      } catch (err) {
        console.error('[KAFKA] Error processing notification:', err.message);
      }
    },
  }).catch(async () => {
    kafkaAvailable = false;
    console.warn('⚠️  Kafka consumer stopped, retrying in background');
    await disconnectConsumer();
    scheduleRetry();
  });
}

async function startConsumer() {
  if (!kafkaEnabled) {
    console.log('ℹ️  Kafka disabled, notification consumer will stay idle');
    return null;
  }

  if (kafkaAvailable) {
    return true;
  }

  try {
    await runConsumer();
    kafkaAvailable = true;
    console.log('✅ Kafka consumer started');
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
