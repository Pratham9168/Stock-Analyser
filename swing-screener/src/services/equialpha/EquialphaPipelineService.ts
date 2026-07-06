import { EquialphaRepository } from '../../repositories/EquialphaRepository';
import { EquialphaScoresRepository } from '../../repositories/EquialphaScoresRepository';
import { NseDataService } from '../NseDataService';
import { YahooBrowserService } from '../YahooBrowserService';
import { ScraperService } from '../ScraperService';
import { getParentSector } from './sectorMapping';
import { EmaCalculator } from './EmaCalculator';
import { RsRatingCalculator } from './RsRatingCalculator';
import { EquialphaScoreService } from './EquialphaScoreService';

export class EquialphaPipelineService {
  constructor(
    private repo: EquialphaRepository,
    private scoresRepo: EquialphaScoresRepository,
    private nse: NseDataService,
    private yahoo: YahooBrowserService,
    private scraper: ScraperService,
    private scoreEngine: EquialphaScoreService
  ) {}

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private parseValue(val: any): number {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return parseFloat(val.replace(/,/g, '')) || 0;
    return 0;
  }

  async runPipeline(customDate?: string, runSync: boolean = false): Promise<number> {
    // Auto-fail any orphaned 'running' pipelines from previous crashes
    const cleaned = await this.repo.cleanupOrphanedRuns();
    if (cleaned > 0) console.log(`[Pipeline] Cleaned up ${cleaned} orphaned pipeline run(s)`);

    const pipelineId = await this.repo.createPipelineRun();

    const promise = this.executePipelineAsync(pipelineId, customDate).catch(async (error) => {
      console.error('[EquialphaPipeline] FATAL ERROR:', error);
      await this.repo.failPipelineRun(pipelineId, error.message || String(error));
    });

    if (runSync) {
      await promise;
    }

    return pipelineId;
  }

  /**
   * Safely extract stock list from the raw NSE index response.
   * fetchStocksByIndex returns { data: NseMarketMover[], metadata: {...} }.
   */
  private extractStocksFromIndex(raw: any): Array<{ symbol: string; companyName: string; industry: string }> {
    if (!raw) return [];
    const arr = raw?.data ?? raw;
    if (!Array.isArray(arr)) return [];
    return arr.map((item: any) => ({
      symbol: item.symbol || item.meta?.symbol || '',
      companyName: item.companyName || item.meta?.companyName || item.symbol || '',
      industry: item.industry || item.meta?.industry || ''
    })).filter((s: any) => s.symbol);
  }
  
