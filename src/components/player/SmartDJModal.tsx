import { useState, useMemo, useEffect, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayerStore } from '../../stores/playerStore';
import { useStudioStore } from '../../stores/studioStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useJamStore } from '../../stores/jamStore';
import { isJamGuestBlocked } from '../../services/jamAuthority';
import { getTrackHarmonics, getHarmonicCompatibility } from '../../utils/audioHarmonics';
import { playVinylBackspin } from '../../services/audioEngine';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';

export interface SmartDJModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SmartDJModal = memo(({ isOpen, onClose }: SmartDJModalProps) => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);

  const jamRoomCode = useJamStore((s) => s.roomCode);
  const jamIsHost = useJamStore((s) => s.isHost);
  const isJamGuest = Boolean(jamRoomCode && !jamIsHost) || isJamGuestBlocked('skip');

  const djVinylBackspin = useSettingsStore((s) => s.djVinylBackspin ?? true);
  const setDjVinylBackspin = useSettingsStore((s) => s.setDjVinylBackspin);
  const crossfadeDuration = useSettingsStore((s) => s.crossfadeDuration ?? 3);
  const setCrossfade = useSettingsStore((s) => s.setCrossfade);

  const smartDjAutoMix = useStudioStore((s) => s.smartDjAutoMix ?? true);
  const setSmartDjAutoMix = useStudioStore((s) => s.setSmartDjAutoMix);
  const crossfaderPos = useStudioStore((s) => s.smartDjCrossfader ?? 50);
  const setCrossfaderPos = useStudioStore((s) => s.setSmartDjCrossfader);
  const filterSweep = useStudioStore((s) => s.smartDjFilterSweep ?? 0);
  const setFilterSweep = useStudioStore((s) => s.setSmartDjFilterSweep);

  const [isScratching, setIsScratching] = useState(false);
  const scratchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (scratchTimerRef.current) clearTimeout(scratchTimerRef.current);
      if (dropTimerRef.current) clearTimeout(dropTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const nextTrackItem =
    queue[queueIndex + 1] ||
    (repeatMode === 'all' && queue.length > 1 && queue[0]?.id !== currentTrack?.id ? queue[0] : null);

  // Deck A Harmonics
  const deckAHarmonics = useMemo(() => {
    if (!currentTrack) return null;
    return getTrackHarmonics(currentTrack.id, currentTrack.title, currentTrack.bpm);
  }, [currentTrack?.id, currentTrack?.title, currentTrack?.bpm]);

  // Deck B Harmonics
  const deckBHarmonics = useMemo(() => {
    if (!nextTrackItem) return null;
    return getTrackHarmonics(nextTrackItem.id, nextTrackItem.title, nextTrackItem.bpm);
  }, [nextTrackItem?.id, nextTrackItem?.title, nextTrackItem?.bpm]);

  // Camelot Wheel Compatibility
  const compatibility = useMemo(() => {
    return getHarmonicCompatibility(deckAHarmonics?.camelotKey, deckBHarmonics?.camelotKey);
  }, [deckAHarmonics?.camelotKey, deckBHarmonics?.camelotKey]);

  const handleManualScratch = () => {
    triggerAndroidHaptic('medium');
    setIsScratching(true);
    playVinylBackspin();
    if (scratchTimerRef.current) clearTimeout(scratchTimerRef.current);
    scratchTimerRef.current = setTimeout(() => {
      scratchTimerRef.current = null;
      setIsScratching(false);
    }, 600);
  };

  const handleTriggerHarmonicDrop = () => {
    if (isJamGuest) return;
    triggerAndroidHaptic('medium');
    playVinylBackspin();
    if (dropTimerRef.current) clearTimeout(dropTimerRef.current);
    dropTimerRef.current = setTimeout(() => {
      dropTimerRef.current = null;
      nextTrack({ silent: true });
    }, 380);
  };

  const isAutomixEffective = smartDjAutoMix && crossfadeDuration > 0;
  const artSrcA = currentTrack?.thumbnailLarge || currentTrack?.thumbnail || DEFAULT_THUMBNAIL;
  const artSrcB = nextTrackItem?.thumbnailLarge || nextTrackItem?.thumbnail || DEFAULT_THUMBNAIL;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
      <div
        onClick={onClose}
        className="fixed inset-0 z-[9995] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-xl animate-in fade-in duration-200"
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Smart DJ Console"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto no-scrollbar rounded-3xl liquid-glass border border-white/15 bg-gradient-to-b from-[#0e0e18]/95 via-[#080811]/98 to-[#040408] p-4 sm:p-7 shadow-[0_24px_70px_rgba(0,0,0,0.85)] text-white"
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 via-[var(--color-accent)] to-purple-600 flex items-center justify-center shadow-lg shadow-rose-500/25">
                <span className="text-xl">🎧</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-black tracking-tight text-white">Smart DJ Console</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[var(--color-accent)]/20 text-[var(--color-accent)] border border-[var(--color-accent)]/30">
                    Harmonic Automix
                  </span>
                </div>
                <p className="text-xs text-white/50 mt-0.5">Camelot Wheel key-matching & procedural turntable audio transitions</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center glass-button text-white/70 hover:text-white cursor-pointer active:scale-90 transition-transform"
              title="Close Smart DJ"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Dual Turntable HUD Deck */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 mb-6 items-center">
            {/* Deck A (Now Playing) */}
            <div className="md:col-span-5 rounded-2xl p-4 bg-white/[0.03] border border-white/10 relative overflow-hidden flex flex-col items-center text-center">
              <div className="w-full flex items-center justify-between mb-3 text-[11px] font-bold">
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-widest">
                  DECK A • LIVE
                </span>
                {deckAHarmonics && (
                  <span className="font-mono text-white/70">
                    {deckAHarmonics.bpm} BPM
                  </span>
                )}
              </div>

              {/* 3D Vinyl Record Platter */}
              <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full vinyl-disc shadow-[0_12px_36px_rgba(0,0,0,0.8)] border border-white/15 my-2 flex items-center justify-center">
                <motion.div
                  animate={{
                    rotate: isScratching ? -720 : isPlaying ? 360 : 0
                  }}
                  transition={{
                    rotate: isScratching
                      ? { duration: 0.5, ease: 'easeOut' }
                      : isPlaying
                      ? { repeat: Infinity, duration: 2.8, ease: 'linear' }
                      : { duration: 0 }
                  }}
                  className="w-full h-full rounded-full flex items-center justify-center relative overflow-hidden"
                >
                  {/* Central Album Artwork Sticker */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 border-zinc-900 shadow-inner relative z-10">
                    <img src={artSrcA} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 m-auto w-3.5 h-3.5 rounded-full bg-zinc-950 border border-white/30" />
                  </div>
                </motion.div>
              </div>

              {/* Deck A Track Details & Harmonics */}
              <h3 className="font-bold text-sm text-white truncate max-w-full mt-2">
                {currentTrack?.title || 'No Track Selected'}
              </h3>
              <p className="text-xs text-white/55 truncate max-w-full mt-0.5">
                {currentTrack?.artist || 'Unknown Artist'}
              </p>

              {deckAHarmonics && (
                <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
                  <span className="px-2.5 py-1 rounded-xl text-xs font-black font-mono bg-[var(--color-accent)]/20 text-[var(--color-accent)] border border-[var(--color-accent)]/30">
                    {deckAHarmonics.camelotKey} ({deckAHarmonics.musicalKey})
                  </span>
                  <span className="px-2 py-0.5 rounded-xl text-[11px] font-semibold bg-white/10 text-white/80">
                    {deckAHarmonics.energy}
                  </span>
                </div>
              )}

              {/* Deck A Transport Controls */}
              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  disabled={isJamGuest}
                  onClick={() => {
                    if (isJamGuest) return;
                    triggerAndroidHaptic('light');
                    prevTrack();
                  }}
                  className={`p-1.5 rounded-full glass-button text-white/80 hover:text-white ${isJamGuest ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  title={isJamGuest ? 'Host controls playback in Jam' : 'Previous Track'}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="19 20 9 12 19 4 19 20" />
                    <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>
                <button
                  type="button"
                  disabled={isJamGuest}
                  onClick={() => {
                    if (isJamGuest) return;
                    triggerAndroidHaptic('medium');
                    togglePlay();
                  }}
                  className={`p-2 rounded-full glass-button-primary text-white active:scale-95 transition-transform ${isJamGuest ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  title={isJamGuest ? 'Host controls playback in Jam' : isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Center Mixer & Harmonic Matrix */}
            <div className="md:col-span-2 flex flex-col items-center justify-center gap-3 py-2">
              <div className="w-full rounded-2xl p-3 bg-white/[0.04] border border-white/10 flex flex-col items-center text-center">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/50 mb-1">
                  HARMONIC SYNC
                </span>
                <div
                  className={`text-xl font-black font-mono ${
                    compatibility.score >= 90
                      ? 'text-emerald-400'
                      : compatibility.score >= 80
                      ? 'text-cyan-400'
                      : 'text-amber-400'
                  }`}
                >
                  {compatibility.score}%
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md mt-1 bg-white/10 text-white/80 whitespace-nowrap">
                  {compatibility.badge}
                </span>
              </div>

              <div className="text-xs text-white/40 font-mono tracking-widest">VS</div>

              {/* Scratch & Transition Quick Actions */}
              <div className="flex flex-col gap-2 w-full">
                <button
                  type="button"
                  onClick={handleManualScratch}
                  className="w-full py-2 px-3 rounded-xl glass-button text-xs font-black uppercase tracking-wider text-rose-300 hover:text-white flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-md"
                  title="Trigger Procedural Vinyl Backspin"
                >
                  <span>⚡</span>
                  <span>Scratch</span>
                </button>

                <button
                  type="button"
                  disabled={isJamGuest}
                  onClick={handleTriggerHarmonicDrop}
                  className={`w-full py-2 px-3 rounded-xl glass-button-primary text-xs font-black uppercase tracking-wider text-white flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-lg ${isJamGuest ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  title={isJamGuest ? 'Host controls playback in Jam' : 'Harmonic Drop into Next Track'}
                >
                  <span>⏩</span>
                  <span>Drop Next</span>
                </button>
              </div>
            </div>

            {/* Deck B (Upcoming Queue Track) */}
            <div className="md:col-span-5 rounded-2xl p-4 bg-white/[0.03] border border-white/10 relative overflow-hidden flex flex-col items-center text-center">
              <div className="w-full flex items-center justify-between mb-3 text-[11px] font-bold">
                <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-widest">
                  DECK B • UPCOMING
                </span>
                {deckBHarmonics && (
                  <span className="font-mono text-white/70">
                    {deckBHarmonics.bpm} BPM
                  </span>
                )}
              </div>

              {/* 3D Vinyl Record Platter B */}
              <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full vinyl-disc shadow-[0_12px_36px_rgba(0,0,0,0.8)] border border-white/15 my-2 flex items-center justify-center opacity-85">
                <div className="w-full h-full rounded-full flex items-center justify-center relative overflow-hidden">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 border-zinc-900 shadow-inner relative z-10">
                    <img src={artSrcB} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 m-auto w-3.5 h-3.5 rounded-full bg-zinc-950 border border-white/30" />
                  </div>
                </div>
              </div>

              {/* Deck B Track Details & Harmonics */}
              <h3 className="font-bold text-sm text-white truncate max-w-full mt-2">
                {nextTrackItem?.title || 'End of Queue'}
              </h3>
              <p className="text-xs text-white/55 truncate max-w-full mt-0.5">
                {nextTrackItem?.artist || 'Add songs to queue'}
              </p>

              {deckBHarmonics && (
                <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
                  <span className="px-2.5 py-1 rounded-xl text-xs font-black font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {deckBHarmonics.camelotKey} ({deckBHarmonics.musicalKey})
                  </span>
                  <span className="px-2 py-0.5 rounded-xl text-[11px] font-semibold bg-white/10 text-white/80">
                    {deckBHarmonics.energy}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Harmonic Transition Recommendation Banner */}
          <div className="rounded-2xl p-3.5 mb-5 bg-gradient-to-r from-purple-900/30 via-indigo-900/30 to-rose-900/30 border border-white/10 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-lg">🎼</span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  {compatibility.label}
                </div>
                <div className="text-[11px] text-white/50 truncate">
                  Camelot Mixing: {deckAHarmonics?.camelotKey || 'N/A'} ➔ {deckBHarmonics?.camelotKey || 'N/A'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-white/60">Automix:</span>
              <button
                type="button"
                onClick={() => {
                  if (isAutomixEffective) {
                    setSmartDjAutoMix(false);
                  } else {
                    setSmartDjAutoMix(true);
                    if (crossfadeDuration === 0) setCrossfade(4);
                  }
                }}
                className={`px-3 py-1 rounded-full text-xs font-black transition-all cursor-pointer ${
                  isAutomixEffective
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                    : 'bg-white/10 text-white/60 hover:text-white'
                }`}
              >
                {isAutomixEffective ? 'ACTIVE' : crossfadeDuration === 0 ? 'OFF (0s)' : 'OFF'}
              </button>
            </div>
          </div>

          {/* Interactive DJ Performance Controls: Crossfader & Filter Sweep */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 border-t border-white/10">
            {/* DJ Crossfader */}
            <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/10">
              <div className="flex justify-between items-center text-xs font-bold mb-2">
                <span className="text-white/70">Deck A (Live)</span>
                <span className="text-white font-mono uppercase tracking-wider text-[11px]">DJ Crossfader</span>
                <span className="text-white/70">Deck B (Queue)</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={crossfaderPos}
                onChange={(e) => setCrossfaderPos(Number(e.target.value))}
                className="w-full accent-[var(--color-accent)] cursor-pointer h-2 bg-white/20 rounded-lg"
              />
              <div className="flex justify-between items-center text-[10px] text-white/40 mt-1.5 font-mono">
                <span>100% Deck A</span>
                <span>50 / 50 Blend</span>
                <span>100% Deck B</span>
              </div>
            </div>

            {/* DJ Filter Sweep */}
            <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/10">
              <div className="flex justify-between items-center text-xs font-bold mb-2">
                <span className="text-white/70">Low-Pass (LPF)</span>
                <span className="text-white font-mono uppercase tracking-wider text-[11px]">Filter Sweep</span>
                <span className="text-white/70">High-Pass (HPF)</span>
              </div>
              <input
                type="range"
                min="-100"
                max="100"
                value={filterSweep}
                onChange={(e) => setFilterSweep(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer h-2 bg-white/20 rounded-lg"
              />
              <div className="flex justify-between items-center text-[10px] text-white/40 mt-1.5 font-mono">
                <span>-100% LPF</span>
                <span>{filterSweep === 0 ? 'FLAT (BYPASS)' : `${filterSweep > 0 ? '+' : ''}${filterSweep}%`}</span>
                <span>+100% HPF</span>
              </div>
            </div>

            {/* Smart Crossfade Timing & Vinyl Backspin Setting */}
            <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/10 flex flex-col justify-between sm:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between text-xs font-bold mb-2">
                <span className="text-white">Procedural Vinyl Backspin on Skip</span>
                <button
                  type="button"
                  onClick={() => setDjVinylBackspin(!djVinylBackspin)}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                    djVinylBackspin ? 'bg-[var(--color-accent)] text-white' : 'bg-white/10 text-white/50'
                  }`}
                >
                  {djVinylBackspin ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="flex items-center justify-between text-xs font-bold mt-2">
                <span className="text-white/70">Automix Crossfade Duration</span>
                <span className="font-mono text-[var(--color-accent)]">{crossfadeDuration}s</span>
              </div>
              <input
                type="range"
                min="0"
                max="12"
                step="1"
                value={crossfadeDuration}
                onChange={(e) => setCrossfade(Number(e.target.value))}
                className="w-full accent-[var(--color-accent)] cursor-pointer h-1.5 bg-white/20 rounded-lg mt-1"
              />
            </div>
          </div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>,
    document.body
  );
});

SmartDJModal.displayName = 'SmartDJModal';
export default SmartDJModal;
