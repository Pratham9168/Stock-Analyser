// src/services/YahooBrowserService.ts - Yahoo Finance data using Puppeteer (Chart API only)

import puppeteer from 'puppeteer-extra';
import type { Browser, Page } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { BaseService } from './BaseService';
import { DailyBar } from '../types/analysis';

// Add stealth plugin to evade detection
puppeteer.use(StealthPlugin());

export interface QuoteData {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    high: number;
    low: number;
    volume: number;
    previousClose: number;
    fiftyTwoWeekHigh: number;
    fiftyTwoWeekLow: number;
    currency: string;
    exchangeName: string;
    rawData?: any;
}

export interface ChartResult {
    bars: DailyBar[];
    quote: QuoteData | null;
    chartMeta: any;
}

export class YahooBrowserService extends BaseService {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private initPromise: Promise<void> | null = null;

    // Rate limiting
    private lastRequestTime: number = 0;
    private readonly MIN_DELAY_MS = 1500;

    constructor() {
        super('YahooBrowserService');
    }

    async initialize(): Promise<void> {
        if (this.browser && this.page) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = this.doInitialize();
        await this.initPromise;
        this.initPromise = null;
    }

    private async doInitialize(): Promise<void> {
        try {
            this.logger.info('Launching browser for Yahoo Finance...');

            this.browser = await puppeteer.launch({
                headless: "new",
                protocolTimeout: 300000,
                ...(process.env.PUPPETEER_EXECUTABLE_PATH && {
                    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
                }),
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1920,1080'
                ]
            });

            this.page = await this.browser.newPage();
            await this.page.setUserAgent(
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            );
            await this.page.setViewport({ width: 1920, height: 1080 });

            // Aggressive block of ads, images, and subframes to prevent background crashes
            await this.page.setRequestInterception(true);
            this.page.on('request', (req) => {
                if (req.isInterceptResolutionHandled()) return;
                const type = req.resourceType();
                // Block all subframes (ads) and non-essential resources permanently
                if (['image', 'stylesheet', 'font', 'media', 'other'].includes(type) || 
                   (type === 'document' && req.frame() !== this.page!.mainFrame())) {
                    req.abort().catch(() => {});
                } else {
                    req.continue().catch(() => {});
                }
            });

            // Establish session
            this.logger.info('Establishing Yahoo Finance session...');
            await this.page.goto('https://finance.yahoo.com/', {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });
            await new Promise(r => setTimeout(r, 3000));

            this.logger.info('✅ Yahoo Finance browser ready!');
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`Browser init failed: ${msg}`);
            await this.close();
            throw error;
        }
    }

    private async waitForRateLimit(): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < this.MIN_DELAY_MS) {
            await new Promise(r => setTimeout(r, this.MIN_DELAY_MS - elapsed));
        }
        this.lastRequestTime = Date.now();
    }

    private async browserFetch(url: string): Promise<any> {
        await this.initialize();
        await this.waitForRateLimit();

        if (!this.page) throw new Error('Browser page not available');

        const result = await this.page.evaluate(async (fetchUrl: string) => {
            try {
                const response = await fetch(fetchUrl, {
                    credentials: 'include',
                    headers: { 'Accept': 'application/json' }
                });
                if (!response.ok) {
                    return { error: `HTTP ${response.status}`, status: response.status };
                }
                return { data: await response.json(), status: response.status };
            } catch (e: any) {
                return { error: e.message || String(e), status: 0 };
            }
        }, url);

        if (result.error) throw new Error(`Yahoo API: ${result.error}`);
        return result.data;
    }

    private formatSymbol(symbol: string): string {
        if (symbol.includes('.') || symbol.startsWith('^')) return symbol;
        return `${symbol}.NS`;
    }

    /**
     * Fetch daily bars AND quote data from a single Chart API call
     * This is the ONLY Yahoo API we use - it's the most reliable
     */
    async fetchDailyBarsWithQuote(symbol: string, days: number = 120): Promise<ChartResult> {
        const yahooSymbol = this.formatSymbol(symbol);

        try {
            this.logger.info(`Fetching ${days} days for ${yahooSymbol}...`);

            const endDate = Math.floor(Date.now() / 1000);
            const startDate = endDate - (days * 24 * 60 * 60);

            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?period1=${startDate}&period2=${endDate}&interval=1d`;

            const data = await this.browserFetch(url);

            if (!data.chart?.result?.[0]) {
                this.logger.warn(`No chart data for ${yahooSymbol}`);
                return { bars: [], quote: null, chartMeta: null };
            }

            const result = data.chart.result[0];
            const meta = result.meta || {};
            const timestamps = result.timestamp || [];
            const ohlcv = result.indicators?.quote?.[0] || {};

            // Build daily bars
            const bars: DailyBar[] = [];
            for (let i = 0; i < timestamps.length; i++) {
                if (ohlcv.open?.[i] != null && ohlcv.close?.[i] != null) {
                    bars.push({
                        date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
                        open: ohlcv.open[i],
                        high: ohlcv.high[i],
                        low: ohlcv.low[i],
                        close: ohlcv.close[i],
                        volume: ohlcv.volume?.[i] || 0
                    });
                }
            }

            // Extract quote data from chart meta (Chart API includes current price!)
            const lastBar = bars.length > 0 ? bars[bars.length - 1] : null;
            const currentPrice = meta.regularMarketPrice || lastBar?.close || 0;
            const previousClose = meta.chartPreviousClose || meta.previousClose || (bars.length > 1 ? bars[bars.length - 2]?.close : 0);
            const change = currentPrice - previousClose;
            const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

            const quote: QuoteData = {
                symbol: symbol,
                price: currentPrice,
                change: change,
                changePercent: changePercent,
                high: meta.regularMarketDayHigh || lastBar?.high || 0,
                low: meta.regularMarketDayLow || lastBar?.low || 0,
                volume: meta.regularMarketVolume || lastBar?.volume || 0,
                previousClose: previousClose,
                fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || 0,
                fiftyTwoWeekLow: meta.fiftyTwoWeekLow || 0,
                currency: meta.currency || 'INR',
                exchangeName: meta.exchangeName || 'NSE',
                rawData: meta
            };

            this.logger.info(`✅ Got ${bars.length} bars + quote for ${yahooSymbol} (₹${currentPrice.toFixed(2)})`);
            return { bars, quote, chartMeta: meta };

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to fetch ${yahooSymbol}: ${msg}`);
            return { bars: [], quote: null, chartMeta: null };
        }
    }

    /**
     * Legacy method - now just calls fetchDailyBarsWithQuote
     */
    async fetchDailyBars(symbol: string, days: number = 120): Promise<{ bars: DailyBar[]; chartMeta?: any }> {
        const result = await this.fetchDailyBarsWithQuote(symbol, days);
        return { bars: result.bars, chartMeta: result.chartMeta };
    }

    /**
     * Fetch current quote (extracted from Chart API)
     */
    async fetchCurrentQuote(symbol: string): Promise<QuoteData | null> {
        const result = await this.fetchDailyBarsWithQuote(symbol, 5); // Only need a few days for quote
        return result.quote;
    }

    async close(): Promise<void> {
        if (this.browser) {
            this.logger.info('Closing Yahoo browser...');
            await this.browser.close().catch(() => { });
            this.browser = null;
            this.page = null;
        }
    }
}
