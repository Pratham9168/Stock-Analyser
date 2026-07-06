// src/services/equialpha/EquialphaScoreService.ts
import { EquialphaRepository } from "../../repositories/EquialphaRepository";
import { EquialphaScoresRepository } from "../../repositories/EquialphaScoresRepository";

export class EquialphaScoreService {
    constructor(
        private repo: EquialphaRepository, 
        private scoreRepo: EquialphaScoresRepository
    ) {}

    /**
     * The OS Score algorithm extracted from Equialpha N.E.X.T source platform.
     * Computes final heat score + momentum label.
     *
     * Sync notes (vs N.E.X.T source function Tu()):
     *  - Scan window capped to last 20 dates (was: full allDates length)
     *  - Dull threshold is dynamic: sectorSize > 60 ? 3 : 2 (was: hardcoded 2)
     *  - Accelerating now requires latestDayAppearances >= 1 (was: unchecked)
     *  - Steady has two sub-states: "Steady+" (accel > 1.2) and "Steady" (accel >= 0.8)
     *  - verdict field added via computeVerdict()
     */
    public computeOsScore(inputs: {
        today: string;
        allDates: string[];
        avgRsMap: Map<string, number>;
        rs80Map: Map<string, number>;
        near52wMap: Map<string, {near: number, total: number}>;
        sectorSizeMap: Map<string, number>;
        scanData: any[];
        customPerfMap: Map<string, any>;
        groupBy: 'sector' | 'industry';
        aboveEma20Map?: Map<string, number>;   // stocks above EMA20 per group
        ema20CountMap?: Map<string, number>;    // total stocks with EMA20 per group
        parentSectorMomentumMap?: Map<string, string>; // for industries: parent sector momentum
    }) {
        const {
            today, allDates, avgRsMap, rs80Map, near52wMap, sectorSizeMap,
            scanData, customPerfMap, groupBy,
            aboveEma20Map, ema20CountMap, parentSectorMomentumMap
        } = inputs;

        // Source: caps window to last 20 dates for all ratio calculations
        const windowDates = allDates.length >= 20 ? allDates.slice(-20) : allDates;
        const d = windowDates.length;
        const f = windowDates.slice(-7);
        const h = new Set(f);
        const windowDateSet = new Set(windowDates);

        const prefix = groupBy + '::';
        // Target groups = custom groups + all groups in rsMap
        const groupNames = Array.from(new Set([
            ...Array.from(customPerfMap.keys()),
            ...Array.from(avgRsMap.keys())
        ])).filter(k => k.startsWith(prefix));

        return groupNames.map(w => {
            // Extract plain group name from composite key (e.g. 'sector::Banking' -> 'Banking')
            const plainName = w.includes('::') ? w.split('::')[1] : w;

            // Filter scan data to window dates only (use plain name for matching)
            const x = scanData.filter(ye =>
                (groupBy === "sector" ? ye.sector === plainName : ye.industry === plainName)
                && windowDateSet.has(ye.date)
            );

            const b = avgRsMap.get(w) ?? 0;
            const j = customPerfMap.get(w); // For performance stats

            const A = x.length;
            const N = x.filter(ye => h.has(ye.date)).length;
            const P = new Set(x.map(ye => ye.nsecode ?? ye.symbol));
            const k = P.size;

            // Dynamic dull threshold: large sectors (>60 stocks) need 3+ unique stocks
            const U = sectorSizeMap.get(w) ?? 1;
            const dullThreshold = U > 60 ? 3 : 2;
            const O = k <= dullThreshold; // isDull

            // Acceleration ratio
            const R = N / Math.max(1, Math.min(7, f.length));
            const T = d > 0 ? A / d : 0;
            const W = T > 0 ? R / T : 0; // accelerationRatio

            // Latest day appearances (guard for Accelerating label)
            const je = x.filter((re: any) => re.date === today).length;

            const z = rs80Map.get(w) ?? 0;
            const G = (z / U) * 100;

            const V = near52wMap.get(w);
            const ee = V && V.total > 0 ? (V.near / V.total) * 100 : 0;

            // Quality
            const M = (b * 0.3) + (G * 0.3) + (ee * 0.4);

            // Scan Score
            const D = (k / U) * 100;
            const L = Math.min(100, D * 2.5);

            // Accel Score
            const H = Math.min(100, W * 50);

            // Recency Score
            const J = Math.min(100, (N / 7) * 50 + (N >= 4 ? 25 : N >= 3 ? 10 : 0));
            const B = J;

            // Final score composition
            const Z = Math.round(M * 0.55 + L * 0.15 + H * 0.15 + J * 0.15);
            const le = M < 20 ? Math.min(Z, 30) : Z; // dull penalty if quality < 20

            // Momentum Label — matches source Tu() with latest-day guard and Steady sub-states
            let momentumLabel: string;
            if (O) {
                momentumLabel = "Dull";
            } else if (W > 1.5 && je >= 1) {
                momentumLabel = "Accelerating";
            } else if (W >= 0.8) {
                // Sub-state: "Steady+" for stronger upward trajectory
                momentumLabel = W > 1.2 ? "Steady+" : "Steady";
            } else {
                momentumLabel = "Fading";
            }

            // EMA 20 breadth for this group (for verdict scoring)
            const above_ema20_pct = (ema20CountMap?.get(w) ?? 0) > 0
                ? ((aboveEma20Map?.get(w) ?? 0) / ema20CountMap!.get(w)!) * 100
                : undefined;

            // Parent sector momentum (for industry-level groups)
            const parentSectorMomentum = groupBy === 'industry'
                ? parentSectorMomentumMap?.get(plainName)
                : undefined;

            // Verdict: Strong / Moderate / Mixed / Weak
            const verdict = this.computeVerdict({
                momentum: momentumLabel,
                unique_stocks: k,
                avg_rs: Math.round(b),
                rs80_pct: Math.round(G),
                near52w_pct: Math.round(ee),
                above_ema20_pct,
                parentSectorMomentum,
            });

            return {
                sector: plainName,
                sector_type: groupBy,
                avg_rs: Math.round(b),
                rs80_pct: Math.round(G),
                near52w_pct: Math.round(ee),
                momentum: momentumLabel,
                appearances: A,
                last7_appearances: N,
                unique_stocks: k,
                quality_score: Math.round(M),
                scan_score: Math.round(L),
                accel_score: Math.round(H),
                recency_score: Math.round(B),
                final_score: le,
                verdict,
                today_pct: j?.today_pct ?? 0,
                week1_pct: j?.week1_pct ?? 0,
                month1_pct: j?.month1_pct ?? 0,
                month3_pct: j?.month3_pct ?? 0
            };
        }).sort((w, x) => x.final_score - w.final_score);
    }

