import { Pool } from 'pg';

/**
 * Single shared connection pool for the entire application.
 * `pg` manages connection lifecycle automatically.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: true }
      : false,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected client error:', err.message);
});

export default pool;
