const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'jobmatch',
  user: process.env.POSTGRES_USER || 'jobmatch',
  password: process.env.POSTGRES_PASSWORD || 'jobmatch_secret_2024',
  max: 20,
  idleTimeoutMillis: 30000,
});

async function connectDB() {
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
}

function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, connectDB, query };
