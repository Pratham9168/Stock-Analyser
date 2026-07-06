// src/services/ScanService.ts - Scan orchestration service

import { Pool } from 'pg';
import { BaseService } from './BaseService';
import { StockRepository } from '../repositories/StockRepository';
import { StockAnalysisService } from './StockAnalysisService';
import { ScraperService } from './ScraperService';
import { NotificationService } from './NotificationService';
import { MarketDataService } from './MarketDataService';
import { TargetStoplossService } from './TargetStoplossService';
import { AILayerOrchestrator } from './AILayerOrchestrator';
import { AppConfig } from '../types';
import { ScanResult } from '../types';
import { DailyBar } from '../types/analysis';

export class ScanService extends BaseService {
  private stockRepository: StockRepository;
  private stockAnalysisService: StockAnalysisService;
  private scraperService: ScraperService;
  private notificationService: NotificationService;
  private marketDataService: MarketDataService;
  private targetStoplossService: TargetStoplossService;
  private aiOrchestrator: AILayerOrchestrator;
  private config: AppConfig;
  private isRunning: boolean = false;

  constructor(
    stockRepository: StockRepository,
    analysisService: StockAnalysisService,
    scraperService: ScraperService,
    notificationService: NotificationService,
    marketDataService: MarketDataService,
    targetStoplossService: TargetStoplossService,
    config: AppConfig,
    pool: Pool
  ) {
    super('ScanService');
    this.stockRepository = stockRepository;
    this.stockAnalysisService = analysisService;
    this.scraperService = scraperService;
    this.notificationService = notificationService;
    this.marketDataService = marketDataService;
    this.targetStoplossService = targetStoplossService;
    this.config = config;
    this.aiOrchestrator = new AILayerOrchestrator(pool, config);
  }

