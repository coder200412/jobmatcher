const { Kafka, Partitioners, logLevel } = require('kafkajs');
const { getKafkaBrokers, isKafkaEnabled } = require('@jobmatch/shared');

const kafkaEnabled = isKafkaEnabled();
const kafka = kafkaEnabled ? new Kafka({
  clientId: 'job-service',
  brokers: getKafkaBrokers(),
  retry: { initialRetryTime: 300, retries: 2 },
  connectionTimeout: 3000,
  logLevel: logLevel.ERROR,
}) : null;

const producer = kafkaEnabled ? kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner,
}) : null;
let isConnected = false;

async function connectKafkaProducer() {
  if (!kafkaEnabled || !producer) {
    console.log('ℹ️  Kafka disabled, job events will stay local');
    return false;
  }

  try {
    await Promise.race([
      producer.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Kafka connection timeout')), 5000)),
    ]);
    isConnected = true;
    return true;
  } catch (err) {
    console.warn('⚠️  Kafka not available, events will be logged to console');
    isConnected = false;
    return false;
  }
}

async function publishEvent(topic, event) {
  if (!isConnected) {
    console.log(`[KAFKA-MOCK] Topic: ${topic} | ${event.type}`);
    return;
  }
  try {
    await producer.send({
      topic,
      messages: [{ key: event.id, value: JSON.stringify(event) }],
    });
    console.log(`[KAFKA] Published to ${topic}: ${event.type}`);
  } catch (err) {
    console.error(`[KAFKA] Failed to publish to ${topic}:`, err.message);
  }
}

module.exports = { kafka, producer, connectKafkaProducer, publishEvent };
