import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgresql://postgres:Manju%40123@db.xxvyjbopomifkevlibfn.supabase.co:5432/postgres',
});

async function checkSupabase() {
  try {
    console.log(`Checking tables in Supabase...`);
    const res = await pool.query(`
      SELECT count(*) FROM ea_daily_stocks;
    `);
    console.log('Rows in Supabase ea_daily_stocks:', res.rows[0].count);
  } catch (err) {
    console.error('Check failed:', err);
  } finally {
    await pool.end();
  }
}

checkSupabase();