  async startManualScan(): Promise<ScanResult> {
    if (this.isRunning) {
      throw new Error('Scan is already running');
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      this.logger.info('Starting manual scan...');

      // Step 1: Scrape stocks from all configured URLs
      const scrapeResult = await this.scraperService.scrapeFromMultipleUrls();
      this.logger.info(`Scraped ${scrapeResult.stocks.length} unique stocks from all sources`);

      if (scrapeResult.stocks.length === 0) {
        return {
          qualifiedCount: 0,
          totalCandidates: 0,
          successRate: 0,
          duration: Date.now() - startTime
        };
      }

      // Step 2: Create scan record
      const scanRecord = await this.stockRepository.createScan(
        scrapeResult.stocks.length,
        0, // Will be updated
        0, // Will be updated
        Math.round((Date.now() - startTime) / 1000)
      );

      // Step 3: Insert stocks
      const insertedStocks = await this.stockRepository.insertStocks(scanRecord.id, scrapeResult.stocks);

      // Step 4: Analyze stocks with real data
      let qualifiedCount = 0;
      let analyzedCount = 0;

      for (const stock of insertedStocks) {
        try {
          this.logger.info(`Analyzing ${stock.symbol}...`);

          // Fetch bars AND quote in a single API call (more efficient, avoids 401 errors)
          const { bars: dailyBars, quote: quoteData, chartMeta } = await this.marketDataService.fetchDailyBarsWithQuote(stock.symbol, 120);

          // Check if we have enough data
          if (dailyBars.length < 70) {
            this.logger.warn(`Insufficient data for ${stock.symbol}: ${dailyBars.length} bars`);

            // Save what data we have
            await this.stockRepository.insertDailyBars(stock.id, dailyBars);

            // Create a rejected analysis record
            await this.stockRepository.insertStockAnalysis(stock.id, scanRecord.id, {
              qualified: false,
              score: 0,
              failedAt: 0,
              reason: `Insufficient data: ${dailyBars.length} bars (need 70+)`,
              currentPrice: quoteData?.price || (dailyBars.length > 0 ? dailyBars[dailyBars.length - 1].close : 0),
              details: {
                consolidation: { pass: false, status: 'insufficient_data', reason: 'Not enough data', base: 0, currentPrice: 0, ema10Current: 0, percentGain: 0, zoneCount: 0, zones: [] },
                higherLow: { pass: false, status: 'insufficient_data', reason: 'Not enough data', latestZoneLow: 0, previousZoneLow: 0, currentPrice: 0, ema10Current: 0, zoneCount: 0 },
                volumePump: { pass: false, status: 'insufficient_data', reason: 'Not enough data', spikeDetails: null, threshold: 1.8, windowSize: 20 },
                bearSqueeze: { pass: false, status: 'insufficient_data', reason: 'Not enough data', open: 0, high: 0, low: 0, close: 0, bodyLow: 0, lowerWick: 0, totalRange: 0, wickPercent: 0, threshold: 40 },
                overall: { score: 0, maxScore: 4, grade: 'F' as const, recommendation: 'avoid' as const, confidence: 0, riskLevel: 'high' as const, rulesPassedSummary: { consolidation: false, higherLow: false, volumePump: false, bearSqueeze: false } }
              },
              analysisDurationMs: 0,
              dataPointsDaily: dailyBars.length,
              dataPointsIntraday: 0
            });
            analyzedCount++;
            continue;
          }

          // Current price from quote (already included in single API call)
          const currentPrice = quoteData?.price || (dailyBars.length > 0 ? dailyBars[dailyBars.length - 1].close : 0);

          // Run the REAL analysis using StockAnalysisService
          const analysisResult = await this.stockAnalysisService.analyzeStock({
            symbol: stock.symbol,
            dailyBars: dailyBars
          });

          // Persist daily bars WITH calculated indicators
          await this.stockRepository.insertDailyBars(
            stock.id,
            dailyBars,
            analysisResult.calculatedIndicators
          );

          // Persist stock metadata from Yahoo Finance (with fallback to chartMeta)
          const metadata = {
            fiftyTwoWeekLow: quoteData?.rawData?.fiftyTwoWeekLow || chartMeta?.fiftyTwoWeekLow,
            fiftyTwoWeekHigh: quoteData?.rawData?.fiftyTwoWeekHigh || chartMeta?.fiftyTwoWeekHigh,
            fiftyDayAverage: quoteData?.rawData?.fiftyDayAverage || chartMeta?.fiftyDayAverage,
            twoHundredDayAverage: quoteData?.rawData?.twoHundredDayAverage || chartMeta?.twoHundredDayAverage,
            avgVolume3Month: quoteData?.rawData?.averageDailyVolume3Month || chartMeta?.averageDailyVolume3Month,
            avgVolume10Day: quoteData?.rawData?.averageDailyVolume10Day || chartMeta?.averageDailyVolume10Day,
            marketCap: quoteData?.rawData?.marketCap || chartMeta?.marketCap,
            trailingPE: quoteData?.rawData?.trailingPE,
            priceToBook: quoteData?.rawData?.priceToBook,
            epsTrailingTwelveMonths: quoteData?.rawData?.epsTrailingTwelveMonths,
            currency: quoteData?.rawData?.currency || chartMeta?.currency,
            exchange: quoteData?.rawData?.exchange || chartMeta?.exchangeName,
            longName: quoteData?.rawData?.longName || stock.name,
            marketState: quoteData?.rawData?.marketState || chartMeta?.marketState,
            rawQuoteData: quoteData?.rawData || null,
            rawChartMeta: chartMeta
          };

          await this.stockRepository.insertStockMetadata(stock.id, scanRecord.id, metadata);

          // Persist zones
          if (analysisResult.zones && analysisResult.zones.length > 0) {
            await this.stockRepository.insertZones(stock.id, scanRecord.id, analysisResult.zones);
          }

          // Persist analysis results
          await this.stockRepository.insertStockAnalysis(stock.id, scanRecord.id, analysisResult);
          analyzedCount++;

          // Process through AI layer (if enabled)
          let finalStatus: 'selected' | 'rejected' | 'observation' = analysisResult.qualified ? 'selected' : 'rejected';

          if (this.aiOrchestrator.isEnabled()) {
            try {
              const aiResult = await this.aiOrchestrator.processStock({
                stockId: parseInt(stock.id as string, 10),
                scanId: parseInt(scanRecord.id as string, 10),
                symbol: stock.symbol,
                name: stock.name,
                qualified: analysisResult.qualified,
                analysisDetails: analysisResult.details
              });

              finalStatus = aiResult.finalStatus;

              if (aiResult.aiDecision) {
                this.logger.info(`🤖 AI ${aiResult.aiLayerProcessed}: ${aiResult.aiDecision} (${aiResult.confidence}% confidence) → ${finalStatus}`);
              }
            } catch (aiError) {
              this.logger.warn(`AI processing failed for ${stock.symbol}, using code decision:`, aiError);
            }

            // Rate limiting for Gemini Free Tier (15 RPM)
            // Wait duration configured via AI_RATE_LIMIT_MS env variable
            await this.delay(this.config.ai.rateLimitMs);
          }

          // Handle based on final status (code + AI decision)
          if (finalStatus === 'selected') {
            qualifiedCount++;

            // Get current price and calculate targets/stoploss
            const currentPrice = analysisResult.currentPrice || dailyBars[dailyBars.length - 1].close;
            const swingLow = this.targetStoplossService.findSwingLow(dailyBars, 20);
            const stoploss = this.targetStoplossService.calculateInitialStoploss(currentPrice, swingLow);
            const targets = this.targetStoplossService.calculateTargets(currentPrice);

            const positionSize = this.targetStoplossService.getPositionSizing(currentPrice, stoploss);

            await this.stockRepository.insertSelectedStock(stock.id, scanRecord.id, {
              entryPrice: currentPrice,
              stopLoss: stoploss,
              target1: targets.t1,
              target2: targets.t2,
              target3: targets.t3,
              positionSize: positionSize.quantity,
              positionValue: positionSize.value
            });

            this.logger.info(`✅ ${stock.symbol} SELECTED - Score: ${analysisResult.score}, Entry: ₹${currentPrice.toFixed(2)}, SL: ₹${stoploss.toFixed(2)}`);
          } else if (finalStatus === 'observation') {
            this.logger.info(`👀 ${stock.symbol} → OBSERVATION QUEUE`);
          } else {
            this.logger.info(`❌ ${stock.symbol} REJECTED - ${analysisResult.reason}`);
          }
        } catch (error) {
          this.logger.error(`Failed to analyze ${stock.symbol}:`, error);
        }
      }

      const duration = Date.now() - startTime;
      const successRate = analyzedCount > 0 ? (qualifiedCount / analyzedCount) * 100 : 0;

      this.logger.info(`Scan completed: ${qualifiedCount}/${analyzedCount} qualified (${successRate.toFixed(1)}%)`);

      return {
        qualifiedCount,
        totalCandidates: analyzedCount,
        successRate,
        duration
      };

    } catch (error) {
      this.handleError(error, 'Manual scan failed');
    } finally {
      this.isRunning = false;
    }
  }

