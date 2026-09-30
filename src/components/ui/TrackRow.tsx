import { useState, useRef, useEffect, useId, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import type { Track } from '../../types';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { playTrackWithSmartQueue } from '../../services/recommendationEngine';
import { useOfflineVault } from '../../services/offlineVault';
import {
  useChorusPreview,
  toggleChorusPreview,
  stopChorusPreview
} from '../../services/chorusPreview';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';
import { useDevicePreset } from '../../hooks/useDevicePreset';

// Shared module-level hover coordinator so moving the cursor from one TrackRow
// to another TrackRow bridges the 6px row gap and smoothly glides a single
// 120fps spring highlight pill from track to track.
let activeHoveredRowId: string | null = null;
let hoverLeaveTimer: ReturnType<typeof setTimeout> | null = null;
const hoverListeners = new Set<() => void>();

function setSharedHoveredRow(id: string | null) {
  if (activeHoveredRowId === id) return;
  activeHoveredRowId = id;
  hoverListeners.forEach((fn) => fn());
}

function useSharedTrackHover(rowId: string): {
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
} {
  const [isHovered, setIsHovered] = useState(() => activeHoveredRowId === rowId);

  useEffect(() => {
    const sync = () => {
      const next = activeHoveredRowId === rowId;
      setIsHovered((prev) => (prev !== next ? next : prev));
    };
    hoverListeners.add(sync);
    return () => {
      hoverListeners.delete(sync);
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
  onContextMenu?: (e: React.MouseEvent, track: Track) => void;
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
  onAddToQueue,
  onToggleLike,
  onRemove,
  isLiked: propIsLiked,
  onContextMenu
}: TrackRowProps) => {
  const rowId = useId();
  const { isPhone } = useDevicePreset();
  const { isHovered, onMouseEnter, onMouseLeave } = useSharedTrackHover(rowId);
  const { isPreviewing, isLoading: isPreviewLoading, remainingSec } = useChorusPreview(track.id);

  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0 });
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuPopupRef = useRef<HTMLDivElement>(null);

  const isCurrentTrack = usePlayerStore((s) =>
    propIsActive !== undefined ? propIsActive : s.currentTrack?.id === track.id
  );
  const isTrackPlaying = usePlayerStore((s) =>
    propIsPlaying !== undefined ? propIsPlaying : s.currentTrack?.id === track.id && s.isPlaying
  );
  const liked = useLibraryStore((s) =>
    propIsLiked !== undefined ? propIsLiked : s.likedSongs.some((item) => item.id === track.id)
  );
  const playlists = useLibraryStore((s) => s.playlists);
  const { isOffline, savingIds, toggleOfflineTrack } = useOfflineVault();
  const trackIsOffline = isOffline(track.id);
  const isSavingOffline = Boolean(savingIds[track.id]);

  useEffect(() => {
    if (!showPlaylistMenu) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuBtnRef.current &&
        !menuBtnRef.current.contains(target) &&
        menuPopupRef.current &&
        !menuPopupRef.current.contains(target)
      ) {
        setShowPlaylistMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showPlaylistMenu]);

  const handleTriggerPlay = () => {
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
    if (onToggleLike) onToggleLike(track);
    else useLibraryStore.getState().toggleLike(track);
  };

  const handleQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAddToQueue) onAddToQueue(track);
    else usePlayerStore.getState().addToQueue(track);
  };

  const handleToggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!showPlaylistMenu && menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect();
      const top = Math.min(rect.bottom + 6, window.innerHeight - 220);
      const left = Math.max(12, rect.right - 192);
      setMenuCoords({ top, left });
    }
    setShowPlaylistMenu((prev) => !prev);
  };

  const activeVisual = isHovered && !isPhone;

  return (
    <div
      onClick={handleTriggerPlay}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onContextMenu={(e) => onContextMenu?.(e, track)}
      className={`relative flex items-center gap-4 px-4 py-2.5 rounded-2xl cursor-pointer select-none border transition-colors duration-200 ${
        isCurrentTrack
          ? 'bg-white/[0.10] border-white/20 shadow-[0_8px_24px_rgba(0,0,0,0.3)]'
          : 'bg-white/[0.015] border-transparent'
      }`}
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

      {/* Index or Equalizer */}
      {showIndex && (
        <div className="relative z-10 w-7 flex justify-center items-center text-sm text-white/50 font-medium flex-shrink-0">
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
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Album Art */}
      {showAlbumArt && (
        <div className="relative z-10 w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/10 shadow-md">
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
          <div
            className={`absolute inset-0 bg-black/40 flex justify-center items-center transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              activeVisual ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div
              className={`w-7 h-7 rounded-full bg-[var(--color-accent)]/95 text-white flex items-center justify-center shadow-md transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                activeVisual ? 'scale-100' : 'scale-75'
              }`}
            >
              <svg className="w-3.5 h-3.5 fill-current ml-0.5" viewBox="0 0 24 24">
                {isTrackPlaying ? (
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                ) : (
                  <path d="M8 5v14l11-7z" />
                )}
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Track Info */}
      <div
        className={`relative z-10 flex-grow flex flex-col min-w-0 pr-2 transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          activeVisual ? 'translate-x-1' : 'translate-x-0'
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-semibold truncate transition-colors duration-200 ${
              isCurrentTrack || activeVisual ? 'text-[var(--color-accent)]' : 'text-white'
            }`}
          >
            {track.title}
          </span>
          {trackIsOffline ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex-shrink-0">
              ⚡ OFFLINE
            </span>
          ) : (
            track.audioUrl && (
              <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase bg-white/10 text-white/70 border border-white/10 flex-shrink-0">
                320k HD
              </span>
            )
          )}
        </div>
        <span className="text-xs text-white/55 truncate mt-0.5">
          {track.artist} {track.album && track.album !== 'Single' ? `• ${track.album}` : ''}
        </span>
      </div>

      {/* Actions */}
      <div className="relative z-10 flex items-center gap-1.5 flex-shrink-0">
        {/* 15s Smart Chorus Audio Preview Button — fixed single-line Liquid Glass pill */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleChorusPreview(track);
          }}
          title={
            isPreviewing
              ? 'Stop 15s Chorus Preview'
              : 'Preview 15s Chorus Drop (without losing your current queue)'
          }
          className={`px-2.5 h-8 rounded-full text-[10px] font-extrabold whitespace-nowrap flex-shrink-0 transition-[opacity,transform,color,background,border-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer inline-flex items-center justify-center gap-1 ${
            isPreviewing
              ? 'glass-button-primary text-white opacity-100'
              : isPhone
              ? 'glass-button text-white/75 opacity-100'
              : activeVisual
              ? 'glass-button text-white/85 opacity-100 translate-x-0 hover:text-white'
              : 'glass-button text-white/40 opacity-0 translate-x-1 pointer-events-none'
          }`}
        >
          {isPreviewLoading ? (
            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <span>{isPreviewing ? `⏹ ${remainingSec}s` : '⚡ 15s'}</span>
          )}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleOfflineTrack(track);
          }}
          title={trackIsOffline ? 'Saved in Offline Vault (Click to Remove)' : 'Save 320kbps Audio to Offline Vault'}
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-[opacity,transform,color,background,border-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer ${
            trackIsOffline
              ? 'glass-button-emerald text-emerald-300 opacity-100'
              : isSavingOffline
              ? 'glass-button text-amber-300 opacity-100 animate-pulse'
              : isPhone
              ? 'glass-button text-white/60 opacity-100'
              : activeVisual
              ? 'glass-button text-white/75 opacity-100 translate-x-0 hover:text-white'
              : 'glass-button text-white/40 opacity-0 translate-x-1 pointer-events-none'
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            {trackIsOffline ? (
              <polyline points="20 6 9 17 4 12" />
            ) : (
              <>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </>
            )}
          </svg>
        </button>

        <button
          onClick={handleLike}
          title={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-[opacity,transform,color,background,border-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer ${
            liked
              ? 'glass-button-primary text-[var(--color-accent)] opacity-100'
              : isPhone
              ? 'glass-button text-white/60 opacity-100'
              : activeVisual
              ? 'glass-button text-white/75 opacity-100 translate-x-0 hover:text-white'
              : 'glass-button text-white/40 opacity-0 translate-x-1 pointer-events-none'
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>

        {!isPhone && (
          <button
            onClick={handleQueue}
            title="Add to Queue"
            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-[opacity,transform,color,background,border-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer ${
              activeVisual
                ? 'glass-button text-white/75 opacity-100 translate-x-0 hover:text-white'
                : 'glass-button text-white/40 opacity-0 translate-x-1 pointer-events-none'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}

        {playlists.length > 0 && (
          <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              ref={menuBtnRef}
              onClick={handleToggleMenu}
              title="Add to Playlist"
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-[opacity,transform,color,background,border-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer ${
                isPhone
                  ? 'glass-button text-white/60 opacity-100'
                  : activeVisual || showPlaylistMenu
                  ? 'glass-button text-white/75 opacity-100 translate-x-0 hover:text-white'
                  : 'glass-button text-white/40 opacity-0 translate-x-1 pointer-events-none'
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
            </button>
            {showPlaylistMenu &&
              typeof document !== 'undefined' &&
              createPortal(
                <div
                  ref={menuPopupRef}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'fixed',
                    top: menuCoords.top,
                    left: menuCoords.left,
                    zIndex: 9999
                  }}
                  className="w-48 glass-heavy rounded-2xl p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.9)] border border-white/25"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-white/45 px-2.5 py-1">
                    Add to Playlist
                  </div>
                  {playlists.map((pl: any) => (
                    <button
                      key={pl.id}
                      onClick={() => {
                        useLibraryStore.getState().addToPlaylist(pl.id, track);
                        setShowPlaylistMenu(false);
                      }}
                      className="w-full text-left px-2.5 py-2 text-xs font-medium text-white/85 hover:text-white hover:bg-white/12 rounded-xl truncate cursor-pointer"
                    >
                      {pl.name}
                    </button>
                  ))}
                </div>,
                document.body
              )}
          </div>
        )}

        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(track);
            }}
            title="Remove from playlist"
            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-[opacity,transform,color,background,border-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer ${
              isPhone
                ? 'glass-button text-white/60 opacity-100'
                : activeVisual
                ? 'glass-button text-white/75 opacity-100 translate-x-0 hover:text-rose-300'
                : 'glass-button text-white/40 opacity-0 translate-x-1 pointer-events-none'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Duration */}
      <div className="relative z-10 text-xs font-medium text-white/45 w-11 text-right tabular-nums flex-shrink-0">
        {formatDuration(track.duration)}
      </div>
    </div>
  );
});

TrackRow.displayName = 'TrackRow';

export default TrackRow;
