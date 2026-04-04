const { EventTypes, KafkaTopics, createEvent } = require('./events');
const constants = require('./constants');
const config = require('./config');
const kafkaConfig = require('./kafka-config');
const localEvents = require('./local-events');
const talentIntelligence = require('./talent-intelligence');

module.exports = {
  EventTypes,
  KafkaTopics,
  createEvent,
  ...constants,
  ...config,
  ...kafkaConfig,
  ...localEvents,
  ...talentIntelligence,
};
