import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { formatTime } from '../../utils/formatTime';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

interface WaveformScrubberProps {
  fallbackDuration: number;
  trackId?: string;
  trackTitle?: string;
  className?: string;
}

const BAR_COUNT = 54;

/**
 * Generates a deterministic pseudo-acoustic envelope for a song.
 * Produces organic verse lulls, chorus crescendo peaks, and drop-offs.
 */
function generateWaveformEnvelope(seedString: string, count: number): number[] {
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = (hash << 5) - hash + seedString.charCodeAt(i);
    hash |= 0;
  }

  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / count;
    // Base musical arc (intro -> verse -> chorus 1 -> verse 2 -> big chorus -> outro)
    const macroArc = Math.sin(t * Math.PI) * 0.45;
    const chorus1 = Math.exp(-Math.pow((t - 0.38) / 0.12, 2)) * 0.45;
    const chorus2 = Math.exp(-Math.pow((t - 0.76) / 0.14, 2)) * 0.55;

    // Pseudo-random high-frequency texture based on hash
    const pseudo = Math.sin(i * 12.9898 + (hash % 1000) * 0.1) * 43758.5453;
    const noise = Math.abs(pseudo - Math.floor(pseudo)) * 0.32;

    const combined = Math.max(0.18, Math.min(1.0, macroArc + chorus1 + chorus2 + noise));
    bars.push(combined);
  }
  return bars;
}

