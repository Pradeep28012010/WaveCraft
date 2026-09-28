import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getLyricsData, type LyricsResult } from '../../services/lyrics';
import { usePlayerStore } from '../../stores/playerStore';

interface LyricsViewProps {
  artist?: string;
  title?: string;
  isFullScreen?: boolean;
}

const formatTimestamp = (seconds: number) => {
  if (seconds < 0 || isNaN(seconds)) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function LyricsView({ artist, title }: LyricsViewProps) {
  const [result, setResult] = useState<LyricsResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [userScrolling, setUserScrolling] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProgrammaticScrollRef = useRef(false);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const seekTo = usePlayerStore((s) => s.seekTo);

  const activeDuration = duration || currentTrack?.duration || 210;

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

  // Dynamically scale plain lyrics across actual track duration so even unsynced lyrics auto-scroll smoothly
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

  // Compute active line index from currentTime (with slight 0.22s anticipation for snappy visual sync)
  const syncTime = currentTime + 0.22;
  let activeIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time >= 0 && syncTime >= lines[i].time) {
      activeIndex = i;
    }
  }

  // Compute progress (0 -> 1) within the current active line for the karaoke glow bar
  const currentLineTime = activeIndex >= 0 ? lines[activeIndex]?.time ?? 0 : 0;
  const nextLineTime =
    activeIndex >= 0 && activeIndex + 1 < lines.length
      ? lines[activeIndex + 1].time
      : Math.max(currentLineTime + 5, activeDuration);
  const lineDuration = Math.max(1.2, nextLineTime - currentLineTime);
  const lineProgress =
    activeIndex >= 0
      ? Math.min(1, Math.max(0, (syncTime - currentLineTime) / lineDuration))
      : 0;

  // Detect instrumental intro or long instrumental bridge (> 8.5s gap)
  const isIntroInterlude = lines.length > 0 && lines[0].time > 3.5 && syncTime < lines[0].time;
  const isBridgeInterlude =
    activeIndex >= 0 &&
    lineDuration > 8.5 &&
    syncTime - currentLineTime > 4.2 &&
    nextLineTime - syncTime > 1.2;

  // Precision container-centered smooth scroll
  const scrollToActiveLine = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const container = containerRef.current;
      const targetIndex = activeIndex >= 0 ? activeIndex : 0;
      const activeEl = lineRefs.current.get(targetIndex);
      if (!container || !activeEl) return;

      const containerRect = container.getBoundingClientRect();
      const lineRect = activeEl.getBoundingClientRect();
      const relativeTop = lineRect.top - containerRect.top;

      // Position active line at 38% from the top of the viewport for optimal reading flow
      const desiredScrollTop =
        container.scrollTop +
        relativeTop -
        container.clientHeight * 0.38 +
        activeEl.clientHeight / 2;

      isProgrammaticScrollRef.current = true;
      container.scrollTo({
        top: Math.max(0, desiredScrollTop),
        behavior
      });

      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 650);
    },
    [activeIndex]
  );

  // Auto-scroll whenever activeIndex changes (unless user is manually inspecting lyrics)
  useEffect(() => {
    if (userScrolling || lines.length === 0) return;
    scrollToActiveLine('smooth');
  }, [activeIndex, lines.length, userScrolling, scrollToActiveLine]);

  // Also center immediately when lyrics first load
  useEffect(() => {
    if (lines.length > 0) {
      const timer = setTimeout(() => scrollToActiveLine('smooth'), 120);
      return () => clearTimeout(timer);
    }
  }, [result, lines.length, scrollToActiveLine]);

  // Pause auto-scroll briefly when user manually wheels or drags
  const handleUserScrollInteraction = () => {
    if (isProgrammaticScrollRef.current) return;
    setUserScrolling(true);
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = setTimeout(() => {
      setUserScrolling(false);
    }, 4500);
  };

  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    };
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col liquid-glass rounded-3xl overflow-hidden border border-white/15 shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
      {/* Header Pill */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/10 bg-black/25 backdrop-blur-xl flex-shrink-0 z-20">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-accent)] opacity-75 ${
                !isPlaying ? 'hidden' : ''
              }`}
            />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--color-accent)]" />
          </span>
          <span className="text-xs font-bold uppercase tracking-widest text-white/85">
            {result?.synced ? 'WaveSync • Live Time-Synced' : 'WaveSync • Auto-Flow Lyrics'}
          </span>
        </div>
        {lines.length > 0 && (
          <span className="text-[11px] font-medium text-white/45">
            Tap any line to jump
          </span>
        )}
      </div>

      {/* Top & Bottom Soft Depth-of-Field Gradient Masks */}
      <div className="pointer-events-none absolute top-12 left-0 right-0 h-12 bg-gradient-to-b from-black/55 to-transparent z-10" />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/65 to-transparent z-10" />

      {/* Scrollable Spatial Lyrics Viewport */}
      <div
        ref={containerRef}
        onWheel={handleUserScrollInteraction}
        onTouchMove={handleUserScrollInteraction}
        className="flex-1 overflow-y-auto px-6 sm:px-10 py-14 no-scrollbar relative"
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
            {/* Instrumental Intro Interlude Dots */}
            <AnimatePresence>
              {isIntroInterlude && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.85, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: -8 }}
                  className="flex items-center gap-2.5 py-3 px-4"
                >
                  {[0, 1, 2].map((dot) => (
                    <motion.span
                      key={dot}
                      animate={{
                        scale: [1, 1.45, 1],
                        opacity: [0.4, 1, 0.4]
                      }}
                      transition={{
                        duration: 1.2,
                        repeat: Infinity,
                        delay: dot * 0.2,
                        ease: 'easeInOut'
                      }}
                      className="w-3 h-3 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)]"
                    />
                  ))}
                  <span className="text-xs font-bold uppercase tracking-widest text-white/50 ml-2">
                    Instrumental Intro
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {lines.map((line, index) => {
              const isCurrent = index === activeIndex;
              const isPast = index < activeIndex;
              const distance = activeIndex === -1 ? index : Math.abs(index - activeIndex);

              // Progressive spatial depth-of-field blur & opacity falloff
              const blurPx = isCurrent
                ? 0
                : distance === 1
                ? 0.4
                : distance === 2
                ? 1.1
                : Math.min(2.4, 1.1 + (distance - 2) * 0.35);

              const targetOpacity = isCurrent
                ? 1
                : distance === 1
                ? isPast
                  ? 0.42
                  : 0.72
                : distance === 2
                ? isPast
                  ? 0.28
                  : 0.48
                : isPast
                ? 0.18
                : 0.3;

              const targetScale = isCurrent ? 1.04 : distance === 1 ? 0.985 : 0.96;
              const targetX = isCurrent ? 8 : 0;

              return (
                <div key={index} className="flex flex-col">
                  <motion.div
                    ref={(el) => {
                      if (el) lineRefs.current.set(index, el);
                      else lineRefs.current.delete(index);
                    }}
                    onClick={() => {
                      if (line.time >= 0) {
                        setUserScrolling(false);
                        seekTo(line.time);
                      }
                    }}
                    animate={{
                      scale: targetScale,
                      x: targetX,
                      opacity: targetOpacity,
                      filter: `blur(${blurPx}px)`
                    }}
                    whileHover={{
                      scale: isCurrent ? 1.05 : 1.01,
                      x: isCurrent ? 10 : 4,
                      opacity: 0.95,
                      filter: 'blur(0px)'
                    }}
                    transition={{
                      type: 'spring',
                      stiffness: 270,
                      damping: 28,
                      mass: 0.75
                    }}
                    className={`group relative py-2.5 px-4 rounded-2xl cursor-pointer select-text origin-left transition-colors duration-200 ${
                      isCurrent
                        ? 'bg-white/[0.08] border border-white/15 shadow-[0_12px_32px_rgba(0,0,0,0.35)]'
                        : 'hover:bg-white/[0.04] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <p
                        className={`text-lg sm:text-2xl md:text-[26px] font-extrabold leading-snug tracking-tight transition-colors duration-300 ${
                          isCurrent
                            ? 'text-white drop-shadow-[0_0_24px_rgba(255,255,255,0.55)]'
                            : 'text-white/90'
                        }`}
                      >
                        {line.text}
                      </p>

                      {line.time >= 0 && (
                        <span
                          className={`text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full flex-shrink-0 transition-opacity ${
                            isCurrent
                              ? 'opacity-90 bg-[var(--color-accent)]/25 text-[var(--color-accent)] border border-[var(--color-accent)]/40'
                              : 'opacity-0 group-hover:opacity-80 bg-white/10 text-white/70'
                          }`}
                        >
                          {formatTimestamp(line.time)}
                        </span>
                      )}
                    </div>

                    {/* Smooth Karaoke Line Progress Glow Bar under the Active Line */}
                    {isCurrent && (
                      <div className="mt-2.5 h-1 w-full bg-white/12 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-[var(--color-accent)] via-rose-400 to-white rounded-full shadow-[0_0_12px_var(--color-accent)]"
                          style={{ width: `${Math.round(lineProgress * 100)}%` }}
                          transition={{ duration: 0.12, ease: 'linear' }}
                        />
                      </div>
                    )}
                  </motion.div>

                  {/* Musical Interlude Bouncing Dots during long instrumental bridges */}
                  <AnimatePresence>
                    {isCurrent && isBridgeInterlude && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-2.5 pl-6 py-3"
                      >
                        {[0, 1, 2].map((dot) => (
                          <motion.span
                            key={dot}
                            animate={{
                              scale: [1, 1.45, 1],
                              opacity: [0.35, 1, 0.35]
                            }}
                            transition={{
                              duration: 1.1,
                              repeat: Infinity,
                              delay: dot * 0.18,
                              ease: 'easeInOut'
                            }}
                            className="w-2.5 h-2.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_10px_var(--color-accent)]"
                          />
                        ))}
                        <span className="text-[11px] font-bold uppercase tracking-widest text-white/45 ml-1">
                          Musical Interlude
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
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

      {/* Floating "Resume Auto-Scroll" Pill when user scrolls manually */}
      <AnimatePresence>
        {userScrolling && activeIndex >= 0 && (
          <motion.button
            initial={{ opacity: 0, y: 16, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            onClick={() => {
              setUserScrolling(false);
              scrollToActiveLine('smooth');
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
