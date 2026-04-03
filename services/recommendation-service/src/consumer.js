const { Kafka, logLevel } = require('kafkajs');
const { KafkaTopics, EventTypes, getKafkaBrokers, isKafkaEnabled } = require('@jobmatch/shared');
const { invalidateCache } = require('./cache');

const kafkaEnabled = isKafkaEnabled();
const kafka = kafkaEnabled ? new Kafka({
  clientId: 'recommendation-service',
  brokers: getKafkaBrokers(),
  retry: { initialRetryTime: 300, retries: 2 },
  connectionTimeout: 3000,
  logLevel: logLevel.ERROR,
}) : null;

let consumer = null;
let kafkaAvailable = false;
let retryTimer = null;

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
      console.log('ℹ️  Kafka disabled, recommendation consumer will stay idle');
      return null;
    }

    if (kafkaAvailable) {
      return true;
    }

    consumer = kafka.consumer({ groupId: 'recommendation-service-group' });

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
    await consumer.subscribe({ topics: [KafkaTopics.USER_EVENTS, KafkaTopics.JOB_EVENTS, KafkaTopics.APPLICATION_EVENTS], fromBeginning: false });

    consumer.run({
      eachMessage: async ({ topic, message }) => {
        try {
          const event = JSON.parse(message.value.toString());
          console.log(`[KAFKA] Received ${event.type} from ${topic}`);

          switch (event.type) {
            case EventTypes.USER_PROFILE_UPDATED:
            case EventTypes.USER_SKILLS_UPDATED:
              await invalidateCache(`recommendations:jobs:${event.payload.userId}`);
              console.log(`[RECO] Invalidated recommendations for user ${event.payload.userId}`);
              break;
            case EventTypes.JOB_CREATED:
            case EventTypes.JOB_UPDATED:
              await invalidateCache('recommendations:jobs:*');
              await invalidateCache(`recommendations:candidates:${event.payload.jobId}`);
              break;
            case EventTypes.APPLICATION_SUBMITTED:
              await invalidateCache(`recommendations:jobs:${event.payload.userId}`);
              await invalidateCache(`recommendations:candidates:${event.payload.jobId}`);
              break;
          }
        } catch (err) {
          console.error('[KAFKA] Error processing message:', err.message);
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
