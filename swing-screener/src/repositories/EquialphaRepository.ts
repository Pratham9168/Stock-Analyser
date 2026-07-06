import { Pool } from 'pg';

export interface EquialphaStock {
  symbol: string;
  company_name: string | null;
  sector: string | null;
  industry: string | null;
}

export interface EquialphaDailyStock {
  symbol: string;
  date: string;
  close: number;
  pct_change: number;
  high_52w: number;
  low_52w: number;
  from_52w_high: number;
  new_52w_high: boolean;
  new_52w_low: boolean;
  ema_10?: number | null;
  ema_20: number | null;
  ema_50: number | null;
  ema_200: number | null;
  above_ema_10?: boolean | null;
  above_ema_20: boolean | null;
  above_ema_50: boolean | null;
  above_ema_200: boolean | null;
  volume: number;
}

export class EquialphaRepository {
  constructor(private pool: Pool) {}

  // ==========================================
  // UNIVERSE & OVERRIDES
  // ==========================================

  async upsertStockUniverse(stocks: EquialphaStock[]): Promise<void> {
    if (stocks.length === 0) return;

    // Batch in chunks of 200 to avoid huge query strings
    for (let i = 0; i < stocks.length; i += 200) {
      const batch = stocks.slice(i, i + 200);
      
      const values = batch.map((_, idx) => 
        `($${idx * 4 + 1}, $${idx * 4 + 2}, $${idx * 4 + 3}, $${idx * 4 + 4})`
      ).join(', ');

      const flatArgs = batch.flatMap(s => [s.symbol, s.company_name, s.sector, s.industry]);

      const query = `
        INSERT INTO ea_stock_universe (symbol, company_name, sector, industry)
        VALUES ${values}
        ON CONFLICT (symbol) DO UPDATE SET 
          company_name = CASE
            WHEN EXCLUDED.company_name IS NULL OR EXCLUDED.company_name = '' THEN ea_stock_universe.company_name
            ELSE EXCLUDED.company_name
          END,
          sector = CASE 
            WHEN EXCLUDED.sector IN ('Others', 'Unmapped', '') THEN ea_stock_universe.sector
            ELSE EXCLUDED.sector
          END,
          industry = CASE 
            WHEN EXCLUDED.industry IN ('Unmapped', '') THEN ea_stock_universe.industry
            ELSE EXCLUDED.industry
          END,
          updated_at = NOW()
      `;
      
      await this.pool.query(query, flatArgs);
    }
  }

  async getStockUniverse(): Promise<EquialphaStock[]> {
    const res = await this.pool.query(`
      SELECT symbol, company_name, sector, industry 
      FROM ea_stock_universe 
      WHERE is_active = TRUE
    `);
    return res.rows;
  }

  async getStockOverrides(): Promise<Record<string, { sector?: string, industry?: string }>> {
    const res = await this.pool.query(`SELECT symbol, sector_override, industry_override FROM ea_stock_overrides`);
    const overrides: Record<string, { sector?: string, industry?: string }> = {};
    for (const row of res.rows) {
      overrides[row.symbol] = {
        sector: row.sector_override,
        industry: row.industry_override
      };
    }
    return overrides;
  }

  // ==========================================
  // DAILY QUOTES & EMA
  // ==========================================

