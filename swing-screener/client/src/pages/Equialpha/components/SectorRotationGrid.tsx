import React, { useEffect, useState } from 'react';

interface RotationRow {
  date: string;
  sector: string;
  momentum: string;
  final_score: number;
  avg_rs: number;
}

const MOMENTUM_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  Accelerating: { bg: 'rgba(52, 211, 153, 0.35)', text: '#4ade80', label: 'ACC' },
  'Steady+':    { bg: 'rgba(34, 211, 238, 0.4)',  text: '#67e8f9', label: 'ST+' },
  Steady:       { bg: 'rgba(34, 211, 238, 0.2)',  text: '#22d3ee', label: 'STD' },
  Fading:       { bg: 'rgba(248, 113, 113, 0.3)', text: '#f87171', label: 'FAD' },
  Dull:         { bg: 'rgba(255, 255, 255, 0.04)', text: '#5a6a8a', label: 'DUL' },
};

export function SectorRotationGrid({ onSectorClick }: { onSectorClick?: (sector: string) => void }) {
  const [rawData, setRawData] = useState<RotationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);

  useEffect(() => {
    fetch('/api/equialpha/hydrate/sector_rotation')
      .then(r => r.json())
      .then(res => {
        setRawData(res.data || []);
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

  if (rawData.length === 0) {
    return (
      <div className="text-center py-6 text-white/30 text-xs italic">
        Sector rotation data will appear after 2+ pipeline runs.
      </div>
    );
  }

  // Build unique dates and sectors
  const datesSet = new Set<string>();
  const sectorsSet = new Set<string>();
  for (const row of rawData) {
    datesSet.add(row.date);
    sectorsSet.add(row.sector);
  }
  const dates = Array.from(datesSet).sort();
  const sectors = Array.from(sectorsSet).sort();

  // Build lookup map: "sector|date" -> RotationRow
  const lookup = new Map<string, RotationRow>();
  for (const row of rawData) {
    lookup.set(`${row.sector}|${row.date}`, row);
  }

  const formatDate = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };

  return (
    <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md mt-6 relative">
      <div className="text-white/40 font-bold text-[10px] tracking-[0.2em] uppercase mb-4">
        Sector Rotation Heatmap
      </div>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="border-b border-white/[0.05]">
              <th className="text-left p-2 text-white/40 font-bold tracking-wider uppercase sticky left-0 bg-[#0e1117] z-10 min-w-[120px]">
                Sector
              </th>
              {dates.map(d => (
                <th key={d} className="text-center p-2 text-white/30 font-semibold min-w-[56px]">
                  {formatDate(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sectors.map(sector => (
              <tr key={sector} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                <td 
                  className="p-2 text-white/80 font-semibold text-[11px] sticky left-0 bg-[#0e1117] z-10 whitespace-nowrap cursor-pointer hover:text-white transition-colors"
                  onClick={() => onSectorClick && onSectorClick(sector)}
                >
                  {sector}
                </td>
                {dates.map(date => {
                  const row = lookup.get(`${sector}|${date}`);
                  const m = row ? MOMENTUM_COLORS[row.momentum] || MOMENTUM_COLORS.Dull : MOMENTUM_COLORS.Dull;
                  return (
                    <td
                      key={date}
                      className="p-1 text-center cursor-default transition-all duration-200"
                      onMouseEnter={(e) => {
                        if (row) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setTooltip({
                            x: rect.left + rect.width / 2,
                            y: rect.top - 8,
                            content: `${sector} · ${formatDate(date)}\nScore: ${row.final_score} · RS: ${row.avg_rs}\nMomentum: ${row.momentum}`,
                          });
                        }
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <div
                        className="mx-auto w-10 h-7 rounded-md flex items-center justify-center font-black text-[9px] tracking-wider transition-transform duration-200 hover:scale-110"
                        style={{ background: m.bg, color: m.text }}
                      >
                        {row ? m.label : '—'}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 rounded-lg border border-white/10 text-[10px] text-white/90 whitespace-pre-line font-mono"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(14, 17, 23, 0.95)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {tooltip.content}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/[0.05]">
        {Object.entries(MOMENTUM_COLORS).map(([key, val]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ background: val.bg, border: `1px solid ${val.text}40` }} />
            <span className="text-[9px] text-white/40 font-semibold tracking-wider uppercase">{key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
