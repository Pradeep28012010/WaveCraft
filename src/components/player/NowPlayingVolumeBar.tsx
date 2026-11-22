import React, { useState, useRef, memo } from 'react';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

export interface NowPlayingVolumeBarProps {
  volume: number;
  isMuted: boolean;
  setVolume: (val: number) => void;
  toggleMute: () => void;
}

export const NowPlayingVolumeBar = memo(({
  volume,
  isMuted,
  setVolume,
  toggleMute
}: NowPlayingVolumeBarProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const updateFromPointer = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setVolume(Number(ratio.toFixed(2)));
    if (isMuted && ratio > 0) toggleMute();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.nativeEvent?.stopImmediatePropagation?.();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setIsDragging(true);
    triggerAndroidHaptic('light');
    updateFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      e.stopPropagation();
      e.nativeEvent?.stopImmediatePropagation?.();
      updateFromPointer(e.clientX);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      e.stopPropagation();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      setIsDragging(false);
      triggerAndroidHaptic('medium');
    }
  };

  const safeVolume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;
  const pct = Math.round((isMuted ? 0 : safeVolume) * 100);

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="w-20 sm:w-28 h-6 -my-2 flex items-center cursor-pointer relative group touch-none select-none"
      role="slider"
      aria-label="Volume"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="w-full h-1.5 group-hover:h-2 bg-white/20 rounded-full overflow-hidden transition-all duration-150 relative border border-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)]">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full group-hover:from-[var(--color-accent)] group-hover:to-rose-500 transition-all shadow-[0_0_8px_rgba(59,130,246,0.5)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        className={`absolute w-3 h-3 rounded-full bg-white shadow-md top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none transition-transform duration-100 ${
          isDragging ? 'scale-125 opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        style={{ left: `${pct}%` }}
      />
    </div>
  );
});

NowPlayingVolumeBar.displayName = 'NowPlayingVolumeBar';
export default NowPlayingVolumeBar;
