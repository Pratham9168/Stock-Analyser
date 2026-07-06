// src/app.ts - Main application class

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { Pool } from 'pg';
import { Logger } from './utils/logger-enhanced';
import { AppConfig } from './types';
import { createConfig } from './config';
import { createDatabaseConnection } from './database/connection';

// Services
import { ScanService } from './services/ScanService';
import { StockAnalysisService } from './services/StockAnalysisService';
import { ScraperService } from './services/ScraperService';
import { NotificationService } from './services/NotificationService';
import { MarketDataService } from './services/MarketDataService';
import { TargetStoplossService } from './services/TargetStoplossService';
import { NseDataService } from './services/NseDataService';
import { GreeksEngine } from './services/GreeksEngine';
import { OptionsService } from './services/OptionsService';
import { StrategyRecommender } from './services/StrategyRecommender';
import { SentimentService } from './services/SentimentService';
import { AIAnalysisService } from './services/AIAnalysisService';
import { AskAIService } from './services/AskAIService';
import { WhatIfSimulator } from './services/WhatIfSimulator';
import { InsiderTrackingService } from './services/InsiderTrackingService';
import { FiiDiiService } from './services/FiiDiiService';
import { OptionsPainMapService } from './services/OptionsPainMapService';
import { AiTradeJournalService } from './services/AiTradeJournalService';
import { CompoundAlertService } from './services/CompoundAlertService';
import { SectorRotationService } from './services/SectorRotationService';
import { EarningsWhisperService } from './services/EarningsWhisperService';
import { PaperTradingService } from './services/PaperTradingService';
import { TradeCardService } from './services/TradeCardService';
import { LeaderboardService } from './services/LeaderboardService';
import { CorrelationMatrixService } from './services/CorrelationMatrixService';
import { UnusualActivityService } from './services/UnusualActivityService';
import { EventCalendarService } from './services/EventCalendarService';
import { MultiTimeframeService } from './services/MultiTimeframeService';
import { WatchlistService } from './services/WatchlistService';
import { TradeIdeaService } from './services/TradeIdeaService';

// Repositories
import { StockRepository } from './repositories/StockRepository';
import { PortfolioRepository } from './repositories/PortfolioRepository';
import { EquialphaRepository } from './repositories/EquialphaRepository';
import { EquialphaScoresRepository } from './repositories/EquialphaScoresRepository';

// Equialpha Services
import { EquialphaScoreService } from './services/equialpha/EquialphaScoreService';
import { EquialphaPipelineService } from './services/equialpha/EquialphaPipelineService';
import { YahooBrowserService } from './services/YahooBrowserService';



// Controllers are imported in routes

// Routes
import { createRoutes } from './routes';

export class App {
  private app: express.Application;
  private config: AppConfig;
  private logger: Logger;
  private pool: Pool;
  private server: any;

  constructor() {
    this.app = express();
    this.config = createConfig();
    this.logger = new Logger('App');
    this.pool = createDatabaseConnection(this.config.database);
  }

  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing application...');

      await this.setupDatabase();
      await this.setupMiddleware();
      await this.setupServices();
      await this.setupRoutes();
      await this.setupErrorHandling();

