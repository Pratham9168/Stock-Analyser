import React from 'react';
import { MoodGauge } from '../components/MoodGauge';
import { BreadthChart } from '../components/BreadthChart';

interface TodaysMarketTabProps {
  moodData: any;
  marketStats?: any;
  scores?: any[];
  onSectorClick?: (sector: string) => void;
  onStockClick?: (symbol: string) => void;
}

export function TodaysMarketTab({ moodData, marketStats, scores, onSectorClick, onStockClick }: TodaysMarketTabProps) {
  if (!moodData) {
    return <div className="text-[#5a6a8a] italic py-4">No market data available for this date.</div>;
  }

  const getBreadthColor = (pct: number) => {
    if (pct >= 50) return "#4ade80";
    if (pct >= 30) return "#facc15";
    return "#f87171";
  };

  // Use the reference formula for Breadth strength from the Next platform
  const adRatio = parseFloat(moodData.ad_ratio) || 0;
  const above20 = parseFloat(moodData.above_ema20_pct) || 0;
  const above50 = parseFloat(moodData.above_ema50_pct) || 0;
  const above200 = parseFloat(moodData.above_ema200_pct) || 0;
  const breadthSum = above20 * 0.15 + above50 * 0.15 + above200 * 0.10;
  const strengthPct = Math.round((breadthSum / 40) * 100);
  const strengthLabel = strengthPct >= 60 ? "Strong" : strengthPct >= 40 ? "Average" : "Weak";
  const strengthColor = strengthPct >= 60 ? "#4ade80" : strengthPct >= 40 ? "#facc15" : "#f87171";

  // FIX BUG 8: Session guidance based on Nifty500 vs EMA-10 vs EMA-20 crossovers
  // NOT based on mood_score thresholds
  const n500 = parseFloat(moodData.nifty500_close) || 0;
  const e10 = parseFloat(moodData.nifty500_ema10) || 0;
  const e20 = parseFloat(moodData.nifty500_ema20) || 0;

  let guidanceTitle = "";
  let guidanceText = "";
  if (n500 > e10 && e10 > e20) {
    guidanceTitle = "Confirmed Uptrend";
    guidanceText = "Going with full position size.";
  } else if (n500 > e10 && e10 <= e20) {
    guidanceTitle = "Uptrend Try";
    guidanceText = "Taking moderate size positions with controlled open risk. Waiting for 10 EMA to cross above 20 EMA for confirmation.";
  } else if (n500 <= e10 && e10 > e20) {
    guidanceTitle = "Downtrend Try";
    guidanceText = "No new positions. Holding existing positions with SL at cost. Will resume if price reclaims 10 EMA.";
  } else {
    guidanceTitle = "Confirmed Downtrend";
    guidanceText = "No new positions until price goes back above 10 EMA. Capital preserved.";
  }

  const nifty50Close = moodData.nifty50_close !== undefined && moodData.nifty50_close !== null ? parseFloat(moodData.nifty50_close) : NaN;
  const nifty50Change = moodData.nifty50_change_pct !== undefined && moodData.nifty50_change_pct !== null ? parseFloat(moodData.nifty50_change_pct) : NaN;
  const nifty500Close = moodData.nifty500_close !== undefined && moodData.nifty500_close !== null ? parseFloat(moodData.nifty500_close) : NaN;
  const nifty500Change = moodData.nifty500_change_pct !== undefined && moodData.nifty500_change_pct !== null ? parseFloat(moodData.nifty500_change_pct) : NaN;

  return (
    <div className="space-y-6 font-sans text-sm max-w-4xl mx-auto pb-10">
      {/* Top row: Market Mood & Context */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 flex gap-8 items-center shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md transition-all duration-300 hover:bg-white/[0.03] hover:border-white/[0.08] hover:-translate-y-1">
          <MoodGauge score={parseInt(moodData.mood_score) || 0} label={moodData.mood_label || 'N/A'} />
          <div className="flex-1 space-y-3">
             <div className="text-white/40 font-bold text-[10px] tracking-[0.2em] uppercase">Session Context</div>
             <div className="text-[#facc15] text-sm font-black tracking-wide drop-shadow-[0_0_8px_rgba(250,204,21,0.3)]">{guidanceTitle}</div>
             <p className="text-white/70 text-sm leading-relaxed font-medium">
               {guidanceText}
             </p>
          </div>
        </div>

        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 space-y-4 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md transition-all duration-300 hover:bg-white/[0.03] hover:border-white/[0.08] hover:-translate-y-1">
           <div className="text-white/40 font-bold text-[10px] tracking-[0.2em] uppercase">Key Indices</div>
           <div className="flex flex-col gap-3">
             <div className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                <span className="text-white/80 font-bold text-xs tracking-wider">NIFTY 50</span>
                <span className="font-mono font-bold" style={{ color: isNaN(nifty50Change) ? '#7b8899' : nifty50Change >= 0 ? '#4ade80' : '#f87171', textShadow: isNaN(nifty50Change) ? 'none' : `0 0 10px ${nifty50Change >= 0 ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.4)'}` }}>
                   {!isNaN(nifty50Close) ? nifty50Close.toFixed(2) : '—'} 
                   {!isNaN(nifty50Change) && (
                     <span className="ml-2 px-2 py-0.5 rounded bg-white/5 text-xs">
                       {(nifty50Change > 0 ? '+' : '') + nifty50Change.toFixed(2)}%
                     </span>
                   )}
                </span>
             </div>
             <div className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                <span className="text-white/80 font-bold text-xs tracking-wider">NIFTY 500</span>
                <span className="font-mono font-bold" style={{ color: isNaN(nifty500Change) ? '#7b8899' : nifty500Change >= 0 ? '#4ade80' : '#f87171', textShadow: isNaN(nifty500Change) ? 'none' : `0 0 10px ${nifty500Change >= 0 ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.4)'}` }}>
                   {!isNaN(nifty500Close) ? nifty500Close.toFixed(2) : '—'} 
                   {!isNaN(nifty500Change) && (
                     <span className="ml-2 px-2 py-0.5 rounded bg-white/5 text-xs">
                       {(nifty500Change > 0 ? '+' : '') + nifty500Change.toFixed(2)}%
                     </span>
                   )}
                </span>
             </div>
           </div>
        </div>
      </div>

      {/* Middle row: Breadth & Momentum */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 col-span-2 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md transition-all duration-300 hover:bg-white/[0.03] hover:border-white/[0.08] hover:-translate-y-1">
            <div className="text-white/40 font-bold text-[10px] tracking-[0.2em] uppercase mb-5">Market Breadth (Universe)</div>
            <div className="flex justify-between gap-6">
                {[
                  { label: 'Above 20 EMA', key: 'above_ema20_pct' },
                  { label: 'Above 50 EMA', key: 'above_ema50_pct' },
                  { label: 'Above 200 EMA', key: 'above_ema200_pct' },
                ].map(({ label, key }) => {
                  const val = parseFloat(moodData[key]) || 0;
                  const color = getBreadthColor(val);
                  return (
                    <div key={key} className="flex-1 flex flex-col gap-2">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-[#7b8899]">{label}</span>
                        <span className="font-mono" style={{ color, textShadow: `0 0 10px ${color}60` }}>{val.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden shadow-inner border border-white/5">
                        <div className="h-full rounded-full transition-all duration-1000 ease-out relative" style={{ width: `${Math.min(100, val)}%`, backgroundColor: color }}>
                           <div className="absolute top-0 right-0 bottom-0 w-4 bg-white/30 blur-[2px]"></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
         </div>

         <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md transition-all duration-300 hover:bg-white/[0.03] hover:border-white/[0.08] hover:-translate-y-1 flex flex-col justify-between">
            <div className="text-white/40 font-bold text-[10px] tracking-[0.2em] uppercase mb-2">Participation</div>
            <div className="flex justify-between items-center flex-1">
               <div className="flex flex-col justify-center">
                  <div className="text-[10px] text-white/40 font-bold tracking-widest uppercase mb-1">A/D Ratio</div>
                  <div className="text-3xl font-black font-mono tracking-tighter leading-none" style={{ color: strengthColor, textShadow: `0 0 20px ${strengthColor}60` }}>{adRatio.toFixed(2)}</div>
                  <div className="text-[10px] font-bold tracking-widest uppercase mt-2" style={{ color: strengthColor }}>{strengthLabel}</div>
               </div>
               <div className="flex flex-col gap-2 bg-black/20 p-3 rounded-xl border border-white/5">
                  <div className="flex items-center gap-2 text-sm font-mono text-[#4ade80]">
                     <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse"></span>
                     <span>{moodData.advancing} ↑</span>
                  </div>
                  <div className="w-full h-px bg-white/5"></div>
                  <div className="flex items-center gap-2 text-sm font-mono text-[#f87171]">
                     <span className="w-1.5 h-1.5 rounded-full bg-[#f87171]"></span>
                     <span>{moodData.declining} ↓</span>
                  </div>
               </div>
            </div>
         </div>
      </div>

      {/* Bottom Row Sector Flow */}
      <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md transition-all duration-300 hover:bg-white/[0.03] hover:border-white/[0.08] hover:-translate-y-1">
          <div className="text-white/40 font-bold text-[10px] tracking-[0.2em] uppercase mb-4">Sector Flow</div>
          <div className="flex gap-6">
             <div className="flex items-center gap-3 bg-black/20 px-4 py-2 rounded-lg border border-emerald-500/10">
                <div className="relative">
                   <span className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-emerald-500 blur-[4px]"></span>
                   <span className="relative block w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                </div>
                <span className="text-sm font-medium text-white/90 font-mono tracking-tight"><span className="text-emerald-400 font-bold text-lg">{moodData.sectors_accelerating}</span> Accelerating</span>
             </div>
             <div className="flex items-center gap-3 bg-black/20 px-4 py-2 rounded-lg border border-red-500/10">
                <div className="relative">
                   <span className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-red-500 blur-[4px]"></span>
                   <span className="relative block w-2.5 h-2.5 rounded-full bg-red-400"></span>
                </div>
                <span className="text-sm font-medium text-white/90 font-mono tracking-tight"><span className="text-red-400 font-bold text-lg">{moodData.sectors_fading}</span> Fading</span>
             </div>
          </div>
      </div>

      {/* Top/Worst Industries Widget */}
      {scores && scores.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md transition-all duration-300 hover:bg-white/[0.03] hover:border-white/[0.08] hover:-translate-y-1">
            <h3 className="text-white/40 font-bold text-[10px] tracking-[0.2em] uppercase mb-4">Top 3 Industries (Today)</h3>
            <div className="space-y-3">
              {scores
                .filter(s => s.sector_type === 'industry')
                .sort((a, b) => parseFloat(b.today_pct) - parseFloat(a.today_pct))
                .slice(0, 3)
                .map(s => (
                  <div key={s.sector} onClick={() => onSectorClick && onSectorClick(s.sector)} className="flex justify-between items-center bg-black/20 px-4 py-3 rounded-xl border border-[#4ade80]/10 hover:border-[#4ade80]/30 cursor-pointer transition-colors group">
                    <span className="text-sm font-semibold text-white/80 group-hover:text-white truncate pr-4">{s.sector}</span>
                    <span className="text-[#4ade80] font-mono font-bold text-sm shrink-0">+{parseFloat(s.today_pct).toFixed(2)}%</span>
                  </div>
                ))}
            </div>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md transition-all duration-300 hover:bg-white/[0.03] hover:border-white/[0.08] hover:-translate-y-1">
            <h3 className="text-white/40 font-bold text-[10px] tracking-[0.2em] uppercase mb-4">Worst 3 Industries (Today)</h3>
            <div className="space-y-3">
              {scores
                .filter(s => s.sector_type === 'industry')
                .sort((a, b) => parseFloat(a.today_pct) - parseFloat(b.today_pct))
                .slice(0, 3)
                .map(s => (
                  <div key={s.sector} onClick={() => onSectorClick && onSectorClick(s.sector)} className="flex justify-between items-center bg-black/20 px-4 py-3 rounded-xl border border-[#f87171]/10 hover:border-[#f87171]/30 cursor-pointer transition-colors group">
                    <span className="text-sm font-semibold text-white/80 group-hover:text-white truncate pr-4">{s.sector}</span>
                    <span className="text-[#f87171] font-mono font-bold text-sm shrink-0">{parseFloat(s.today_pct).toFixed(2)}%</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Newly Accelerating Industries */}
      {scores && scores.some(s => s.sector_type === 'industry' && s.momentum === 'Accelerating' && s.prev_momentum !== 'Accelerating') && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 shadow-[0_8px_30px_rgb(16,185,129,0.1)] backdrop-blur-md mt-6">
          <h3 className="text-emerald-400 font-bold text-[10px] tracking-[0.2em] uppercase mb-4 flex items-center gap-2">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
            Newly Accelerating Industries
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {scores
              .filter(s => s.sector_type === 'industry' && s.momentum === 'Accelerating' && s.prev_momentum !== 'Accelerating')
              .map(s => (
                <div key={s.sector} onClick={() => onSectorClick && onSectorClick(s.sector)} className="flex items-center justify-between bg-black/40 px-4 py-3 rounded-xl border border-white/5 hover:border-emerald-500/30 cursor-pointer transition-colors group">
                  <span className="text-sm font-semibold text-white/90 truncate">{s.sector}</span>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs text-emerald-400 bg-emerald-500/10 shrink-0 ml-3">
                    {s.final_score}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}


      {/* Stats Widgets */}
      {marketStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md">
            <h3 className="text-white/40 font-bold text-[10px] tracking-[0.2em] uppercase mb-4">52-Week Highs & Lows</h3>
            <div className="flex justify-between gap-4">
              <div className="flex-1 bg-black/20 rounded-xl p-4 border border-[#4ade80]/10">
                <div className="text-[#4ade80] font-black text-2xl mb-1">{marketStats.highs_52w?.length || 0}</div>
                <div className="text-xs text-[#7b8899] font-bold uppercase tracking-wider mb-3">New Highs</div>
                <div className="flex flex-wrap gap-1">
                  {(marketStats.highs_52w || []).slice(0, 8).map((s: any) => (
                    <span key={s.symbol} onClick={() => onStockClick && onStockClick(s.symbol)} className="text-[10px] px-1.5 py-0.5 rounded bg-[#4ade80]/10 text-[#4ade80] cursor-pointer hover:bg-[#4ade80]/20 transition-colors">{s.symbol}</span>
                  ))}
                  {(marketStats.highs_52w?.length > 8) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">+{marketStats.highs_52w.length - 8}</span>}
                </div>
              </div>
              <div className="flex-1 bg-black/20 rounded-xl p-4 border border-[#f87171]/10">
                <div className="text-[#f87171] font-black text-2xl mb-1">{marketStats.lows_52w?.length || 0}</div>
                <div className="text-xs text-[#7b8899] font-bold uppercase tracking-wider mb-3">New Lows</div>
                <div className="flex flex-wrap gap-1">
                  {(marketStats.lows_52w || []).slice(0, 8).map((s: any) => (
                    <span key={s.symbol} onClick={() => onStockClick && onStockClick(s.symbol)} className="text-[10px] px-1.5 py-0.5 rounded bg-[#f87171]/10 text-[#f87171] cursor-pointer hover:bg-[#f87171]/20 transition-colors">{s.symbol}</span>
                  ))}
                  {(marketStats.lows_52w?.length > 8) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">+{marketStats.lows_52w.length - 8}</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md">
            <h3 className="text-white/40 font-bold text-[10px] tracking-[0.2em] uppercase mb-4">Top Movers (Universe)</h3>
            <div className="grid grid-cols-2 gap-4 h-48 overflow-y-auto custom-scrollbar pr-2">
              <div>
                <div className="text-xs text-[#4ade80] font-bold mb-2 sticky top-0 bg-[#161b27] py-1">Top Gainers</div>
                <div className="space-y-1">
                  {(marketStats.top_gainers || []).slice(0, 10).map((s: any) => (
                    <div key={s.symbol} onClick={() => onStockClick && onStockClick(s.symbol)} className="flex justify-between items-center text-xs p-1.5 hover:bg-white/5 rounded cursor-pointer transition-colors">
                      <span className="font-bold text-white/90">{s.symbol}</span>
                      <span className="text-[#4ade80] font-mono">+{parseFloat(s.pct_change).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#f87171] font-bold mb-2 sticky top-0 bg-[#161b27] py-1">Top Losers</div>
                <div className="space-y-1">
                  {(marketStats.top_losers || []).slice(0, 10).map((s: any) => (
                    <div key={s.symbol} onClick={() => onStockClick && onStockClick(s.symbol)} className="flex justify-between items-center text-xs p-1.5 hover:bg-white/5 rounded cursor-pointer transition-colors">
                      <span className="font-bold text-white/90">{s.symbol}</span>
                      <span className="text-[#f87171] font-mono">{parseFloat(s.pct_change).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Historical Breadth Chart */}
      <BreadthChart />
    </div>
  );
}
