import { config } from 'dotenv';
import path from 'path';
config({ path: path.resolve(__dirname, '.env') });

import { Pool } from 'pg';
import { EquialphaPipelineService } from './src/services/equialpha/EquialphaPipelineService';
import { EquialphaRepository } from './src/repositories/EquialphaRepository';
import { EquialphaScoresRepository } from './src/repositories/EquialphaScoresRepository';
import { EquialphaScoreService } from './src/services/equialpha/EquialphaScoreService';
import { NseSessionService } from './src/services/NseSessionService';
import { NseDataService } from './src/services/NseDataService';
import { YahooBrowserService } from './src/services/YahooBrowserService';
import { ScraperService } from './src/services/ScraperService';

async function runRS() {
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'stock_analysis',
      user: process.env.DB_USER || 'kesha',
      password: process.env.DB_PASSWORD || '',
    });

    const repo = new EquialphaRepository(pool);
    const scoresRepo = new EquialphaScoresRepository(pool);
    const scoreService = new EquialphaScoreService(repo, scoresRepo);
    const nseSession = new NseSessionService();
    const nseData = new NseDataService(nseSession);
    const yahooBrowser = new YahooBrowserService();
    const scraper = new ScraperService();
    
    const pipeline = new EquialphaPipelineService(
      repo,
      scoresRepo,
      nseData,
      yahooBrowser,
      scraper,
      scoreService
    );

    const customDate = process.argv[2];
    console.log(`Starting pipeline run${customDate ? ' for ' + customDate : ' (resume mode)'}...`);
    try {
        await pipeline.runPipeline(customDate, true);
        console.log('Pipeline run complete!');
    } catch (e) {
        console.error('Error running pipeline:', e);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

runRS();
