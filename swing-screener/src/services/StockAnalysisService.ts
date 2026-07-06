// src/services/StockAnalysisService.ts - Stock analysis business logic
// Implements the 4-Rule Swing Trading Strategy

import { BaseService } from './BaseService';
import { AnalysisInput, AnalysisOutput, AnalysisDetails, DailyBar } from '../types/analysis';
import { EMA } from 'technicalindicators';

// Zone represents a period where price closed below the 10 EMA
interface Zone {
  startIndex: number;
  endIndex: number;
  low: number; // Lowest close within this zone
}

export class StockAnalysisService extends BaseService {
  // Strategy constants
  private readonly CONSOLIDATION_WINDOW = 60; // 60-day lookback
  private readonly CONSOLIDATION_THRESHOLD = 30; // 30% max gain from base
  private readonly EMA_PERIOD = 10; // 10-period EMA for zone detection
  private readonly VOLUME_WINDOW = 20; // 20-bar lookback for volume
  private readonly VOLUME_MULTIPLIER = 1.8; // 1.8x volume spike threshold
  private readonly WICK_THRESHOLD = 40; // 40% lower wick requirement

  constructor() {
    super('StockAnalysisService');
  }

  async analyzeStock(input: AnalysisInput): Promise<AnalysisOutput> {
    const startTime = Date.now();

    try {
      this.validateRequired(input, ['symbol', 'dailyBars']);

      // Need at least 70 bars for proper EMA calculation and 60-day consolidation window
      if (input.dailyBars.length < 70) {
        return this.createRejectedResult(
          'Insufficient data',
          'Need at least 70 days of data for reliable analysis',
          startTime,
          input.dailyBars.length,
          0
        );
      }

      const analysisDetails = await this.performAnalysis(input.dailyBars);
      const score = this.calculateScore(analysisDetails);
      const qualified = score === 4; // All 4 rules must pass

      // Calculate indicators for storage
      const closes = input.dailyBars.map(bar => bar.close);
      const ema10Values = EMA.calculate({ values: closes, period: 10 }) as number[];
      const ema20Values = EMA.calculate({ values: closes, period: 20 }) as number[];

      // Calculate volume metrics for storage
      const volumeAvgs: number[] = [];
      const volumeRatios: number[] = [];
      for (let i = 0; i < input.dailyBars.length; i++) {
        const precedingStart = Math.max(0, i - 20);
        const precedingBars = input.dailyBars.slice(precedingStart, i);
        const avgVol = precedingBars.length > 0
          ? precedingBars.reduce((sum, b) => sum + b.volume, 0) / precedingBars.length
          : 0;
        volumeAvgs.push(avgVol);
        volumeRatios.push(avgVol > 0 ? input.dailyBars[i].volume / avgVol : 0);
      }

      // Extract zones for storage
      const zones = analysisDetails.consolidation.zones?.map((zone: any, idx: number) => ({
        zoneNumber: idx + 1,
        startIndex: zone.startIndex,
        endIndex: zone.endIndex,
        startDate: String(input.dailyBars[zone.startIndex]?.date || ''),
        endDate: String(input.dailyBars[zone.endIndex]?.date || ''),
        zoneLow: zone.low,
        barCount: zone.endIndex - zone.startIndex + 1
      })) || [];

      return {
        qualified,
        score: score * 25, // Convert to 0-100 scale
        failedAt: qualified ? 0 : this.getFailureStep(analysisDetails),
        reason: qualified ? 'All 4 rules passed' : this.getFailureReason(analysisDetails),
        currentPrice: input.dailyBars[input.dailyBars.length - 1]?.close || 0,
        ema10: analysisDetails.consolidation.ema10Current || 0,
        ema20: 0,
        details: analysisDetails,
        analysisDurationMs: Date.now() - startTime,
        dataPointsDaily: input.dailyBars.length,
        dataPointsIntraday: input.intradayBars?.length || 0,
        calculatedIndicators: {
          ema10Values,
          ema20Values,
          volumeAvgs,
          volumeRatios
        },
        zones
      };

    } catch (error) {
      this.logger.error('Stock analysis failed:', error);
      return this.createRejectedResult(
        'Analysis error',
        (error as Error).message,
        startTime,
        input.dailyBars.length,
        0
      );
    }
  }

