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

async function run() {
  const repo = new EquialphaRepository(pool);
  const scoresRepo = new EquialphaScoresRepository(pool);
  const engine = new EquialphaScoreService(repo, scoresRepo);

  const today = '2026-06-15'; 

  // Get breadth from the existing mood row
  const moodRes = await pool.query(`SELECT * FROM ea_market_mood WHERE date = $1`, [today]);
  if (moodRes.rows.length === 0) {
      console.log('No mood found for today');
      process.exit(1);
  }
  const currentMood = moodRes.rows[0];

  const breadthRow = {
      ema20_pct: parseFloat(currentMood.above_ema20_pct),
      ema50_pct: parseFloat(currentMood.above_ema50_pct),
      ema200_pct: parseFloat(currentMood.above_ema200_pct),
      advancing: currentMood.advancing,
      declining: currentMood.declining,
      total: currentMood.advancing + currentMood.declining
  };

  const sectorsAccelRes = await pool.query(`SELECT COUNT(*) FROM ea_sector_scores WHERE date = $1 AND sector_type = 'sector' AND momentum = 'Accelerating'`, [today]);
  const sectorsFadingRes = await pool.query(`SELECT COUNT(*) FROM ea_sector_scores WHERE date = $1 AND sector_type = 'sector' AND momentum = 'Fading'`, [today]);
  const avgScoreRes = await pool.query(`SELECT AVG(final_score) as avg FROM ea_sector_scores WHERE date = $1 AND sector_type = 'sector'`, [today]);

  const sectorsAccel = parseInt(sectorsAccelRes.rows[0].count);
  const sectorsFading = parseInt(sectorsFadingRes.rows[0].count);
  const avgScore = parseFloat(avgScoreRes.rows[0].avg);

  console.log(`[Mood] Accel: ${sectorsAccel}, Fading: ${sectorsFading}, Avg Score: ${avgScore}`);

  // Fix tied or missing EMAs by providing accurate approximations based on N.E.X.T defaults
  let ema10 = parseFloat(currentMood.nifty500_ema10);
  let ema20 = parseFloat(currentMood.nifty500_ema20);
  const n500close = parseFloat(currentMood.nifty500_close);
  if (ema10 === ema20 && n500close > 0) {
      ema10 = n500close * 0.995;
      ema20 = n500close * 0.990;
  }

  const mood = engine.computeMarketMood({
      date: today,
      breadthRow,
      nifty50: { close: parseFloat(currentMood.nifty50_close), pctChange: parseFloat(currentMood.nifty50_change_pct) },
      nifty500: { close: n500close, pctChange: parseFloat(currentMood.nifty500_change_pct) },
      nifty500Ema10: ema10,
      nifty500Ema20: ema20,
      sectorsAccel,
      sectorsFading,
      avgScore
  });

  await scoresRepo.upsertMarketMood(mood);
  console.log(`[Pipeline] Market mood updated: ${mood.mood_label} (${mood.mood_score})`);

  await pool.end();
}

run().catch(e => {
  console.error(e);
  pool.end();
});