  async upsertDailyStocks(stocks: EquialphaDailyStock[]): Promise<void> {
    if (stocks.length === 0) return;

    // Process in batches of 100 to avoid huge query strings and parameter limits
    for (let i = 0; i < stocks.length; i += 100) {
        const batch = stocks.slice(i, i + 100);

        // 18 columns per row (added ema_10, above_ema_10)
        const values = batch.map((_, i) => {
            const offset = i * 18;
            return `($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7}, $${offset+8}, $${offset+9}, $${offset+10}, $${offset+11}, $${offset+12}, $${offset+13}, $${offset+14}, $${offset+15}, $${offset+16}, $${offset+17}, $${offset+18})`;
        }).join(', ');

        const flatArgs = batch.flatMap(s => [
          s.symbol, s.date, s.close, s.pct_change, s.high_52w, s.low_52w,
          s.from_52w_high, s.new_52w_high, s.new_52w_low,
          s.ema_10 ?? null, s.ema_20, s.ema_50, s.ema_200,
          s.above_ema_10 ?? null, s.above_ema_20, s.above_ema_50, s.above_ema_200,
          s.volume
        ]);

        const query = `
          INSERT INTO ea_daily_stocks (
            symbol, date, close, pct_change, high_52w, low_52w, from_52w_high,
            new_52w_high, new_52w_low,
            ema_10, ema_20, ema_50, ema_200,
            above_ema_10, above_ema_20, above_ema_50, above_ema_200,
            volume
          )
          VALUES ${values}
          ON CONFLICT (symbol, date) DO UPDATE SET
            close          = EXCLUDED.close,
            pct_change     = EXCLUDED.pct_change,
            high_52w       = EXCLUDED.high_52w,
            low_52w        = EXCLUDED.low_52w,
            from_52w_high  = EXCLUDED.from_52w_high,
            new_52w_high   = EXCLUDED.new_52w_high,
            new_52w_low    = EXCLUDED.new_52w_low,
            ema_10         = EXCLUDED.ema_10,
            ema_20         = EXCLUDED.ema_20,
            ema_50         = EXCLUDED.ema_50,
            ema_200        = EXCLUDED.ema_200,
            above_ema_10   = EXCLUDED.above_ema_10,
            above_ema_20   = EXCLUDED.above_ema_20,
            above_ema_50   = EXCLUDED.above_ema_50,
            above_ema_200  = EXCLUDED.above_ema_200,
            volume         = EXCLUDED.volume
        `;

        await this.pool.query(query, flatArgs);
    }
  }

  async updateStockIndustry(symbol: string, industry: string, sector: string): Promise<void> {
    await this.pool.query(
      `UPDATE ea_stock_universe SET industry = $1, sector = $2, updated_at = NOW() WHERE symbol = $3`,
      [industry, sector, symbol]
    );
  }

  async getClosesForEma(symbol: string, limit: number = 220): Promise<{ date: string, close: number }[]> {
    const res = await this.pool.query(`
      SELECT date, close FROM (
        SELECT date, close FROM ea_daily_stocks 
        WHERE symbol = $1 ORDER BY date DESC LIMIT $2
      ) sub ORDER BY date ASC
    `, [symbol, limit]);
    return res.rows.map(r => ({ date: r.date.toISOString().split('T')[0], close: parseFloat(r.close) }));
  }

  async getLatestDate(): Promise<string | null> {
    const res = await this.pool.query(`
      SELECT date::text as date_str FROM ea_market_mood ORDER BY date DESC LIMIT 1
    `);
    return res.rows.length > 0 ? res.rows[0].date_str : null;
  }

  // ==========================================
  // RS RATINGS
  // ==========================================

  async upsertRsRatings(ratings: { symbol: string, date: string, rs_rating: number, rs_delta: number | null }[]): Promise<void> {
    if (ratings.length === 0) return;

    for (let i = 0; i < ratings.length; i += 50) {
      const batch = ratings.slice(i, i + 50);
      const values = batch.map((_, i) => `($${i*4+1}, $${i*4+2}, $${i*4+3}, $${i*4+4})`).join(', ');
      const flatArgs = batch.flatMap(r => [r.symbol, r.date, r.rs_rating, r.rs_delta]);
      
      await this.pool.query(`
        INSERT INTO ea_rs_history (symbol, date, rs_rating, rs_delta)
        VALUES ${values}
        ON CONFLICT (symbol, date) DO UPDATE SET 
          rs_rating = EXCLUDED.rs_rating,
          rs_delta = EXCLUDED.rs_delta
      `, flatArgs);
    }
  }

  async getPreviousRsRating(symbol: string, limit: number = 2): Promise<number | null> {
    const res = await this.pool.query(`
      SELECT rs_rating FROM ea_rs_history 
      WHERE symbol = $1 ORDER BY date DESC LIMIT $2
    `, [symbol, limit]);
    
    // We want the 2nd most recent if we are calculating delta
    if (res.rows.length >= 2) {
      return parseInt(res.rows[1].rs_rating);
    }
    return null;
  }

