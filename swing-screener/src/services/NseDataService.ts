// src/services/NseDataService.ts — NSE India data fetcher
// Replicates NseIndiaApi endpoints in TypeScript using NseSessionService

import { BaseService } from './BaseService';
import { NseSessionService } from './NseSessionService';

// ── Types ────────────────────────────────────────────────────────

export interface NseQuote {
  symbol: string;
  companyName: string;
  industry?: string;
  lastPrice: number;
  change: number;
  pChange: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  previousClose: number;
  totalTradedVolume: number;
  totalTradedValue: number;
  yearHigh: number;
  yearLow: number;
  ffmc?: number;
  nearWKH?: number;
  nearWKL?: number;
}

export interface NseOptionData {
  strikePrice: number;
  expiryDate: string;
  CE?: NseOptionLeg;
  PE?: NseOptionLeg;
}

export interface NseOptionLeg {
  strikePrice: number;
  expiryDate: string;
  underlying: string;
  openInterest: number;
  changeinOpenInterest: number;
  pchangeinOpenInterest: number;
  totalTradedVolume: number;
  impliedVolatility: number;
  lastPrice: number;
  change: number;
  pChange: number;
  totalBuyQuantity: number;
  totalSellQuantity: number;
  bidQty: number;
  bidprice: number;
  askQty: number;
  askPrice: number;
  underlyingValue: number;
}

export interface NseOptionChain {
  records: {
    expiryDates: string[];
    data: NseOptionData[];
    timestamp: string;
    underlyingValue: number;
    strikePrices: number[];
  };
  filtered?: {
    data: NseOptionData[];
    CE: { totOI: number; totVol: number };
    PE: { totOI: number; totVol: number };
  };
}

export interface NseHistoricalData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface NseMarketMover {
  symbol: string;
  series: string;
  open: number;
  dayHigh: number;
  dayLow: number;
  lastPrice: number;
  previousClose: number;
  change: number;
  pChange: number;
  totalTradedVolume: number;
  totalTradedValue: number;
  yearHigh: number;
  yearLow: number;
}

export interface FnoLotSizes {
  [symbol: string]: number;
}

export interface MaxPainResult {
  maxPainStrike: number;
  expiryDate: string;
  callPainTotal: number;
  putPainTotal: number;
}

export interface CompiledOptionChain {
  symbol: string;
  expiryDate: string;
  underlyingValue: number;
  maxPain: number;
  atmStrike: number;
  totalCallOI: number;
  totalPutOI: number;
  pcrRatio: number;
  maxCallOIStrike: number;
  maxPutOIStrike: number;
  data: NseOptionData[];
}

// List of index option symbols
const INDEX_OPTIONS = ['banknifty', 'nifty', 'finnifty', 'niftyit'];

// ── Service ──────────────────────────────────────────────────────

export class NseDataService extends BaseService {
  private session: NseSessionService;

  constructor(session?: NseSessionService) {
    super('NseDataService');
    this.session = session || new NseSessionService();
  }

  /**
   * Initialize the service (starts NSE session)
   */
  async initialize(): Promise<void> {
    await this.session.initSession();
    this.logger.info('NseDataService initialized');
  }

  // ── Equity Data ──────────────────────────────────────────────

  /**
   * Get quote for an equity symbol
   * Endpoint: /api/quote-equity?symbol=RELIANCE
   */
  async fetchQuote(symbol: string): Promise<NseQuote> {
    const raw = await this.session.request<any>(
      `${this.session.apiUrl}/quote-equity`,
      { symbol: symbol.toUpperCase() },
    );

    return {
      symbol: raw.info?.symbol || symbol.toUpperCase(),
      companyName: raw.info?.companyName || '',
      industry: raw.info?.industry || '',
      lastPrice: raw.priceInfo?.lastPrice ?? 0,
      change: raw.priceInfo?.change ?? 0,
      pChange: raw.priceInfo?.pChange ?? 0,
      open: raw.priceInfo?.open ?? 0,
      dayHigh: raw.priceInfo?.intraDayHighLow?.max ?? 0,
      dayLow: raw.priceInfo?.intraDayHighLow?.min ?? 0,
      previousClose: raw.priceInfo?.previousClose ?? 0,
      totalTradedVolume: raw.securityWiseDP?.quantityTraded ?? 0,
      totalTradedValue: raw.securityWiseDP?.tradedValue ?? 0,
      yearHigh: raw.priceInfo?.weekHighLow?.max ?? 0,
      yearLow: raw.priceInfo?.weekHighLow?.min ?? 0,
    };
  }