  private async performAnalysis(dailyBars: DailyBar[]): Promise<AnalysisDetails> {
    // Calculate 10 EMA for the entire dataset
    const closes = dailyBars.map(bar => bar.close);
    const ema10Values = EMA.calculate({ values: closes, period: this.EMA_PERIOD }) as number[];

    // Detect zones within the 60-day consolidation window
    const zones = this.detectZones(dailyBars, ema10Values);

    // Rule 1: Consolidation Phase
    const consolidation = this.checkConsolidationPhase(dailyBars, zones, ema10Values);

    // Rule 2: Higher Low Structure (depends on zones from Rule 1)
    const higherLow = this.checkHigherLowStructure(dailyBars, zones, ema10Values);

    // Rule 3: Volume Pump
    const volumePump = this.checkVolumePump(dailyBars);

    // Rule 4: Bear Squeeze Candle
    const bearSqueeze = this.checkBearSqueezeCandle(dailyBars);

    const overall = this.calculateOverallResult(consolidation, higherLow, volumePump, bearSqueeze);

    return {
      consolidation,
      higherLow,
      volumePump,
      bearSqueeze,
      overall
    };
  }

  /**
   * ZONE DETECTION
   * A zone is a period where consecutive daily closes are below the 10 EMA.
   * Zone low = lowest close within that zone.
   */
  private detectZones(bars: DailyBar[], ema10Values: number[]): Zone[] {
    const zones: Zone[] = [];
    const windowBars = bars.slice(-this.CONSOLIDATION_WINDOW);
    const startOffset = bars.length - this.CONSOLIDATION_WINDOW;

    // Align EMA values with window bars
    const windowEma = ema10Values.slice(-(this.CONSOLIDATION_WINDOW));

    if (windowBars.length !== windowEma.length) {
      this.logger.warn('EMA/Bar length mismatch in zone detection');
      return zones;
    }

    let inZone = false;
    let currentZone: Zone | null = null;

    for (let i = 0; i < windowBars.length; i++) {
      const bar = windowBars[i];
      const ema = windowEma[i];
      const closesBelowEma = bar.close < ema;

      if (closesBelowEma) {
        if (!inZone) {
          // Start a new zone
          currentZone = {
            startIndex: startOffset + i,
            endIndex: startOffset + i,
            low: bar.close
          };
          inZone = true;
        } else {
          // Continue zone, update low if needed
          if (currentZone && bar.close < currentZone.low) {
            currentZone.low = bar.close;
          }
          if (currentZone) {
            currentZone.endIndex = startOffset + i;
          }
        }
      } else {
        // Close is above EMA
        if (inZone && currentZone) {
          // End the zone
          zones.push(currentZone);
          currentZone = null;
          inZone = false;
        }
      }
    }

    // If still in a zone at the end, close it
    if (inZone && currentZone) {
      zones.push(currentZone);
    }

    this.logger.info(`Detected ${zones.length} zones in ${this.CONSOLIDATION_WINDOW}-day window`);
    return zones;
  }