    /**
     * Industry/Sector verdict — direct port of G9() from N.E.X.T source platform.
     * Scores a sector/industry on 6 criteria → returns Strong / Moderate / Mixed / Weak.
     *
     * Criteria:
     *   Momentum: Accelerating +3, Steady/Steady+ +2, Fading +0, Dull: -2 or -3
     *   avgRS: >=60 +2, >=51 +1, <=48 -1
     *   RS80%: >=30 +2, >=15 +1
     *   Near52W%: >=50 +1
     *   EMA20%: >=70 +1
     *   Parent sector Accelerating (industries only): +1
     */
    public computeVerdict(inputs: {
        momentum: string;
        unique_stocks: number;
        avg_rs: number;
        rs80_pct: number;
        near52w_pct: number;
        above_ema20_pct?: number;
        parentSectorMomentum?: string;
    }): string {
        const { momentum, unique_stocks, avg_rs, rs80_pct, near52w_pct, above_ema20_pct, parentSectorMomentum } = inputs;
        const t = (momentum || '').toString();
        let r = 0;

        // Momentum scoring
        if (t === 'Accelerating')          r += 3;
        else if (t.includes('Steady'))     r += 2;   // covers "Steady" and "Steady+"
        else if (t === 'Fading')           r += 0;
        else /* Dull */                     r -= unique_stocks <= 1 ? 3 : 2;

        // RS quality
        const n = avg_rs ?? 0;
        if (n >= 60)      r += 2;
        else if (n >= 51) r += 1;
        else if (n <= 48) r -= 1;

        // RS 80 breadth
        if (rs80_pct >= 30)      r += 2;
        else if (rs80_pct >= 15) r += 1;

        // Near 52W
        if (near52w_pct >= 50) r += 1;

        // EMA 20 breadth
        if ((above_ema20_pct ?? 0) >= 70) r += 1;

        // Parent sector momentum (for industry-type groups)
        if (parentSectorMomentum === 'Accelerating') r += 1;

        return r >= 8 ? 'Strong' : r >= 5 ? 'Moderate' : r >= 3 ? 'Mixed' : 'Weak';
    }