  async getClosesForDates(symbol: string, dates: string[]): Promise<Record<string, number>> {
      if (dates.length === 0) return {};
      const params = dates.map((_, j) => `$${j + 2}`).join(',');
      const res = await this.pool.query(`
        SELECT date, close FROM ea_daily_stocks 
        WHERE symbol = $1 AND date IN (${params})
      `, [symbol, ...dates]);
      
      const result: Record<string, number> = {};
      res.rows.forEach(r => result[r.date.toISOString().split('T')[0]] = parseFloat(r.close));
      return result;
  }

  // ==========================================
  // PIPELINE TRACKING
  // ==========================================
  
  async createPipelineRun(): Promise<number> {
    const res = await this.pool.query(`
      INSERT INTO ea_pipeline_runs (status, progress_pct) VALUES ('running', 0) RETURNING id
    `);
    return res.rows[0].id;
  }

  async getPipelineStatus(id: number): Promise<string> {
    const res = await this.pool.query(`SELECT status FROM ea_pipeline_runs WHERE id = $1`, [id]);
    return res.rows.length > 0 ? res.rows[0].status : 'unknown';
  }

  async pausePipelineRun(id: number) {
    await this.pool.query(`
      UPDATE ea_pipeline_runs SET 
        status = 'paused',
        completed_at = NOW()
      WHERE id = $1 AND status = 'running'
    `, [id]);
  }

  async updatePipelineProgress(id: number, pct: number, step: string, processed?: number, total?: number) {
    const fields = ['progress_pct = $1', 'current_step = $2'];
    const args: any[] = [pct, step];

    if (processed !== undefined) {
      args.push(processed);
      fields.push(`stocks_processed = $${args.length}`);
    }
    if (total !== undefined) {
      args.push(total);
      fields.push(`total_stocks = $${args.length}`);
    }

    args.push(id);
    const query = `
      UPDATE ea_pipeline_runs SET 
        ${fields.join(', ')}
      WHERE id = $${args.length}
    `;
    await this.pool.query(query, args);
  }

  async completePipelineRun(id: number) {
    await this.pool.query(`
      UPDATE ea_pipeline_runs SET 
        status = 'completed', 
        progress_pct = 100, 
        completed_at = NOW(),
        duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))
      WHERE id = $1
    `, [id]);
  }

  async failPipelineRun(id: number, errorMsg: string) {
    await this.pool.query(`
      UPDATE ea_pipeline_runs SET 
        status = 'failed', 
        error_message = $1,
        completed_at = NOW()
      WHERE id = $2
    `, [errorMsg, id]);
  }

  // ==========================================
  // SCANS
  // ==========================================
  async saveScanResults(date: string, results: { symbol: string, sector: string | null, industry: string | null, type: string }[]) {
     if (results.length === 0) return;

     for (let i = 0; i < results.length; i += 100) {
         const batch = results.slice(i, i + 100);
         const values = batch.map((_, idx) => 
             `($${idx * 5 + 1}, $${idx * 5 + 2}, $${idx * 5 + 3}, $${idx * 5 + 4}, $${idx * 5 + 5})`
         ).join(', ');

         const flatArgs = batch.flatMap(r => [r.symbol, date, r.sector, r.industry, r.type]);

         await this.pool.query(`
            INSERT INTO ea_scan_history (symbol, date, sector, industry, scan_type)
            VALUES ${values}
            ON CONFLICT DO NOTHING
         `, flatArgs);
     }
  }

  async recordUnmappedStock(symbol: string, date: string) {
      await this.pool.query(`
          INSERT INTO ea_unmapped_stocks (symbol, first_seen, scan_count)
          VALUES ($1, $2, 1)
          ON CONFLICT(symbol) DO UPDATE SET scan_count = ea_unmapped_stocks.scan_count + 1
      `, [symbol, date]);
  }

  // ==========================================
  // CLEANUP & QUERY HELPERS
  // ==========================================

  /** Auto-fail any orphaned 'running' pipelines (from crashes/restarts) */
  async cleanupOrphanedRuns(): Promise<number> {
    const res = await this.pool.query(`
      UPDATE ea_pipeline_runs 
      SET status = 'failed', 
          error_message = 'Auto-cleaned: process crashed before completion',
          completed_at = NOW()
      WHERE status = 'running' AND completed_at IS NULL
    `);
    return res.rowCount || 0;
  }