  /**
   * RULE 1: CONSOLIDATION PHASE
   * - Track zones where close < 10 EMA
   * - Base = minimum of all zone lows
   * - Pass if current price < 30% above base
   * - Fail if no zones exist OR gain >= 30%
   */
  private checkConsolidationPhase(bars: DailyBar[], zones: Zone[], ema10Values: number[]): any {
    const currentPrice = bars[bars.length - 1].close;
    const ema10Current = ema10Values[ema10Values.length - 1];

    // No zones = fail (stock never dipped below EMA in 60 days)
    if (zones.length === 0) {
      return {
        pass: false,
        status: 'no_zones',
        reason: 'No consolidation zones found in 60-day window (price never closed below 10 EMA)',
        base: 0,
        currentPrice,
        ema10Current,
        percentGain: 0,
        zoneCount: 0,
        zones: []
      };
    }

    // Base = minimum of all zone lows
    const base = Math.min(...zones.map(z => z.low));
    const percentGain = ((currentPrice - base) / base) * 100;

    // Pass if gain < 30%, fail if >= 30%
    const pass = percentGain < this.CONSOLIDATION_THRESHOLD;

    return {
      pass,
      status: pass ? 'consolidated' : 'breakout_exceeded',
      reason: pass
        ? `Stock in consolidation (${percentGain.toFixed(2)}% from base)`
        : `Stock has moved ${percentGain.toFixed(2)}% from base (exceeds 30% threshold)`,
      base,
      currentPrice,
      ema10Current,
      percentGain,
      zoneCount: zones.length,
      zones: zones.map(z => ({ startIndex: z.startIndex, endIndex: z.endIndex, low: z.low }))
    };
  }

  /**
   * RULE 2: HIGHER LOW STRUCTURE
   * - Compare latest zone low vs previous zone low
   * - Pass if: latestZoneLow >= previousZoneLow
   * - Additional check: if price < EMA AND price < latestZoneLow → FAIL
   * - Single zone: Pass if currentPrice > zoneLow
   */
  private checkHigherLowStructure(bars: DailyBar[], zones: Zone[], ema10Values: number[]): any {
    const currentPrice = bars[bars.length - 1].close;
    const ema10Current = ema10Values[ema10Values.length - 1];

    // No zones = auto-fail (depends on Rule 1 data)
    if (zones.length === 0) {
      return {
        pass: false,
        status: 'no_zones',
        reason: 'Cannot evaluate higher low structure without zones',
        latestZoneLow: 0,
        previousZoneLow: 0,
        currentPrice,
        ema10Current,
        zoneCount: 0
      };
    }

    // Single zone case
    if (zones.length === 1) {
      const zoneLow = zones[0].low;
      const pass = currentPrice > zoneLow;
      return {
        pass,
        status: pass ? 'single_zone_recovered' : 'single_zone_breakdown',
        reason: pass
          ? 'Single zone: Price recovered above zone low'
          : 'Single zone: Price has not recovered above zone low',
        latestZoneLow: zoneLow,
        previousZoneLow: 0,
        currentPrice,
        ema10Current,
        zoneCount: 1
      };
    }

    // Multiple zones: compare last two
    const latestZone = zones[zones.length - 1];
    const previousZone = zones[zones.length - 2];
    const latestZoneLow = latestZone.low;
    const previousZoneLow = previousZone.low;

    // Higher low comparison: latest >= previous
    const higherLowConfirmed = latestZoneLow >= previousZoneLow;

    // Price validation: if price < EMA AND price < latestZoneLow → FAIL
    const priceAboveEma = currentPrice >= ema10Current;
    const priceAboveZoneLow = currentPrice > latestZoneLow;
    const priceBrokenDown = !priceAboveEma && !priceAboveZoneLow;

    let pass = higherLowConfirmed && !priceBrokenDown;
    let status = '';
    let reason = '';

    if (!higherLowConfirmed) {
      status = 'lower_low';
      reason = `Latest zone low (${latestZoneLow.toFixed(2)}) is lower than previous (${previousZoneLow.toFixed(2)})`;
    } else if (priceBrokenDown) {
      status = 'structure_breakdown';
      reason = `Price (${currentPrice.toFixed(2)}) is below both EMA and latest zone low (${latestZoneLow.toFixed(2)})`;
    } else {
      status = 'higher_low_confirmed';
      reason = `Higher low structure confirmed: ${latestZoneLow.toFixed(2)} >= ${previousZoneLow.toFixed(2)}`;
    }

    return {
      pass,
      status,
      reason,
      latestZoneLow,
      previousZoneLow,
      currentPrice,
      ema10Current,
      priceAboveEma,
      priceAboveZoneLow,
      zoneCount: zones.length
    };
  }

