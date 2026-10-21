import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSettingsStore } from '../../stores/settingsStore';
import { EQ_PRESETS } from '../../utils/constants';
import { getAudioFrequencyData } from '../../services/audioEngine';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const EQ_FREQ_LABELS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

// Catmull-Rom to Cubic Bezier spline converter for perfectly smooth acoustic frequency response curves
function getSplinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return '';
  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < points.length - 2 ? points[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  return path;
}

export default function InteractiveEQ() {
  const equalizerPreset = useSettingsStore((s) => s.equalizerPreset || 'Flat');
  const equalizerBands = useSettingsStore(
    (s) => s.equalizerBands || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  );
  const setEqualizerPreset = useSettingsStore((s) => s.setEqualizerPreset);
  const setEqualizerBands = useSettingsStore((s) => s.setEqualizerBands);

  const [activeDraggingIdx, setActiveDraggingIdx] = useState<number | null>(null);
  const [activeBandDraggingIdx, setActiveBandDraggingIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [spectrumLevels, setSpectrumLevels] = useState<number[]>(() => Array(10).fill(0));
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Real-time Audio Spectrum Analyser behind the curve
  useEffect(() => {
    let isMounted = true;
    let raf = 0;
    const freqData = new Uint8Array(64);

    const updateSpectrum = () => {
      if (!isMounted) return;
      const hasAudio = getAudioFrequencyData(freqData);
      if (hasAudio) {
        // Map 64 FFT bins into the 10 octave bands
        const levels = EQ_FREQUENCIES.map((_, i) => {
          const bin = Math.min(freqData.length - 1, Math.floor((i / 9) * 48));
          return Math.max(0, freqData[bin] / 255);
        });
        setSpectrumLevels(levels);
      } else {
        setSpectrumLevels((prev) => prev.map((v) => Math.max(0, v * 0.92)));
      }
      raf = requestAnimationFrame(updateSpectrum);
    };

    raf = requestAnimationFrame(updateSpectrum);
    return () => {
      isMounted = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  // Coordinate geometry for SVG canvas (1000 x 200 viewport)
  const SVG_WIDTH = 1000;
  const SVG_HEIGHT = 200;
  const PAD_X = 54;
  const PAD_Y = 24;
  const GRAPH_WIDTH = SVG_WIDTH - PAD_X * 2;
  const GRAPH_HEIGHT = SVG_HEIGHT - PAD_Y * 2;
  const ZERO_Y = PAD_Y + GRAPH_HEIGHT / 2; // y = 100 is 0 dB
  const MAX_DB = 12;

  // Convert dB value to SVG Y coordinate
  const dbToY = useCallback(
    (db: number) => {
      const clamped = Math.max(-MAX_DB, Math.min(MAX_DB, db));
      // +12 dB is top (PAD_Y), -12 dB is bottom (PAD_Y + GRAPH_HEIGHT)
      return ZERO_Y - (clamped / MAX_DB) * (GRAPH_HEIGHT / 2);
    },
    [ZERO_Y, GRAPH_HEIGHT]
  );

  // Convert SVG Y coordinate to dB value
  const yToDb = useCallback(
    (y: number) => {
      const clampedY = Math.max(PAD_Y, Math.min(PAD_Y + GRAPH_HEIGHT, y));
      const rawDb = ((ZERO_Y - clampedY) / (GRAPH_HEIGHT / 2)) * MAX_DB;
      // Round to 0.5 dB precision
      return Math.round(rawDb * 2) / 2;
    },
    [ZERO_Y, GRAPH_HEIGHT, PAD_Y]
  );

  // 10 Frequency Node Positions
  const points = useMemo(() => {
    return EQ_FREQUENCIES.map((_, i) => {
      const x = PAD_X + (i / (EQ_FREQUENCIES.length - 1)) * GRAPH_WIDTH;
      const y = dbToY(equalizerBands[i] || 0);
      return { x, y, idx: i };
    });
  }, [equalizerBands, dbToY, GRAPH_WIDTH, PAD_X]);

  // Spline Path and Fill Area Path
  const { strokePath, fillPath } = useMemo(() => {
    if (points.length === 0) return { strokePath: '', fillPath: '' };
    const stroke = getSplinePath(points);
    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;
    const fill = `${stroke} L ${lastX.toFixed(1)} ${ZERO_Y} L ${firstX.toFixed(1)} ${ZERO_Y} Z`;
    return { strokePath: stroke, fillPath: fill };
  }, [points, ZERO_Y]);

  // Pointer drag handling for curve nodes
  const handlePointerDown = (idx: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent?.stopImmediatePropagation?.();
    setActiveDraggingIdx(idx);
    const target = e.currentTarget;
    if (typeof target.setPointerCapture === 'function') {
      try {
        target.setPointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handlePointerMove = (idx: number, e: React.PointerEvent) => {
    if (activeDraggingIdx !== idx || !svgRef.current) return;
    e.stopPropagation();
    e.nativeEvent?.stopImmediatePropagation?.();
    const rect = svgRef.current.getBoundingClientRect();
    const relativeY = ((e.clientY - rect.top) / rect.height) * SVG_HEIGHT;
    const newDb = yToDb(relativeY);

    if (newDb !== equalizerBands[idx]) {
      const next = [...equalizerBands];
      next[idx] = newDb;
      setEqualizerBands(next);

      // Light tactile feedback when passing 0dB
      if (Math.abs(newDb) === 0 && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(8);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeDraggingIdx !== null) {
      e.stopPropagation();
      const target = e.currentTarget;
      if (typeof target.releasePointerCapture === 'function') {
        try {
          target.releasePointerCapture(e.pointerId);
        } catch {}
      }
      setActiveDraggingIdx(null);
    }
  };

  // Fluid Pointer drag handling for the 10 vertical EQ sliders
  const updateBandFromPointer = (idx: number, target: HTMLDivElement, clientY: number) => {
    const rect = target.getBoundingClientRect();
    if (rect.height <= 0) return;
    const relY = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const ratio = 1 - relY / rect.height; // 1 at top (+12dB), 0 at bottom (-12dB)
    const rawDb = ratio * 24 - 12;
    // Step to nearest 0.5dB
    const stepped = Math.round(rawDb * 2) / 2;
    const clamped = Math.max(-12, Math.min(12, stepped));
    if (clamped !== equalizerBands[idx]) {
      const next = [...equalizerBands];
      next[idx] = clamped;
      setEqualizerBands(next);
      if (clamped === 0 && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(6);
      }
    }
  };

  const handleBandPointerDown = (idx: number, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent?.stopImmediatePropagation?.();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setActiveBandDraggingIdx(idx);
    updateBandFromPointer(idx, e.currentTarget, e.clientY);
  };

  const handleBandPointerMove = (idx: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (activeBandDraggingIdx === idx) {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent?.stopImmediatePropagation?.();
      updateBandFromPointer(idx, e.currentTarget, e.clientY);
    }
  };

  const handleBandPointerUp = (idx: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (activeBandDraggingIdx === idx) {
      e.stopPropagation();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      setActiveBandDraggingIdx(null);
    }
  };

  // Double click / tap snaps node back to 0dB
  const handleDoubleClick = (idx: number) => {
    const next = [...equalizerBands];
    next[idx] = 0;
    setEqualizerBands(next);
  };

  const resetAllToFlat = () => {
    setEqualizerPreset('Flat');
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Preset Quick Chips */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white tracking-tight">Interactive 10-Band EQ</h3>
            <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 border-0 text-cyan-300 text-[10px] font-black uppercase tracking-wider">
              ±12 dB Pro Spline
            </span>
          </div>
          <p className="text-[11px] text-white/50">
            Drag curve points or vertical faders to shape frequencies • Double-tap node to reset to 0 dB
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {equalizerPreset !== 'Flat' && (
            <button
              type="button"
              onClick={resetAllToFlat}
              className="px-2.5 py-1 rounded-xl glass-button border-0 text-xs font-bold text-white/80 hover:text-white transition cursor-pointer active:scale-95"
            >
              ↺ Flat
            </button>
          )}
          <div className="px-2.5 py-1 rounded-xl bg-white/5 border-0 text-xs font-bold text-cyan-300">
            {equalizerPreset}
          </div>
        </div>
      </div>

      {/* Audiophile Preset Pills Bar */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-3.5 -my-1.5 px-2 relative"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {Object.keys(EQ_PRESETS).map((presetName) => {
          const isSelected = equalizerPreset === presetName;
          return (
            <button
              key={presetName}
              type="button"
              onClick={() => {
                triggerAndroidHaptic('light');
                setEqualizerPreset(presetName);
              }}
              className="relative px-3 py-1 rounded-full text-xs font-bold flex-shrink-0 cursor-pointer select-none"
            >
              {isSelected && (
                <motion.div
                  layoutId="interactive-eq-preset-pill"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  className="absolute inset-0 rounded-full liquid-sliding-pill-cyan -z-0 pointer-events-none"
                />
              )}
              <span className={`relative z-10 transition-colors duration-150 ${
                isSelected ? 'text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]' : 'text-white/70 hover:text-white'
              }`}>
                {presetName}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Interactive Spline Curve Display Card ── */}
      <div className="relative rounded-2xl liquid-glass border-0 overflow-hidden p-3 sm:p-4 bg-gradient-to-b from-[#080b14]/90 via-[#070913]/95 to-[#04060c]">
        {/* Real-Time Spectrum Glow Bars behind the curve */}
        <div className="absolute inset-0 pointer-events-none flex items-end justify-between px-10 sm:px-14 pb-8 opacity-25">
          {spectrumLevels.map((lvl, i) => (
            <div
              key={i}
              className="w-4 sm:w-6 rounded-t-full bg-gradient-to-t from-cyan-500 via-purple-500 to-rose-500 transition-all duration-75"
              style={{ height: `${Math.max(4, lvl * 130)}px` }}
            />
          ))}
        </div>

        {/* SVG Graphic Canvas */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full h-44 sm:h-52 select-none touch-none overflow-visible"
        >
          <defs>
            {/* Liquid Fill Gradient */}
            <linearGradient id="eqFillGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.45" />
              <stop offset="45%" stopColor="#8b5cf6" stopOpacity="0.25" />
              <stop offset="85%" stopColor="#fa2d48" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
            </linearGradient>

            {/* Neon Spline Line Gradient */}
            <linearGradient id="eqStrokeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="35%" stopColor="#a855f7" />
              <stop offset="70%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>

            {/* Glowing Drop Shadow Filter */}
            <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Grid Lines: +12dB, +6dB, 0dB (Center axis), -6dB, -12dB */}
          {[12, 6, 0, -6, -12].map((db) => {
            const y = dbToY(db);
            const isZero = db === 0;
            return (
              <g key={db}>
                <line
                  x1={PAD_X}
                  y1={y}
                  x2={SVG_WIDTH - PAD_X}
                  y2={y}
                  stroke={isZero ? 'rgba(56, 189, 248, 0.45)' : 'rgba(255, 255, 255, 0.08)'}
                  strokeWidth={isZero ? 1.5 : 1}
                  strokeDasharray={isZero ? '4 4' : undefined}
                />
                <text
                  x={PAD_X - 12}
                  y={y + 3.5}
                  textAnchor="end"
                  fill={isZero ? '#38bdf8' : 'rgba(255, 255, 255, 0.35)'}
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight={isZero ? 'bold' : 'normal'}
                >
                  {db > 0 ? `+${db}` : db}
                </text>
                <text
                  x={SVG_WIDTH - PAD_X + 12}
                  y={y + 3.5}
                  textAnchor="start"
                  fill={isZero ? '#38bdf8' : 'rgba(255, 255, 255, 0.35)'}
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight={isZero ? 'bold' : 'normal'}
                >
                  {db > 0 ? `+${db}` : db}
                </text>
              </g>
            );
          })}

          {/* Vertical Frequency Guidelines */}
          {points.map((p, i) => (
            <line
              key={i}
              x1={p.x}
              y1={PAD_Y}
              x2={p.x}
              y2={SVG_HEIGHT - PAD_Y}
              stroke="rgba(255, 255, 255, 0.04)"
              strokeWidth="1"
            />
          ))}

          {/* Liquid Shaded Area Under Spline */}
          <path d={fillPath} fill="url(#eqFillGrad)" />

          {/* Glowing Spline Stroke Curve */}
          <path
            d={strokePath}
            fill="none"
            stroke="url(#eqStrokeGrad)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#neonGlow)"
          />

          {/* 10 Draggable Interactive Nodes */}
          {points.map((p) => {
            const isDragging = activeDraggingIdx === p.idx;
            const isHovered = hoveredIdx === p.idx;
            const dbVal = equalizerBands[p.idx] || 0;

            return (
              <g
                key={p.idx}
                transform={`translate(${p.x}, ${p.y})`}
                className="cursor-ns-resize group"
                onPointerDown={(e) => handlePointerDown(p.idx, e)}
                onPointerMove={(e) => handlePointerMove(p.idx, e)}
                onPointerUp={handlePointerUp}
                onDoubleClick={() => handleDoubleClick(p.idx)}
                onMouseEnter={() => setHoveredIdx(p.idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Large Invisible Hit Target for Touch & Mouse */}
                <circle r="22" fill="transparent" />

                {/* Outer Glow Halo on Hover or Drag */}
                <circle
                  r={isDragging ? 18 : isHovered ? 14 : 9}
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="2"
                  opacity={isDragging ? 0.75 : isHovered ? 0.45 : 0}
                  className="transition-all duration-150"
                />

                {/* Main Node Point */}
                <circle
                  r={isDragging ? 7.5 : isHovered ? 6.5 : 5.5}
                  fill={isDragging ? '#22d3ee' : '#ffffff'}
                  stroke={isDragging ? '#ffffff' : '#0891b2'}
                  strokeWidth="2.5"
                  className="drop-shadow-md transition-transform duration-100"
                />

                {/* Floating Tooltip Pill when active/dragging/hovered */}
                {(isDragging || isHovered) && (
                  <g transform={`translate(0, ${p.y < 50 ? 28 : -24})`}>
                    <rect
                      x="-38"
                      y="-12"
                      width="76"
                      height="22"
                      rx="11"
                      fill="#0e1322"
                      stroke="#22d3ee"
                      strokeWidth="1.2"
                      className="shadow-lg"
                    />
                    <text
                      textAnchor="middle"
                      y="3"
                      fill="#ffffff"
                      fontSize="10"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {dbVal > 0 ? `+${dbVal.toFixed(1)}` : dbVal.toFixed(1)} dB
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Frequency Labels Row at Bottom */}
        <div className="flex justify-between px-10 sm:px-14 pt-1 text-[10px] font-mono text-white/50 select-none">
          {EQ_FREQ_LABELS.map((label, idx) => (
            <button
              key={label}
              type="button"
              onClick={() => handleDoubleClick(idx)}
              className="hover:text-cyan-300 transition cursor-pointer"
              title={`Double click to reset ${label}Hz to 0 dB`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 10-Band Precision Vertical Fader Deck ── */}
      <div className="rounded-2xl liquid-glass border-0 p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">
            Precision Octave Faders
          </span>
          <span className="text-[10px] text-white/40">Double-tap any fader to zero</span>
        </div>

        <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 sm:gap-1.5">
          {EQ_FREQUENCIES.map((freq, i) => {
            const dbVal = equalizerBands[i] || 0;
            const isBoost = dbVal > 0;
            const isCut = dbVal < 0;

            return (
              <div
                key={freq}
                className="flex flex-col items-center p-2 rounded-xl bg-white/[0.03] border-0  transition group"
              >
                {/* dB Readout */}
                <div
                  className={`text-[10px] font-mono font-bold mb-1 transition ${
                    isBoost
                      ? 'text-cyan-300'
                      : isCut
                        ? 'text-pink-400'
                        : 'text-white/40'
                  }`}
                >
                  {isBoost ? `+${dbVal.toFixed(1)}` : dbVal.toFixed(1)}
                </div>

                {/* Vertical Slider Track Container (Fluid Pointer Slider) */}
                <div
                  onPointerDown={(e) => handleBandPointerDown(i, e)}
                  onPointerMove={(e) => handleBandPointerMove(i, e)}
                  onPointerUp={(e) => handleBandPointerUp(i, e)}
                  onPointerCancel={(e) => handleBandPointerUp(i, e)}
                  onDoubleClick={() => handleDoubleClick(i)}
                  className="relative h-28 w-7 sm:w-8 flex items-center justify-center my-1 cursor-ns-resize touch-none select-none group/band"
                  title={`${EQ_FREQ_LABELS[i]}Hz: ${dbVal > 0 ? '+' : ''}${dbVal} dB (Double click to reset)`}
                  role="slider"
                  aria-label={`${EQ_FREQ_LABELS[i]}Hz`}
                  aria-valuenow={dbVal}
                  aria-valuemin={-12}
                  aria-valuemax={12}
                >
                  {/* Track Channel Groove */}
                  <div className="w-1.5 h-full rounded-full bg-white/10 relative overflow-hidden group-hover/band:w-2 transition-all">
                    {/* Center zero line marker */}
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-white/30 pointer-events-none" />
                    {/* Active Fill from Center 0dB */}
                    <div
                      className={`absolute inset-x-0 pointer-events-none ${
                        isBoost
                          ? 'bg-gradient-to-t from-cyan-500 to-cyan-300'
                          : isCut
                          ? 'bg-gradient-to-b from-pink-500 to-pink-300'
                          : 'bg-transparent'
                      }`}
                      style={{
                        top: isBoost ? `${(1 - (dbVal / 12) * 0.5 - 0.5) * 100}%` : '50%',
                        bottom: isCut ? `${(1 - (0.5 - (Math.abs(dbVal) / 12) * 0.5)) * 100}%` : '50%'
                      }}
                    />
                  </div>

                  {/* Fuwad Liquid Glass Capsule Thumb */}
                  <div
                    className="absolute left-1/2 -translate-x-1/2 pointer-events-none transition-transform duration-75"
                    style={{
                      bottom: `calc(${((dbVal + 12) / 24) * 100}% - 7px)`
                    }}
                  >
                    <div
                      style={{
                        width: activeBandDraggingIdx === i ? '26px' : '22px',
                        height: '14px',
                        borderRadius: '7px',
                        background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 244, 250, 0.75) 100%)',
                        border: isBoost ? '1px solid #22d3ee' : isCut ? '1px solid #f472b6' : '1px solid rgba(255, 255, 255, 0.9)',
                        boxShadow: activeBandDraggingIdx === i
                          ? isBoost ? '0 0 14px 2px #22d3ee' : '0 0 14px 2px #f472b6'
                          : '0 2px 8px rgba(0, 0, 0, 0.35)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        transform: activeBandDraggingIdx === i ? 'scale(1.15)' : 'scale(1)',
                        transition: 'width 100ms ease-out, transform 100ms ease-out'
                      }}
                      className="relative flex items-center justify-center overflow-hidden"
                    >
                      <div className="absolute top-[1px] inset-x-1 h-[1px] rounded-full bg-gradient-to-r from-transparent via-white to-transparent opacity-95" />
                      <div className="w-[8px] h-[2px] rounded-full bg-white/40 border-t border-white/60 opacity-70" />
                    </div>
                  </div>
                </div>

                {/* Frequency Label */}
                <div className="text-[10px] font-mono font-semibold text-white/70 group-hover:text-white transition mt-1">
                  {EQ_FREQ_LABELS[i]}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