export const WaveformScrubber = memo(({
  fallbackDuration,
  trackId = 'default',
  trackTitle = '',
  className = ''
}: WaveformScrubberProps) => {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const seekTo = usePlayerStore((s) => s.seekTo);

  const [isDragging, setIsDragging] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const [dragRatio, setDragRatio] = useState(0);
  const [elasticOffset, setElasticOffset] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (snapTimerRef.current) {
        clearTimeout(snapTimerRef.current);
        snapTimerRef.current = null;
      }
    };
  }, []);

  const activeDuration = duration || fallbackDuration || 210;
  const playbackRatio = Math.min(1, Math.max(0, currentTime / activeDuration));
  const activeRatio = isDragging ? dragRatio : playbackRatio;
  const activeDisplayTime = isDragging ? dragRatio * activeDuration : currentTime;

  // Generate unique acoustic waveform fingerprint for this track
  const waveformBars = useMemo(
    () => generateWaveformEnvelope(`${trackId}-${trackTitle}`, BAR_COUNT),
    [trackId, trackTitle]
  );

  const calculateRatioAndOffset = (clientX: number) => {
    if (!trackRef.current) return { ratio: 0, offset: 0 };
    const rect = trackRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const width = rect.width;

    if (x < 0) {
      // Elastic stretch before start (rubber-band resistance)
      const pull = -x;
      const resisted = -Math.min(32, Math.pow(pull, 0.68) * 1.5);
      return { ratio: 0, offset: resisted };
    } else if (x > width) {
      // Elastic stretch beyond end (rubber-band resistance)
      const pull = x - width;
      const resisted = Math.min(32, Math.pow(pull, 0.68) * 1.5);
      return { ratio: 1, offset: resisted };
    } else {
      return { ratio: Math.max(0, Math.min(1, x / width)), offset: 0 };
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (snapTimerRef.current) {
      clearTimeout(snapTimerRef.current);
      snapTimerRef.current = null;
    }
    setIsSnapping(false);
    setIsDragging(true);
    triggerAndroidHaptic('light');
    const { ratio, offset } = calculateRatioAndOffset(e.clientX);
    setDragRatio(ratio);
    setElasticOffset(offset);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      const { ratio, offset } = calculateRatioAndOffset(e.clientX);
      setDragRatio(ratio);
      setElasticOffset(offset);
    } else if (trackRef.current) {
      const rect = trackRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      setHoverX(x);
      setHoverTime((x / rect.width) * activeDuration);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    const { ratio, offset } = calculateRatioAndOffset(e.clientX);
    triggerAndroidHaptic('medium');
    seekTo(ratio * activeDuration);
    setIsDragging(false);

    if (offset !== 0) {
      setIsSnapping(true);
      setElasticOffset(0);
      snapTimerRef.current = setTimeout(() => {
        setIsSnapping(false);
      }, 360);
    } else {
      setElasticOffset(0);
    }
  };

  const percent = activeRatio * 100;
  const fillLeft = elasticOffset < 0 ? elasticOffset : 0;
  const fillWidth =
    elasticOffset < 0
      ? -elasticOffset
      : `calc(${percent}% + ${elasticOffset}px)`;

  const transitionStyle = isDragging
    ? 'none'
    : isSnapping
    ? 'all 350ms cubic-bezier(0.34, 1.56, 0.64, 1)'
    : 'width 150ms linear, left 150ms linear';

  // Hover ratio for magnetic elevation effect
  const hoverRatio = hoverTime !== null ? hoverTime / activeDuration : null;
  const focusRatio = isDragging ? dragRatio : hoverRatio;

  return (
    <div className={`w-full mt-4 select-none touch-none ${className}`}>
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseLeave={() => setHoverTime(null)}
        className="relative cursor-pointer py-3 group flex flex-col justify-end touch-none h-14"
      >
        {/* Floating Scrubber Time Preview Capsule */}
        {(hoverTime !== null || isDragging) && (
          <div
            style={{
              left: isDragging ? `calc(${percent}% + ${elasticOffset}px)` : `${hoverX}px`,
              transform: 'translate3d(-50%, -100%, 0)',
              transition: isDragging
                ? 'none'
                : isSnapping
                ? 'left 350ms cubic-bezier(0.34, 1.56, 0.64, 1)'
                : 'none'
            }}
            className="pointer-events-none absolute -top-1 px-3 py-1 rounded-full liquid-glass glass-heavy border border-white/30 text-[11px] font-black tabular-nums text-white shadow-[0_8px_24px_rgba(0,0,0,0.6)] will-change-transform z-30 flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
            <span>{formatTime(isDragging ? activeDisplayTime : (hoverTime || 0))}</span>
          </div>
        )}

        {/* Peak Frequency Waveform Mini-Map with Magnetic Elevation */}
        <div className="relative w-full h-8 flex items-end justify-between gap-[2px] px-1 pointer-events-none">
          {waveformBars.map((normHeight, i) => {
            const barRatio = i / (BAR_COUNT - 1);
            const isPlayed = barRatio <= activeRatio;

            // Magnetic Gaussian elevation curve near cursor/drag position
            let elevation = 1;
            if (focusRatio !== null) {
              const dist = Math.abs(barRatio - focusRatio);
              if (dist < 0.12) {
                elevation = 1 + Math.cos((dist / 0.12) * (Math.PI / 2)) * 0.38;
              }
            }

            const barPixelHeight = Math.max(4, Math.round(normHeight * 26 * elevation));

            return (
              <span
                key={i}
                style={{
                  height: `${barPixelHeight}px`,
                  transition: isDragging ? 'height 80ms ease-out' : 'height 160ms cubic-bezier(0.22, 1, 0.36, 1)'
                }}
                className={`flex-1 rounded-full transition-colors duration-150 ${
                  isPlayed
                    ? 'bg-gradient-to-t from-[var(--color-accent)] via-rose-400 to-white shadow-[0_0_6px_var(--color-accent)]'
                    : 'bg-white/20 group-hover:bg-white/35'
                }`}
              />
            );
          })}
        </div>

        {/* Track Groove Background & Elastic Fill Bar */}
        <div
          className={`w-full rounded-full bg-white/15 transition-all duration-200 ease-out overflow-visible relative mt-1.5 ${
            isDragging ? 'h-2 bg-white/25' : 'h-1.5 group-hover:h-2'
          }`}
        >
          {/* Ambient Glow Diffusion Layer underneath */}
          <div
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-[var(--color-accent)] via-rose-500 to-purple-500 blur-md ${
              isDragging ? 'h-5 opacity-80' : 'h-3 opacity-45'
            }`}
            style={{
              left: typeof fillLeft === 'number' ? `${fillLeft}px` : fillLeft,
              width: typeof fillWidth === 'number' ? `${fillWidth}px` : fillWidth,
              transition: transitionStyle
            }}
          />

          {/* Active Progress Fill Bar with elastic bounds */}
          <div
            className="relative h-full bg-gradient-to-r from-[var(--color-accent)] via-rose-400 to-white rounded-full"
            style={{
              left: typeof fillLeft === 'number' ? `${fillLeft}px` : fillLeft,
              width: typeof fillWidth === 'number' ? `${fillWidth}px` : fillWidth,
              boxShadow: isDragging ? '0 0 16px 2px var(--color-accent)' : '0 0 10px 1px var(--color-accent)',
              transition: transitionStyle
            }}
          />

          {/* iOS Style Elastic Thumb Head with Specular Halo */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full border border-white/70 bg-white shadow-[0_0_16px_2px_var(--color-accent)] pointer-events-none z-10 transition-transform duration-150 ${
              isDragging ? 'w-4.5 h-4.5 scale-125' : 'w-3 h-3 scale-90 group-hover:scale-120'
            }`}
            style={{
              left: `calc(${percent}% + ${elasticOffset}px)`,
              transition: isDragging
                ? 'transform 150ms ease-out'
                : isSnapping
                ? 'left 350ms cubic-bezier(0.34, 1.56, 0.64, 1), transform 150ms ease-out'
                : 'left 150ms linear, transform 150ms ease-out'
            }}
          >
            <span className="absolute inset-0.5 rounded-full bg-[var(--color-accent)] opacity-60" />
          </div>
        </div>
      </div>

      {/* Symmetric Time Readout with Tabular Numerals */}
      <div className="flex justify-between -mt-0.5 text-[11px] text-white/55 font-bold tabular-nums">
        <span>{formatTime(activeDisplayTime)}</span>
        <span>-{formatTime(Math.max(0, activeDuration - activeDisplayTime))}</span>
      </div>
    </div>
  );
});

WaveformScrubber.displayName = 'WaveformScrubber';
export default WaveformScrubber;
