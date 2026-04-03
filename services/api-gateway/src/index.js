require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { createRateLimiter } = require('./rate-limiter');

const app = express();
const PORT = process.env.API_GATEWAY_PORT || 3000;

function stripTrailingSlash(url) {
  return (url || '').replace(/\/+$/, '');
}

const allowedOrigins = Array.from(new Set([
  'http://localhost:3006',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
  process.env.PUBLIC_FRONTEND_URL,
].filter(Boolean).map(stripTrailingSlash)));

// Middleware
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(stripTrailingSlash(origin))) {
      return callback(null, true);
    }

    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
}));
app.use(morgan('short'));

// Rate limiting
const rateLimiter = createRateLimiter();
app.use('/api', rateLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    upstreamServices: {
      userService: `http://localhost:${process.env.USER_SERVICE_PORT || 3001}`,
      jobService: `http://localhost:${process.env.JOB_SERVICE_PORT || 3002}`,
      recommendationService: `http://localhost:${process.env.RECOMMENDATION_SERVICE_PORT || 3003}`,
      notificationService: `http://localhost:${process.env.NOTIFICATION_SERVICE_PORT || 3004}`,
      analyticsService: `http://localhost:${process.env.ANALYTICS_SERVICE_PORT || 3005}`,
    },
  });
});

// ── Service Proxy Routes ──────────────────────────────

function createServiceProxy(target, basePath) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: (path) => `${basePath}${path === '/' ? '' : path}`,
    on: { error: proxyErrorHandler },
  });
}

// User Service
app.use('/api/auth', createServiceProxy(`http://localhost:${process.env.USER_SERVICE_PORT || 3001}`, '/api/auth'));

app.use('/api/users', createServiceProxy(`http://localhost:${process.env.USER_SERVICE_PORT || 3001}`, '/api/users'));

// Job Service
app.use('/api/jobs', createServiceProxy(`http://localhost:${process.env.JOB_SERVICE_PORT || 3002}`, '/api/jobs'));

app.use('/api/applications', createServiceProxy(`http://localhost:${process.env.JOB_SERVICE_PORT || 3002}`, '/api/applications'));

// Recommendation Service
app.use('/api/recommendations', createServiceProxy(`http://localhost:${process.env.RECOMMENDATION_SERVICE_PORT || 3003}`, '/api/recommendations'));

// Notification Service
app.use('/api/notifications', createServiceProxy(`http://localhost:${process.env.NOTIFICATION_SERVICE_PORT || 3004}`, '/api/notifications'));

// Analytics Service
app.use('/api/analytics', createServiceProxy(`http://localhost:${process.env.ANALYTICS_SERVICE_PORT || 3005}`, '/api/analytics'));

function proxyErrorHandler(err, req, res) {
  console.error(`[GATEWAY] Proxy error: ${err.message}`);
  if (!res.headersSent) {
    res.status(502).json({ error: 'Service unavailable', message: err.message });
  }
}

app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log(`   → Routes proxy to upstream microservices`);
});
