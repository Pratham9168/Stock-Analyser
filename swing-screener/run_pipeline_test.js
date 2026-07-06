require('ts-node').register();
const { EquialphaPipelineService } = require('./src/services/equialpha/EquialphaPipelineService');
const { EquialphaRepository } = require('./src/repositories/EquialphaRepository');
const { EquialphaScoresRepository } = require('./src/repositories/EquialphaScoresRepository');
const { NseDataService } = require('./src/services/NseDataService');
const { YahooBrowserService } = require('./src/services/YahooBrowserService');
const { ScraperService } = require('./src/services/ScraperService');
const { EquialphaScoreService } = require('./src/services/equialpha/EquialphaScoreService');

const repo = new EquialphaRepository();
const scoreRepo = new EquialphaScoresRepository();
const nse = new NseDataService();
const yahoo = new YahooBrowserService();
const scraper = new ScraperService();
const scoreEngine = new EquialphaScoreService(repo, scoreRepo);
const pipeline = new EquialphaPipelineService(repo, scoreRepo, nse, yahoo, scraper, scoreEngine);

pipeline.runPipeline('2026-06-03', true).then(() => {
    console.log('Done!');
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
});
