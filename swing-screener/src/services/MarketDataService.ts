// src/services/MarketDataService.ts - Market data with NSE primary + Yahoo fallback

import { BaseService } from './BaseService';
import { DailyBar } from '../types/analysis';
import { EMA } from 'technicalindicators';
import { YahooBrowserService, QuoteData, ChartResult } from './YahooBrowserService';
import { NseDataService, NseQuote } from './NseDataService';

export { QuoteData, ChartResult } from './YahooBrowserService';

export class MarketDataService extends BaseService {
    private yahooBrowser: YahooBrowserService;
    private nseService: NseDataService;
    private nseInitialized = false;
    private nseAvailable = true; // Set to false after repeated failures

    constructor() {
        super('MarketDataService');
        this.yahooBrowser = new YahooBrowserService();
        this.nseService = new NseDataService();

        // Pre-initialize both services
        this.yahooBrowser.initialize().catch(err => {
            this.logger.error('Failed to pre-initialize Yahoo browser:', err);
        });

        this.nseService.initialize().then(() => {
            this.nseInitialized = true;
            this.logger.info('NSE data source initialized (primary)');
        }).catch(err => {
            this.logger.warn('NSE initialization failed, Yahoo will be primary:', err);
            this.nseAvailable = false;
        });
    }

    /**
     * Fetch daily bars AND quote data in a single API call (most efficient)
     * Strategy: Try NSE → fallback to Yahoo
     */
    async fetchDailyBarsWithQuote(symbol: string, days: number = 120): Promise<ChartResult> {
        // NOTE: NSE India completely removed their public /api/historical/cm/equity endpoint
        // resulting in permanent 404s. To prevent 2-second timeouts and warning spam per stock,
        // we instantly use the highly resilient YahooBrowserService for fetching historical bars.
        return await this.yahooBrowser.fetchDailyBarsWithQuote(symbol, days);
    }

    /**
     * Fetch daily OHLCV bars only
     */
    async fetchDailyBars(symbol: string, days: number = 120): Promise<{ bars: DailyBar[]; chartMeta?: any }> {
        // See note above: NSE historical API is offline. Directing to Yahoo.
        return await this.yahooBrowser.fetchDailyBars(symbol, days);
    }

    /**
     * Fetch current quote
     */
    async fetchCurrentQuote(symbol: string): Promise<QuoteData | null> {
        // Try NSE first
        if (this.nseAvailable && this.nseInitialized) {
            try {
                const nseSymbol = this.toNseSymbol(symbol);
                if (nseSymbol) {
                    const quote = await this.nseService.fetchQuote(nseSymbol);

                    if (quote.lastPrice > 0) {
                        return {
                            symbol: nseSymbol,
                            price: quote.lastPrice,
                            change: quote.change,
                            changePercent: quote.pChange,
                            high: quote.dayHigh,
                            low: quote.dayLow,
                            volume: quote.totalTradedVolume,
                            previousClose: quote.previousClose,
                            fiftyTwoWeekHigh: quote.yearHigh,
                            fiftyTwoWeekLow: quote.yearLow,
                            currency: 'INR',
                            exchangeName: 'NSE',
                        };
                    }
                }
            } catch (error: any) {
                this.logger.warn(
                    `[NSE] fetchCurrentQuote failed for ${symbol}, falling back to Yahoo: ${error.message}`,
                );
            }
        }

        return await this.yahooBrowser.fetchCurrentQuote(symbol);
    }

    /**
     * Fetch price history from a specific date
     */
    async fetchPriceHistoryFromDate(symbol: string, fromDate: Date): Promise<DailyBar[]> {
        const daysSinceStart = Math.ceil((Date.now() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
        const { bars } = await this.fetchDailyBars(symbol, Math.max(daysSinceStart + 30, 120));

        const fromDateStr = fromDate.toISOString().split('T')[0];
        return bars.filter(bar => bar.date >= fromDateStr);
    }

    /**
     * Fetch current price for a symbol
     */
    async fetchCurrentPrice(symbol: string): Promise<number> {
        const quote = await this.fetchCurrentQuote(symbol);
        return quote?.price || 0;
    }

    /**
     * Get the underlying NSE data service (for direct access to options, etc.)
     */
    getNseDataService(): NseDataService {
        return this.nseService;
    }

    /**
     * Calculate EMAs from price data
     */
    calculateEMAs(bars: DailyBar[], period: number): number[] {
        const closes = bars.map(bar => bar.close);
        const emaValues = EMA.calculate({ period, values: closes });
        const padding = new Array(period - 1).fill(null as any);
        return [...padding, ...emaValues];
    }

    /**
     * Calculate volume statistics
     */
    calculateVolumeStats(bars: DailyBar[], lookback: number = 20): { averages: number[]; ratios: number[] } {
        const averages: number[] = [];
        const ratios: number[] = [];

        for (let i = 0; i < bars.length; i++) {
            if (i < lookback - 1) {
                averages.push(null as any);
                ratios.push(null as any);
            } else {
                const windowStart = i - lookback + 1;
                const volumeWindow = bars.slice(windowStart, i + 1).map(b => b.volume);
                const avg = volumeWindow.reduce((a, b) => a + b, 0) / lookback;
                averages.push(avg);
                ratios.push(avg > 0 ? bars[i].volume / avg : null as any);
            }
        }

        return { averages, ratios };
    }

    /**
     * Convert Yahoo-style symbols (RELIANCE.NS) to NSE symbols (RELIANCE)
     * Returns null for non-Indian symbols that should use Yahoo
     */
    private toNseSymbol(symbol: string): string | null {
        // Already an NSE symbol (no dots)
        if (!symbol.includes('.')) return symbol;

        // Indian stock on NSE (ends with .NS / .BO)
        if (symbol.endsWith('.NS')) return symbol.replace('.NS', '');
        if (symbol.endsWith('.BO')) return symbol.replace('.BO', '');

        // Non-Indian symbol — use Yahoo only
        return null;
    }

    /**
     * Close all services when done
     */
    async shutdown(): Promise<void> {
        await this.yahooBrowser.close();
    }
}

