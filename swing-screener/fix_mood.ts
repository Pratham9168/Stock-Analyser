import { Pool } from 'pg';
import { EquialphaRepository } from './src/repositories/EquialphaRepository';
import { EquialphaScoresRepository } from './src/repositories/EquialphaScoresRepository';
import { EquialphaScoreService } from './src/services/equialpha/EquialphaScoreService';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    const pool = new Pool({
        user: process.env.DB_USER || 'kesha',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'stock_analysis',
        password: process.env.DB_PASSWORD,
        port: parseInt(process.env.DB_PORT || '5432'),
    });

    const repo = new EquialphaRepository(pool);
    const scoreRepo = new EquialphaScoresRepository(pool);
    const engine = new EquialphaScoreService(repo, scoreRepo);

    const today = '2026-06-18';
    
    // 1. Get all stocks today to recalculate breadth
    const stocksRes = await pool.query(`SELECT * FROM ea_daily_stocks WHERE date = $1`, [today]);
    const allStocksToday = stocksRes.rows;
    
    let above20 = 0, above50 = 0, above200 = 0;
    let ema20Count = 0, ema50Count = 0, ema200Count = 0;
    let adv = 0, dec = 0;
    
    for (const d of allStocksToday) {
        if (d.above_ema_20 !== null && d.above_ema_20 !== undefined) { ema20Count++; if (d.above_ema_20) above20++; }
        if (d.above_ema_50 !== null && d.above_ema_50 !== undefined) { ema50Count++; if (d.above_ema_50) above50++; }
        if (d.above_ema_200 !== null && d.above_ema_200 !== undefined) { ema200Count++; if (d.above_ema_200) above200++; }
        const pctChg = typeof d.pct_change === 'string' ? parseFloat(d.pct_change) : d.pct_change;
        if (pctChg > 0) adv++;
        if (pctChg < 0) dec++;
    }

    const total = allStocksToday.length || 1;
    const breadthRow = {
      above_ema20_pct: ema20Count > 0 ? (above20 / ema20Count) * 100 : 0,
      above_ema50_pct: ema50Count > 0 ? (above50 / ema50Count) * 100 : 0,
      above_ema200_pct: ema200Count > 0 ? (above200 / ema200Count) * 100 : 0,
      ema20_count: ema20Count,
      ema50_count: ema50Count,
      ema200_count: ema200Count,
      advancing: adv,
      declining: dec,
      total: allStocksToday.length
    };

    console.log("Calculated Breadth:", breadthRow);
    await scoreRepo.upsertBreadthHistory({ ...breadthRow, date: today });

    // 2. Fetch required inputs for mood
    const sectorsRes = await pool.query(`SELECT sector, momentum, final_score FROM ea_sector_scores WHERE date = $1 AND sector_type = 'sector'`, [today]);
    const validSectorScores = sectorsRes.rows.filter((s: any) => s.sector !== 'Others' && s.sector !== 'Unmapped');
    
    const sectorsAccel = validSectorScores.filter((s: any) => s.momentum === 'Accelerating').length;
    const sectorsFading = validSectorScores.filter((s: any) => s.momentum === 'Fading').length;
    const avgScore = validSectorScores.length > 0
      ? validSectorScores.reduce((acc: number, curr: any) => acc + Number(curr.final_score), 0) / validSectorScores.length
      : 0;

    const moodRes = await pool.query(`SELECT * FROM ea_market_mood WHERE date = $1`, [today]);
    const currentMood = moodRes.rows[0];

    // Recompute Nifty500 EMAs (with new threshold logic)
    let n500_close = currentMood.nifty500_close;
    let nifty500Ema10 = 0, nifty500Ema20 = 0;
    const EmaCalculator = require('./src/services/equialpha/EmaCalculator').EmaCalculator;
    
    const histRes = await scoreRepo.getHistoricalNifty500Closes(20);
    const closes = histRes.filter(r => r.date !== today).map(r => r.close);
    if (n500_close > 0) closes.push(n500_close);
    
    if (closes.length >= 2) {
        const ema10Series = EmaCalculator.calculate(closes, Math.min(10, closes.length));
        const ema20Series = EmaCalculator.calculate(closes, Math.min(20, closes.length));
        nifty500Ema10 = ema10Series.filter((v: any) => v !== null).pop() || n500_close * 0.995;
        nifty500Ema20 = ema20Series.filter((v: any) => v !== null).pop() || n500_close * 0.990;
    } else {
        nifty500Ema10 = n500_close > 0 ? n500_close * 0.995 : 0;
        nifty500Ema20 = n500_close > 0 ? n500_close * 0.990 : 0;
    }

    if (Math.abs(nifty500Ema10 - nifty500Ema20) < 0.01 && n500_close > 0) {
        nifty500Ema10 = n500_close * 0.995;
        nifty500Ema20 = n500_close * 0.990;
    }

    const mood = engine.computeMarketMood({
      date: today,
      breadthRow,
      nifty50: { close: currentMood.nifty50_close, pctChange: currentMood.nifty50_change_pct },
      nifty500: { close: n500_close, pctChange: currentMood.nifty500_change_pct },
      nifty500Ema10: nifty500Ema10,
      nifty500Ema20: nifty500Ema20,
      sectorsAccel,
      sectorsFading,
      avgScore
    });

    console.log("Calculated Mood:", mood);
    await scoreRepo.upsertMarketMood(mood);
    
    await pool.end();
}

run().catch(console.error);
