import React, { useState, useEffect, useMemo } from 'react';

interface LogEntry {
  id: number;
  date: string;
  comment: string;
  updated_at: string;
}

interface WatchlistEntry {
  id: number;
  date: string;
  symbol: string;
  sector: string;
  industry: string;
  note: string;
  added_at: string;
}

interface StockOption {
  symbol: string;
  sector: string;
  industry: string;
}

interface JournalTabProps {
  onStockClick?: (symbol: string) => void;
}

export function JournalTab({ onStockClick }: JournalTabProps) {
  // Format date as YYYY-MM-DD local time
  const getLocalDateString = (d: Date) => {
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - (offset * 60 * 1000));
    return local.toISOString().split('T')[0];
  };

  const today = getLocalDateString(new Date());
  
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [log, setLog] = useState<LogEntry | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [savingLog, setSavingLog] = useState(false);

  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [recentWatchlist, setRecentWatchlist] = useState<WatchlistEntry[]>([]);
  
  const [universe, setUniverse] = useState<StockOption[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [addingStock, setAddingStock] = useState(false);

  const [datesCount, setDatesCount] = useState<Record<string, number>>({});

  // 1. Fetch Universe & Recent & Dates once
  useEffect(() => {
    fetch('/api/equialpha/hydrate/universe_ohlcv_cache')
      .then(r => r.json())
      .then(res => {
        setUniverse((res.data || []).map((s: any) => ({ symbol: s.symbol, sector: s.sector, industry: s.industry })));
      }).catch(() => {});

    fetchRecentWatchlist();
    fetchDatesCount();
  }, []);

  // 2. Fetch Log and Watchlist whenever selectedDate changes
  useEffect(() => {
    fetchLogForDate(selectedDate);
    fetchWatchlistForDate(selectedDate);
  }, [selectedDate]);

  const fetchRecentWatchlist = () => {
    fetch('/api/equialpha/journal/watchlist/recent')
      .then(r => r.json())
      .then(res => setRecentWatchlist(res.data || []))
      .catch(() => {});
  };

  const fetchDatesCount = () => {
    fetch('/api/equialpha/journal/watchlist/dates')
      .then(r => r.json())
      .then(res => setDatesCount(res.data || {}))
      .catch(() => {});
  };

  const fetchLogForDate = (date: string) => {
    fetch(`/api/equialpha/journal/log?date=${date}`)
      .then(r => r.json())
      .then(res => {
        setLog(res.data);
        setCommentInput(res.data ? res.data.comment : '');
      })
      .catch(() => {
        setLog(null);
        setCommentInput('');
      });
  };

  const fetchWatchlistForDate = (date: string) => {
    fetch(`/api/equialpha/journal/watchlist?date=${date}`)
      .then(r => r.json())
      .then(res => setWatchlist(res.data || []))
      .catch(() => setWatchlist([]));
  };

  // --- Actions ---

  const saveLog = async () => {
    setSavingLog(true);
    try {
      const res = await fetch('/api/equialpha/journal/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, comment: commentInput })
      });
      const data = await res.json();
      setLog(data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingLog(false);
    }
  };

  const addStock = async (stock: StockOption) => {
    setSearchInput('');
    setShowDropdown(false);
    if (watchlist.some(w => w.symbol === stock.symbol)) return; // Already there

    setAddingStock(true);
    try {
      await fetch('/api/equialpha/journal/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          symbol: stock.symbol,
          sector: stock.sector,
          industry: stock.industry,
          note: ''
        })
      });
      fetchWatchlistForDate(selectedDate);
      fetchRecentWatchlist();
      fetchDatesCount();
    } catch (e) {
      console.error(e);
    } finally {
      setAddingStock(false);
    }
  };

  const removeStock = async (id: number) => {
    try {
      await fetch(`/api/equialpha/journal/watchlist/${id}`, { method: 'DELETE' });
      setWatchlist(prev => prev.filter(w => w.id !== id));
      fetchRecentWatchlist();
      fetchDatesCount();
    } catch (e) {
      console.error(e);
    }
  };

  // --- Computations ---

  const searchSuggestions = useMemo(() => {
    if (searchInput.length < 1) return [];
    const upper = searchInput.toUpperCase();
    return universe.filter(s => s.symbol.toUpperCase().startsWith(upper)).slice(0, 8);
  }, [searchInput, universe]);

  // Build the list of dates for the sidebar (last 14 days + any active older dates)
  const sidebarDates = useMemo(() => {
    const dates = new Set<string>();
    // Always include today
    dates.add(today);
    
    // Add past 14 days sequentially
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.add(getLocalDateString(d));
    }
    
    // Add any dates that have counts
    Object.keys(datesCount).forEach(d => dates.add(d));
    
    return Array.from(dates).sort().reverse();
  }, [today, datesCount]);

  const formatDateLabel = (dStr: string) => {
    if (dStr === today) return "Today";
    const d = new Date(dStr);
    return d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 max-w-6xl mx-auto pb-10">
      
      {/* LEFT PANE: Date Selector Sidebar */}
      <div className="w-full md:w-64 flex-shrink-0 flex flex-col gap-4">
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md">
           <h3 className="text-white/40 font-bold text-[10px] tracking-[0.2em] uppercase mb-4">Dates</h3>
           <div className="flex flex-col gap-1 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
             {sidebarDates.map(date => {
               const isActive = date === selectedDate;
               const count = datesCount[date] || 0;
               return (
                 <button 
                   key={date}
                   onClick={() => setSelectedDate(date)}
                   className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-sm font-medium ${isActive ? 'bg-[#7b8cde]/20 text-[#7b8cde] border border-[#7b8cde]/30' : 'text-white/60 hover:bg-white/5 border border-transparent'}`}
                 >
                   <span>{formatDateLabel(date)}</span>
                   {count > 0 && (
                     <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${isActive ? 'bg-[#7b8cde]/30 text-[#7b8cde]' : 'bg-white/10 text-white/50'}`}>
                       {count}
                     </span>
                   )}
                 </button>
               );
             })}
           </div>
        </div>
      </div>

      {/* RIGHT PANE: Journal & Setup Content */}
      <div className="flex-1 flex flex-col gap-6">
        
        {/* Research Log Area */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md">
           <div className="flex items-center justify-between mb-4">
             <h3 className="text-white/40 font-bold text-[10px] tracking-[0.2em] uppercase">Market Commentary · {formatDateLabel(selectedDate)}</h3>
             <button 
               onClick={saveLog}
               disabled={savingLog || commentInput === log?.comment}
               className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                 savingLog ? 'bg-white/10 text-white/40 cursor-not-allowed' : 
                 commentInput !== log?.comment ? 'bg-[#4ade80]/20 text-[#4ade80] hover:bg-[#4ade80]/30 border border-[#4ade80]/30' : 
                 'bg-white/5 text-white/30 border border-transparent'
               }`}
             >
               {savingLog ? 'Saving...' : 'Save Log'}
             </button>
           </div>
           
           <textarea
             value={commentInput}
             onChange={e => setCommentInput(e.target.value)}
             placeholder="Write your market observations, trend bias, and trading thoughts for the day..."
             className="w-full h-40 bg-black/40 border border-white/5 rounded-xl p-4 text-sm text-white/90 placeholder:text-white/20 focus:border-[#7b8cde]/50 focus:ring-1 focus:ring-[#7b8cde]/30 outline-none transition-all resize-none custom-scrollbar"
           />
           {log?.updated_at && (
             <div className="text-right mt-2 text-[10px] text-white/30 italic">
               Last updated: {new Date(log.updated_at).toLocaleString('en-IN')}
             </div>
           )}
        </div>

        {/* Setup Watchlist Area */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md">
           <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
             <h3 className="text-white/40 font-bold text-[10px] tracking-[0.2em] uppercase">Setup Library</h3>
             
             {/* Search Input */}
             <div className="relative z-20">
               <input
                 type="text"
                 value={searchInput}
                 onChange={e => {
                   setSearchInput(e.target.value);
                   setShowDropdown(true);
                 }}
                 onFocus={() => setShowDropdown(true)}
                 onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                 placeholder="Search stock to add..."
                 className="w-full md:w-64 px-4 py-2 rounded-xl bg-black/40 border border-white/10 text-white/90 text-sm placeholder:text-white/20 focus:border-[#7b8cde] focus:outline-none focus:ring-1 focus:ring-[#7b8cde]/30 transition-all"
               />
               {showDropdown && searchSuggestions.length > 0 && (
                 <div className="absolute top-full mt-2 right-0 w-full md:w-80 bg-[#1a2035] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                   {searchSuggestions.map(s => (
                     <button
                       key={s.symbol}
                       onMouseDown={() => addStock(s)}
                       className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors flex items-center justify-between border-b border-white/5 last:border-0"
                     >
                       <span className="text-sm text-white/90 font-bold">{s.symbol}</span>
                       <div className="flex flex-col items-end">
                         <span className="text-[10px] text-white/40 truncate max-w-[120px]">{s.sector}</span>
                       </div>
                     </button>
                   ))}
                 </div>
               )}
             </div>
           </div>

           {/* Added Stocks Grid */}
           {watchlist.length === 0 ? (
             <div className="text-center py-10 border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
               <div className="text-3xl mb-3 opacity-20">🎯</div>
               <div className="text-sm text-white/40 font-medium">No setups added for {formatDateLabel(selectedDate)}.</div>
               <div className="text-xs text-white/20 mt-1">Search and select a stock above to add it to your daily watch.</div>
             </div>
           ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {watchlist.map(w => (
                 <div key={w.id} className="group flex items-center justify-between bg-black/20 border border-white/5 rounded-xl p-4 hover:bg-white/[0.02] hover:border-white/10 transition-all">
                   <div>
                     <div onClick={() => onStockClick && onStockClick(w.symbol)} className="font-bold text-[#e8eaf6] text-sm cursor-pointer hover:text-[#56CCF2] transition-colors inline-block">{w.symbol}</div>
                     <div className="text-[10px] text-white/40 uppercase tracking-wider mt-1.5 flex gap-2">
                       <span className="px-1.5 py-0.5 rounded bg-white/5">{w.sector || 'Unmapped'}</span>
                     </div>
                   </div>
                   <button 
                     onClick={() => removeStock(w.id)}
                     className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/20 hover:scale-105"
                     title="Remove from setup library"
                   >
                     ✕
                   </button>
                 </div>
               ))}
             </div>
           )}
        </div>
        
      </div>
    </div>
  );
}
