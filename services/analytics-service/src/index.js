require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { connectDB } = require('./db');
const { startConsumer } = require('./consumer');
const analyticsRoutes = require('./routes/analytics');
const { resolvePort } = require('@jobmatch/shared');

const app = express();
const PORT = resolvePort('ANALYTICS_SERVICE_PORT', 3005);

app.use(helmet());
app.use(cors());
app.use(morgan('short'));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'analytics-service', timestamp: new Date().toISOString() });
});

app.use('/api/analytics', analyticsRoutes);

app.use((err, req, res, next) => {
  console.error(`[ANALYTICS-SERVICE ERROR] ${err.message}`, err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

async function start() {
  try {
    await connectDB();
    console.log('✅ PostgreSQL connected');
    const consumerStarted = await startConsumer();
    if (consumerStarted === true) {
      console.log('✅ Kafka consumer started');
    } else if (consumerStarted === false) {
      console.log('⚠️  Kafka consumer retry scheduled');
    }
    app.listen(PORT, () => {
      console.log(`🚀 Analytics Service running on port ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start Analytics Service:', err);
    process.exit(1);
  }
}

start();
