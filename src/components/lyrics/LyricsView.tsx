import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getLyricsData,
  getSavedLyricsOffset,
  saveLyricsOffset,
  type LyricsResult,
  type LyricsCandidate
} from '../../services/lyrics';
import { usePlayerStore } from '../../stores/playerStore';
import { formatTime } from '../../utils/formatTime';
import type { LyricLine } from '../../types';

interface LyricsViewProps {
  artist?: string;
  title?: string;
  isFullScreen?: boolean;
  onShareLyric?: (quote: string) => void;
}

const formatTimestamp = (seconds: number) => (seconds < 0 || isNaN(seconds) ? '' : formatTime(seconds));

/**
 * Isolated 120fps GPU-composited Karaoke Progress Bar (`transform: scaleX`)
 * Subscribes to `currentTime` independently so the 80-line lyrics list NEVER re-renders between lines!
 */
const ActiveLineProgress = memo(
  ({ startTime, endTime, userOffset }: { startTime: number; endTime: number; userOffset: number }) => {
    const currentTime = usePlayerStore((s) => s.currentTime);
    const syncTime = currentTime + userOffset + 0.25;
    const duration = Math.max(1.2, endTime - startTime);
    const progress = Math.min(1, Math.max(0, (syncTime - startTime) / duration));

    return (
      <div className="mt-2.5 h-1 w-full bg-white/12 rounded-full relative">
        <div
          className="h-full bg-gradient-to-r from-[var(--color-accent)] via-rose-400 to-white rounded-full transition-[width] duration-150 ease-linear"
          style={{
            width: `${(progress * 100).toFixed(2)}%`,
            boxShadow: '0 0 10px 1px var(--color-accent)'
          }}
        />
      </div>
    );
  }
);
ActiveLineProgress.displayName = 'ActiveLineProgress';

interface LyricRowProps {
  line: LyricLine;
  nextLineText?: string;
  index: number;
  activeIndex: number;
  nextLineTime: number;
  userOffset: number;
  onSelectLine: (time: number) => void;
  onShareLine?: (quote: string) => void;
  onAlignToNow?: (time: number) => void;
  setRowRef: (index: number, el: HTMLDivElement | null) => void;
}

/**
 * Memoized 120fps GPU-accelerated Lyric Row
 * Only re-renders when its own relative distance category to `activeIndex` changes.
 */
