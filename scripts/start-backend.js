const { spawn } = require('child_process');

function valueOrDefault(value, fallback) {
  return String(value || fallback);
}

const servicePorts = {
  gateway: valueOrDefault(process.env.PORT || process.env.API_GATEWAY_PORT, 3000),
  users: valueOrDefault(process.env.USER_SERVICE_PORT, 3001),
  jobs: valueOrDefault(process.env.JOB_SERVICE_PORT, 3002),
  recommendations: valueOrDefault(process.env.RECOMMENDATION_SERVICE_PORT, 3003),
  notifications: valueOrDefault(process.env.NOTIFICATION_SERVICE_PORT, 3004),
  analytics: valueOrDefault(process.env.ANALYTICS_SERVICE_PORT, 3005),
};

const sharedGatewayEnv = {
  USER_SERVICE_PORT: servicePorts.users,
  JOB_SERVICE_PORT: servicePorts.jobs,
  RECOMMENDATION_SERVICE_PORT: servicePorts.recommendations,
  NOTIFICATION_SERVICE_PORT: servicePorts.notifications,
  ANALYTICS_SERVICE_PORT: servicePorts.analytics,
};

const services = [
  {
    name: 'gateway',
    command: ['npm', 'run', 'start', '--workspace=services/api-gateway'],
    env: {
      PORT: servicePorts.gateway,
      API_GATEWAY_PORT: servicePorts.gateway,
      ...sharedGatewayEnv,
    },
  },
  {
    name: 'users',
    command: ['npm', 'run', 'start', '--workspace=services/user-service'],
    env: {
      PORT: servicePorts.users,
      USER_SERVICE_PORT: servicePorts.users,
    },
  },
  {
    name: 'jobs',
    command: ['npm', 'run', 'start', '--workspace=services/job-service'],
    env: {
      PORT: servicePorts.jobs,
      JOB_SERVICE_PORT: servicePorts.jobs,
    },
  },
  {
    name: 'recommendations',
    command: ['npm', 'run', 'start', '--workspace=services/recommendation-service'],
    env: {
      PORT: servicePorts.recommendations,
      RECOMMENDATION_SERVICE_PORT: servicePorts.recommendations,
    },
  },
  {
    name: 'notifications',
    command: ['npm', 'run', 'start', '--workspace=services/notification-service'],
    env: {
      PORT: servicePorts.notifications,
      NOTIFICATION_SERVICE_PORT: servicePorts.notifications,
    },
  },
  {
    name: 'analytics',
    command: ['npm', 'run', 'start', '--workspace=services/analytics-service'],
    env: {
      PORT: servicePorts.analytics,
      ANALYTICS_SERVICE_PORT: servicePorts.analytics,
    },
  },
];

const children = new Map();
let shuttingDown = false;

function stopAll(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children.values()) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => {
    process.exit(exitCode);
  }, 500);
}

for (const service of services) {
  const child = spawn(service.command[0], service.command.slice(1), {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      ...service.env,
    },
  });

  children.set(service.name, child);

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;

    if (signal || code) {
      console.error(`[backend] ${service.name} exited unexpectedly${code !== null ? ` with code ${code}` : ''}${signal ? ` (${signal})` : ''}`);
      stopAll(code || 1);
      return;
    }

    console.log(`[backend] ${service.name} exited cleanly`);
  });

  child.on('error', (error) => {
    console.error(`[backend] Failed to start ${service.name}: ${error.message}`);
    stopAll(1);
  });
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
