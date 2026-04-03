const path = require('path');
const { spawn } = require('child_process');

function valueOrDefault(value, fallback) {
  return String(value || fallback);
}

function resolveServiceDir(...segments) {
  return path.resolve(__dirname, '..', ...segments);
}

function prefixAndWrite(stream, prefix, chunk) {
  const text = chunk.toString();
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const isLastEmpty = index === lines.length - 1 && line === '';

    if (!isLastEmpty) {
      stream.write(`[${prefix}] ${line}\n`);
    }
  }
}

function runNodeScript({ name, cwd, scriptPath, env = {}, tolerateFailure = false }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd,
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => prefixAndWrite(process.stdout, name, chunk));
    child.stderr.on('data', (chunk) => prefixAndWrite(process.stderr, name, chunk));

    child.on('error', (error) => {
      reject(new Error(`${name} failed to start: ${error.message}`));
    });

    child.on('exit', (code, signal) => {
      if (!code) {
        resolve(null);
        return;
      }

      const detail = `${name} exited${code !== null ? ` with code ${code}` : ''}${signal ? ` (${signal})` : ''}`;

      if (tolerateFailure) {
        console.warn(`[backend] ${detail}`);
        resolve(null);
        return;
      }

      reject(new Error(detail));
    });
  });
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
    cwd: resolveServiceDir('services', 'api-gateway'),
    scriptPath: path.join('src', 'index.js'),
    env: {
      PORT: servicePorts.gateway,
      API_GATEWAY_PORT: servicePorts.gateway,
      ...sharedGatewayEnv,
    },
  },
  {
    name: 'users',
    cwd: resolveServiceDir('services', 'user-service'),
    scriptPath: path.join('src', 'index.js'),
    env: {
      PORT: servicePorts.users,
      USER_SERVICE_PORT: servicePorts.users,
    },
  },
  {
    name: 'jobs',
    cwd: resolveServiceDir('services', 'job-service'),
    scriptPath: path.join('src', 'index.js'),
    env: {
      PORT: servicePorts.jobs,
      JOB_SERVICE_PORT: servicePorts.jobs,
    },
  },
  {
    name: 'recommendations',
    cwd: resolveServiceDir('services', 'recommendation-service'),
    scriptPath: path.join('src', 'index.js'),
    env: {
      PORT: servicePorts.recommendations,
      RECOMMENDATION_SERVICE_PORT: servicePorts.recommendations,
    },
  },
  {
    name: 'notifications',
    cwd: resolveServiceDir('services', 'notification-service'),
    scriptPath: path.join('src', 'index.js'),
    env: {
      PORT: servicePorts.notifications,
      NOTIFICATION_SERVICE_PORT: servicePorts.notifications,
    },
  },
  {
    name: 'analytics',
    cwd: resolveServiceDir('services', 'analytics-service'),
    scriptPath: path.join('src', 'index.js'),
    env: {
      PORT: servicePorts.analytics,
      ANALYTICS_SERVICE_PORT: servicePorts.analytics,
    },
  },
];

const children = new Map();
let shuttingDown = false;

function spawnService(service) {
  const child = spawn(process.execPath, [service.scriptPath], {
    cwd: service.cwd,
    env: {
      ...process.env,
      ...service.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => prefixAndWrite(process.stdout, service.name, chunk));
  child.stderr.on('data', (chunk) => prefixAndWrite(process.stderr, service.name, chunk));

  child.on('error', (error) => {
    console.error(`[backend] Failed to start ${service.name}: ${error.message}`);
    stopAll(1);
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;

    if (signal || code) {
      console.error(`[backend] ${service.name} exited unexpectedly${code !== null ? ` with code ${code}` : ''}${signal ? ` (${signal})` : ''}`);
      stopAll(code || 1);
      return;
    }

    console.log(`[backend] ${service.name} exited cleanly`);
    stopAll(0);
  });

  children.set(service.name, child);
}

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

async function main() {
  try {
    await runNodeScript({
      name: 'db:init',
      cwd: resolveServiceDir(),
      scriptPath: path.resolve(__dirname, 'init-db.js'),
    });

    for (const service of services) {
      spawnService(service);
    }
  } catch (error) {
    console.error(`[backend] ${error.message}`);
    process.exit(1);
  }
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

main();
