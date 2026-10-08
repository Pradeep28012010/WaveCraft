import { useState, useRef, useEffect, useId, memo } from 'react';
import { motion } from 'framer-motion';
import type { Track } from '../../types';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { playTrackWithSmartQueue } from '../../services/recommendationEngine';
import { useTrackOfflineStatus } from '../../services/offlineVault';
import { stopChorusPreview } from '../../services/chorusPreview';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';
import { useDevicePreset } from '../../hooks/useDevicePreset';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

// Shared module-level hover coordinator so moving the cursor from one TrackRow
// to another TrackRow bridges the 6px row gap and smoothly glides a single
// 120fps spring highlight pill from track to track with O(1) listener notifications.
let activeHoveredRowId: string | null = null;
let hoverLeaveTimer: ReturnType<typeof setTimeout> | null = null;
const hoverListeners = new Map<string, (hovered: boolean) => void>();

function setSharedHoveredRow(id: string | null) {
  if (activeHoveredRowId === id) return;
  const prevId = activeHoveredRowId;
  activeHoveredRowId = id;
  if (prevId) {
    hoverListeners.get(prevId)?.(false);
  }
  if (id) {
    hoverListeners.get(id)?.(true);
  }
}

function useSharedTrackHover(rowId: string): {
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
} {
  const [isHovered, setIsHovered] = useState(() => activeHoveredRowId === rowId);

  useEffect(() => {
    hoverListeners.set(rowId, setIsHovered);
    return () => {
      hoverListeners.delete(rowId);
      if (activeHoveredRowId === rowId) {
        activeHoveredRowId = null;
      }
    };
  }, [rowId]);

  const onMouseEnter = () => {
    if (hoverLeaveTimer) {
      clearTimeout(hoverLeaveTimer);
      hoverLeaveTimer = null;
    }
    setSharedHoveredRow(rowId);
  };

  const onMouseLeave = () => {
    if (hoverLeaveTimer) clearTimeout(hoverLeaveTimer);
    // 70ms bridge across the 6px gap between adjacent track rows so the
    // shared layoutId pill glides directly from row A -> row B without blinking
    hoverLeaveTimer = setTimeout(() => {
      if (activeHoveredRowId === rowId) {
        setSharedHoveredRow(null);
      }
    }, 70);
  };

  return { isHovered, onMouseEnter, onMouseLeave };
}

export function evaluateRowDrag(offsetX: number, velocityX: number): 'open' | 'close' {
  if (offsetX < -45 || velocityX < -280) {
    return 'open';
  } else if (offsetX > 30 || velocityX > 200) {
    return 'close';
  }
  return 'close';
}

export function getPlaylistOptions(playlists?: Array<{ id: string; name: string }>) {
  if (!playlists || playlists.length === 0) {
    return [{ id: 'new', label: '+ Create Playlist & Add' }];
  }
  return playlists.map((p) => ({ id: p.id, label: p.name }));
}

interface TrackRowProps {
  track: Track;
  tracks?: Track[];
  index?: number;
  isPlaying?: boolean;
  isActive?: boolean;
  showAlbumArt?: boolean;
  showIndex?: boolean;
  onPlay?: (track: Track) => void;
  onClick?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  onToggleLike?: (track: Track) => void;
  onRemove?: (track: Track) => void;
  isLiked?: boolean;
  onContextMenu?: (e: React.SyntheticEvent, track: Track) => void;
}

const formatDuration = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '3:30';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const EqualizerIcon = () => (
  <div className="flex items-end gap-[2.5px] h-4 w-4 justify-center">
    <span className="w-[3px] bg-[var(--color-accent)] rounded-full animate-eq-1" />
    <span className="w-[3px] bg-[var(--color-accent)] rounded-full animate-eq-2" />
    <span className="w-[3px] bg-[var(--color-accent)] rounded-full animate-eq-3" />
  </div>
);

