// ═══════════════════════════════════════════════════════
// EVENT TYPES — Kafka event schema definitions
// ═══════════════════════════════════════════════════════

const EventTypes = {
  // User events
  USER_REGISTERED: 'user.registered',
  USER_PROFILE_UPDATED: 'user.profile-updated',
  USER_SKILLS_UPDATED: 'user.skills-updated',

  // Job events
  JOB_CREATED: 'job.created',
  JOB_UPDATED: 'job.updated',
  JOB_DELETED: 'job.deleted',
  JOB_VIEWED: 'job.viewed',
  JOB_CLOSED: 'job.closed',

  // Application events
  APPLICATION_SUBMITTED: 'application.submitted',
  APPLICATION_STATUS_CHANGED: 'application.status-changed',

  // Notification events
  NOTIFICATION_SEND: 'notification.send',
};

const KafkaTopics = {
  USER_EVENTS: 'user-events',
  JOB_EVENTS: 'job-events',
  APPLICATION_EVENTS: 'application-events',
  NOTIFICATION_EVENTS: 'notification-events',
  ANALYTICS_EVENTS: 'analytics-events',
};

/**
 * Create a standardized event envelope
 */
function createEvent(type, payload, metadata = {}) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    timestamp: new Date().toISOString(),
    version: '1.0',
    payload,
    metadata: {
      source: metadata.source || 'unknown',
      correlationId: metadata.correlationId || null,
      ...metadata,
    },
  };
}

module.exports = { EventTypes, KafkaTopics, createEvent };