    /**
     * Computes the market mood purely from Nifty500 and Breadth data.
     * Formula matches N.E.X.T source platform exactly.
     */
    public computeMarketMood(inputs: {
        date: string;
        breadthRow: any; // { ema20_pct, ema50_pct, ema200_pct, adv, dec }
        nifty50: any; // { close, pctChange }
        nifty500: any; // { close, pctChange }
        nifty500Ema10: number;
        nifty500Ema20: number;
        sectorsAccel: number;
        sectorsFading: number;
        avgScore: number;
    }) {
        const { date, breadthRow, nifty50, nifty500, nifty500Ema10, nifty500Ema20, sectorsAccel, sectorsFading, avgScore } = inputs;

        // Base mood from breadth — exact N.E.X.T Tu() formula
        let w20 = 0.15, w50 = 0.15, w200 = 0.10;
        const total = breadthRow.total || 1;
        
        // Dynamically adjust weights if EMA history is missing (e.g. new database)
        if (breadthRow.ema200_count !== undefined && (breadthRow.ema200_count / total) < 0.25) {
            // Re-distribute 200EMA weight to 20EMA and 50EMA
            w20 += 0.05;
            w50 += 0.05;
            w200 = 0;
        }
        if (breadthRow.ema50_count !== undefined && (breadthRow.ema50_count / total) < 0.25) {
            // Re-distribute 50EMA weight to 20EMA
            w20 += w50;
            w50 = 0;
        }

        let base = (breadthRow.above_ema20_pct * w20) +
                   (breadthRow.above_ema50_pct * w50) +
                   (breadthRow.above_ema200_pct * w200) + 15;

        // MA crossover bonuses (+15 each = max 30 pts from index trend)
        if (nifty500.close > nifty500Ema10) base += 15;
        if (nifty500Ema10 > nifty500Ema20) base += 15;

        // Sector momentum adjustment (standard N.E.X.T factor)
        base += (sectorsAccel * 2);
        base -= (sectorsFading * 2);

        const score = Math.min(100, Math.round(base));

        let label = "Bearish";
        if (score >= 80) label = "Euphoric";
        else if (score >= 60) label = "Bullish";
        else if (score >= 45) label = "Neutral";
        else if (score >= 25) label = "Caution";

        const adRatio = breadthRow.advancing / Math.max(1, breadthRow.declining);

        return {
            date,
            nifty500_close: nifty500.close,
            nifty500_ema10: nifty500Ema10,
            nifty500_ema20: nifty500Ema20,
            nifty50_close: nifty50.close,
            nifty50_change_pct: nifty50.pctChange,
            nifty500_change_pct: nifty500.pctChange,
            above_ema20_pct: breadthRow.above_ema20_pct,
            above_ema50_pct: breadthRow.above_ema50_pct,
            above_ema200_pct: breadthRow.above_ema200_pct,
            sectors_accelerating: sectorsAccel,
            sectors_fading: sectorsFading,
            avg_sector_score: avgScore,
            mood_score: score,
            mood_label: label,
            ad_ratio: adRatio,
            advancing: breadthRow.advancing,
            declining: breadthRow.declining
        };
    }
}
