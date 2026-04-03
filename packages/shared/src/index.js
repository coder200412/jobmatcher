const { EventTypes, KafkaTopics, createEvent } = require('./events');
const constants = require('./constants');
const config = require('./config');
const kafkaConfig = require('./kafka-config');

module.exports = {
  EventTypes,
  KafkaTopics,
  createEvent,
  ...constants,
  ...config,
  ...kafkaConfig,
};
