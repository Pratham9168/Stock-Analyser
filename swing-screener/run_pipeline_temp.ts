import { Pool } from 'pg';
import { EquialphaRepository } from './src/repositories/EquialphaRepository';
import { EquialphaScoresRepository } from './src/repositories/EquialphaScoresRepository';
import { NseDataService } from './src/services/NseDataService';
import { YahooBrowserService } from './src/services/YahooBrowserService';
import { ScraperService } from './src/services/ScraperService';
import { EquialphaScoreService } from './src/services/equialpha/EquialphaScoreService';
import { EquialphaPipelineService } from './src/services/equialpha/EquialphaPipelineService';

const pool = new Pool({
  user: 'kesha',
  database: 'stock_analysis',
  port: 5432
});

const equialphaRepo = new EquialphaRepository(pool);
const equialphaScoresRepo = new EquialphaScoresRepository(pool);
const nseDataService = new NseDataService();
const yahooBrowserService = new YahooBrowserService();
const scraperService = new ScraperService();
const equialphaScoreService = new EquialphaScoreService(pool);

const pipelineService = new EquialphaPipelineService(
  equialphaRepo,
  equialphaScoresRepo,
  nseDataService,
  yahooBrowserService,
  scraperService,
  equialphaScoreService
);

(async () => {
  try {
    console.log('Running pipeline for 2026-06-18...');
    await pipelineService.runPipeline('2026-06-18', true);
    console.log('Done.');
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
})();
