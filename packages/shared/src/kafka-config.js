function isKafkaEnabled() {
  if (process.env.KAFKA_ENABLED !== undefined) {
    return !['0', 'false', 'no', 'off', 'disable'].includes(String(process.env.KAFKA_ENABLED).toLowerCase());
  }

  return Boolean((process.env.KAFKA_BROKERS || '').trim());
}

function getKafkaBrokers() {
  return (process.env.KAFKA_BROKERS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

module.exports = {
  isKafkaEnabled,
  getKafkaBrokers,
};
