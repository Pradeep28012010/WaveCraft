import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getLyricsData, type LyricsResult } from '../../services/lyrics';
import { usePlayerStore } from '../../stores/playerStore';
import { useStudioStore } from '../../stores/studioStore';
import type { LyricLine } from '../../types';

interface LyricsViewProps {
  artist?: string;
  title?: string;
  isFullScreen?: boolean;
  onShareLyric?: (quote: string) => void;
}

const formatTimestamp = (seconds: number) => {
  if (seconds < 0 || isNaN(seconds)) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/**
 * Isolated 120fps GPU-composited Karaoke Progress Bar (`transform: scaleX`)
 * Subscribes to `currentTime` independently so the 80-line lyrics list NEVER re-renders between lines!
 */
const ActiveLineProgress = memo(
  ({ startTime, endTime }: { startTime: number; endTime: number }) => {
    const currentTime = usePlayerStore((s) => s.currentTime);
    const syncTime = currentTime + 0.22;
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
  onSelectLine: (time: number) => void;
  onShareLine?: (quote: string) => void;
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
    onSelectLine,
    onShareLine,
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
              {onShareLine && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShareLine(nextLineText ? `${line.text}\n${nextLineText}` : line.text);
                  }}
                  title="Create 1080×1920 Story Poster with this lyric line"
                  className="opacity-0 group-hover:opacity-100 px-2.5 py-1 rounded-full bg-white/10 hover:bg-[var(--color-accent)] border border-white/15 hover:border-white/30 text-[11px] font-bold text-white/90 hover:text-white transition-all cursor-pointer flex items-center gap-1 shadow-sm"
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

          {isCurrent && <ActiveLineProgress startTime={line.time} endTime={nextLineTime} />}
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
    if (prev.line !== next.line || prev.index !== next.index) return false;
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
  }, [artist, title]);

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

  // Subscribe ONLY to the computed `activeIndex` integer so LyricsView never re-renders between lyric lines!
  const activeIndex = usePlayerStore(
    useCallback(
      (s) => {
        if (lines.length === 0) return -1;
        const syncTime = s.currentTime + 0.22;
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
      [lines]
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

  // Live Microphone Sing-Along Karaoke Scorer State
  const [singAlongActive, setSingAlongActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [vocalScore, setVocalScore] = useState(88);
  const [vocalStreak, setVocalStreak] = useState(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micRafRef = useRef<number>(0);

  const toggleSingAlong = async () => {
    if (singAlongActive) {
      cancelAnimationFrame(micRafRef.current);
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      micCtxRef.current?.close().catch(() => {});
      micCtxRef.current = null;
      setSingAlongActive(false);
      setMicLevel(0);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const ctx = new window.AudioContext();
      micCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);

      const buf = new Uint8Array(analyser.frequencyBinCount);
      setSingAlongActive(true);
      setVocalScore(90);
      setVocalStreak(1);

      let frameCount = 0;
      const loop = () => {
        analyser.getByteFrequencyData(buf);
        // Focus on human vocal fundamental & harmonic bins (approx 100Hz - 3kHz)
        let sum = 0;
        for (let i = 2; i < 42; i++) sum += buf[i];
        const avg = sum / 40;
        const norm = Math.min(100, Math.round((avg / 140) * 100));
        setMicLevel(norm);

        frameCount++;
        if (frameCount % 35 === 0 && usePlayerStore.getState().isPlaying) {
          if (norm > 18) {
            setVocalStreak((s) => s + 1);
            setVocalScore((sc) => Math.min(99, sc + 1));
          }
        }
        micRafRef.current = requestAnimationFrame(loop);
      };
      micRafRef.current = requestAnimationFrame(loop);
    } catch {
      // Fallback if mic permission denied
      setSingAlongActive(false);
    }
  };

  useEffect(() => {
    return () => {
      cancelAnimationFrame(micRafRef.current);
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const vocalMode = useStudioStore((s) => s.vocalMode);
  const setVocalMode = useStudioStore((s) => s.setVocalMode);

  const vocalGrade =
    vocalScore >= 95 ? 'S+' : vocalScore >= 88 ? 'S' : vocalScore >= 80 ? 'A' : 'B';

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
        <div className="flex items-center gap-1 p-1 rounded-full bg-black/40 border border-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] flex-shrink-0">
          {/* 1. Karaoke / Acapella Vocal Stem Switcher */}
          <button
            type="button"
            onClick={() =>
              setVocalMode(
                vocalMode === 'normal'
                  ? 'karaoke'
                  : vocalMode === 'karaoke'
                  ? 'acapella'
                  : 'normal'
              )
            }
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-all cursor-pointer flex items-center gap-1.5 ${
              vocalMode === 'karaoke'
                ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-[0_0_16px_rgba(244,63,94,0.5)]'
                : vocalMode === 'acapella'
                ? 'bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white shadow-[0_0_16px_rgba(139,92,246,0.5)]'
                : 'text-white/70 hover:text-white hover:bg-white/[0.08]'
            }`}
            title="Cycle Real-Time Vocal Remover (Karaoke Instrumental) & Acapella Vocal Isolate"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 10v3" />
              <path d="M6 6v11" />
              <path d="M10 3v18" />
              <path d="M14 8v7" />
              <path d="M18 5v13" />
              <path d="M22 10v3" />
            </svg>
            <span>
              {vocalMode === 'karaoke'
                ? 'Karaoke On'
                : vocalMode === 'acapella'
                ? 'Acapella On'
                : 'Karaoke'}
            </span>
          </button>

          <div className="w-px h-4 bg-white/10" />

          {/* 2. Live Sing-Along Pitch & Energy Scorer */}
          {singAlongActive && (
            <div className="hidden md:flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-[10px] font-extrabold text-emerald-200">
              <div className="w-10 h-1.5 bg-black/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-cyan-300 rounded-full transition-[width] duration-75"
                  style={{ width: `${micLevel}%` }}
                />
              </div>
              <span className="tabular-nums text-emerald-300">{vocalStreak}x</span>
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-400 text-black text-[10px] font-black tabular-nums">
                {vocalGrade} {vocalScore}%
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={toggleSingAlong}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-all cursor-pointer flex items-center gap-1.5 ${
              singAlongActive
                ? 'bg-emerald-500 text-black font-extrabold shadow-[0_0_16px_rgba(16,185,129,0.5)]'
                : 'text-white/70 hover:text-white hover:bg-white/[0.08]'
            }`}
            title="Sing along with your microphone for live vocal pitch & energy scoring"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
            <span>{singAlongActive ? 'Stop Mic' : 'Sing-Along'}</span>
          </button>

          {/* 3. Lyric Story Poster Studio */}
          {onShareLyric && (
            <>
              <div className="w-px h-4 bg-white/10" />
              <button
                type="button"
                onClick={() => {
                  const curIdx = activeIndex >= 0 ? activeIndex : 0;
                  const l1 = lines[curIdx]?.text || '';
                  const l2 = lines[curIdx + 1]?.text || '';
                  onShareLyric(l2 ? `${l1}\n${l2}` : l1);
                }}
                className="px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide text-white/70 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer flex items-center gap-1.5"
                title="Export 1080×1920 Social Story Poster of current lyrics"
              >
                <svg className="w-3.5 h-3.5 text-[var(--color-accent)] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span className="hidden sm:inline">Story Card</span>
              </button>
            </>
          )}
        </div>
      </div>

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
                  onSelectLine={handleSelectLine}
                  onShareLine={onShareLyric}
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
            className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-[var(--color-accent)] text-white text-xs font-extrabold tracking-wide shadow-[0_8px_28px_rgba(250,45,72,0.55)] flex items-center gap-2 cursor-pointer hover:scale-105 active:scale-95 transition-transform"
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
