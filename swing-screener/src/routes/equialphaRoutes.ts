import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { EquialphaRepository } from '../repositories/EquialphaRepository';
import { EquialphaScoresRepository } from '../repositories/EquialphaScoresRepository';

export const setupEquialphaRoutes = (pool: Pool, pipelineService: any) => {
  const router = Router();
  const repo = new EquialphaRepository(pool);
  const scoresRepo = new EquialphaScoresRepository(pool);

  // ==========================================
  // ADMIN ROUTES (Trigger Pipeline)
  // ==========================================
  router.post('/pipeline/run', async (req: Request, res: Response) => {
    try {
      // Typically we'd check admin auth here, but user explicitly asked to remove auth
      const customDate = req.body?.date;
      const runId = await pipelineService.runPipeline(customDate);
      res.json({ success: true, message: `Pipeline started${customDate ? ' for ' + customDate : ''}`, runId });
    } catch (error) {
      console.error('[EquialphaRoutes] /pipeline/run error:', error);
      res.status(500).json({ success: false, error: 'Failed to start pipeline' });
    }
  });

  router.get('/pipeline/status', async (req: Request, res: Response) => {
    try {
      // First check for an actively running pipeline
      let result = await pool.query(
        `SELECT * FROM ea_pipeline_runs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1`
      );
      // If none running, return the most recent completed/paused/failed
      if (result.rows.length === 0) {
        result = await pool.query(
          `SELECT * FROM ea_pipeline_runs ORDER BY started_at DESC LIMIT 1`
        );
      }
      res.json(result.rows[0] || null);
    } catch (error) {
      console.error('[EquialphaRoutes] /pipeline/status error:', error);
      res.status(500).json({ success: false, error: 'Failed to get pipeline status' });
    }
  });

  router.post('/pipeline/pause', async (req: Request, res: Response) => {
    try {
      const result = await pool.query(`SELECT id FROM ea_pipeline_runs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1`);
      if (result.rows.length > 0) {
        await repo.pausePipelineRun(result.rows[0].id);
        res.json({ success: true, message: 'Pipeline pause requested' });
      } else {
        res.status(404).json({ success: false, message: 'No running pipeline found' });
      }
    } catch (error) {
      console.error('[EquialphaRoutes] /pipeline/pause error:', error);
      res.status(500).json({ success: false, error: 'Failed to pause pipeline' });
    }
  });

  // ==========================================
  // READ DATA ROUTES (For Frontend)
  // ==========================================
  
  router.get('/hydrate/market_breadth_stocks', async (req: Request, res: Response) => {
    try {
      // In NEXT, they fetched 1000 at a time using range. We'll just fetch latest date for brevity
      const latestDate = await repo.getLatestDate();
      if (!latestDate) return res.json({data: []});

      const result = await pool.query(`
        SELECT symbol, close::float as close, pct_change::float as pctchange, ema_10::float as ema_10, ema_20::float as ema_20, ema_50::float as ema_50, ema_200::float as ema_200, above_ema_10, above_ema_20, above_ema_50, above_ema_200
        FROM ea_daily_stocks WHERE date = $1
      `, [latestDate]);
      res.json({ data: result.rows });
    } catch (error) {
      res.status(500).json({ error: 'Failed' });
    }
  });

  router.get('/hydrate/universe_ohlcv_cache', async (req: Request, res: Response) => {
    try {
      const latestDate = await repo.getLatestDate();
      if (!latestDate) return res.json({data: []});

      // Join universe with latest performance
      const result = await pool.query(`
        SELECT u.symbol, u.sector, u.industry,
               d.close::float as close, d.pct_change::float as pct_change, d.ema_10::float as ema_10, d.ema_20::float as ema_20, d.ema_50::float as ema_50, d.ema_200::float as ema_200,
               d.above_ema_10, d.above_ema_20, d.above_ema_50, d.above_ema_200
        FROM ea_stock_universe u
        JOIN ea_daily_stocks d ON u.symbol = d.symbol AND d.date = $1
        WHERE u.is_active = TRUE
      `, [latestDate]);
      res.json({ data: result.rows });
    } catch (error) {
      res.status(500).json({ error: 'Failed' });
    }
  });

  router.get('/hydrate/sector_scores', async (req: Request, res: Response) => {
    try {
      const latestDate = await repo.getLatestDate();
      if (!latestDate) return res.json({data: []});

      const result = await pool.query(`
        SELECT id, date, sector, sector_type, final_score, avg_rs,
          rs80_pct, near52w_pct, momentum, prev_momentum,
          appearances, unique_stocks, last7_appearances,
          quality_score, scan_score, accel_score, recency_score, today_pct::float as today_pct,
          verdict
        FROM ea_sector_scores WHERE date = $1
      `, [latestDate]);
      res.json({ data: result.rows });
    } catch (error) {
      res.status(500).json({ error: 'Failed' });
    }
  });

  router.get('/hydrate/market_mood', async (req: Request, res: Response) => {
    try {
      const latestDate = await repo.getLatestDate();
      if (!latestDate) return res.json({data: null});

      const result = await pool.query(`
        SELECT id, date, nifty500_close::float as nifty500_close, nifty500_ema10::float as nifty500_ema10, nifty500_ema20::float as nifty500_ema20,
          nifty50_close::float as nifty50_close, nifty50_change_pct::float as nifty50_change_pct, nifty500_change_pct::float as nifty500_change_pct,
          above_ema20_pct::float as above_ema20_pct, above_ema50_pct::float as above_ema50_pct, above_ema200_pct::float as above_ema200_pct,
          sectors_accelerating, sectors_fading, avg_sector_score::float as avg_sector_score,
          mood_score, mood_label, ad_ratio::float as ad_ratio, advancing, declining
        FROM ea_market_mood WHERE date = $1
      `, [latestDate]);
      res.json({ data: result.rows[0] || null });
    } catch (error) {
       res.status(500).json({ error: 'Failed' });
    }
  });
  
  router.get('/hydrate/scans', async (req: Request, res: Response) => {
    try {
      // Get last 20 unique dates then fetch scans
      const result = await pool.query(`
         SELECT symbol as nsecode, sector, industry, date, scan_type
         FROM ea_scan_history
         WHERE date IN (
             SELECT DISTINCT date FROM ea_scan_history ORDER BY date DESC LIMIT 20
         )
         ORDER BY date DESC
      `);
      res.json({ data: result.rows });
    } catch (error) {
      res.status(500).json({ error: 'Failed' });
    }
  });

  // ==========================================
  // HISTORICAL DATA ROUTES (For Charts)
  // ==========================================

  router.get('/hydrate/breadth_history', async (req: Request, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT * FROM (
          SELECT date, above_ema20_pct::float as above_ema20_pct, above_ema50_pct::float as above_ema50_pct, above_ema200_pct::float as above_ema200_pct, advancing, declining, total
          FROM ea_breadth_history
          ORDER BY date DESC
          LIMIT 180
        ) sub
        ORDER BY date ASC
      `);
      res.json({ data: result.rows });
    } catch (error) {
      console.error('[EquialphaRoutes] /hydrate/breadth_history error:', error);
      res.status(500).json({ error: 'Failed to fetch breadth history' });
    }
  });

  router.get('/hydrate/sector_rotation', async (req: Request, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT date, sector, momentum, final_score, avg_rs
        FROM ea_sector_scores
        WHERE sector_type = 'sector'
        ORDER BY date ASC
      `);
      res.json({ data: result.rows });
    } catch (error) {
      console.error('[EquialphaRoutes] /hydrate/sector_rotation error:', error);
      res.status(500).json({ error: 'Failed to fetch sector rotation' });
    }
  });

  router.get('/hydrate/rs_history', async (req: Request, res: Response) => {
    try {
      const symbol = req.query.symbol as string;
      if (!symbol) return res.status(400).json({ error: 'symbol query param required' });

      const result = await pool.query(`
        SELECT * FROM (
          SELECT date, rs_rating, rs_delta
          FROM ea_rs_history
          WHERE symbol = $1
          ORDER BY date DESC
          LIMIT 120
        ) sub
        ORDER BY date ASC
      `, [symbol]);
      res.json({ data: result.rows });
    } catch (error) {
      console.error('[EquialphaRoutes] /hydrate/rs_history error:', error);
      res.status(500).json({ error: 'Failed to fetch RS history' });
    }
  });

  // ==========================================
  // PHASE 1: DETAILS & ANALYTICS
  // ==========================================

  router.get('/stock/:symbol', async (req: Request, res: Response) => {
    try {
      const symbol = req.params.symbol;
      const latestDate = await repo.getLatestDate();
      
      if (!latestDate) {
        return res.status(404).json({ error: 'No data available' });
      }

      const details = await repo.getStockDetails(symbol, latestDate);
      if (!details) {
        return res.status(404).json({ error: 'Stock not found' });
      }
      res.json({ data: details });
    } catch (error) {
      console.error('[EquialphaRoutes] /stock/:symbol error:', error);
      res.status(500).json({ error: 'Failed to fetch stock details' });
    }
  });

  router.get('/sector/:industry(*)', async (req: Request, res: Response) => {
    try {
      const industry = decodeURIComponent(req.params.industry);
      const latestDate = await repo.getLatestDate();
      
      if (!latestDate) {
        return res.status(404).json({ error: 'No data available' });
      }

      const stocks = await repo.getSectorDetails(industry, latestDate);
      res.json({ data: stocks });
    } catch (error) {
      console.error('[EquialphaRoutes] /sector/:industry error:', error);
      res.status(500).json({ error: 'Failed to fetch sector details' });
    }
  });

  router.get('/hydrate/sector_history/:industry(*)', async (req: Request, res: Response) => {
    try {
      const industry = decodeURIComponent(req.params.industry);
      const history = await repo.getSingleSectorHistory(industry);
      res.json({ data: history });
    } catch (error) {
      console.error('[EquialphaRoutes] /hydrate/sector_history/:industry error:', error);
      res.status(500).json({ error: 'Failed to fetch sector history' });
    }
  });


  router.get('/hydrate/rs_ratings', async (req: Request, res: Response) => {
    try {
      const latestDate = await repo.getLatestDate();
      
      if (!latestDate) {
        return res.status(404).json({ error: 'No data available' });
      }

      const ratings = await repo.getAllRsRatings(latestDate);
      res.json({ data: ratings });
    } catch (error) {
      console.error('[EquialphaRoutes] /hydrate/rs_ratings error:', error);
      res.status(500).json({ error: 'Failed to fetch all RS ratings' });
    }
  });

  // =========================================================================
  // TRADE JOURNAL ROUTES
  // =========================================================================

  router.get('/trades', async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string;
      const trades = await repo.getTrades(status);
      res.json({ data: trades });
    } catch (error) {
      console.error('[EquialphaRoutes] /trades error:', error);
      res.status(500).json({ error: 'Failed to fetch trades' });
    }
  });

  router.post('/trades', async (req: Request, res: Response) => {
    try {
      const trade = await repo.createTrade(req.body);
      res.json({ data: trade });
    } catch (error) {
      console.error('[EquialphaRoutes] POST /trades error:', error);
      res.status(500).json({ error: 'Failed to create trade' });
    }
  });

  router.put('/trades/:id', async (req: Request, res: Response) => {
    try {
      const trade = await repo.updateTrade(parseInt(req.params.id), req.body);
      res.json({ data: trade });
    } catch (error) {
      console.error('[EquialphaRoutes] PUT /trades/:id error:', error);
      res.status(500).json({ error: 'Failed to update trade' });
    }
  });

  router.delete('/trades/:id', async (req: Request, res: Response) => {
    try {
      await repo.deleteTrade(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error('[EquialphaRoutes] DELETE /trades/:id error:', error);
      res.status(500).json({ error: 'Failed to delete trade' });
    }
  });

  router.post('/trades/:id/additions', async (req: Request, res: Response) => {
    try {
      const addition = await repo.addTradeAddition(parseInt(req.params.id), req.body);
      res.json({ data: addition });
    } catch (error) {
      console.error('[EquialphaRoutes] POST /trades/:id/additions error:', error);
      res.status(500).json({ error: 'Failed to add to trade' });
    }
  });

  router.post('/trades/:id/exits', async (req: Request, res: Response) => {
    try {
      const exit = await repo.addTradeExit(parseInt(req.params.id), req.body);
      
      // Auto-update status if it's a full exit
      if (req.body.isFullExit) {
        await repo.updateTrade(parseInt(req.params.id), { status: 'closed' });
      }
      
      res.json({ data: exit });
    } catch (error) {
      console.error('[EquialphaRoutes] POST /trades/:id/exits error:', error);
      res.status(500).json({ error: 'Failed to exit trade' });
    }
  });

  router.get('/capital', async (req: Request, res: Response) => {
    try {
      const capital = await repo.getCapital();
      res.json({ data: capital });
    } catch (error) {
      console.error('[EquialphaRoutes] GET /capital error:', error);
      res.status(500).json({ error: 'Failed to fetch capital' });
    }
  });

  router.post('/capital', async (req: Request, res: Response) => {
    try {
      const capital = await repo.updateCapital(req.body.amount);
      res.json({ data: capital });
    } catch (error) {
      console.error('[EquialphaRoutes] POST /capital error:', error);
      res.status(500).json({ error: 'Failed to update capital' });
    }
  });

  // =========================================================================
  // SETUPS ROUTES
  // =========================================================================

  router.get('/setups', async (req: Request, res: Response) => {
    try {
      const setups = await repo.getSetups();
      res.json({ data: setups });
    } catch (error) {
      console.error('[EquialphaRoutes] GET /setups error:', error);
      res.status(500).json({ error: 'Failed to fetch setups' });
    }
  });

  router.post('/setups', async (req: Request, res: Response) => {
    try {
      const setup = await repo.createSetup(req.body);
      res.json({ data: setup });
    } catch (error) {
      console.error('[EquialphaRoutes] POST /setups error:', error);
      res.status(500).json({ error: 'Failed to create setup' });
    }
  });

  router.delete('/setups/:id', async (req: Request, res: Response) => {
    try {
      await repo.deleteSetup(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error('[EquialphaRoutes] DELETE /setups/:id error:', error);
      res.status(500).json({ error: 'Failed to delete setup' });
    }
  });

  router.get('/hydrate/market_stats', async (req: Request, res: Response) => {
    try {
      const latestDate = await repo.getLatestDate();
      
      if (!latestDate) {
        return res.status(404).json({ error: 'No data available' });
      }

      const stats = await repo.getMarketStats(latestDate);
      res.json({ data: stats });
    } catch (error) {
      console.error('[EquialphaRoutes] /hydrate/market_stats error:', error);
      res.status(500).json({ error: 'Failed to fetch market stats' });
    }
  });

  return router;
};
