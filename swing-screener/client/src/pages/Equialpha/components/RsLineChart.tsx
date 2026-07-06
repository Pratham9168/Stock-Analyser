import React, { useEffect, useState, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';

// Register chart.js modules (safe to call multiple times)
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// Try registering annotation plugin if available
try {
  ChartJS.register(annotationPlugin);
} catch (e) {
  // annotation plugin not installed, threshold line won't render
}

interface RsRow {
  date: string;
  rs_rating: number;
  rs_delta: number | null;
}

interface StockOption {
  symbol: string;
  sector: string;
  industry: string;
}

export function RsLineChart({ symbol: propSymbol }: { symbol?: string }) {
  const [symbol, setSymbol] = useState(propSymbol || '');
  const [inputValue, setInputValue] = useState(propSymbol || '');
  const [rsData, setRsData] = useState<RsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [universe, setUniverse] = useState<StockOption[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // Update internal symbol if prop changes
  useEffect(() => {
    if (propSymbol) {
      setSymbol(propSymbol);
      setInputValue(propSymbol);
    }
  }, [propSymbol]);

  // Load universe for autocomplete
  useEffect(() => {
    fetch('/api/equialpha/hydrate/universe_ohlcv_cache')
      .then(r => r.json())
      .then(res => {
        const stocks = (res.data || []).map((s: any) => ({
          symbol: s.symbol,
          sector: s.sector || '',
          industry: s.industry || '',
        }));
        setUniverse(stocks);
      })
      .catch(() => {});
  }, []);

  // Fetch RS data when symbol changes
  useEffect(() => {
    if (!symbol) { setRsData([]); return; }
    setLoading(true);
    fetch(`/api/equialpha/hydrate/rs_history?symbol=${encodeURIComponent(symbol)}`)
      .then(r => r.json())
      .then(res => {
        setRsData(res.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [symbol]);

  const suggestions = useMemo(() => {
    if (inputValue.length < 1) return [];
    const upper = inputValue.toUpperCase();
    return universe
      .filter(s => s.symbol.toUpperCase().startsWith(upper))
      .slice(0, 8);
  }, [inputValue, universe]);

  const selectSymbol = (sym: string) => {
    setSymbol(sym);
    setInputValue(sym);
    setShowDropdown(false);
  };

  const chartData = {
    labels: rsData.map(d => {
      const dt = new Date(d.date);
      return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    }),
    datasets: [
      {
        label: `RS Rating — ${symbol}`,
        data: rsData.map(d => d.rs_rating),
        borderColor: '#7b8cde',
        backgroundColor: 'rgba(123, 140, 222, 0.1)',
        borderWidth: 2.5,
        pointRadius: rsData.length <= 15 ? 4 : 0,
        pointHoverRadius: 6,
        pointBackgroundColor: '#7b8cde',
        tension: 0.3,
        fill: true,
      },
    ],
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: 'rgba(255,255,255,0.6)',
          font: { size: 11, weight: 600 },
          boxWidth: 12,
          usePointStyle: true,
          pointStyle: 'circle',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(14, 17, 23, 0.95)',
        titleColor: '#e8eaf6',
        bodyColor: '#c0caf5',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          afterLabel: (ctx: any) => {
            const row = rsData[ctx.dataIndex];
            if (row?.rs_delta != null) {
              return `Delta: ${row.rs_delta > 0 ? '+' : ''}${row.rs_delta}`;
            }
            return '';
          },
        },
      },
      annotation: {
        annotations: {
          rs80Line: {
            type: 'line',
            yMin: 80,
            yMax: 80,
            borderColor: 'rgba(74, 222, 128, 0.4)',
            borderWidth: 1,
            borderDash: [6, 4],
            label: {
              display: true,
              content: 'RS 80',
              position: 'start',
              color: 'rgba(74, 222, 128, 0.6)',
              font: { size: 9 },
              backgroundColor: 'transparent',
            },
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: {
          color: 'rgba(255,255,255,0.35)',
          font: { size: 9 },
          maxTicksLimit: 12,
        },
      },
      y: {
        min: 0,
        max: 100,
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: {
          color: 'rgba(255,255,255,0.35)',
          font: { size: 9 },
        },
      },
    },
  };

  return (
    <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md mt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-white/40 font-bold text-[10px] tracking-[0.2em] uppercase">
          RS Rating Trend
        </div>
        {/* Search box */}
        <div className="relative">
          <input
            type="text"
            value={inputValue}
            onChange={e => {
              setInputValue(e.target.value.toUpperCase());
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            onKeyDown={e => {
              if (e.key === 'Enter' && inputValue) {
                selectSymbol(inputValue);
              }
            }}
            placeholder="Search stock…"
            className="w-40 px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white/90 text-xs placeholder:text-white/20 focus:border-[#7b8cde] focus:outline-none focus:ring-1 focus:ring-[#7b8cde]/30 transition-all"
          />
          {showDropdown && suggestions.length > 0 && (
            <div className="absolute top-full mt-1 right-0 w-56 bg-[#1a2035] border border-white/10 rounded-lg shadow-2xl z-30 overflow-hidden max-h-48 overflow-y-auto">
              {suggestions.map(s => (
                <button
                  key={s.symbol}
                  onMouseDown={() => selectSymbol(s.symbol)}
                  className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors flex items-center justify-between"
                >
                  <span className="text-xs text-white/90 font-semibold">{s.symbol}</span>
                  <span className="text-[9px] text-white/30 truncate ml-2">{s.sector}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!symbol && (
        <div className="text-center py-10 text-white/20 text-xs italic">
          Search for a stock above to view its RS rating history.
        </div>
      )}

      {symbol && loading && (
        <div className="flex items-center justify-center py-10">
          <div className="w-5 h-5 border-2 border-white/20 border-t-[#7b8cde] rounded-full animate-spin" />
        </div>
      )}

      {symbol && !loading && rsData.length === 0 && (
        <div className="text-center py-10 text-white/30 text-xs italic">
          No RS history available for <span className="text-[#7b8cde] font-bold">{symbol}</span>. Data accumulates after each pipeline run.
        </div>
      )}

      {symbol && !loading && rsData.length > 0 && (
        <div style={{ height: 260 }}>
          <Line data={chartData} options={options} />
        </div>
      )}
    </div>
  );
}
