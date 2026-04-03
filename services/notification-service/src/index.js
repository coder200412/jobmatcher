require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { connectDB } = require('./db');
const { startConsumer } = require('./consumer');
const notificationRoutes = require('./routes/notifications');
const { resolvePort } = require('@jobmatch/shared');

const app = express();
const PORT = resolvePort('NOTIFICATION_SERVICE_PORT', 3004);

app.use(helmet());
app.use(cors());
app.use(morgan('short'));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'notification-service', timestamp: new Date().toISOString() });
});

app.use('/api/notifications', notificationRoutes);

app.use((err, req, res, next) => {
  console.error(`[NOTIFICATION-SERVICE ERROR] ${err.message}`, err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

async function start() {
  try {
    await connectDB();
    console.log('✅ PostgreSQL connected');
    const consumerStarted = await startConsumer();
    if (consumerStarted === false) {
      console.log('⚠️  Kafka consumer retry scheduled');
    }
    app.listen(PORT, () => {
      console.log(`🚀 Notification Service running on port ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start Notification Service:', err);
    process.exit(1);
  }
}

// Prevent unhandled errors from crashing the process
process.on('unhandledRejection', (err) => {
  console.warn('⚠️  Unhandled rejection:', err?.message);
});

start();
