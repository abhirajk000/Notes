import app from './app';
import pool from './db/pool';

const PORT = parseInt(process.env.PORT ?? '4000', 10);

async function start(): Promise<void> {
  // Verify database connectivity before accepting traffic
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('[DB] Connected to PostgreSQL.');
  } catch (err) {
    console.error('[DB] Failed to connect to PostgreSQL:', err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT} (${process.env.NODE_ENV ?? 'development'})`);
  });
}

start().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
