require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'jobmatch',
  user: process.env.POSTGRES_USER || 'jobmatch',
  password: process.env.POSTGRES_PASSWORD || 'jobmatch_secret_2024',
});

async function initDb() {
  const client = await pool.connect();

  try {
    const sqlPath = path.resolve(__dirname, 'init-db.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('🧱 Initializing database schemas and tables...');
    await client.query(sql);
    console.log('✅ Database initialization complete');
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

initDb();
