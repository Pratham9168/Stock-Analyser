import React, { useEffect, useState } from 'react';
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface BreadthRow {
  date: string;
  above_ema20_pct: string;
  above_ema50_pct: string;
  above_ema200_pct: string;
  advancing: number;
  declining: number;
}

export function BreadthChart() {
  const [data, setData] = useState<BreadthRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/equialpha/hydrate/breadth_history')
      .then(r => r.json())
      .then(res => {
        setData(res.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-white/20 border-t-[#7b8cde] rounded-full animate-spin" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-6 text-white/30 text-xs italic">
        Historical breadth data will appear after 2+ pipeline runs.
      </div>
    );
  }

  const labels = data.map(d => {
    const dt = new Date(d.date);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  });

  const chartData = {
    labels,
    datasets: [
      {
        label: '% Above 20 EMA',
        data: data.map(d => parseFloat(d.above_ema20_pct) || 0),
        borderColor: '#4ade80',
        backgroundColor: 'rgba(74, 222, 128, 0.08)',
        borderWidth: 2,
        pointRadius: data.length <= 10 ? 4 : 0,
        pointHoverRadius: 5,
        tension: 0.35,
        fill: true,
      },
      {
        label: '% Above 50 EMA',
        data: data.map(d => parseFloat(d.above_ema50_pct) || 0),
        borderColor: '#facc15',
        backgroundColor: 'rgba(250, 204, 21, 0.06)',
        borderWidth: 2,
        pointRadius: data.length <= 10 ? 4 : 0,
        pointHoverRadius: 5,
        tension: 0.35,
        fill: true,
      },
      {
        label: '% Above 200 EMA',
        data: data.map(d => parseFloat(d.above_ema200_pct) || 0),
        borderColor: '#7b8cde',
        backgroundColor: 'rgba(123, 140, 222, 0.06)',
        borderWidth: 2,
        pointRadius: data.length <= 10 ? 4 : 0,
        pointHoverRadius: 5,
        tension: 0.35,
        fill: true,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: 'rgba(255,255,255,0.6)',
          font: { size: 10, weight: 600 as const },
          boxWidth: 12,
          padding: 16,
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
        bodyFont: { size: 11 },
        callbacks: {
          label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`,
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
          callback: (v: any) => `${v}%`,
        },
      },
    },
  };

  return (
    <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md mt-6">
      <div className="text-white/40 font-bold text-[10px] tracking-[0.2em] uppercase mb-4">
        Historical Market Breadth
      </div>
      <div style={{ height: 280 }}>
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
}