  /**
   * Get detailed equity trade info
   * Endpoint: /api/quote-equity?symbol=RELIANCE&section=trade_info
   */
  async fetchEquityTradeInfo(symbol: string): Promise<any> {
    return this.session.request(
      `${this.session.apiUrl}/quote-equity`,
      { symbol: symbol.toUpperCase(), section: 'trade_info' },
    );
  }

  /**
   * Lookup a stock by name or symbol
   * Endpoint: /api/search/autocomplete?q=reliance
   */
  async lookup(query: string): Promise<any> {
    return this.session.request(
      `${this.session.apiUrl}/search/autocomplete`,
      { q: query },
    );
  }

  // ── Historical Data ──────────────────────────────────────────

  /**
   * Fetch historical OHLCV data for an equity
   * Endpoint: /api/historical/cm/equity?symbol=RELIANCE
   * NSE limits to 365 days per request; this auto-chunks larger ranges
   */
  async fetchHistoricalData(
    symbol: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<NseHistoricalData[]> {
    const chunks = this.splitDateRange(fromDate, toDate, 365);
    const allData: NseHistoricalData[] = [];

    for (const [start, end] of chunks) {
      const raw = await this.session.request<any>(
        `${this.session.apiUrl}/historical/cm/equity`,
        {
          symbol: symbol.toUpperCase(),
          series: '[%22EQ%22]',
          from: this.formatDate(start),
          to: this.formatDate(end),
        },
      );

      if (raw?.data && Array.isArray(raw.data)) {
        for (const row of raw.data) {
          allData.push({
            date: row.CH_TIMESTAMP || row.TIMESTAMP || '',
            open: parseFloat(row.CH_OPENING_PRICE || row.OPEN || '0'),
            high: parseFloat(row.CH_TRADE_HIGH_PRICE || row.HIGH || '0'),
            low: parseFloat(row.CH_TRADE_LOW_PRICE || row.LOW || '0'),
            close: parseFloat(row.CH_CLOSING_PRICE || row.CLOSE || '0'),
            volume: parseInt(row.CH_TOT_TRADED_QTY || row.VOLUME || '0', 10),
          });
        }
      }
    }

    return allData;
  }

  // ── Option Chain ─────────────────────────────────────────────

  /**
   * Fetch raw option chain
   * Endpoint: /api/option-chain-v3?symbol=NIFTY&type=Indices
   * Reference: NseIndiaApi.optionChain()
   */
  async fetchOptionChain(
    symbol: string,
    expiryDate?: string,
  ): Promise<NseOptionChain> {
    const symbolLower = symbol.toLowerCase();
    const isIndex = INDEX_OPTIONS.includes(symbolLower);

    const params: Record<string, string> = {
      symbol: symbol.toUpperCase(),
      type: isIndex ? 'Indices' : 'Equity',
    };

    // If no expiry specified, get nearest expiry first
    if (!expiryDate) {
      const contractInfo = await this.session.request<any>(
        `${this.session.apiUrl}/option-chain-contract-info`,
        { symbol: symbol.toUpperCase() },
      );

      if (contractInfo?.expiryDates?.length > 0) {
        expiryDate = contractInfo.expiryDates[0]; // Nearest expiry
      }
    }

    if (expiryDate) {
      params.expiry = expiryDate;
    }

    return this.session.request<NseOptionChain>(
      `${this.session.apiUrl}/option-chain-v3`,
      params,
    );
  }

  /**
   * Calculate max pain from option chain data
   * Uses prefix sums for O(n) performance (replicated from NseIndiaApi.maxpain)
   */
  calculateMaxPain(optionChain: NseOptionChain, expiryDate: string): MaxPainResult {
    const data = optionChain.records.data;

    // Filter by expiry and extract OI + strikes
    const ceOI: number[] = [];
    const peOI: number[] = [];
    const strikes: number[] = [];

    for (const row of data) {
      if (row.expiryDate !== expiryDate) continue;

      ceOI.push(row.CE?.openInterest ?? 0);
      peOI.push(row.PE?.openInterest ?? 0);
      strikes.push(row.strikePrice);
    }

    const n = strikes.length;
    if (n === 0) {
      return { maxPainStrike: 0, expiryDate, callPainTotal: 0, putPainTotal: 0 };
    }

    // Prefix sums
    const ceSum = new Array(n).fill(0);
    const peSum = new Array(n).fill(0);
    const ceVal = new Array(n).fill(0);
    const peVal = new Array(n).fill(0);

    for (let i = 0; i < n; i++) {
      ceSum[i] = (i > 0 ? ceSum[i - 1] : 0) + ceOI[i];
      ceVal[i] = (i > 0 ? ceVal[i - 1] : 0) + ceOI[i] * strikes[i];
      peSum[i] = (i > 0 ? peSum[i - 1] : 0) + peOI[i];
      peVal[i] = (i > 0 ? peVal[i - 1] : 0) + peOI[i] * strikes[i];
    }

    let minPayout = Infinity;
    let maxPainStrike = strikes[0];
    let bestCallPain = 0;
    let bestPutPain = 0;

    for (let i = 0; i < n; i++) {
      const settlement = strikes[i];

      // Call pain for strikes < settlement
      const callPain = settlement * ceSum[i] - ceVal[i];

      // Put pain for strikes > settlement
      const putPain =
        (peVal[n - 1] - peVal[i]) - settlement * (peSum[n - 1] - peSum[i]);

      const totalPain = callPain + putPain;

      if (totalPain < minPayout) {
        minPayout = totalPain;
        maxPainStrike = settlement;
        bestCallPain = callPain;
        bestPutPain = putPain;
      }
    }

    return {
      maxPainStrike,
      expiryDate,
      callPainTotal: bestCallPain,
      putPainTotal: bestPutPain,
    };
  }

  /**
   * Compile option chain with statistics (PCR, max pain, max OI strikes)
   */
  async compileOptionChain(
    symbol: string,
    expiryDate?: string,
  ): Promise<CompiledOptionChain> {
    const chain = await this.fetchOptionChain(symbol, expiryDate);
    const expiry = expiryDate || chain.records.expiryDates[0] || '';
    const underlyingValue = chain.records.underlyingValue;

    // Filter by expiry
    const filteredData = chain.records.data.filter(
      (row) => row.expiryDate === expiry,
    );

    // Calculate totals and find max OI strikes
    let totalCallOI = 0;
    let totalPutOI = 0;
    let maxCallOI = 0;
    let maxPutOI = 0;
    let maxCallOIStrike = 0;
    let maxPutOIStrike = 0;
    let atmStrike = filteredData[0]?.strikePrice ?? 0;
    let minAtmDiff = Infinity;

    for (const row of filteredData) {
      const ceOI = row.CE?.openInterest ?? 0;
      const peOI = row.PE?.openInterest ?? 0;

      totalCallOI += ceOI;
      totalPutOI += peOI;

      if (ceOI > maxCallOI) {
        maxCallOI = ceOI;
        maxCallOIStrike = row.strikePrice;
      }
      if (peOI > maxPutOI) {
        maxPutOI = peOI;
        maxPutOIStrike = row.strikePrice;
      }

      // Find ATM strike
      const diff = Math.abs(row.strikePrice - underlyingValue);
      if (diff < minAtmDiff) {
        minAtmDiff = diff;
        atmStrike = row.strikePrice;
      }
    }

    const maxPain = this.calculateMaxPain(chain, expiry);
    const pcrRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;

    return {
      symbol: symbol.toUpperCase(),
      expiryDate: expiry,
      underlyingValue,
      maxPain: maxPain.maxPainStrike,
      atmStrike,
      totalCallOI,
      totalPutOI,
      pcrRatio: Math.round(pcrRatio * 10000) / 10000,
      maxCallOIStrike,
      maxPutOIStrike,
      data: filteredData,
    };
  }

  // ── F&O Data ─────────────────────────────────────────────────

  /**
   * Get F&O lot sizes
   * Endpoint: https://nsearchives.nseindia.com/content/fo/fo_mktlots.csv
   */
  async fetchFnoLots(): Promise<FnoLotSizes> {
    const csv = await this.session.requestRaw(
      `${this.session.archiveUrl}/content/fo/fo_mktlots.csv`,
    );

    const lots: FnoLotSizes = {};
    const lines = csv.trim().split('\n');

    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length < 4) continue;

      const sym = parts[1]?.trim();
      const lot = parseInt(parts[3]?.trim(), 10);

      if (sym && !isNaN(lot) && lot > 0) {
        lots[sym] = lot;
      }
    }

