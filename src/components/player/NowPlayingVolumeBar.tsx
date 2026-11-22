import React, { useState, useRef, memo } from 'react';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import { usePlayerStore } from '../../stores/playerStore';

export interface NowPlayingVolumeBarProps {
  volume?: number;
  isMuted?: boolean;
  setVolume?: (val: number) => void;
  toggleMute?: () => void;
}

export const NowPlayingVolumeBar = memo((props: NowPlayingVolumeBarProps) => {
  const storeVolume = usePlayerStore((s) => s.volume);
  const storeIsMuted = usePlayerStore((s) => s.isMuted);
  const storeSetVolume = usePlayerStore((s) => s.setVolume);
  const storeToggleMute = usePlayerStore((s) => s.toggleMute);

  const volume = props.volume !== undefined ? props.volume : storeVolume;
  const isMuted = props.isMuted !== undefined ? props.isMuted : storeIsMuted;
  const setVolume = props.setVolume || storeSetVolume;
  const toggleMute = props.toggleMute || storeToggleMute;

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
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-full liquid-glass border-0 flex-shrink-0">
      <button
        onClick={toggleMute}
        title={isMuted || volume === 0 ? 'Unmute Audio' : 'Mute Audio'}
        className={`w-7 h-7 p-0 rounded-full flex items-center justify-center transition-all cursor-pointer flex-shrink-0 ${
          isMuted || volume === 0
            ? 'glass-button-primary text-rose-300'
            : 'glass-button text-white/85 hover:text-white'
        }`}
      >
        {isMuted || volume === 0 ? (
          <svg className="w-3.5 h-3.5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="22" y1="9" x2="16" y2="15" />
            <line x1="16" y1="9" x2="22" y2="15" />
          </svg>
        ) : volume < 0.4 ? (
          <svg className="w-3.5 h-3.5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        )}
      </button>

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

      <span className="text-[10px] font-bold text-white/55 tabular-nums w-7">
        {pct}%
      </span>
    </div>
  );
});

NowPlayingVolumeBar.displayName = 'NowPlayingVolumeBar';
export default NowPlayingVolumeBar;