  /**
   * RULE 3: VOLUME PUMP
   * - Scan last 20 bars
   * - For each bar, calculate its own preceding 20-bar average
   * - Pass if ANY bar has volume >= 1.8x its preceding average
   * - Stop on first match (efficiency)
   */
  private checkVolumePump(bars: DailyBar[]): any {
    const windowBars = bars.slice(-this.VOLUME_WINDOW);
    const startOffset = bars.length - this.VOLUME_WINDOW;

    let spikeFound = false;
    let spikeDetails: any = null;

    for (let i = 0; i < windowBars.length; i++) {
      const barIndex = startOffset + i;
      const currentBar = windowBars[i];

      // Calculate preceding 20-bar average for this specific bar
      const precedingStart = Math.max(0, barIndex - this.VOLUME_WINDOW);
      const precedingEnd = barIndex;
      const precedingBars = bars.slice(precedingStart, precedingEnd);

      if (precedingBars.length === 0) continue;

      const avgVolume = precedingBars.reduce((sum, b) => sum + b.volume, 0) / precedingBars.length;

      if (avgVolume <= 0) continue;

      const volumeRatio = currentBar.volume / avgVolume;

      if (volumeRatio >= this.VOLUME_MULTIPLIER) {
        spikeFound = true;
        spikeDetails = {
          barIndex,
          barDate: currentBar.date,
          volume: currentBar.volume,
          avgVolume,
          volumeRatio
        };
        break; // Stop on first match
      }
    }

    return {
      pass: spikeFound,
      status: spikeFound ? 'volume_spike_found' : 'no_volume_spike',
      reason: spikeFound
        ? `Volume spike detected: ${spikeDetails.volumeRatio.toFixed(2)}x average`
        : `No bar in last ${this.VOLUME_WINDOW} days had volume >= ${this.VOLUME_MULTIPLIER}x its preceding average`,
      spikeDetails,
      threshold: this.VOLUME_MULTIPLIER,
      windowSize: this.VOLUME_WINDOW
    };
  }

  /**
   * RULE 4: BEAR SQUEEZE CANDLE
   * - Analyze TODAY's bar only
   * - bodyLow = min(open, close)
   * - lowerWick = bodyLow - low
   * - totalRange = high - low
   * - wickPercent = (lowerWick / totalRange) * 100
   * - Pass if wickPercent >= 40%
   */
  private checkBearSqueezeCandle(bars: DailyBar[]): any {
    const todayBar = bars[bars.length - 1];
    const { open, high, low, close } = todayBar;

    // Validate OHLC
    if (high < low || high === undefined || low === undefined) {
      return {
        pass: false,
        status: 'invalid_data',
        reason: 'Invalid OHLC data for today\'s bar',
        open, high, low, close,
        bodyLow: 0,
        lowerWick: 0,
        totalRange: 0,
        wickPercent: 0
      };
    }

    const totalRange = high - low;

    // Handle zero range (rare case)
    if (totalRange === 0) {
      return {
        pass: false,
        status: 'zero_range',
        reason: 'Today\'s bar has zero range (high = low)',
        open, high, low, close,
        bodyLow: Math.min(open, close),
        lowerWick: 0,
        totalRange: 0,
        wickPercent: 0
      };
    }

    const bodyLow = Math.min(open, close);
    const lowerWick = bodyLow - low;
    const wickPercent = (lowerWick / totalRange) * 100;

    const pass = wickPercent >= this.WICK_THRESHOLD;

    return {
      pass,
      status: pass ? 'bear_squeeze_confirmed' : 'insufficient_wick',
      reason: pass
        ? `Bear squeeze candle confirmed: ${wickPercent.toFixed(2)}% lower wick`
        : `Lower wick (${wickPercent.toFixed(2)}%) is below ${this.WICK_THRESHOLD}% threshold`,
      open,
      high,
      low,
      close,
      bodyLow,
      lowerWick,
      totalRange,
      wickPercent,
      threshold: this.WICK_THRESHOLD
    };
  }

