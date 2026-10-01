import pg from 'pg';
let database;
export async function db() {
  if (database) return database;
  if (process.env.LOCAL_DATABASE && !process.env.VERCEL && process.env.NODE_ENV !== 'production') {
    const { PGlite } = await import('@electric-sql/pglite');
    const local = new PGlite(process.env.LOCAL_DATABASE === ':memory:' ? undefined : process.env.LOCAL_DATABASE);
    database = { query: (...args) => local.query(...args), transaction: fn => local.transaction(tx => fn(tx)), close: () => local.close() };
  } else {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_NOT_CONFIGURED');
    const url = new URL(process.env.DATABASE_URL);
    // Always verify the server certificate; query parameters must not disable TLS.
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
    const pool = new pg.Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: true }, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
    pool.on('error', () => console.error('Database connection unavailable'));
    database = { query: (...args) => pool.query(...args), transaction: async fn => {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const value = await fn(client); await client.query('COMMIT'); return value; }
      catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }, close: () => pool.end() };
  }
  return database;
}
