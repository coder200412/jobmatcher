require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const { connectDB } = require('./db');
const { connectKafkaProducer } = require('./kafka');
const { resolvePort } = require('@jobmatch/shared');

const app = express();
const PORT = resolvePort('USER_SERVICE_PORT', 3001);

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('short'));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'user-service', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error(`[USER-SERVICE ERROR] ${err.message}`, err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

async function start() {
  try {
    await connectDB();
    console.log('✅ PostgreSQL connected');
    const kafkaConnected = await connectKafkaProducer();
    if (kafkaConnected) {
      console.log('✅ Kafka producer connected');
    }
    app.listen(PORT, () => {
      console.log(`🚀 User Service running on port ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start User Service:', err);
    process.exit(1);
  }
}

start();