    return lots;
  }

  /**
   * Get futures expiry dates
   * Endpoint: /api/liveEquity-derivatives?index=nse50_fut
   */
  async fetchFuturesExpiry(
    index: 'nifty' | 'banknifty' | 'finnifty' = 'nifty',
  ): Promise<string[]> {
    const indexMap: Record<string, string> = {
      banknifty: 'nifty_bank_fut',
      finnifty: 'finnifty_fut',
      nifty: 'nse50_fut',
    };

    const raw = await this.session.request<any>(
      `${this.session.apiUrl}/liveEquity-derivatives`,
      { index: indexMap[index] || 'nse50_fut' },
    );

    if (!raw?.data) return [];

    const expiryDates = raw.data.map((item: any) => item.expiryDate as string);

    // Sort by date
    return expiryDates.sort(
      (a: string, b: string) =>
        new Date(a).getTime() - new Date(b).getTime(),
    );
  }

  /**
   * List F&O eligible stocks
   * Endpoint: /api/equity-stock?index=SECURITIES IN F%26O
   */
  async fetchFnoStocks(): Promise<NseMarketMover[]> {
    const raw = await this.session.request<any>(
      `${this.session.apiUrl}/equity-stock`,
      { index: 'SECURITIES IN F%26O' },
    );

    return raw?.data ?? [];
  }

  // ── Market Data ──────────────────────────────────────────────

  /**
   * Get market status
   * Endpoint: /api/marketStatus
   */
  async fetchMarketStatus(): Promise<any> {
    const raw = await this.session.request<any>(
      `${this.session.apiUrl}/marketStatus`,
    );
    return raw?.marketState ?? raw;
  }

  /**
   * List stocks by index
   * Endpoint: /api/equity-stock?index=NIFTY 50
   */
  async fetchStocksByIndex(index: string = 'NIFTY 50'): Promise<any> {
    return this.session.request(
      `${this.session.apiUrl}/equity-stock`,
      { index },
    );
  }

  /**
   * Fetch all active equities from the NSE Archives (EQUITY_L.csv)
   * This yields ~2,100 active stocks (EQ series).
   */
  async fetchAllActiveEquities(): Promise<{ symbol: string; companyName: string }[]> {
    try {
      const response = await fetch('https://archives.nseindia.com/content/equities/EQUITY_L.csv');
      if (!response.ok) {
        throw new Error(`Failed to fetch EQUITY_L.csv: ${response.status}`);
      }
      
      const csvText = await response.text();
      const lines = csvText.split('\n');
      const stocks: { symbol: string; companyName: string }[] = [];
      
      // Skip header line (index 0)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const cols = line.split(',');
        if (cols.length >= 3) {
          const symbol = cols[0]?.trim();
          const name = cols[1]?.trim();
          const series = cols[2]?.trim();
          
          // Only include standard equity series ('EQ', 'BE', 'SM', etc. - typically EQ is the primary)
          // We include 'EQ' and 'BE' (Book Entry - trade to trade) as they are active stocks
          if (symbol && (series === 'EQ' || series === 'BE' || series === 'SM')) {
            stocks.push({ symbol, companyName: name || symbol });
          }
        }
      }
      
      return stocks;
    } catch (e) {
      this.logger.error('Error fetching all active equities from NSE', e);
      return [];
    }
  }

  /**
   * Get top gainers from an index
   */
  async fetchGainers(index: string = 'NIFTY 50', count?: number): Promise<NseMarketMover[]> {
    const raw = await this.fetchStocksByIndex(index);
    const data = (raw?.data ?? []) as NseMarketMover[];

    const gainers = data
      .filter((s) => s.pChange > 0)
      .sort((a, b) => b.pChange - a.pChange);

    return count ? gainers.slice(0, count) : gainers;
  }

  /**
   * Get top losers from an index
   */
  async fetchLosers(index: string = 'NIFTY 50', count?: number): Promise<NseMarketMover[]> {
    const raw = await this.fetchStocksByIndex(index);
    const data = (raw?.data ?? []) as NseMarketMover[];

    const losers = data
      .filter((s) => s.pChange < 0)
      .sort((a, b) => a.pChange - b.pChange);

    return count ? losers.slice(0, count) : losers;
  }

  /**
   * Get advance/decline data
   * Endpoint: /api/allIndices
   */
  async fetchAdvanceDecline(): Promise<any> {
    return this.session.request(`${this.session.apiUrl}/allIndices`);
  }

  /**
   * Get FII/DII Trading Activity
   * Endpoint: /api/fiidiiTradeReact
   */
  async fetchFiiDiiTrade(): Promise<any[]> {
    try {
      return await this.session.request(`${this.session.apiUrl}/fiidiiTradeReact`);
    } catch {
      return []; // Fallback empty if NSE endpoint is offline/changed
    }
  }

  // ── Insider Activity ─────────────────────────────────────────

  /**
   * Get block deals
   * Endpoint: /api/block-deal
   */
  async fetchBlockDeals(): Promise<any> {
    return this.session.request(`${this.session.apiUrl}/block-deal`);
  }

  /**
   * Get bulk deals
   * Endpoint: /api/corporates-bulk-deals
   */
  async fetchBulkDeals(): Promise<any> {
    return this.session.request(`${this.session.apiUrl}/corporates-bulk-deals`);
  }

  /**
   * Get shareholding pattern for a stock
   * Endpoint: /api/corporate-shareholding?symbol=RELIANCE
   */
  async fetchShareholding(symbol: string): Promise<any> {
    return this.session.request(
      `${this.session.apiUrl}/corporate-shareholding`,
      { symbol: symbol.toUpperCase() },
    );
  }

  // ── Corporate Events ─────────────────────────────────────────

  /**
   * Get corporate actions (dividends, bonuses, splits)
   * Endpoint: /api/corporates-corporateActions?index=equities
   */
  async fetchCorporateActions(
    symbol?: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<any> {
    const params: Record<string, string> = { index: 'equities' };

    if (symbol) params.symbol = symbol.toUpperCase();
    if (fromDate) params.from_date = this.formatDate(fromDate);
    if (toDate) params.to_date = this.formatDate(toDate);

    return this.session.request(
      `${this.session.apiUrl}/corporates-corporateActions`,
      params,
    );
  }

  /**
   * Get board meetings
   * Endpoint: /api/corporate-board-meetings?index=equities
   */
  async fetchBoardMeetings(symbol?: string): Promise<any> {
    const params: Record<string, string> = { index: 'equities' };
    if (symbol) params.symbol = symbol.toUpperCase();

    return this.session.request(
      `${this.session.apiUrl}/corporate-board-meetings`,
      params,
    );
  }

  // ── Health Check ─────────────────────────────────────────────

  /**
   * Check if service can reach NSE
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.fetchMarketStatus();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the underlying session service
   */
  getSession(): NseSessionService {
    return this.session;
  }

  /**
   * Check if NSE is available (circuit breaker).
   * Returns false after 5+ consecutive failures — callers should skip NSE.
   */
  isAvailable(): boolean {
    return this.session.isAvailable();
  }

  // ── Helpers ──────────────────────────────────────────────────

  /**
   * Format Date to dd-mm-yyyy (NSE format)
   */
  private formatDate(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  /**
   * Split a date range into chunks of max N days
   * (NSE limits historical data to 365 days per request)
   */
  private splitDateRange(
    from: Date,
    to: Date,
    maxDays: number = 365,
  ): [Date, Date][] {
    const chunks: [Date, Date][] = [];
    let currentStart = new Date(from);

    while (currentStart <= to) {
      const currentEnd = new Date(currentStart);
      currentEnd.setDate(currentEnd.getDate() + maxDays - 1);

      if (currentEnd > to) {
        currentEnd.setTime(to.getTime());
      }

      chunks.push([new Date(currentStart), new Date(currentEnd)]);
      currentStart = new Date(currentEnd);
      currentStart.setDate(currentStart.getDate() + 1);
    }

    return chunks;
  }
}
