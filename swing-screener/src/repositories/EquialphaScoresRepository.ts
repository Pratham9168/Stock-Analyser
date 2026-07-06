import { Pool } from 'pg';

export class EquialphaScoresRepository {
  constructor(private pool: Pool) {}

  async upsertSectorPerformance(records: any[]) {
      if(records.length === 0) return;
      
      for (let i = 0; i < records.length; i += 100) {
          const batch = records.slice(i, i + 100);
          const values = batch.map((_, idx) => 
              `($${idx * 8 + 1}, $${idx * 8 + 2}, $${idx * 8 + 3}, $${idx * 8 + 4}, $${idx * 8 + 5}, $${idx * 8 + 6}, $${idx * 8 + 7}, $${idx * 8 + 8})`
          ).join(', ');

          const flatArgs = batch.flatMap(r => [
              r.date, r.sector, r.sector_type, r.stocks_count, 
              r.today_pct, r.week1_pct, r.month1_pct, r.month3_pct
          ]);

          await this.pool.query(`
            INSERT INTO ea_sector_performance (
              date, sector, sector_type, stocks_count, 
              today_pct, week1_pct, month1_pct, month3_pct
            ) VALUES ${values}
            ON CONFLICT (date, sector, sector_type) DO UPDATE SET
              stocks_count = EXCLUDED.stocks_count,
              today_pct = EXCLUDED.today_pct,
              week1_pct = EXCLUDED.week1_pct,
              month1_pct = EXCLUDED.month1_pct,
              month3_pct = EXCLUDED.month3_pct
          `, flatArgs);
      }
  }

  async getPreviousMomentum(sector: string, sectorType: string, limit: number = 2): Promise<string> {
      const res = await this.pool.query(`
          SELECT momentum FROM ea_sector_scores
          WHERE sector = $1 AND sector_type = $2
          ORDER BY date DESC LIMIT $3
      `, [sector, sectorType, limit]);

      if (res.rows.length >= 2 && res.rows[1].momentum) {
          return res.rows[1].momentum;
      }
      return 'Dull';
  }

  async upsertSectorScores(records: any[]) {
      if (records.length === 0) return;

      for (let i = 0; i < records.length; i += 100) {
          const batch = records.slice(i, i + 100);
          const values = batch.map((_, idx) => {
              const offset = idx * 18;
              return `($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7}, $${offset+8}, $${offset+9}, $${offset+10}, $${offset+11}, $${offset+12}, $${offset+13}, $${offset+14}, $${offset+15}, $${offset+16}, $${offset+17}, $${offset+18})`;
          }).join(', ');

          const flatArgs = batch.flatMap(r => [
              r.date, r.sector, r.sector_type, r.final_score, r.avg_rs,
              r.rs80_pct, r.near52w_pct, r.momentum, r.prev_momentum,
              r.appearances, r.unique_stocks, r.last7_appearances,
              r.quality_score, r.scan_score, r.accel_score, r.recency_score, r.today_pct,
              r.verdict ?? null
          ]);

          await this.pool.query(`
            INSERT INTO ea_sector_scores (
                date, sector, sector_type, final_score, avg_rs,
                rs80_pct, near52w_pct, momentum, prev_momentum,
                appearances, unique_stocks, last7_appearances,
                quality_score, scan_score, accel_score, recency_score, today_pct,
                verdict
            ) VALUES ${values}
            ON CONFLICT (date, sector, sector_type) DO UPDATE SET
                final_score       = EXCLUDED.final_score,
                avg_rs            = EXCLUDED.avg_rs,
                rs80_pct          = EXCLUDED.rs80_pct,
                near52w_pct       = EXCLUDED.near52w_pct,
                momentum          = EXCLUDED.momentum,
                prev_momentum     = EXCLUDED.prev_momentum,
                appearances       = EXCLUDED.appearances,
                unique_stocks     = EXCLUDED.unique_stocks,
                last7_appearances = EXCLUDED.last7_appearances,
                quality_score     = EXCLUDED.quality_score,
                scan_score        = EXCLUDED.scan_score,
                accel_score       = EXCLUDED.accel_score,
                recency_score     = EXCLUDED.recency_score,
                today_pct         = EXCLUDED.today_pct,
                verdict           = EXCLUDED.verdict
          `, flatArgs);
      }
  }

