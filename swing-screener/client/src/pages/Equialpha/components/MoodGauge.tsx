import React from 'react';

interface MoodGaugeProps {
  score: number;
  label: string;
}

export function MoodGauge({ score, label }: MoodGaugeProps) {
  const normalizedScore = Math.max(0, Math.min(100, score));

  // Semi-circle arc calculation
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const halfCirc = circumference / 2;
  const strokeDasharray = `${halfCirc} ${circumference}`;
  const strokeDashoffset = halfCirc - (normalizedScore / 100) * halfCirc;

  // Premium glow colors
  let color = "#f87171"; // Red
  let glowColor = "rgba(248,113,113,0.5)";
  if (normalizedScore >= 80) { color = "#4ade80"; glowColor = "rgba(74,222,128,0.5)"; }
  else if (normalizedScore >= 60) { color = "#a3e635"; glowColor = "rgba(163,230,53,0.5)"; }
  else if (normalizedScore >= 45) { color = "#facc15"; glowColor = "rgba(250,204,21,0.5)"; }
  else if (normalizedScore >= 25) { color = "#fb923c"; glowColor = "rgba(251,146,60,0.5)"; }

  return (
    <div className="flex flex-col items-center relative group">
      <div className="relative w-28 h-16 overflow-visible">
        <svg viewBox="0 0 100 55" className="w-full h-full overflow-visible drop-shadow-2xl">
          <defs>
            <filter id={`glow-${score}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          {/* Background Arc */}
          <path
            d="M 8 50 A 42 42 0 0 1 92 50"
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {/* Foreground Arc */}
          <path
            d="M 8 50 A 42 42 0 0 1 92 50"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
            filter={`url(#glow-${score})`}
          />
        </svg>
        <div className="absolute bottom-0 w-full text-center">
          <span className="text-3xl font-black tracking-tighter" style={{ color, textShadow: `0 0 15px ${glowColor}` }}>{score}</span>
        </div>
      </div>
      <span className="text-[10px] uppercase tracking-[0.3em] font-bold mt-3 text-[#7b8899] group-hover:text-white transition-colors duration-300">
        {label}
      </span>
    </div>
  );
}