  /** Get all symbols that have been processed for a given date */
  async getAllSymbolsForDate(date: string): Promise<string[]> {
    const res = await this.pool.query(
      `SELECT symbol FROM ea_daily_stocks WHERE date = $1`, [date]
    );
    return res.rows.map((r: any) => r.symbol);
  }

  async getAllStocksForDate(date: string): Promise<Array<{
    symbol: string; close: number; pct_change: number;
    above_ema_10: boolean | null; above_ema_20: boolean | null; above_ema_50: boolean | null; above_ema_200: boolean | null;
    from_52w_high: number;
  }>> {
    const res = await this.pool.query(`
      SELECT symbol, 
             close::float as close, 
             pct_change::float as pct_change, 
             above_ema_10, above_ema_20, above_ema_50, above_ema_200, 
             from_52w_high::float as from_52w_high
      FROM ea_daily_stocks WHERE date = $1
    `, [date]);
    return res.rows;
  }

  // ==========================================
  // ANALYTICS & DETAILS (PHASE 1)
  // ==========================================

  /** Get detailed information for a single stock */
  async getStockDetails(symbol: string, date: string): Promise<any> {
    const res = await this.pool.query(`
      SELECT 
        u.symbol, u.company_name, u.sector, u.industry,
        d.close, d.pct_change, d.high_52w, d.low_52w, d.from_52w_high, d.volume,
        d.ema_10, d.ema_20, d.ema_50, d.ema_200,
        d.above_ema_10, d.above_ema_20, d.above_ema_50, d.above_ema_200,
        r.rs_rating, r.rs_delta,
        ss.final_score as sector_final_score,
        ss.momentum as sector_momentum,
        ss.avg_rs as sector_avg_rs,
        ss.rs80_pct as sector_rs80_pct,
        (SELECT COUNT(*) FROM ea_scan_history s WHERE s.symbol = u.symbol AND s.date = $2) as in_scan_today,
        (SELECT COUNT(*) FROM ea_scan_history s WHERE s.symbol = u.symbol AND s.date >= $2::date - interval '7 days') as scan_count_week,
        (SELECT json_agg(s.date) FROM (SELECT date FROM ea_scan_history WHERE symbol = u.symbol AND date >= $2::date - interval '30 days' ORDER BY date DESC LIMIT 20) s) as scan_history_dates,
        (SELECT close FROM ea_daily_stocks WHERE symbol = u.symbol AND date <= $2::date - interval '7 days' ORDER BY date DESC LIMIT 1) as close_1w_ago,
        (SELECT close FROM ea_daily_stocks WHERE symbol = u.symbol AND date <= $2::date - interval '1 month' ORDER BY date DESC LIMIT 1) as close_1m_ago,
        (SELECT close FROM ea_daily_stocks WHERE symbol = u.symbol AND date <= $2::date - interval '3 months' ORDER BY date DESC LIMIT 1) as close_3m_ago,
        (SELECT close FROM ea_daily_stocks WHERE symbol = u.symbol AND date <= $2::date - interval '6 months' ORDER BY date DESC LIMIT 1) as close_6m_ago
      FROM ea_stock_universe u
      LEFT JOIN ea_daily_stocks d ON u.symbol = d.symbol AND d.date = $2
      LEFT JOIN ea_rs_history r ON u.symbol = r.symbol AND r.date = $2
      LEFT JOIN ea_sector_scores ss ON u.sector = ss.sector AND ss.date = $2
      WHERE u.symbol = $1
    `, [symbol.toUpperCase(), date]);
    return res.rows[0] || null;
  }