  async upsertMarketMood(record: any) {
      await this.pool.query(`
        INSERT INTO ea_market_mood (
            date, nifty500_close, nifty500_ema10, nifty500_ema20,
            nifty50_close, nifty50_change_pct, nifty500_change_pct,
            above_ema20_pct, above_ema50_pct, above_ema200_pct,
            sectors_accelerating, sectors_fading, avg_sector_score,
            mood_score, mood_label, ad_ratio, advancing, declining
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (date) DO UPDATE SET
            nifty500_close = EXCLUDED.nifty500_close,
            nifty500_ema10 = EXCLUDED.nifty500_ema10,
            nifty500_ema20 = EXCLUDED.nifty500_ema20,
            nifty50_close = EXCLUDED.nifty50_close,
            nifty50_change_pct = EXCLUDED.nifty50_change_pct,
            nifty500_change_pct = EXCLUDED.nifty500_change_pct,
            above_ema20_pct = EXCLUDED.above_ema20_pct,
            above_ema50_pct = EXCLUDED.above_ema50_pct,
            above_ema200_pct = EXCLUDED.above_ema200_pct,
            sectors_accelerating = EXCLUDED.sectors_accelerating,
            sectors_fading = EXCLUDED.sectors_fading,
            avg_sector_score = EXCLUDED.avg_sector_score,
            mood_score = EXCLUDED.mood_score,
            mood_label = EXCLUDED.mood_label,
            ad_ratio = EXCLUDED.ad_ratio,
            advancing = EXCLUDED.advancing,
            declining = EXCLUDED.declining
      `, [
          record.date, record.nifty500_close, record.nifty500_ema10, record.nifty500_ema20,
          record.nifty50_close, record.nifty50_change_pct, record.nifty500_change_pct,
          record.above_ema20_pct, record.above_ema50_pct, record.above_ema200_pct,
          record.sectors_accelerating, record.sectors_fading, record.avg_sector_score,
          record.mood_score, record.mood_label, record.ad_ratio, record.advancing, record.declining
      ]);
  }

  async upsertBreadthHistory(record: any) {
      await this.pool.query(`
        INSERT INTO ea_breadth_history (
            date, above_ema20_pct, above_ema50_pct, above_ema200_pct, advancing, declining, total
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (date) DO UPDATE SET
            above_ema20_pct = EXCLUDED.above_ema20_pct,
            above_ema50_pct = EXCLUDED.above_ema50_pct,
            above_ema200_pct = EXCLUDED.above_ema200_pct,
            advancing = EXCLUDED.advancing,
            declining = EXCLUDED.declining,
            total = EXCLUDED.total
      `, [record.date, record.above_ema20_pct, record.above_ema50_pct, record.above_ema200_pct, record.advancing, record.declining, record.total]);
  }

  // --- Read queries for the score service engine ---
  async getRawScanHistory(limitDays: number = 45): Promise<any[]> {
    const res = await this.pool.query(`
        SELECT symbol as nsecode, sector, industry, date 
        FROM ea_scan_history 
        WHERE date >= (CURRENT_DATE - $1 * INTERVAL '1 day')
        ORDER BY date DESC
    `, [limitDays]);
    return res.rows;
  }

  /** Get historical Nifty 500 closes from ea_market_mood for EMA computation */
  async getHistoricalNifty500Closes(limit: number = 40): Promise<{ date: string; close: number }[]> {
    const res = await this.pool.query(`
      SELECT date::text as date, close FROM (
        SELECT date, nifty500_close::float as close
        FROM ea_market_mood
        ORDER BY date DESC
        LIMIT $1
      ) sub
      ORDER BY date ASC
    `, [limit]);
    return res.rows;
  }
}
