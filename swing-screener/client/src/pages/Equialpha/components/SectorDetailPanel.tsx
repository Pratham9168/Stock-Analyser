import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';

interface SectorStock {
  symbol: string;
  company_name: string;
  industry: string;
  sector: string;
  close: number;
  pct_change: number;
  rs_rating: number;
  rs_delta: number;
  ema_20: number | null;
  ema_50: number | null;
  ema_200: number | null;
  above_ema_20: boolean;
  above_ema_50: boolean;
  above_ema_200: boolean;
  high_52w: number | null;
  from_52w_high: number | null;
  scan_count: number;
  close_1w_ago: number | null;
  close_1m_ago: number | null;
  close_3m_ago: number | null;
}

interface SectorScore {
  sector: string;
  final_score: number;
  avg_rs: number;
  momentum: string;
  verdict: string;
  rs80_pct: number;
  near52w_pct: number;
}

interface SectorDetailPanelProps {
  industry: string | null;
  scores?: SectorScore[];
  onClose: () => void;
  onStockClick: (symbol: string) => void;
}

export const SectorDetailPanel: React.FC<SectorDetailPanelProps> = ({ industry, scores = [], onClose, onStockClick }) => {
  const [stocks, setStocks] = useState<SectorStock[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Sorting & Filtering state
  const [sortCol, setSortCol] = useState<keyof SectorStock | 'ema_score'>('rs_rating');
  const [sortDesc, setSortDesc] = useState(true);
  const [subFilter, setSubFilter] = useState<string>('All');

  const sectorData = useMemo(() => {
    return scores.find(s => s.sector === industry) || null;
  }, [scores, industry]);

  const uniqueSubIndustries = useMemo(() => {
    const set = new Set(stocks.map(s => s.industry));
    return ['All', ...Array.from(set)].filter(Boolean);
  }, [stocks]);

  useEffect(() => {
    if (!industry) return;
    
    const fetchDetails = async () => {
      setLoading(true);
      try {
        const [stocksRes, historyRes] = await Promise.all([
          fetch(`/api/equialpha/sector/${encodeURIComponent(industry)}`),
          fetch(`/api/equialpha/hydrate/sector_history/${encodeURIComponent(industry)}`)
        ]);
        
        if (stocksRes.ok) {
          const json = await stocksRes.json();
          setStocks((json.data || []).map((s: any) => ({
            ...s,
            pct_change: Number(s.pct_change || 0),
            close: Number(s.close || 0),
            rs_rating: Number(s.rs_rating || 0),
            rs_delta: Number(s.rs_delta || 0),
            from_52w_high: s.from_52w_high !== null ? Number(s.from_52w_high) : null,
            scan_count: Number(s.scan_count || 0),
            close_1w_ago: s.close_1w_ago !== null ? Number(s.close_1w_ago) : null,
            close_1m_ago: s.close_1m_ago !== null ? Number(s.close_1m_ago) : null,
            close_3m_ago: s.close_3m_ago !== null ? Number(s.close_3m_ago) : null
          })));
        }
        
        if (historyRes.ok) {
          const json = await historyRes.json();
          setHistory(json.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch sector details', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDetails();
  }, [industry]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSort = (col: keyof SectorStock | 'ema_score') => {
    if (sortCol === col) {
      setSortDesc(!sortDesc);
    } else {
      setSortCol(col);
      setSortDesc(true);
    }
  };

  const getEmaScore = (s: SectorStock) => (s.above_ema_20 ? 1 : 0) + (s.above_ema_50 ? 1 : 0) + (s.above_ema_200 ? 1 : 0);

  const filteredStocks = useMemo(() => {
    if (subFilter === 'All') return stocks;
    return stocks.filter(s => s.industry === subFilter);
  }, [stocks, subFilter]);

  const sortedStocks = useMemo(() => {
    return [...filteredStocks].sort((a, b) => {
      let valA: any = sortCol === 'ema_score' ? getEmaScore(a) : a[sortCol];
      let valB: any = sortCol === 'ema_score' ? getEmaScore(b) : b[sortCol];
      
      if (valA === null || valA === undefined) valA = -Infinity;
      if (valB === null || valB === undefined) valB = -Infinity;
      
      if (typeof valA === 'string') {
        return sortDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
      }
      return sortDesc ? valB - valA : valA - valB;
    });
  }, [filteredStocks, sortCol, sortDesc]);

  if (!industry) return null;

  const avgPctChange = stocks.length ? stocks.reduce((acc, s) => acc + s.pct_change, 0) / stocks.length : 0;
  
  // Calculate Historical Returns
  const calcReturn = (key: 'close_1w_ago' | 'close_1m_ago' | 'close_3m_ago') => {
    const validStocks = stocks.filter(s => s[key] !== null && s[key]! > 0);
    if (!validStocks.length) return null;
    return validStocks.reduce((sum, s) => sum + ((s.close - s[key]!) / s[key]!) * 100, 0) / validStocks.length;
  };

  const ret1W = calcReturn('close_1w_ago');
  const ret1M = calcReturn('close_1m_ago');
  const ret3M = calcReturn('close_3m_ago');

  const renderReturn = (val: number | null) => {
    if (val === null) return <span className="text-xs font-bold text-[#7b8899]">—</span>;
    return <span className={`text-xs font-bold ${val >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>{val > 0 ? '+' : ''}{val.toFixed(1)}%</span>;
  };
  
  // Calculate Breadth
  const above20 = stocks.length ? (stocks.filter(s => s.above_ema_20).length / stocks.length) * 100 : 0;
  const above50 = stocks.length ? (stocks.filter(s => s.above_ema_50).length / stocks.length) * 100 : 0;
  const above200 = stocks.length ? (stocks.filter(s => s.above_ema_200).length / stocks.length) * 100 : 0;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1a2035] border border-[#2a3a5c] p-2 rounded shadow-xl text-xs">
          <p className="text-[#7b8899] mb-1">{label}</p>
          <p className="font-bold text-white">
            {payload[0].name}: <span style={{ color: payload[0].stroke }}>{payload[0].value}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <span className="text-[#2a3a5c] ml-1">↕</span>;
    return <span className="text-[#56CCF2] ml-1">{sortDesc ? '↓' : '↑'}</span>;
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Slide-over Panel (Expanded to 850px for charts) */}
      <div className="fixed top-0 right-0 h-full w-[850px] max-w-[100vw] bg-[#0e1117] border-l border-[#2a3a5c] shadow-2xl z-[70] flex flex-col transform transition-transform duration-300 translate-x-0">
        
        {/* Header */}
        <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-b border-[#2a3050] bg-[#161b27]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-[#7b8899] uppercase tracking-widest mb-0.5">Industry Detail</p>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                  {industry}
                </h2>
                {sectorData?.verdict && (
                  <div className="flex gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      sectorData.verdict === 'Strong' ? 'bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/20' :
                      sectorData.verdict === 'Moderate' ? 'bg-[#facc15]/10 text-[#facc15] border border-[#facc15]/20' :
                      sectorData.verdict === 'Weak' ? 'bg-[#f87171]/10 text-[#f87171] border border-[#f87171]/20' :
                      'bg-white/10 text-white/70 border border-white/20'
                    }`}>
                      {sectorData.verdict}
                    </span>
                    {sectorData.final_score >= 70 && sectorData.momentum === 'Accelerating' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#56CCF2]/10 text-[#56CCF2] border border-[#56CCF2]/20 flex items-center gap-1" data-testid="tag-leading-industry">
                        ⭐ Leading Industry
                      </span>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-[#7b8899] mt-1 font-medium tracking-wide">
                {stocks.length} Constituents • Avg Daily: <span className={avgPctChange >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}>{avgPctChange > 0 ? '+' : ''}{avgPctChange.toFixed(2)}%</span>
              </p>
            </div>
            
            <div className="flex gap-2 items-center">
              <button 
                className="px-2 py-1 rounded-lg border border-[#2a3a5c] text-[#7b8899] text-xs font-semibold hover:bg-white/5 transition-colors flex items-center gap-1"
                onClick={() => alert('Screenshot functionality placeholder')}
              >
                <span>📷</span>
              </button>
              <button 
                onClick={onClose}
                className="text-[#7b8899] hover:text-[#f87171] text-xl font-bold px-2 py-1 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar bg-[#0e1117]">
          {loading ? (
            <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-t-[#56CCF2] border-[#2a3a5c] rounded-full animate-spin"></div></div>
          ) : stocks.length === 0 ? (
            <div className="text-center py-20 text-[#7b8899]">No stocks found for {industry}</div>
          ) : (
            <div className="flex flex-col gap-6 max-w-7xl mx-auto">
              
              {/* Top Metrics Row */}
              {sectorData && (
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <p className="text-xs uppercase tracking-widest font-extrabold inline-flex items-baseline">
                      <span className="text-[#56CCF2]">N.</span>
                      <span className="text-[#7b8cde]">E.</span>
                      <span className="text-[#facc15]">X.</span>
                      <span className="text-[#4ade80]">T</span>
                      <span className="text-[#7b8899] ml-1.5">Industry Rating</span>
                    </p>
                    <div className="h-px flex-1 bg-gradient-to-r from-[#2a3a5c] to-transparent"></div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    
                    {/* N.E.X.T Verdict Card */}
                    <div className="relative rounded-lg border border-[#2a3a5c] px-3 py-2 overflow-hidden col-span-2" style={{ background: `linear-gradient(135deg, ${sectorData.final_score >= 70 ? 'rgba(74,222,128,0.15)' : sectorData.final_score >= 50 ? 'rgba(250,204,21,0.15)' : 'rgba(248,113,113,0.15)'} 0%, #1a2035 100%)`, boxShadow: `0 0 18px ${sectorData.final_score >= 70 ? 'rgba(74,222,128,0.12)' : sectorData.final_score >= 50 ? 'rgba(250,204,21,0.12)' : 'rgba(248,113,113,0.12)'}, inset 0 1px 0 rgba(255,255,255,0.05)` }}>
                      <div className="text-[10px] text-[#c0caf5] uppercase tracking-wider mb-1 font-semibold">Overall Score</div>
                      <div className="flex items-end gap-2">
                        <span className="text-3xl font-black text-white tabular-nums tracking-tighter">
                          {sectorData.final_score}
                        </span>
                        <span className="text-xs text-[#7b8899] mb-1">/ 100</span>
                      </div>
                    </div>
                    
                    {/* Momentum Button Card */}
                    <div className="relative rounded-lg border border-[#2a3a5c] px-3 py-2 overflow-hidden hover:scale-[1.02] transition-transform cursor-default" style={{ background: `linear-gradient(135deg, ${sectorData.momentum === 'Accelerating' ? 'rgba(74,222,128,0.08)' : sectorData.momentum.includes('Steady') ? 'rgba(250,204,21,0.08)' : 'rgba(248,113,113,0.08)'} 0%, #1a2035 100%)` }}>
                      <div className="flex justify-between items-start">
                        <div className="text-[10px] text-[#c0caf5] uppercase tracking-wider mb-1 font-semibold">Momentum</div>
                        <span className="text-[8px] text-[#7b8899] border border-[#2a3a5c] px-1 rounded">↱ cycle</span>
                      </div>
                      <div className={`text-base font-bold truncate ${
                        sectorData.momentum === 'Accelerating' ? 'text-[#4ade80]' :
                        sectorData.momentum.includes('Steady') ? 'text-[#facc15]' : 'text-[#f87171]'
                      }`}>
                        {sectorData.momentum}
                      </div>
                    </div>

                    {/* Performance Inner Grid (1W, 1M, 3M) */}
                    <div className="col-span-2 relative rounded-lg border border-[#2a3a5c] bg-[#1a2035] px-3 py-2 overflow-hidden" style={{ borderLeft: '3px solid #7b8cde' }}>
                      <div className="text-[10px] text-[#c0caf5] uppercase tracking-wider mb-2 font-semibold">Historical Returns</div>
                      <div className="grid grid-cols-3 gap-1">
                        <div className="text-center"><span className="block text-[9px] text-[#7b8899]">1W</span>{renderReturn(ret1W)}</div>
                        <div className="text-center border-l border-[#2a3a5c]"><span className="block text-[9px] text-[#7b8899]">1M</span>{renderReturn(ret1M)}</div>
                        <div className="text-center border-l border-[#2a3a5c]"><span className="block text-[9px] text-[#7b8899]">3M</span>{renderReturn(ret3M)}</div>
                      </div>
                    </div>

                    {/* Avg RS & Breadth Cards */}
                    <div className="relative rounded-lg border border-[#2a3a5c] bg-[#1a2035] px-3 py-2 overflow-hidden" style={{ borderLeft: '3px solid #56CCF2' }}>
                      <div className="text-[10px] text-[#c0caf5] uppercase tracking-wider mb-1 font-semibold flex items-center justify-between">
                        RS 80+
                        <span className="text-[#7b8899] cursor-help" title=">15% = Good">ℹ</span>
                      </div>
                      <div className="text-base font-bold text-white tabular-nums">{sectorData.rs80_pct}%</div>
                      <div className="text-[9px] mt-1 text-[#7b8899] leading-tight">
                        {sectorData.rs80_pct >= 15 ? 'Good for swing trading — enough stocks showing relative strength.' : 'Industry health is not good yet — few stocks have strength.'}
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* Charts Row */}
              {history.length > 0 && (
                <div className="grid grid-cols-2 gap-4">
                  {/* Score Trend Chart */}
                  <div className="bg-[#1a2035] border border-[#2a3a5c] rounded-xl p-4">
                    <h3 className="text-xs font-bold text-[#7b8899] uppercase tracking-wider mb-1">Sector Score — Trend</h3>
                    <p className="text-[9px] text-[#7b8899] mb-3 italic">Chart shows end-of-day scores from backend. Intraday may differ slightly.</p>
                    <div className="h-[140px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={history} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#56CCF2" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#56CCF2" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a3a5c" vertical={false} />
                          <XAxis dataKey="date" tick={{fontSize: 9, fill: '#7b8899'}} tickFormatter={(t) => t.slice(5)} minTickGap={20} />
                          <YAxis domain={[0, 100]} tick={{fontSize: 9, fill: '#7b8899'}} />
                          <Tooltip content={<CustomTooltip />} />
                          <Area type="monotone" name="Score" dataKey="final_score" stroke="#56CCF2" strokeWidth={2} fillOpacity={1} fill="url(#scoreGradient)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* RS Trend Chart */}
                  <div className="bg-[#1a2035] border border-[#2a3a5c] rounded-xl p-4">
                    <h3 className="text-xs font-bold text-[#7b8899] uppercase tracking-wider mb-1">Avg RS Rating — Trend</h3>
                    <p className="text-[9px] text-[#7b8899] mb-3 italic">Chart shows end-of-day scores from backend. Intraday may differ slightly.</p>
                    <div className="h-[140px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={history} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="rsGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#7b8cde" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#7b8cde" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a3a5c" vertical={false} />
                          <XAxis dataKey="date" tick={{fontSize: 9, fill: '#7b8899'}} tickFormatter={(t) => t.slice(5)} minTickGap={20} />
                          <YAxis domain={[0, 100]} tick={{fontSize: 9, fill: '#7b8899'}} />
                          <ReferenceLine y={50} stroke="#f87171" strokeDasharray="3 3" opacity={0.5} />
                          <Tooltip content={<CustomTooltip />} />
                          <Area type="monotone" name="Avg RS" dataKey="avg_rs" stroke="#7b8cde" strokeWidth={2} fillOpacity={1} fill="url(#rsGradient)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {/* Stocks Table */}
              <div className="bg-[#161b27] border border-[#2a3a5c] rounded-xl overflow-hidden flex flex-col min-h-[400px]">
                
                {/* Table Filters & Helpers */}
                <div className="p-3 border-b border-[#2a3a5c] flex justify-between items-center bg-[#1a2035]">
                  <div>
                    <p className="text-xs font-semibold text-[#e8eaf6] mb-1">All Stocks ({filteredStocks.length})</p>
                    <p className="text-[10px] text-[#7b8899]">Top in scan: {industry} ({filteredStocks.reduce((sum, s) => sum + s.scan_count, 0)})</p>
                  </div>
                  <div>
                    <select 
                      className="bg-[#1a2035] border border-[#2a3a5c] text-[10px] text-[#e8eaf6] rounded px-2 py-1 outline-none focus:border-[#56CCF2]"
                      value={subFilter}
                      onChange={(e) => setSubFilter(e.target.value)}
                    >
                      {uniqueSubIndustries.map(sub => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Table Header */}
                <div className="grid grid-cols-[30px_2fr_1fr_1fr_1fr_1fr_1fr] gap-4 p-3 border-b border-[#2a3a5c] bg-[#1a2035] text-[10px] font-bold text-[#7b8899] uppercase tracking-wider items-center select-none">
                  <div className="text-center">#</div>
                  <div className="cursor-pointer hover:text-white flex items-center" onClick={() => handleSort('symbol')}>
                    Symbol <SortIcon col="symbol" />
                  </div>
                  <div className="cursor-pointer hover:text-white flex items-center justify-end" onClick={() => handleSort('pct_change')}>
                    1D % <SortIcon col="pct_change" />
                  </div>
                  <div className="cursor-pointer hover:text-white flex items-center justify-end" onClick={() => handleSort('rs_rating')}>
                    RS Rating <SortIcon col="rs_rating" />
                  </div>
                  <div className="cursor-pointer hover:text-white flex items-center justify-end" onClick={() => handleSort('from_52w_high')}>
                    From 52W H <SortIcon col="from_52w_high" />
                  </div>
                  <div className="cursor-pointer hover:text-white flex items-center justify-center" onClick={() => handleSort('ema_score')}>
                    EMA (20/50/200) <SortIcon col="ema_score" />
                  </div>
                  <div className="cursor-pointer hover:text-white flex items-center justify-center" onClick={() => handleSort('scan_count')}>
                    Scans (20d) <SortIcon col="scan_count" />
                  </div>
                </div>
                
                {/* Table Body */}
                <div className="flex-1 overflow-y-auto">
                  {sortedStocks.map((stock, i) => (
                    <div 
                      key={stock.symbol}
                      onClick={() => onStockClick(stock.symbol)}
                      className={`grid grid-cols-[30px_2fr_1fr_1fr_1fr_1fr_1fr] gap-4 p-3 border-b border-[#2a3a5c]/50 hover:bg-white/5 cursor-pointer transition-colors items-center ${i < 3 && sortCol === 'rs_rating' ? 'bg-[#56CCF2]/5' : ''}`}
                    >
                      <div className="text-center text-[10px] text-[#7b8899] font-mono">{i + 1}</div>
                      
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">{stock.symbol}</div>
                        <div className="text-[10px] text-[#7b8899] truncate">{stock.company_name}</div>
                      </div>
                      
                      <div className="text-right">
                        <div className={`text-xs font-mono font-bold ${stock.pct_change > 0 ? 'text-[#4ade80]' : stock.pct_change < 0 ? 'text-[#f87171]' : 'text-[#7b8899]'}`}>
                          {stock.pct_change > 0 ? '+' : ''}{stock.pct_change.toFixed(2)}%
                        </div>
                        <div className="text-[10px] text-[#7b8899] font-mono">₹{stock.close}</div>
                      </div>
                      
                      <div className="text-right">
                        <div className="text-sm font-bold text-white font-mono">
                          {Math.round(stock.rs_rating)} 
                          <span className="text-[10px] ml-1">
                            {stock.rs_rating >= 90 ? '🚀' : stock.rs_rating >= 80 ? '🟢' : stock.rs_rating >= 50 ? '🟡' : '🔴'}
                          </span>
                        </div>
                        <div className={`text-[10px] font-mono ${stock.rs_delta > 0 ? 'text-[#4ade80]' : stock.rs_delta < 0 ? 'text-[#f87171]' : 'text-[#7b8899]'}`}>
                          {stock.rs_delta > 0 ? '↑' : stock.rs_delta < 0 ? '↓' : ''}{Math.abs(stock.rs_delta)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className={`text-xs font-mono ${stock.from_52w_high !== null && stock.from_52w_high >= -10 ? 'text-[#4ade80]' : stock.from_52w_high !== null && stock.from_52w_high >= -20 ? 'text-[#facc15]' : 'text-[#f87171]'}`}>
                          {stock.from_52w_high !== null ? `${stock.from_52w_high.toFixed(1)}%` : '—'}
                        </div>
                      </div>

                      <div className="flex justify-center items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${stock.above_ema_20 ? 'bg-[#4ade80]' : 'bg-[#f87171]'} shadow-[0_0_5px_currentColor]`} title="Above 20 EMA"></div>
                        <div className={`w-2 h-2 rounded-full ${stock.above_ema_50 ? 'bg-[#4ade80]' : 'bg-[#f87171]'} shadow-[0_0_5px_currentColor]`} title="Above 50 EMA"></div>
                        <div className={`w-2 h-2 rounded-full ${stock.above_ema_200 ? 'bg-[#4ade80]' : 'bg-[#f87171]'} shadow-[0_0_5px_currentColor]`} title="Above 200 EMA"></div>
                      </div>

                      <div className="text-center">
                        {stock.scan_count > 0 ? (
                          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded bg-[#56CCF2]/20 text-[#56CCF2] text-[10px] font-bold border border-[#56CCF2]/30">
                            {stock.scan_count}
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#2a3a5c]">—</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </>
  );
};