  /** Get all stocks within a specific industry with their performance metrics */
  async getSectorDetails(industry: string, date: string): Promise<any[]> {
    const res = await this.pool.query(`
      SELECT 
        u.symbol, u.company_name, u.industry, u.sector,
        d.close::float as close, d.pct_change::float as pct_change,
        d.ema_20::float as ema_20, d.ema_50::float as ema_50, d.ema_200::float as ema_200,
        d.above_ema_20, d.above_ema_50, d.above_ema_200,
        d.high_52w::float as high_52w, d.from_52w_high::float as from_52w_high,
        r.rs_rating::float as rs_rating, r.rs_delta::float as rs_delta,
        (SELECT count(*)::int FROM ea_scan_history s WHERE s.symbol = u.symbol AND s.date >= $2::date - INTERVAL '20 days') as scan_count,
        (SELECT close FROM ea_daily_stocks WHERE symbol = u.symbol AND date <= $2::date - interval '7 days' ORDER BY date DESC LIMIT 1) as close_1w_ago,
        (SELECT close FROM ea_daily_stocks WHERE symbol = u.symbol AND date <= $2::date - interval '1 month' ORDER BY date DESC LIMIT 1) as close_1m_ago,
        (SELECT close FROM ea_daily_stocks WHERE symbol = u.symbol AND date <= $2::date - interval '3 months' ORDER BY date DESC LIMIT 1) as close_3m_ago
      FROM ea_stock_universe u
      LEFT JOIN ea_daily_stocks d ON u.symbol = d.symbol AND d.date = $2
      LEFT JOIN ea_rs_history r ON u.symbol = r.symbol AND r.date = $2
      WHERE u.industry = $1 OR u.sector = $1
      ORDER BY r.rs_rating DESC NULLS LAST
    `, [industry, date]);
    return res.rows;
  }

  /** Get historical scores and avg RS for a specific sector */
  async getSingleSectorHistory(sectorName: string): Promise<any[]> {
    const res = await this.pool.query(`
      SELECT to_char(date, 'YYYY-MM-DD') as date, final_score, avg_rs 
      FROM ea_sector_scores 
      WHERE sector = $1
      ORDER BY date DESC
      LIMIT 60
    `, [sectorName]);
    return res.rows.reverse();
  }

  /** Get the RS rating and daily performance for the entire universe (used for Scatter Chart) */
  async getAllRsRatings(date: string): Promise<any[]> {
    const res = await this.pool.query(`
      SELECT 
        u.symbol, u.sector, u.industry,
        d.pct_change::float as pct_change, d.close::float as close,
        d.above_ema_20, d.above_ema_50, d.above_ema_200,
        r.rs_rating::float as rs_rating, r.rs_delta::float as rs_delta
      FROM ea_stock_universe u
      INNER JOIN ea_daily_stocks d ON u.symbol = d.symbol AND d.date = $1
      INNER JOIN ea_rs_history r ON u.symbol = r.symbol AND r.date = $1
      WHERE r.rs_rating IS NOT NULL
    `, [date]);
    return res.rows;
  }

  // =========================================================================
  // TRADE JOURNAL & CAPITAL
  // =========================================================================

  async getTrades(status?: string): Promise<any[]> {
    let query = `
      SELECT t.*, 
        (SELECT json_agg(a.*) FROM ea_trade_additions a WHERE a.trade_id = t.id) as additions,
        (SELECT json_agg(e.*) FROM ea_trade_exits e WHERE e.trade_id = t.id) as exits
      FROM ea_trade_journal t
    `;
    const params: any[] = [];
    if (status) {
      query += ` WHERE t.status = $1`;
      params.push(status);
    }
    query += ` ORDER BY t.created_at DESC`;
    const res = await this.pool.query(query, params);
    return res.rows;
  }

