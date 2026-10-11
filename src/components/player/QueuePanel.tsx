import { useState, useRef, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { getSmartRecommendations } from '../../services/recommendationEngine';
import { shuffleArray } from '../../utils/shuffle';
import { formatTime } from '../../utils/formatTime';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';
import { useDevicePreset } from '../../hooks/useDevicePreset';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import type { Track } from '../../types';

interface QueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface QueueTrackRowProps {
  track: Track;
  actualIndex: number;
  idx: number;
  isBeingDragged: boolean;
  isDragTarget: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  queue: Track[];
  onDragStart: (actualIndex: number) => void;
  onDragOver: (e: React.DragEvent, actualIndex: number) => void;
  onDrop: (targetActualIndex: number) => void;
  onDragEnd: () => void;
  onJumpToTrack: (track: Track, actualIndex: number) => void;
  onMoveToTop: (fromActualIndex: number) => void;
  onReorder: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}

const QueueTrackRow = memo(function QueueTrackRow({
  track,
  actualIndex,
  idx,
  isBeingDragged,
  isDragTarget,
  canMoveUp,
  canMoveDown,
  queue,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onJumpToTrack,
  onMoveToTop,
  onReorder,
  onRemove
}: QueueTrackRowProps) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(actualIndex)}
      onDragOver={(e) => onDragOver(e, actualIndex)}
      onDrop={() => onDrop(actualIndex)}
      onDragEnd={onDragEnd}
      onContextMenu={(e) => {
        if (e.shiftKey) return;
        e.preventDefault();
        e.stopPropagation();
        useContextMenuStore.getState().openTrackMenu({ clientX: e.clientX, clientY: e.clientY }, track, queue);
      }}
      className={`group flex items-center gap-2.5 p-2 rounded-2xl border transition-all duration-150 ${
        isDragTarget
          ? 'bg-[var(--color-accent)]/20 border-[var(--color-accent)] scale-[1.01]'
          : isBeingDragged
          ? 'opacity-40 bg-white/5 border-white/20'
          : 'bg-white/[0.035] hover:bg-white/[0.09] border-white/[0.06] hover:border-white/15'
      }`}
    >
      {/* Drag Grip Handle + Queue Order Number */}
      <div
        className="w-6 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing text-white/35 group-hover:text-white/75 flex-shrink-0"
        title="Drag to reorder"
      >
        <span className="text-[10px] font-bold group-hover:hidden tabular-nums">
          {idx + 1}
        </span>
        <svg
          className="w-3.5 h-3.5 hidden group-hover:block"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <line x1="4" y1="9" x2="20" y2="9" />
          <line x1="4" y1="15" x2="20" y2="15" />
        </svg>
      </div>

      {/* Track Artwork with Play Overlay */}
      <div
        onClick={() => onJumpToTrack(track, actualIndex)}
        className="relative w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 cursor-pointer border border-white/10"
      >
        <img
          src={track.thumbnail || DEFAULT_THUMBNAIL}
          alt={track.title}
          loading="lazy"
          decoding="async"
          onError={(e) => {
            (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
          }}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
          <svg className="w-4 h-4 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>

      {/* Title & Artist (Click to Play Immediately) */}
      <div
        onClick={() => onJumpToTrack(track, actualIndex)}
        className="min-w-0 flex-1 cursor-pointer"
      >
        <p className="text-xs font-bold text-white/90 group-hover:text-white truncate transition-colors">
          {track.title}
        </p>
        <p className="text-[11px] text-white/65 truncate mt-0.5">
          {track.artist}
        </p>
      </div>

      {/* Duration Readout */}
      <span className="text-[11px] font-medium text-white/60 tabular-nums group-hover:hidden pr-1">
        {formatTime(track.duration || 210)}
      </span>

      {/* Hover Action Dock */}
      <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
        {idx > 0 && (
          <button
            type="button"
            onClick={() => onMoveToTop(actualIndex)}
            aria-label="Play Next (Move to Top)"
            title="Play Next (Move to Top)"
            className="w-7 h-7 sm:w-6 sm:h-6 rounded-lg glass-button text-white/70 hover:text-[var(--color-accent)] flex items-center justify-center transition-all cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 11 12 6 7 11" />
              <line x1="12" y1="6" x2="12" y2="18" />
              <line x1="6" y1="3" x2="18" y2="3" />
            </svg>
          </button>
        )}

        <button
          type="button"
          onClick={() => canMoveUp && onReorder(actualIndex, actualIndex - 1)}
          disabled={!canMoveUp}
          aria-label="Move track up"
          title="Move Up"
          className="w-7 h-7 sm:w-6 sm:h-6 rounded-lg glass-button text-white/70 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => canMoveDown && onReorder(actualIndex, actualIndex + 1)}
          disabled={!canMoveDown}
          aria-label="Move track down"
          title="Move Down"
          className="w-7 h-7 sm:w-6 sm:h-6 rounded-lg glass-button text-white/70 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => onRemove(actualIndex)}
          aria-label="Remove from Queue"
          title="Remove from Queue"
          className="w-7 h-7 sm:w-6 sm:h-6 rounded-lg glass-button text-rose-300 hover:text-rose-200 flex items-center justify-center transition-all cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
});

