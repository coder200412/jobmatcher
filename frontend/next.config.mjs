function extractAllowedDevOrigin(value) {
  if (!value) return null;

  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function stripTrailingSlash(value) {
  return (value || '').replace(/\/+$/, '');
}

function normalizeApiBase(value) {
  const trimmed = stripTrailingSlash(value);

  if (!trimmed) {
    return 'http://localhost:3000/api';
  }

  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

const allowedDevOrigins = Array.from(new Set([
  extractAllowedDevOrigin(process.env.PUBLIC_FRONTEND_URL),
  extractAllowedDevOrigin(process.env.FRONTEND_URL),
  '10.148.50.27',
  'localhost',
].filter(Boolean)));

const apiDestination = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL || process.env.PUBLIC_API_URL);

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiDestination}/:path*`,
      },
    ];
  },
};

export default nextConfig;