const TrackRow = memo(({
  track,
  tracks,
  index,
  isPlaying: propIsPlaying,
  isActive: propIsActive,
  showAlbumArt = true,
  showIndex = true,
  onPlay,
  onClick,
  onAddToQueue: _onAddToQueue,
  onToggleLike,
  onRemove,
  isLiked: propIsLiked,
  onContextMenu
}: TrackRowProps) => {
  const rowId = useId();
  const { isPhone } = useDevicePreset();
  const { isHovered, onMouseEnter, onMouseLeave } = useSharedTrackHover(rowId);

  const isCurrentTrack = usePlayerStore((s) =>
    propIsActive !== undefined ? propIsActive : s.currentTrack?.id === track.id
  );
  const isTrackPlaying = usePlayerStore((s) =>
    propIsPlaying !== undefined ? propIsPlaying : s.currentTrack?.id === track.id && s.isPlaying
  );
  const liked = useLibraryStore((s) =>
    propIsLiked !== undefined ? propIsLiked : Boolean(s.likedIds[track.id])
  );
  const { trackIsOffline } = useTrackOfflineStatus(track.id);

  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current);
        touchTimerRef.current = null;
      }
    };
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isPhone) return;
    const touch = e.touches[0];
    const clientX = touch.clientX;
    const clientY = touch.clientY;
    touchTimerRef.current = setTimeout(() => {
      triggerAndroidHaptic('medium');
      if (onContextMenu) {
        onContextMenu(e, track);
      } else {
        useContextMenuStore.getState().openTrackMenu(
          { clientX, clientY },
          track,
          tracks,
          onRemove ? () => onRemove(track) : undefined
        );
      }
    }, 450);
  };

  const handleTouchEnd = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  const handleTriggerPlay = () => {
    triggerAndroidHaptic('light');
    stopChorusPreview(false);
    const player = usePlayerStore.getState();
    if (isCurrentTrack) {
      player.togglePlay();
      return;
    }
    if (onPlay) {
      onPlay(track);
    } else if (onClick) {
      onClick(track);
    } else if (tracks && tracks.length > 1) {
      const idx = tracks.findIndex((t) => t.id === track.id);
      player.playTrack(track, tracks, idx >= 0 ? idx : 0);
    } else {
      playTrackWithSmartQueue(track);
    }
  };

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerAndroidHaptic('light');
    if (onToggleLike) onToggleLike(track);
    else useLibraryStore.getState().toggleLike(track);
  };

  const handleOpenMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerAndroidHaptic('light');
    if (onContextMenu) {
      onContextMenu(e, track);
    } else {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      useContextMenuStore.getState().openTrackMenu(
        { clientX: rect.left, clientY: rect.bottom + 4 },
        track,
        tracks,
        onRemove ? () => onRemove(track) : undefined
      );
    }
  };

  const handleContextMenu = (e: React.SyntheticEvent) => {
    if ((e as React.MouseEvent).shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    triggerAndroidHaptic('medium');
    if (onContextMenu) {
      onContextMenu(e, track);
    } else {
      const mouseEvent = e as React.MouseEvent;
      const clientX = mouseEvent.clientX ?? 100;
      const clientY = mouseEvent.clientY ?? 100;
      useContextMenuStore.getState().openTrackMenu(
        { clientX, clientY },
        track,
        tracks,
        onRemove ? () => onRemove(track) : undefined
      );
    }
  };

  const activeVisual = isHovered && !isPhone;

  return (
    <div
      className="relative rounded-2xl group/row select-none"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Shared 120fps Spring-Gliding Hover Backdrop Pill */}
      {activeVisual && (
        <motion.div
          layoutId="wavecraft-track-row-hover-pill"
          transition={{
            type: 'spring',
            stiffness: 460,
            damping: 36,
            mass: 0.48
          }}
          className="absolute inset-0 rounded-2xl bg-gradient-to-r from-white/[0.09] via-white/[0.06] to-white/[0.03] border border-white/[0.15] pointer-events-none z-0"
        >
          <span className="absolute left-1.5 top-3 bottom-3 w-1 rounded-full bg-[var(--color-accent)] shadow-[0_0_10px_var(--color-accent)]" />
        </motion.div>
      )}

      {/* Persistent Left Accent Pill for Currently Playing Track (when not hovered) */}
      {isCurrentTrack && !activeVisual && (
        <span className="absolute left-1.5 top-3 bottom-3 w-1 rounded-full bg-[var(--color-accent)] shadow-[0_0_10px_var(--color-accent)] pointer-events-none z-10" />
      )}

      {/* Single, Unified Track Row Surface */}
      <div
        onClick={handleTriggerPlay}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onContextMenu={handleContextMenu}
        className={`relative flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl cursor-pointer select-none border transition-colors duration-200 z-10 ${
          isCurrentTrack
            ? 'bg-white/[0.10] border-white/20 shadow-[0_8px_24px_rgba(0,0,0,0.3)]'
            : 'bg-[#0a0a10]/95 sm:bg-white/[0.015] hover:bg-white/[0.04] border-transparent'
        }`}
      >
        {/* Left: Index / Equalizer / Play on Hover */}
        {showIndex && (
          <div className="relative z-10 w-6 sm:w-7 flex justify-center items-center text-sm text-white/50 font-medium flex-shrink-0">
            {isTrackPlaying ? (
              <EqualizerIcon />
            ) : (
              <div className="relative w-5 h-5 flex items-center justify-center">
                <span
                  className={`transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    activeVisual ? 'opacity-0 scale-75' : 'opacity-100 scale-100'
                  } ${isCurrentTrack ? 'text-[var(--color-accent)] font-bold' : ''}`}
                >
                  {index !== undefined ? index : '•'}
                </span>
                <span
                  className={`absolute inset-0 flex items-center justify-center text-white transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    activeVisual ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
                  }`}
                >
                  <svg className="w-4 h-4 fill-current ml-0.5" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Center: Album Art */}
        {showAlbumArt && (
          <div className="relative z-10 w-10 h-10 sm:w-11 sm:h-11 rounded-xl overflow-hidden flex-shrink-0 bg-white/10 shadow-md">
            <img
              src={track.thumbnail || track.thumbnailUrl || DEFAULT_THUMBNAIL}
              alt={track.title}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
              }}
              className={`w-full h-full object-cover transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                activeVisual ? 'scale-[1.06]' : 'scale-100'
              }`}
            />
          </div>
        )}

        {/* Center: Track Title & Artist */}
        <div
          className={`relative z-10 flex-grow flex flex-col min-w-0 pr-2 transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            activeVisual ? 'translate-x-0.5' : 'translate-x-0'
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-semibold truncate transition-colors duration-200 ${
                isCurrentTrack
                  ? 'text-[var(--color-accent)] font-bold'
                  : activeVisual
                  ? 'text-white'
                  : 'text-white/90'
              }`}
            >
              {track.title}
            </span>
            {trackIsOffline && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 whitespace-nowrap flex-shrink-0">
                ⚡ OFFLINE
              </span>
            )}
          </div>
          <span className="text-xs text-white/55 truncate mt-0.5">
            {track.artist} {track.album && track.album !== 'Single' ? `• ${track.album}` : ''}
          </span>
        </div>

        {/* Right: Clean, consistent controls (Like, Duration, More Actions •••) */}
        <div className="relative z-10 flex items-center gap-2 sm:gap-3 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* 1. Like Button */}
          <button
            type="button"
            onClick={handleLike}
            title={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-75 flex-shrink-0 ${
              liked
                ? 'text-[var(--color-accent)] opacity-100'
                : isPhone
                ? 'text-white/40 opacity-70 hover:opacity-100'
                : activeVisual
                ? 'text-white/40 hover:text-white opacity-100'
                : 'opacity-0 pointer-events-none'
            }`}
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill={liked ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>

          {/* 2. Duration (Fixed width, never overlapped) */}
          <div className="text-xs font-medium text-white/50 w-11 text-right tabular-nums flex-shrink-0 select-none">
            {formatDuration(track.duration)}
          </div>

          {/* 3. More Actions Button ••• (Opens Track Menu / Context Menu) */}
          <button
            type="button"
            onClick={handleOpenMenu}
            title="More actions"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-75 flex-shrink-0 ${
              isPhone
                ? 'text-white/50 hover:text-white'
                : activeVisual
                ? 'text-white/60 hover:text-white opacity-100'
                : 'text-white/35 opacity-60 hover:opacity-100'
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
});

TrackRow.displayName = 'TrackRow';

export default TrackRow;
