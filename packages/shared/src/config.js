function stripTrailingSlash(value) {
  return (value || '').replace(/\/+$/, '');
}

function resolvePort(envVarName, fallbackPort) {
  const candidate = process.env.PORT || process.env[envVarName] || fallbackPort;
  const parsed = parseInt(String(candidate), 10);
  return Number.isFinite(parsed) ? parsed : fallbackPort;
}

function resolveServiceUrl(urlEnvName, portEnvName, fallbackPort) {
  if (process.env[urlEnvName]) {
    return stripTrailingSlash(process.env[urlEnvName]);
  }

  return `http://localhost:${process.env[portEnvName] || fallbackPort}`;
}

function isTruthy(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  return !['0', 'false', 'no', 'off', 'disable'].includes(String(value).toLowerCase());
}

function shouldUseSsl(connectionString) {
  if (isTruthy(process.env.POSTGRES_SSL || process.env.PGSSLMODE, false)) {
    return true;
  }

  if (!connectionString) {
    return false;
  }

  try {
    const parsed = new URL(connectionString);
    const sslMode = (parsed.searchParams.get('sslmode') || '').toLowerCase();
    const sslValue = (parsed.searchParams.get('ssl') || '').toLowerCase();
    return ['require', 'verify-ca', 'verify-full', 'prefer'].includes(sslMode) || ['1', 'true'].includes(sslValue);
  } catch {
    return false;
  }
}

function createPgConfig(overrides = {}) {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_INTERNAL_URL ||
    process.env.POSTGRES_EXTERNAL_URL;

  const baseConfig = connectionString
    ? { connectionString }
    : {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
        database: process.env.POSTGRES_DB || 'jobmatch',
        user: process.env.POSTGRES_USER || 'jobmatch',
        password: process.env.POSTGRES_PASSWORD || 'jobmatch_secret_2024',
      };

  if (shouldUseSsl(connectionString)) {
    baseConfig.ssl = { rejectUnauthorized: false };
  }

  return {
    ...baseConfig,
    ...overrides,
  };
}

module.exports = {
  stripTrailingSlash,
  resolvePort,
  resolveServiceUrl,
  createPgConfig,
};
