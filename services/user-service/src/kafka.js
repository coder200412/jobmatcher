const { Kafka, logLevel } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'user-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  retry: { initialRetryTime: 300, retries: 2 },
  connectionTimeout: 3000,
  logLevel: logLevel.WARN,
});

const producer = kafka.producer();
let isConnected = false;

async function connectKafkaProducer() {
  try {
    await Promise.race([
      producer.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Kafka connection timeout')), 5000)),
    ]);
    isConnected = true;
  } catch (err) {
    console.warn('⚠️  Kafka not available, events will be logged to console');
    isConnected = false;
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

