import { useState, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useStudioStore } from '../../stores/studioStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { useDevicePreset } from '../../hooks/useDevicePreset';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import NowPlaying from '../player/NowPlaying';
import QueuePanel from '../player/QueuePanel';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';
import { formatTime } from '../../utils/formatTime';

/**
 * iOS / Apple Music style Elastic Snap Slider for MiniPlayer
 * Zero playback jitter, elastic boundary stretch with resistance, tactile spring release & haptic feedback.
 */
const MiniPlayerScrubber = memo(({ fallbackDuration, inline }: { fallbackDuration: number; inline?: boolean }) => {
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

  const calculateRatioAndOffset = (clientX: number) => {
    if (!trackRef.current) return { ratio: 0, offset: 0 };
    const rect = trackRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const width = rect.width;

    if (x < 0) {
      const pull = -x;
      const resisted = -Math.min(24, Math.pow(pull, 0.68) * 1.4);
      return { ratio: 0, offset: resisted };
    } else if (x > width) {
      const pull = x - width;
      const resisted = Math.min(24, Math.pow(pull, 0.68) * 1.4);
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

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onMouseLeave={() => setHoverTime(null)}
      className={
        inline
          ? `relative w-full cursor-pointer group select-none touch-none ${
              isDragging ? 'h-2.5' : 'h-1.5 hover:h-2'
            } transition-all duration-150`
          : `absolute top-0 left-4 right-4 cursor-pointer group z-20 select-none touch-none ${
              isDragging ? 'h-3 -top-0.5' : 'h-1.5 hover:h-2.5'
            } transition-all duration-150`
      }
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
          className="pointer-events-none absolute -top-2 px-2 py-0.5 rounded-md bg-black/95 border border-white/20 text-[10px] font-bold tabular-nums text-white shadow-xl will-change-transform z-30"
        >
          {formatTime(isDragging ? activeDisplayTime : (hoverTime || 0))}
        </div>
      )}

      {/* Ambient glow */}
      <div
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-[var(--color-accent)] via-rose-500 to-purple-500 blur-md ${
          isDragging ? 'h-4 opacity-75' : 'h-3 opacity-55'
        }`}
        style={{
          left: typeof fillLeft === 'number' ? `${fillLeft}px` : fillLeft,
          width: typeof fillWidth === 'number' ? `${fillWidth}px` : fillWidth,
          transition: transitionStyle
        }}
      />

      {/* Crisp rounded progress fill with glowing playhead tip */}
      <div
        className="relative h-full bg-gradient-to-r from-[var(--color-accent)] via-rose-500 to-purple-500 rounded-full"
        style={{
          left: typeof fillLeft === 'number' ? `${fillLeft}px` : fillLeft,
          width: typeof fillWidth === 'number' ? `${fillWidth}px` : fillWidth,
          boxShadow: isDragging ? '0 0 14px 2px var(--color-accent)' : '0 0 10px 1px var(--color-accent)',
          transition: transitionStyle
        }}
      />

      {/* iOS Style Elastic Thumb Head */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white shadow-[0_0_10px_2px_var(--color-accent)] pointer-events-none z-10 transition-transform duration-150 ${
          isDragging
            ? 'w-3.5 h-3.5 scale-125 opacity-100'
            : 'w-2.5 h-2.5 opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100'
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
  );
});
MiniPlayerScrubber.displayName = 'MiniPlayerScrubber';

const MiniPlayerTimeReadout = memo(({ fallbackDuration }: { fallbackDuration: number }) => {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const activeDuration = duration || fallbackDuration || 210;

  return (
    <span className="hidden md:inline tabular-nums font-medium">
      {formatTime(currentTime)} / {formatTime(activeDuration)}
    </span>
  );
});
MiniPlayerTimeReadout.displayName = 'MiniPlayerTimeReadout';

const MiniPlayerElapsedReadout = memo(() => {
  const currentTime = usePlayerStore((s) => s.currentTime);
  return (
    <span className="tabular-nums font-semibold text-[11px] text-white/55 min-w-[34px] text-right select-none">
      {formatTime(currentTime)}
    </span>
  );
});
MiniPlayerElapsedReadout.displayName = 'MiniPlayerElapsedReadout';

const MiniPlayerRemainingReadout = memo(({ fallbackDuration }: { fallbackDuration: number }) => {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const activeDuration = duration || fallbackDuration || 210;
  const remaining = Math.max(0, activeDuration - currentTime);
  return (
    <span className="tabular-nums font-semibold text-[11px] text-white/55 min-w-[38px] text-left select-none">
      -{formatTime(remaining)}
    </span>
  );
});
MiniPlayerRemainingReadout.displayName = 'MiniPlayerRemainingReadout';

export default function MiniPlayer() {
  const isNowPlayingOpen = usePlayerStore((s) => s.isNowPlayingOpen);
  const setIsNowPlayingOpen = usePlayerStore((s) => s.setIsNowPlayingOpen);
  const isQueueOpen = usePlayerStore((s) => s.isQueueOpen);
  const setIsQueueOpen = usePlayerStore((s) => s.setIsQueueOpen);
  const { isPhone } = useDevicePreset();

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const isShuffled = usePlayerStore((s) => s.isShuffled);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);

  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const isLiked = useLibraryStore((s) =>
    currentTrack ? Boolean(s.likedIds[currentTrack.id]) : false
  );

  const showLyrics = useSettingsStore((s) => s.showLyrics);
  const setShowLyrics = useSettingsStore((s) => s.setShowLyrics);
  const isSingActive = useStudioStore((s) => s.isSingActive);
  const singVocalLevel = useStudioStore((s) => s.singVocalLevel);
  const toggleSing = useStudioStore((s) => s.toggleSing);
  const setStudioModalOpen = useStudioStore((s) => s.setStudioModalOpen);

  if (!currentTrack) return null;

  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    setVolume(ratio);
  };

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleMiniPlayerTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleMiniPlayerTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    if (deltaY < -35 && Math.abs(deltaY) > Math.abs(deltaX) * 0.8) {
      // Swiped up -> expand to Fullscreen NowPlaying
      triggerAndroidHaptic('light');
      setIsNowPlayingOpen(true);
      return;
    }

    if (Math.abs(deltaX) > 42 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      if (deltaX < 0) {
        // Swiped left -> Skip forward
        triggerAndroidHaptic('medium');
        nextTrack();
      } else {
        // Swiped right -> Skip back
        triggerAndroidHaptic('medium');
        prevTrack();
      }
    }
  };

  // Phone UI Preset: Compact Native-Style Floating MiniPlayer Pill with Swipe-to-Skip & Drag-to-Expand
  if (isPhone) {
    return (
      <>
        <div
          style={{
            bottom: 'calc(max(env(safe-area-inset-bottom, 0px), 8px) + 68px)'
          }}
          className="fixed inset-x-0 z-40 px-3 pointer-events-none select-none flex justify-center"
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.35, bottom: 0.04 }}
            onDragEnd={(_, info) => {
              if (info.offset.y < -35 || info.velocity.y < -250) {
                triggerAndroidHaptic('light');
                setIsNowPlayingOpen(true);
              }
            }}
            className="w-full max-w-md pointer-events-auto gpu-layer select-none"
          >
            <div
              onClick={() => {
                triggerAndroidHaptic('light');
                setIsNowPlayingOpen(true);
              }}
              onTouchStart={handleMiniPlayerTouchStart}
              onTouchEnd={handleMiniPlayerTouchEnd}
              className="h-15 liquid-glass bg-[#080812]/90 backdrop-blur-3xl rounded-[24px] flex items-center justify-between px-3 relative overflow-hidden shadow-[0_18px_48px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.28)] border border-white/20 cursor-pointer active:scale-[0.99] transition-transform"
            >
              <MiniPlayerScrubber fallbackDuration={currentTrack.duration || 210} />

            {/* Left: Artwork & Track Info */}
            <div
              className="flex items-center gap-3 min-w-0 flex-1 pr-2"
              onContextMenu={(e) => {
                if (e.shiftKey) return;
                e.preventDefault();
                e.stopPropagation();
                triggerAndroidHaptic('medium');
                useContextMenuStore.getState().openTrackMenu(
                  { clientX: e.clientX, clientY: e.clientY },
                  currentTrack,
                  usePlayerStore.getState().queue
                );
              }}
            >
              <AnimatePresence mode="wait">
                <motion.img
                  layoutId="album-art-hero"
                  key={currentTrack.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 26 }}
                  src={currentTrack.thumbnail || DEFAULT_THUMBNAIL}
                  alt={currentTrack.title}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                  }}
                  className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border border-white/15 shadow-md"
                />
              </AnimatePresence>
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentTrack.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                  className="min-w-0 flex-1"
                >
                  <h4 className="text-xs font-extrabold text-white truncate">
                    {currentTrack.title}
                  </h4>
                  <p className="text-[11px] text-white/60 truncate">{currentTrack.artist}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Right: Thumb-friendly Like, Play/Pause, Next */}
            <div
              className="flex items-center gap-1 flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  triggerAndroidHaptic('light');
                  toggleLike(currentTrack);
                }}
                className={`w-9 h-9 flex items-center justify-center rounded-full active:scale-75 transition-transform cursor-pointer ${
                  isLiked ? 'glass-button-primary text-white' : 'glass-button text-white/70'
                }`}
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill={isLiked ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>

              <button
                onClick={() => {
                  triggerAndroidHaptic('light');
                  togglePlay();
                }}
                className="w-9 h-9 p-0 rounded-full glass-button-primary text-white flex items-center justify-center shadow-md active:scale-80 transition-transform cursor-pointer"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin" />
                ) : isPlaying ? (
                  <svg className="w-4 h-4 block" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6.5" y="5" width="3.5" height="14" rx="1.2" />
                    <rect x="14" y="5" width="3.5" height="14" rx="1.2" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 block" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7.5 5.65c0-.82.89-1.33 1.6-.91l10.05 6.35c.68.43.68 1.39 0 1.82L9.1 19.26c-.71.42-1.6-.09-1.6-.91V5.65z" />
                  </svg>
                )}
              </button>

              <button
                onClick={() => {
                  triggerAndroidHaptic('light');
                  nextTrack();
                }}
                className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white/85 active:scale-80 transition-transform cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      <QueuePanel isOpen={isQueueOpen} onClose={() => setIsQueueOpen(false)} />
        <NowPlaying isOpen={isNowPlayingOpen} onClose={() => setIsNowPlayingOpen(false)} />
      </>
    );
  }

  return (
    <>
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.25, bottom: 0.04 }}
        onDragEnd={(_, info) => {
          if (info.offset.y < -35 || info.velocity.y < -250) {
            triggerAndroidHaptic('light');
            setIsNowPlayingOpen(true);
          }
        }}
        className="px-4 pb-3 pt-1 relative z-30 gpu-layer"
      >
        <div className="h-21 liquid-glass bg-[#080812]/92 backdrop-blur-3xl rounded-2xl flex items-center justify-between px-6 relative overflow-visible shadow-[0_20px_60px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.18)] border border-white/[0.12]">
          {/* Zone 1 (Left - Track Metadata, Cover, Badges, Context Menu) */}
          <div
            className="w-[28%] max-w-sm flex items-center min-w-0 pr-3 gap-3.5"
            onContextMenu={(e) => {
              if (e.shiftKey) return;
              e.preventDefault();
              e.stopPropagation();
              useContextMenuStore.getState().openTrackMenu(
                { clientX: e.clientX, clientY: e.clientY },
                currentTrack,
                usePlayerStore.getState().queue
              );
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                layoutId="album-art-hero"
                key={currentTrack.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 360, damping: 26 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="relative w-13 h-13 rounded-xl overflow-hidden flex-shrink-0 cursor-pointer group shadow-lg border border-white/15 will-change-transform"
                onClick={() => setIsNowPlayingOpen(true)}
                title="Expand Now Playing"
              >
                <img
                  src={currentTrack.thumbnail || DEFAULT_THUMBNAIL}
                  alt={currentTrack.title}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                  }}
                  className={`w-full h-full object-cover transition-transform duration-500 ${
                    isPlaying ? 'scale-105' : 'scale-100'
                  }`}
                />
                <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </div>
              </motion.div>
            </AnimatePresence>

            <AnimatePresence mode="wait">
              <motion.div
                key={currentTrack.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                className="min-w-0 flex-1 will-change-transform"
              >
                <div className="flex items-center gap-1.5">
                  <h4
                    className="text-sm font-bold text-white truncate cursor-pointer hover:text-rose-400 transition-colors"
                    onClick={() => setIsNowPlayingOpen(true)}
                    title={currentTrack.title}
                  >
                    {currentTrack.title}
                  </h4>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-white/60 truncate" title={currentTrack.artist}>
                    {currentTrack.artist}
                  </p>
                  <span
                    className="px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase tracking-wider bg-white/10 text-white/80 border border-white/15 select-none hover:bg-white/15 transition-colors cursor-help flex-shrink-0"
                    title="Apple Lossless Audio Codec (ALAC) • 320kbps High-Resolution Stream"
                  >
                    Lossless
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Apple Music Star Favorite Button */}
            <motion.button
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.8 }}
              onClick={() => toggleLike(currentTrack)}
              title={isLiked ? 'Favorite (Starred)' : 'Favorite'}
              className="w-8 h-8 flex items-center justify-center rounded-full transition-colors flex-shrink-0 cursor-pointer"
            >
              {isLiked ? (
                <svg className="w-4 h-4 fill-amber-400 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 fill-none stroke-currentColor text-white/40 hover:text-white" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              )}
            </motion.button>

            {/* More Actions Menu Button */}
            <motion.button
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.8 }}
              onClick={(e) => {
                e.stopPropagation();
                useContextMenuStore.getState().openTrackMenu(
                  { clientX: e.clientX, clientY: e.clientY },
                  currentTrack,
                  usePlayerStore.getState().queue
                );
              }}
              title="More Actions"
              className="w-7 h-7 flex items-center justify-center rounded-full glass-button text-white/50 hover:text-white transition-colors flex-shrink-0 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </motion.button>
          </div>

          {/* Zone 2 (Center - Apple Music Transport Controls & Precision Scrubber) */}
          <div className="flex-1 max-w-xl px-4 flex flex-col items-center justify-center">
            {/* Transport Controls */}
            <div className="flex items-center justify-center gap-4">
              <motion.button
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.88 }}
                onClick={toggleShuffle}
                title={isShuffled ? 'Shuffle On' : 'Shuffle Off'}
                className={`w-8 h-8 p-0 flex items-center justify-center rounded-full transition-colors cursor-pointer relative ${
                  isShuffled ? 'text-rose-400' : 'text-white/60 hover:text-white'
                }`}
              >
                <svg className="w-4 h-4 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                </svg>
                {isShuffled && (
                  <span className="absolute bottom-0 w-1 h-1 rounded-full bg-rose-400" />
                )}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.12, x: -1 }}
                whileTap={{ scale: 0.88 }}
                onClick={prevTrack}
                title="Previous Track"
                className="w-8 h-8 p-0 flex items-center justify-center rounded-full text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                </svg>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.09 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                onClick={togglePlay}
                title={isPlaying ? 'Pause' : 'Play'}
                className="w-10 h-10 p-0 flex items-center justify-center rounded-full glass-button-primary text-white cursor-pointer will-change-transform shadow-[0_4px_16px_rgba(244,63,94,0.35)]"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : isPlaying ? (
                  <svg className="w-4 h-4 block" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6.5" y="5" width="3.5" height="14" rx="1.2" />
                    <rect x="14" y="5" width="3.5" height="14" rx="1.2" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 block" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7.5 5.65c0-.82.89-1.33 1.6-.91l10.05 6.35c.68.43.68 1.39 0 1.82L9.1 19.26c-.71.42-1.6-.09-1.6-.91V5.65z" />
                  </svg>
                )}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.12, x: 1 }}
                whileTap={{ scale: 0.88 }}
                onClick={nextTrack}
                title="Next Track"
                className="w-8 h-8 p-0 flex items-center justify-center rounded-full text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.88 }}
                onClick={cycleRepeat}
                title={
                  repeatMode === 'one'
                    ? 'Repeat One Track'
                    : repeatMode === 'all'
                    ? 'Repeat All'
                    : 'Repeat Off'
                }
                className={`w-8 h-8 p-0 flex items-center justify-center rounded-full transition-colors cursor-pointer relative ${
                  repeatMode !== 'off' ? 'text-rose-400' : 'text-white/60 hover:text-white'
                }`}
              >
                <svg className="w-4 h-4 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  {repeatMode === 'one' && (
                    <text
                      x="12"
                      y="13"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="8"
                      fill="currentColor"
                      stroke="none"
                      fontWeight="900"
                    >
                      1
                    </text>
                  )}
                </svg>
                {repeatMode !== 'off' && (
                  <span className="absolute bottom-0 w-1 h-1 rounded-full bg-rose-400" />
                )}
              </motion.button>
            </div>

            {/* Apple Music Scrubber Bar Row with Dual Time Labels */}
            <div className="w-full flex items-center gap-2.5 mt-1">
              <MiniPlayerElapsedReadout />
              <div className="flex-1 relative flex items-center">
                <MiniPlayerScrubber inline fallbackDuration={currentTrack.duration || 210} />
              </div>
              <MiniPlayerRemainingReadout fallbackDuration={currentTrack.duration || 210} />
            </div>
          </div>

          {/* Zone 3 (Right - Apple Music Utilities: Lyrics, Queue, Sing, Studio FX, Volume, Fullscreen) */}
          <div className="w-[28%] max-w-sm flex items-center justify-end gap-2.5 text-xs text-white/70">
            {/* Live Synced Lyrics Button (Image 1 Reference) */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                setShowLyrics(true);
                setIsNowPlayingOpen(true);
              }}
              title="Lyrics (Live Synced Lyrics)"
              className={`w-8 h-8 p-0 flex items-center justify-center rounded-full transition-all cursor-pointer ${
                showLyrics && isNowPlayingOpen
                  ? 'glass-button-primary text-rose-300 border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.4)]'
                  : 'glass-button text-white/75 hover:text-white'
              }`}
            >
              <svg className="w-4 h-4 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <line x1="8" y1="9" x2="16" y2="9" />
                <line x1="8" y1="13" x2="13" y2="13" />
              </svg>
            </motion.button>

            {/* Up Next Queue Button */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsQueueOpen(!isQueueOpen)}
              title="Up Next Queue"
              className={`w-8 h-8 p-0 flex items-center justify-center rounded-full transition-all cursor-pointer ${
                isQueueOpen
                  ? 'glass-button-primary text-white'
                  : 'glass-button text-white/75 hover:text-white'
              }`}
            >
              <svg className="w-4 h-4 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" strokeWidth="3" />
                <line x1="3" y1="12" x2="3.01" y2="12" strokeWidth="3" />
                <line x1="3" y1="18" x2="3.01" y2="18" strokeWidth="3" />
              </svg>
            </motion.button>

            {/* Apple Music Sing Vocal Slider / Toggle (Image 1 Reference) */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={toggleSing}
              title={
                isSingActive
                  ? `Apple Music Sing Active (${Math.round(singVocalLevel * 100)}% Vocals)`
                  : 'Apple Music Sing (Vocal Fader / Karaoke Mode)'
              }
              className={`w-8 h-8 p-0 flex items-center justify-center rounded-full transition-all cursor-pointer relative ${
                isSingActive
                  ? 'bg-rose-500/25 border border-rose-500/40 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.45)]'
                  : 'glass-button text-white/75 hover:text-white'
              }`}
            >
              <svg className="w-4 h-4 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              {isSingActive && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm animate-pulse" />
              )}
            </motion.button>

            {/* AirPlay / Studio FX */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setStudioModalOpen(true)}
              title="Studio Audio FX & Spatial 3D"
              className="w-8 h-8 p-0 flex items-center justify-center rounded-full glass-button text-white/75 hover:text-white cursor-pointer"
            >
              <svg className="w-4 h-4 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
                <polygon points="12 15 17 21 7 21 12 15" />
              </svg>
            </motion.button>

            {/* Volume Control */}
            <div className="hidden sm:flex items-center gap-2 w-28">
              <button
                onClick={toggleMute}
                title={isMuted || volume === 0 ? 'Unmute Audio' : 'Mute Audio'}
                className={`w-7 h-7 p-0 rounded-full flex items-center justify-center transition-colors cursor-pointer flex-shrink-0 ${
                  isMuted || volume === 0
                    ? 'glass-button-primary text-rose-300'
                    : 'glass-button text-white/75 hover:text-white'
                }`}
              >
                {isMuted || volume === 0 ? (
                  <svg className="w-4 h-4 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="22" y1="9" x2="16" y2="15" />
                    <line x1="16" y1="9" x2="22" y2="15" />
                  </svg>
                ) : volume < 0.4 ? (
                  <svg className="w-4 h-4 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                )}
              </button>
              <div
                className="flex-1 h-1.5 bg-white/20 rounded-full cursor-pointer relative group overflow-hidden"
                onClick={handleVolumeClick}
              >
                <div
                  className="h-full bg-white rounded-full group-hover:bg-rose-400 transition-all"
                  style={{ width: `${((isMuted ? 0 : volume) * 100).toFixed(1)}%` }}
                />
              </div>
            </div>

            {/* Full Screen Stage Toggle */}
            <motion.button
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.9 }}
              className="w-8 h-8 p-0 flex items-center justify-center rounded-full glass-button text-white/75 hover:text-white cursor-pointer"
              onClick={() => setIsNowPlayingOpen(true)}
              title="Full-Screen Stage (F11)"
            >
              <svg
                className="w-4 h-4 block"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </motion.button>
          </div>
        </div>
      </motion.div>

      <QueuePanel isOpen={isQueueOpen} onClose={() => setIsQueueOpen(false)} />
      <NowPlaying isOpen={isNowPlayingOpen} onClose={() => setIsNowPlayingOpen(false)} />
    </>
  );
}
