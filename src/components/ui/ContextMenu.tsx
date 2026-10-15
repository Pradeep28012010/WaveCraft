import { useState, useEffect, useRef, useCallback, useMemo, Component, type ReactNode, type ErrorInfo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useStudioStore } from '../../stores/studioStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { toggleChorusPreview, stopChorusPreview, isChorusPreviewActive } from '../../services/chorusPreview';
import { isTrackOffline, saveTrackOffline, removeTrackOffline } from '../../services/offlineVault';
import { unlockAudioEngine } from '../player/YouTubeEmbed';
import { playTrackWithSmartQueue } from '../../services/recommendationEngine';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';
import { useDevicePreset } from '../../hooks/useDevicePreset';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import { useDownloadStore } from '../../stores/downloadStore';
import type { Playlist } from '../../types';

class ContextMenuErrorBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ContextMenu Error]', error, info);
    this.props.onClose();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

const bloomContainerVariants = {
  initial: {
    opacity: 0,
    scale: 0.94,
    filter: 'blur(12px)'
  },
  animate: {
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.28,
      ease: [0.16, 1, 0.3, 1] as const,
      staggerChildren: 0.02,
      delayChildren: 0.02
    }
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    filter: 'blur(8px)',
    transition: {
      duration: 0.14,
      ease: [0.16, 1, 0.3, 1] as const
    }
  }
};

const viewSlideVariants = {
  initial: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? 16 : -16
  }),
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const }
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? -16 : 16,
    transition: { duration: 0.12, ease: [0.16, 1, 0.3, 1] as const }
  })
};

