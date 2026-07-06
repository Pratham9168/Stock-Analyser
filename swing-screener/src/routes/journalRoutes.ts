import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

export const createJournalRoutes = (pool: Pool) => {
  const router = Router();

  // ==========================================
  // RESEARCH LOG (Journal Commentary)
  // ==========================================

  // Get log for a specific date
  router.get('/log', async (req: Request, res: Response) => {
    try {
      const date = req.query.date as string;
      if (!date) return res.status(400).json({ error: 'date query param required' });

      const result = await pool.query(`
        SELECT id, date, comment, created_at, updated_at
        FROM ea_research_log
        WHERE date = $1
      `, [date]);

      res.json({ data: result.rows[0] || null });
    } catch (error) {
      console.error('[JournalRoutes] /log error:', error);
      res.status(500).json({ error: 'Failed to fetch research log' });
    }
  });

  // Upsert log for a specific date
  router.post('/log', async (req: Request, res: Response) => {
    try {
      const { date, comment } = req.body;
      if (!date) return res.status(400).json({ error: 'date required' });

      // Upsert logic based on ea_research_log table schema.
      // Usually date should be unique, but if there's no unique constraint on date, 
      // we must check if it exists first.
      
      const check = await pool.query('SELECT id FROM ea_research_log WHERE date = $1', [date]);
      if (check.rows.length > 0) {
        // Update
        const result = await pool.query(`
          UPDATE ea_research_log 
          SET comment = $1, updated_at = NOW() 
          WHERE date = $2 
          RETURNING *
        `, [comment, date]);
        res.json({ data: result.rows[0] });
      } else {
        // Insert
        const result = await pool.query(`
          INSERT INTO ea_research_log (date, comment, created_at, updated_at) 
          VALUES ($1, $2, NOW(), NOW()) 
          RETURNING *
        `, [date, comment]);
        res.json({ data: result.rows[0] });
      }
    } catch (error) {
      console.error('[JournalRoutes] POST /log error:', error);
      res.status(500).json({ error: 'Failed to save research log' });
    }
  });

  // ==========================================
  // RESEARCH WATCHLIST (Setups)
  // ==========================================

  // Get watchlist for a specific date
  router.get('/watchlist', async (req: Request, res: Response) => {
    try {
      const date = req.query.date as string;
      if (!date) return res.status(400).json({ error: 'date query param required' });

      const result = await pool.query(`
        SELECT id, date, symbol, sector, industry, note, added_at
        FROM ea_research_watchlist
        WHERE date = $1
        ORDER BY added_at DESC
      `, [date]);

      res.json({ data: result.rows });
    } catch (error) {
      console.error('[JournalRoutes] /watchlist error:', error);
      res.status(500).json({ error: 'Failed to fetch watchlist' });
    }
  });

  // Add stock to watchlist for a date
  router.post('/watchlist', async (req: Request, res: Response) => {
    try {
      const { date, symbol, sector, industry, note } = req.body;
      if (!date || !symbol) return res.status(400).json({ error: 'date and symbol required' });

      // Ensure no duplicate symbol on the same date
      const check = await pool.query('SELECT id FROM ea_research_watchlist WHERE date = $1 AND symbol = $2', [date, symbol]);
      if (check.rows.length > 0) {
        return res.json({ data: check.rows[0] }); // Already exists, return it
      }

      const result = await pool.query(`
        INSERT INTO ea_research_watchlist (date, symbol, sector, industry, note, added_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING *
      `, [date, symbol, sector || null, industry || null, note || null]);

      res.json({ data: result.rows[0] });
    } catch (error) {
      console.error('[JournalRoutes] POST /watchlist error:', error);
      res.status(500).json({ error: 'Failed to add to watchlist' });
    }
  });

  // Remove stock from watchlist
  router.delete('/watchlist/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      await pool.query('DELETE FROM ea_research_watchlist WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (error) {
      console.error('[JournalRoutes] DELETE /watchlist/:id error:', error);
      res.status(500).json({ error: 'Failed to delete from watchlist' });
    }
  });

  // Get recently added stocks across all dates
  router.get('/watchlist/recent', async (req: Request, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT id, date, symbol, sector, industry, note, added_at
        FROM ea_research_watchlist
        ORDER BY added_at DESC
        LIMIT 50
      `);
      res.json({ data: result.rows });
    } catch (error) {
      console.error('[JournalRoutes] /watchlist/recent error:', error);
      res.status(500).json({ error: 'Failed to fetch recent watchlist' });
    }
  });

  // Get aggregated dates that have watchlist items
  router.get('/watchlist/dates', async (req: Request, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT date, count(*) as count
        FROM ea_research_watchlist
        WHERE date >= CURRENT_DATE - INTERVAL '90 days'
        GROUP BY date
        ORDER BY date DESC
      `);
      
      // Convert to a dictionary: { "YYYY-MM-DD": count }
      const datesDict: Record<string, number> = {};
      result.rows.forEach(r => {
        // PostgreSQL date format varies, explicitly format or split based on return value
        const dateStr = typeof r.date === 'string' ? r.date.split('T')[0] : r.date.toISOString().split('T')[0];
        datesDict[dateStr] = parseInt(r.count, 10);
      });

      res.json({ data: datesDict });
    } catch (error) {
      console.error('[JournalRoutes] /watchlist/dates error:', error);
      res.status(500).json({ error: 'Failed to fetch watchlist dates' });
    }
  });

  return router;
};