  async getScanStatus(): Promise<any> {
    return {
      running: this.isRunning,
      lastScan: {
        start: null,
        end: null,
        count: 0,
        error: null
      },
      nextScan: null,
      cronTime: this.config.scheduler.scanCron,
      timezone: this.config.scheduler.timezone
    };
  }

  async getLatestResults(): Promise<any> {
    const result: any = await this.stockRepository.getLatestScanResults();

    if (!result) {
      return {
        totalStocks: 0,
        qualifiedStocks: 0,
        successRate: 0,
        lastScanTime: null,
        scanDuration: 0
      };
    }

    // Map snake_case DB fields to camelCase frontend expectations
    return {
      totalStocks: parseInt(result.total_stocks_scraped || 0),
      qualifiedStocks: parseInt(result.qualified_count || result.stocks_passed || 0),
      successRate: parseInt(result.stocks_analyzed || 0) > 0
        ? (parseInt(result.stocks_passed || 0) / parseInt(result.stocks_analyzed || 1)) * 100
        : 0,
      lastScanTime: result.scan_date || result.scanDate,
      scanDuration: parseInt(result.scan_duration_seconds || 0),
      // Pass through other fields as-is (including failure counts which validation code handles)
      ...result
    };
  }

  async getStocksFromLatestScan(_page: number = 1, _limit: number = 10): Promise<{ stocks: any[], total: number }> {
    const stocks = await this.stockRepository.getStocksFromLatestScan();
    const total = stocks.length;
    const startIndex = (_page - 1) * _limit;
    const endIndex = startIndex + _limit;
    const paginatedStocks = stocks.slice(startIndex, endIndex);

    return { stocks: paginatedStocks, total };
  }

  async getSelectedStocks(page: number = 1, limit: number = 10): Promise<{ stocks: any[], total: number }> {
    return await this.stockRepository.getSelectedStocks(page, limit);
  }

