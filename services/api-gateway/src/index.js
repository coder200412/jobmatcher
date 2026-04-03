require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { resolvePort, resolveServiceUrl, stripTrailingSlash } = require('@jobmatch/shared');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { createRateLimiter } = require('./rate-limiter');

const app = express();
const PORT = resolvePort('API_GATEWAY_PORT', 3000);
const userServiceUrl = resolveServiceUrl('USER_SERVICE_URL', 'USER_SERVICE_PORT', 3001);
const jobServiceUrl = resolveServiceUrl('JOB_SERVICE_URL', 'JOB_SERVICE_PORT', 3002);
const recommendationServiceUrl = resolveServiceUrl('RECOMMENDATION_SERVICE_URL', 'RECOMMENDATION_SERVICE_PORT', 3003);
const notificationServiceUrl = resolveServiceUrl('NOTIFICATION_SERVICE_URL', 'NOTIFICATION_SERVICE_PORT', 3004);
const analyticsServiceUrl = resolveServiceUrl('ANALYTICS_SERVICE_URL', 'ANALYTICS_SERVICE_PORT', 3005);

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
      userService: userServiceUrl,
      jobService: jobServiceUrl,
      recommendationService: recommendationServiceUrl,
      notificationService: notificationServiceUrl,
      analyticsService: analyticsServiceUrl,
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
app.use('/api/auth', createServiceProxy(userServiceUrl, '/api/auth'));

app.use('/api/users', createServiceProxy(userServiceUrl, '/api/users'));

// Job Service
app.use('/api/jobs', createServiceProxy(jobServiceUrl, '/api/jobs'));

app.use('/api/applications', createServiceProxy(jobServiceUrl, '/api/applications'));

// Recommendation Service
app.use('/api/recommendations', createServiceProxy(recommendationServiceUrl, '/api/recommendations'));

// Notification Service
app.use('/api/notifications', createServiceProxy(notificationServiceUrl, '/api/notifications'));

// Analytics Service
app.use('/api/analytics', createServiceProxy(analyticsServiceUrl, '/api/analytics'));

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
