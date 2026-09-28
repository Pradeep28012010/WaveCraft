import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { getLyricsData, type LyricsResult } from '../../services/lyrics';
import { usePlayerStore } from '../../stores/playerStore';

interface LyricsViewProps {
  artist?: string;
  title?: string;
  isFullScreen?: boolean;
}

export default function LyricsView({ artist, title }: LyricsViewProps) {
  const [result, setResult] = useState<LyricsResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLParagraphElement | null>(null);

  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const seekTo = usePlayerStore((s) => s.seekTo);

  useEffect(() => {
    let isMounted = true;
    const fetchLyrics = async () => {
      if (!artist || !title) {
        setResult(null);
        return;
      }

      setIsLoading(true);
      try {
        const data = await getLyricsData(artist, title, duration || 210);
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

  // Compute active line index from currentTime
  const lines = result?.lines || [];
  let activeIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time >= 0 && currentTime >= lines[i].time) {
      activeIndex = i;
    }
  }

  // Auto-scroll active lyric into center of container
  useEffect(() => {
    if (activeLineRef.current && containerRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [activeIndex]);

  return (
    <div className="relative w-full h-full flex flex-col liquid-glass rounded-3xl overflow-hidden border border-white/15">
      {/* Header Pill */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/10 bg-black/20 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-widest text-white/80">
            {result?.synced ? 'WaveSync • Time-Synced Lyrics' : result?.source || 'Lyrics & Credits'}
          </span>
        </div>
        {result?.synced && (
          <span className="text-[11px] text-white/45">Tap any line to jump</span>
        )}
      </div>

      {/* Scrollable Lyrics Body */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-6 sm:px-8 py-8 no-scrollbar space-y-5"
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-white/60">
            <div className="w-7 h-7 border-2 border-white/20 border-t-[var(--color-accent)] rounded-full animate-spin" />
            <p className="text-sm font-semibold">Fetching synced lyrics & studio notes...</p>
          </div>
        ) : lines.length > 0 ? (
          <div className="flex flex-col gap-5 pb-24">
            {lines.map((line, index) => {
              const isCurrent = index === activeIndex;
              const isPast = index < activeIndex;
              return (
                <motion.p
                  key={index}
                  ref={isCurrent ? activeLineRef : null}
                  onClick={() => {
                    if (line.time >= 0) seekTo(line.time);
                  }}
                  className={`text-lg sm:text-2xl font-extrabold leading-snug transition-all duration-300 cursor-pointer select-text origin-left ${
                    isCurrent
                      ? 'text-white scale-[1.03] drop-shadow-[0_0_20px_rgba(255,255,255,0.45)]'
                      : isPast
                      ? 'text-white/35 hover:text-white/75'
                      : 'text-white/55 hover:text-white/85'
                  }`}
                >
                  {line.text}
                </motion.p>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 text-white/50">
            <p className="text-base font-bold text-white/80">{title}</p>
            <p className="text-xs text-white/50 mt-1">{artist}</p>
            <p className="text-xs text-white/40 mt-4">
              Instrumental / Studio Track — Enjoy the 320kbps studio audio & visualizer.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
