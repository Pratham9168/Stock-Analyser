import React, { useState } from 'react';
import { SectorRotationGrid } from '../components/SectorRotationGrid';
import { RsLineChart } from '../components/RsLineChart';

export function SectorAnalysisTab({ scores, onSectorClick, onStockClick }: { scores: any[], onSectorClick?: (sector: string) => void, onStockClick?: (symbol: string) => void }) {
  const [viewMode, setViewMode] = useState<'sector' | 'industry'>('sector');

  if (!scores || scores.length === 0) {
    return <div className="text-[#5a6a8a] italic py-4">No sector data available.</div>;
  }

  const filteredScores = scores.filter(s => s.sector_type === viewMode);

  const getHeatColor = (score: number) => {
     if (score >= 75) return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[inset_0_0_10px_rgba(52,211,153,0.1)]";
     if (score >= 50) return "bg-yellow-500/10 border-yellow-500/20 text-yellow-400 shadow-[inset_0_0_10px_rgba(250,204,21,0.1)]";
     return "bg-red-500/10 border-red-500/20 text-red-400 shadow-[inset_0_0_10px_rgba(248,113,113,0.1)]";
  };

  const renderMomentum = (momentum: string) => {
      switch(momentum) {
          case 'Accelerating': 
            return (
              <div className="flex items-center justify-center gap-2 text-emerald-400 font-bold tracking-wide text-xs">
                🔥 ACCELERATING
              </div>
            );
          case 'Steady+': 
            return (
              <div className="flex items-center justify-center gap-2 text-cyan-300 font-bold tracking-wide text-xs">
                ↗ STEADY+
              </div>
            );
          case 'Steady': 
            return (
              <div className="flex items-center justify-center gap-2 text-cyan-500 font-bold tracking-wide text-xs">
                → STEADY
              </div>
            );
          case 'Fading': 
            return (
              <div className="flex items-center justify-center gap-2 text-red-400 font-bold tracking-wide text-xs">
                ↘️ FADING
              </div>
            );
          case 'Dull': 
            return <div className="text-[#5a6a8a] text-xs font-semibold tracking-wider flex items-center justify-center gap-2">💤 DULL</div>;
          default: 
            return <div className="text-[#e8eaf6] text-xs font-semibold flex items-center justify-center gap-2">{momentum}</div>;
      }
  };

  const renderVerdict = (verdict: string) => {
      if (!verdict) return <span className="text-white/20">—</span>;
      switch(verdict) {
          case 'Strong': return <span className="text-emerald-400 font-bold text-xs uppercase tracking-wider">{verdict}</span>;
          case 'Moderate': return <span className="text-cyan-400 font-bold text-xs uppercase tracking-wider">{verdict}</span>;
          case 'Mixed': return <span className="text-yellow-400 font-bold text-xs uppercase tracking-wider">{verdict}</span>;
          case 'Weak': return <span className="text-red-400 font-bold text-xs uppercase tracking-wider">{verdict}</span>;
          default: return <span className="text-white/70 font-bold text-xs uppercase tracking-wider">{verdict}</span>;
      }
  };

  const sectorCount = scores.filter(s => s.sector_type === 'sector').length;
  const industryCount = scores.filter(s => s.sector_type === 'industry').length;

  return (
    <div className="max-w-6xl mx-auto pb-10">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h2 className="text-xl font-black text-white tracking-wide drop-shadow-md">Money Flow Analysis</h2>
            <p className="text-xs text-white/50 tracking-wider uppercase mt-1 font-semibold">Identifies where institutional capital is moving in real-time.</p>
          </div>
          <div className="flex bg-black/40 rounded-xl p-1.5 border border-white/5 backdrop-blur-md shadow-inner">
             <button 
                onClick={() => setViewMode('sector')}
                className={`px-5 py-2 rounded-lg text-xs font-bold tracking-wider transition-all duration-300 ${viewMode === 'sector' ? 'bg-white/10 text-white shadow-[0_4px_12px_rgba(0,0,0,0.5)] border border-white/10' : 'text-[#7b8899] hover:text-white hover:bg-white/5 border border-transparent'}`}
             >
                SECTORS <span className="ml-1 opacity-50">({sectorCount})</span>
             </button>
             <button 
                onClick={() => setViewMode('industry')}
                className={`px-5 py-2 rounded-lg text-xs font-bold tracking-wider transition-all duration-300 ${viewMode === 'industry' ? 'bg-white/10 text-white shadow-[0_4px_12px_rgba(0,0,0,0.5)] border border-white/10' : 'text-[#7b8899] hover:text-white hover:bg-white/5 border border-transparent'}`}
             >
                INDUSTRIES <span className="ml-1 opacity-50">({industryCount})</span>
             </button>
          </div>
       </div>

       <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
               <thead>
                  <tr className="border-b border-white/[0.05] bg-black/40 text-white/40 uppercase tracking-[0.2em]">
                     <th className="p-4 font-bold text-[10px]">Group</th>
                     <th className="p-4 text-center font-bold text-[10px]">Score</th>
                     <th className="p-4 text-center font-bold text-[10px]">Momentum</th>
                     <th className="p-4 text-center font-bold text-[10px]">Verdict</th>
                     <th className="p-4 text-center font-bold text-[10px]" title="Average Relative Strength">Avg RS</th>
                     <th className="p-4 text-center font-bold text-[10px]" title="% of stocks with RS > 80">RS &gt; 80</th>
                     <th className="p-4 text-center font-bold text-[10px]" title="% of stocks near 52W High">Near 52W</th>
                     <th className="p-4 text-center font-bold text-[10px]" title="Breakout Hits (Last 7 Days)">Hits (7d)</th>
                     <th className="p-4 text-center font-bold text-[10px]" title="Unique Stocks Breaking Out">Breadth</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-white/[0.02]">
                  {filteredScores.map((row, i) => (
                     <tr 
                       key={i} 
                       className="hover:bg-white/[0.04] transition-colors duration-200 group cursor-pointer"
                       onClick={() => onSectorClick && onSectorClick(row.sector)}
                     >
                        <td className="p-4 border-l-2 border-transparent group-hover:border-[#56CCF2] font-bold text-white/90 group-hover:text-white transition-colors">{row.sector}</td>
                        <td className="p-4 text-center">
                           <div className={`mx-auto inline-flex items-center justify-center w-9 h-9 rounded-xl font-black text-sm border ${getHeatColor(parseInt(row.final_score) || 0)} transition-all duration-300 group-hover:scale-110`}>
                              {row.final_score}
                           </div>
                        </td>
                        <td className="p-4 text-center">
                           {renderMomentum(row.momentum)}
                        </td>
                        <td className="p-4 text-center">
                           {renderVerdict(row.verdict)}
                        </td>
                        <td className="p-4 text-center font-mono font-semibold">
                           <span className={parseInt(row.avg_rs) >= 70 ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]' : parseInt(row.avg_rs) >= 50 ? 'text-yellow-400' : 'text-red-400'}>
                              {row.avg_rs}
                           </span>
                        </td>
                        <td className="p-4 text-center font-mono font-medium text-white/70 group-hover:text-white transition-colors">{row.rs80_pct}%</td>
                        <td className="p-4 text-center font-mono font-medium text-white/70 group-hover:text-white transition-colors">{row.near52w_pct}%</td>
                        <td className="p-4 text-center">
                           <span className={`inline-block px-3 py-1 rounded-md text-xs font-bold tracking-wide border ${parseInt(row.last7_appearances) >= 3 ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' : 'bg-white/5 border-white/5 text-white/40'}`}>
                               {row.last7_appearances}
                           </span>
                        </td>
                        <td className="p-4 text-center text-white/70 font-mono font-bold group-hover:text-white transition-colors">{row.unique_stocks}</td>
                     </tr>
                  ))}
               </tbody>
            </table>
          </div>
       </div>

       {/* Sector Rotation Heatmap */}
       <SectorRotationGrid onSectorClick={onSectorClick} />

       {/* RS Line Chart */}
       <RsLineChart />
    </div>
  );
}
