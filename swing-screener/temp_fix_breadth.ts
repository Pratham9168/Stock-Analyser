/**
 * Fixes missing EMA values for all historical dates by recalculating
 * EMA-20, EMA-50, EMA-200 using the full close history for each stock,
 * then updates ea_market_mood breadth % figures.
 *
 * Run: npx ts-node temp_fix_breadth.ts
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { Pool } from 'pg';
import { EmaCalculator } from './src/services/equialpha/EmaCalculator';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'stock_analysis',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

async function run() {
  // 1. Find dates with missing EMA data
  const missingRes = await pool.query(`
    SELECT date FROM (
      SELECT date, COUNT(*) FILTER (WHERE ema_20 IS NULL) as missing_ema20, COUNT(*) as total
      FROM ea_daily_stocks
      GROUP BY date
    ) t
    WHERE missing_ema20 > total * 0.1  -- more than 10% missing
    ORDER BY date DESC
  `);
  
  const datesWithMissing: string[] = missingRes.rows.map(r =>
    r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date)
  );
  console.log(`[BreadthFix] Dates with missing EMA data: ${datesWithMissing.join(', ')}`);

  if (datesWithMissing.length === 0) {
    console.log('[BreadthFix] All dates have complete EMA data. Nothing to fix.');
    await pool.end();
    return;
  }

  // 2. Get all symbols that need fixing for any of these dates
  const symbolsRes = await pool.query(`
    SELECT DISTINCT symbol FROM ea_daily_stocks
    WHERE date = ANY($1::date[]) AND ema_20 IS NULL
  `, [datesWithMissing]);
  
  const symbols: string[] = symbolsRes.rows.map(r => r.symbol);
  console.log(`[BreadthFix] Symbols needing EMA fix: ${symbols.length}`);

  let fixed = 0, skipped = 0;
  const batchSize = 100;

  for (const symbol of symbols) {
    // Get full close history for this symbol, ordered ascending
    const histRes = await pool.query(`
      SELECT date, close FROM ea_daily_stocks
      WHERE symbol = $1 AND close IS NOT NULL AND close > 0
      ORDER BY date ASC
    `, [symbol]);
    
    if (histRes.rows.length < 20) { skipped++; continue; }

    const closes = histRes.rows.map(r => parseFloat(r.close));
    const dates  = histRes.rows.map(r =>
      r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date)
    );

    // Calculate full EMA series
    const ema20Series  = EmaCalculator.calculate(closes, 20);
    const ema50Series  = EmaCalculator.calculate(closes, 50);
    const ema200Series = EmaCalculator.calculate(closes, 200);

    // For each date that needs fixing, update the row
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i];
      if (!datesWithMissing.includes(d)) continue; // Only fix missing dates

      const ema20  = ema20Series[i];
      const ema50  = ema50Series[i];
      const ema200 = ema200Series[i];
      const close  = closes[i];

      if (ema20 === null && ema50 === null && ema200 === null) continue;

      await pool.query(`
        UPDATE ea_daily_stocks SET
          ema_20  = COALESCE($1, ema_20),
          ema_50  = COALESCE($2, ema_50),
          ema_200 = COALESCE($3, ema_200),
          above_ema_20  = CASE WHEN $1 IS NOT NULL THEN $4 > $1  ELSE above_ema_20 END,
          above_ema_50  = CASE WHEN $2 IS NOT NULL THEN $4 > $2  ELSE above_ema_50 END,
          above_ema_200 = CASE WHEN $3 IS NOT NULL THEN $4 > $3  ELSE above_ema_200 END
        WHERE symbol = $5 AND date = $6
      `, [ema20, ema50, ema200, close, symbol, d]);
    }
    
    fixed++;
    if (fixed % 200 === 0) {
      console.log(`[BreadthFix]   Progress: ${fixed}/${symbols.length} symbols fixed`);
    }
  }

  console.log(`[BreadthFix] Done. Fixed: ${fixed}, Skipped (< 20 bars): ${skipped}`);

  // 3. Recalculate and update market_mood breadth for each affected date
  console.log('\n[BreadthFix] Updating market mood breadth values...');
  for (const date of datesWithMissing) {
    const breadthRes = await pool.query(`
      SELECT
        ROUND(100.0 * COUNT(*) FILTER (WHERE above_ema_20 = true)
              / NULLIF(COUNT(*) FILTER (WHERE above_ema_20 IS NOT NULL), 0), 2) as ema20_pct,
        ROUND(100.0 * COUNT(*) FILTER (WHERE above_ema_50 = true)
              / NULLIF(COUNT(*) FILTER (WHERE above_ema_50 IS NOT NULL), 0), 2) as ema50_pct,
        ROUND(100.0 * COUNT(*) FILTER (WHERE above_ema_200 = true)
              / NULLIF(COUNT(*) FILTER (WHERE above_ema_200 IS NOT NULL), 0), 2) as ema200_pct,
        COUNT(*) FILTER (WHERE pct_change::numeric > 0) as advancing,
        COUNT(*) FILTER (WHERE pct_change::numeric < 0) as declining
      FROM ea_daily_stocks WHERE date = $1
    `, [date]);

    const b = breadthRes.rows[0];
    
    // Only update if this date has mood data
    const updateRes = await pool.query(`
      UPDATE ea_market_mood SET
        above_ema20_pct  = COALESCE($1, above_ema20_pct),
        above_ema50_pct  = COALESCE($2, above_ema50_pct),
        above_ema200_pct = COALESCE($3, above_ema200_pct)
      WHERE date = $4
      RETURNING date, above_ema20_pct, above_ema50_pct, above_ema200_pct
    `, [b.ema20_pct, b.ema50_pct, b.ema200_pct, date]);

    if (updateRes.rows.length > 0) {
      const r = updateRes.rows[0];
      console.log(`[BreadthFix]   ${date}: EMA20=${r.above_ema20_pct}% | EMA50=${r.above_ema50_pct}% | EMA200=${r.above_ema200_pct}%`);
    } else {
      console.log(`[BreadthFix]   ${date}: No mood row found — skipping`);
    }
  }

  // 4. Final verification summary
  console.log('\n[BreadthFix] === FINAL BREADTH VERIFICATION ===');
  const verifyRes = await pool.query(`
    SELECT 
      m.date, m.above_ema20_pct, m.above_ema50_pct, m.above_ema200_pct,
      COUNT(d.*) as total_stocks,
      COUNT(*) FILTER (WHERE d.ema_20 IS NOT NULL) as has_ema20,
      COUNT(*) FILTER (WHERE d.ema_200 IS NOT NULL) as has_ema200
    FROM ea_market_mood m
    JOIN ea_daily_stocks d ON d.date = m.date
    GROUP BY m.date, m.above_ema20_pct, m.above_ema50_pct, m.above_ema200_pct
    ORDER BY m.date DESC
  `);
  
  console.log('\nDate       | EMA20%  | EMA50%  | EMA200% | Stocks | w/EMA20 | w/EMA200');
  console.log('-----------|---------|---------|---------|--------|---------|--------');
  for (const r of verifyRes.rows) {
    const d = r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date);
    console.log(`${d} | ${String(r.above_ema20_pct).padStart(7)} | ${String(r.above_ema50_pct).padStart(7)} | ${String(r.above_ema200_pct).padStart(7)} | ${String(r.total_stocks).padStart(6)} | ${String(r.has_ema20).padStart(7)} | ${String(r.has_ema200).padStart(8)}`);
  }

  await pool.end();
}

run().catch(e => { console.error(e); pool.end(); });
