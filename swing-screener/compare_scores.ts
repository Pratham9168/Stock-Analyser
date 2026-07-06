import { Pool } from 'pg';

const pool = new Pool({ user: 'kesha', database: 'stock_analysis', port: 5432 });

async function run() {
  const date = '2026-06-18';
  
  // Mood
  const moodRow = await pool.query(`SELECT * FROM ea_market_mood WHERE date = $1`, [date]);
  console.log("DB Mood Score:", moodRow.rows[0]?.mood_score);
  
  // Sector Performance
  const sectorRow = await pool.query(`SELECT sector, today_pct, week1_pct, month1_pct, month3_pct FROM ea_sector_scores WHERE date = $1 AND sector = 'Financial Services' LIMIT 1`, [date]);
  console.log("DB Sector Performance (Financial Services):", sectorRow.rows[0]);

  // RS Ratings
  console.log("\nChecking RS Ratings...");
  const rsRows = await pool.query(`SELECT COUNT(*) as c FROM ea_rs_history WHERE date = $1 AND rs_rating IS NOT NULL`, [date]);
  console.log("Total RS Ratings:", rsRows.rows[0].c);
  
  await pool.end();
}

run().catch(console.error);