  /**
   * Enriches the local database universe by fetching public NSE index CSVs 
   * which contain reliable industry classifications.
   */
  async enrichUniverseFromNseCSV(universeInMem?: Array<{ symbol: string; company_name: string; industry: string; sector: string }>): Promise<void> {
    const urls = [
      'https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv',
      'https://nsearchives.nseindia.com/content/indices/ind_niftymidcap150list.csv',
      'https://nsearchives.nseindia.com/content/indices/ind_niftysmallcap250list.csv',
      'https://nsearchives.nseindia.com/content/indices/ind_niftymicrocap250_list.csv'
    ];
    
    let updatedCount = 0;
    console.log('[EquialphaPipeline] Starting CSV-based sector enrichment...');
    
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/csv,text/plain,*/*'
          }
        });
        if (!res.ok) continue;
        const text = await res.text();
        const lines = text.split('\n');
        
        // Process each line
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          // Regex to properly split CSV respecting double quotes
          const cols = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
          // Fallback to naive split if regex fails, but read from end to avoid company name commas
          const naiveCols = line.split(',');
          
          if (naiveCols.length >= 3) {
            // cols[length - 4] is Industry, cols[length - 3] is Symbol in these CSVs
            // Example: "360 ONE WAM Ltd.","Financial Services","360ONE","EQ","INE466L01038"
            const symIndex = naiveCols.length - 3;
            const indIndex = naiveCols.length - 4;
            
            let industry = naiveCols[indIndex]?.replace(/^"|"$/g, '').trim();
            let symbol = naiveCols[symIndex]?.replace(/^"|"$/g, '').trim();
            
            if (symbol && industry) {
              const sector = getParentSector(industry);
              // Update in memory if provided so the rest of the pipeline uses it
              if (universeInMem) {
                const memStock = universeInMem.find(s => s.symbol === symbol);
                if (memStock) {
                  memStock.industry = industry;
                  memStock.sector = sector;
                }
              }
              // We directly update the database for these stocks
              await this.repo.updateStockIndustry(symbol, industry, sector);
              updatedCount++;
            }
          }
        }
      } catch (e) {
        console.warn(`[EquialphaPipeline] Failed to process CSV ${url}:`, e);
      }
    }
    
    console.log(`[EquialphaPipeline] CSV Enrichment complete. Updated ~${updatedCount} sector references.`);
  }

  /**
   * Helper to accurately count missing weekdays between two dates.
   * Returns > 0 if there's a missing trading day gap.
   */
  private getWeekdaysBetween(d1: Date, d2: Date): number {
    let count = 0;
    const cur = new Date(d1);
    cur.setUTCDate(cur.getUTCDate() + 1); // start from day after d1
    cur.setUTCHours(0, 0, 0, 0);
    const end = new Date(d2);
    end.setUTCHours(0, 0, 0, 0);

    while (cur < end) {
      const day = cur.getUTCDay();
      if (day !== 0 && day !== 6) count++;
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return count;
  }

  private async executePipelineAsync(pipelineId: number, customDate?: string) {
    let processed = 0;
    const today = customDate || new Date().toISOString().split('T')[0];

    // ==========================================
    // STEP 1: REFRESH UNIVERSE
    // ==========================================
    await this.repo.updatePipelineProgress(pipelineId, 5, 'Refreshing Universe...', 0, 1985);

    let n500Raw: any = null;
    let m150Raw: any = null;
    let s250Raw: any = null;

    try {
      n500Raw = await this.nse.fetchStocksByIndex("NIFTY 500");
      await this.sleep(2000);
    } catch (e) {
      console.warn('NIFTY 500 fetch failed, skipping', e);
    }

    try {
      m150Raw = await this.nse.fetchStocksByIndex("NIFTY MIDCAP 150");
      await this.sleep(2000);
    } catch (e) {
      console.warn('NIFTY MIDCAP 150 fetch failed, skipping', e);
    }

    try {
      s250Raw = await this.nse.fetchStocksByIndex("NIFTY SMLCAP 250");
      await this.sleep(2000);
    } catch (e) {
      console.warn('NIFTY SMLCAP 250 fetch failed, skipping', e);
    }

    let micro250Raw: any = null;
    try {
      micro250Raw = await this.nse.fetchStocksByIndex("NIFTY MICROCAP 250");
      await this.sleep(2000);
    } catch (e) {
      console.warn('NIFTY MICROCAP 250 index not available, skipping');
    }

    // FIX BUG 3: fetchFnoStocks returns NseMarketMover[], not string[]
    let fnoStocks: any[] = [];
    try {
      fnoStocks = await this.nse.fetchFnoStocks();
      await this.sleep(2000);
    } catch (e) {
      console.warn('FNO stocks fetch failed, skipping');
    }

    const uniqueSymbols = new Set<string>();
    const masterList: Array<{ symbol: string; companyName: string; industry: string }> = [];

    const addStocks = (list: Array<{ symbol: string; companyName: string; industry: string }>) => {
      for (const st of list) {
        if (st.symbol && !uniqueSymbols.has(st.symbol)) {
          uniqueSymbols.add(st.symbol);
          masterList.push(st);
        }
      }
    };

    addStocks(this.extractStocksFromIndex(n500Raw));
    addStocks(this.extractStocksFromIndex(m150Raw));
    addStocks(this.extractStocksFromIndex(s250Raw));
    if (micro250Raw) addStocks(this.extractStocksFromIndex(micro250Raw));

    // FNO stocks are NseMarketMover objects with .symbol property
    for (const fnoStock of fnoStocks) {
      const sym = typeof fnoStock === 'string' ? fnoStock : fnoStock.symbol;
      if (sym && !uniqueSymbols.has(sym)) {
        uniqueSymbols.add(sym);
        masterList.push({ symbol: sym, companyName: fnoStock.companyName || sym, industry: fnoStock.industry || '' });
      }
    }

    // Add ALL remaining NSE Equities (this expands the ~750 stocks from indices to ~2,100 total listed stocks)
    try {
      const allActiveEquities = await this.nse.fetchAllActiveEquities();
      for (const equity of allActiveEquities) {
        if (equity.symbol && !uniqueSymbols.has(equity.symbol)) {
          uniqueSymbols.add(equity.symbol);
          masterList.push({ symbol: equity.symbol, companyName: equity.companyName, industry: 'Unmapped' });
        }
      }
    } catch (e) {
      console.warn('Failed to fetch full EQUITY_L list, continuing with indexed stocks only', e);
    }

    console.log(`[EquialphaPipeline] Universe: ${masterList.length} unique stocks`);

    // Apply overrides for sector/industry classification
    const overrides = await this.repo.getStockOverrides();
    let finalUniverse = masterList.map(stock => {
      const override = overrides[stock.symbol];
      const industry = override?.industry || stock.industry || 'Unmapped';
      const sector = override?.sector || getParentSector(industry);

      return {
        symbol: stock.symbol,
        company_name: stock.companyName || stock.symbol,
        industry,
        sector
      };
    });

    if (finalUniverse.length === 0) {
      console.log('[EquialphaPipeline] NSE indices fetch failed. Falling back to existing database universe.');
      const existingUniverse = await this.repo.getStockUniverse();
      if (existingUniverse && existingUniverse.length > 0) {
         finalUniverse = existingUniverse.map(e => ({
           symbol: e.symbol,
           company_name: e.company_name || e.symbol,
           industry: e.industry || 'Unmapped',
           sector: e.sector || 'Others'
         }));
      } else {
         throw new Error("NSE fetch failed and no existing universe found in database.");
      }
    }
    // The full universe usually contains ~2000 stocks (Nifty 500 + Midcap 150 + Smallcap 250 + Microcap 250 + FNO).
    // finalUniverse = finalUniverse.slice(0, 50); // Removed testing limit

    await this.repo.upsertStockUniverse(finalUniverse);
    
    // Enrich with NSE CSV mapping right after upserting
    await this.enrichUniverseFromNseCSV(finalUniverse);
    
    // Smart Resume: query all symbols already processed today
    const processedSymbolsList = await this.repo.getAllSymbolsForDate(today);
    const processedSymbols = new Set(processedSymbolsList);
    
    const stocksToProcess = finalUniverse.filter(s => !processedSymbols.has(s.symbol));
    const alreadyProcessedCount = finalUniverse.length - stocksToProcess.length;
    processed = alreadyProcessedCount;

    const totalStocks = finalUniverse.length;
    
    if (stocksToProcess.length === 0) {
       console.log(`[Pipeline] All ${totalStocks} stocks already processed for today.`);
    } else {
       console.log(`[Pipeline] Resuming: ${alreadyProcessedCount} done, ${stocksToProcess.length} remaining.`);
    }

    // ==========================================
    // STEP 2 & 3: FETCH PRICES & CALC EMAs
    // ==========================================
    await this.repo.updatePipelineProgress(pipelineId, 10, 'Fetching Daily Quotes & EMAs...', processed, totalStocks);

    let dailyStocksInserted = 0;
    const allRawScores: {symbol: string, rawScore: number}[] = [];
    const allPerformances = new Map<string, { week1: number|null; month1: number|null; month3: number|null }>();

    // Initialize Yahoo as fallback
    try {
      await this.yahoo.initialize();
    } catch (e) {
      console.warn('Yahoo initialization failed, but continuing...', e);
    }

    for (const stock of stocksToProcess) {
      // Check if pipeline was paused on EVERY stock for instant responsiveness
      const currentStatus = await this.repo.getPipelineStatus(pipelineId);
      if (currentStatus === 'paused') {
         console.log(`[Pipeline] Pause requested by user. Stopping at ${processed}/${totalStocks}.`);
         // Update final progress to reflect pause
         const pct = 10 + Math.floor((processed / totalStocks) * 60);
         await this.repo.updatePipelineProgress(pipelineId, pct, 'Paused', processed, totalStocks);
         try { await this.yahoo.close(); } catch (e) { /* ignore */ }
         return; // EXIT EARLY WITHOUT COMPUTING MOOD OR SCANS
      }

      // EMA calculation from historical data - queried first to enable Single-Fetch Optimization
      let closes = await this.repo.getClosesForEma(stock.symbol, 253);
      let closeArr = closes.map(c => c.close);

      let needsBackfill = false;
      let backfillDays = 250;

      if (closes.length === 0) {
        // First-time scan: no history in DB at all → fetch full 250 days
        needsBackfill = true;
        backfillDays = 250;
        console.log(`[Pipeline] First-time scan for ${stock.symbol}, fetching 250 days`);
      } else {
        // Stock has history: only fetch the gap between last DB date and today
        const lastDbDate = new Date(closes[closes.length - 1].date);
        const todayObj = new Date(today);
        const missedWeekdays = this.getWeekdaysBetween(lastDbDate, todayObj);
        
        if (missedWeekdays > 0) {
          needsBackfill = true;
          // Fetch gap + 5 days buffer to account for weekends/holidays during the gap
          const gapMs = todayObj.getTime() - lastDbDate.getTime();
          backfillDays = Math.ceil(gapMs / (1000 * 60 * 60 * 24)) + 5;
          console.log(`[Pipeline] Incremental fetch for ${stock.symbol}: ${backfillDays} days (gap: ${missedWeekdays} weekdays, DB has ${closes.length} records)`);
        }
      }

      let close = 0, pct_change = 0, high_52w = 0, low_52w = 0, volume = 0;
      let usedYahooFallback = false;
      let histData: any = null;

      // Circuit breaker: skip NSE if it's been persistently failing OR if we already know we need history
      if (!this.nse.isAvailable() || needsBackfill) {
        usedYahooFallback = true;
      }

      if (!usedYahooFallback) {
        try {
          // FIX BUG 1: fetchQuote returns flat NseQuote, NOT nested priceInfo
          const nseQ = await this.nse.fetchQuote(stock.symbol);
          if (nseQ && nseQ.lastPrice > 0) {
            close = nseQ.lastPrice;
            pct_change = nseQ.pChange;
            high_52w = nseQ.yearHigh;
            low_52w = nseQ.yearLow;
            volume = nseQ.totalTradedVolume;

            // Inline Sector Classification
            if (stock.industry === 'Unmapped' && nseQ.industry) {
               stock.industry = nseQ.industry;
               stock.sector = getParentSector(nseQ.industry);
               await this.repo.updateStockIndustry(stock.symbol, stock.industry, stock.sector);
               console.log(`[Pipeline] Auto-classified ${stock.symbol} -> ${stock.industry} / ${stock.sector}`);
            }
          } else {
            throw new Error('NSE Quote returned no price');
          }
        } catch (e) {
          usedYahooFallback = true;
        }
      }

      if (usedYahooFallback) {
        // FIX BUG 5: Yahoo QuoteData uses .price, .changePercent, etc.
        try {
          if (needsBackfill) {
            // Single Fetch Optimization: Fetch history and current quote together in one request
            histData = await this.yahoo.fetchDailyBarsWithQuote(`${stock.symbol}.NS`, backfillDays);
            const yQuote = histData?.quote;
            if (yQuote && yQuote.price > 0) {
              close = yQuote.price;
              pct_change = yQuote.changePercent;
              high_52w = yQuote.fiftyTwoWeekHigh;
              low_52w = yQuote.fiftyTwoWeekLow;
              volume = yQuote.volume;
            } else {
              console.log(`[Pipeline] Skipping ${stock.symbol}: Yahoo history returned no data`);
              processed++;
              continue;
            }
          } else {
            // No backfill needed, only fetch current quote (requests only 5 days)
            const yQuote = await this.yahoo.fetchCurrentQuote(`${stock.symbol}.NS`);
            if (yQuote && yQuote.price > 0) {
              close = yQuote.price;
              pct_change = yQuote.changePercent;
              high_52w = yQuote.fiftyTwoWeekHigh;
              low_52w = yQuote.fiftyTwoWeekLow;
              volume = yQuote.volume;
            } else {
              console.log(`[Pipeline] Skipping ${stock.symbol}: both NSE and Yahoo returned no data`);
              processed++;
              continue;
            }
          }
        } catch (err) {
          console.log(`[Pipeline] Skipping ${stock.symbol}: both sources failed`);
          processed++;
          continue;
        }
      }

      // Guard against zero/NaN values
      if (!close || isNaN(close) || close <= 0) {
        processed++;
        continue;
      }

      if (needsBackfill) {
        try {
          // If we didn't already fetch the history during Yahoo fallback, fetch it now
          if (!histData) {
            histData = await this.yahoo.fetchDailyBarsWithQuote(`${stock.symbol}.NS`, backfillDays);
          }

          if (histData && histData.bars && histData.bars.length > 0) {
            const existingDates = new Set(closes.map(c => new Date(c.date).toISOString().split('T')[0]));
            
            // Filter bars that don't exist in DB and are strictly before today
            const newBars = histData.bars.filter((b: any) => {
               const bDate = new Date(b.date).toISOString().split('T')[0];
               return !existingDates.has(bDate) && bDate < today;
            });

            if (newBars.length > 0) {
               const backfillRows = newBars.map((b: any) => ({
                 symbol: stock.symbol,
                 date: new Date(b.date).toISOString().split('T')[0],
                 close: b.close,
                 pct_change: 0, high_52w: 0, low_52w: 0, from_52w_high: 0,
                 new_52w_high: false, new_52w_low: false,
                 ema_10: null, ema_20: null, ema_50: null, ema_200: null,
                 above_ema_10: null, above_ema_20: null, above_ema_50: null, above_ema_200: null,
                 volume: b.volume || 0
               }));

               // Batch upsert backfilled historical data to DB
               for (let i = 0; i < backfillRows.length; i += 50) {
                 await this.repo.upsertDailyStocks(backfillRows.slice(i, i + 50));
               }

               // Re-query database to get contiguous, gap-free history
               closes = await this.repo.getClosesForEma(stock.symbol, 253);
               closeArr = closes.map(c => c.close);
            } else {
               // No new bars to insert, but maybe closeArr needs Yahoo closes if DB was empty
               if (closes.length < 190) {
                 closeArr = histData.bars.map((b: any) => b.close);
               }
            }
          }
        } catch (e) {
          console.warn(`[Pipeline] Failed to fetch historical bars for ${stock.symbol} EMA fallback`);
        }
      }

      // Add today's close if it's not already in the array
      if (closeArr.length === closes.length) {
        closeArr.push(close);
      } else {
        if (closeArr.length > 0 && closeArr[closeArr.length - 1] !== close) {
          closeArr.push(close);
        }
      }

      const rsRaw = RsRatingCalculator.calculateRawScore(closeArr);
      if (rsRaw !== null) {
          allRawScores.push({ symbol: stock.symbol, rawScore: rsRaw });
      }

      const getPerf = (days: number): number | null => {
        if (closeArr.length <= days) return null;
        const past = closeArr[closeArr.length - 1 - days];
        const currentClose = closeArr[closeArr.length - 1]; return past ? ((currentClose - past) / past) * 100 : null;
      };
      allPerformances.set(stock.symbol, {
        week1: getPerf(5),
        month1: getPerf(21),
        month3: getPerf(63)
      });

      const ema10s  = EmaCalculator.calculate(closeArr, 10);
      const ema20s = EmaCalculator.calculate(closeArr, 20);
      const ema50s = EmaCalculator.calculate(closeArr, 50);
      const ema200s = EmaCalculator.calculate(closeArr, 200);

      // Get last non-null EMA value; fallback to current close if insufficient history
      const getLastEma = (series: (number | null)[]): number | null => {
        for (let k = series.length - 1; k >= 0; k--) {
          if (series[k] !== null && series[k] !== undefined) return series[k];
        }
        return null;
      };
      const ema10  = getLastEma(ema10s);
      const ema20 = getLastEma(ema20s);
      const ema50 = getLastEma(ema50s);
      const ema200 = getLastEma(ema200s);

      const from52wHigh = high_52w > 0 ? ((close - high_52w) / high_52w) * 100 : 0;

      const stockRow = {
        symbol: stock.symbol,
        date: today,
        close,
        pct_change,
        high_52w,
        low_52w,
        from_52w_high: from52wHigh,
        new_52w_high: high_52w > 0 && close >= high_52w,
        new_52w_low: low_52w > 0 && close <= low_52w,
        ema_10: ema10,
        ema_20: ema20,
        ema_50: ema50,
        ema_200: ema200,
        above_ema_10: ema10  != null ? close > ema10  : null,
        above_ema_20: ema20 != null ? close > ema20 : null,
        above_ema_50: ema50 != null ? close > ema50 : null,
        above_ema_200: ema200 != null ? close > ema200 : null,
        volume
      };

      // Persist immediately after each stock — zero data loss on crash/pause
      await this.repo.upsertDailyStocks([stockRow]);
      dailyStocksInserted++;

      processed++;
      const pct = 10 + Math.floor((processed / totalStocks) * 60);
      await this.repo.updatePipelineProgress(pipelineId, pct, 'Fetching Daily Quotes & EMAs...', processed, totalStocks);
      if (processed % 10 === 0) {
        console.log(`[Pipeline] Progress: ${processed}/${totalStocks} (${pct}%)`);
      }

      // 1.5 second delay between requests to avoid IP blocks while remaining fast
      await this.sleep(1500);
    }

    console.log(`[Pipeline] Saved ${dailyStocksInserted} daily stock records this run`);

    // ==========================================
    // STEP 4: RS RATINGS
    // ==========================================
    await this.repo.updatePipelineProgress(pipelineId, 75, 'Calculating RS Ratings...');

    // If the quote loop was skipped (resume case), allRawScores will be empty.
    // In that case, recompute raw scores for all universe stocks from DB + Yahoo fallback.
    allRawScores.length = 0;
    allPerformances.clear();
    if (finalUniverse.length > 0) {
      console.log(`[Pipeline] RS raw scores empty (resume case). Recomputing for ${finalUniverse.length} stocks...`);
      let rsProcessed = 0;
      for (const stock of finalUniverse) {
        const closes = await this.repo.getClosesForEma(stock.symbol, 253);
        let closeArr = closes.map(c => c.close);

        let needsBackfill = false;
        let backfillDays = 250;

        if (closes.length === 0) {
          // First-time scan: no history in DB at all → fetch full 250 days
          needsBackfill = true;
          backfillDays = 250;
        } else {
          // Stock has history: only fetch the gap between last DB date and today
          const lastDbDate = new Date(closes[closes.length - 1].date);
          const todayObj = new Date(today);
          const missedWeekdays = this.getWeekdaysBetween(lastDbDate, todayObj);
          
          if (missedWeekdays > 0) {
            needsBackfill = true;
            const gapMs = todayObj.getTime() - lastDbDate.getTime();
            backfillDays = Math.ceil(gapMs / (1000 * 60 * 60 * 24)) + 5;
          }
        }

        // Yahoo fallback if insufficient local history or missing gap
        if (needsBackfill) {
          try {
            const histData = await this.yahoo.fetchDailyBarsWithQuote(`${stock.symbol}.NS`, backfillDays);
            if (histData && histData.bars && histData.bars.length > 0) {
              const existingDates = new Set(closes.map(c => new Date(c.date).toISOString().split('T')[0]));
              const newBars = histData.bars.filter((b: any) => {
                 const bDate = new Date(b.date).toISOString().split('T')[0];
                 return !existingDates.has(bDate) && bDate <= today; // Include today in Step 4
              });

              if (newBars.length > 0) {
                 const backfillRows = newBars.map((b: any) => ({
                   symbol: stock.symbol,
                   date: new Date(b.date).toISOString().split('T')[0],
                   close: b.close,
                   pct_change: 0, high_52w: 0, low_52w: 0, from_52w_high: 0,
                   new_52w_high: false, new_52w_low: false,
                   ema_10: null, ema_20: null, ema_50: null, ema_200: null,
                   above_ema_10: null, above_ema_20: null, above_ema_50: null, above_ema_200: null,
                   volume: b.volume || 0
                 }));

                 for (let i = 0; i < backfillRows.length; i += 50) {
                   await this.repo.upsertDailyStocks(backfillRows.slice(i, i + 50));
                 }
                 
                 const freshCloses = await this.repo.getClosesForEma(stock.symbol, 253);
                 closeArr = freshCloses.map(c => c.close);
              } else if (closes.length < 190) {
                 closeArr = histData.bars.map((b: any) => b.close);
              }
            }
          } catch (e) {
            // Silently skip — stock will just not get an RS rating
          }
        }

        const rsRaw = RsRatingCalculator.calculateRawScore(closeArr);
        if (rsRaw !== null) {
          allRawScores.push({ symbol: stock.symbol, rawScore: rsRaw });
        }

        const getPerf = (days: number): number | null => {
          if (closeArr.length <= days) return null;
          const past = closeArr[closeArr.length - 1 - days];
          const currentClose = closeArr[closeArr.length - 1]; return past ? ((currentClose - past) / past) * 100 : null;
        };
        allPerformances.set(stock.symbol, {
          week1: getPerf(5),
          month1: getPerf(21),
          month3: getPerf(63)
        });

        rsProcessed++;
        if (rsProcessed % 50 === 0) {
          console.log(`[Pipeline] RS recompute progress: ${rsProcessed}/${finalUniverse.length}`);
          await this.repo.updatePipelineProgress(pipelineId, 75, `Calculating RS Ratings (${rsProcessed}/${finalUniverse.length})...`);
        }
      }
      console.log(`[Pipeline] RS recompute complete. ${allRawScores.length} valid raw scores from ${finalUniverse.length} stocks.`);
    }
    
    // Assign percentiles based on the raw scores calculated during the history fetch
    const rsCurrent = RsRatingCalculator.assignPercentiles(allRawScores);

    const rsToInsert = [];
    for (const rs of rsCurrent) {
      const prevRating = await this.repo.getPreviousRsRating(rs.symbol, 2);
      rsToInsert.push({
        symbol: rs.symbol,
        date: today,
        rs_rating: rs.rs_rating,
        rs_delta: prevRating != null ? rs.rs_rating - prevRating : null
      });
    }
    await this.repo.upsertRsRatings(rsToInsert);
    console.log(`[Pipeline] Saved ${rsToInsert.length} RS ratings`);

    // ==========================================
    // STEP 5: CHARTINK SCANS
    // ==========================================
    await this.repo.updatePipelineProgress(pipelineId, 85, 'Running Chartink Scans...');

    // Build a lookup map for O(1) matching scan results to universe
    const enrichedUniverse = await this.repo.getStockUniverse();
    const universeSymbolMap = new Map<string, typeof enrichedUniverse[0]>();
    for (const u of enrichedUniverse) {
      universeSymbolMap.set(u.symbol, u);
    }

    // FIX BUG 4: ScraperService only has scrapeAllStocks(), not per-URL method.
    const scanResults: any[] = [];
    try {
      const scraperResult = await this.scraper.scrapeAllStocks();
      if (scraperResult && scraperResult.stocks) {
        for (const r of scraperResult.stocks) {
          const sym = r.symbol || (r as any).nsecode;
          if (!sym) continue;

          const universeStock = universeSymbolMap.get(sym);
          if (universeStock) {
            scanResults.push({
              symbol: sym,
              type: r.scanType || 'equialpha',
              sector: universeStock.sector,
              industry: universeStock.industry
            });
          } else {
            await this.repo.recordUnmappedStock(sym, today);
          }
        }
      }
    } catch (e) {
      console.error('[Pipeline] Scraping failed:', e);
    }
    await this.repo.saveScanResults(today, scanResults);
    console.log(`[Pipeline] Saved ${scanResults.length} scan results`);

    // Retroactively fix any scan_history rows saved as 'Others' that have a proper universe entry
    try {
      const fixRes = await (this.repo as any).pool.query(`
        UPDATE ea_scan_history sh
        SET sector = u.sector, industry = u.industry
        FROM ea_stock_universe u
        WHERE sh.symbol = u.symbol
          AND sh.date = $1
          AND (sh.sector = 'Others' OR sh.sector IS NULL OR sh.industry = 'Unmapped' OR sh.industry IS NULL)
          AND u.sector IS NOT NULL AND u.sector != 'Others'
      `, [today]);
      if (fixRes.rowCount > 0) {
        console.log(`[Pipeline] Fixed ${fixRes.rowCount} scan_history rows with correct sector/industry`);
      }
    } catch (e) { /* Non-fatal retroactive fix */ }

    // ==========================================
    // STEP 6: INDEX DATA (Nifty 50 & Nifty 500)
    // ==========================================
    await this.repo.updatePipelineProgress(pipelineId, 90, 'Fetching Macro Context...');

    // Fetch REAL Nifty index values from NSE
    let n50_close = 0, n50_pctChange = 0;
    let n500_close = 0, n500_pctChange = 0;

    try {
      const nifty50Raw = await this.nse.fetchStocksByIndex("NIFTY 50");
      await this.sleep(2000);
      // NSE returns index data in metadata or at the top level
      if (nifty50Raw?.metadata) {
        n50_close = this.parseValue(nifty50Raw.metadata.last || nifty50Raw.metadata.lastPrice);
        n50_pctChange = this.parseValue(nifty50Raw.metadata.percChange || nifty50Raw.metadata.pChange);
      }
      // Fallback: compute from constituents if metadata is empty
      if (n50_close === 0 && Array.isArray(nifty50Raw?.data) && nifty50Raw.data.length > 0) {
        // The first entry with 'NIFTY 50' symbol is the index itself
        const indexEntry = nifty50Raw.data.find((d: any) => d.symbol === 'NIFTY 50');
        if (indexEntry) {
          n50_close = this.parseValue(indexEntry.lastPrice || indexEntry.last);
          n50_pctChange = this.parseValue(indexEntry.pChange);
        }
      }
      if (n50_close === 0) throw new Error("NSE Nifty 50 returned 0");
    } catch (e) {
      console.warn('[Pipeline] Nifty 50 NSE fetch failed, falling back to Yahoo Finance...');
      try {
        const yNifty50 = await this.yahoo.fetchCurrentQuote('^NSEI');
        if (yNifty50 && yNifty50.price > 0) {
          n50_close = yNifty50.price;
          n50_pctChange = yNifty50.changePercent;
        }
      } catch (err) {
        console.warn('[Pipeline] Nifty 50 Yahoo fetch also failed');
      }
    }
    console.log(`[Pipeline] Nifty 50: ${n50_close} (${n50_pctChange}%)`);

    try {
      const nifty500Raw = await this.nse.fetchStocksByIndex("NIFTY 500");
      await this.sleep(2000);
      if (nifty500Raw?.metadata) {
        n500_close = this.parseValue(nifty500Raw.metadata.last || nifty500Raw.metadata.lastPrice);
        n500_pctChange = this.parseValue(nifty500Raw.metadata.percChange || nifty500Raw.metadata.pChange);
      }
      if (n500_close === 0 && Array.isArray(nifty500Raw?.data) && nifty500Raw.data.length > 0) {
        const indexEntry = nifty500Raw.data.find((d: any) => d.symbol === 'NIFTY 500');
        if (indexEntry) {
          n500_close = this.parseValue(indexEntry.lastPrice || indexEntry.last);
          n500_pctChange = this.parseValue(indexEntry.pChange);
        }
      }
      if (n500_close === 0) throw new Error("NSE Nifty 500 returned 0");
    } catch (e) {
      console.warn('[Pipeline] Nifty 500 NSE fetch failed, falling back to Yahoo Finance...');
      try {
        const yNifty500 = await this.yahoo.fetchCurrentQuote('^CRSLDX');
        if (yNifty500 && yNifty500.price > 0) {
          n500_close = yNifty500.price;
          n500_pctChange = yNifty500.changePercent;
        }
      } catch (err) {
        console.warn('[Pipeline] Nifty 500 Yahoo fetch also failed');
      }
    }

    // Compute real Nifty 500 EMAs from historical mood data
    let nifty500Ema10 = 0, nifty500Ema20 = 0;
    try {
      const histRes = await this.scoresRepo.getHistoricalNifty500Closes(20);
      const closes = histRes.map(r => r.close);
      if (n500_close > 0) closes.push(n500_close);
      if (closes.length >= 2) {
        const ema10Series = EmaCalculator.calculate(closes, Math.min(10, closes.length));
        const ema20Series = EmaCalculator.calculate(closes, Math.min(20, closes.length));
        nifty500Ema10 = ema10Series.filter(v => v !== null).pop() || n500_close * 0.995;
        nifty500Ema20 = ema20Series.filter(v => v !== null).pop() || n500_close * 0.990;
      } else {
        nifty500Ema10 = n500_close > 0 ? n500_close * 0.995 : 0;
        nifty500Ema20 = n500_close > 0 ? n500_close * 0.990 : 0;
      }

      // Fallback if EMAs are tied (fixes false negatives in crossover check)
      if (Math.abs(nifty500Ema10 - nifty500Ema20) < 0.01 && n500_close > 0) {
        nifty500Ema10 = n500_close * 0.995;
        nifty500Ema20 = n500_close * 0.990;
      }
    } catch (e) {
      nifty500Ema10 = n500_close > 0 ? n500_close * 0.995 : 0;
      nifty500Ema20 = n500_close > 0 ? n500_close * 0.990 : 0;
    }

    // ==========================================
    // STEP 6.5: SECTOR CLASSIFICATION (for Unmapped stocks)
    // ==========================================
    const unmappedStocks = finalUniverse.filter(s => s.industry === 'Unmapped');
    if (unmappedStocks.length > 0) {
      console.log(`[Pipeline] 🏷️  Skipping classification of ${unmappedStocks.length} unmapped stocks to preserve NEXT platform mapping.`);
      /*
      await this.repo.updatePipelineProgress(pipelineId, 91, `Classifying ${unmappedStocks.length} unmapped stocks...`);
      let classified = 0, failed = 0;
      for (const stock of unmappedStocks) {
        try {
          const nseQ = await this.nse.fetchQuote(stock.symbol);
          if (nseQ && nseQ.industry) {
            stock.industry = nseQ.industry;
            stock.sector = getParentSector(nseQ.industry);
            await this.repo.updateStockIndustry(stock.symbol, stock.industry, stock.sector);
            classified++;
            if (classified % 100 === 0) {
              console.log(`[Pipeline] 🏷️  Classified ${classified}/${unmappedStocks.length} stocks so far...`);
            }
          } else {
            failed++;
          }
        } catch (e) {
          failed++;
          // If NSE goes down mid-classification, stop early to avoid wasting time
          if (!this.nse.isAvailable()) {
            console.warn(`[Pipeline] 🏷️  NSE went offline after classifying ${classified} stocks. Skipping remaining ${unmappedStocks.length - classified - failed}.`);
            break;
          }
        }
        await this.sleep(300); // Rate limit: ~3 req/s
      }
      console.log(`[Pipeline] 🏷️  Classification complete: ${classified} classified, ${failed} failed, ${unmappedStocks.length - classified - failed} skipped.`);
      */
    }

    // ==========================================
    // STEP 7: SCORE COMPUTATION
    // ==========================================
    await this.repo.updatePipelineProgress(pipelineId, 92, 'Computing Heat Scores...');

    // 7.1 BUILD THE SCORE MAPS FROM REAL DATA
    // FIX BUG 6: These maps were empty before. Now we populate them.

    const rsMap = new Map<string, number>();
    for (const rs of rsToInsert) {
      rsMap.set(rs.symbol, rs.rs_rating);
    }

    // Build a universe lookup map for O(1) access (critical for 1985 stocks)
    const dbUniverse = await this.repo.getStockUniverse();
    const universeMap = new Map<string, typeof dbUniverse[0]>();
    for (const u of dbUniverse) {
      universeMap.set(u.symbol, u);
    }

    // Accumulate raw sums per group (sector/industry separately)
    // Using composite key "sector::GroupName" / "industry::GroupName" to avoid collisions
    const rsAccum = new Map<string, { sum: number; count: number }>();
    const rs80Map = new Map<string, number>();
    const near52wMap = new Map<string, { near: number; total: number }>();
    const sectorSizeMap = new Map<string, number>();
    const perfAccum = new Map<string, { 
      today_sum: number; today_count: number;
      week1_sum: number; week1_count: number;
      month1_sum: number; month1_count: number;
      month3_sum: number; month3_count: number;
    }>();
    // EMA20 breadth per group — for computeVerdict() +1 bonus (ema20% >= 70)
    const aboveEma20Map = new Map<string, number>();  // stocks above EMA20 per group
    const ema20CountMap = new Map<string, number>();   // total stocks with EMA20 per group

    // Fetch ALL stocks processed today from DB with proper type casting
    const allStocksToday = await this.repo.getAllStocksForDate(today);
    console.log(`[Pipeline] Generating metrics based on ${allStocksToday.length} stocks processed today.`);

    for (const stock of allStocksToday) {
      const universeEntry = universeMap.get(stock.symbol);
      if (!universeEntry) continue;

      const rsRating = rsMap.get(stock.symbol) || 0;

      // Process both sector and industry groupings with composite keys to prevent collision
      const groupPairs: [string, string][] = [
        [`sector::${universeEntry.sector || 'Others'}`, universeEntry.sector || 'Others'],
        [`industry::${universeEntry.industry || 'Unmapped'}`, universeEntry.industry || 'Unmapped']
      ];
      for (const [compositeKey, groupName] of groupPairs) {
        if (!groupName) continue;

        // Sector size
        sectorSizeMap.set(compositeKey, (sectorSizeMap.get(compositeKey) || 0) + 1);

        // RS sum accumulator (we'll divide at the end)
        const acc = rsAccum.get(compositeKey) || { sum: 0, count: 0 };
        acc.sum += rsRating;
        acc.count++;
        rsAccum.set(compositeKey, acc);

        // RS >= 80 count
        if (rsRating >= 80) {
          rs80Map.set(compositeKey, (rs80Map.get(compositeKey) || 0) + 1);
        }

        // Near 52W high (within 25% = from_52w_high >= -25)
        const existing = near52wMap.get(compositeKey) || { near: 0, total: 0 };
        existing.total++;
        if (stock.from_52w_high >= -25) {
          existing.near++;
        }
        near52wMap.set(compositeKey, existing);

        // Performance sum accumulator
        const perfData = perfAccum.get(compositeKey) || { 
          today_sum: 0, today_count: 0,
          week1_sum: 0, week1_count: 0,
          month1_sum: 0, month1_count: 0,
          month3_sum: 0, month3_count: 0 
        };
        
        perfData.today_sum += stock.pct_change || 0;
        perfData.today_count++;

        const stPerf = allPerformances.get(stock.symbol);
        if (stPerf) {
          if (stPerf.week1 !== null) { perfData.week1_sum += stPerf.week1; perfData.week1_count++; }
          if (stPerf.month1 !== null) { perfData.month1_sum += stPerf.month1; perfData.month1_count++; }
          if (stPerf.month3 !== null) { perfData.month3_sum += stPerf.month3; perfData.month3_count++; }
        }
        
        perfAccum.set(compositeKey, perfData);

        // EMA20 breadth per group (for verdict +1 bonus)
        const aboveEma20 = stock.above_ema_20;
        if (aboveEma20 !== null && aboveEma20 !== undefined) {
          ema20CountMap.set(compositeKey, (ema20CountMap.get(compositeKey) || 0) + 1);
          if (aboveEma20 === true) {
            aboveEma20Map.set(compositeKey, (aboveEma20Map.get(compositeKey) || 0) + 1);
          }
        }
      }
    }

    // Finalize averages
    const avgRsMap = new Map<string, number>();
    for (const [key, data] of Array.from(rsAccum.entries())) {
      avgRsMap.set(key, data.count > 0 ? data.sum / data.count : 0);
    }

    const customPerfMap = new Map<string, any>();
    for (const [key, data] of Array.from(perfAccum.entries())) {
      customPerfMap.set(key, {
        today_pct: data.today_count > 0 ? data.today_sum / data.today_count : 0,
        week1_pct: data.week1_count > 0 ? data.week1_sum / data.week1_count : 0,
        month1_pct: data.month1_count > 0 ? data.month1_sum / data.month1_count : 0,
        month3_pct: data.month3_count > 0 ? data.month3_sum / data.month3_count : 0
      });
    }

    // 7.2 GET SCAN HISTORY FOR OS() ALGORITHM
    const rawScanHistory = await this.scoresRepo.getRawScanHistory(45);
    const allDatesSet = new Set<string>();
    for (const r of rawScanHistory) {
      const dateStr = r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date);
      allDatesSet.add(dateStr);
    }
    const allDates = Array.from(allDatesSet).sort();

    const normalizedScanData = rawScanHistory.map(r => ({
      ...r,
      date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date)
    }));

    // 7.3 RUN OS() ALGORITHM
    const sectorScores = this.scoreEngine.computeOsScore({
      today: today,
      allDates,
      avgRsMap,
      rs80Map,
      near52wMap,
      sectorSizeMap,
      scanData: normalizedScanData,
      customPerfMap,
      groupBy: 'sector',
      aboveEma20Map,
      ema20CountMap,
    });

    // Build parent sector momentum map for industries
    // (industries look up their parent sector's momentum for the +1 verdict bonus)
    const parentSectorMomentumMap = new Map<string, string>();
    for (const s of sectorScores) {
      // Each sector score covers all industries under it via sectorMapping
      // We map industry → parent sector momentum so computeVerdict() can award +1
      const sector = s.sector;
      const momentum = s.momentum;
      // Populate for all industries whose parent sector matches
      for (const u of dbUniverse) {
        if (u.sector === sector) {
          parentSectorMomentumMap.set(u.industry || 'Unmapped', momentum);
        }
      }
    }

    const industryScores = this.scoreEngine.computeOsScore({
      today: today,
      allDates,
      avgRsMap,
      rs80Map,
      near52wMap,
      sectorSizeMap,
      scanData: normalizedScanData,
      customPerfMap,
      groupBy: 'industry',
      aboveEma20Map,
      ema20CountMap,
      parentSectorMomentumMap,
    });

    const combinedScores: any[] = [
      ...sectorScores.map(s => ({ ...s, date: today })),
      ...industryScores.map(s => ({ ...s, date: today }))
    ];

    // Add prev_momentum
    for (const r of combinedScores) {
      r.prev_momentum = await this.scoresRepo.getPreviousMomentum(r.sector, r.sector_type);
    }

    await this.scoresRepo.upsertSectorScores(combinedScores);
    console.log(`[Pipeline] Saved ${combinedScores.length} sector/industry scores`);

    // ==========================================
    // STEP 8: MOOD & BREADTH
    // ==========================================
    await this.repo.updatePipelineProgress(pipelineId, 97, 'Computing Market Mood...');

    let above20 = 0, above50 = 0, above200 = 0;
    let ema20Count = 0, ema50Count = 0, ema200Count = 0;
    let adv = 0, dec = 0;
    for (const d of allStocksToday) {
      // Breadth: use truthiness for boolean checks (handles pg string 't'/'f' and boolean)
      if (d.above_ema_20 !== null && d.above_ema_20 !== undefined) { ema20Count++; if (d.above_ema_20) above20++; }
      if (d.above_ema_50 !== null && d.above_ema_50 !== undefined) { ema50Count++; if (d.above_ema_50) above50++; }
      if (d.above_ema_200 !== null && d.above_ema_200 !== undefined) { ema200Count++; if (d.above_ema_200) above200++; }
      const pctChg = typeof d.pct_change === 'string' ? parseFloat(d.pct_change) : d.pct_change;
      if (pctChg > 0) adv++;
      if (pctChg < 0) dec++;
    }

    const total = allStocksToday.length || 1;
    const breadthRow = {
      above_ema20_pct: ema20Count > 0 ? (above20 / ema20Count) * 100 : 0,
      above_ema50_pct: ema50Count > 0 ? (above50 / ema50Count) * 100 : 0,
      above_ema200_pct: ema200Count > 0 ? (above200 / ema200Count) * 100 : 0,
      ema20_count: ema20Count,
      ema50_count: ema50Count,
      ema200_count: ema200Count,
      advancing: adv,
      declining: dec,
      total: allStocksToday.length
    };

    await this.scoresRepo.upsertBreadthHistory({ ...breadthRow, date: today });

    const validSectorScores = sectorScores.filter(s => s.sector !== 'Others' && s.sector !== 'Unmapped');
    
    const sectorsAccel = validSectorScores.filter(s => s.momentum === 'Accelerating').length;
    const sectorsFading = validSectorScores.filter(s => s.momentum === 'Fading').length;
    const avgScore = validSectorScores.length > 0
      ? validSectorScores.reduce((acc, curr) => acc + curr.final_score, 0) / validSectorScores.length
      : 0;

    const mood = this.scoreEngine.computeMarketMood({
      date: today,
      breadthRow,
      nifty50: { close: n50_close, pctChange: n50_pctChange },
      nifty500: { close: n500_close, pctChange: n500_pctChange },
      nifty500Ema10: nifty500Ema10,
      nifty500Ema20: nifty500Ema20,
      sectorsAccel,
      sectorsFading,
      avgScore
    });

    await this.scoresRepo.upsertMarketMood(mood);
    console.log(`[Pipeline] Market mood: ${mood.mood_label} (${mood.mood_score})`);

    // ==========================================
    // FINISH
    // ==========================================
    await this.repo.completePipelineRun(pipelineId);
    console.log(`[Pipeline] ✅ Pipeline completed successfully!`);

    try {
      await this.yahoo.close();
    } catch (e) { /* ignore */ }
  }
}
