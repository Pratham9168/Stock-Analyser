import { EquialphaRepository } from "../../repositories/EquialphaRepository";

// Weights matching standard IBD RS calculation or Equialpha custom weights
// 3M: 40%, 6M: 20%, 9M: 20%, 12M: 20%
const WEIGHTS = {
    months3: 0.40,
    months6: 0.20,
    months9: 0.20,
    months12: 0.20
};

// Trading days mapping mapping roughly to months
const DURATION_DAYS = {
    months3: 63,
    months6: 126,
    months9: 189,
    months12: 252
};

export class RsRatingCalculator {
  /**
   * Calculate a raw score for a single stock given its historical closes ordered asc
   */
  static calculateRawScore(closes: number[]): number | null {
    // if (closes.length < 63) return null; // Modified to allow graceful fallback
    
    const currentClose = closes[closes.length - 1];
    const totalDays = closes.length;

    const getReturn = (daysAgo: number): number => {
        if (totalDays <= daysAgo) return 0;
        const index = totalDays - 1 - daysAgo;
        const historical = closes[index];
        return historical ? (currentClose - historical) / historical : 0;
    };

    const returns = [
        { val: getReturn(DURATION_DAYS.months3), weight: WEIGHTS.months3, days: DURATION_DAYS.months3 },
        { val: getReturn(DURATION_DAYS.months6), weight: WEIGHTS.months6, days: DURATION_DAYS.months6 },
        { val: getReturn(DURATION_DAYS.months9), weight: WEIGHTS.months9, days: DURATION_DAYS.months9 },
        { val: getReturn(DURATION_DAYS.months12), weight: WEIGHTS.months12, days: DURATION_DAYS.months12 }
    ];

    let totalValidWeight = 0;
    let rawScoreSum = 0;

    for (const ret of returns) {
        if (totalDays > ret.days) {
            totalValidWeight += ret.weight;
            rawScoreSum += ret.val * ret.weight;
        }
    }

    // Graceful fallback for stocks with missing history (less than 3 months / 63 days)
    if (totalValidWeight === 0) {
        if (totalDays > 20) {
            // At least ~1 month history available
            const return1m = getReturn(20);
            return return1m; // Just use the 1 month return as the raw score
        } else if (totalDays > 5) {
            const return1w = getReturn(5);
            return return1w;
        } else {
            return null;
        }
    }

    // Normalize score to assume 100% weight
    const weightedRawScore = rawScoreSum / totalValidWeight;

    return weightedRawScore;
  }

  /**
   * Assign 1-99 percentiles to a list of raw scores
   */
  static assignPercentiles(rawScores: {symbol: string, rawScore: number}[]): {symbol: string, rs_rating: number}[] {
    // Sort by raw score ascending (worst first)
    const sorted = [...rawScores].sort((a, b) => a.rawScore - b.rawScore);
    const total = sorted.length;
    const results = [];

    for (let i = 0; i < total; i++) {
        const rank = i + 1;
        let rsPercentile = Math.ceil((rank / total) * 99);
        if (rsPercentile < 1) rsPercentile = 1;
        if (rsPercentile > 99) rsPercentile = 99;

        results.push({
            symbol: sorted[i].symbol,
            rs_rating: rsPercentile
        });
    }

    return results;
  }

  /**
   * Legacy method for backward compatibility (not recommended for cold starts)
   */
  static async calculateAllRsRatings(today: string, repo: EquialphaRepository, universe: string[]): Promise<{symbol: string, rs_rating: number}[]> {
    const rawScores = [];

    for (const symbol of universe) {
        const closes = await repo.getClosesForEma(symbol, 253);
        const closesArr = closes.map(c => c.close);
        const rawScore = this.calculateRawScore(closesArr);
        
        if (rawScore !== null) {
            rawScores.push({ symbol, rawScore });
        }
    }

    return this.assignPercentiles(rawScores);
  }
}
