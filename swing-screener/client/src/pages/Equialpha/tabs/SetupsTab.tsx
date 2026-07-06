import React, { useState, useEffect } from 'react';

interface Setup {
  id: number;
  symbol: string;
  date: string;
  month: string;
  logic: string | null;
  chart_url: string | null;
  created_at: string;
}

interface SetupsTabProps {
  onStockClick?: (symbol: string) => void;
}

export function SetupsTab({ onStockClick }: SetupsTabProps) {
  const [setups, setSetups] = useState<Setup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [newSetup, setNewSetup] = useState({
    symbol: '',
    date: new Date().toISOString().split('T')[0],
    month: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    logic: '',
    chart_url: ''
  });

  useEffect(() => {
    fetchSetups();
  }, []);

  const fetchSetups = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/equialpha/setups');
      const data = await res.json();
      setSetups(data.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch('/api/equialpha/setups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSetup)
      });
      setShowForm(false);
      setNewSetup({
        symbol: '',
        date: new Date().toISOString().split('T')[0],
        month: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }),
        logic: '',
        chart_url: ''
      });
      fetchSetups();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this setup?')) return;
    try {
      await fetch(`/api/equialpha/setups/${id}`, { method: 'DELETE' });
      fetchSetups();
    } catch (e) {
      console.error(e);
    }
  };

  const filteredSetups = setups.filter(s => 
    !search || s.symbol.toLowerCase().includes(search.toLowerCase()) || 
    (s.logic && s.logic.toLowerCase().includes(search.toLowerCase()))
  );

  // Group by month
  const groupedSetups = filteredSetups.reduce((acc, setup) => {
    if (!acc[setup.month]) acc[setup.month] = [];
    acc[setup.month].push(setup);
    return acc;
  }, {} as Record<string, Setup[]>);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center bg-[#161b27] border border-[#2a3a5c] rounded-xl p-4">
        <div>
          <h2 className="text-lg font-bold text-white">Historical Setups</h2>
          <p className="text-xs text-[#7b8899]">Database of past trade ideas and chart patterns</p>
        </div>
        
        <div className="flex gap-4 items-center">
          <input 
            type="text" 
            placeholder="Search symbol or logic..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-64 bg-[#0e1117] border border-[#2a3a5c] rounded-lg px-3 py-2 text-sm text-white placeholder-[#4b5563] outline-none focus:border-[#56CCF2]"
          />
          <button 
            onClick={() => setShowForm(true)}
            className="bg-[#56CCF2] hover:bg-[#45a4c4] text-black font-bold py-2 px-4 rounded-lg text-sm transition-all"
          >
            + Add Setup
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-[#7b8899]">Loading setups...</div>
      ) : Object.keys(groupedSetups).length === 0 ? (
        <div className="text-center py-12 bg-[#161b27] border border-[#2a3a5c] rounded-xl text-[#7b8899]">
          No setups found.
        </div>
      ) : (
        Object.entries(groupedSetups).map(([month, monthSetups]) => (
          <div key={month} className="mb-8">
            <h3 className="text-xl font-bold text-white mb-4 border-b border-[#2a3a5c] pb-2 inline-block px-2">{month}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {monthSetups.map(setup => (
                <div key={setup.id} className="bg-[#161b27] border border-[#2a3a5c] rounded-xl overflow-hidden shadow-lg group relative flex flex-col">
                  {setup.chart_url ? (
                    <div className="h-48 bg-[#0e1117] border-b border-[#2a3a5c] overflow-hidden relative">
                      <img 
                        src={setup.chart_url} 
                        alt={`${setup.symbol} chart`} 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#161b27] to-transparent opacity-80"></div>
                    </div>
                  ) : (
                    <div className="h-24 bg-[#0e1117] border-b border-[#2a3a5c] flex items-center justify-center text-[#2a3a5c] text-4xl font-bold italic opacity-30">
                      NO CHART
                    </div>
                  )}
                  
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-3 relative z-10 -mt-8">
                      <div 
                        onClick={() => onStockClick && onStockClick(setup.symbol)}
                        className="bg-[#56CCF2] text-black font-black text-xl px-3 py-1 rounded shadow-lg cursor-pointer hover:bg-white transition-colors"
                      >
                        {setup.symbol}
                      </div>
                      <div className="text-xs font-mono font-medium bg-[#0e1117]/80 text-[#7b8899] px-2 py-1 rounded backdrop-blur border border-[#2a3a5c]">
                        {new Date(setup.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                    
                    <p className="text-sm text-[#e8eaf6] leading-relaxed flex-1 mt-2">
                      {setup.logic || 'No logic provided.'}
                    </p>
                    
                    <div className="mt-4 pt-4 border-t border-[#2a3a5c] flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {setup.chart_url && (
                        <a href={setup.chart_url} target="_blank" rel="noreferrer" className="text-xs text-[#56CCF2] hover:underline">
                          View Full Chart ↗
                        </a>
                      )}
                      <button 
                        onClick={() => handleDelete(setup.id)}
                        className="text-xs text-[#f87171] hover:underline ml-auto"
                      >
                        Delete Setup
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b27] border border-[#2a3a5c] rounded-xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-bold text-white mb-4">Add New Setup</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#7b8899] mb-1">Symbol</label>
                  <input required type="text" value={newSetup.symbol} onChange={e => setNewSetup({...newSetup, symbol: e.target.value.toUpperCase()})} className="w-full bg-[#0e1117] border border-[#2a3a5c] rounded p-2 text-white outline-none focus:border-[#56CCF2]" />
                </div>
                <div>
                  <label className="block text-xs text-[#7b8899] mb-1">Date</label>
                  <input required type="date" value={newSetup.date} onChange={e => setNewSetup({...newSetup, date: e.target.value})} className="w-full bg-[#0e1117] border border-[#2a3a5c] rounded p-2 text-white outline-none focus:border-[#56CCF2]" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#7b8899] mb-1">Month Grouping (e.g. "April 2026")</label>
                <input required type="text" value={newSetup.month} onChange={e => setNewSetup({...newSetup, month: e.target.value})} className="w-full bg-[#0e1117] border border-[#2a3a5c] rounded p-2 text-white outline-none focus:border-[#56CCF2]" />
              </div>
              <div>
                <label className="block text-xs text-[#7b8899] mb-1">Chart URL (Image Link)</label>
                <input type="url" value={newSetup.chart_url} onChange={e => setNewSetup({...newSetup, chart_url: e.target.value})} placeholder="https://..." className="w-full bg-[#0e1117] border border-[#2a3a5c] rounded p-2 text-white outline-none focus:border-[#56CCF2]" />
              </div>
              <div>
                <label className="block text-xs text-[#7b8899] mb-1">Logic / Reasoning</label>
                <textarea value={newSetup.logic} onChange={e => setNewSetup({...newSetup, logic: e.target.value})} className="w-full bg-[#0e1117] border border-[#2a3a5c] rounded p-2 text-white outline-none focus:border-[#56CCF2] h-24 resize-none"></textarea>
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-[#7b8899] hover:text-white transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm bg-[#56CCF2] hover:bg-[#45a4c4] text-black font-bold rounded-lg transition-colors">Save Setup</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
