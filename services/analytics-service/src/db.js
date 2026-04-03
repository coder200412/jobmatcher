const { Pool } = require('pg');
const { createPgConfig } = require('@jobmatch/shared');

const pool = new Pool(createPgConfig({
  max: 20,
}));

async function connectDB() {
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
}

function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, connectDB, query };
