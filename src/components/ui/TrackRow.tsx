import { useState, useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import type { Track } from '../../types';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { playTrackWithSmartQueue } from '../../services/recommendationEngine';
import { useOfflineVault } from '../../services/offlineVault';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';

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
  isLiked: propIsLiked,
  onContextMenu
}: TrackRowProps) => {
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

  return (
    <div
      onClick={handleTriggerPlay}
      onContextMenu={(e) => onContextMenu?.(e, track)}
      className={`group relative flex items-center gap-4 px-3.5 py-2.5 rounded-2xl transition-all duration-200 ease-out hover:translate-x-1 active:scale-[0.992] cursor-pointer select-none border ${
        isCurrentTrack
          ? 'bg-white/[0.12] border-white/20 shadow-[0_8px_28px_rgba(0,0,0,0.38)]'
          : 'bg-white/[0.02] border-transparent hover:bg-white/[0.07] hover:border-white/10'
      }`}
    >
      {isCurrentTrack && (
        <span className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-[var(--color-accent)] shadow-[0_0_12px_var(--color-accent)]" />
      )}
      {/* Index or Equalizer */}
      {showIndex && (
        <div className="w-7 flex justify-center items-center text-sm text-white/50 font-medium flex-shrink-0">
          {isTrackPlaying ? (
            <EqualizerIcon />
          ) : (
            <>
              <span className={`group-hover:hidden ${isCurrentTrack ? 'text-[var(--color-accent)] font-bold' : ''}`}>
                {index !== undefined ? index : '•'}
              </span>
              <span className="hidden group-hover:flex items-center justify-center text-white">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </>
          )}
        </div>
      )}

      {/* Album Art */}
      {showAlbumArt && (
        <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/10 shadow-md">
          <img
            src={track.thumbnail || track.thumbnailUrl || DEFAULT_THUMBNAIL}
            alt={track.title}
            loading="lazy"
            decoding="async"
            onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex justify-center items-center transition-opacity">
            <svg className="w-5 h-5 text-white fill-current drop-shadow" viewBox="0 0 24 24">
              {isTrackPlaying ? (
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              ) : (
                <path d="M8 5v14l11-7z" />
              )}
            </svg>
          </div>
        </div>
      )}

      {/* Track Info */}
      <div className="flex-grow flex flex-col min-w-0 pr-2">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-semibold truncate ${
              isCurrentTrack ? 'text-[var(--color-accent)]' : 'text-white'
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
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleOfflineTrack(track);
          }}
          title={trackIsOffline ? 'Saved in Offline Vault (Click to Remove)' : 'Save 320kbps Audio to Offline Vault'}
          className={`p-2 rounded-full transition-all cursor-pointer ${
            trackIsOffline
              ? 'text-emerald-400 opacity-100 bg-emerald-500/15'
              : isSavingOffline
                ? 'text-amber-300 opacity-100 animate-pulse'
                : 'text-white/40 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-white/10'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
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
          className={`p-2 rounded-full transition-all ${
            liked
              ? 'text-[var(--color-accent)] opacity-100 scale-105'
              : 'text-white/40 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-white/10'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>

        <button
          onClick={handleQueue}
          title="Add to Queue"
          className="p-2 rounded-full text-white/40 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-white/10 transition-all"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {playlists.length > 0 && (
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              ref={menuBtnRef}
              onClick={handleToggleMenu}
              title="Add to Playlist"
              className="p-2 rounded-full text-white/40 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-white/10 transition-all"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                  {playlists.map((pl) => (
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
      </div>

      {/* Duration */}
      <div className="text-xs font-medium text-white/45 w-11 text-right tabular-nums flex-shrink-0">
        {formatDuration(track.duration)}
      </div>
    </div>
  );
});

TrackRow.displayName = 'TrackRow';

export default TrackRow;