const LyricRow = memo(
  ({
    line,
    nextLineText,
    index,
    activeIndex,
    nextLineTime,
    userOffset,
    onSelectLine,
    onShareLine,
    onAlignToNow,
    setRowRef
  }: LyricRowProps) => {
    const isCurrent = index === activeIndex;
    const isPast = index < activeIndex;
    const distance = activeIndex === -1 ? Math.min(index, 4) : Math.min(Math.abs(index - activeIndex), 4);

    const targetOpacity = isCurrent
      ? 1
      : distance === 1
      ? isPast
        ? 0.45
        : 0.74
      : distance === 2
      ? isPast
        ? 0.28
        : 0.48
      : isPast
      ? 0.16
      : 0.26;

    const targetScale = isCurrent ? 1.035 : distance === 1 ? 0.985 : 0.96;
    const targetX = isCurrent ? 8 : 0;

    // Static lightweight optical depth class instead of per-frame JS blur rasterization
    const depthBlurClass = isCurrent
      ? 'blur-none'
      : distance === 1
      ? 'blur-[0.3px] hover:blur-none'
      : distance === 2
      ? 'blur-[0.8px] hover:blur-none'
      : 'blur-[1.4px] hover:blur-none';

    const isLongBridge = isCurrent && nextLineTime - line.time > 9;

    return (
      <div className="flex flex-col">
        <motion.div
          ref={(el) => setRowRef(index, el)}
          onClick={() => onSelectLine(line.time)}
          initial={false}
          animate={{
            scale: targetScale,
            x: targetX,
            opacity: targetOpacity
          }}
          whileHover={{
            scale: isCurrent ? 1.045 : 1.01,
            x: isCurrent ? 10 : 4,
            opacity: 0.96
          }}
          transition={{
            type: 'spring',
            stiffness: 340,
            damping: 30,
            mass: 0.65
          }}
          className={`group relative py-2.5 px-4 rounded-2xl cursor-pointer select-text origin-left will-change-transform ${depthBlurClass} ${
            isCurrent
              ? 'bg-white/[0.09] border border-white/15 shadow-[0_12px_32px_rgba(0,0,0,0.35)]'
              : 'hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <p
              className={`text-lg sm:text-2xl md:text-[26px] font-extrabold leading-snug tracking-tight ${
                isCurrent
                  ? 'text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]'
                  : 'text-white/90'
              }`}
            >
              {line.text}
            </p>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* One-Tap "Sync to Now" Alignment Button */}
              {onAlignToNow && line.time >= 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAlignToNow(line.time);
                  }}
                  title="Snap timing: Click when you hear this line to sync all lyrics instantly"
                  className="opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded-full bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/30 text-[10px] font-bold text-amber-200 hover:text-white transition-all cursor-pointer flex items-center gap-1 flex-shrink-0 shadow-sm"
                >
                  <svg className="w-2.5 h-2.5 text-amber-300 fill-current" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <span>Sync Here</span>
                </button>
              )}

              {onShareLine && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShareLine(nextLineText ? `${line.text}\n${nextLineText}` : line.text);
                  }}
                  title="Create 1080×1920 Story Poster with this lyric line"
                  className="opacity-0 group-hover:opacity-100 px-2.5 py-1 rounded-full glass-button hover:glass-button-primary text-[11px] font-bold text-white/90 hover:text-white transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap flex-shrink-0"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span className="hidden sm:inline">Card</span>
                </button>
              )}

              {line.time >= 0 && (
                <span
                  className={`text-[11px] font-semibold tabular-nums px-2.5 py-0.5 rounded-full flex-shrink-0 transition-opacity duration-150 ${
                    isCurrent
                      ? 'opacity-95 bg-white/12 text-white/90 border border-white/20 shadow-inner'
                      : 'opacity-0 group-hover:opacity-75 bg-white/[0.07] text-white/65'
                  }`}
                >
                  {formatTimestamp(line.time)}
                </span>
              )}
            </div>
          </div>

          {isCurrent && (
            <ActiveLineProgress
              startTime={line.time}
              endTime={nextLineTime}
              userOffset={userOffset}
            />
          )}
        </motion.div>

        {isLongBridge && (
          <div className="flex items-center gap-2.5 pl-6 py-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-accent)] animate-pulse [animation-delay:180ms]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-accent)] animate-pulse [animation-delay:360ms]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/45 ml-1">
              Musical Interlude
            </span>
          </div>
        )}
      </div>
    );
  },
  (prev, next) => {
    if (
      prev.line !== next.line ||
      prev.index !== next.index ||
      prev.userOffset !== next.userOffset
    ) {
      return false;
    }
    if (prev.activeIndex === next.activeIndex) return true;
    // Only re-render if this row was or is within 3 lines of activeIndex!
    const prevDist = Math.min(Math.abs(prev.index - prev.activeIndex), 3);
    const nextDist = Math.min(Math.abs(next.index - next.activeIndex), 3);
    const prevPast = prev.index < prev.activeIndex;
    const nextPast = next.index < next.activeIndex;
    return prevDist === nextDist && prevPast === nextPast;
  }
);
LyricRow.displayName = 'LyricRow';

export default function LyricsView({ artist, title, onShareLyric }: LyricsViewProps) {
  const [result, setResult] = useState<LyricsResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [userScrolling, setUserScrolling] = useState(false);
  const [userOffset, setUserOffset] = useState<number>(0);
  const [showSyncDrawer, setShowSyncDrawer] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollAnimRef = useRef<number>(0);
  const isProgrammaticScrollRef = useRef(false);

  const currentTrackDuration = usePlayerStore((s) => s.currentTrack?.duration);
  const duration = usePlayerStore((s) => s.duration);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const seekTo = usePlayerStore((s) => s.seekTo);

  const activeDuration = duration || currentTrackDuration || 210;

  // Load saved per-song offset whenever track changes
  useEffect(() => {
    if (artist && title) {
      setUserOffset(getSavedLyricsOffset(artist, title));
    } else {
      setUserOffset(0);
    }
  }, [artist, title]);

  useEffect(() => {
    let isMounted = true;
    const fetchLyrics = async () => {
      if (!artist || !title) {
        setResult(null);
        return;
      }

      setIsLoading(true);
      try {
        const data = await getLyricsData(artist, title, activeDuration);
        if (isMounted) {
          setResult(data);
        }
      } catch {
        if (isMounted) setResult(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchLyrics();
    return () => {
      isMounted = false;
    };
  }, [artist, title, activeDuration]);

  const lines = useMemo(() => {
    const rawLines = result?.lines || [];
    if (rawLines.length === 0) return [];
    if (result?.synced) return rawLines;

    const usableDuration = Math.max(45, activeDuration * 0.9);
    const introOffset = Math.min(6, activeDuration * 0.04);
    const step = usableDuration / rawLines.length;
    return rawLines.map((line, idx) => ({
      text: line.text,
      time: introOffset + idx * step
    }));
  }, [result, activeDuration]);

  // Subscribe ONLY to the computed `activeIndex` integer incorporating real-time userOffset!
  const activeIndex = usePlayerStore(
    useCallback(
      (s) => {
        if (lines.length === 0) return -1;
        const syncTime = s.currentTime + userOffset + 0.25;
        let idx = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].time >= 0 && syncTime >= lines[i].time) {
            idx = i;
          } else {
            break;
          }
        }
        return idx;
      },
      [lines, userOffset]
    )
  );

  const setRowRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) lineRefs.current.set(index, el);
    else lineRefs.current.delete(index);
  }, []);

  const handleSelectLine = useCallback(
    (time: number) => {
      if (time >= 0) {
        setUserScrolling(false);
        seekTo(time);
      }
    },
    [seekTo]
  );

  // Real-time offset adjustment & persistence
  const handleAdjustOffset = useCallback(
    (delta: number) => {
      setUserOffset((prev) => {
        const next = Math.round((prev + delta) * 10) / 10;
        const clamped = Math.max(-30, Math.min(30, next));
        saveLyricsOffset(artist || '', title || '', clamped);
        return clamped;
      });
    },
    [artist, title]
  );

  const handleSetOffset = useCallback(
    (val: number) => {
      const clamped = Math.max(-30, Math.min(30, Math.round(val * 10) / 10));
      setUserOffset(clamped);
      saveLyricsOffset(artist || '', title || '', clamped);
    },
    [artist, title]
  );

  const handleResetOffset = useCallback(() => {
    setUserOffset(0);
    saveLyricsOffset(artist || '', title || '', 0);
  }, [artist, title]);

  // One-tap Snap-to-Current-Vocal: snaps lyrics to exactly what the user is hearing right now!
  const handleAlignToCurrentTime = useCallback(
    (lineTime: number) => {
      const currentAudioTime = usePlayerStore.getState().currentTime;
      // syncTime = currentAudioTime + neededOffset + 0.25 = lineTime
      const neededOffset = Math.round((lineTime - currentAudioTime - 0.25) * 10) / 10;
      const clamped = Math.max(-30, Math.min(30, neededOffset));
      setUserOffset(clamped);
      saveLyricsOffset(artist || '', title || '', clamped);
    },
    [artist, title]
  );

  // Switch between candidates (e.g. Devanagari script vs Romanized album cut)
  const handleSwitchCandidate = useCallback((cand: LyricsCandidate) => {
    setResult((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        synced: cand.synced,
        lyrics: cand.lyrics,
        lines: cand.lines,
        source: cand.source,
        activeCandidateId: cand.id
      };
    });
  }, []);

  // Native 120Hz/144Hz/240Hz requestAnimationFrame Spring Scroll Interpolator
  const animateScrollToActive = useCallback(() => {
    const container = containerRef.current;
    const targetIndex = activeIndex >= 0 ? activeIndex : 0;
    const activeEl = lineRefs.current.get(targetIndex);
    if (!container || !activeEl) return;

    cancelAnimationFrame(scrollAnimRef.current);

    const containerRect = container.getBoundingClientRect();
    const lineRect = activeEl.getBoundingClientRect();
    const relativeTop = lineRect.top - containerRect.top;
    const targetScrollTop = Math.max(
      0,
      container.scrollTop + relativeTop - container.clientHeight * 0.38 + activeEl.clientHeight / 2
    );

    isProgrammaticScrollRef.current = true;
    let lastTime = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const current = container.scrollTop;
      const diff = targetScrollTop - current;

      if (Math.abs(diff) < 0.8) {
        container.scrollTop = targetScrollTop;
        isProgrammaticScrollRef.current = false;
        return;
      }

      // Exponential decay spring (frame-rate independent for 60Hz, 120Hz, 144Hz, 240Hz)
      const factor = 1 - Math.exp(-11.5 * dt);
      container.scrollTop = current + diff * factor;
      scrollAnimRef.current = requestAnimationFrame(step);
    };

    scrollAnimRef.current = requestAnimationFrame(step);
  }, [activeIndex]);

  useEffect(() => {
    if (userScrolling || lines.length === 0) return;
    animateScrollToActive();
    return () => cancelAnimationFrame(scrollAnimRef.current);
  }, [activeIndex, lines.length, userScrolling, animateScrollToActive]);

  useEffect(() => {
    if (lines.length > 0) {
      const timer = setTimeout(() => animateScrollToActive(), 90);
      return () => clearTimeout(timer);
    }
  }, [result, lines.length, animateScrollToActive]);

  const handleUserScrollInteraction = useCallback(() => {
    if (isProgrammaticScrollRef.current) return;
    cancelAnimationFrame(scrollAnimRef.current);
    setUserScrolling(true);
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = setTimeout(() => {
      setUserScrolling(false);
    }, 4500);
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(scrollAnimRef.current);
      if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    };
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col liquid-glass rounded-3xl overflow-hidden border border-white/15 shadow-[0_24px_80px_rgba(0,0,0,0.65)] gpu-layer">
      {/* Sleek Single-Row Spatial Studio Toolbar */}
      <div className="h-14 px-5 flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.025] backdrop-blur-xl flex-shrink-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-accent)] opacity-75 ${
                !isPlaying ? 'hidden' : ''
              }`}
            />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--color-accent)] shadow-[0_0_10px_var(--color-accent)]" />
          </span>
          <span className="text-xs font-extrabold uppercase tracking-[0.16em] text-white/90 truncate">
            WaveSync
          </span>
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-white/[0.07] border border-white/10 text-[10px] font-bold uppercase tracking-wider text-white/55">
            {result?.synced ? '120Hz Live' : 'Auto-Flow'}
          </span>
        </div>

        {/* Unified Segmented Glass Control Dock */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* 1. Lyrics Sync Timing Calibration Button */}
          <button
            type="button"
            onClick={() => setShowSyncDrawer((prev) => !prev)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              showSyncDrawer || userOffset !== 0
                ? 'glass-button-primary text-white shadow-[0_0_14px_rgba(255,255,255,0.2)]'
                : 'glass-button text-white/80 hover:text-white'
            }`}
            title="Fine-tune lyrics synchronization timing & switch lyric cuts"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>
              {userOffset !== 0
                ? `${userOffset > 0 ? '+' : ''}${userOffset.toFixed(1)}s`
                : 'Sync'}
            </span>
            {userOffset !== 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>

          {/* Lyric Story Poster Studio */}
          {onShareLyric && (
            <button
              type="button"
              onClick={() => {
                const curIdx = activeIndex >= 0 ? activeIndex : 0;
                const l1 = lines[curIdx]?.text || '';
                const l2 = lines[curIdx + 1]?.text || '';
                onShareLyric(l2 ? `${l1}\n${l2}` : l1);
              }}
              className="px-3 py-1.5 rounded-full glass-button text-[11px] font-bold tracking-wide text-white/80 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              title="Export 1080×1920 Social Story Poster of current lyrics"
            >
              <svg className="w-3.5 h-3.5 text-[var(--color-accent)] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span className="hidden sm:inline">Story Card</span>
            </button>
          )}
        </div>
      </div>

      {/* Expandable Lyrics Sync Timing & Version Switcher Drawer */}
      <AnimatePresence>
        {showSyncDrawer && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden border-b border-white/10 bg-black/50 backdrop-blur-2xl px-5 py-3 flex flex-col gap-2.5 flex-shrink-0 z-15 text-xs shadow-2xl"
          >
            {/* Top Row: Current Timing status & Quick Nudges */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-white/90">Sync Timing:</span>
                <span
                  className={`font-mono font-bold px-2 py-0.5 rounded-full tabular-nums text-[11px] ${
                    userOffset === 0
                      ? 'bg-white/10 text-white/70'
                      : userOffset > 0
                      ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                      : 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/40'
                  }`}
                >
                  {userOffset === 0
                    ? '0.0s (In Sync)'
                    : `${userOffset > 0 ? '+' : ''}${userOffset.toFixed(1)}s (${
                        userOffset > 0 ? 'Advanced / Earlier' : 'Delayed / Later'
                      })`}
                </span>
                <span className="text-[10px] text-white/50 hidden md:inline">
                  • Hover any line and tap "Sync Here" to snap timing in 1 click
                </span>
              </div>

              {/* Stepper Buttons */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleAdjustOffset(-1.0)}
                  className="px-2 py-1 rounded-lg glass-button text-[11px] font-bold text-white/80 hover:text-white"
                  title="Delay lyrics by 1.0 second"
                >
                  -1s
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjustOffset(-0.5)}
                  className="px-2 py-1 rounded-lg glass-button text-[11px] font-bold text-white/80 hover:text-white"
                  title="Delay lyrics by 0.5 second"
                >
                  -0.5s
                </button>
                <button
                  type="button"
                  onClick={handleResetOffset}
                  disabled={userOffset === 0}
                  className="px-2.5 py-1 rounded-lg glass-button text-[11px] font-bold text-white/80 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Reset offset to default 0.0s"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjustOffset(0.5)}
                  className="px-2 py-1 rounded-lg glass-button text-[11px] font-bold text-white/80 hover:text-white"
                  title="Advance lyrics by 0.5 second (show earlier)"
                >
                  +0.5s
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjustOffset(1.0)}
                  className="px-2 py-1 rounded-lg glass-button text-[11px] font-bold text-white/80 hover:text-white"
                  title="Advance lyrics by 1.0 second (show earlier)"
                >
                  +1s
                </button>
              </div>
            </div>

            {/* Middle Row: Quick Presets & Precision Slider */}
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] uppercase font-bold text-white/45 tracking-wider">
                  Presets:
                </span>
                {[-8, -5, -3, -1, 1, 3, 5, 8].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => handleSetOffset(sec)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                      userOffset === sec
                        ? 'bg-[var(--color-accent)] text-white shadow-sm'
                        : 'bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white'
                    }`}
                  >
                    {sec > 0 ? `+${sec}s` : `${sec}s`}
                  </button>
                ))}
              </div>

              {/* Fine Slider */}
              <div className="flex items-center gap-2 w-full sm:w-52">
                <span className="text-[10px] text-white/40">-15s</span>
                <input
                  type="range"
                  min="-15"
                  max="15"
                  step="0.1"
                  value={userOffset}
                  onChange={(e) => handleSetOffset(parseFloat(e.target.value))}
                  className="flex-1 accent-[var(--color-accent)] h-1 bg-white/20 rounded-lg cursor-pointer"
                />
                <span className="text-[10px] text-white/40">+15s</span>
              </div>
            </div>

            {/* Bottom Row: Version & Script Switcher (Devanagari vs Romanized vs Album cut) */}
            {result?.candidates && result.candidates.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
                <span className="text-[10px] uppercase font-bold text-white/45 tracking-wider">
                  Versions:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {result.candidates.map((cand) => {
                    const isCandActive =
                      String(cand.id) === String(result.activeCandidateId);
                    return (
                      <button
                        key={cand.id}
                        type="button"
                        onClick={() => handleSwitchCandidate(cand)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-tight transition-all cursor-pointer flex items-center gap-1.5 ${
                          isCandActive
                            ? 'glass-button-primary text-white border-white/40 shadow-sm'
                            : 'bg-white/[0.05] hover:bg-white/[0.12] text-white/70 hover:text-white border border-white/5'
                        }`}
                        title={`${cand.trackName} by ${cand.artistName} (${cand.duration ? `${cand.duration}s` : 'Unknown duration'})`}
                      >
                        <span>
                          {cand.scriptType === 'Devanagari'
                            ? '🇮🇳 Devanagari'
                            : cand.scriptType === 'Native'
                            ? '🌐 Native'
                            : '🔤 Romanized'}
                        </span>
                        {cand.duration ? (
                          <span className="opacity-60 tabular-nums">
                            {formatTime(cand.duration)}
                          </span>
                        ) : null}
                        {cand.durationDiff !== undefined && cand.durationDiff <= 5 && (
                          <span className="px-1 py-0.2 rounded bg-emerald-500/30 text-emerald-200 text-[9px] font-black">
                            Match
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scrollable Spatial Lyrics Viewport with True Alpha Feather Mask */}
      <div
        ref={containerRef}
        onWheel={handleUserScrollInteraction}
        onTouchMove={handleUserScrollInteraction}
        style={{
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent 0px, black 36px, black calc(100% - 48px), transparent 100%)',
          maskImage:
            'linear-gradient(to bottom, transparent 0px, black 36px, black calc(100% - 48px), transparent 100%)'
        }}
        className="flex-1 overflow-y-auto px-6 sm:px-10 py-10 no-scrollbar relative will-change-scroll"
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-white/60">
            <div className="relative w-10 h-10 flex items-center justify-center">
              <div className="absolute inset-0 border-2 border-white/15 border-t-[var(--color-accent)] rounded-full animate-spin" />
              <div className="w-3 h-3 rounded-full bg-[var(--color-accent)] animate-pulse" />
            </div>
            <p className="text-sm font-semibold tracking-wide text-white/75">
              Syncing studio lyrics & timecodes...
            </p>
          </div>
        ) : lines.length > 0 ? (
          <div className="flex flex-col gap-3.5 pb-40 pt-8">
            {activeIndex === -1 && lines[0]?.time > 3.5 && (
              <div className="flex items-center gap-2.5 py-3 px-4">
                <span className="w-3 h-3 rounded-full bg-white animate-pulse" />
                <span className="w-3 h-3 rounded-full bg-white animate-pulse [animation-delay:200ms]" />
                <span className="w-3 h-3 rounded-full bg-white animate-pulse [animation-delay:400ms]" />
                <span className="text-xs font-bold uppercase tracking-widest text-white/50 ml-2">
                  Instrumental Intro
                </span>
              </div>
            )}

            {lines.map((line, index) => {
              const nextLineTime =
                index + 1 < lines.length
                  ? lines[index + 1].time
                  : Math.max(line.time + 5, activeDuration);
              return (
                <LyricRow
                  key={index}
                  line={line}
                  nextLineText={lines[index + 1]?.text}
                  index={index}
                  activeIndex={activeIndex}
                  nextLineTime={nextLineTime}
                  userOffset={userOffset}
                  onSelectLine={handleSelectLine}
                  onShareLine={onShareLyric}
                  onAlignToNow={handleAlignToCurrentTime}
                  setRowRef={setRowRef}
                />
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 text-white/50">
            <p className="text-base font-bold text-white/85">{title}</p>
            <p className="text-xs text-white/55 mt-1">{artist}</p>
            <p className="text-xs text-white/40 mt-4 max-w-xs">
              Instrumental / Studio Track — Enjoy the 320kbps studio audio & 3D visualizer.
            </p>
          </div>
        )}
      </div>

      {/* Floating "Resume Live Sync" Pill when user scrolls manually */}
      <AnimatePresence>
        {userScrolling && activeIndex >= 0 && (
          <motion.button
            initial={{ opacity: 0, y: 16, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 360, damping: 26 }}
            onClick={() => {
              setUserScrolling(false);
              animateScrollToActive();
            }}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full glass-button-primary text-white text-xs font-extrabold tracking-wide flex items-center gap-2 cursor-pointer hover:scale-105 active:scale-95 transition-transform whitespace-nowrap"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Resume Live Sync
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
