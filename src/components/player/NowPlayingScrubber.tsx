import React, { useState, useRef, memo } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { useJamStore } from '../../stores/jamStore';
import { formatTime } from '../../utils/formatTime';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

export interface NowPlayingScrubberProps {
  fallbackDuration: number;
}

export const NowPlayingScrubber = memo(({ fallbackDuration }: NowPlayingScrubberProps) => {
  const isJamGuest = useJamStore((s) => Boolean(s.roomCode && !s.isHost));
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

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : Number.isFinite(fallbackDuration) && fallbackDuration > 0 ? fallbackDuration : 210;
  const safeCurrentTime = Number.isFinite(currentTime) && currentTime >= 0 ? currentTime : 0;
  const activeDuration = safeDuration;
  const playbackRatio = Math.min(1, Math.max(0, safeCurrentTime / activeDuration));
  const activeRatio = isDragging ? dragRatio : playbackRatio;
  const activeDisplayTime = isDragging ? dragRatio * activeDuration : safeCurrentTime;

  const calculateRatioAndOffset = (clientX: number) => {
    if (!trackRef.current) return { ratio: 0, offset: 0 };
    const rect = trackRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const width = rect.width;

    if (x < 0) {
      const pull = -x;
      const resisted = -Math.min(32, Math.pow(pull, 0.68) * 1.5);
      return { ratio: 0, offset: resisted };
    } else if (x > width) {
      const pull = x - width;
      const resisted = Math.min(32, Math.pow(pull, 0.68) * 1.5);
      return { ratio: 1, offset: resisted };
    } else {
      return { ratio: Math.max(0, Math.min(1, x / width)), offset: 0 };
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isJamGuest) return;
    e.stopPropagation();
    e.nativeEvent?.stopImmediatePropagation?.();
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
      if (rect.width > 0) {
        setHoverTime((x / rect.width) * activeDuration);
      }
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

  return (
    <div className="w-full mt-4 select-none touch-none">
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseLeave={() => setHoverTime(null)}
        className={`relative ${isJamGuest ? 'pointer-events-none' : 'cursor-pointer'} py-3.5 -my-1.5 group flex items-center touch-none select-none`}
      >
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
            className="pointer-events-none absolute -top-1 px-2.5 py-1 rounded-lg liquid-glass glass-heavy border-0 text-[11px] font-extrabold tabular-nums text-white shadow-xl will-change-transform z-30 flex items-center gap-1"
          >
            <span>{formatTime(isDragging ? activeDisplayTime : (hoverTime || 0))}</span>
          </div>
        )}

        <div
          className={`w-full rounded-full bg-white/15 transition-all duration-200 ease-out overflow-visible relative ${
            isDragging ? 'h-2.5 bg-white/20' : 'h-1.5 group-hover:h-2'
          }`}
        >
          <div
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-[var(--color-accent)] via-rose-500 to-purple-500 blur-md ${
              isDragging ? 'h-5 opacity-75' : 'h-3 opacity-45'
            }`}
            style={{
              left: typeof fillLeft === 'number' ? `${fillLeft}px` : fillLeft,
              width: typeof fillWidth === 'number' ? `${fillWidth}px` : fillWidth,
              transition: transitionStyle
            }}
          />

          <div
            className="relative h-full bg-gradient-to-r from-[var(--color-accent)] via-rose-400 to-white rounded-full"
            style={{
              left: typeof fillLeft === 'number' ? `${fillLeft}px` : fillLeft,
              width: typeof fillWidth === 'number' ? `${fillWidth}px` : fillWidth,
              boxShadow: isDragging ? '0 0 16px 2px var(--color-accent)' : '0 0 10px 1px var(--color-accent)',
              transition: transitionStyle
            }}
          />

          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white shadow-[0_0_12px_2px_var(--color-accent)] pointer-events-none z-10 transition-transform duration-150 ${
              isDragging
                ? 'w-4 h-4 scale-125 opacity-100'
                : 'w-3 h-3 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100'
            }`}
            style={{
              left: `calc(${percent}% + ${elasticOffset}px)`,
              transition: isDragging
                ? 'transform 150ms ease-out'
                : isSnapping
                ? 'left 350ms cubic-bezier(0.34, 1.56, 0.64, 1), transform 150ms ease-out'
                : 'left 150ms linear, transform 150ms ease-out'
            }}
          />
        </div>
      </div>

      <div className="flex justify-between -mt-1 text-[11px] text-white/55 font-semibold tabular-nums">
        <span>{formatTime(activeDisplayTime)}</span>
        <span>-{formatTime(Math.max(0, activeDuration - activeDisplayTime))}</span>
      </div>
    </div>
  );
});

NowPlayingScrubber.displayName = 'NowPlayingScrubber';
export default NowPlayingScrubber;
