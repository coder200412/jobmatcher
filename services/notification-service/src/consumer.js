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

function getMatchedSkills(candidate, job) {
  const candidateSkills = Array.isArray(candidate.skills) ? candidate.skills : [];
  const jobSkills = Array.isArray(job.skills) ? job.skills : [];
  const candidateSkillSet = new Set(candidateSkills.map((skill) => String(skill).toLowerCase()));
  return jobSkills.filter((skill) => candidateSkillSet.has(String(skill).toLowerCase()));
}

function computeCandidateAlertMatch(candidate, job) {
  const matchedSkills = getMatchedSkills(candidate, job);
  const jobSkills = Array.isArray(job.skills) ? job.skills : [];
  const skillScore = jobSkills.length > 0 ? matchedSkills.length / jobSkills.length : 0.55;
  const experienceScore = Number(candidate.experience_years || 0) >= Number(job.experienceMin || 0) ? 1 : 0.6;
  const locationScore = (job.workType === 'remote' || !candidate.location || !job.location)
    ? 0.85
    : (String(candidate.location).toLowerCase().includes(String(job.location).toLowerCase()) ? 1 : 0.5);

  return Math.round((skillScore * 0.55 + experienceScore * 0.25 + locationScore * 0.2) * 100);
}

async function buildJobAlertNotifications(payload) {
  const candidatesResult = await query(
    `SELECT
       u.id,
       u.first_name,
       u.location,
       u.experience_years,
       COALESCE(array_agg(s.skill_name) FILTER (WHERE s.id IS NOT NULL), '{}') AS skills,
       COALESCE(np.min_match_score, 70) AS min_match_score,
       COALESCE(np.only_high_priority, false) AS only_high_priority
     FROM user_service.users u
     LEFT JOIN user_service.user_skills s ON s.user_id = u.id
     LEFT JOIN notification_service.notification_preferences np ON np.user_id = u.id
     WHERE u.role = 'candidate' AND u.is_active = true
     GROUP BY u.id, np.min_match_score, np.only_high_priority
     LIMIT 200`
  );

  const ranked = candidatesResult.rows
    .map((candidate) => {
      const matchedSkills = getMatchedSkills(candidate, payload);
      return {
        candidate,
        matchPercent: computeCandidateAlertMatch(candidate, payload),
        matchedSkills,
      };
    })
    .filter(({ matchedSkills }) => matchedSkills.length > 0)
    .sort((left, right) => right.matchPercent - left.matchPercent);

  return ranked.map(({ candidate, matchPercent, matchedSkills }) => ({
    userId: candidate.id,
    type: 'new_job_match',
    title: matchPercent >= 85 ? '🔥 High match job alert' : '🎯 New job posted',
    message: `${payload.title} at ${payload.company} matches your skills: ${matchedSkills.slice(0, 3).join(', ')}.${matchedSkills.length > 3 ? ' +' + (matchedSkills.length - 3) + ' more.' : ''}`,
    data: {
      jobId: payload.jobId,
      matchPercent,
      priorityScore: payload.priorityScore || 0,
      matchedSkills,
    },
  }));
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
            await createNotification(
              event.payload.recruiterId,
              'job_update',
              'Job posted successfully',
              `Your job "${event.payload.title}" at ${event.payload.company} is now live.`,
              { jobId: event.payload.jobId, priorityScore: event.payload.priorityScore || 0 }
            );

            for (const notification of await buildJobAlertNotifications(event.payload)) {
              await createNotification(
                notification.userId,
                notification.type,
                notification.title,
                notification.message,
                notification.data
              );
            }
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
