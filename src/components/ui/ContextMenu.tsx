import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  Component,
  type ReactNode,
  type ErrorInfo
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useJamStore } from '../../stores/jamStore';
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
import { getShareBaseUrl } from '../../services/apiConfig';
import { useOverlayEscape } from './dialogStack';
import {
  CONTEXT_MENU_DENSITY_TOKENS,
  computeClampedMenuPosition,
  estimateMenuDimensions,
  getVisibleContextMenuActions,
  normalizeContextMenuConfig
} from '../../utils/contextMenuConfig';
import type {
  ContextMenuPageActionId,
  ContextMenuTrackActionId,
  Playlist
} from '../../types';

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

const compactContainerVariants = {
  initial: {
    opacity: 0,
    scale: 0.96,
    filter: 'blur(8px)'
  },
  animate: {
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.18,
      ease: [0.16, 1, 0.3, 1] as const
    }
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    filter: 'blur(6px)',
    transition: {
      duration: 0.12,
      ease: [0.16, 1, 0.3, 1] as const
    }
  }
};

const viewSlideVariants = {
  initial: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? 12 : -12
  }),
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.15, ease: [0.16, 1, 0.3, 1] as const }
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? -12 : 12,
    transition: { duration: 0.1, ease: [0.16, 1, 0.3, 1] as const }
  })
};

