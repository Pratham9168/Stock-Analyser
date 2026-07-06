export class EmaCalculator {
  /**
   * Calculates the Exponential Moving Average series for an array of numbers.
   * Based exactly on standard EMA formula: 
   * Multiplier: (2 / (Time periods + 1) )
   * EMA: {Close - EMA(previous day)} x multiplier + EMA(previous day).
   */
  static calculate(data: number[], period: number): (number | null)[] {
    if (!data || data.length === 0) return [];
    if (data.length < period) {
      // Not enough data for a true EMA, but we can compute what we have
      // Usually, we just return an array of nulls or fallback to SMA
      return Array(data.length).fill(null);
    }

    const emaSeries: (number | null)[] = new Array(data.length).fill(null);
    const multiplier = 2 / (period + 1);

    // Initial SMA for the first 'period' window
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += data[i];
    }
    const initialSma = sum / period;
    
    emaSeries[period - 1] = initialSma;

    // Calculate EMA for the rest
    for (let i = period; i < data.length; i++) {
      const prevEma = emaSeries[i - 1]!;
      const currentPrice = data[i];
      const ema = (currentPrice - prevEma) * multiplier + prevEma;
      emaSeries[i] = ema;
    }

    // For our pipeline, we just need the last valid numbers
    return emaSeries;
  }
}
