import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function checkTables() {
  try {
    console.log(`Checking tables in ${process.env.DB_NAME}...`);
    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'ea_%'
      ORDER BY table_name;
    `);
    console.log('Found tables:', res.rows.map(r => r.table_name));
    
    if (res.rows.length > 0) {
       const rows = await pool.query(`SELECT count(*) FROM ea_daily_stocks`);
       console.log('Rows in ea_daily_stocks:', rows.rows[0].count);
    }
  } catch (err) {
    console.error('Check failed:', err);
  } finally {
    await pool.end();
  }
}

checkTables();