  async getAllSelectedStocks(): Promise<any[]> {
    return await this.stockRepository.getAllSelectedStocks();
  }

  async getScanHistory(page: number = 1, limit: number = 10): Promise<{ scans: any[], total: number }> {
    return await this.stockRepository.getScanHistory(page, limit);
  }

  async getAnalysisStatistics(): Promise<any> {
    return await this.stockRepository.getAnalysisStatistics();
  }

  async getMarketAlerts(): Promise<any[]> {
    const alerts: any[] = [];

    try {
      // 1. Check latest scan results
      const latestScan: any = await this.stockRepository.getLatestScanResults();
      if (latestScan) {
        // Handle both snake_case (DB raw) and camelCase (Type definition)
        const scanDateStr = latestScan.scan_date || latestScan.scanDate;
        if (scanDateStr) {
          const scanDate = new Date(scanDateStr);
          const timeDiff = new Date().getTime() - scanDate.getTime();
          const hoursAgo = timeDiff / (1000 * 60 * 60);

          // Only show scan alerts if less than 24 hours old
          if (hoursAgo < 24) {
            // Check for qualifed_count (DB alias) or qualifiedStocks (if mapped)
            const qualifiedCount = latestScan.qualified_count || latestScan.qualifiedStocks || 0;

            alerts.push({
              id: 'scan-complete',
              type: 'info',
              title: 'New scan results available',
              message: `${qualifiedCount} qualified stocks found on ${scanDate.toLocaleDateString()}`,
              timestamp: scanDate.toISOString()
            });
          }
        }
      }

      // 2. Check selected stocks performance/targets
      const selectedStocks = await this.stockRepository.getAllSelectedStocks();

      for (const stock of selectedStocks) {
        const currentPrice = stock.current_price || stock.entry_price;
        const entryPrice = stock.entry_price;
        const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

        // Target hits
        if (currentPrice >= stock.target_1) {
          alerts.push({
            id: `target-${stock.symbol}`,
            type: 'success',
            title: `${stock.symbol} target achieved`,
            message: `Target 1 price of ₹${stock.target_1} reached (Current: ₹${currentPrice})`,
            timestamp: new Date().toISOString()
          });
        }

        // Stop loss warning
        if (currentPrice <= stock.stop_loss) {
          alerts.push({
            id: `stoploss-${stock.symbol}`,
            type: 'error',
            title: `${stock.symbol} stop loss hit`,
            message: `Price dropped below stop loss level of ₹${stock.stop_loss}`,
            timestamp: new Date().toISOString()
          });
        }

        // Significant moves
        if (pnlPercent >= 5) {
          alerts.push({
            id: `gain-${stock.symbol}`,
            type: 'success',
            title: `${stock.symbol} is rallying`,
            message: `Up ${pnlPercent.toFixed(1)}% since entry`,
            timestamp: new Date().toISOString()
          });
        }
      }

    } catch (error) {
      this.logger.error('Error generating alerts:', error);
    }

    return alerts;
  }

  async analyzeSingleStock(symbol: string, lookbackDays: number = 120): Promise<any> {
    this.logger.info(`Analyzing single stock: ${symbol}`);

    // Fetch real price data
    const { bars: dailyBars } = await this.marketDataService.fetchDailyBars(symbol, lookbackDays);

    if (dailyBars.length < 70) {
      return {
        symbol,
        qualified: false,
        score: 0,
        reason: `Insufficient data: ${dailyBars.length} bars (need 70+)`,
        details: null
      };
    }

    // Run real analysis
    const analysisResult = await this.stockAnalysisService.analyzeStock({
      symbol,
      dailyBars
    });

    // If qualified, add target/stoploss info
    if (analysisResult.qualified) {
      const currentPrice = analysisResult.currentPrice || dailyBars[dailyBars.length - 1].close;
      const swingLow = this.targetStoplossService.findSwingLow(dailyBars, 20);
      const stoploss = this.targetStoplossService.calculateInitialStoploss(currentPrice, swingLow);
      const targets = this.targetStoplossService.calculateTargets(currentPrice);

      return {
        ...analysisResult,
        tradingParams: {
          entryPrice: currentPrice,
          stoploss,
          targets,
          swingLow
        }
      };
    }

    return analysisResult;
  }