function ContextMenuInner() {
  const isOpen = useContextMenuStore((s) => s.isOpen);
  const x = useContextMenuStore((s) => s.x);
  const y = useContextMenuStore((s) => s.y);
  const type = useContextMenuStore((s) => s.type);
  const track = useContextMenuStore((s) => s.track);
  const contextTracks = useContextMenuStore((s) => s.tracks);
  const initialView = useContextMenuStore((s) => s.initialView) || 'main';
  const closeMenu = useContextMenuStore((s) => s.closeMenu);
  const onRemove = useContextMenuStore((s) => s.onRemove);
  const { isPhone } = useDevicePreset();

  const menuRef = useRef<HTMLDivElement>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [menuView, setMenuView] = useState<'main' | 'playlist'>('main');
  const [playlistFilter, setPlaylistFilter] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);

  // Player Store selectors
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isShuffled = usePlayerStore((s) => s.isShuffled);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const isMuted = usePlayerStore((s) => s.isMuted);

  // Library Store selectors
  const playlists = useLibraryStore((s) => s.playlists);
  const likedIds = useLibraryStore((s) => s.likedIds);
  const liked = track ? Boolean(likedIds[track.id]) : false;

  // Chorus preview state
  const isPreviewing = isChorusPreviewActive(track?.id);

  // Offline status with local toggle state
  const [offlineOverride, setOfflineOverride] = useState<boolean | null>(null);
  const isOffline =
    offlineOverride !== null
      ? offlineOverride
      : track
      ? isTrackOffline(track.id)
      : false;

  // Reset local state when opened or closed
  useEffect(() => {
    if (isOpen) {
      setMenuView(initialView);
      setPlaylistFilter('');
      setIsCreatingPlaylist(false);
      setNewPlaylistName('');
      setOfflineOverride(null);
      setToastMessage(null);
    } else {
      setMenuView('main');
      setIsCreatingPlaylist(false);
      setToastMessage(null);
    }
  }, [isOpen, initialView]);

  // Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (menuView === 'playlist' && initialView === 'main') {
          setMenuView('main');
        } else {
          closeMenu();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, menuView, initialView, closeMenu]);

  const showToast = useCallback((msg: string, delay = 1000) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
      closeMenu();
    }, delay);
  }, [closeMenu]);

  // Filtered playlists
  const filteredPlaylists = useMemo(() => {
    if (!playlistFilter.trim()) return playlists;
    const q = playlistFilter.toLowerCase();
    return playlists.filter((p) => p.name.toLowerCase().includes(q));
  }, [playlists, playlistFilter]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  // Viewport-safe bounds calculation
  const menuWidth = 260;
  const menuHeight = menuView === 'playlist' ? 400 : (type === 'track' ? 460 : 360);
  const margin = 12;
  const winW = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const winH = typeof window !== 'undefined' ? window.innerHeight : 768;

  const safeX = Math.max(margin, Math.min(x, winW - menuWidth - margin));
  const safeY = Math.max(margin, Math.min(y, winH - menuHeight - margin));

  // --- ACTIONS: TRACK CONTEXT ---
  const isThisTrackPlaying = Boolean(track && currentTrack?.id === track.id && isPlaying);
  const isThisTrackCurrent = Boolean(track && currentTrack?.id === track.id);

  const handlePlayNow = () => {
    if (!track) return;
    stopChorusPreview(false);
    unlockAudioEngine();

    const player = usePlayerStore.getState();
    if (isThisTrackCurrent) {
      player.togglePlay();
    } else if (contextTracks && contextTracks.length > 1) {
      const idx = contextTracks.findIndex((t) => t.id === track.id);
      player.playTrack(track, contextTracks, idx >= 0 ? idx : 0);
    } else {
      playTrackWithSmartQueue(track);
    }
    closeMenu();
  };

  const handlePlayNext = () => {
    if (!track) return;
    usePlayerStore.getState().addNext(track);
    showToast('Queued to play next');
  };

  const handleAddToQueue = () => {
    if (!track) return;
    usePlayerStore.getState().addToQueue(track);
    showToast('Added to queue');
  };

  const handleTogglePreview = () => {
    if (!track) return;
    if (isPreviewing) {
      stopChorusPreview(true);
      closeMenu();
    } else {
      toggleChorusPreview(track);
      showToast('⚡ 15s Chorus preview started');
    }
  };

  const handleToggleLike = () => {
    if (!track) return;
    useLibraryStore.getState().toggleLike(track);
    showToast(liked ? 'Removed from Liked Songs' : 'Saved to Liked Songs');
  };

  const handleAddToPlaylist = (playlist: Playlist) => {
    if (!track) return;
    triggerAndroidHaptic('light');
    useLibraryStore.getState().addToPlaylist(playlist.id, track);
    showToast(`Added to "${playlist.name}"`, 700);
  };

  const handleCreatePlaylistAndAdd = () => {
    if (!track || !newPlaylistName.trim()) return;
    triggerAndroidHaptic('light');
    const pl = useLibraryStore.getState().createPlaylist(newPlaylistName.trim());
    useLibraryStore.getState().addToPlaylist(pl.id, track);
    setNewPlaylistName('');
    setIsCreatingPlaylist(false);
    showToast(`Created & added to "${pl.name}"`, 700);
  };

  const handleToggleOffline = async () => {
    if (!track) return;
    if (isOffline) {
      removeTrackOffline(track.id);
      setOfflineOverride(false);
      showToast('Removed from Offline Vault');
    } else {
      showToast('Downloading 320kbps offline...');
      const ok = await saveTrackOffline(track);
      if (ok) {
        setOfflineOverride(true);
      }
    }
  };

  const handleViewLyrics = () => {
    if (!track) return;
    const player = usePlayerStore.getState();
    if (!isThisTrackCurrent) {
      unlockAudioEngine();
      playTrackWithSmartQueue(track);
    }
    useSettingsStore.getState().setShowLyrics(true);
    player.setIsNowPlayingOpen(true);
    closeMenu();
  };

  const handleOpenStudio = () => {
    useStudioStore.getState().setStudioModalOpen(true);
    closeMenu();
  };

  const handleShare = async () => {
    if (!track) return;
    const shareText = `🎵 Listen to "${track.title}" by ${track.artist} on WaveCraft`;
    const shareUrl = `${window.location.origin}/?track=${encodeURIComponent(track.title)}`;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        showToast('Link copied to clipboard!');
      }
    } catch {
      showToast('Unable to copy link');
    }
  };

  // --- ACTIONS: PAGE CONTEXT ---
  const handleTogglePlay = () => {
    unlockAudioEngine();
    usePlayerStore.getState().togglePlay();
    closeMenu();
  };

  const handleNextTrack = () => {
    usePlayerStore.getState().nextTrack();
    closeMenu();
  };

  const handlePrevTrack = () => {
    usePlayerStore.getState().prevTrack();
    closeMenu();
  };

  const handleToggleShuffle = () => {
    usePlayerStore.getState().toggleShuffle();
    showToast(isShuffled ? 'Shuffle turned OFF' : 'Shuffle turned ON');
  };

  const handleCycleRepeat = () => {
    usePlayerStore.getState().cycleRepeat();
    const nextMode = repeatMode === 'off' ? 'Repeat All' : repeatMode === 'all' ? 'Repeat One' : 'Repeat Off';
    showToast(nextMode);
  };

  const handleOpenCommandPalette = () => {
    useStudioStore.getState().setCommandPaletteOpen(true);
    closeMenu();
  };

  const handleToggleMute = () => {
    usePlayerStore.getState().toggleMute();
    showToast(isMuted ? 'Audio Unmuted' : 'Audio Muted');
  };

  // ---------------------------------------------------------------------------
  // PLAYLIST PICKER SUB-VIEW CONTENT (Shared by both Mobile & Desktop)
  // ---------------------------------------------------------------------------
  const renderPlaylistPicker = () => (
    <div className="flex flex-col gap-2">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-1 border-b border-white/10 px-1">
        <button
          type="button"
          onClick={() => setMenuView('main')}
          className="flex items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-white transition-colors cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Back</span>
        </button>

        <span className="text-xs font-bold text-white tracking-wide">Add to Playlist</span>

        <button
          type="button"
          onClick={() => setIsCreatingPlaylist((prev) => !prev)}
          className="text-xs font-bold text-[var(--color-accent)] hover:text-white px-2 py-0.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
        >
          {isCreatingPlaylist ? 'Cancel' : '+ New'}
        </button>
      </div>

      {/* Inline Create New Playlist Input */}
      {isCreatingPlaylist && (
        <div className="p-2 rounded-xl bg-white/[0.08] border border-white/15 flex flex-col gap-2">
          <input
            type="text"
            autoFocus
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreatePlaylistAndAdd();
              if (e.key === 'Escape') setIsCreatingPlaylist(false);
            }}
            placeholder="New playlist name..."
            className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/20 text-white text-xs outline-none focus:border-[var(--color-accent)] placeholder:text-white/40"
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setIsCreatingPlaylist(false)}
              className="px-2.5 py-1 rounded-lg text-[11px] text-white/60 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreatePlaylistAndAdd}
              className="px-3 py-1 rounded-lg bg-[var(--color-accent)] text-white text-[11px] font-bold shadow-sm cursor-pointer hover:brightness-110 active:scale-95 transition-all"
            >
              Create & Add
            </button>
          </div>
        </div>
      )}

      {/* Playlist Search / Filter (if > 3 playlists) */}
      {playlists.length > 3 && (
        <div className="relative px-0.5">
          <input
            type="text"
            value={playlistFilter}
            onChange={(e) => setPlaylistFilter(e.target.value)}
            placeholder="Search playlists..."
            className="w-full px-2.5 py-1.5 pl-7 rounded-xl bg-white/[0.06] border border-white/10 text-white text-xs outline-none focus:border-[var(--color-accent)] placeholder:text-white/40"
          />
          <svg className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-white/40 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
      )}

      {/* Playlists List */}
      <div className="max-h-[240px] overflow-y-auto no-scrollbar flex flex-col gap-1 pr-0.5">
        {filteredPlaylists.length > 0 ? (
          filteredPlaylists.map((pl) => {
            const alreadyHasTrack = Boolean(track && Array.isArray(pl.tracks) && pl.tracks.some((t) => t.id === track.id));
            return (
              <button
                key={pl.id}
                type="button"
                onClick={() => handleAddToPlaylist(pl)}
                className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-white/[0.12] active:bg-white/[0.18] transition-all text-left cursor-pointer group"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/10 border border-white/10 flex-shrink-0 flex items-center justify-center">
                    {pl.coverUrl ? (
                      <img src={pl.coverUrl} alt={pl.name} className="w-full h-full object-cover" />
                    ) : (
                      <svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="8" y1="6" x2="21" y2="6" />
                        <line x1="8" y1="12" x2="21" y2="12" />
                        <line x1="8" y1="18" x2="16" y2="18" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white group-hover:text-[var(--color-accent)] truncate">
                      {pl.name}
                    </p>
                    <p className="text-[10px] text-white/50 tabular-nums">
                      {pl.tracks?.length || 0} songs
                    </p>
                  </div>
                </div>

                {alreadyHasTrack ? (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full flex-shrink-0">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Added</span>
                  </span>
                ) : (
                  <span className="text-xs text-white/30 group-hover:text-white/80 transition-colors flex-shrink-0">
                    + Add
                  </span>
                )}
              </button>
            );
          })
        ) : (
          <div className="text-center py-6 px-3 flex flex-col items-center gap-2">
            <span className="text-2xl opacity-40">📂</span>
            <p className="text-xs text-white/50">
              {playlistFilter ? 'No matching playlists found' : 'No playlists yet'}
            </p>
            {!isCreatingPlaylist && (
              <button
                type="button"
                onClick={() => setIsCreatingPlaylist(true)}
                className="mt-1 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors"
              >
                + Create Playlist
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // MOBILE BOTTOM SHEET RENDERING
  // ---------------------------------------------------------------------------
  if (isPhone) {
    return createPortal(
      <div
        className="fixed inset-0 z-[99999] select-none flex flex-col justify-end"
        onClick={closeMenu}
        onContextMenu={(e) => {
          e.preventDefault();
          closeMenu();
        }}
      >
        {/* Semi-transparent blur backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Fluid Bottom Sheet */}
        <motion.div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          style={{
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 24px)'
          }}
          className="relative z-10 w-full max-h-[85vh] overflow-y-auto no-scrollbar rounded-t-[32px] border-t border-white/20 glass-heavy liquid-glass shadow-[0_-20px_60px_rgba(0,0,0,0.95)] px-4 pt-3 flex flex-col text-white"
        >
          {/* Top Sheet Drag Pill */}
          <div className="w-12 h-1.5 rounded-full bg-white/25 mx-auto mb-3 flex-shrink-0" />

          {/* Action Confirmation Toast Feedback */}
          {toastMessage && (
            <div className="px-4 py-2.5 mb-3 rounded-2xl bg-[var(--color-accent)]/25 border border-[var(--color-accent)]/45 text-xs font-extrabold text-white text-center animate-pulse shadow-lg">
              ✓ {toastMessage}
            </div>
          )}

          {/* PLAYLIST PICKER VIEW ON MOBILE */}
          {menuView === 'playlist' ? (
            <div className="py-2">
              {renderPlaylistPicker()}
            </div>
          ) : (
            /* MAIN ACTIONS VIEW ON MOBILE */
            <>
              {type === 'track' && track && (
                <>
                  {/* Track Mini Card Header */}
                  <div className="flex items-center gap-3.5 p-3 mb-2 rounded-2xl bg-white/[0.08] border border-white/15">
                    <img
                      src={track.thumbnail || track.thumbnailUrl || DEFAULT_THUMBNAIL}
                      alt={track.title}
                      className="w-12 h-12 rounded-xl object-cover flex-shrink-0 shadow-md border border-white/10"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold text-sm text-white truncate leading-tight">
                        {track.title}
                      </p>
                      <p className="text-xs text-white/60 truncate leading-tight mt-1">
                        {track.artist}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 pb-2">
                    {/* 1. Play / Pause */}
                    <button
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        handlePlayNow();
                      }}
                      className="flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/30 flex items-center justify-center text-[var(--color-accent)]">
                        {isThisTrackPlaying ? (
                          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                            <rect x="6" y="4" width="4" height="16" rx="1" />
                            <rect x="14" y="4" width="4" height="16" rx="1" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-sm text-white">
                          {isThisTrackPlaying ? 'Pause Playback' : isThisTrackCurrent ? 'Resume Playback' : 'Play Now'}
                        </p>
                      </div>
                    </button>

                    {/* 2. Play Next */}
                    <button
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        handlePlayNext();
                      }}
                      className="flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/80">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M5 4l10 8-10 8V4z" />
                          <line x1="19" y1="5" x2="19" y2="19" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-sm text-white">Play Next in Queue</p>
                      </div>
                    </button>

                    {/* 3. Add to Queue */}
                    <button
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        handleAddToQueue();
                      }}
                      className="flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/80">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-sm text-white">Add to End of Queue</p>
                      </div>
                    </button>

                    {/* 4. Like / Favorite */}
                    <button
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        handleToggleLike();
                      }}
                      className="flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center text-rose-400">
                        {liked ? (
                          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-sm text-white">{liked ? 'Liked Song' : 'Save to Liked Songs'}</p>
                      </div>
                    </button>

                    {/* 5. Add to Playlist (Transitions to Playlist view) */}
                    <button
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        setMenuView('playlist');
                      }}
                      className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-300">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="8" y1="6" x2="21" y2="6" />
                            <line x1="8" y1="12" x2="21" y2="12" />
                            <line x1="8" y1="18" x2="16" y2="18" />
                            <line x1="3" y1="6" x2="3.01" y2="6" />
                            <line x1="3" y1="12" x2="3.01" y2="12" />
                            <line x1="3" y1="18" x2="3.01" y2="18" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-bold text-sm text-white">Add to Playlist</p>
                          <p className="text-[11px] text-white/50">{playlists.length} playlists</p>
                        </div>
                      </div>
                      <svg className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>

                    {/* 6. 15s Chorus Preview */}
                    <button
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        handleTogglePreview();
                      }}
                      className="flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center font-bold text-sm">
                        ⚡
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-sm text-white">
                          {isPreviewing ? 'Stop 15s Chorus Drop' : '15s Chorus Drop Preview'}
                        </p>
                      </div>
                    </button>

                    {/* 7. Download / Offline Vault */}
                    <button
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        handleToggleOffline();
                      }}
                      className="flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-sm text-white">
                          {isOffline ? 'Remove from Offline Vault' : 'Download to Offline Vault'}
                        </p>
                      </div>
                    </button>

                    {/* 8. Synced Lyrics */}
                    <button
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        handleViewLyrics();
                      }}
                      className="flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-sm text-white">View Synchronized Lyrics</p>
                      </div>
                    </button>

                    {/* 9. Share */}
                    <button
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        handleShare();
                      }}
                      className="flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-white/10 text-white/80 flex items-center justify-center">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="18" cy="5" r="3" />
                          <circle cx="6" cy="12" r="3" />
                          <circle cx="18" cy="19" r="3" />
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-sm text-white">Share Song</p>
                      </div>
                    </button>

                    {/* 10. Remove (if applicable) */}
                    {onRemove && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerAndroidHaptic('medium');
                          onRemove();
                          closeMenu();
                        }}
                        className="flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-rose-500/15 active:bg-rose-500/25 transition-colors text-left text-rose-400"
                      >
                        <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center text-rose-400">
                          <svg className="w-4 h-4 fill-none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-sm text-rose-400">Remove from Playlist</p>
                        </div>
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* PAGE CONTEXT MENU (Mobile Bottom Sheet) */}
              {type === 'page' && (
                <div className="flex flex-col gap-2 pb-2">
                  <h3 className="font-extrabold text-base text-white px-2 mb-2">Player Controls</h3>
                  <button
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      handleTogglePlay();
                    }}
                    className="flex items-center gap-3 px-3.5 py-3.5 rounded-xl glass-button text-left font-bold text-white cursor-pointer active:scale-[0.98] transition-all"
                  >
                    <span>{isPlaying ? '⏸ Pause' : '▶ Play'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      handleNextTrack();
                    }}
                    className="flex items-center gap-3 px-3.5 py-3.5 rounded-xl glass-button text-left font-bold text-white cursor-pointer active:scale-[0.98] transition-all"
                  >
                    <span>⏭ Next Track</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      handlePrevTrack();
                    }}
                    className="flex items-center gap-3 px-3.5 py-3.5 rounded-xl glass-button text-left font-bold text-white cursor-pointer active:scale-[0.98] transition-all"
                  >
                    <span>⏮ Previous Track</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      handleToggleShuffle();
                    }}
                    className="flex items-center justify-between px-3.5 py-3.5 rounded-xl glass-button text-left font-bold text-white cursor-pointer active:scale-[0.98] transition-all"
                  >
                    <span>🔀 Shuffle</span>
                    <span className="text-xs text-white/50">{isShuffled ? 'ON' : 'OFF'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      handleOpenStudio();
                    }}
                    className="flex items-center gap-3 px-3.5 py-3.5 rounded-xl glass-button text-left font-bold text-white cursor-pointer active:scale-[0.98] transition-all"
                  >
                    <span>🎛️ Studio FX & EQ</span>
                  </button>
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>,
      document.body
    );
  }

  // ---------------------------------------------------------------------------
  // DESKTOP FLOATING LIQUID GLASS CONTEXT MENU RENDERING
  // ---------------------------------------------------------------------------
  return createPortal(
    <div
      className="fixed inset-0 z-[99999] select-none"
      onClick={closeMenu}
      onContextMenu={(e) => {
        e.preventDefault();
        closeMenu();
      }}
    >
      <motion.div
        ref={menuRef}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
        variants={bloomContainerVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        style={{
          position: 'fixed',
          left: `${safeX}px`,
          top: `${safeY}px`
        }}
        className="w-[260px] max-h-[calc(100vh-24px)] overflow-y-auto no-scrollbar rounded-[22px] border border-white/20 glass-bloom-menu py-2 px-2 flex flex-col gap-0.5 text-xs text-white/90 shadow-[0_24px_50px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.2)]"
      >
        {/* Toast confirmation feedback */}
        {toastMessage && (
          <div className="px-3 py-2 mb-1.5 rounded-xl bg-[var(--color-accent)]/25 border border-[var(--color-accent)]/40 text-[11px] font-bold text-white text-center animate-pulse">
            ✓ {toastMessage}
          </div>
        )}

        <AnimatePresence mode="wait" custom={menuView === 'playlist' ? 1 : -1}>
          {menuView === 'playlist' ? (
            <motion.div
              key="playlist-view"
              custom={1}
              variants={viewSlideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full"
            >
              {renderPlaylistPicker()}
            </motion.div>
          ) : (
            <motion.div
              key="main-view"
              custom={-1}
              variants={viewSlideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full flex flex-col gap-0.5"
            >
              {/* ============================================================ */}
              {/* TRACK CONTEXT MENU                                          */}
              {/* ============================================================ */}
              {type === 'track' && track && (
                <>
                  {/* Header: Track mini banner */}
                  <div className="flex items-center gap-2.5 px-2.5 py-2 mb-1 rounded-xl liquid-glass border border-white/12">
                    <img
                      src={track.thumbnail || track.thumbnailUrl || DEFAULT_THUMBNAIL}
                      alt={track.title}
                      className="w-8 h-8 rounded-lg object-cover flex-shrink-0 shadow-sm border border-white/10"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold text-white text-xs truncate leading-tight">
                        {track.title}
                      </p>
                      <p className="text-[10px] text-white/60 truncate leading-tight mt-0.5">
                        {track.artist}
                      </p>
                    </div>
                  </div>

                  {/* 1. Play / Pause */}
                  <button
                    type="button"
                    onClick={handlePlayNow}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors cursor-pointer group"
                  >
                    <span className="text-white/80 group-hover:text-[var(--color-accent)] flex-shrink-0">
                      {isThisTrackPlaying ? (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="4" width="4" height="16" rx="1" />
                          <rect x="14" y="4" width="4" height="16" rx="1" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      )}
                    </span>
                    <span className="font-bold flex-1">
                      {isThisTrackPlaying
                        ? 'Pause'
                        : isThisTrackCurrent
                        ? 'Resume Playback'
                        : 'Play Now'}
                    </span>
                  </button>

                  {/* 2. Play Next */}
                  <button
                    type="button"
                    onClick={handlePlayNext}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors cursor-pointer group"
                  >
                    <span className="text-white/70 group-hover:text-white flex-shrink-0">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 4l10 8-10 8V4z" />
                        <line x1="19" y1="5" x2="19" y2="19" />
                      </svg>
                    </span>
                    <span className="font-semibold flex-1">Play Next in Queue</span>
                  </button>

                  {/* 3. Add to Queue */}
                  <button
                    type="button"
                    onClick={handleAddToQueue}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors cursor-pointer group"
                  >
                    <span className="text-white/70 group-hover:text-white flex-shrink-0">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </span>
                    <span className="font-semibold flex-1">Add to End of Queue</span>
                  </button>

                  {/* Divider */}
                  <div className="h-px bg-white/10 my-1 mx-1" />

                  {/* 4. 15s Chorus Drop Preview */}
                  <button
                    type="button"
                    onClick={handleTogglePreview}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer group ${
                      isPreviewing
                        ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30'
                        : 'hover:bg-white/[0.12] active:bg-white/[0.18]'
                    }`}
                  >
                    <span className="text-amber-400 flex-shrink-0 font-bold">⚡</span>
                    <span className="font-semibold flex-1">
                      {isPreviewing ? 'Stop 15s Chorus' : '15s Chorus Drop Preview'}
                    </span>
                  </button>

                  {/* 5. Like / Favorite */}
                  <button
                    type="button"
                    onClick={handleToggleLike}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors cursor-pointer group"
                  >
                    <span className="flex-shrink-0">
                      {liked ? (
                        <svg className="w-4 h-4 text-rose-500 fill-current" viewBox="0 0 24 24">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-white/70 group-hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                        </svg>
                      )}
                    </span>
                    <span className="font-semibold flex-1">
                      {liked ? 'Liked Song' : 'Save to Liked Songs'}
                    </span>
                  </button>

                  {/* 6. Add to Playlist (Instant Smooth View Switcher) */}
                  <button
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      setMenuView('playlist');
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-white/70 group-hover:text-white flex-shrink-0">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="8" y1="6" x2="21" y2="6" />
                          <line x1="8" y1="12" x2="21" y2="12" />
                          <line x1="8" y1="18" x2="16" y2="18" />
                          <line x1="3" y1="6" x2="3.01" y2="6" />
                          <line x1="3" y1="12" x2="3.01" y2="12" />
                          <line x1="3" y1="18" x2="3.01" y2="18" />
                        </svg>
                      </span>
                      <span className="font-semibold">Add to Playlist...</span>
                    </div>
                    <svg className="w-3.5 h-3.5 text-white/50 group-hover:text-white group-hover:translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>

                  {/* Divider */}
                  <div className="h-px bg-white/10 my-1 mx-1" />

                  {/* 7. Download Offline Vault */}
                  <button
                    type="button"
                    onClick={handleToggleOffline}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors cursor-pointer group"
                  >
                    <span className="text-white/70 group-hover:text-white flex-shrink-0">
                      {isOffline ? (
                        <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      )}
                    </span>
                    <span className="font-semibold flex-1">
                      {isOffline ? 'Remove from Offline Vault' : 'Download to Offline Vault'}
                    </span>
                  </button>

                  {/* 7b. Download Entire Set / Album / Playlist */}
                  {contextTracks && contextTracks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        useDownloadStore.getState().startBatchDownload(
                          `batch_${Date.now()}`,
                          track?.album || track?.artist || 'Track Set',
                          contextTracks
                        );
                        showToast(`Downloading ${contextTracks.length} tracks to Vault...`);
                        closeMenu();
                      }}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors cursor-pointer group text-cyan-300"
                    >
                      <span className="flex-shrink-0 text-sm">⬇</span>
                      <span className="font-semibold flex-1">
                        Download All ({contextTracks.length} tracks)
                      </span>
                    </button>
                  )}

                  {/* 8. View Synced Lyrics */}
                  <button
                    type="button"
                    onClick={handleViewLyrics}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors cursor-pointer group"
                  >
                    <span className="text-cyan-400 flex-shrink-0">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                    </span>
                    <span className="font-semibold flex-1">View Synced Lyrics</span>
                  </button>

                  {/* 9. Studio FX (8D & Concert) */}
                  <button
                    type="button"
                    onClick={handleOpenStudio}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors cursor-pointer group"
                  >
                    <span className="text-[var(--color-accent)] flex-shrink-0">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="4" y1="21" x2="4" y2="14" />
                        <line x1="4" y1="10" x2="4" y2="3" />
                        <line x1="12" y1="21" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12" y2="3" />
                        <line x1="20" y1="21" x2="20" y2="16" />
                        <line x1="20" y1="12" x2="20" y2="3" />
                        <line x1="1" y1="14" x2="7" y2="14" />
                        <line x1="9" y1="8" x2="15" y2="8" />
                        <line x1="17" y1="16" x2="23" y2="16" />
                      </svg>
                    </span>
                    <span className="font-semibold flex-1">Studio FX (8D & Concert)</span>
                  </button>

                  {/* 10. Share */}
                  <button
                    type="button"
                    onClick={handleShare}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors cursor-pointer group"
                  >
                    <span className="text-white/70 group-hover:text-white flex-shrink-0">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="18" cy="5" r="3" />
                        <circle cx="6" cy="12" r="3" />
                        <circle cx="18" cy="19" r="3" />
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                      </svg>
                    </span>
                    <span className="font-semibold flex-1">Share / Copy Link</span>
                  </button>

                  {onRemove && (
                    <>
                      <div className="h-px bg-white/10 my-1 mx-1" />
                      <button
                        type="button"
                        onClick={() => {
                          onRemove();
                          closeMenu();
                        }}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-rose-500/15 active:bg-rose-500/25 transition-colors cursor-pointer group text-rose-400"
                      >
                        <span className="flex-shrink-0 text-rose-400">
                          <svg className="w-4 h-4 fill-none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </span>
                        <span className="font-semibold flex-1">Remove from Playlist</span>
                      </button>
                    </>
                  )}
                </>
              )}

              {/* ============================================================ */}
              {/* GLOBAL / PAGE CONTEXT MENU                                  */}
              {/* ============================================================ */}
              {type === 'page' && (
                <>
                  {/* Header: WaveCraft Studio Banner */}
                  <div className="flex items-center justify-between px-3 py-2 mb-1 rounded-xl bg-white/[0.06] border border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-accent)] opacity-75 ${!isPlaying ? 'hidden' : ''}`} />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-accent)]" />
                      </span>
                      <span className="font-black text-[11px] uppercase tracking-wider text-white">
                        WaveCraft Studio
                      </span>
                    </div>
                  </div>

                  {/* 1. Play / Pause */}
                  <button
                    type="button"
                    onClick={handleTogglePlay}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors cursor-pointer group"
                  >
                    <span className="text-white/80 group-hover:text-[var(--color-accent)] flex-shrink-0">
                      {isPlaying ? (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="4" width="4" height="16" rx="1" />
                          <rect x="14" y="4" width="4" height="16" rx="1" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      )}
                    </span>
                    <span className="font-bold flex-1">
                      {isPlaying ? 'Pause Playback' : 'Resume Playback'}
                    </span>
                  </button>

                  {/* 2. Next Track */}
                  <button
                    type="button"
                    onClick={handleNextTrack}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors cursor-pointer group"
                  >
                    <span className="text-white/70 group-hover:text-white flex-shrink-0">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="5 4 15 12 5 20 5 4" />
                        <line x1="19" y1="5" x2="19" y2="19" />
                      </svg>
                    </span>
                    <span className="font-semibold flex-1">Next Track</span>
                  </button>

                  {/* 3. Previous Track */}
                  <button
                    type="button"
                    onClick={handlePrevTrack}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors cursor-pointer group"
                  >
                    <span className="text-white/70 group-hover:text-white flex-shrink-0">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="19 20 9 12 19 4 19 20" />
                        <line x1="5" y1="19" x2="5" y2="5" />
                      </svg>
                    </span>
                    <span className="font-semibold flex-1">Previous Track</span>
                  </button>

                  {/* 4. Shuffle */}
                  <button
                    type="button"
                    onClick={handleToggleShuffle}
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-white/70 group-hover:text-white flex-shrink-0">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="16 3 21 3 21 8" />
                          <line x1="4" y1="20" x2="21" y2="3" />
                          <polyline points="21 16 21 21 16 21" />
                          <line x1="15" y1="15" x2="21" y2="21" />
                          <line x1="4" y1="4" x2="9" y2="9" />
                        </svg>
                      </span>
                      <span className="font-semibold">Shuffle</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isShuffled ? 'bg-[var(--color-accent)] text-white' : 'bg-white/10 text-white/50'}`}>
                      {isShuffled ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  {/* 5. Repeat */}
                  <button
                    type="button"
                    onClick={handleCycleRepeat}
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-white/70 group-hover:text-white flex-shrink-0">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="17 1 21 5 17 9" />
                          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                          <polyline points="7 23 3 19 7 15" />
                          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                        </svg>
                      </span>
                      <span className="font-semibold">Repeat</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                      {repeatMode === 'one' ? 'ONE' : repeatMode === 'all' ? 'ALL' : 'OFF'}
                    </span>
                  </button>

                  {/* Divider */}
                  <div className="h-px bg-white/10 my-1 mx-1" />

                  {/* 6. Studio FX Rack */}
                  <button
                    type="button"
                    onClick={handleOpenStudio}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors cursor-pointer group"
                  >
                    <span className="text-[var(--color-accent)] flex-shrink-0">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="4" y1="21" x2="4" y2="14" />
                        <line x1="4" y1="10" x2="4" y2="3" />
                        <line x1="12" y1="21" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12" y2="3" />
                        <line x1="20" y1="21" x2="20" y2="16" />
                        <line x1="20" y1="12" x2="20" y2="3" />
                        <line x1="1" y1="14" x2="7" y2="14" />
                        <line x1="9" y1="8" x2="15" y2="8" />
                        <line x1="17" y1="16" x2="23" y2="16" />
                      </svg>
                    </span>
                    <span className="font-semibold flex-1">Studio FX (8D & Hall)</span>
                  </button>

                  {/* 7. Command Palette */}
                  <button
                    type="button"
                    onClick={handleOpenCommandPalette}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors cursor-pointer group"
                  >
                    <span className="text-white/70 group-hover:text-white flex-shrink-0">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </span>
                    <span className="font-semibold flex-1">Command Palette</span>
                  </button>

                  {/* 8. Mute / Unmute */}
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-white/[0.12] active:bg-white/[0.18] transition-colors cursor-pointer group"
                  >
                    <span className="text-white/70 group-hover:text-white flex-shrink-0">
                      {isMuted ? (
                        <svg className="w-4 h-4 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="1" y1="1" x2="23" y2="23" />
                          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                        </svg>
                      )}
                    </span>
                    <span className="font-semibold flex-1">
                      {isMuted ? 'Unmute Audio' : 'Mute Audio'}
                    </span>
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>,
    document.body
  );
}

export default function ContextMenu() {
  const closeMenu = useContextMenuStore((s) => s.closeMenu);
  return (
    <ContextMenuErrorBoundary onClose={closeMenu}>
      <ContextMenuInner />
    </ContextMenuErrorBoundary>
  );
}
