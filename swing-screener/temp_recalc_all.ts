import * as dotenv from 'dotenv';
dotenv.config();

import { Pool } from 'pg';
import { EquialphaRepository } from './src/repositories/EquialphaRepository';
import { EquialphaScoresRepository } from './src/repositories/EquialphaScoresRepository';
import { EquialphaScoreService } from './src/services/equialpha/EquialphaScoreService';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'stock_analysis',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

async function recalcForDate(
  date: string,
  repo: EquialphaRepository,
  scoresRepo: EquialphaScoresRepository,
  engine: EquialphaScoreService,
  pool: Pool,
  finalUniverse: any[]
) {
  console.log(`\n[Recalc] ===== Processing ${date} =====`);

  // 1. Build universe map
  const universeMap = new Map<string, any>();
  for (const u of finalUniverse) universeMap.set(u.symbol, u);

  // 2. Get daily stocks for this date
  const allStocksToday = await repo.getAllStocksForDate(date);
  console.log(`[Recalc]   Daily stocks: ${allStocksToday.length}`);

  // 3. Latest RS rating per symbol (most recent available)
  const rsRes = await pool.query(
    `SELECT DISTINCT ON (symbol) symbol, rs_rating FROM ea_rs_history ORDER BY symbol, date DESC`
  );
  const rsMap = new Map<string, number>();
  for (const row of rsRes.rows) rsMap.set(row.symbol, row.rs_rating);
  console.log(`[Recalc]   RS ratings loaded: ${rsMap.size}`);

  // 4. Build score maps
  const rsAccum    = new Map<string, { sum: number; count: number }>();
  const rs80Map    = new Map<string, number>();
  const near52wMap = new Map<string, { near: number; total: number }>();
  const sectorSizeMap = new Map<string, number>();
  const perfAccum  = new Map<string, { sum: number; count: number }>();
  const aboveEma20Map  = new Map<string, number>();
  const ema20CountMap  = new Map<string, number>();

  let mappedCount = 0;
  for (const stock of allStocksToday) {
    const u = universeMap.get(stock.symbol);
    if (!u) continue;
    mappedCount++;

    const rsRating = rsMap.get(stock.symbol) || 0;
    const sector   = u.sector   || 'Others';
    const industry = u.industry || 'Unmapped';

    const groupPairs: [string, string][] = [
      [`sector::${sector}`,   sector],
      [`industry::${industry}`, industry]
    ];

    for (const [key, name] of groupPairs) {
      if (!name) continue;
      sectorSizeMap.set(key, (sectorSizeMap.get(key) || 0) + 1);

      const acc = rsAccum.get(key) || { sum: 0, count: 0 };
      acc.sum += rsRating; acc.count++;
      rsAccum.set(key, acc);

      if (rsRating >= 80) rs80Map.set(key, (rs80Map.get(key) || 0) + 1);

      const n52 = near52wMap.get(key) || { near: 0, total: 0 };
      n52.total++;
      const from52 = typeof stock.from_52w_high === 'string' ? parseFloat(stock.from_52w_high) : stock.from_52w_high;
      if (from52 >= -25) n52.near++;
      near52wMap.set(key, n52);

      const pf = perfAccum.get(key) || { sum: 0, count: 0 };
      const pct = typeof stock.pct_change === 'string' ? parseFloat(stock.pct_change) : (stock.pct_change || 0);
      pf.sum += pct; pf.count++;
      perfAccum.set(key, pf);

      const aboveEma20 = stock.above_ema_20;
      if (aboveEma20 !== null && aboveEma20 !== undefined) {
        ema20CountMap.set(key, (ema20CountMap.get(key) || 0) + 1);
        if (aboveEma20 === true || (aboveEma20 as any) === 't' || (aboveEma20 as any) === 1) {
          aboveEma20Map.set(key, (aboveEma20Map.get(key) || 0) + 1);
        }
      }
    }
  }
  console.log(`[Recalc]   Mapped stocks: ${mappedCount} / ${allStocksToday.length}`);

  const avgRsMap = new Map<string, number>();
  for (const [k, d] of Array.from(rsAccum.entries()))
    avgRsMap.set(k, d.count > 0 ? d.sum / d.count : 0);

  const customPerfMap = new Map<string, any>();
  for (const [k, d] of Array.from(perfAccum.entries()))
    customPerfMap.set(k, { today_pct: d.count > 0 ? d.sum / d.count : 0 });

  // 5. Scan history for OS() algorithm
  const rawScanHistory = await scoresRepo.getRawScanHistory(45);
  const allDatesSet = new Set<string>();
  for (const r of rawScanHistory) {
    const ds = r.date instanceof Date ? new Date(r.date.getTime() - r.date.getTimezoneOffset() * 60000).toISOString().split('T')[0] : String(r.date);
    allDatesSet.add(ds);
  }
  const allDates = Array.from(allDatesSet).sort();
  const normalizedScanData = rawScanHistory.map(r => ({
    ...r,
    date: r.date instanceof Date ? new Date(r.date.getTime() - r.date.getTimezoneOffset() * 60000).toISOString().split('T')[0] : String(r.date)
  }));

  console.log(`[Recalc]   Scan dates window: ${allDates.length} days`);

  // 6. Run engine
  const sectorScores = engine.computeOsScore({
    today: date, allDates, avgRsMap, rs80Map, near52wMap,
    sectorSizeMap, scanData: normalizedScanData, customPerfMap,
    groupBy: 'sector', aboveEma20Map, ema20CountMap
  });

  const parentSectorMomentumMap = new Map<string, string>();
  for (const s of sectorScores)
    for (const u of finalUniverse)
      if (u.sector === s.sector)
        parentSectorMomentumMap.set(u.industry || 'Unmapped', s.momentum);

  const industryScores = engine.computeOsScore({
    today: date, allDates, avgRsMap, rs80Map, near52wMap,
    sectorSizeMap, scanData: normalizedScanData, customPerfMap,
    groupBy: 'industry', aboveEma20Map, ema20CountMap, parentSectorMomentumMap
  });

  // Top 5 sectors for logging
  console.log(`[Recalc]   Top sectors:`);
  sectorScores.slice(0, 5).forEach(s =>
    console.log(`[Recalc]     ${s.sector}: score=${s.final_score} rs=${s.avg_rs} momentum=${s.momentum} unique=${s.unique_stocks}`)
  );

  // 7. Combine + add prev_momentum + save
  const combinedScores: any[] = [
    ...sectorScores.map(s => ({ ...s, date })),
    ...industryScores.map(s => ({ ...s, date }))
  ];
  for (const r of combinedScores)
    r.prev_momentum = await scoresRepo.getPreviousMomentum(r.sector, r.sector_type);

  // Delete existing scores for this date then upsert fresh ones
  await pool.query(`DELETE FROM ea_sector_scores WHERE date = $1`, [date]);
  await scoresRepo.upsertSectorScores(combinedScores);
  console.log(`[Recalc]   Saved ${combinedScores.length} sector/industry scores`);

  // 8. Market Mood
  const moodRow = await pool.query(`SELECT * FROM ea_market_mood WHERE date = $1`, [date]);
  if (moodRow.rows.length > 0) {
    const m = moodRow.rows[0];
    const n500close = parseFloat(m.nifty500_close);
    let ema10 = parseFloat(m.nifty500_ema10);
    let ema20 = parseFloat(m.nifty500_ema20);
    // Fix tied EMAs
    if (Math.abs(ema10 - ema20) < 1 && n500close > 0) {
      ema10 = n500close * 0.995;
      ema20 = n500close * 0.990;
    }

    const breadthRow = {
      ema20_pct:  parseFloat(m.above_ema20_pct),
      ema50_pct:  parseFloat(m.above_ema50_pct),
      ema200_pct: parseFloat(m.above_ema200_pct),
      advancing:  m.advancing,
      declining:  m.declining,
      total:      m.advancing + m.declining
    };

    const sectorsAccel = sectorScores.filter(s => s.momentum === 'Accelerating').length;
    const sectorsFading = sectorScores.filter(s => s.momentum === 'Fading').length;
    const avgScore = sectorScores.length > 0
      ? sectorScores.reduce((a, c) => a + c.final_score, 0) / sectorScores.length : 0;

    const mood = engine.computeMarketMood({
      date,
      breadthRow,
      nifty50:  { close: parseFloat(m.nifty50_close), pctChange: parseFloat(m.nifty50_change_pct) },
      nifty500: { close: n500close, pctChange: parseFloat(m.nifty500_change_pct) },
      nifty500Ema10: ema10,
      nifty500Ema20: ema20,
      sectorsAccel,
      sectorsFading,
      avgScore
    });

    await scoresRepo.upsertMarketMood(mood);
    console.log(`[Recalc]   Market Mood: ${mood.mood_label} (${mood.mood_score}) | accel=${sectorsAccel} fading=${sectorsFading} avgScore=${avgScore.toFixed(1)}`);
  }
}

async function run() {
  const repo       = new EquialphaRepository(pool);
  const scoresRepo = new EquialphaScoresRepository(pool);
  const engine     = new EquialphaScoreService(repo, scoresRepo);

  // Load universe once
  const finalUniverse = await repo.getStockUniverse();
  console.log(`[Recalc] Universe: ${finalUniverse.length} stocks`);

  // Get all dates that have mood data (means they had a real scan)
  const datesRes = await pool.query(
    `SELECT DISTINCT date FROM ea_market_mood ORDER BY date DESC`
  );
  const dates: string[] = datesRes.rows.map(r =>
    r.date instanceof Date ? new Date(r.date.getTime() - r.date.getTimezoneOffset() * 60000).toISOString().split('T')[0] : String(r.date)
  );
  console.log(`[Recalc] Will recalculate ${dates.length} dates: ${dates.join(', ')}`);

  for (const date of dates) {
    await recalcForDate(date, repo, scoresRepo, engine, pool, finalUniverse);
  }

  console.log('\n[Recalc] ✅ All dates recalculated successfully!');
  await pool.end();
}

run().catch(e => { console.error(e); pool.end(); });