QueueTrackRow.displayName = 'QueueTrackRow';

function QueuePanelContent({ onClose }: { onClose: () => void }) {
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);
  const reorderQueue = usePlayerStore((s) => s.reorderQueue);
  const addToQueue = usePlayerStore((s) => s.addToQueue);

  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const addToPlaylist = useLibraryStore((s) => s.addToPlaylist);
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const isCurrentLiked = useLibraryStore((s) =>
    currentTrack ? s.likedSongs.some((t) => t.id === currentTrack.id) : false
  );
  const { isPhone } = useDevicePreset();

  const [activeTab, setActiveTab] = useState<'upnext' | 'history'>('upnext');
  const [isAiFilling, setIsAiFilling] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [draggedActualIndex, setDraggedActualIndex] = useState<number | null>(null);
  const [dragOverActualIndex, setDragOverActualIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<number | null>(null);

  // Split queue into Previous (History in current queue) and Upcoming (after queueIndex)
  const effectiveIndex =
    queueIndex >= 0
      ? queueIndex
      : currentTrack
      ? Math.max(0, queue.findIndex((t) => t.id === currentTrack.id))
      : -1;

  const upcomingItems =
    effectiveIndex >= 0
      ? queue.slice(effectiveIndex + 1).map((track, idx) => ({
          track,
          actualIndex: effectiveIndex + 1 + idx
        }))
      : queue.map((track, idx) => ({ track, actualIndex: idx }));

  const historyItems =
    effectiveIndex > 0
      ? queue.slice(0, effectiveIndex).map((track, idx) => ({
          track,
          actualIndex: idx
        }))
      : [];

  const totalUpcomingSeconds = upcomingItems.reduce(
    (acc, item) => acc + (item.track.duration || 210),
    0
  );
  const totalUpcomingMins = Math.max(1, Math.round(totalUpcomingSeconds / 60));

  const handleJumpToTrack = useCallback((track: Track, actualIndex: number) => {
    playTrack(track, queue, actualIndex);
  }, [playTrack, queue]);

  const handleMoveToTop = useCallback((fromActualIndex: number) => {
    const targetTopIndex = effectiveIndex >= 0 ? effectiveIndex + 1 : 0;
    if (fromActualIndex > targetTopIndex) {
      reorderQueue(fromActualIndex, targetTopIndex);
    }
  }, [effectiveIndex, reorderQueue]);

  const handleShuffleUpcoming = () => {
    if (upcomingItems.length <= 1) return;
    const beforeAndCurrent = effectiveIndex >= 0 ? queue.slice(0, effectiveIndex + 1) : [];
    const upcomingTracks = upcomingItems.map((i) => i.track);
    const shuffledUpcoming = shuffleArray(upcomingTracks);
    const nextQueue = [...beforeAndCurrent, ...shuffledUpcoming];
    usePlayerStore.setState({
      queue: nextQueue,
      isShuffled: true
    });
  };

  const handleClearUpcoming = () => {
    if (upcomingItems.length === 0) return;
    const keepCurrent = effectiveIndex >= 0 ? queue.slice(0, effectiveIndex + 1) : [];
    usePlayerStore.setState({
      queue: keepCurrent,
      originalQueue: keepCurrent
    });
  };

  const handleAiAutoFill = async () => {
    if (!currentTrack || isAiFilling) return;
    setIsAiFilling(true);
    try {
      const recs = await getSmartRecommendations(currentTrack, queue, 6);
      const existingIds = new Set(usePlayerStore.getState().queue.map((t) => t.id));
      const fresh = recs.filter((t) => !existingIds.has(t.id)).slice(0, 5);
      fresh.forEach((t) => addToQueue(t));
    } catch {
      // ignore
    } finally {
      setIsAiFilling(false);
    }
  };

  const handleSaveQueueAsPlaylist = () => {
    if (queue.length === 0) return;
    const label = currentTrack
      ? `${currentTrack.title.slice(0, 18)} Queue Mix`
      : `Studio Queue Mix`;
    const pl = createPlaylist(
      label,
      `Saved from WaveCraft Queue Studio • ${queue.length} tracks in 320kbps`,
      currentTrack?.thumbnail || queue[0]?.thumbnail || ''
    );
    queue.forEach((t) => addToPlaylist(pl.id, t));
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2400);
  };

  const handleDragStart = useCallback((actualIndex: number) => {
    dragNodeRef.current = actualIndex;
    setDraggedActualIndex(actualIndex);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, actualIndex: number) => {
    e.preventDefault();
    if (dragOverActualIndex !== actualIndex) {
      setDragOverActualIndex(actualIndex);
    }
  }, [dragOverActualIndex]);

  const handleDrop = useCallback((targetActualIndex: number) => {
    const fromIndex = dragNodeRef.current;
    if (fromIndex !== null && fromIndex !== targetActualIndex) {
      reorderQueue(fromIndex, targetActualIndex);
    }
    dragNodeRef.current = null;
    setDraggedActualIndex(null);
    setDragOverActualIndex(null);
  }, [reorderQueue]);

  const handleDragEnd = useCallback(() => {
    dragNodeRef.current = null;
    setDraggedActualIndex(null);
    setDragOverActualIndex(null);
  }, []);

  const artSrc = currentTrack?.thumbnailLarge || currentTrack?.thumbnail || DEFAULT_THUMBNAIL;

  return (
    <>
      {/* Translucent Spatial Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[105] bg-black/50 backdrop-blur-sm"
          />

          {/* Floating Liquid Glass Queue Studio Drawer / Mobile Sheet */}
          <motion.aside
            initial={isPhone ? { y: '100%', opacity: 0.5 } : { x: '104%', opacity: 0.5 }}
            animate={isPhone ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
            exit={isPhone ? { y: '100%', opacity: 0.5 } : { x: '104%', opacity: 0.5 }}
            transition={{ type: 'spring', damping: 32, stiffness: 340, mass: 0.65 }}
            className={`fixed z-[110] flex flex-col overflow-hidden text-white select-none ${
              isPhone
                ? 'inset-x-0 bottom-0 max-h-[88vh] rounded-t-[32px] glass-heavy liquid-glass border-t border-x border-white/20 shadow-[0_-20px_60px_rgba(0,0,0,0.95)]'
                : 'top-2.5 bottom-2.5 right-2.5 w-[calc(100vw-20px)] max-w-[435px] rounded-3xl glass-heavy liquid-glass border border-white/15 shadow-[0_30px_90px_rgba(0,0,0,0.88)]'
            }`}
            style={{
              paddingBottom: isPhone ? 'max(env(safe-area-inset-bottom, 0px), 12px)' : undefined
            }}
          >
            {/* Mobile Drag Handle */}
            {isPhone && (
              <div
                className="w-full pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing touch-none select-none"
                onClick={() => {
                  triggerAndroidHaptic('light');
                  onClose();
                }}
                title="Tap or drag to close"
              >
                <div className="w-12 h-1.5 rounded-full bg-white/30 active:scale-95 transition-all shadow-sm" />
              </div>
            )}
            {/* Subtle Ambient Album Art Tint inside Drawer */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
              <img
                src={artSrc}
                alt=""
                onError={(e) => {
                  (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                }}
                className="w-full h-64 object-cover blur-3xl scale-125"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-[#080810]/90 to-[#06060b]" />
            </div>

            {/* Top Header & Segmented Control Dock */}
            <div className="relative z-10 px-5 pt-5 pb-3.5 border-b border-white/[0.08] space-y-3.5 flex-shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] shadow-[0_0_10px_var(--color-accent)] animate-pulse flex-shrink-0" />
                  <div>
                    <h2 className="text-base font-extrabold tracking-tight text-white flex items-center gap-2">
                      <span>Queue Studio</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-white/[0.08] border border-white/10 text-white/70">
                        {upcomingItems.length} Up Next
                      </span>
                    </h2>
                    <p className="text-[11px] text-white/50 font-medium">
                      {upcomingItems.length > 0
                        ? `~${totalUpcomingMins} min remaining • Drag or tap arrows to reorder`
                        : 'Add songs or use AI Smart Fill below'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={onClose}
                  aria-label="Close Queue"
                  className="w-8 h-8 rounded-full glass-button flex items-center justify-center text-white/75 hover:text-white transition-all cursor-pointer flex-shrink-0"
                  title="Close Queue"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Segmented Tab Pill + Repeat Mode Badge */}
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1 p-1 rounded-full liquid-glass">
                  <button
                    onClick={() => setActiveTab('upnext')}
                    className={`px-3.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'upnext'
                        ? 'glass-button-primary text-white'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    <span>Up Next</span>
                    <span className="text-[10px] opacity-80">({upcomingItems.length})</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`px-3.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'history'
                        ? 'glass-button text-white'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    <span>Played</span>
                    <span className="text-[10px] opacity-80">({historyItems.length})</span>
                  </button>
                </div>

                {/* Quick Action Toolbar Pills */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleAiAutoFill}
                    disabled={!currentTrack || isAiFilling}
                    title="AI Smart Fill: Add 5 matching 320kbps tracks"
                    className="h-7 px-2.5 rounded-full glass-button-primary text-[11px] font-bold text-white flex items-center gap-1 transition-all cursor-pointer disabled:opacity-40"
                  >
                    {isAiFilling ? (
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <svg className="w-3 h-3 text-[var(--color-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                        <path d="M12 3v18M3 12h18" />
                      </svg>
                    )}
                    <span>AI +5</span>
                  </button>

                  <button
                    onClick={handleShuffleUpcoming}
                    disabled={upcomingItems.length <= 1}
                    title="Shuffle Upcoming Tracks"
                    className="w-7 h-7 rounded-full glass-button flex items-center justify-center text-white/75 hover:text-white transition-all cursor-pointer disabled:opacity-35"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
                      <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                    </svg>
                  </button>

                  <button
                    onClick={cycleRepeat}
                    title={`Repeat Mode: ${repeatMode.toUpperCase()}`}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer relative ${
                      repeatMode !== 'off'
                        ? 'glass-button-primary text-white'
                        : 'glass-button text-white/70 hover:text-white'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
                      <polyline points="17 1 21 5 17 9" />
                      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                      <polyline points="7 23 3 19 7 15" />
                      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    </svg>
                    {repeatMode === 'one' && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[var(--color-accent)] text-white text-[8px] font-black flex items-center justify-center">
                        1
                      </span>
                    )}
                  </button>

                  <button
                    onClick={handleSaveQueueAsPlaylist}
                    disabled={queue.length === 0}
                    title="Save Queue as Playlist in Library"
                    className={`h-7 px-2.5 rounded-full text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                      savedToast
                        ? 'glass-button-emerald text-emerald-300'
                        : 'glass-button text-white/75 hover:text-white'
                    }`}
                  >
                    {savedToast ? '✓ Saved' : 'Save'}
                  </button>
                </div>
              </div>
            </div>

            {/* Main Scrollable Queue Body */}
            <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-5">
              {/* NOW PLAYING HERO CARD */}
              {currentTrack && (
                <div>
                  <div className="flex items-center justify-between px-1 mb-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/45">
                      Now Playing
                    </span>
                  </div>

                  <div
                    onContextMenu={(e) => {
                      if (e.shiftKey) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const clientX = e.clientX;
                      const clientY = e.clientY;
                      useContextMenuStore.getState().openTrackMenu({ clientX, clientY }, currentTrack, queue);
                    }}
                    className="p-3.5 rounded-2xl liquid-glass border border-white/20 shadow-[0_12px_30px_rgba(0,0,0,0.45)] flex items-center gap-3.5"
                  >
                    <div
                      onClick={togglePlay}
                      className="relative w-13 h-13 rounded-xl overflow-hidden flex-shrink-0 cursor-pointer group border border-white/15 shadow-md"
                    >
                      <img
                        src={currentTrack.thumbnail || DEFAULT_THUMBNAIL}
                        alt={currentTrack.title}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                        }}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        {isPlaying ? (
                          <div className="flex items-end gap-0.5 h-3.5">
                            <span className="w-1 bg-[var(--color-accent)] rounded-full animate-eq-1" />
                            <span className="w-1 bg-[var(--color-accent)] rounded-full animate-eq-2" />
                            <span className="w-1 bg-[var(--color-accent)] rounded-full animate-eq-3" />
                          </div>
                        ) : (
                          <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        )}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-extrabold text-white truncate">
                        {currentTrack.title}
                      </p>
                      <p className="text-xs text-white/60 truncate mt-0.5">
                        {currentTrack.artist}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => toggleLike(currentTrack)}
                        aria-label={isCurrentLiked ? 'Unlike Track' : 'Like Track'}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                          isCurrentLiked
                            ? 'glass-button-primary text-white'
                            : 'glass-button text-white/60 hover:text-white'
                        }`}
                        title={isCurrentLiked ? 'Liked' : 'Like Track'}
                      >
                        <svg
                          className="w-4 h-4"
                          viewBox="0 0 24 24"
                          fill={isCurrentLiked ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          strokeWidth="2.2"
                        >
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                      </button>

                      <button
                        onClick={togglePlay}
                        aria-label={isPlaying ? 'Pause' : 'Play'}
                        className="w-8 h-8 rounded-full glass-button-primary text-white flex items-center justify-center hover:scale-105 transition-transform cursor-pointer"
                        title={isPlaying ? 'Pause' : 'Play'}
                      >
                        {isPlaying ? (
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* UP NEXT / PLAYED LIST */}
              {activeTab === 'upnext' ? (
                <div>
                  <div className="flex items-center justify-between px-1 mb-2.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/45">
                      Next Up in Queue ({upcomingItems.length})
                    </span>
                    {upcomingItems.length > 0 && (
                      <button
                        onClick={handleClearUpcoming}
                        className="text-[11px] font-bold text-white/45 hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        Clear Upcoming
                      </button>
                    )}
                  </div>

                  {upcomingItems.length === 0 ? (
                    <div className="py-12 px-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] text-center space-y-3">
                      <p className="text-xs text-white/55 font-medium">
                        No upcoming tracks in queue.
                      </p>
                      {currentTrack && (
                        <button
                          onClick={handleAiAutoFill}
                          disabled={isAiFilling}
                          className="px-4 py-2 rounded-full glass-button-primary text-white text-xs font-extrabold hover:scale-105 transition-transform cursor-pointer"
                        >
                          {isAiFilling ? 'Curating 320kbps Mix...' : '✨ Auto-Fill 5 Similar Songs'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {upcomingItems.map(({ track, actualIndex }, idx) => (
                        <QueueTrackRow
                          key={`${track.id}-${actualIndex}`}
                          track={track}
                          actualIndex={actualIndex}
                          idx={idx}
                          isBeingDragged={draggedActualIndex === actualIndex}
                          isDragTarget={
                            dragOverActualIndex === actualIndex &&
                            draggedActualIndex !== actualIndex
                          }
                          canMoveUp={idx > 0}
                          canMoveDown={idx < upcomingItems.length - 1}
                          queue={queue}
                          onDragStart={handleDragStart}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                          onDragEnd={handleDragEnd}
                          onJumpToTrack={handleJumpToTrack}
                          onMoveToTop={handleMoveToTop}
                          onReorder={reorderQueue}
                          onRemove={removeFromQueue}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* PLAYED / SESSION HISTORY TAB */
                <div>
                  <div className="flex items-center justify-between px-1 mb-2.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/45">
                      Previously Played in Queue ({historyItems.length})
                    </span>
                  </div>

                  {historyItems.length === 0 ? (
                    <div className="py-12 px-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] text-center">
                      <p className="text-xs text-white/50 font-medium">
                        Tracks you finish playing in this session will appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {historyItems.map(({ track, actualIndex }) => (
                        <div
                          key={`${track.id}-${actualIndex}`}
                          onClick={() => handleJumpToTrack(track, actualIndex)}
                          onContextMenu={(e) => {
                            if (e.shiftKey) return;
                            e.preventDefault();
                            e.stopPropagation();
                            const clientX = e.clientX;
                            const clientY = e.clientY;
                            useContextMenuStore.getState().openTrackMenu({ clientX, clientY }, track, queue);
                          }}
                          className="group flex items-center gap-3 p-2 rounded-2xl bg-white/[0.025] hover:bg-white/[0.08] border border-white/[0.05] hover:border-white/15 transition-all cursor-pointer"
                        >
                          <img
                            src={track.thumbnail || DEFAULT_THUMBNAIL}
                            alt={track.title}
                            loading="lazy"
                            decoding="async"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                            }}
                            className="w-10 h-10 rounded-xl object-cover opacity-75 group-hover:opacity-100 transition-opacity"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-white/75 group-hover:text-white truncate">
                              {track.title}
                            </p>
                            <p className="text-[11px] text-white/60 truncate mt-0.5">
                              {track.artist}
                            </p>
                          </div>
                          <span className="text-[10px] font-bold text-[var(--color-accent)] opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                            Replay ↺
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.aside>
    </>
  );
}

export default function QueuePanel({ isOpen, onClose }: QueuePanelProps) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>{isOpen && <QueuePanelContent onClose={onClose} />}</AnimatePresence>,
    document.body
  );
}
