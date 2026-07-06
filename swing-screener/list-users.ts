import { Pool } from 'pg';

async function listUsers() {
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    user: 'kesha',
    password: '',
  });

  try {
    const res = await pool.query("SELECT usename, usecreatedb, usesuper FROM pg_shadow");
    console.log("Users in Postgres:");
    console.table(res.rows);
  } catch (err: any) {
    console.error("Failed to query users:", err.message);
  } finally {
    await pool.end();
  }
}

listUsers().catch(console.error);
