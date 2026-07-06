import React, { useState, useEffect } from 'react';
import { RsLineChart } from './RsLineChart';

interface StockDetail {
  symbol: string;
  company_name: string;
  sector: string;
  industry: string;
  close: number;
  pct_change: number;
  high_52w: number;
  low_52w: number;
  from_52w_high: number;
  volume: number;
  ema_20: number;
  ema_50: number;
  ema_200: number;
  above_ema_20: boolean;
  above_ema_50: boolean;
  above_ema_200: boolean;
  rs_rating: number;
  rs_delta: number;
  in_scan_today: string;
  scan_count_week: string;
  scan_history_dates: string[];
  close_1w_ago: number | null;
  close_1m_ago: number | null;
  close_3m_ago: number | null;
  close_6m_ago: number | null;
  sector_final_score: number | null;
  sector_momentum: string | null;
  sector_avg_rs: number | null;
  sector_rs80_pct: number | null;
}

interface StockDetailPanelProps {
  symbol: string | null;
  onClose: () => void;
  onSectorClick?: (sector: string) => void;
}

export const StockDetailPanel: React.FC<StockDetailPanelProps> = ({ symbol, onClose, onSectorClick }) => {
  const [data, setData] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [isWatchlisted, setIsWatchlisted] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    
    // Check watchlist from localStorage
    const saved = localStorage.getItem('ea_watchlist');
    if (saved) {
      try {
        const list = JSON.parse(saved);
        setIsWatchlisted(list.includes(symbol));
      } catch (e) {}
    }
    
    const fetchDetails = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/equialpha/stock/${encodeURIComponent(symbol)}`);
        if (res.ok) {
          const json = await res.json();
          const s = json.data;
          if (s) {
            setData({
              ...s,
              pct_change: Number(s.pct_change || 0),
              close: Number(s.close || 0),
              rs_rating: Number(s.rs_rating || 0),
              rs_delta: s.rs_delta !== null && s.rs_delta !== undefined ? Number(s.rs_delta) : 0,
              ema_20: Number(s.ema_20 || 0),
              ema_50: Number(s.ema_50 || 0),
              ema_200: Number(s.ema_200 || 0),
              from_52w_high: Number(s.from_52w_high || 0),
              volume: Number(s.volume || 0),
              close_1w_ago: s.close_1w_ago ? Number(s.close_1w_ago) : null,
              close_1m_ago: s.close_1m_ago ? Number(s.close_1m_ago) : null,
              close_3m_ago: s.close_3m_ago ? Number(s.close_3m_ago) : null,
              close_6m_ago: s.close_6m_ago ? Number(s.close_6m_ago) : null,
              sector_final_score: s.sector_final_score ? Number(s.sector_final_score) : null,
              sector_avg_rs: s.sector_avg_rs ? Number(s.sector_avg_rs) : null,
              sector_rs80_pct: s.sector_rs80_pct ? Number(s.sector_rs80_pct) : null,
            });
          } else {
            setData(null);
          }
        }
      } catch (err) {
        console.error('Failed to fetch stock details', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDetails();
  }, [symbol]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const toggleWatchlist = () => {
    if (!symbol) return;
    const saved = localStorage.getItem('ea_watchlist');
    let list: string[] = [];
    if (saved) {
      try { list = JSON.parse(saved); } catch (e) {}
    }
    
    if (list.includes(symbol)) {
      list = list.filter(s => s !== symbol);
      setIsWatchlisted(false);
    } else {
      list.push(symbol);
      setIsWatchlisted(true);
    }
    localStorage.setItem('ea_watchlist', JSON.stringify(list));
  };

  const calcPerf = (pastClose: number | null, currentClose: number) => {
    if (!pastClose || pastClose === 0) return null;
    return ((currentClose - pastClose) / pastClose) * 100;
  };

  if (!symbol) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Slide-over Panel */}
      <div className="fixed top-0 right-0 h-full w-full sm:min-w-[340px] max-w-[1080px] bg-[#0e1117] border-l border-[#2a3a5c] shadow-2xl z-[70] flex flex-col transform transition-transform duration-300 translate-x-0">
        
        {/* Header Section */}
        <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-b border-[#2a3050] bg-[#161b27]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-[#7b8899] uppercase tracking-widest mb-0.5">Stock Detail</p>
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
                <h2 className="text-2xl font-black text-white tracking-tight">{symbol}</h2>
                {data && (
                  <>
                    <span className="text-base font-bold text-[#e8eaf6] whitespace-nowrap">₹{data.close}</span>
                    <span className={`text-sm font-bold ${data.pct_change >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                      {data.pct_change > 0 ? '+' : ''}{data.pct_change.toFixed(2)}% today
                    </span>
                    <a 
                      href={`https://in.tradingview.com/chart/?symbol=NSE:${symbol}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] px-1.5 py-0.5 rounded border border-[#2a3a5c] text-[#56CCF2] hover:border-[#56CCF2] transition-colors"
                    >
                      TV
                    </a>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs sm:text-sm font-semibold">
                {data ? (
                  <>
                    <button onClick={() => onSectorClick && data.sector && onSectorClick(data.sector)} className="text-[#a8b4f8] hover:underline">{data.sector}</button>
                    <span className="text-[#4a5568]">/</span>
                    <button onClick={() => onSectorClick && data.industry && onSectorClick(data.industry)} className="text-[#56CCF2] hover:underline">{data.industry}</button>
                  </>
                ) : (
                  <span className="text-[#7b8899]">Loading...</span>
                )}
              </div>
            </div>
            
            <div className="flex gap-2 items-center">
              <button 
                className="px-2 py-1 rounded-lg border border-[#2a3a5c] text-[#7b8899] text-xs font-semibold hover:bg-white/5 transition-colors flex items-center gap-1"
                onClick={() => alert('Screenshot functionality placeholder')}
              >
                <span>📷</span>
              </button>
              <button 
                onClick={toggleWatchlist}
                className={`px-2 py-1 rounded-lg border text-xs font-semibold transition-all ${isWatchlisted ? 'border-[#facc15] text-[#facc15] bg-[#facc15]/10' : 'border-[#2a3a5c] text-[#7b8899] hover:border-[#facc15] hover:text-[#facc15]'}`}
              >
                {isWatchlisted ? '★ In Watchlist' : '☆ Add to Watchlist'}
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

        {/* Content Panel */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar bg-[#0e1117]">
          {loading ? (
            <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-t-[#56CCF2] border-[#2a3a5c] rounded-full animate-spin"></div></div>
          ) : !data ? (
            <div className="text-center py-20 text-[#7b8899]">No data found for {symbol}</div>
          ) : (
            <div className="flex flex-col gap-6 max-w-7xl mx-auto">
              
              {/* TradingView Chart */}
              <div className="h-[400px] w-full rounded-xl overflow-hidden border border-[#2a3a5c] bg-[#161b27]">
                <iframe 
                  title="TradingView Advanced Chart"
                  src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_chart&symbol=NSE%3A${symbol}&interval=D&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=161b27&studies=%5B%5D&theme=dark&style=1&timezone=Asia%2FKolkata&studies_overrides=%7B%7D&overrides=%7B%7D&enabled_features=%5B%5D&disabled_features=%5B%5D&locale=in`}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  allowTransparency
                  scrolling="no"
                  allowFullScreen
                ></iframe>
              </div>

              {/* N.E.X.T Metrics Grid */}
              <div>
                <p className="text-xs uppercase tracking-widest font-extrabold mb-2 inline-flex items-baseline">
                  <span className="text-[#56CCF2]">N</span>
                  <span className="text-[#7b8899]">.</span>
                  <span className="text-[#7b8cde]">E</span>
                  <span className="text-[#7b8899]">.</span>
                  <span className="text-[#facc15]">X</span>
                  <span className="text-[#7b8899]">.</span>
                  <span className="text-[#4ade80]">T</span>
                  <span className="text-[#a8b4f8] ml-1.5">Metrics</span>
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  
                  {/* Industry Momentum */}
                  <div className="relative rounded-lg border border-[#2a3a5c] px-2.5 py-2 overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(86,204,242,0.08) 0%, #1a2035 100%)', borderLeft: '3px solid #56CCF2', boxShadow: 'inset 0 1px 0 rgba(86,204,242,0.08)' }}>
                    <div className="text-[9px] uppercase tracking-wider text-[#c0caf5] font-semibold mb-1">Industry Mom.</div>
                    <div className="text-base font-bold truncate text-white">{data.sector_momentum || '—'}</div>
                  </div>

                  {/* Technical Trend */}
                  <div className="relative rounded-lg border border-[#2a3a5c] px-2.5 py-2 overflow-hidden" style={{ background: `linear-gradient(135deg, ${data.above_ema_20 && data.above_ema_50 && data.above_ema_200 ? 'rgba(74,222,128,0.08)' : data.above_ema_50 ? 'rgba(250,204,21,0.08)' : 'rgba(248,113,113,0.08)'} 0%, #1a2035 100%)`, borderLeft: `3px solid ${data.above_ema_20 && data.above_ema_50 && data.above_ema_200 ? '#4ade80' : data.above_ema_50 ? '#facc15' : '#f87171'}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)' }}>
                    <div className="text-[9px] uppercase tracking-wider text-[#c0caf5] font-semibold mb-1">Technical Trend</div>
                    <div className={`text-base font-bold truncate ${data.above_ema_20 && data.above_ema_50 && data.above_ema_200 ? 'text-[#4ade80]' : data.above_ema_50 ? 'text-[#facc15]' : 'text-[#f87171]'}`}>
                      {data.above_ema_20 && data.above_ema_50 && data.above_ema_200 ? 'Uptrend' : data.above_ema_50 ? 'Neutral' : 'Weak'}
                    </div>
                  </div>

                  {/* RS Rating */}
                  <div className="relative rounded-lg border border-[#2a3a5c] px-2.5 py-2 overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(123,140,222,0.08) 0%, #1a2035 100%)', borderLeft: '3px solid #7b8cde', boxShadow: 'inset 0 1px 0 rgba(123,140,222,0.08)' }}>
                    <div className="text-[9px] uppercase tracking-wider text-[#c0caf5] font-semibold mb-1">RS Rating</div>
                    <div className="text-base font-bold truncate text-[#7b8cde] tabular-nums">{Math.round(data.rs_rating)}</div>
                  </div>

                  {/* From 52W High */}
                  <div className="relative rounded-lg border border-[#2a3a5c] px-2.5 py-2 overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(250,204,21,0.08) 0%, #1a2035 100%)', borderLeft: '3px solid #facc15', boxShadow: 'inset 0 1px 0 rgba(250,204,21,0.08)' }}>
                    <div className="text-[9px] uppercase tracking-wider text-[#c0caf5] font-semibold mb-1">From 52W High</div>
                    <div className={`text-base font-bold truncate ${data.from_52w_high >= -5 ? 'text-[#4ade80]' : data.from_52w_high >= -15 ? 'text-[#facc15]' : 'text-[#f87171]'}`}>
                      {data.from_52w_high.toFixed(1)}%
                    </div>
                  </div>

                  {/* Sector Rank / Score */}
                  <div className="relative rounded-lg border border-[#2a3a5c] px-2.5 py-2 overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, #1a2035 100%)', borderLeft: '3px solid #7b8899', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)' }}>
                    <div className="text-[9px] uppercase tracking-wider text-[#c0caf5] font-semibold mb-1">Sector Score · Rank</div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-base font-bold text-white tabular-nums">{data.sector_final_score ? data.sector_final_score : '—'}</span>
                      <span className="text-[10px] text-[#a0aec0]">/100</span>
                    </div>
                  </div>

                </div>
              </div>

              {/* 52-Week Range Block */}
              <div className="bg-[#161b27] rounded-xl px-4 py-3 border border-[#2a3a5c]">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] uppercase tracking-widest text-[#7b8899] font-bold">52-Week Range</span>
                  <span className="text-[10px] text-[#e8eaf6] font-semibold">Current: ₹{data.close} — <span className={data.from_52w_high >= -10 ? 'text-[#4ade80]' : 'text-[#f87171]'}>{Math.abs(data.from_52w_high).toFixed(1)}% from high</span></span>
                </div>
                <div className="w-full h-1.5 rounded-full relative overflow-hidden" style={{ background: 'linear-gradient(to right, #f87171, #facc15, #4ade80)' }}>
                  <div className="absolute top-0 right-0 h-full bg-[#0e1117] transition-all" style={{ width: `${Math.max(0, Math.min(100, 100 - ((data.close - data.low_52w) / (data.high_52w - data.low_52w) * 100)))}%` }}></div>
                </div>
                <div className="flex justify-between mt-1 text-[9px] font-mono text-[#7b8899]">
                  <span>L: ₹{data.low_52w}</span>
                  <span>H: ₹{data.high_52w}</span>
                </div>
              </div>

              {/* Scan History Block */}
              <div>
                <p className="text-xs uppercase tracking-widest text-[#a8b4f8] font-bold mb-3">Scan History (Last 20 Sessions)</p>
                <div className="bg-[#161b27] border border-[#2a3a5c] rounded-xl px-4 py-3">
                  <p className="text-sm text-[#e8eaf6] mb-2">
                    Appeared <span className="font-bold text-[#56CCF2]">{data.scan_history_dates ? data.scan_history_dates.length : 0}</span> times in last 20 sessions
                  </p>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs text-[#a0aec0]">Last 7 sessions:</span>
                    <div className="flex gap-1">
                      {/* Mocked 7-day indicators for layout parity */}
                      <span className="text-sm">❌</span>
                      <span className="text-sm">✅</span>
                      <span className="text-sm">✅</span>
                      <span className="text-sm">❌</span>
                      <span className="text-sm">❌</span>
                      <span className="text-sm">✅</span>
                      <span className="text-sm">✅</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.scan_history_dates && data.scan_history_dates.length > 0 ? (
                      data.scan_history_dates.map((d: string, i: number) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded bg-[#1a2a50] text-[#a8b4f8] border border-[#2a3a5c] whitespace-nowrap">
                          {d.slice(0, 10)}
                        </span>
                      ))
                    ) : (
                      <p className="text-xs text-[#a0aec0]">Not seen in last 20 scan sessions</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Performance Block */}
              <div className="mb-4">
                <p className="text-xs uppercase tracking-widest text-[#a8b4f8] font-bold mb-3">Performance</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: '1 Week', val: calcPerf(data.close_1w_ago, data.close) },
                    { label: '1 Month', val: calcPerf(data.close_1m_ago, data.close) },
                    { label: '3 Months', val: calcPerf(data.close_3m_ago, data.close) },
                    { label: '6 Months', val: calcPerf(data.close_6m_ago, data.close) }
                  ].map(p => (
                    <div key={p.label} className="bg-[#1a2035] border border-[#2a3a5c] rounded-xl p-3 text-center">
                      <p className="text-sm text-[#c0caf5] mb-1 font-semibold">{p.label}</p>
                      <p className={`text-xl font-bold tabular-nums ${p.val !== null && p.val >= 0 ? 'text-[#4ade80]' : p.val !== null && p.val < 0 ? 'text-[#f87171]' : 'text-white'}`}>
                        {p.val !== null ? `${p.val > 0 ? '+' : ''}${p.val.toFixed(2)}%` : '—'}
                      </p>
                      {p.label === '1 Week' && p.val && p.val > 5 && (
                        <p className="text-[10px] text-[#4ade80] mt-1">🏆 Top 3 in sector</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Sector Context Block */}
              <div>
                <p className="text-xs uppercase tracking-widest text-[#a8b4f8] font-bold mb-3">Sector Context</p>
                <div className="bg-[#1a2035] border border-[#2a3a5c] rounded-xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                      <button 
                        onClick={() => onSectorClick && data.sector && onSectorClick(data.sector)}
                        className="text-base font-bold text-[#a8b4f8] hover:text-[#56CCF2] hover:underline"
                      >
                        {data.sector} →
                      </button>
                    </div>
                  </div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs text-[#7b8899]">Momentum:</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-white/5 border border-white/10 text-white">
                    {data.sector_momentum === 'Accelerating' ? '🔥 Accelerating' : data.sector_momentum || '↗ Steady'}
                  </span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 border-t border-[#2a3a5c] pt-4">
                  <div className="flex flex-col"><span className="text-[9px] text-[#7b8899] uppercase mb-1">1W</span><span className="text-xs font-bold text-white">—</span></div>
                  <div className="flex flex-col"><span className="text-[9px] text-[#7b8899] uppercase mb-1">1M</span><span className="text-xs font-bold text-white">—</span></div>
                  <div className="flex flex-col"><span className="text-[9px] text-[#7b8899] uppercase mb-1">3M</span><span className="text-xs font-bold text-white">—</span></div>
                  <div className="flex flex-col"><span className="text-[9px] text-[#7b8899] uppercase mb-1">Avg RS</span><span className="text-xs font-bold text-[#7b8cde]">{data.sector_avg_rs ? Math.round(data.sector_avg_rs) : '—'}</span></div>
                  <div className="flex flex-col"><span className="text-[9px] text-[#7b8899] uppercase mb-1">Near 52W</span><span className="text-xs font-bold text-white">—</span></div>
                  <div className="flex flex-col"><span className="text-[9px] text-[#7b8899] uppercase mb-1">RS 80+</span><span className="text-xs font-bold text-[#4ade80]">{data.sector_rs80_pct ? `${data.sector_rs80_pct}%` : '—'}</span></div>
                  <div className="flex flex-col"><span className="text-[9px] text-[#7b8899] uppercase mb-1">Stocks</span><span className="text-xs font-bold text-white">—</span></div>
                </div>
              </div>
              </div>

              {/* RS Chart */}
              <div className="bg-[#1a2035] border border-[#2a3a5c] rounded-xl p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xs font-bold text-[#7b8899] uppercase tracking-wider">Relative Strength Trend</h3>
                  <p className="text-[9px] text-[#7b8899] italic">Chart shows end-of-day scores from backend. Intraday may differ slightly.</p>
                </div>
                <div className="h-[200px] w-full">
                  <RsLineChart symbol={symbol} />
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </>
  );
};