  private calculateScore(details: AnalysisDetails): number {
    let score = 0;

    if (details.consolidation.pass) score++;
    if (details.higherLow.pass) score++;
    if (details.volumePump.pass) score++;
    if (details.bearSqueeze.pass) score++;

    return score;
  }

  private getFailureStep(details: AnalysisDetails): number {
    if (!details.consolidation.pass) return 1;
    if (!details.higherLow.pass) return 2;
    if (!details.volumePump.pass) return 3;
    if (!details.bearSqueeze.pass) return 4;
    return 0;
  }

  private getFailureReason(details: AnalysisDetails): string {
    const failures: string[] = [];

    if (!details.consolidation.pass) failures.push(`Rule 1: ${details.consolidation.reason}`);
    if (!details.higherLow.pass) failures.push(`Rule 2: ${details.higherLow.reason}`);
    if (!details.volumePump.pass) failures.push(`Rule 3: ${details.volumePump.reason}`);
    if (!details.bearSqueeze.pass) failures.push(`Rule 4: ${details.bearSqueeze.reason}`);

    if (failures.length === 0) return 'Unknown failure';
    return failures.join('; ');
  }

  private calculateOverallResult(consolidation: any, higherLow: any, volumePump: any, bearSqueeze: any): any {
    const score = (consolidation.pass ? 1 : 0) +
      (higherLow.pass ? 1 : 0) +
      (volumePump.pass ? 1 : 0) +
      (bearSqueeze.pass ? 1 : 0);

    let grade: 'A' | 'B' | 'C' | 'D' | 'F';
    if (score === 4) grade = 'A';
    else if (score === 3) grade = 'B';
    else if (score === 2) grade = 'C';
    else if (score === 1) grade = 'D';
    else grade = 'F';

    return {
      score,
      maxScore: 4,
      grade,
      recommendation: score === 4 ? 'buy' : score >= 3 ? 'watch' : 'avoid',
      confidence: (score / 4) * 100,
      riskLevel: score === 4 ? 'low' : score >= 2 ? 'medium' : 'high',
      rulesPassedSummary: {
        consolidation: consolidation.pass,
        higherLow: higherLow.pass,
        volumePump: volumePump.pass,
        bearSqueeze: bearSqueeze.pass
      }
    };
  }

  private createRejectedResult(
    reason: string,
    details: string,
    startTime: number,
    dailyCount: number,
    intradayCount: number
  ): AnalysisOutput {
    return {
      qualified: false,
      score: 0,
      failedAt: 1,
      reason: `${reason}: ${details}`,
      details: {
        consolidation: { pass: false, status: 'failed', reason, base: 0, currentPrice: 0, ema10Current: 0, percentGain: 0, zoneCount: 0, zones: [] },
        higherLow: { pass: false, status: 'failed', reason, latestZoneLow: 0, previousZoneLow: 0, currentPrice: 0, ema10Current: 0, zoneCount: 0 },
        volumePump: { pass: false, status: 'failed', reason, spikeDetails: null, threshold: 1.8, windowSize: 20 },
        bearSqueeze: { pass: false, status: 'failed', reason, open: 0, high: 0, low: 0, close: 0, bodyLow: 0, lowerWick: 0, totalRange: 0, wickPercent: 0, threshold: 40 },
        overall: { score: 0, maxScore: 4, grade: 'F', recommendation: 'avoid', confidence: 0, riskLevel: 'high', rulesPassedSummary: { consolidation: false, higherLow: false, volumePump: false, bearSqueeze: false } }
      },
      analysisDurationMs: Date.now() - startTime,
      dataPointsDaily: dailyCount,
      dataPointsIntraday: intradayCount
    };
  }
}
