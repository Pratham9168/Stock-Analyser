import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TodaysMarketTab } from './tabs/TodaysMarketTab';
import { LiveScanTab } from './tabs/LiveScanTab';
import { SectorAnalysisTab } from './tabs/SectorAnalysisTab';
import { RsAnalyserTab } from './tabs/RsAnalyserTab';
import { JournalTab } from './tabs/JournalTab';
import { StockDetailPanel } from './components/StockDetailPanel';
import { SectorDetailPanel } from './components/SectorDetailPanel';

import { TradeJournalTab } from './tabs/TradeJournalTab';
import { SetupsTab } from './tabs/SetupsTab';

export default function EquialphaDashboard() {
  const [activeTab, setActiveTab] = useState<'market' | 'scan' | 'sector' | 'rs' | 'journal' | 'trade-journal' | 'setups'>('market');
  
  // Panel state
  const [openStockDetail, setOpenStockDetail] = useState<string | null>(null);
  const [openSectorDetail, setOpenSectorDetail] = useState<string | null>(null);

  // Data state
  const [moodData, setMoodData] = useState<any>(null);
  const [scans, setScans] = useState<any[]>([]);
  const [universe, setUniverse] = useState<any[]>([]);
  const [scores, setScores] = useState<any[]>([]);
  const [marketStats, setMarketStats] = useState<any>(null);
  
  // Pipeline state
  const [pipelineStatus, setPipelineStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pipelineRef = useRef<any>(null);
  const checkPipelineTimeoutRef = useRef<any>(null);

  const fetchHydrationData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const [moodRes, scansRes, univRes, scoresRes, statsRes] = await Promise.all([
        fetch('/api/equialpha/hydrate/market_mood').then(r => { if (!r.ok) throw new Error(`mood ${r.status}`); return r.json(); }),
        fetch('/api/equialpha/hydrate/scans').then(r => { if (!r.ok) throw new Error(`scans ${r.status}`); return r.json(); }),
        fetch('/api/equialpha/hydrate/universe_ohlcv_cache').then(r => { if (!r.ok) throw new Error(`universe ${r.status}`); return r.json(); }),
        fetch('/api/equialpha/hydrate/sector_scores').then(r => { if (!r.ok) throw new Error(`scores ${r.status}`); return r.json(); }),
        fetch('/api/equialpha/hydrate/market_stats').then(r => { if (!r.ok) throw new Error(`stats ${r.status}`); return r.json(); }),
      ]);

      setMoodData(moodRes.data);
      setScans(scansRes.data || []);
      setUniverse(univRes.data || []);
      setScores(scoresRes.data || []);
      setMarketStats(statsRes.data || null);
    } catch(e: any) {
      console.error("Hydration failed", e);
      setError(`Backend unavailable: ${e.message}. Is the server running on port 4000?`);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  const checkPipeline = useCallback(async () => {
    try {
      const res = await fetch('/api/equialpha/pipeline/status');
      const data = await res.json();
      
      const wasRunning = pipelineRef.current?.status === 'running';
      const justCompleted = data?.status === 'completed' && wasRunning;
      
      pipelineRef.current = data;
      setPipelineStatus(data);
      
      if (checkPipelineTimeoutRef.current) {
        clearTimeout(checkPipelineTimeoutRef.current);
      }
      
      if (data?.status === 'running') {
        checkPipelineTimeoutRef.current = setTimeout(checkPipeline, 2000);
      } else if (justCompleted) {
        fetchHydrationData();
      }
    } catch(e) { /* ignore */ }
  }, [fetchHydrationData]);

  useEffect(() => {
    fetchHydrationData();
    checkPipeline();
    return () => {
      if (checkPipelineTimeoutRef.current) {
        clearTimeout(checkPipelineTimeoutRef.current);
      }
    };
  }, [fetchHydrationData, checkPipeline]);

  const runPipeline = async () => {
    try {
      await fetch('/api/equialpha/pipeline/run', { method: 'POST' });
      if (checkPipelineTimeoutRef.current) clearTimeout(checkPipelineTimeoutRef.current);
      checkPipelineTimeoutRef.current = setTimeout(checkPipeline, 500);
    } catch(e) {
      console.error("Failed to trigger pipeline", e);
    }
  };

  const pausePipeline = async () => {
    try {
      await fetch('/api/equialpha/pipeline/pause', { method: 'POST' });
      if (checkPipelineTimeoutRef.current) clearTimeout(checkPipelineTimeoutRef.current);
      checkPipelineTimeoutRef.current = setTimeout(checkPipeline, 500);
    } catch(e) {
      console.error("Failed to pause pipeline", e);
    }
  };

  return (
    <div className="flex bg-[#05070a] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#131b2c] via-[#0b0f19] to-[#05070a] text-[#e8eaf6] h-full overflow-hidden font-sans selection:bg-[#56CCF2]/30" style={{ minHeight: 'calc(100vh - 64px)' }}>
       <div className="flex-1 flex flex-col h-full overflow-hidden relative">
          
          {/* Header */}
          <header className="flex justify-between items-center px-6 py-4 border-b border-[#ffffff0a] bg-[#0b0f19]/60 backdrop-blur-xl z-20 shrink-0 shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
             <div className="flex items-center gap-3">
                 <div className="flex font-black text-xl tracking-widest drop-shadow-[0_0_8px_rgba(86,204,242,0.3)]">
                    <span className="text-[#56CCF2]">N</span><span className="text-white/20">.</span>
                    <span className="text-[#7b8cde]">E</span><span className="text-white/20">.</span>
                    <span className="text-[#facc15]">X</span><span className="text-white/20">.</span>
                    <span className="text-[#4ade80]">T</span>
                 </div>
                 <div className="w-px h-6 bg-white/10 mx-2"></div>
                 <span className="text-xs font-bold text-[#7b8899] tracking-[0.2em]">EQUIALPHA</span>
             </div>

             <div className="flex items-center gap-4">
                 {/* Pipeline Status */}
                 {pipelineStatus?.status === 'running' && (
                     <div className="flex items-center gap-3 bg-white/[0.03] border border-white/10 px-4 py-1.5 rounded-xl shadow-[0_0_15px_rgba(86,204,242,0.1)]">
                        <div className="w-4 h-4 rounded-full border-2 border-t-[#56CCF2] border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
                        <div className="flex flex-col">
                           <span className="text-[10px] text-[#56CCF2] font-bold uppercase tracking-wider">{pipelineStatus.current_step}</span>
                           <div className="w-32 h-1 bg-black/40 rounded-full mt-1 overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-[#56CCF2] to-[#7b8cde] rounded-full transition-all duration-300 relative" style={{ width: `${pipelineStatus.progress_pct}%`}}>
                                 <div className="absolute top-0 right-0 bottom-0 w-4 bg-white/40 blur-[2px] animate-pulse"></div>
                              </div>
                           </div>
                           {pipelineStatus.stocks_processed > 0 && (
                             <span className="text-[9px] text-[#7b8899] mt-0.5">{pipelineStatus.stocks_processed}/{pipelineStatus.total_stocks}</span>
                           )}
                        </div>
                     </div>
                 )}

                 {pipelineStatus?.status === 'completed' && (
                     <span className="text-[10px] text-[#4ade80] font-bold tracking-wider drop-shadow-[0_0_4px_rgba(74,222,128,0.4)]">✓ SYNCHRONIZED</span>
                 )}

                 {pipelineStatus?.status === 'failed' && (
                     <span className="text-[10px] text-[#f87171] font-bold tracking-wider drop-shadow-[0_0_4px_rgba(248,113,113,0.4)]">✗ SYNC FAILED</span>
                 )}

                 {pipelineStatus?.status === 'paused' && (
                     <span className="text-[10px] text-[#facc15] font-bold tracking-wider drop-shadow-[0_0_4px_rgba(250,204,21,0.4)]">⏸ PAUSED AT {pipelineStatus.stocks_processed}/{pipelineStatus.total_stocks}</span>
                 )}

                 {/* Refresh Button */}
                 <button
                     onClick={() => fetchHydrationData(true)}
                     title="Refresh data"
                     className="p-2 rounded-xl bg-white/[0.03] border border-white/5 text-[#7b8899] hover:bg-white/[0.08] hover:text-white transition-all duration-300 hover:shadow-[0_0_10px_rgba(255,255,255,0.05)] active:scale-95"
                 >
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                 </button>

                 {pipelineStatus?.status === 'running' && (
                     <button 
                         onClick={pausePipeline}
                         className="px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all duration-300 bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 hover:text-red-400 active:scale-95"
                     >
                         EXIT SCAN
                     </button>
                 )}

                 <button 
                     onClick={runPipeline}
                     disabled={pipelineStatus?.status === 'running'}
                     className={`relative overflow-hidden px-5 py-2 rounded-xl text-xs font-bold tracking-wide transition-all duration-300 ${
                       pipelineStatus?.status === 'running' 
                         ? 'bg-white/5 text-white/30 cursor-not-allowed border border-white/5' 
                         : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_25px_rgba(37,99,235,0.5)] border border-blue-400/20 active:scale-95'
                     }`}
                 >
                     {pipelineStatus?.status === 'running' ? 'PROCESSING...' : (pipelineStatus?.status === 'paused' ? 'RESUME SCAN' : 'INITIALIZE PIPELINE')}
                 </button>
             </div>
          </header>

          {/* Navigation Tabs */}
          <div className="flex gap-3 px-6 py-4 shrink-0 bg-transparent relative z-10">
              <button 
                onClick={() => setActiveTab('market')}
                className={`relative px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 overflow-hidden ${
                  activeTab === 'market' 
                    ? 'text-white bg-white/10 border border-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.12)]' 
                    : 'text-[#7b8899] hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                 <span className="relative z-10 flex items-center gap-2">
                   <svg className={`w-4 h-4 ${activeTab === 'market' ? 'text-[#56CCF2]' : 'text-current'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                   Today's Market
                 </span>
                 {activeTab === 'market' && <div className="absolute inset-0 bg-gradient-to-r from-[#56CCF2]/10 to-transparent"></div>}
              </button>
              <button 
                onClick={() => setActiveTab('scan')}
                className={`relative px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 overflow-hidden ${
                  activeTab === 'scan' 
                    ? 'text-white bg-white/10 border border-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.12)]' 
                    : 'text-[#7b8899] hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                 <span className="relative z-10 flex items-center gap-2">
                   <svg className={`w-4 h-4 ${activeTab === 'scan' ? 'text-[#4ade80]' : 'text-current'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                   Live Scan
                 </span>
                 {activeTab === 'scan' && <div className="absolute inset-0 bg-gradient-to-r from-[#4ade80]/10 to-transparent"></div>}
              </button>
              <button 
                onClick={() => setActiveTab('sector')}
                className={`relative px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 overflow-hidden ${
                  activeTab === 'sector' 
                    ? 'text-white bg-white/10 border border-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.12)]' 
                    : 'text-[#7b8899] hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                 <span className="relative z-10 flex items-center gap-2">
                   <svg className={`w-4 h-4 ${activeTab === 'sector' ? 'text-[#facc15]' : 'text-current'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                   Sector Analysis
                 </span>
                 {activeTab === 'sector' && <div className="absolute inset-0 bg-gradient-to-r from-[#facc15]/10 to-transparent"></div>}
              </button>
              <button 
                onClick={() => setActiveTab('rs')}
                className={`relative px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 overflow-hidden ${
                  activeTab === 'rs' 
                    ? 'text-white bg-white/10 border border-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.12)]' 
                    : 'text-[#7b8899] hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <span className="relative z-10 flex items-center gap-2">
                  <svg className={`w-4 h-4 ${activeTab === 'rs' ? 'text-[#818cf8]' : 'text-current'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
                  RS Analyser
                </span>
                {activeTab === 'rs' && <div className="absolute inset-0 bg-gradient-to-r from-[#818cf8]/10 to-transparent"></div>}
              </button>
              <button 
                onClick={() => setActiveTab('journal')}
                className={`relative px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 overflow-hidden ${
                  activeTab === 'journal' 
                    ? 'text-white bg-white/10 border border-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.12)]' 
                    : 'text-[#7b8899] hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                 <span className="relative z-10 flex items-center gap-2">
                   <svg className={`w-4 h-4 ${activeTab === 'journal' ? 'text-[#e879f9]' : 'text-current'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                   Journal & Setups
                 </span>
                 {activeTab === 'journal' && <div className="absolute inset-0 bg-gradient-to-r from-[#e879f9]/10 to-transparent"></div>}
              </button>
              <button 
                onClick={() => setActiveTab('trade-journal')}
                className={`relative px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 overflow-hidden ${
                  activeTab === 'trade-journal' 
                    ? 'text-white bg-white/10 border border-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.12)]' 
                    : 'text-[#7b8899] hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                 <span className="relative z-10 flex items-center gap-2">
                   <svg className={`w-4 h-4 ${activeTab === 'trade-journal' ? 'text-[#f472b6]' : 'text-current'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                   Trade Journal
                 </span>
                 {activeTab === 'trade-journal' && <div className="absolute inset-0 bg-gradient-to-r from-[#f472b6]/10 to-transparent"></div>}
              </button>
              <button 
                onClick={() => setActiveTab('setups')}
                className={`relative px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 overflow-hidden ${
                  activeTab === 'setups' 
                    ? 'text-white bg-white/10 border border-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.12)]' 
                    : 'text-[#7b8899] hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                 <span className="relative z-10 flex items-center gap-2">
                   <svg className={`w-4 h-4 ${activeTab === 'setups' ? 'text-[#a78bfa]' : 'text-current'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                   Setups Database
                 </span>
                 {activeTab === 'setups' && <div className="absolute inset-0 bg-gradient-to-r from-[#a78bfa]/10 to-transparent"></div>}
              </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-transparent custom-scrollbar z-0 relative">
             {isLoading ? (
                 <div className="flex flex-col items-center justify-center h-64 gap-4">
                    <div className="w-8 h-8 border-4 border-white/10 border-t-blue-500 rounded-full animate-spin"></div>
                    <div className="text-[#5a6a8a] text-sm tracking-widest font-bold uppercase">Synthesizing Data...</div>
                 </div>
             ) : error ? (
                 <div className="flex flex-col items-center justify-center h-64 gap-4">
                    <div className="text-red-400 text-4xl">⚠</div>
                    <div className="text-red-400/80 text-sm font-bold tracking-wider uppercase">Connection Error</div>
                    <div className="text-[#5a6a8a] text-xs max-w-md text-center">{error}</div>
                    <button onClick={() => fetchHydrationData()} className="mt-2 px-4 py-2 rounded-xl text-xs font-bold bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-all">
                       RETRY
                    </button>
                 </div>
             ) : (
                 <div>
                    {activeTab === 'market' && <TodaysMarketTab moodData={moodData} marketStats={marketStats} scores={scores} onSectorClick={setOpenSectorDetail} onStockClick={setOpenStockDetail} />}
                    {activeTab === 'scan' && <LiveScanTab scans={scans} universe={universe} onStockClick={setOpenStockDetail} />}
                    {activeTab === 'sector' && <SectorAnalysisTab scores={scores} onSectorClick={setOpenSectorDetail} onStockClick={setOpenStockDetail} />}
                    {activeTab === 'rs' && <RsAnalyserTab onStockClick={setOpenStockDetail} />}
                    {activeTab === 'journal' && <JournalTab onStockClick={setOpenStockDetail} />}
                    {activeTab === 'trade-journal' && <TradeJournalTab onStockClick={setOpenStockDetail} />}
                    {activeTab === 'setups' && <SetupsTab onStockClick={setOpenStockDetail} />}
                 </div>
             )}
          </div>
       </div>

       {/* Slide-over Panels */}
       <StockDetailPanel symbol={openStockDetail} onClose={() => setOpenStockDetail(null)} onSectorClick={setOpenSectorDetail} />
       <SectorDetailPanel industry={openSectorDetail} scores={scores} onClose={() => setOpenSectorDetail(null)} onStockClick={setOpenStockDetail} />
    </div>
  );
}