  async getStockQuote(symbol: string): Promise<any> {
    const quote = await this.marketDataService.fetchCurrentQuote(symbol);

    if (!quote) {
      return {
        symbol,
        error: 'Unable to fetch quote'
      };
    }

    return quote;
  }

  async getRejectedStocksFromLatestScan(page: number = 1, limit: number = 10): Promise<{ stocks: any[], total: number }> {
    const allStocks = await this.stockRepository.getStocksFromLatestScan();

    // Filter for rejected stocks (qualified = false)
    const rejectedStocks = allStocks.filter((stock: any) => !stock.qualified);

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedStocks = rejectedStocks.slice(startIndex, endIndex);

    return {
      stocks: paginatedStocks,
      total: rejectedStocks.length
    };
  }

  async getRecentLogs(_lines: number = 100): Promise<string[]> {
    // Generate dynamic logs based on actual system state
    const logs: string[] = [];
    const now = new Date().toISOString();

    logs.push(`${now} INFO [ScanService] Current status: ${this.isRunning ? 'RUNNING' : 'IDLE'}`);

    // Get latest scan info from database
    try {
      const latestResults: any = await this.stockRepository.getLatestScanResults();
      if (latestResults && (latestResults.scan_date || latestResults.scanDate)) {
        const scanDate = latestResults.scan_date || latestResults.scanDate;
        const totalStocks = latestResults.total_stocks || latestResults.totalStocks || 0;
        const qualifiedStocks = latestResults.qualified_stocks || latestResults.qualifiedStocks || 0;
        logs.push(`${now} INFO [ScanService] Last scan: ${new Date(scanDate).toLocaleString()}`);
        logs.push(`${now} INFO [ScanService] Stocks analyzed: ${totalStocks}`);
        logs.push(`${now} INFO [ScanService] Qualified stocks: ${qualifiedStocks}`);
      } else {
        logs.push(`${now} INFO [ScanService] No previous scans found`);
      }
    } catch {
      logs.push(`${now} WARN [ScanService] Could not fetch scan history`);
    }

    logs.push(`${now} INFO [ScanService] Scheduler: ${this.config.scheduler.scanCron} (${this.config.scheduler.timezone})`);
    logs.push(`${now} INFO [ScanService] Data source: Yahoo Finance API`);
    logs.push(`${now} INFO [ScanService] Analysis: Consolidation + Higher Lows + Volume Pump + Bear Squeeze`);

    return logs;
  }

  /**
   * Run selected scan - fetch price history from a specific date and evaluate performance
   */
  async runSelectedScan(fromDate: Date): Promise<any[]> {
    this.logger.info(`Running selected scan from date: ${fromDate.toISOString()}`);

    const selectedStocks = await this.stockRepository.getAllSelectedStocks();
    const results = [];

    for (const stock of selectedStocks) {
      try {
        // Fetch price history from the entry date
        const priceHistory = await this.marketDataService.fetchPriceHistoryFromDate(
          stock.symbol,
          new Date(stock.scan_date || fromDate)
        );

        // Get current price
        const currentPrice = await this.marketDataService.fetchCurrentPrice(stock.symbol);

        // Evaluate performance
        const performance = this.targetStoplossService.evaluatePerformance(
          stock.symbol,
          stock.entry_price,
          currentPrice,
          priceHistory,
          stock.stop_loss
        );

        results.push({
          ...stock,
          ...performance,
          priceHistory: priceHistory.slice(-30) // Last 30 days for display
        });
      } catch (error) {
        this.logger.error(`Failed to evaluate ${stock.symbol}:`, error);
        results.push({
          ...stock,
          error: 'Failed to fetch data'
        });
      }
    }

    return results;
  }

  // ============================================
  // OBSERVATION QUEUE METHODS
  // ============================================

  /**
   * Get pending observation queue items
   */
  async getObservationQueue(limit: number = 50): Promise<any[]> {
    return this.aiOrchestrator.getObservationQueue(limit);
  }

  /**
   * Process user decision on an observation
   */
  async processObservationDecision(
    observationId: number,
    decision: 'approved' | 'rejected',
    notes?: string,
    reviewedBy?: string
  ): Promise<void> {
    await this.aiOrchestrator.processUserDecision(observationId, decision, notes, reviewedBy);
  }

  /**
   * Get AI statistics
   */
  async getAIStats(): Promise<any> {
    return this.aiOrchestrator.getAIStats();
  }
}