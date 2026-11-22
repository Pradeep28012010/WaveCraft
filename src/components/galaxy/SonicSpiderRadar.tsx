import { memo } from 'react';
import type { SonicDNA } from './galaxyTypes';

interface SonicSpiderRadarProps {
  trackDna: SonicDNA;
  userDna: SonicDNA;
  clusterColor: string;
}

export const SonicSpiderRadar = memo(function SonicSpiderRadar({
  trackDna,
  userDna,
  clusterColor
}: SonicSpiderRadarProps) {
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 64;

  // 4 Axes: Top=Energy, Right=Bass, Bottom=Vocal, Left=Euphoria
  const getCoords = (metric: number, axisIdx: number) => {
    const angle = (axisIdx * Math.PI) / 2 - Math.PI / 2;
    const r = (metric / 100) * maxR;
    return {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r
    };
  };

  const trackPts = [
    getCoords(trackDna.energy, 0),
    getCoords(trackDna.bass, 1),
    getCoords(trackDna.vocal, 2),
    getCoords(trackDna.euphoria, 3)
  ];

  const userPts = [
    getCoords(userDna.energy, 0),
    getCoords(userDna.bass, 1),
    getCoords(userDna.vocal, 2),
    getCoords(userDna.euphoria, 3)
  ];

  const toPath = (pts: { x: number; y: number }[]) =>
    `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y} L ${pts[2].x} ${pts[2].y} L ${pts[3].x} ${pts[3].y} Z`;

  return (
    <div className="relative flex flex-col items-center justify-center p-2 rounded-2xl bg-black/40 border-0">
      <svg width={size} height={size} className="overflow-visible">
        {/* Background Concentric Radar Grids */}
        {[0.25, 0.5, 0.75, 1.0].map((frac, idx) => {
          const r = frac * maxR;
          return (
            <polygon
              key={idx}
              points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
              fill="none"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth={idx === 3 ? 1.4 : 0.8}
              strokeDasharray={idx < 3 ? '3 3' : undefined}
            />
          );
        })}

        {/* Crosshair Axes */}
        <line x1={cx} y1={cy - maxR} x2={cx} y2={cy + maxR} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        <line x1={cx - maxR} y1={cy} x2={cx + maxR} y2={cy} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />

        {/* User Taste Polygon (Dashed White/Emerald) */}
        <path
          d={toPath(userPts)}
          fill="rgba(16, 185, 129, 0.12)"
          stroke="#10b981"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />

        {/* Track DNA Polygon (Solid Vibrant Glow) */}
        <path
          d={toPath(trackPts)}
          fill={`${clusterColor}33`}
          stroke={clusterColor}
          strokeWidth="2.2"
          className="transition-all duration-300"
        />

        {/* Track Vertices */}
        {trackPts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3.5"
            fill={clusterColor}
            stroke="#ffffff"
            strokeWidth="1.5"
            className="shadow-lg"
          />
        ))}

        {/* Axis Labels */}
        <text x={cx} y={cy - maxR - 8} fill="#f43f5e" fontSize="9" fontWeight="800" textAnchor="middle">
          ⚡ ENERGY ({trackDna.energy}%)
        </text>
        <text x={cx + maxR + 8} y={cy + 3} fill="#a855f7" fontSize="9" fontWeight="800" textAnchor="start">
          🔊 BASS ({trackDna.bass}%)
        </text>
        <text x={cx} y={cy + maxR + 14} fill="#06b6d4" fontSize="9" fontWeight="800" textAnchor="middle">
          🎤 VOCAL ({trackDna.vocal}%)
        </text>
        <text x={cx - maxR - 8} y={cy + 3} fill="#f59e0b" fontSize="9" fontWeight="800" textAnchor="end">
          ✨ EUPHORIA ({trackDna.euphoria}%)
        </text>
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-[10px] font-bold">
        <span className="flex items-center gap-1.5 text-white/90">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: clusterColor }} />
          Track DNA
        </span>
        <span className="flex items-center gap-1.5 text-emerald-300">
          <span className="w-2.5 h-1 border-0" />
          Your Taste Centroid
        </span>
      </div>
    </div>
  );
});

export default SonicSpiderRadar;
