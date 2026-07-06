// src/routes/index.ts - Main routes configuration

import { Router } from 'express';
import { ScanController } from '../controllers/ScanController';
import { PortfolioController } from '../controllers/PortfolioController';
import { HealthController } from '../controllers/HealthController';
import { createOptionsRoutes } from './optionsRoutes';
import { createAskAIRoutes } from './askAIRoutes';
import { createWhatIfRoutes } from './whatIfRoutes';
import { createInsiderRoutes } from './insiderRoutes';
import { createTradeJournalRoutes } from './tradeJournalRoutes';
import { createCompoundAlertRoutes } from './compoundAlertRoutes';
import { createSectorRoutes } from './sectorRoutes';
import { createEarningsRoutes } from './earningsRoutes';
import { createPaperTradingRoutes } from './paperTradingRoutes';
import { createTradeCardRoutes } from './tradeCardRoutes';
import { createLeaderboardRoutes } from './leaderboardRoutes';
import { createCorrelationRoutes } from './correlationRoutes';
import { createUnusualActivityRoutes } from './unusualActivityRoutes';
import { createEventCalendarRoutes } from './eventCalendarRoutes';
import { createMultiTimeframeRoutes } from './multiTimeframeRoutes';
import { createWatchlistRoutes } from './watchlistRoutes';
import { createTradeIdeaRoutes } from './tradeIdeaRoutes';
import { setupEquialphaRoutes } from './equialphaRoutes';
import { createJournalRoutes } from './journalRoutes';

export function createRoutes(services: any, _repositories: any, pool: any): Router {
  const router = Router();

  // Initialize controllers
  const scanController = new ScanController(services.scanService);
  const portfolioController = new PortfolioController(services.scanService);
  const healthController = new HealthController(pool);

  // Health check routes
  router.get('/health', healthController.getHealth);

  // Scan routes
  router.get('/status', scanController.getStatus);
  router.post('/start-scan', scanController.startScan);
  router.get('/scan-results', scanController.getResults);
  router.get('/stocks', scanController.getStocks);
  router.get('/selected', scanController.getSelectedStocks);
  router.get('/rejected', scanController.getRejectedStocks);
  router.get('/scan-history', scanController.getScanHistory);
  router.get('/statistics', scanController.getStatistics);
  router.post('/analyze-stock', scanController.analyzeStock);
  router.get('/quote/:symbol', scanController.getQuote);
  router.get('/logs', scanController.getLogs);
  router.post('/run-selected-scan', scanController.runSelectedScan);

  // Observation queue routes (AI Layer)
  router.get('/observations', scanController.getObservationQueue);
  router.post('/observations/:id/decision', scanController.processObservation);
  router.get('/ai-stats', scanController.getAIStats);

  // Portfolio routes
  router.get('/portfolio', portfolioController.getPortfolio);
  router.get('/performance', portfolioController.getPerformance);

  // Options Strategy routes (Phase 2 & 8)
  if (services.optionsService && services.strategyRecommender) {
    const optionsRoutes = createOptionsRoutes(
      services.optionsService, 
      services.strategyRecommender,
      services.optionsPainMapService
    );
    router.use('/options', optionsRoutes);
  }

  // Ask AI routes (Phase 3)
  if (services.askAIService) {
    const askAIRoutes = createAskAIRoutes(services.askAIService, services.sentimentService);
    router.use('/ask-ai', askAIRoutes);
  } else if (services.sentimentService) {
    // Sentiment-only route even without AI
    const askAIRoutes = createAskAIRoutes(null as any, services.sentimentService);
    router.use('/ask-ai', askAIRoutes);
  }

  // What If Simulator routes (Phase 5)
  if (services.whatIfSimulator) {
    const whatIfRoutes = createWhatIfRoutes(services.whatIfSimulator);
    router.use('/what-if', whatIfRoutes);
  }

  // Insider Activity routes (Phase 6 & 7)
  if (services.insiderService && services.fiidiiService) {
    const insiderRoutes = createInsiderRoutes(services.insiderService, services.fiidiiService);
    router.use('/insider', insiderRoutes);
  }

  // AI Trade Journal (Phase 9)
  if (services.tradeJournalService) {
    const journalRoutes = createTradeJournalRoutes(services.tradeJournalService);
    router.use('/journal', journalRoutes);
  }

  // Smart Compound Alerts (Phase 10)
  if (services.compoundAlertService) {
    const compoundAlertRoutes = createCompoundAlertRoutes(services.compoundAlertService);
    router.use('/alerts', compoundAlertRoutes);
  }

  // Sector Rotation Radar (Phase 11)
  if (services.sectorRotationService) {
    const sectorRoutes = createSectorRoutes(services.sectorRotationService);
    router.use('/sectors', sectorRoutes);
  }

  // Earnings Whisper Engine (Phase 12)
  if (services.earningsWhisperService) {
    const earningsRoutes = createEarningsRoutes(services.earningsWhisperService);
    router.use('/earnings', earningsRoutes);
  }

  // Paper Trading Mode (Phase 13)
  if (services.paperTradingService) {
    const paperTradingRoutes = createPaperTradingRoutes(services.paperTradingService);
    router.use('/paper-trading', paperTradingRoutes);
  }

  // Shareable Trade Cards (Phase 14)
  if (services.tradeCardService) {
    const tradeCardRoutes = createTradeCardRoutes(services.tradeCardService);
    router.use('/cards', tradeCardRoutes);
  }

  // Paper Trading Leaderboard (Phase 15)
  if (services.leaderboardService) {
    const leaderboardRoutes = createLeaderboardRoutes(services.leaderboardService);
    router.use('/leaderboard', leaderboardRoutes);
  }

  // Correlation Matrix (Phase 16)
  if (services.correlationService) {
    const correlationRoutes = createCorrelationRoutes(services.correlationService);
    router.use('/correlation', correlationRoutes);
  }

  // Unusual Activity Detector (Phase 17)
  if (services.unusualActivityService) {
    const unusualRoutes = createUnusualActivityRoutes(services.unusualActivityService);
    router.use('/unusual', unusualRoutes);
  }

  // Event Calendar (Phase 18)
  if (services.eventCalendarService) {
    const eventRoutes = createEventCalendarRoutes(services.eventCalendarService);
    router.use('/events', eventRoutes);
  }

  // Multi-Timeframe Dashboard (Phase 19)
  if (services.multiTimeframeService) {
    const mtfRoutes = createMultiTimeframeRoutes(services.multiTimeframeService);
    router.use('/mtf', mtfRoutes);
  }

  // AI Watchlist Monitoring (Phase 20)
  if (services.watchlistService) {
    const watchlistRoutes = createWatchlistRoutes(services.watchlistService);
    router.use('/watchlist', watchlistRoutes);
  }

  // AI Trade Idea Feed (Phase 21)
  if (services.tradeIdeaService) {
    const tradeIdeaRoutes = createTradeIdeaRoutes(services.tradeIdeaService);
    router.use('/ideas', tradeIdeaRoutes);
  }

  // Equialpha Platform Routes
  if (services.equialphaPipelineService) {
      const equialphaRoutes = setupEquialphaRoutes(pool, services.equialphaPipelineService);
      router.use('/equialpha', equialphaRoutes);
      
      const journalRoutes = createJournalRoutes(pool);
      router.use('/equialpha/journal', journalRoutes);
  }

  return router;
}