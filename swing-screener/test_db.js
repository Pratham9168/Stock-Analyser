const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://mcp_full_access_user:root@localhost:5432/stock_analysis' });
async function run() {
  const latestDateRes = await pool.query(`SELECT date FROM ea_daily_stocks ORDER BY date DESC LIMIT 1`);
  const latestDateObj = latestDateRes.rows[0].date;
  const latestDate = latestDateObj.toISOString().split('T')[0];
  console.log('Latest date from ea_daily_stocks:', latestDate);
  const moodRes = await pool.query(`SELECT * FROM ea_market_mood WHERE date = $1`, [latestDate]);
  console.log('Mood rows:', moodRes.rows);
  const scanRes = await pool.query(`SELECT COUNT(*) FROM ea_scan_history WHERE date = $1`, [latestDate]);
  console.log('Scan rows count for date:', scanRes.rows[0].count);
  pool.end();
}
run();