interface ActionDescriptor {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  active?: boolean;
  hasSubmenu?: boolean;
}

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

  const rawContextMenu = useSettingsStore((s) => s.contextMenu);
  const contextMenu = useMemo(
    () => normalizeContextMenuConfig(rawContextMenu),
    [rawContextMenu]
  );
  const density = contextMenu.density;
  const tokens = CONTEXT_MENU_DENSITY_TOKENS[density];

  const visibleTrackActions = useMemo(
    () => getVisibleContextMenuActions(contextMenu, 'track'),
    [contextMenu]
  );
  const visiblePageActions = useMemo(
    () => getVisibleContextMenuActions(contextMenu, 'page'),
    [contextMenu]
  );

  const menuRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [menuView, setMenuView] = useState<'main' | 'playlist'>('main');
  const [playlistFilter, setPlaylistFilter] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [measuredSize, setMeasuredSize] = useState<{ width: number; height: number } | null>(null);

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
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      setMenuView('main');
      setIsCreatingPlaylist(false);
      setToastMessage(null);
      setMeasuredSize(null);
    }
  }, [isOpen, initialView]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useOverlayEscape(isOpen, () => {
    if (isCreatingPlaylist) {
      setIsCreatingPlaylist(false);
    } else if (menuView === 'playlist' && initialView === 'main') {
      setMenuView('main');
    } else {
      closeMenu();
    }
  });

  const showToast = useCallback(
    (msg: string, delay = 900) => {
      setToastMessage(msg);
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = setTimeout(() => {
        toastTimerRef.current = null;
        setToastMessage(null);
        closeMenu();
      }, delay);
    },
    [closeMenu]
  );

  // Filtered playlists
  const filteredPlaylists = useMemo(() => {
    if (!playlistFilter.trim()) return playlists;
    const q = playlistFilter.toLowerCase();
    return playlists.filter((p) => p.name.toLowerCase().includes(q));
  }, [playlists, playlistFilter]);

  const [viewportSize, setViewportSize] = useState<{ w: number; h: number }>(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1024,
    h: typeof window !== 'undefined' ? window.innerHeight : 768
  }));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => {
      setViewportSize({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Measure actual unscaled rendered dimensions + observe layout changes so viewport clamping never clips off-screen
  useLayoutEffect(() => {
    if (!isOpen || isPhone) {
      setMeasuredSize(null);
      return;
    }
    const el = menuRef.current;
    if (!el) return;

    const measure = () => {
      const nextWidth = Math.ceil(el.offsetWidth || el.getBoundingClientRect().width);
      const nextHeight = Math.ceil(Math.max(el.offsetHeight, el.scrollHeight));
      if (nextWidth > 0 && nextHeight > 0) {
        setMeasuredSize((prev) =>
          prev && prev.width === nextWidth && prev.height === nextHeight
            ? prev
            : { width: nextWidth, height: nextHeight }
        );
      }
    };

    measure();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }

    return () => {
      ro?.disconnect();
    };
  }, [
    isOpen,
    isPhone,
    menuView,
    type,
    density,
    visibleTrackActions.length,
    visiblePageActions.length,
    onRemove,
    isCreatingPlaylist,
    filteredPlaylists.length,
    toastMessage,
    x,
    y
  ]);

  if (typeof document === 'undefined') return null;

  // Dynamic viewport-safe bounds calculation
  const estimatedSize = estimateMenuDimensions(contextMenu, type, {
    isPlaylistView: menuView === 'playlist',
    hasTrackHeader: type === 'track' && Boolean(track),
    hasContextualRemove: Boolean(onRemove)
  });
  const winW = viewportSize.w;
  const winH = viewportSize.h;
  const effectiveHeight = Math.min(measuredSize?.height ?? estimatedSize.height, Math.max(160, winH - 24));
  const { left: safeX, top: safeY } = computeClampedMenuPosition({
    x,
    y,
    menuWidth: measuredSize?.width ?? estimatedSize.width,
    menuHeight: effectiveHeight,
    viewportWidth: winW,
    viewportHeight: winH,
    margin: 12
  });

  // --- ACTIONS: TRACK CONTEXT ---
  const isThisTrackPlaying = Boolean(track && currentTrack?.id === track.id && isPlaying);
  const isThisTrackCurrent = Boolean(track && currentTrack?.id === track.id);

  const handlePlayNow = () => {
    if (!track) return;
    const jam = useJamStore.getState();
    if (jam.roomCode && !jam.isHost) {
      jam.addTrackToJam(track, false);
      showToast('Added to Jam Room queue');
      closeMenu();
      return;
    }
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
    const jam = useJamStore.getState();
    if (jam.roomCode && !jam.isHost) {
      jam.addTrackToJam(track, false);
      showToast('Added to Jam Room queue');
      return;
    }
    usePlayerStore.getState().addNext(track);
    showToast('Queued to play next');
  };

  const handleAddToQueue = () => {
    if (!track) return;
    const jam = useJamStore.getState();
    if (jam.roomCode && !jam.isHost) {
      jam.addTrackToJam(track, false);
      showToast('Added to Jam Room queue');
      return;
    }
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
      showToast('15s Chorus preview started');
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
      showToast('Saving offline...');
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
    triggerAndroidHaptic('light');
    const shareText = `Listen to "${track.title}" by ${track.artist} on WaveCraft`;
    const shareUrl = `${getShareBaseUrl()}/?track=${encodeURIComponent(track.title)}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${track.title} - ${track.artist}`,
          text: shareText,
          url: shareUrl
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        showToast('Link copied to clipboard');
      }
    } catch {
      // User cancelled or clipboard fallback
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
    showToast(isShuffled ? 'Shuffle off' : 'Shuffle on');
  };

  const handleCycleRepeat = () => {
    usePlayerStore.getState().cycleRepeat();
    const nextMode =
      repeatMode === 'off' ? 'Repeat All' : repeatMode === 'all' ? 'Repeat One' : 'Repeat Off';
    showToast(nextMode);
  };

  const handleOpenCommandPalette = () => {
    useStudioStore.getState().setCommandPaletteOpen(true);
    closeMenu();
  };

  const handleOpenSmartDJ = () => {
    useStudioStore.getState().setSmartDJOpen(true);
    closeMenu();
  };

  const handleOpenNightstand = () => {
    useStudioStore.getState().setNightstandOpen(true);
    closeMenu();
  };

  const handleToggleMute = () => {
    usePlayerStore.getState().toggleMute();
    showToast(isMuted ? 'Audio unmuted' : 'Audio muted');
  };

  const iconClass = isPhone ? tokens.mobileIconSize : tokens.iconSize;

  const getTrackActionDescriptor = (id: ContextMenuTrackActionId): ActionDescriptor => {
    switch (id) {
      case 'playNow':
        return {
          id,
          label: isThisTrackPlaying ? 'Pause' : isThisTrackCurrent ? 'Resume' : 'Play',
          active: isThisTrackPlaying,
          onSelect: handlePlayNow,
          icon: isThisTrackPlaying ? (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <polygon points="6 4 20 12 6 20 6 4" />
            </svg>
          )
        };
      case 'playNext':
        return {
          id,
          label: 'Play Next',
          onSelect: handlePlayNext,
          icon: (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 4 15 12 5 20 5 4" />
              <line x1="19" y1="5" x2="19" y2="19" />
            </svg>
          )
        };
      case 'addToQueue':
        return {
          id,
          label: 'Add to Queue',
          onSelect: handleAddToQueue,
          icon: (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          )
        };
      case 'toggleLike':
        return {
          id,
          label: liked ? 'Liked' : 'Like',
          active: liked,
          onSelect: handleToggleLike,
          icon: liked ? (
            <svg className={`${iconClass} text-rose-400 fill-current`} viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          ) : (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
          )
        };
      case 'addToPlaylist':
        return {
          id,
          label: 'Add to Playlist',
          hasSubmenu: true,
          onSelect: () => {
            setMenuView('playlist');
          },
          icon: (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="16" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          )
        };
      case 'chorusPreview':
        return {
          id,
          label: isPreviewing ? 'Stop Preview' : '15s Preview',
          active: isPreviewing,
          onSelect: handleTogglePreview,
          icon: (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          )
        };
      case 'toggleOffline':
        return {
          id,
          label: isOffline ? 'Remove Offline' : 'Save Offline',
          active: isOffline,
          onSelect: handleToggleOffline,
          icon: isOffline ? (
            <svg className={`${iconClass} text-emerald-400`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          )
        };
      case 'viewLyrics':
        return {
          id,
          label: 'Lyrics',
          onSelect: handleViewLyrics,
          icon: (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          )
        };
      case 'studioFx':
        return {
          id,
          label: 'Studio FX',
          onSelect: handleOpenStudio,
          icon: (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
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
          )
        };
      case 'share':
        return {
          id,
          label: 'Share',
          onSelect: handleShare,
          icon: (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          )
        };
    }
  };

  const getPageActionDescriptor = (id: ContextMenuPageActionId): ActionDescriptor => {
    switch (id) {
      case 'togglePlay':
        return {
          id,
          label: isPlaying ? 'Pause' : 'Play',
          active: isPlaying,
          onSelect: handleTogglePlay,
          icon: isPlaying ? (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <polygon points="6 4 20 12 6 20 6 4" />
            </svg>
          )
        };
      case 'nextTrack':
        return {
          id,
          label: 'Next Track',
          onSelect: handleNextTrack,
          icon: (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 4 15 12 5 20 5 4" />
              <line x1="19" y1="5" x2="19" y2="19" />
            </svg>
          )
        };
      case 'prevTrack':
        return {
          id,
          label: 'Previous Track',
          onSelect: handlePrevTrack,
          icon: (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <polygon points="19 20 9 12 19 4 19 20" />
              <line x1="5" y1="19" x2="5" y2="5" />
            </svg>
          )
        };
      case 'toggleShuffle':
        return {
          id,
          label: isShuffled ? 'Shuffle · On' : 'Shuffle',
          active: isShuffled,
          onSelect: handleToggleShuffle,
          icon: (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
          )
        };
      case 'cycleRepeat':
        return {
          id,
          label:
            repeatMode === 'one'
              ? 'Repeat · One'
              : repeatMode === 'all'
              ? 'Repeat · All'
              : 'Repeat',
          active: repeatMode !== 'off',
          onSelect: handleCycleRepeat,
          icon: (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          )
        };
      case 'toggleMute':
        return {
          id,
          label: isMuted ? 'Unmute' : 'Mute',
          active: isMuted,
          onSelect: handleToggleMute,
          icon: isMuted ? (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          )
        };
      case 'studioFx':
        return {
          id,
          label: 'Studio FX',
          onSelect: handleOpenStudio,
          icon: (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
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
          )
        };
      case 'commandPalette':
        return {
          id,
          label: 'Command Palette',
          onSelect: handleOpenCommandPalette,
          icon: (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          )
        };
      case 'smartDj':
        return {
          id,
          label: 'Smart DJ',
          onSelect: handleOpenSmartDJ,
          icon: (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="2.5" />
              <path d="M12 3v3" />
            </svg>
          )
        };
      case 'nightstand':
        return {
          id,
          label: 'Nightstand',
          onSelect: handleOpenNightstand,
          icon: (
            <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )
        };
    }
  };

  // ---------------------------------------------------------------------------
  // PLAYLIST PICKER SUB-VIEW CONTENT (Shared by both Mobile & Desktop)
  // ---------------------------------------------------------------------------
  const renderPlaylistPicker = () => (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between pb-1 px-1 border-b border-white/[0.08]">
        <button
          type="button"
          onClick={() => setMenuView('main')}
          className="flex items-center gap-1 text-[11px] font-semibold text-white/70 hover:text-white transition-colors cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Back</span>
        </button>

        <span className="text-[11px] font-semibold text-white/90">Add to Playlist</span>

        <button
          type="button"
          onClick={() => setIsCreatingPlaylist((prev) => !prev)}
          className="text-[11px] font-semibold text-[var(--color-accent)] hover:text-white px-1.5 py-0.5 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
        >
          {isCreatingPlaylist ? 'Cancel' : '+ New'}
        </button>
      </div>

      {isCreatingPlaylist && (
        <div className="p-2 rounded-xl bg-white/[0.06] border border-white/10 flex flex-col gap-1.5">
          <input
            type="text"
            autoFocus
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreatePlaylistAndAdd();
              if (e.key === 'Escape') setIsCreatingPlaylist(false);
            }}
            placeholder="Playlist name..."
            className="w-full px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-white text-xs outline-none focus:ring-1 focus:ring-[var(--color-accent)] placeholder:text-white/40"
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setIsCreatingPlaylist(false)}
              className="px-2 py-1 rounded-lg text-[11px] text-white/60 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreatePlaylistAndAdd}
              className="px-2.5 py-1 rounded-lg bg-[var(--color-accent)] text-white text-[11px] font-semibold cursor-pointer hover:brightness-110 active:scale-95 transition-all"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {playlists.length > 3 && (
        <div className="relative px-0.5">
          <input
            type="text"
            value={playlistFilter}
            onChange={(e) => setPlaylistFilter(e.target.value)}
            placeholder="Filter playlists..."
            className="w-full px-2.5 py-1 pl-7 rounded-lg bg-white/[0.06] border border-white/10 text-white text-[11px] outline-none focus:ring-1 focus:ring-[var(--color-accent)] placeholder:text-white/40"
          />
          <svg className="w-3 h-3 absolute left-2.5 top-2 text-white/40 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
      )}

      <div className="max-h-[210px] overflow-y-auto no-scrollbar flex flex-col gap-0.5">
        {filteredPlaylists.length > 0 ? (
          filteredPlaylists.map((pl) => {
            const alreadyHasTrack = Boolean(
              track && Array.isArray(pl.tracks) && pl.tracks.some((t) => t.id === track.id)
            );
            return (
              <button
                key={pl.id}
                type="button"
                onClick={() => handleAddToPlaylist(pl)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/[0.10] active:bg-white/[0.16] transition-colors text-left cursor-pointer group"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="w-6 h-6 rounded-md overflow-hidden bg-white/10 flex-shrink-0 flex items-center justify-center">
                    {pl.coverUrl ? (
                      <img src={pl.coverUrl} alt={pl.name} className="w-full h-full object-cover" />
                    ) : (
                      <svg className="w-3 h-3 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <line x1="8" y1="6" x2="21" y2="6" />
                        <line x1="8" y1="12" x2="21" y2="12" />
                        <line x1="8" y1="18" x2="16" y2="18" />
                      </svg>
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-white/90 group-hover:text-white truncate">
                    {pl.name}
                  </span>
                </div>

                {alreadyHasTrack ? (
                  <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <span className="text-[10px] text-white/35 group-hover:text-white/75 transition-colors flex-shrink-0">
                    +
                  </span>
                )}
              </button>
            );
          })
        ) : (
          <div className="text-center py-5 px-2 flex flex-col items-center gap-1.5">
            <svg className="w-5 h-5 text-white/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-[11px] text-white/50">
              {playlistFilter ? 'No matching playlists' : 'No playlists yet'}
            </p>
            {!isCreatingPlaylist && (
              <button
                type="button"
                onClick={() => setIsCreatingPlaylist(true)}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-medium text-white transition-colors cursor-pointer"
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
  // SHARED ACTION LIST RENDERER (Desktop + Mobile Parity)
  // ---------------------------------------------------------------------------
  const renderMainMenuRows = (mobile: boolean) => {
    const rowPadding = mobile ? tokens.mobileRowPadding : tokens.rowPadding;
    const rowGap = mobile ? 'gap-2.5' : tokens.rowGap;
    const textSize = mobile ? tokens.mobileTextSize : tokens.textSize;
    const listGap = mobile ? tokens.mobileListGap : tokens.listGap;

    if (type === 'track' && track) {
      const descriptors = visibleTrackActions.map((item) => getTrackActionDescriptor(item.id));
      return (
        <div className={`flex flex-col ${listGap}`}>
          {/* Minimalist track caption */}
          <div
            className={`flex items-center gap-2 border-b border-white/[0.08] mb-0.5 ${
              density === 'ultra-compact' && !mobile ? 'px-2 py-1' : 'px-2 py-1.5'
            }`}
          >
            {(density === 'compact' || mobile) && (
              <img
                src={track.thumbnail || track.thumbnailUrl || DEFAULT_THUMBNAIL}
                alt={track.title}
                className={`${mobile ? 'w-7 h-7 rounded-lg' : 'w-5 h-5 rounded-[5px]'} object-cover flex-shrink-0`}
              />
            )}
            <div className="min-w-0 flex-1 flex items-baseline gap-1.5">
              <span
                className={`font-semibold text-white/90 truncate ${
                  density === 'ultra-compact' && !mobile ? 'text-[10.5px]' : 'text-[11px]'
                }`}
              >
                {track.title}
              </span>
              <span className="text-[10px] text-white/45 truncate flex-shrink">
                {track.artist}
              </span>
            </div>
          </div>

          {descriptors.length === 0 && !onRemove ? (
            <div className="px-2.5 py-2 text-center text-[11px] text-white/45">
              All actions hidden
            </div>
          ) : (
            descriptors.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => {
                  triggerAndroidHaptic('light');
                  action.onSelect();
                }}
                className={`w-full flex items-center justify-between ${rowPadding} ${tokens.rowRadius} text-left transition-colors cursor-pointer group ${
                  action.active
                    ? 'bg-white/[0.08] text-white hover:bg-white/[0.13]'
                    : 'text-white/85 hover:bg-white/[0.10] hover:text-white active:bg-white/[0.15]'
                }`}
              >
                <span className={`flex items-center ${rowGap} min-w-0 flex-1`}>
                  <span
                    className={`flex-shrink-0 transition-colors ${
                      action.active
                        ? 'text-[var(--color-accent)]'
                        : 'text-white/60 group-hover:text-white/95'
                    }`}
                  >
                    {action.icon}
                  </span>
                  <span className={`font-medium truncate ${textSize}`}>{action.label}</span>
                </span>
                {action.hasSubmenu && (
                  <svg
                    className="w-3 h-3 text-white/40 group-hover:text-white/80 flex-shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.25}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                )}
              </button>
            ))
          )}

          {onRemove && (
            <div className="border-t border-white/[0.08] mt-0.5 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  triggerAndroidHaptic('medium');
                  onRemove();
                  closeMenu();
                }}
                className={`w-full flex items-center ${rowGap} ${rowPadding} ${tokens.rowRadius} text-left text-rose-400 hover:bg-rose-500/15 active:bg-rose-500/25 transition-colors cursor-pointer`}
              >
                <svg
                  className={`${iconClass} flex-shrink-0`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.9}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className={`font-medium truncate ${textSize}`}>Remove from Playlist</span>
              </button>
            </div>
          )}
        </div>
      );
    }

    const pageDescriptors = visiblePageActions.map((item) => getPageActionDescriptor(item.id));
    return (
      <div className={`flex flex-col ${listGap}`}>
        {pageDescriptors.length === 0 ? (
          <div className="px-2.5 py-2 text-center text-[11px] text-white/45">
            All actions hidden
          </div>
        ) : (
          pageDescriptors.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => {
                triggerAndroidHaptic('light');
                action.onSelect();
              }}
              className={`w-full flex items-center ${rowGap} ${rowPadding} ${tokens.rowRadius} text-left transition-colors cursor-pointer group ${
                action.active
                  ? 'bg-white/[0.08] text-white hover:bg-white/[0.13]'
                  : 'text-white/85 hover:bg-white/[0.10] hover:text-white active:bg-white/[0.15]'
              }`}
            >
              <span
                className={`flex-shrink-0 transition-colors ${
                  action.active
                    ? 'text-[var(--color-accent)]'
                    : 'text-white/60 group-hover:text-white/95'
                }`}
              >
                {action.icon}
              </span>
              <span className={`font-medium truncate flex-1 ${textSize}`}>{action.label}</span>
            </button>
          ))
        )}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // MOBILE BOTTOM SHEET RENDERING
  // ---------------------------------------------------------------------------
  if (isPhone) {
    return (
      <motion.div
        key="context-menu-phone"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.14 }}
        className="fixed inset-0 z-[99999] select-none flex flex-col justify-end"
        onClick={closeMenu}
        onContextMenu={(e) => {
          e.preventDefault();
          closeMenu();
        }}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm"
        />

        <motion.div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 380 }}
          style={{
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 18px)'
          }}
          data-density={density}
          className="relative z-10 w-full max-h-[82vh] overflow-y-auto no-scrollbar rounded-t-[24px] glass-compact-menu px-3 pt-2.5 flex flex-col text-white"
        >
          <div className="w-10 h-1 rounded-full bg-white/25 mx-auto mb-2 flex-shrink-0" />

          {toastMessage && (
            <div className="px-3 py-1.5 mb-2 rounded-xl bg-[var(--color-accent)]/25 text-xs font-semibold text-white text-center">
              {toastMessage}
            </div>
          )}

          {menuView === 'playlist' ? (
            <div className="py-1">{renderPlaylistPicker()}</div>
          ) : (
            <div className="pb-1">{renderMainMenuRows(true)}</div>
          )}
        </motion.div>
      </motion.div>
    );
  }

  // ---------------------------------------------------------------------------
  // DESKTOP FLOATING MINIMALIST COMPACT GLASS CONTEXT MENU
  // ---------------------------------------------------------------------------
  return (
    <motion.div
      key="context-menu-desktop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
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
        variants={compactContainerVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        style={{
          position: 'fixed',
          left: `${safeX}px`,
          top: `${safeY}px`,
          maxHeight: `${Math.max(160, winH - safeY - 12)}px`
        }}
        data-density={density}
        className={`${tokens.widthClass} ${tokens.containerRadius} ${tokens.containerPadding} max-h-[calc(100vh-24px)] overflow-y-auto no-scrollbar glass-compact-menu flex flex-col ${tokens.listGap} text-white/90`}
      >
        {toastMessage && (
          <div className="px-2.5 py-1.5 mb-0.5 rounded-lg bg-[var(--color-accent)]/25 text-[11px] font-semibold text-white text-center">
            {toastMessage}
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
              className="w-full"
            >
              {renderMainMenuRows(false)}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

export default function ContextMenu() {
  const isOpen = useContextMenuStore((s) => s.isOpen);
  const closeMenu = useContextMenuStore((s) => s.closeMenu);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <ContextMenuErrorBoundary onClose={closeMenu}>
      <AnimatePresence>{isOpen && <ContextMenuInner />}</AnimatePresence>
    </ContextMenuErrorBoundary>,
    document.body
  );
}
