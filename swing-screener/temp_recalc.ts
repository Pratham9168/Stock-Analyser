import * as dotenv from 'dotenv';
dotenv.config();

import { Pool } from 'pg';
import { EquialphaRepository } from './src/repositories/EquialphaRepository';
import { EquialphaScoresRepository } from './src/repositories/EquialphaScoresRepository';
import { EquialphaScoreService } from './src/services/equialpha/EquialphaScoreService';
import { getParentSector } from './src/services/equialpha/sectorMapping';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'stock_analysis',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

async function run() {
  const repo = new EquialphaRepository(pool);
  const scoresRepo = new EquialphaScoresRepository(pool);
  const engine = new EquialphaScoreService(repo, scoresRepo);

  const today = '2026-06-15'; // Today's date from the context

  console.log('[Recalc] Fetching DB values...');

  // 1. Fetch Universe
  const finalUniverse = await repo.getStockUniverse();
  const universeMap = new Map<string, typeof finalUniverse[0]>();
  for (const u of finalUniverse) {
    universeMap.set(u.symbol, u);
  }

  // 2. Fetch daily stocks (equivalent to rsToInsert)
  const allStocksToday = await repo.getAllStocksForDate(today);
  console.log(`[Recalc] Loaded ${allStocksToday.length} daily stock records for ${today}`);

  // 3. Build Maps
  const rsMap = new Map<string, number>();
  // To get RS ratings we query ea_rs_history for the latest available date for each symbol
  const rsRes = await pool.query(`SELECT DISTINCT ON (symbol) symbol, rs_rating FROM ea_rs_history ORDER BY symbol, date DESC`);
  for (const row of rsRes.rows) {
    rsMap.set(row.symbol, row.rs_rating);
  }

  const rsAccum = new Map<string, { sum: number; count: number }>();
  const rs80Map = new Map<string, number>();
  const near52wMap = new Map<string, { near: number; total: number }>();
  const sectorSizeMap = new Map<string, number>();
  const perfAccum = new Map<string, { sum: number; count: number }>();
  const aboveEma20Map = new Map<string, number>();  
  const ema20CountMap = new Map<string, number>();   

  for (const stock of allStocksToday) {
    const universeEntry = universeMap.get(stock.symbol);
    if (!universeEntry) continue;

    const rsRating = rsMap.get(stock.symbol) || 0;

      const industry = universeEntry.industry || 'Unmapped';
      const sector = universeEntry.sector || 'Others';
      const groupPairs: [string, string][] = [
        [`sector::${sector}`, sector],
        [`industry::${industry}`, industry]
      ];
    
    for (const [compositeKey, groupName] of groupPairs) {
      if (!groupName) continue;

      sectorSizeMap.set(compositeKey, (sectorSizeMap.get(compositeKey) || 0) + 1);

      const acc = rsAccum.get(compositeKey) || { sum: 0, count: 0 };
      acc.sum += rsRating;
      acc.count++;
      rsAccum.set(compositeKey, acc);

      if (rsRating >= 80) {
        rs80Map.set(compositeKey, (rs80Map.get(compositeKey) || 0) + 1);
      }

      const existing = near52wMap.get(compositeKey) || { near: 0, total: 0 };
      existing.total++;
      if (stock.from_52w_high >= -25) {
        existing.near++;
      }
      near52wMap.set(compositeKey, existing);

      const perfData = perfAccum.get(compositeKey) || { sum: 0, count: 0 };
      perfData.sum += stock.pct_change || 0;
      perfData.count++;
      perfAccum.set(compositeKey, perfData);

      const aboveEma20 = stock.above_ema_20;
      if (aboveEma20 !== null && aboveEma20 !== undefined) {
        ema20CountMap.set(compositeKey, (ema20CountMap.get(compositeKey) || 0) + 1);
        if (aboveEma20 === true) {
          aboveEma20Map.set(compositeKey, (aboveEma20Map.get(compositeKey) || 0) + 1);
        }
      }
    }
  }

  const avgRsMap = new Map<string, number>();
  for (const [key, data] of Array.from(rsAccum.entries())) {
    avgRsMap.set(key, data.count > 0 ? data.sum / data.count : 0);
  }

  const customPerfMap = new Map<string, any>();
  for (const [key, data] of Array.from(perfAccum.entries())) {
    customPerfMap.set(key, {
      today_pct: data.count > 0 ? data.sum / data.count : 0
    });
  }

  // 4. Run OS Engine
  const rawScanHistory = await scoresRepo.getRawScanHistory(45);
  const allDatesSet = new Set<string>();
  for (const r of rawScanHistory) {
    const dateStr = r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date);
    allDatesSet.add(dateStr);
  }
  const allDates = Array.from(allDatesSet).sort();
  const normalizedScanData = rawScanHistory.map(r => ({
    ...r,
    date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date)
  }));

  console.log('[Recalc] Running Score Engine for Sectors...');
  const sectorScores = engine.computeOsScore({
    today: today,
    allDates,
    avgRsMap,
    rs80Map,
    near52wMap,
    sectorSizeMap,
    scanData: normalizedScanData,
    customPerfMap,
    groupBy: 'sector',
    aboveEma20Map,
    ema20CountMap,
  });

  const parentSectorMomentumMap = new Map<string, string>();
  for (const s of sectorScores) {
    for (const u of finalUniverse) {
      if (u.sector === s.sector) {
        parentSectorMomentumMap.set(u.industry || 'Unmapped', s.momentum);
      }
    }
  }

  console.log('[Recalc] Running Score Engine for Industries...');
  const industryScores = engine.computeOsScore({
    today: today,
    allDates,
    avgRsMap,
    rs80Map,
    near52wMap,
    sectorSizeMap,
    scanData: normalizedScanData,
    customPerfMap,
    groupBy: 'industry',
    aboveEma20Map,
    ema20CountMap,
    parentSectorMomentumMap,
  });

  // 5. Save to DB
  const combinedScores: any[] = [
    ...sectorScores.map(s => ({ ...s, date: today })),
    ...industryScores.map(s => ({ ...s, date: today }))
  ];

  for (const r of combinedScores) {
    r.prev_momentum = await scoresRepo.getPreviousMomentum(r.sector, r.sector_type);
  }

  console.log(`[Recalc] Saving ${combinedScores.length} scores to database...`);
  
  // Clear any existing scores for today
  await pool.query(`DELETE FROM ea_sector_scores WHERE date = $1`, [today]);
  
  await scoresRepo.upsertSectorScores(combinedScores);

  console.log('[Recalc] Re-calculation complete!');
  await pool.end();
}

run().catch(e => {
  console.error(e);
  pool.end();
});
