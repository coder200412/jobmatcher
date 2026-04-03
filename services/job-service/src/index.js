require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const jobRoutes = require('./routes/jobs');
const applicationRoutes = require('./routes/applications');
const { connectDB } = require('./db');
const { connectKafkaProducer } = require('./kafka');
const { initElasticsearch } = require('./elasticsearch');

const app = express();
const PORT = process.env.JOB_SERVICE_PORT || 3002;

app.use(helmet());
app.use(cors());
app.use(morgan('short'));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'job-service', timestamp: new Date().toISOString() });
});

app.use('/api/jobs', jobRoutes);
// Support the job-scoped application URLs used by the frontend, such as /api/jobs/:id/apply.
app.use('/api/jobs', applicationRoutes);
app.use('/api/applications', applicationRoutes);

app.use((err, req, res, next) => {
  console.error(`[JOB-SERVICE ERROR] ${err.message}`, err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

async function start() {
  try {
    await connectDB();
    console.log('✅ PostgreSQL connected');
    await connectKafkaProducer();
    console.log('✅ Kafka producer connected');
    await initElasticsearch();
    console.log('✅ Elasticsearch connected');
    app.listen(PORT, () => {
      console.log(`🚀 Job Service running on port ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start Job Service:', err);
    process.exit(1);
  }
}

start();