  async createTrade(data: { symbol: string; entry_date: string; entry_price: number; quantity: number; stop_loss?: number; notes?: string; status?: string }): Promise<any> {
    const res = await this.pool.query(`
      INSERT INTO ea_trade_journal (symbol, entry_date, entry_price, quantity, stop_loss, notes, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [data.symbol, data.entry_date, data.entry_price, data.quantity, data.stop_loss, data.notes, data.status || 'open']);
    return res.rows[0];
  }

  async updateTrade(id: number, data: Partial<{ symbol: string; entry_date: string; entry_price: number; quantity: number; stop_loss: number; notes: string; status: string }>): Promise<any> {
    const updates: string[] = [];
    const values: any[] = [];
    let i = 1;
    const allowedKeys = ['symbol', 'entry_date', 'entry_price', 'quantity', 'stop_loss', 'notes', 'status'];
    for (const [key, value] of Object.entries(data)) {
      if (allowedKeys.includes(key)) {
        updates.push(`${key} = $${i}`);
        values.push(value);
        i++;
      }
    }
    if (updates.length === 0) {
      throw new Error("No valid fields to update");
    }
    values.push(id);
    const res = await this.pool.query(`
      UPDATE ea_trade_journal SET ${updates.join(', ')}
      WHERE id = $${i} RETURNING *
    `, values);
    return res.rows[0];
  }

  async deleteTrade(id: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM ea_trade_additions WHERE trade_id = $1`, [id]);
      await client.query(`DELETE FROM ea_trade_exits WHERE trade_id = $1`, [id]);
      await client.query(`DELETE FROM ea_trade_journal WHERE id = $1`, [id]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async addTradeAddition(tradeId: number, data: { date: string; price: number; quantity: number }): Promise<any> {
    const res = await this.pool.query(`
      INSERT INTO ea_trade_additions (trade_id, date, price, quantity)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [tradeId, data.date, data.price, data.quantity]);
    return res.rows[0];
  }

  async addTradeExit(tradeId: number, data: { date: string; price: number; quantity: number }): Promise<any> {
    const res = await this.pool.query(`
      INSERT INTO ea_trade_exits (trade_id, date, price, quantity)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [tradeId, data.date, data.price, data.quantity]);
    return res.rows[0];
  }

  async getCapital(): Promise<any> {
    const res = await this.pool.query(`SELECT amount FROM ea_user_capital ORDER BY id DESC LIMIT 1`);
    return res.rows[0] || { amount: 0 };
  }

  async updateCapital(amount: number): Promise<any> {
    await this.pool.query('DELETE FROM ea_user_capital');
    const res = await this.pool.query(`
      INSERT INTO ea_user_capital (amount) VALUES ($1) RETURNING *
    `, [amount]);
    return res.rows[0];
  }

  // =========================================================================
  // SETUPS DATABASE
  // =========================================================================

  async getSetups(): Promise<any[]> {
    const res = await this.pool.query(`SELECT * FROM ea_setups ORDER BY date DESC, created_at DESC`);
    return res.rows;
  }

  async createSetup(data: { symbol: string; date: string; month: string; logic?: string; chart_url?: string }): Promise<any> {
    const res = await this.pool.query(`
      INSERT INTO ea_setups (symbol, date, month, logic, chart_url)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [data.symbol, data.date, data.month, data.logic, data.chart_url]);
    return res.rows[0];
  }

  async deleteSetup(id: number): Promise<void> {
    await this.pool.query(`DELETE FROM ea_setups WHERE id = $1`, [id]);
  }

  // =========================================================================
  // MARKET STATS (52W HIGHS/LOWS & TOP MOVERS)
  // =========================================================================

  async getMarketStats(date: string): Promise<any> {
    const [highsRes, lowsRes, gainersRes, losersRes] = await Promise.all([
      this.pool.query(`SELECT d.symbol, d.close::float as close, d.pct_change::float as pct_change FROM ea_daily_stocks d JOIN ea_stock_universe u ON d.symbol = u.symbol WHERE d.date = $1 AND d.new_52w_high = TRUE ORDER BY d.pct_change DESC`, [date]),
      this.pool.query(`SELECT d.symbol, d.close::float as close, d.pct_change::float as pct_change FROM ea_daily_stocks d JOIN ea_stock_universe u ON d.symbol = u.symbol WHERE d.date = $1 AND d.new_52w_low = TRUE ORDER BY d.pct_change ASC`, [date]),
      this.pool.query(`SELECT d.symbol, d.close::float as close, d.pct_change::float as pct_change FROM ea_daily_stocks d JOIN ea_stock_universe u ON d.symbol = u.symbol WHERE d.date = $1 ORDER BY d.pct_change DESC LIMIT 20`, [date]),
      this.pool.query(`SELECT d.symbol, d.close::float as close, d.pct_change::float as pct_change FROM ea_daily_stocks d JOIN ea_stock_universe u ON d.symbol = u.symbol WHERE d.date = $1 ORDER BY d.pct_change ASC LIMIT 20`, [date])
    ]);

    return {
      highs_52w: highsRes.rows,
      lows_52w: lowsRes.rows,
      top_gainers: gainersRes.rows,
      top_losers: losersRes.rows
    };
  }
}
