import { Pool } from 'pg';
import { EquialphaPipelineService } from './src/services/equialpha/EquialphaPipelineService';
import { EquialphaRepository } from './src/repositories/EquialphaRepository';
import { EquialphaScoresRepository } from './src/repositories/EquialphaScoresRepository';
import { NseDataService } from './src/services/NseDataService';
import { YahooBrowserService } from './src/services/YahooBrowserService';
import { ScraperService } from './src/services/ScraperService';
import { EquialphaScoreService } from './src/services/equialpha/EquialphaScoreService';

const pool = new Pool({
  user: 'kesha',
  database: 'stock_analysis',
  port: 5432
});

const pipelineService = new EquialphaPipelineService(
  new EquialphaRepository(pool),
  new EquialphaScoresRepository(pool),
  new NseDataService(),
  new YahooBrowserService(),
  new ScraperService(),
  new EquialphaScoreService(pool)
);

(async () => {
  try {
    const start = await pool.query('SELECT COUNT(*) as c FROM ea_stock_universe WHERE sector != \'Others\'');
    console.log('Before:', start.rows[0].c);
    
    await pipelineService['enrichUniverseFromNseCSV'](); // Since it's private, we can bypass TS in node or just change the method
    
    const end = await pool.query('SELECT COUNT(*) as c FROM ea_stock_universe WHERE sector != \'Others\'');
    console.log('After:', end.rows[0].c);
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
})();
