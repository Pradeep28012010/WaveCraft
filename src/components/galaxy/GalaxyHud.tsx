import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CLUSTERS, WORMHOLE_PRESETS } from './galaxyAnalysis';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import { useOverlayEscape } from '../ui/dialogStack';

interface GalaxyHudProps {
  galaxyLayout: 'quadrants' | 'rings' | 'spiral';
  onChangeLayout: (layout: 'quadrants' | 'rings' | 'spiral') => void;
  rosterSearch: string;
  onSearchChange: (q: string) => void;
  activeClusterFilter: number | null;
  onClusterFilterChange: (idx: number | null) => void;
  isCinematicTour: boolean;
  onToggleTour: () => void;
  autoOrbit: boolean;
  onToggleAutoOrbit: () => void;
  onResetCamera: () => void;
  onSupernovaShuffle: () => void;
  isWarping: boolean;
  activeWormholeLabel: string;
  warpQuery: string;
  onWarpQueryChange: (q: string) => void;
  onTriggerWormhole: (query: string, label?: string) => void;
  starCount: number;
}

export default function GalaxyHud({
  galaxyLayout,
  onChangeLayout,
  rosterSearch,
  onSearchChange,
  activeClusterFilter,
  onClusterFilterChange,
  isCinematicTour,
  onToggleTour,
  autoOrbit,
  onToggleAutoOrbit,
  onResetCamera,
  onSupernovaShuffle,
  isWarping,
  activeWormholeLabel,
  warpQuery,
  onWarpQueryChange,
  onTriggerWormhole,
  starCount
}: GalaxyHudProps) {
  const [openPopover, setOpenPopover] = useState<'wormholes' | 'clusters' | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);

  useOverlayEscape(openPopover !== null, () => setOpenPopover(null));

  useEffect(() => {
    if (!openPopover) return;
    const onOutside = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (
        (dockRef.current && dockRef.current.contains(t)) ||
        (topBarRef.current && topBarRef.current.contains(t))
      ) {
        return;
      }
      setOpenPopover(null);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
    };
  }, [openPopover]);

  return (
    <>
      {/* Compact Top Bar: Search + Cluster Filter + Sliding Layout Pill */}
      <div
        ref={topBarRef}
        className="pointer-events-none absolute top-3 inset-x-3 sm:top-4 sm:inset-x-4 z-20 flex flex-wrap items-center justify-between gap-2"
      >
        {/* Left: Search & Cluster Filter */}
        <div className="pointer-events-auto flex items-center gap-2 min-w-0 flex-1 sm:flex-initial">
          <div className="relative flex items-center liquid-glass rounded-full px-3 h-9 w-full sm:w-56 border border-white/10 shadow-lg">
            <svg
              className="w-3.5 h-3.5 text-white/50 flex-shrink-0 mr-2"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={rosterSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={`Filter ${starCount} stars...`}
              className="w-full bg-transparent text-xs text-white placeholder-white/40 focus:outline-none min-w-0"
            />
            {rosterSearch && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="text-white/50 hover:text-white text-xs ml-1 cursor-pointer"
                aria-label="Clear star filter"
              >
                ✕
              </button>
            )}
          </div>

          {/* Cluster Filter Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                triggerAndroidHaptic('light');
                setOpenPopover((p) => (p === 'clusters' ? null : 'clusters'));
              }}
              className={`h-9 px-3 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap ${
                activeClusterFilter !== null
                  ? 'glass-button-primary text-white'
                  : 'liquid-glass text-white/80 hover:text-white border border-white/10'
              }`}
              title="Filter by genre sector"
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="hidden sm:inline">
                {activeClusterFilter !== null ? CLUSTERS[activeClusterFilter]?.name : 'All Sectors'}
              </span>
              <span className="sm:hidden">Sectors</span>
            </button>

            <AnimatePresence>
              {openPopover === 'clusters' && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  transition={{ duration: 0.16 }}
                  className="absolute left-0 top-11 w-56 rounded-2xl modal-glass-panel backdrop-blur-2xl p-1.5 shadow-2xl border border-white/15 z-30 space-y-0.5"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onClusterFilterChange(null);
                      setOpenPopover(null);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                      activeClusterFilter === null
                        ? 'bg-white/15 text-white'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    All Sectors
                  </button>
                  {CLUSTERS.map((c, idx) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => {
                        onClusterFilterChange(activeClusterFilter === idx ? null : idx);
                        setOpenPopover(null);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                        activeClusterFilter === idx
                          ? 'bg-white/15 text-white'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right: Sliding Liquid Glass Layout Pill */}
        <div className="pointer-events-auto inline-flex items-center p-1 rounded-full liquid-glass border border-white/10 shadow-lg relative">
          {(['quadrants', 'rings', 'spiral'] as const).map((layout) => {
            const isSel = galaxyLayout === layout;
            const label =
              layout === 'quadrants' ? 'Quadrants' : layout === 'rings' ? 'Rings' : 'Spiral';
            return (
              <button
                key={layout}
                type="button"
                onClick={() => {
                  triggerAndroidHaptic('light');
                  onChangeLayout(layout);
                }}
                className="relative px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer select-none"
              >
                {isSel && (
                  <motion.div
                    layoutId="galaxy-layout-pill"
                    transition={{ type: 'spring', bounce: 0.15, duration: 0.32 }}
                    className="absolute inset-0 rounded-full liquid-sliding-pill -z-0 pointer-events-none"
                  />
                )}
                <span
                  className={`relative z-10 transition-colors duration-150 ${
                    isSel
                      ? 'text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom-Center Floating Liquid Glass Command Dock */}
      <div
        ref={dockRef}
        className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 max-w-[calc(100vw-1.5rem)]"
      >
        <AnimatePresence>
          {openPopover === 'wormholes' && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl modal-glass-panel backdrop-blur-2xl p-3 shadow-2xl border border-white/15 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                  Wormhole Jump
                </span>
                <span className="text-[10px] text-cyan-300 font-semibold truncate max-w-[160px]">
                  {activeWormholeLabel}
                </span>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!warpQuery.trim()) return;
                  onTriggerWormhole(warpQuery.trim());
                  setOpenPopover(null);
                }}
                className="flex items-center gap-1.5"
              >
                <input
                  type="text"
                  value={warpQuery}
                  onChange={(e) => onWarpQueryChange(e.target.value)}
                  placeholder="Jump to artist or vibe..."
                  className="flex-1 min-w-0 h-8 px-3 rounded-full bg-white/10 text-xs text-white placeholder-white/40 focus:outline-none border border-white/10"
                />
                <button
                  type="submit"
                  className="h-8 px-3 rounded-full glass-button-primary text-xs font-bold text-white cursor-pointer"
                >
                  Warp
                </button>
              </form>

              <div className="flex flex-wrap gap-1.5">
                {WORMHOLE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      onTriggerWormhole(preset.query, preset.label);
                      setOpenPopover(null);
                    }}
                    className="px-2.5 py-1 rounded-full glass-button text-[10px] font-bold text-white/80 hover:text-white cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="inline-flex items-center gap-1 p-1.5 rounded-full liquid-glass border border-white/15 shadow-[0_12px_40px_rgba(0,0,0,0.65)]">
          <button
            type="button"
            onClick={() => {
              triggerAndroidHaptic('light');
              setOpenPopover((p) => (p === 'wormholes' ? null : 'wormholes'));
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              openPopover === 'wormholes' || isWarping
                ? 'glass-button-primary text-white'
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
            title="Jump to another artist or genre universe"
          >
            <span>🚀</span>
            <span>{isWarping ? 'Warping...' : 'Wormholes'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerAndroidHaptic('light');
              onToggleTour();
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              isCinematicTour
                ? 'glass-button-primary text-white'
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
            title="Cinematic Star Tour"
          >
            <span>🎬</span>
            <span className="hidden sm:inline">{isCinematicTour ? 'Stop Tour' : 'Tour'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerAndroidHaptic('light');
              onToggleAutoOrbit();
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              autoOrbit
                ? 'bg-white/15 text-white'
                : 'text-white/65 hover:text-white hover:bg-white/10'
            }`}
            title={autoOrbit ? 'Pause Orbit' : 'Resume Auto-Orbit'}
          >
            <span>{autoOrbit ? '⏸' : '▶'}</span>
            <span className="hidden sm:inline">Orbit</span>
          </button>

          <button
            type="button"
            onClick={onSupernovaShuffle}
            className="px-3 py-1.5 rounded-full text-xs font-bold text-white/80 hover:text-white hover:bg-white/10 cursor-pointer transition-all"
            title="Play Random Star"
          >
            <span>✨</span>
            <span className="hidden md:inline ml-1">Surprise</span>
          </button>

          <button
            type="button"
            onClick={onResetCamera}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 cursor-pointer transition-all"
            title="Reset Camera View"
            aria-label="Reset Camera View"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
