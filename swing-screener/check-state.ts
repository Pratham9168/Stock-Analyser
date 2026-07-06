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

async function check() {
  // 1. Pipeline runs
  const runs = await pool.query("SELECT id, status, progress_pct, stocks_processed, total_stocks, started_at::text, current_step FROM ea_pipeline_runs ORDER BY id DESC");
  console.log("=== Pipeline Runs ===");
  console.table(runs.rows);

  // 2. Daily stock dates
  const dates = await pool.query("SELECT date::text as date, COUNT(*) as count FROM ea_daily_stocks GROUP BY date ORDER BY date DESC");
  console.log("\n=== Daily Stock Dates ===");
  console.table(dates.rows);

  // 3. Check yesterday specifically
  const yesterday = await pool.query("SELECT COUNT(*) as count FROM ea_daily_stocks WHERE date = '2026-05-26'");
  console.log(`\nRecords for 2026-05-26 (yesterday): ${yesterday.rows[0].count}`);

  // 4. Check if paused run's symbols exist
  const pausedRun = runs.rows.find((r: any) => r.status === 'paused');
  if (pausedRun) {
    console.log(`\nPaused run #${pausedRun.id}: ${pausedRun.stocks_processed}/${pausedRun.total_stocks} stocks, started ${pausedRun.started_at}`);
    // Check which date the paused run was processing
    const pausedDate = new Date(pausedRun.started_at).toISOString().split('T')[0];
    const pausedDateRecords = await pool.query("SELECT COUNT(*) as count FROM ea_daily_stocks WHERE date = $1", [pausedDate]);
    console.log(`Records for paused run date (${pausedDate}): ${pausedDateRecords.rows[0].count}`);
  }

  // 5. RS history & sector scores & mood
  const rs = await pool.query("SELECT COUNT(*) as count FROM ea_rs_history");
  const scores = await pool.query("SELECT COUNT(*) as count, MAX(date)::text as latest FROM ea_sector_scores");
  const mood = await pool.query("SELECT COUNT(*) as count, MAX(date)::text as latest FROM ea_market_mood");
  const breadth = await pool.query("SELECT COUNT(*) as count, MAX(date)::text as latest FROM ea_breadth_history");
  console.log(`\nRS history: ${rs.rows[0].count}`);
  console.log(`Sector scores: ${scores.rows[0].count} (latest: ${scores.rows[0].latest})`);
  console.log(`Market mood: ${mood.rows[0].count} (latest: ${mood.rows[0].latest})`);
  console.log(`Breadth: ${breadth.rows[0].count} (latest: ${breadth.rows[0].latest})`);

  await pool.end();
}
check().catch(e => { console.error(e); process.exit(1); });