      this.logger.info('Application initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize application:', error);
      throw error;
    }
  }

  private async setupDatabase(): Promise<void> {
    try {
      await this.pool.query('SELECT 1');
      this.logger.info('Database connection established');

      // Enable persistent logging to system_logs table
      Logger.setPool(this.pool);
      this.logger.info('Persistent DB logging enabled');
    } catch (error) {
      this.logger.error('Database connection failed:', error);
      throw error;
    }
  }

  private async setupMiddleware(): Promise<void> {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      skip: (req) => req.path.startsWith('/equialpha/') // Equialpha dashboard polls frequently
    });
    this.app.use('/api/', limiter);

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request/Response logging with timing (persisted to system_logs)
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        Logger.logRequest(req.method, req.path, res.statusCode, duration);
      });
      next();
    });
  }

  private async setupServices(): Promise<void> {
    // Initialize repositories
    const stockRepository = new StockRepository(this.pool);
    const portfolioRepository = new PortfolioRepository(this.pool);

    // Initialize core services
    const stockAnalysisService = new StockAnalysisService();
    const scraperService = new ScraperService();
    const notificationService = new NotificationService(this.config);
    const marketDataService = new MarketDataService();
    const targetStoplossService = new TargetStoplossService();

    // Initialize NSE + Options + Sim services
    const nseDataService = marketDataService.getNseDataService();
    const greeksEngine = new GreeksEngine();
    const optionsService = new OptionsService(nseDataService, greeksEngine);
    const strategyRecommender = new StrategyRecommender(optionsService, greeksEngine, nseDataService);
    const whatIfSimulator = new WhatIfSimulator(greeksEngine, nseDataService);
    const optionsPainMapService = new OptionsPainMapService(optionsService, nseDataService);
    
    // Initialize Insider + Flow services
    const insiderService = new InsiderTrackingService(nseDataService);
    const fiidiiService = new FiiDiiService(nseDataService);
    
    // Initialize Compound Alerts (Phase D: persistent)
    const compoundAlertService = new CompoundAlertService(
      marketDataService,
      optionsService,
      fiidiiService,
      notificationService,
      this.pool
    );
    
    // Initialize Sector Rotation
    const sectorRotationService = new SectorRotationService(nseDataService);

    // Initialize Paper Trading (Phase D: persistent)
    const paperTradingService = new PaperTradingService(marketDataService, this.pool);

    // Initialize AI + Sentiment services (must come before Phases 14-21 that depend on them)
    let aiAnalysisService: AIAnalysisService | null = null;
    const sentimentService = new SentimentService();
    let tradeJournalService: AiTradeJournalService | null = null;
    let earningsWhisperService: EarningsWhisperService | null = null;

    try {
      aiAnalysisService = new AIAnalysisService();
      tradeJournalService = new AiTradeJournalService(aiAnalysisService, this.pool);
      earningsWhisperService = new EarningsWhisperService(aiAnalysisService, sentimentService, marketDataService);
      this.logger.info('AI Analysis services initialized');
    } catch (error) {
      this.logger.warn('AI Analysis services not available (missing GEMINI_API_KEY). Trade Journal and Earnings Whisper disabled.');
    }

    let askAIService: AskAIService | null = null;
    try {
      askAIService = new AskAIService(nseDataService, sentimentService, optionsService, undefined, this.pool);
      this.logger.info('AskAI service initialized');
    } catch (error) {
      this.logger.warn('AskAI service not available (missing GEMINI_API_KEY)');
    }

    // Phase 14: Trade Cards (Phase D: persistent)
    const tradeCardService = new TradeCardService(marketDataService, aiAnalysisService, this.pool);

    // Phase 15: Leaderboard (Phase D: direct SQL)
    const leaderboardService = new LeaderboardService(this.pool);

    // Phase 16: Correlation Matrix
    const correlationService = new CorrelationMatrixService(marketDataService);

    // Phase 17: Unusual Activity Detector
    const unusualActivityService = new UnusualActivityService(marketDataService, optionsService);

    // Phase 18: Event Calendar
    const eventCalendarService = new EventCalendarService(aiAnalysisService);

    // Phase 19: Multi-Timeframe Dashboard
    const multiTimeframeService = new MultiTimeframeService(marketDataService);

    // Phase 20: AI Watchlist (Phase D: persistent)
    const watchlistService = new WatchlistService(marketDataService, aiAnalysisService, this.pool);

    // Phase 21: AI Trade Ideas (Phase D: persistent)
    const tradeIdeaService = new TradeIdeaService(aiAnalysisService, marketDataService, sentimentService, optionsService, this.pool);

    // Initialize scan service with all dependencies
    const scanService = new ScanService(
      stockRepository,
      stockAnalysisService,
      scraperService,
      notificationService,
      marketDataService,
      targetStoplossService,
      this.config,
      this.pool
    );

    // Initialize Equialpha Services
    const yahooBrowserService = new YahooBrowserService();
    const equialphaRepo = new EquialphaRepository(this.pool);
    const equialphaScoresRepo = new EquialphaScoresRepository(this.pool);
    const equialphaScoreService = new EquialphaScoreService(equialphaRepo, equialphaScoresRepo);
    const equialphaPipelineService = new EquialphaPipelineService(
      equialphaRepo,
      equialphaScoresRepo,
      nseDataService,
      yahooBrowserService,
      scraperService,
      equialphaScoreService
    );

    // Store services in app for use in controllers
    this.app.locals.services = {
      scanService,
      stockAnalysisService,
      scraperService,
      notificationService,
      marketDataService,
      targetStoplossService,
      nseDataService,
      greeksEngine,
      optionsService,
      strategyRecommender,
      whatIfSimulator,
      optionsPainMapService,
      sentimentService,
      askAIService,
      insiderService,
      fiidiiService,
      tradeJournalService,
      compoundAlertService,
      sectorRotationService,
      earningsWhisperService,
      paperTradingService,
      tradeCardService,
      leaderboardService,
      correlationService,
      unusualActivityService,
      eventCalendarService,
      multiTimeframeService,
      watchlistService,
      tradeIdeaService,
      equialphaPipelineService,
    };

    this.app.locals.repositories = {
      stockRepository,
      portfolioRepository
    };

    this.logger.info('All services initialized (NSE primary + Yahoo fallback)');
  }

  private async setupRoutes(): Promise<void> {
    const routes = createRoutes(this.app.locals.services, this.app.locals.repositories, this.pool);
    this.app.use('/api', routes);

    // Serve static files
    this.app.use(express.static('client/dist'));

    // SPA fallback
    this.app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
      return res.sendFile('client/dist/index.html', { root: process.cwd() });
    });

    this.logger.info('Routes configured');
  }

  private async setupErrorHandling(): Promise<void> {
    // 404 handler
    this.app.use((_req, res) => {
      res.status(404).json({
        success: false,
        error: 'Not found',
        timestamp: new Date().toISOString()
      });
    });

    // Global error handler
    this.app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      this.logger.error('Unhandled error:', error);

      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Internal server error',
        code: error.code,
        timestamp: new Date().toISOString()
      });
    });
  }

  async start(): Promise<void> {
    try {
      const port = this.config.dashboard.port;

      this.server = this.app.listen(port, () => {
        this.logger.info(`🚀 Server running on port ${port}`);
        this.logger.info(`📊 API available at /api`);
        if (process.env.NODE_ENV !== 'production') {
          this.logger.info(`🎯 Frontend dev server at http://localhost:5173`);
        }
      });

      // Graceful shutdown
      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());

    } catch (error) {
      this.logger.error('Failed to start server:', error);
      throw error;
    }
  }

  private async shutdown(): Promise<void> {
    this.logger.info('Shutting down gracefully...');

    if (this.server) {
      this.server.close(() => {
        this.logger.info('Server closed');
      });
    }

    if (this.pool) {
      await this.pool.end();
      this.logger.info('Database connection closed');
    }

    process.exit(0);
  }

  getApp(): express.Application {
    return this.app;
  }
}