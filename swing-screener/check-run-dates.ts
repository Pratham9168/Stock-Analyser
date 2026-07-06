import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'stock_analysis',
  user: process.env.DB_USER || 'kesha',
  password: process.env.DB_PASSWORD || '',
});

async function checkRuns() {
  // Query pipeline runs including any dates or logs
  const res = await pool.query(
    "SELECT * FROM ea_pipeline_runs ORDER BY id DESC LIMIT 10"
  );
  console.log("Pipeline Runs Details:");
  console.table(res.rows);

  // Check unique dates in ea_daily_stocks
  const datesRes = await pool.query(
    "SELECT date::text, COUNT(*) as count FROM ea_daily_stocks GROUP BY date ORDER BY date DESC LIMIT 10"
  );
  console.log("\nDaily Stock Counts by Date:");
  console.table(datesRes.rows);

  await pool.end();
}

checkRuns().catch(console.error);
