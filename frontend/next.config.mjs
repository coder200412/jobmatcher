function extractAllowedDevOrigin(value) {
  if (!value) return null;

  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

const allowedDevOrigins = Array.from(new Set([
  extractAllowedDevOrigin(process.env.PUBLIC_FRONTEND_URL),
  extractAllowedDevOrigin(process.env.FRONTEND_URL),
  '10.148.50.27',
  'localhost',
].filter(Boolean)));

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3000/api/:path*',
      },
    ];
  },
};

export default nextConfig;
