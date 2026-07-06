import React, { useState } from 'react';

interface ScanItem {
  nsecode: string;
  sector: string;
  industry: string;
  date: string | Date;
  scan_type: string;
}

// FIX BUG 12: Normalize PostgreSQL Date objects to YYYY-MM-DD strings
function normalizeDate(d: string | Date): string {
  if (d instanceof Date) return d.toISOString().split('T')[0];
  if (typeof d === 'string' && d.includes('T')) return d.split('T')[0];
  return String(d);
}

export function LiveScanTab({ scans, universe, onStockClick }: { scans: ScanItem[], universe: any[], onStockClick?: (symbol: string) => void }) {
  const [sortField, setSortField] = useState<'appearances' | 'pctchange' | 'nsecode'>('appearances');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  if (!scans || scans.length === 0) {
    return <div className="text-[#5a6a8a] italic py-4 pl-4">No scan results today. Run the pipeline to generate data.</div>;
  }

  // Normalize all dates
  const normalizedScans = scans.map(s => ({ ...s, date: normalizeDate(s.date) }));

  // Get the latest date from the scans
  const latestDate = normalizedScans[0]?.date;
  const todaysScans = normalizedScans.filter(s => s.date === latestDate);

  // Calculate appearances across ALL dates in history (last 20 days)
  const appearanceCount = normalizedScans.reduce((acc, curr) => {
    acc[curr.nsecode] = (acc[curr.nsecode] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Build a universe lookup Map for O(1) access instead of O(n) .find()
  const universeMap = new Map<string, any>();
  for (const u of (universe || [])) {
    universeMap.set(u.symbol, u);
  }

  // Deduplicate by nsecode (a stock can appear from multiple scan_types on same day)
  const seen = new Set<string>();
  const uniqueTodaysScans = todaysScans.filter(s => {
    if (seen.has(s.nsecode)) return false;
    seen.add(s.nsecode);
    return true;
  });

  // Enrich with universe data
  const enrichedScans = uniqueTodaysScans.map(scan => {
    const stockInfo = universeMap.get(scan.nsecode);
    return {
      ...scan,
      appearances: appearanceCount[scan.nsecode] || 1,
      close: stockInfo ? parseFloat(stockInfo.close) : null,
      pctchange: stockInfo ? parseFloat(stockInfo.pct_change) : null,
      ema20: stockInfo ? parseFloat(stockInfo.ema_20) : null,
      ema50: stockInfo ? parseFloat(stockInfo.ema_50) : null,
    };
  });

  // Sort logic
  enrichedScans.sort((a, b) => {
    let valA: any = 0;
    let valB: any = 0;

    if (sortField === 'appearances') {
      valA = a.appearances;
      valB = b.appearances;
      // Secondary sort by pctchange if appearances are equal
      if (valA === valB) {
        const pA = a.pctchange || 0;
        const pB = b.pctchange || 0;
        return sortDir === 'desc' ? pB - pA : pA - pB;
      }
    } else if (sortField === 'pctchange') {
      valA = a.pctchange || 0;
      valB = b.pctchange || 0;
    } else if (sortField === 'nsecode') {
      valA = a.nsecode;
      valB = b.nsecode;
      return sortDir === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
    }

    return sortDir === 'desc' ? valB - valA : valA - valB;
  });

  const handleSort = (field: 'appearances' | 'pctchange' | 'nsecode') => {
    if (sortField === field) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // Summary stats
  const totalStocks = enrichedScans.length;
  const advancing = enrichedScans.filter(s => s.pctchange != null && s.pctchange > 0).length;
  const declining = enrichedScans.filter(s => s.pctchange != null && s.pctchange < 0).length;
  const avgChange = totalStocks > 0
    ? enrichedScans.reduce((acc, s) => acc + (s.pctchange || 0), 0) / totalStocks
    : 0;

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <span className="ml-1 opacity-20">↕</span>;
    return <span className="ml-1 text-blue-400">{sortDir === 'desc' ? '↓' : '↑'}</span>;
  };

  return (
    <div className="max-w-5xl mx-auto pb-10">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h2 className="text-xl font-black text-white tracking-wide drop-shadow-md">Breakout Candidates</h2>
            <div className="flex items-center gap-3 mt-1.5">
               <span className="text-xs text-white/50 tracking-wider font-semibold uppercase">{totalStocks} SCANS</span>
               <div className="w-1 h-1 rounded-full bg-white/20"></div>
               <span className="text-xs text-emerald-400 font-mono font-bold tracking-tight">{advancing} ↑</span>
               <div className="w-1 h-1 rounded-full bg-white/20"></div>
               <span className="text-xs text-red-400 font-mono font-bold tracking-tight">{declining} ↓</span>
               <div className="w-1 h-1 rounded-full bg-white/20"></div>
               <span className="text-xs text-white/50 tracking-wider font-semibold uppercase">
                 AVG <span className={`font-mono font-bold ml-1 ${avgChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{avgChange > 0 ? '+' : ''}{avgChange.toFixed(2)}%</span>
               </span>
            </div>
          </div>
          <div className="flex bg-black/40 rounded-xl p-1.5 border border-white/5 backdrop-blur-md shadow-inner">
             <button 
                onClick={() => handleSort('appearances')}
                className={`px-5 py-2 rounded-lg text-xs font-bold tracking-wider transition-all duration-300 flex items-center gap-2 ${sortField === 'appearances' ? 'bg-gradient-to-r from-blue-600/80 to-indigo-600/80 text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)] border border-blue-400/20' : 'text-[#7b8899] hover:text-white hover:bg-white/5 border border-transparent'}`}
             >
                SORT BY FREQUENCY {sortField === 'appearances' && (sortDir === 'desc' ? '↓' : '↑')}
             </button>
             <button 
                onClick={() => handleSort('pctchange')}
                className={`px-5 py-2 rounded-lg text-xs font-bold tracking-wider transition-all duration-300 flex items-center gap-2 ${sortField === 'pctchange' ? 'bg-gradient-to-r from-blue-600/80 to-indigo-600/80 text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)] border border-blue-400/20' : 'text-[#7b8899] hover:text-white hover:bg-white/5 border border-transparent'}`}
             >
                SORT BY MOMENTUM {sortField === 'pctchange' && (sortDir === 'desc' ? '↓' : '↑')}
             </button>
          </div>
       </div>

       <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
               <thead>
                  <tr className="border-b border-white/[0.05] bg-black/40 text-white/40 uppercase tracking-[0.2em]">
                     <th 
                       className="p-4 font-bold text-[10px] cursor-pointer hover:text-white transition-colors"
                       onClick={() => handleSort('nsecode')}
                     >
                       Symbol <SortIcon field="nsecode" />
                     </th>
                     <th className="p-4 font-bold text-[10px]">Sector</th>
                     <th className="p-4 font-bold text-[10px]">Close</th>
                     <th 
                       className="p-4 font-bold text-[10px] cursor-pointer hover:text-white transition-colors"
                       onClick={() => handleSort('pctchange')}
                     >
                       % Chg <SortIcon field="pctchange" />
                     </th>
                     <th 
                       className="p-4 text-center font-bold text-[10px] cursor-pointer hover:text-white transition-colors"
                       onClick={() => handleSort('appearances')}
                     >
                       Hits (20d) <SortIcon field="appearances" />
                     </th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-white/[0.02]">
                  {enrichedScans.map((stock, i) => (
                     <tr 
                      key={stock.nsecode + i} 
                      className="hover:bg-white/[0.04] transition-colors duration-200 group cursor-pointer"
                      onClick={() => onStockClick && onStockClick(stock.nsecode)}
                    >
                        <td className="p-4">
                           <div className="flex items-center gap-2">
                             <span className="font-bold text-white/90 text-sm tracking-wide group-hover:text-white transition-colors">{stock.nsecode}</span>
                             {stock.appearances === 1 && (
                               <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider uppercase flex items-center gap-1 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                                 ⚡ NEW
                               </span>
                             )}
                           </div>
                           <div className="text-[10px] font-semibold text-white/40 tracking-wider uppercase mt-1 px-2 py-0.5 rounded bg-white/5 inline-block">{stock.scan_type}</div>
                        </td>
                        <td className="p-4">
                           <div className="text-xs font-semibold text-white/70 group-hover:text-white/90 transition-colors">{stock.sector}</div>
                           <div className="text-[10px] text-white/30 tracking-wider uppercase mt-1">{stock.industry}</div>
                        </td>
                        <td className="p-4 font-mono font-semibold text-white/80 group-hover:text-white transition-colors">
                           {stock.close != null ? stock.close.toFixed(2) : '—'}
                        </td>
                        <td className="p-4 font-mono font-bold">
                           {stock.pctchange != null ? (
                             <span className={stock.pctchange > 0 ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]' : stock.pctchange < 0 ? 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.4)]' : 'text-white/40'}>
                                {stock.pctchange > 0 ? '+' : ''}{stock.pctchange.toFixed(2)}%
                             </span>
                           ) : '—'}
                        </td>
                        <td className="p-4 text-center">
                           <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 font-bold text-xs shadow-[inset_0_0_8px_rgba(250,204,21,0.1)] group-hover:scale-110 transition-transform duration-300">
                              {stock.appearances}
                           </span>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
          </div>
       </div>
    </div>
  );
}
