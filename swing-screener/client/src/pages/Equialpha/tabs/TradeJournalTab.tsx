import React, { useState, useEffect, useMemo } from 'react';

interface Trade {
  id: number;
  symbol: string;
  entry_date: string;
  entry_price: number;
  quantity: number;
  stop_loss: number | null;
  status: string;
  notes: string;
  created_at: string;
  additions: any[];
  exits: any[];
}

interface TradeJournalTabProps {
  onStockClick?: (symbol: string) => void;
}

export function TradeJournalTab({ onStockClick }: TradeJournalTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'open' | 'closed' | 'analytics'>('open');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [capital, setCapital] = useState(100000); // Default placeholder
  
  // New Trade Form State
  const [showNewTrade, setShowNewTrade] = useState(false);
  const [newTrade, setNewTrade] = useState({
    symbol: '', entry_date: new Date().toISOString().split('T')[0],
    entry_price: '', quantity: '', stop_loss: '', notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tradesRes, capRes] = await Promise.all([
        fetch('/api/equialpha/trades'),
        fetch('/api/equialpha/capital')
      ]);
      const tradesData = await tradesRes.json();
      const capData = await capRes.json();
      
      setTrades(tradesData.data || []);
      if (capData.data?.amount) {
        setCapital(parseFloat(capData.data.amount));
      }
    } catch (e) {
      console.error('Failed to fetch journal data', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch('/api/equialpha/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: newTrade.symbol,
          entry_date: newTrade.entry_date,
          entry_price: parseFloat(newTrade.entry_price),
          quantity: parseInt(newTrade.quantity),
          stop_loss: newTrade.stop_loss ? parseFloat(newTrade.stop_loss) : null,
          notes: newTrade.notes
        })
      });
      setShowNewTrade(false);
      setNewTrade({ symbol: '', entry_date: new Date().toISOString().split('T')[0], entry_price: '', quantity: '', stop_loss: '', notes: '' });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const openTrades = trades.filter(t => t.status === 'open');
  const closedTrades = trades.filter(t => t.status === 'closed');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center bg-[#161b27] border border-[#2a3a5c] rounded-xl p-4">
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveSubTab('open')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeSubTab === 'open' ? 'bg-[#56CCF2]/20 text-[#56CCF2]' : 'text-[#7b8899] hover:bg-white/5'}`}
          >
            Open Trades ({openTrades.length})
          </button>
          <button 
            onClick={() => setActiveSubTab('closed')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeSubTab === 'closed' ? 'bg-[#56CCF2]/20 text-[#56CCF2]' : 'text-[#7b8899] hover:bg-white/5'}`}
          >
            Closed Trades ({closedTrades.length})
          </button>
          <button 
            onClick={() => setActiveSubTab('analytics')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeSubTab === 'analytics' ? 'bg-[#56CCF2]/20 text-[#56CCF2]' : 'text-[#7b8899] hover:bg-white/5'}`}
          >
            Analytics
          </button>
        </div>
        <button 
          onClick={() => setShowNewTrade(true)}
          className="bg-[#56CCF2] hover:bg-[#45a4c4] text-black font-bold py-2 px-4 rounded-lg text-sm transition-all"
        >
          + New Trade
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-[#7b8899]">Loading trade data...</div>
      ) : (
        <div className="bg-[#161b27] border border-[#2a3a5c] rounded-xl overflow-hidden">
          {activeSubTab === 'open' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-[#0e1117] text-[#7b8899] font-medium text-xs uppercase tracking-wider">
                  <tr>
                    <th className="p-4">Symbol</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Entry</th>
                    <th className="p-4">Qty</th>
                    <th className="p-4">Investment</th>
                    <th className="p-4">Stop Loss</th>
                    <th className="p-4">Risk</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a3a5c]">
                  {openTrades.length === 0 ? (
                    <tr><td colSpan={8} className="p-8 text-center text-[#7b8899]">No open trades</td></tr>
                  ) : openTrades.map(trade => {
                    const investment = trade.entry_price * trade.quantity;
                    const risk = trade.stop_loss ? (trade.entry_price - trade.stop_loss) * trade.quantity : 0;
                    return (
                      <tr key={trade.id} className="hover:bg-white/[0.02]">
                        <td className="p-4 font-bold text-white cursor-pointer hover:text-[#56CCF2] transition-colors" onClick={() => onStockClick && onStockClick(trade.symbol)}>{trade.symbol}</td>
                        <td className="p-4 text-[#7b8899]">{new Date(trade.entry_date).toLocaleDateString()}</td>
                        <td className="p-4 text-white">₹{trade.entry_price}</td>
                        <td className="p-4 text-white">{trade.quantity}</td>
                        <td className="p-4 text-white">₹{investment.toLocaleString()}</td>
                        <td className="p-4 text-[#f87171]">{trade.stop_loss ? `₹${trade.stop_loss}` : 'None'}</td>
                        <td className="p-4 text-[#f87171]">₹{risk.toLocaleString()}</td>
                        <td className="p-4">
                          <button 
                            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs text-white"
                            onClick={() => {
                              fetch(`/api/equialpha/trades/${trade.id}/exits`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ date: new Date().toISOString().split('T')[0], price: trade.entry_price, quantity: trade.quantity, isFullExit: true })
                              }).then(fetchData);
                            }}
                          >
                            Close Trade
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeSubTab === 'closed' && (
             <div className="overflow-x-auto">
               <table className="w-full text-left text-sm whitespace-nowrap">
                 <thead className="bg-[#0e1117] text-[#7b8899] font-medium text-xs uppercase tracking-wider">
                   <tr>
                     <th className="p-4">Symbol</th>
                     <th className="p-4">Entry Date</th>
                     <th className="p-4">Entry</th>
                     <th className="p-4">Qty</th>
                     <th className="p-4">Status</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-[#2a3a5c]">
                   {closedTrades.length === 0 ? (
                     <tr><td colSpan={5} className="p-8 text-center text-[#7b8899]">No closed trades</td></tr>
                   ) : closedTrades.map(trade => (
                     <tr key={trade.id} className="hover:bg-white/[0.02]">
                       <td className="p-4 font-bold text-white cursor-pointer hover:text-[#56CCF2] transition-colors" onClick={() => onStockClick && onStockClick(trade.symbol)}>{trade.symbol}</td>
                       <td className="p-4 text-[#7b8899]">{new Date(trade.entry_date).toLocaleDateString()}</td>
                       <td className="p-4 text-white">₹{trade.entry_price}</td>
                       <td className="p-4 text-white">{trade.quantity}</td>
                       <td className="p-4 text-[#7b8899]">Closed</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          )}

          {activeSubTab === 'analytics' && (
            <div className="p-6 text-center text-[#7b8899]">
              Analytics coming soon...
            </div>
          )}
        </div>
      )}

      {showNewTrade && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b27] border border-[#2a3a5c] rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-white mb-4">Add New Trade</h3>
            <form onSubmit={handleCreateTrade} className="space-y-4">
              <div>
                <label className="block text-xs text-[#7b8899] mb-1">Symbol</label>
                <input required type="text" value={newTrade.symbol} onChange={e => setNewTrade({...newTrade, symbol: e.target.value})} className="w-full bg-[#0e1117] border border-[#2a3a5c] rounded p-2 text-white outline-none focus:border-[#56CCF2]" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#7b8899] mb-1">Entry Date</label>
                  <input required type="date" value={newTrade.entry_date} onChange={e => setNewTrade({...newTrade, entry_date: e.target.value})} className="w-full bg-[#0e1117] border border-[#2a3a5c] rounded p-2 text-white outline-none focus:border-[#56CCF2]" />
                </div>
                <div>
                  <label className="block text-xs text-[#7b8899] mb-1">Entry Price</label>
                  <input required type="number" step="0.01" value={newTrade.entry_price} onChange={e => setNewTrade({...newTrade, entry_price: e.target.value})} className="w-full bg-[#0e1117] border border-[#2a3a5c] rounded p-2 text-white outline-none focus:border-[#56CCF2]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#7b8899] mb-1">Quantity</label>
                  <input required type="number" value={newTrade.quantity} onChange={e => setNewTrade({...newTrade, quantity: e.target.value})} className="w-full bg-[#0e1117] border border-[#2a3a5c] rounded p-2 text-white outline-none focus:border-[#56CCF2]" />
                </div>
                <div>
                  <label className="block text-xs text-[#7b8899] mb-1">Stop Loss</label>
                  <input type="number" step="0.01" value={newTrade.stop_loss} onChange={e => setNewTrade({...newTrade, stop_loss: e.target.value})} className="w-full bg-[#0e1117] border border-[#2a3a5c] rounded p-2 text-white outline-none focus:border-[#56CCF2]" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#7b8899] mb-1">Notes</label>
                <textarea value={newTrade.notes} onChange={e => setNewTrade({...newTrade, notes: e.target.value})} className="w-full bg-[#0e1117] border border-[#2a3a5c] rounded p-2 text-white outline-none focus:border-[#56CCF2] h-20 resize-none"></textarea>
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <button type="button" onClick={() => setShowNewTrade(false)} className="px-4 py-2 text-sm text-[#7b8899] hover:text-white transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm bg-[#56CCF2] hover:bg-[#45a4c4] text-black font-bold rounded-lg transition-colors">Save Trade</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
