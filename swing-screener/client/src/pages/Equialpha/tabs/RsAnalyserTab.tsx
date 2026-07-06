import React, { useState, useEffect, useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface RsData {
  symbol: string;
  sector: string;
  industry: string;
  pct_change: number;
  close: number;
  above_ema_20: boolean | null;
  above_ema_50: boolean | null;
  above_ema_200: boolean | null;
  rs_rating: number;
  rs_delta: number;
}

interface RsAnalyserTabProps {
  onStockClick: (symbol: string) => void;
}

export const RsAnalyserTab: React.FC<RsAnalyserTabProps> = ({ onStockClick }) => {
  const [data, setData] = useState<RsData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('All');
  const [minRs, setMinRs] = useState(1);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/equialpha/hydrate/rs_ratings');
        if (!res.ok) throw new Error('Failed to fetch RS data');
        const json = await res.json();
        setData((json.data || []).map((s: any) => ({
          ...s,
          pct_change: Number(s.pct_change || 0),
          close: Number(s.close || 0),
          rs_rating: Number(s.rs_rating || 0),
          rs_delta: (s.rs_delta !== null && s.rs_delta !== undefined) ? Number(s.rs_delta) : null
        })));
      } catch (err) {
        console.error('Failed to fetch RS ratings', err);
        setError('Could not load RS data. Please ensure the pipeline has run.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const sectors = useMemo(() => {
    const unique = Array.from(new Set(data.map(d => d.sector).filter(Boolean)));
    return ['All', ...unique.sort()];
  }, [data]);

  const filteredData = useMemo(() => {
    const searchLower = search.toLowerCase();
    return data.filter(d => {
      if (sectorFilter !== 'All' && d.sector !== sectorFilter) return false;
      if (d.rs_rating < minRs) return false;
      if (searchLower) {
        const matchesSymbol = d.symbol.toLowerCase().includes(searchLower);
        const matchesIndustry = d.industry?.toLowerCase().includes(searchLower);
        const matchesSector = d.sector?.toLowerCase().includes(searchLower);
        const matchesCompany = (d as any).company_name?.toLowerCase().includes(searchLower);
        if (!matchesSymbol && !matchesIndustry && !matchesSector && !matchesCompany) return false;
      }
      return true;
    });
  }, [data, sectorFilter, minRs, search]);

  const getMomentumColor = (d: RsData) => {
    if (d.above_ema_20 && d.above_ema_50) return '#4ade80'; // Strong uptrend
    if (!d.above_ema_20 && d.above_ema_50) return '#facc15'; // Pullback
    if (d.above_ema_20 && !d.above_ema_50) return '#60a5fa'; // Reversal attempt
    return '#f87171'; // Weak/Downtrend
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-[#161b27] border border-[#2a3a5c] p-3 rounded-lg shadow-2xl backdrop-blur-md z-[1000]">
          <p className="font-bold text-white mb-1">{d.symbol}</p>
          <div className="text-xs text-[#a8b4f8] mb-2">{d.industry || d.sector || 'Unmapped'}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-[#7b8899]">RS Rating:</span>
            <span className="font-mono text-white text-right">
              {Math.round(d.rs_rating)} {d.rs_rating >= 90 ? '🚀' : d.rs_rating >= 80 ? '🟢' : d.rs_rating >= 50 ? '🟡' : '🔴'}
              {d.rs_delta !== null && (
                <span className={`ml-1 ${d.rs_delta > 0 ? 'text-[#4ade80]' : d.rs_delta < 0 ? 'text-[#f87171]' : 'text-[#7b8899]'}`}>
                  ({d.rs_delta > 0 ? '+' : ''}{d.rs_delta})
                </span>
              )}
            </span>
            
            <span className="text-[#7b8899]">% Change:</span>
            <span className={`font-mono text-right ${d.pct_change > 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
              {d.pct_change > 0 ? '+' : ''}{d.pct_change.toFixed(2)}%
            </span>
            
            <span className="text-[#7b8899]">Close:</span>
            <span className="font-mono text-white text-right">₹{d.close.toLocaleString('en-IN')}</span>
          </div>
          <div className="mt-2 pt-2 border-t border-[#2a3a5c] flex gap-1">
            <span className={`px-1.5 py-0.5 rounded text-[9px] ${d.above_ema_20 ? 'bg-[#4ade80]/20 text-[#4ade80]' : 'bg-[#f87171]/20 text-[#f87171]'}`}>20EMA</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] ${d.above_ema_50 ? 'bg-[#4ade80]/20 text-[#4ade80]' : 'bg-[#f87171]/20 text-[#f87171]'}`}>50EMA</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] ${d.above_ema_200 ? 'bg-[#4ade80]/20 text-[#4ade80]' : 'bg-[#f87171]/20 text-[#f87171]'}`}>200EMA</span>
          </div>
          <div className="mt-2 text-[9px] text-[#7b8899] italic">Click to view stock details</div>
        </div>
      );
    }
    return null;
  };

  if (loading) return <div className="p-8 text-center text-[#7b8899]">Loading universe data...</div>;
  if (error) return <div className="p-8 text-center text-[#f87171]">Error: {error}</div>;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-[#161b27] border border-[#2a3a5c] rounded-xl">
        <div>
          <h2 className="text-sm font-bold text-white mb-1">RS Analyser</h2>
          <p className="text-xs text-[#7b8899]">Universe Performance Scatter Chart ({filteredData.length} stocks)</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <input 
            type="text" 
            placeholder="Search symbol/industry..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-[#0e1117] border border-[#2a3a5c] rounded-lg px-3 py-1.5 text-xs text-white placeholder-[#4b5563] outline-none focus:border-[#56CCF2]"
          />
          
          <select 
            value={sectorFilter}
            onChange={e => setSectorFilter(e.target.value)}
            className="bg-[#0e1117] border border-[#2a3a5c] rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-[#56CCF2]"
          >
            {sectors.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          
          <div className="flex items-center gap-2 bg-[#0e1117] border border-[#2a3a5c] rounded-lg px-3 py-1.5">
            <label className="text-xs text-[#7b8899]">Min RS:</label>
            <input 
              type="range" 
              min="1" max="99" 
              value={minRs} 
              onChange={e => setMinRs(Number(e.target.value))}
              className="w-24 accent-[#56CCF2]"
            />
            <span className="text-xs font-mono text-white w-6 text-right">{minRs}</span>
          </div>
        </div>
      </div>

      {/* Chart Container */}
      <div className="flex-1 bg-[#161b27] border border-[#2a3a5c] rounded-xl p-4">
        {filteredData.length > 0 ? (
          <ResponsiveContainer width="100%" height={500}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3a5c" opacity={0.5} />
              <XAxis 
                type="number" 
                dataKey="rs_rating" 
                name="RS Rating" 
                domain={[0, 100]} 
                tick={{ fill: '#7b8899', fontSize: 10 }}
                axisLine={{ stroke: '#2a3a5c' }}
                label={{ value: 'Relative Strength (RS Rating)', position: 'insideBottom', offset: -10, fill: '#7b8899', fontSize: 11 }}
              />
              <YAxis 
                type="number" 
                dataKey="pct_change" 
                name="Daily % Change" 
                tick={{ fill: '#7b8899', fontSize: 10 }}
                axisLine={{ stroke: '#2a3a5c' }}
                label={{ value: 'Daily % Change', angle: -90, position: 'insideLeft', fill: '#7b8899', fontSize: 11 }}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#56CCF2', strokeWidth: 1 }} />
              <Scatter 
                name="Stocks" 
                data={filteredData} 
              >
                {filteredData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={getMomentumColor(entry)} 
                    onClick={() => onStockClick(entry.symbol)}
                    style={{ cursor: 'pointer' }}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full flex items-center justify-center text-[#7b8899]">No stocks match the current filters.</div>
        )}
      </div>
      
      {/* Debug List to ensure data exists */}
      <div className="bg-[#161b27] border border-[#2a3a5c] rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-2">Top 5 Stocks (Debug)</h3>
        <div className="flex flex-wrap gap-3">
          {filteredData.slice(0, 5).map(s => (
            <div 
              key={s.symbol} 
              onClick={() => onStockClick(s.symbol)}
              className="text-xs text-[#a8b4f8] bg-[#0e1117] hover:bg-white/5 hover:text-white transition-colors p-2.5 rounded cursor-pointer border border-[#2a3a5c]/50 hover:border-[#56CCF2]/40"
            >
              {s.symbol}: RS {s.rs_rating} ({s.pct_change}%)
            </div>
          ))}
        </div>
      </div>
      
      {/* Legend */}
      <div className="flex items-center justify-center gap-6 p-3 bg-[#161b27] border border-[#2a3a5c] rounded-xl text-[10px] text-[#7b8899]">
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#4ade80]"></div> Strong Uptrend (&gt;20 &amp; &gt;50 EMA)</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#facc15]"></div> Pullback (&lt;20 but &gt;50 EMA)</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#60a5fa]"></div> Reversal Attempt (&gt;20 but &lt;50 EMA)</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#f87171]"></div> Downtrend (&lt;20 &amp; &lt;50 EMA)</div>
      </div>
    </div>
  );
};
