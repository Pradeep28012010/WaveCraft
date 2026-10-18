import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect, memo, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useStudioStore, STUDIO_FX_MODES } from '../../stores/studioStore';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import QueuePanel from './QueuePanel';
import LyricsView from '../lyrics/LyricsView';
import Visualizer, { type VisualizerStyle } from '../visualizer/Visualizer';
import WaveCardModal from './WaveCardModal';
import { toggleChorusPreview, isChorusPreviewActive } from '../../services/chorusPreview';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';

import { formatTime } from '../../utils/formatTime';
import { useDevicePreset } from '../../hooks/useDevicePreset';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import { useTrackOfflineStatus } from '../../services/offlineVault';
import { useColorExtract } from '../../hooks/useColorExtract';
import { useSleepTimer } from '../../hooks/useSleepTimer';
import WindowsTitleBar from '../layout/WindowsTitleBar';
import WaveformScrubber from './WaveformScrubber';
import HeartBurstButton from '../ui/HeartBurstButton';
import { getShareBaseUrl } from '../../services/apiConfig';

interface NowPlayingProps {
  isOpen: boolean;
  onClose: () => void;
}

const VISUALIZER_MODES: Array<{ id: VisualizerStyle; label: string }> = [
  { id: 'cyber-mesh', label: '3D Cyber Mesh' },
  { id: 'nebula', label: '3D Cosmic Nebula' },
  { id: 'analog-vu', label: 'Analog VU Meter' },
  { id: 'starfield', label: '3D Starfield' },
  { id: 'particles', label: 'Bio Orbs' },
  { id: 'circular', label: 'Radial Halo' },
  { id: 'blob', label: 'Liquid Blob' },
  { id: 'bars', label: 'Studio Bars' },
  { id: 'wave', label: 'Harmonic Wave' }
];

/**
 * Isolated 120fps GPU-Composited Scrubber (`transform: scaleX`)
 * Subscribes to `currentTime` independently so NowPlaying NEVER re-renders during song playback.
 */
/**
 * iOS / Apple Music style Elastic Snap Slider
 * Zero playback jitter, elastic resistance at bounds, tactile spring release & haptic feedback.
 */
const NowPlayingScrubber = memo(({ fallbackDuration }: { fallbackDuration: number }) => {
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
      // Elastic stretch before start (rubber-band resistance)
      const pull = -x;
      const resisted = -Math.min(32, Math.pow(pull, 0.68) * 1.5);
      return { ratio: 0, offset: resisted };
    } else if (x > width) {
      // Elastic stretch beyond end (rubber-band resistance)
      const pull = x - width;
      const resisted = Math.min(32, Math.pow(pull, 0.68) * 1.5);
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
    <div className="w-full mt-4 select-none touch-none">
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseLeave={() => setHoverTime(null)}
        className="relative cursor-pointer py-2 group flex items-center touch-none"
      >
        {/* Hover / Scrub Floating Time Bubble */}
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

        {/* Track Groove Background */}
        <div
          className={`w-full rounded-full bg-white/15 transition-all duration-200 ease-out overflow-visible relative ${
            isDragging ? 'h-2.5 bg-white/20' : 'h-1.5 group-hover:h-2'
          }`}
        >
          {/* Ambient Glow Diffusion Layer underneath */}
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

          {/* Active Progress Fill Bar with elastic bounds */}
          <div
            className="relative h-full bg-gradient-to-r from-[var(--color-accent)] via-rose-400 to-white rounded-full"
            style={{
              left: typeof fillLeft === 'number' ? `${fillLeft}px` : fillLeft,
              width: typeof fillWidth === 'number' ? `${fillWidth}px` : fillWidth,
              boxShadow: isDragging ? '0 0 16px 2px var(--color-accent)' : '0 0 10px 1px var(--color-accent)',
              transition: transitionStyle
            }}
          />

          {/* iOS Style Elastic Thumb Head - positioned independently for true rubber-band stretch */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full border-0 bg-white/95 shadow-[0_0_14px_2px_var(--color-accent)] backdrop-blur-sm pointer-events-none z-10 transition-transform duration-150 ${
              isDragging ? 'w-4 h-4 scale-125' : 'w-3 h-3 scale-90 group-hover:scale-115'
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

      {/* Symmetric Time Readout */}
      <div className="flex justify-between -mt-1 text-[11px] text-white/55 font-semibold tabular-nums">
        <span>{formatTime(activeDisplayTime)}</span>
        <span>-{formatTime(Math.max(0, activeDuration - activeDisplayTime))}</span>
      </div>
    </div>
  );
});
NowPlayingScrubber.displayName = 'NowPlayingScrubber';

const DECK_MODE_KEY = 'wavecraft_deck_mode_v1';

function NowPlayingContent({ onClose }: { onClose: () => void }) {
  const { isPhone } = useDevicePreset();
  const [showQueue, setShowQueue] = useState(false);
  const [deckMode, setDeckModeState] = useState<'cover' | 'vinyl'>(() => {
    try {
      const saved = localStorage.getItem(DECK_MODE_KEY);
      return saved === 'cover' ? 'cover' : 'vinyl';
    } catch {
      return 'vinyl';
    }
  });
  const [zenMode, setZenMode] = useState(false);
  const [showWaveCard, setShowWaveCard] = useState(false);
  const [waveCardQuote, setWaveCardQuote] = useState<string>('');
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showToolsMenu) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setShowToolsMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowToolsMenu(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('touchstart', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showToolsMenu]);

  const setDeckMode = (mode: 'cover' | 'vinyl') => {
    setDeckModeState(mode);
    try {
      localStorage.setItem(DECK_MODE_KEY, mode);
    } catch {}
  };

  // Atomic Zustand selectors (only active when full-screen NowPlaying is open)
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const isShuffled = usePlayerStore((s) => s.isShuffled);
  const playbackSpeed = usePlayerStore((s) => s.playbackSpeed);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const setPlaybackSpeed = usePlayerStore((s) => s.setPlaybackSpeed);

  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const playlists = useLibraryStore((s) => s.playlists);
  const isLiked = useLibraryStore((s) =>
    currentTrack ? Boolean(s.likedIds[currentTrack.id]) : false
  );
  const { trackIsOffline, isSavingOffline, toggleOfflineTrack } = useTrackOfflineStatus(
    currentTrack?.id || ''
  );
  const [toolsTab, setToolsTab] = useState<'tools' | 'playlist'>('tools');
  const [toolsPlaylistSearch, setToolsPlaylistSearch] = useState('');
  const [isCreatingInTools, setIsCreatingInTools] = useState(false);
  const [newPlaylistTitleInTools, setNewPlaylistTitleInTools] = useState('');
  const [toolsToast, setToolsToast] = useState<string | null>(null);

  const showToolsToast = (msg: string) => {
    setToolsToast(msg);
    setTimeout(() => {
      setToolsToast(null);
      setShowToolsMenu(false);
    }, 850);
  };


  const showVisualizer = useSettingsStore((s) => s.showVisualizer);
  const visualizerStyle = useSettingsStore((s) => s.visualizerStyle);
  const setVisualizerStyle = useSettingsStore((s) => s.setVisualizerStyle);
  const setShowVisualizer = useSettingsStore((s) => s.setShowVisualizer);
  const showLyrics = useSettingsStore((s) => s.showLyrics);
  const setShowLyrics = useSettingsStore((s) => s.setShowLyrics);
  const audioQuality = useSettingsStore((s) => s.audioQuality);
  const setAudioQuality = useSettingsStore((s) => s.setAudioQuality);
  const fxMode = useStudioStore((s) => s.fxMode);
  const isStudioModalOpen = useStudioStore((s) => s.isStudioModalOpen);
  const setStudioModalOpen = useStudioStore((s) => s.setStudioModalOpen);
  const preservePitch = useStudioStore((s) => s.preservePitch);
  const setPreservePitch = useStudioStore((s) => s.setPreservePitch);
  const {
    isActive: sleepActive,
    timeRemaining: sleepRemaining,
    endAtTrack: sleepEndAtTrack,
    startTimer: startSleepTimer,
    stopTimer: stopSleepTimer,
    setEndAtTrack
  } = useSleepTimer();

  const ambientVolumes = useStudioStore((s) => s.ambientVolumes);
  const isAmbientActive = useMemo(
    () => Object.values(ambientVolumes || {}).some((v) => v > 0.02),
    [ambientVolumes]
  );

  const handleTogglePlay = () => {
    triggerAndroidHaptic('medium');
    togglePlay();
  };
  const handleNextTrack = () => {
    triggerAndroidHaptic('light');
    nextTrack();
  };
  const handlePrevTrack = () => {
    triggerAndroidHaptic('light');
    prevTrack();
  };
  const handleToggleShuffle = () => {
    triggerAndroidHaptic('light');
    toggleShuffle();
  };
  const handleCycleRepeat = () => {
    triggerAndroidHaptic('light');
    cycleRepeat();
  };
  const handleToggleLike = () => {
    triggerAndroidHaptic('medium');
    if (currentTrack) toggleLike(currentTrack);
  };

  if (!currentTrack) return null;

  const nextUpTrack = queue[queueIndex + 1] || (repeatMode === 'all' ? queue[0] : null);
  const artSrc = currentTrack.thumbnailLarge || currentTrack.thumbnail || DEFAULT_THUMBNAIL;
  const { palette } = useColorExtract(artSrc);

  return (
    <motion.div
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 280, mass: 0.75 }}
      drag={isStudioModalOpen || showQueue || showWaveCard ? false : 'y'}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.04, bottom: 0.65 }}
      onDragEnd={(_, info) => {
        if (info.offset.y > 100 || info.velocity.y > 400) {
          triggerAndroidHaptic('light');
          onClose();
        }
      }}
      className="fixed inset-0 z-[90] flex flex-col bg-[#06060b] overflow-hidden select-none"
    >
      {/* Windows 11 Acrylic Frameless Title Bar (Electron Desktop App ONLY) */}
      <WindowsTitleBar />

          {/* Seamless Full-Bleed Ambient Album Art & Aurora Backdrop */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* Dynamic Mesh Aurora Orbs that pulse with the album palette */}
            <div
              className="absolute -top-24 -left-20 w-[48rem] h-[48rem] rounded-full blur-[100px] pointer-events-none transition-all duration-1000"
              style={{
                background: `radial-gradient(circle, ${palette.primary} 0%, transparent 68%)`,
                opacity: zenMode ? 0.16 : 0.32
              }}
            />
            <div
              className="absolute top-[20%] -right-24 w-[52rem] h-[52rem] rounded-full blur-[110px] pointer-events-none transition-all duration-1000"
              style={{
                background: `radial-gradient(circle, ${palette.secondary} 0%, transparent 65%)`,
                opacity: zenMode ? 0.14 : 0.28
              }}
            />
            <div
              className="absolute -bottom-28 left-[25%] w-[56rem] h-[56rem] rounded-full blur-[120px] pointer-events-none transition-all duration-1000"
              style={{
                background: `radial-gradient(circle, ${palette.tertiary} 0%, transparent 62%)`,
                opacity: zenMode ? 0.10 : 0.22
              }}
            />
            {/* Diffused Art Layer */}
            <img
              src={artSrc}
              alt=""
              onError={(e) => {
                (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
              }}
              className={`w-full h-full object-cover blur-3xl scale-150 transition-opacity duration-700 ${
                zenMode ? 'opacity-15' : 'opacity-30'
              }`}
            />
            <div
              className="absolute inset-0 transition-colors duration-1000"
              style={{
                background: `linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.62) 60%, ${palette.backgroundDark}dd 100%)`
              }}
            />
          </div>

          {/* Background or Fullscreen 3D Zen Visualizer Layer */}
          {(showVisualizer || zenMode) && (
            <div
              className={`absolute inset-0 pointer-events-none transition-opacity duration-500 z-0 ${
                zenMode ? 'opacity-95' : 'opacity-85'
              }`}
            >
              <Visualizer
                isActive={isPlaying}
                style={(visualizerStyle || 'cyber-mesh') as VisualizerStyle}
                fullScreen
              />
            </div>
          )}

          {/* Top Bar */}
          <div
            className={`relative z-30 app-region-no-drag ${
              isPhone ? 'h-13 px-4' : 'h-13 px-5 sm:px-8'
            } flex items-center justify-between flex-shrink-0`}
            style={{
              paddingTop: isPhone ? 'max(env(safe-area-inset-top), 4px)' : undefined
            }}
          >
            {isPhone ? (
              <>
                <button
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    onClose();
                  }}
                  className="w-10 h-10 flex items-center justify-center rounded-full glass-button text-white cursor-pointer active:scale-90 transition-transform"
                  title="Minimize Player"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                <div className="flex flex-col items-center max-w-[200px] text-center">
                  <span className="text-[10px] font-bold tracking-[0.16em] text-white/50 uppercase">
                    PLAYING FROM QUEUE
                  </span>
                  <span className="text-xs font-bold text-white/85 truncate">
                    {currentTrack.album && !/wavecraft/i.test(currentTrack.album) ? currentTrack.album : currentTrack.artist}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      setStudioModalOpen(true);
                    }}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 relative ${
                      fxMode !== 'normal'
                        ? 'glass-button-primary text-white shadow-[0_0_12px_rgba(250,45,72,0.4)]'
                        : isAmbientActive
                        ? 'glass-button-emerald text-white shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                        : 'glass-button text-white/80 hover:text-white'
                    }`}
                    title="Studio Audio FX & Atmosphere"
                  >
                    <svg className="w-4 h-4 text-white/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                    </svg>
                    {(isAmbientActive || fxMode !== 'normal') && (
                      <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${isAmbientActive && fxMode === 'normal' ? 'bg-emerald-400' : 'bg-rose-400'} animate-pulse`} />
                    )}
                  </button>

                  <button
                    onClick={(e) => {
                      triggerAndroidHaptic('light');
                      useContextMenuStore.getState().openTrackMenu(
                        { clientX: e.clientX, clientY: e.clientY },
                        currentTrack,
                        usePlayerStore.getState().queue
                      );
                    }}
                    className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white cursor-pointer active:scale-90 transition-transform"
                    title="Track Options & Playlist"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                    </svg>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2.5 app-region-no-drag">
                  <button
                    onClick={onClose}
                    className="w-10 h-10 flex items-center justify-center rounded-full glass-button text-white cursor-pointer app-region-no-drag"
                    title="Minimize Player"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {/* Cover vs Vinyl Turntable Switcher */}
                  {!zenMode && (
                    <div className="hidden sm:flex items-center p-1 rounded-full liquid-glass border-0 app-region-no-drag relative">
                      <button
                        onClick={() => {
                          triggerAndroidHaptic('light');
                          setDeckMode('cover');
                        }}
                        className="relative px-3.5 py-1 rounded-full text-[11px] font-bold cursor-pointer app-region-no-drag select-none"
                      >
                        {deckMode === 'cover' && (
                          <motion.div
                            layoutId="nowplaying-deck-mode-pill"
                            transition={{ type: 'spring', bounce: 0.15, duration: 0.32 }}
                            className="absolute inset-0 rounded-full liquid-sliding-pill -z-0 pointer-events-none"
                          />
                        )}
                        <span
                          className={`relative z-10 transition-colors duration-150 ${
                            deckMode === 'cover'
                              ? 'text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]'
                              : 'text-white/60 hover:text-white'
                          }`}
                        >
                          Cover
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          triggerAndroidHaptic('light');
                          setDeckMode('vinyl');
                        }}
                        className="relative px-3.5 py-1 rounded-full text-[11px] font-bold cursor-pointer app-region-no-drag select-none"
                      >
                        {deckMode === 'vinyl' && (
                          <motion.div
                            layoutId="nowplaying-deck-mode-pill"
                            transition={{ type: 'spring', bounce: 0.15, duration: 0.32 }}
                            className="absolute inset-0 rounded-full liquid-sliding-pill -z-0 pointer-events-none"
                          />
                        )}
                        <span
                          className={`relative z-10 transition-colors duration-150 ${
                            deckMode === 'vinyl'
                              ? 'text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]'
                              : 'text-white/60 hover:text-white'
                          }`}
                        >
                          Vinyl Deck
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-center text-center app-region-no-drag pointer-events-none">
                  <span className="text-[11px] font-bold tracking-[0.2em] text-white/50 uppercase">
                    Now Playing
                  </span>
                  {nextUpTrack && (
                    <span className="text-[11px] text-white/40 truncate max-w-xs mt-0.5">
                      Up Next: <span className="text-white/75 font-medium">{nextUpTrack.title}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 app-region-no-drag relative">
                  {/* Studio Audio FX & Atmosphere Button */}
                  <button
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      setStudioModalOpen(true);
                    }}
                    className={`px-4 h-9 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all app-region-no-drag relative ${
                      fxMode !== 'normal'
                        ? 'glass-button-primary text-white shadow-[0_0_16px_rgba(250,45,72,0.35)]'
                        : isAmbientActive
                        ? 'glass-button-emerald text-white shadow-[0_0_16px_rgba(16,185,129,0.35)]'
                        : 'glass-button text-white/90 hover:text-white'
                    }`}
                    title="Open Studio Audio FX & Atmosphere Soundscapes"
                  >
                    <svg className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="4" x2="4" y1="21" y2="14" />
                      <line x1="4" x2="4" y1="10" y2="3" />
                      <line x1="12" x2="12" y1="21" y2="12" />
                      <line x1="12" x2="12" y1="8" y2="3" />
                      <line x1="20" x2="20" y1="21" y2="16" />
                      <line x1="20" x2="20" y1="12" y2="3" />
                      <line x1="2" x2="6" y1="14" y2="14" />
                      <line x1="10" x2="14" y1="8" y2="8" />
                      <line x1="18" x2="22" y1="16" y2="16" />
                    </svg>
                    <span>
                      {fxMode !== 'normal'
                        ? STUDIO_FX_MODES.find((m) => m.id === fxMode)?.name || 'Studio FX'
                        : 'Studio FX'}
                    </span>
                    {isAmbientActive && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full flex items-center gap-1 font-semibold">
                        <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                        🌧️
                      </span>
                    )}
                  </button>

                  {/* Single Sleek ••• Tools Menu Button & Popover */}
                  <div ref={toolsMenuRef} className="relative">
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={() => setShowToolsMenu((prev) => !prev)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer app-region-no-drag ${
                        showToolsMenu
                          ? 'glass-button-primary text-white shadow-lg'
                          : 'glass-button text-white/80 hover:text-white'
                      }`}
                      title="Tools & Playback Options"
                      aria-label="Tools menu"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </motion.button>

                    {/* Frosted-glass ••• Tools Menu Popover */}
                    <AnimatePresence>
                      {showToolsMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: -6, scale: 0.92, filter: 'blur(12px)' }}
                          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                          exit={{ opacity: 0, y: -6, scale: 0.95, filter: 'blur(8px)' }}
                          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                          className="absolute right-0 top-12 w-72 max-h-[82vh] overflow-y-auto no-scrollbar rounded-[22px] border-0 glass-bloom-menu p-2 z-50 text-xs shadow-[0_24px_50px_rgba(0,0,0,0.7)] flex flex-col gap-1"
                      >
                        {/* Feedback Toast */}
                        {toolsToast && (
                          <div className="px-3 py-1.5 mb-1 rounded-xl bg-[var(--color-accent)]/25 border-0 text-[11px] font-bold text-white text-center animate-pulse">
                            ✓ {toolsToast}
                          </div>
                        )}

                        {toolsTab === 'playlist' ? (
                          /* ------------------------------------------------ */
                          /* INTEGRATED PLAYLIST PICKER IN FULLSCREEN PLAYER   */
                          /* ------------------------------------------------ */
                          <div className="flex flex-col gap-2 p-0.5">
                            {/* Top nav bar */}
                            <div className="flex items-center justify-between pb-1.5 border-0 px-1">
                              <button
                                type="button"
                                onClick={() => setToolsTab('tools')}
                                className="flex items-center gap-1 text-xs font-semibold text-white/70 hover:text-white transition-colors cursor-pointer"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <polyline points="15 18 9 12 15 6" />
                                </svg>
                                <span>Back</span>
                              </button>

                              <span className="text-xs font-bold text-white">Add to Playlist</span>

                              <button
                                type="button"
                                onClick={() => setIsCreatingInTools((prev) => !prev)}
                                className="text-xs font-bold text-[var(--color-accent)] hover:text-white px-2 py-0.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                              >
                                {isCreatingInTools ? 'Cancel' : '+ New'}
                              </button>
                            </div>

                            {/* Create new playlist input */}
                            {isCreatingInTools && (
                              <div className="p-2 rounded-xl bg-white/[0.08] border-0 flex flex-col gap-2">
                                <input
                                  type="text"
                                  autoFocus
                                  value={newPlaylistTitleInTools}
                                  onChange={(e) => setNewPlaylistTitleInTools(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newPlaylistTitleInTools.trim() && currentTrack) {
                                      const pl = useLibraryStore.getState().createPlaylist(newPlaylistTitleInTools.trim());
                                      useLibraryStore.getState().addToPlaylist(pl.id, currentTrack);
                                      setNewPlaylistTitleInTools('');
                                      setIsCreatingInTools(false);
                                      showToolsToast(`Created & added to "${pl.name}"`);
                                    }
                                    if (e.key === 'Escape') setIsCreatingInTools(false);
                                  }}
                                  placeholder="Playlist name..."
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border-0 text-white text-xs outline-none focus:ring-1 focus:ring-[var(--color-accent)] placeholder:text-white/40"
                                />
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setIsCreatingInTools(false)}
                                    className="px-2.5 py-1 rounded-lg text-[11px] text-white/60 hover:text-white cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (newPlaylistTitleInTools.trim() && currentTrack) {
                                        const pl = useLibraryStore.getState().createPlaylist(newPlaylistTitleInTools.trim());
                                        useLibraryStore.getState().addToPlaylist(pl.id, currentTrack);
                                        setNewPlaylistTitleInTools('');
                                        setIsCreatingInTools(false);
                                        showToolsToast(`Created & added to "${pl.name}"`);
                                      }
                                    }}
                                    className="px-3 py-1 rounded-lg bg-[var(--color-accent)] text-white text-[11px] font-bold shadow-sm cursor-pointer hover:brightness-110 active:scale-95 transition-all"
                                  >
                                    Create & Add
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Filter input */}
                            {playlists.length > 3 && (
                              <div className="relative px-0.5">
                                <input
                                  type="text"
                                  value={toolsPlaylistSearch}
                                  onChange={(e) => setToolsPlaylistSearch(e.target.value)}
                                  placeholder="Find playlist..."
                                  className="w-full px-2.5 py-1.5 pl-7 rounded-xl bg-white/[0.06] border-0 text-white text-xs outline-none focus:ring-1 focus:ring-[var(--color-accent)] placeholder:text-white/40"
                                />
                                <svg className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-white/40 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="11" cy="11" r="8" />
                                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                              </div>
                            )}

                            {/* Playlists list */}
                            <div className="max-h-[260px] overflow-y-auto no-scrollbar flex flex-col gap-1 pr-0.5">
                              {playlists
                                .filter((p) => !toolsPlaylistSearch.trim() || p.name.toLowerCase().includes(toolsPlaylistSearch.toLowerCase()))
                                .map((pl) => {
                                  const alreadyHasTrack = Boolean(currentTrack && Array.isArray(pl.tracks) && pl.tracks.some((t) => t.id === currentTrack.id));
                                  return (
                                    <button
                                      key={pl.id}
                                      type="button"
                                      onClick={() => {
                                        if (currentTrack) {
                                          triggerAndroidHaptic('light');
                                          useLibraryStore.getState().addToPlaylist(pl.id, currentTrack);
                                          showToolsToast(`Added to "${pl.name}"`);
                                        }
                                      }}
                                      className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-white/[0.12] active:bg-white/[0.18] transition-all text-left cursor-pointer group"
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                        <div className="w-7 h-7 rounded-lg overflow-hidden bg-white/10 border-0 flex-shrink-0 flex items-center justify-center">
                                          {pl.coverUrl ? (
                                            <img src={pl.coverUrl} alt={pl.name} className="w-full h-full object-cover" />
                                          ) : (
                                            <svg className="w-3.5 h-3.5 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/15 border-0 px-2 py-0.5 rounded-full flex-shrink-0">
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
                                })}

                              {playlists.length === 0 && (
                                <p className="text-[11px] text-white/40 py-4 text-center">No playlists created yet</p>
                              )}
                            </div>
                          </div>
                        ) : (
                          /* ------------------------------------------------ */
                          /* MAIN TOOLS MENU                                  */
                          /* ------------------------------------------------ */
                          <>
                            {/* Track Header Card */}
                            {currentTrack && (
                              <div className="flex items-center gap-2.5 p-2 mb-1 rounded-xl liquid-glass border-0">
                                <img
                                  src={currentTrack.thumbnail || DEFAULT_THUMBNAIL}
                                  alt={currentTrack.title}
                                  className="w-8 h-8 rounded-lg object-cover flex-shrink-0 shadow-sm border-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="font-extrabold text-white text-xs truncate leading-tight">
                                    {currentTrack.title}
                                  </p>
                                  <p className="text-[10px] text-white/60 truncate leading-tight mt-0.5">
                                    {currentTrack.artist}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Section 1: Track Actions */}
                            <div className="flex flex-col gap-0.5">
                              {/* Add to Playlist */}
                              <button
                                type="button"
                                onClick={() => setToolsTab('playlist')}
                                className="w-full flex items-center justify-between p-2 rounded-xl text-white/90 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer group"
                              >
                                <div className="flex items-center gap-2.5">
                                  <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="8" y1="6" x2="21" y2="6" />
                                    <line x1="8" y1="12" x2="21" y2="12" />
                                    <line x1="8" y1="18" x2="16" y2="18" />
                                    <line x1="3" y1="6" x2="3.01" y2="6" />
                                    <line x1="3" y1="12" x2="3.01" y2="12" />
                                    <line x1="3" y1="18" x2="3.01" y2="18" />
                                  </svg>
                                  <span className="font-semibold">Add to Playlist</span>
                                </div>
                                <svg className="w-3.5 h-3.5 text-white/50 group-hover:text-white group-hover:translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </button>

                              {/* Play Next in Queue */}
                              <button
                                type="button"
                                onClick={() => {
                                  if (currentTrack) {
                                    usePlayerStore.getState().addNext(currentTrack);
                                    showToolsToast('Queued to play next');
                                  }
                                }}
                                className="w-full flex items-center justify-between p-2 rounded-xl text-white/90 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  <svg className="w-4 h-4 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M5 4l10 8-10 8V4z" />
                                    <line x1="19" y1="5" x2="19" y2="19" />
                                  </svg>
                                  <span className="font-semibold">Play Next in Queue</span>
                                </div>
                              </button>

                              {/* Add to End of Queue */}
                              <button
                                type="button"
                                onClick={() => {
                                  if (currentTrack) {
                                    usePlayerStore.getState().addToQueue(currentTrack);
                                    showToolsToast('Added to end of queue');
                                  }
                                }}
                                className="w-full flex items-center justify-between p-2 rounded-xl text-white/90 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  <svg className="w-4 h-4 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="12" y1="5" x2="12" y2="19" />
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                  </svg>
                                  <span className="font-semibold">Add to End of Queue</span>
                                </div>
                              </button>

                              {/* Like / Favorite */}
                              <button
                                type="button"
                                onClick={() => {
                                  if (currentTrack) {
                                    toggleLike(currentTrack);
                                    showToolsToast(isLiked ? 'Removed from Liked' : 'Saved to Liked');
                                  }
                                }}
                                className="w-full flex items-center justify-between p-2 rounded-xl text-white/90 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  {isLiked ? (
                                    <svg className="w-4 h-4 text-rose-500 fill-current" viewBox="0 0 24 24">
                                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                                    </svg>
                                  ) : (
                                    <svg className="w-4 h-4 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                                    </svg>
                                  )}
                                  <span className="font-semibold">{isLiked ? 'Liked Song' : 'Save to Liked Songs'}</span>
                                </div>
                              </button>

                              {/* 15s Chorus Preview */}
                              <button
                                type="button"
                                onClick={() => {
                                  if (currentTrack) {
                                    toggleChorusPreview(currentTrack);
                                    setShowToolsMenu(false);
                                  }
                                }}
                                className="w-full flex items-center justify-between p-2 rounded-xl text-white/90 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="text-amber-400 font-bold text-sm">⚡</span>
                                  <span className="font-semibold">
                                    {isChorusPreviewActive(currentTrack?.id) ? 'Stop 15s Chorus' : '15s Chorus Drop Preview'}
                                  </span>
                                </div>
                              </button>

                              {/* Save to Offline Vault */}
                              <button
                                type="button"
                                onClick={async () => {
                                  if (currentTrack) {
                                    await toggleOfflineTrack(currentTrack);
                                    showToolsToast(trackIsOffline ? 'Removed from Vault' : 'Saved to Offline Vault');
                                  }
                                }}
                                className="w-full flex items-center justify-between p-2 rounded-xl text-white/90 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  {trackIsOffline ? (
                                    <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  ) : (
                                    <svg className="w-4 h-4 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                      <polyline points="7 10 12 15 17 10" />
                                      <line x1="12" y1="15" x2="12" y2="3" />
                                    </svg>
                                  )}
                                  <span className="font-semibold">{trackIsOffline ? 'In Offline Vault' : 'Download to Offline Vault'}</span>
                                </div>
                                <span className="text-[10px] text-white/40">{isSavingOffline ? 'Saving...' : '320kbps'}</span>
                              </button>

                              {/* Share Song */}
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!currentTrack) return;
                                  triggerAndroidHaptic('light');
                                  const shareText = `🎵 Listen to "${currentTrack.title}" by ${currentTrack.artist} on WaveCraft`;
                                  const shareUrl = `${getShareBaseUrl()}/?track=${encodeURIComponent(currentTrack.title)}`;
                                  try {
                                    if (navigator.share) {
                                      await navigator.share({
                                        title: `${currentTrack.title} - ${currentTrack.artist}`,
                                        text: shareText,
                                        url: shareUrl
                                      });
                                    } else if (navigator.clipboard) {
                                      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
                                      showToolsToast('Link copied to clipboard!');
                                    }
                                  } catch {
                                    // User cancelled or clipboard fallback
                                  }
                                }}
                                className="w-full flex items-center justify-between p-2 rounded-xl text-white/90 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  <svg className="w-4 h-4 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="18" cy="5" r="3" />
                                    <circle cx="6" cy="12" r="3" />
                                    <circle cx="18" cy="19" r="3" />
                                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                                  </svg>
                                  <span className="font-semibold">Share / Copy Link</span>
                                </div>
                              </button>
                            </div>

                            {/* Divider between Track actions and Studio tools */}
                            <div className="h-px bg-white/10 my-1 mx-1" />

                            {/* Section 2: Audio & Visual Studio Controls */}
                            <div className="flex flex-col gap-0.5">
                              {/* Atmosphere Soundscapes */}
                              <button
                                type="button"
                                onClick={() => {
                                  triggerAndroidHaptic('light');
                                  setShowToolsMenu(false);
                                  useStudioStore.getState().openStudioWithTab('atmosphere');
                                }}
                                className="w-full flex items-center justify-between p-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="text-sm">🌧️</span>
                                  <span className="font-medium">Atmosphere Mixer</span>
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    isAmbientActive
                                      ? 'glass-button-emerald text-emerald-200'
                                      : 'glass-button text-white/50'
                                  }`}
                                >
                                  {isAmbientActive ? 'Active' : 'Off'}
                                </span>
                              </button>

                              {/* Studio FX & EQ */}
                              <button
                                type="button"
                                onClick={() => {
                                  setShowToolsMenu(false);
                                  setStudioModalOpen(true);
                                }}
                                className="w-full flex items-center justify-between p-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="text-[var(--color-accent)] font-bold">🎛️</span>
                                  <span className="font-medium">Studio FX & EQ</span>
                                </div>
                                <span className="px-2 py-0.5 rounded-full glass-button text-[10px] font-semibold text-white/80">
                                  {fxMode !== 'normal'
                                    ? STUDIO_FX_MODES.find((m) => m.id === fxMode)?.name || 'Custom'
                                    : 'Default'}
                                </span>
                              </button>

                              {/* Generate Poster */}
                              <button
                                type="button"
                                onClick={() => {
                                  setWaveCardQuote('');
                                  setShowWaveCard(true);
                                  setShowToolsMenu(false);
                                }}
                                className="w-full flex items-center justify-between p-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  <svg className="w-4 h-4 text-[var(--color-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="3" width="18" height="18" rx="3" />
                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                    <polyline points="21 15 16 10 5 21" />
                                  </svg>
                                  <span className="font-medium">Generate Story Poster</span>
                                </div>
                                <span className="text-[10px] text-white/45">Visual</span>
                              </button>

                              {/* Visualizer Mode */}
                              <button
                                type="button"
                                onClick={() => {
                                  triggerAndroidHaptic('light');
                                  if (!showVisualizer) {
                                    setShowVisualizer(true);
                                    setVisualizerStyle(VISUALIZER_MODES[0].id);
                                    return;
                                  }
                                  const idx = VISUALIZER_MODES.findIndex((m) => m.id === visualizerStyle);
                                  if (idx === -1) {
                                    setVisualizerStyle(VISUALIZER_MODES[0].id);
                                  } else if (idx === VISUALIZER_MODES.length - 1) {
                                    setShowVisualizer(false);
                                  } else {
                                    const next = VISUALIZER_MODES[idx + 1];
                                    if (next) setVisualizerStyle(next.id);
                                  }
                                }}
                                className="w-full flex items-center justify-between p-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  <svg className="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <path d="M2 12h2M6 8v8M10 4v16M14 7v10M18 9v6M22 12h-2" />
                                  </svg>
                                  <span className="font-medium">Visualizer Mode</span>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  showVisualizer ? 'glass-button-cyan text-cyan-200' : 'glass-button text-white/50'
                                }`}>
                                  {showVisualizer
                                    ? (VISUALIZER_MODES.find((m) => m.id === visualizerStyle)?.label || '3D Cyber Mesh')
                                    : 'Off'}
                                </span>
                              </button>

                              {/* Interactive Visualizer Mode Chips */}
                              {showVisualizer && (
                                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-1 -mt-0.5 mb-1">
                                  {VISUALIZER_MODES.map((m) => {
                                    const isSel = visualizerStyle === m.id;
                                    return (
                                      <button
                                        key={m.id}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          triggerAndroidHaptic('light');
                                          setVisualizerStyle(m.id);
                                        }}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                                          isSel
                                            ? 'glass-button-cyan text-cyan-100 shadow-[0_0_8px_rgba(6,182,212,0.4)] scale-105'
                                            : 'glass-button text-white/60 hover:text-white hover:bg-white/10'
                                        }`}
                                      >
                                        {m.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              {/* 3D Zen Mode */}
                              <button
                                type="button"
                                onClick={() => {
                                  const nextZen = !zenMode;
                                  setZenMode(nextZen);
                                  if (nextZen) setShowVisualizer(true);
                                  setShowToolsMenu(false);
                                }}
                                className="w-full flex items-center justify-between p-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="text-sm">🧘</span>
                                  <span className="font-medium">3D Zen Mode</span>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  zenMode ? 'glass-button-primary text-white' : 'glass-button text-white/60'
                                }`}>
                                  {zenMode ? 'Active' : 'Off'}
                                </span>
                              </button>

                              {/* Sleep Timer */}
                              <button
                                type="button"
                                onClick={() => {
                                  if (!sleepActive) {
                                    startSleepTimer(30);
                                  } else if (sleepRemaining > 15 * 60) {
                                    startSleepTimer(15);
                                  } else if (!sleepEndAtTrack) {
                                    setEndAtTrack(true);
                                  } else {
                                    stopSleepTimer();
                                  }
                                }}
                                className="w-full flex items-center justify-between p-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="text-sm">🌙</span>
                                  <span className="font-medium">Sleep Timer</span>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  sleepActive ? 'glass-button-purple text-purple-200' : 'glass-button text-white/60'
                                }`}>
                                  {sleepActive ? (sleepEndAtTrack ? 'End of Song' : `${Math.ceil(sleepRemaining / 60)}m`) : 'Off'}
                                </span>
                              </button>

                              {/* Audio Quality */}
                              <button
                                type="button"
                                onClick={() => {
                                  const qualities: Array<'auto' | 'high' | 'medium' | 'low'> = ['auto', 'high', 'medium', 'low'];
                                  const nextQ = qualities[(qualities.indexOf(audioQuality) + 1) % qualities.length] || 'auto';
                                  setAudioQuality(nextQ);
                                }}
                                className="w-full flex items-center justify-between p-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                  </svg>
                                  <span className="font-medium">Audio Quality</span>
                                </div>
                                <span className="px-2 py-0.5 rounded-full glass-button text-[10px] font-semibold text-white/80 uppercase">
                                  {audioQuality === 'auto' ? 'HD (Auto)' : audioQuality === 'high' ? '320k AAC' : audioQuality === 'medium' ? '192k' : '128k'}
                                </span>
                              </button>

                              {/* Pitch Lock / Shift */}
                              <button
                                type="button"
                                onClick={() => setPreservePitch(!preservePitch)}
                                className="w-full flex items-center justify-between p-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="text-sm">{preservePitch ? '🔒' : '🎵'}</span>
                                  <span className="font-medium">Pitch Control</span>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  preservePitch ? 'glass-button text-white/70' : 'glass-button-amber text-amber-200'
                                }`}>
                                  {preservePitch ? 'Pitch Locked' : 'Tape Shift'}
                                </span>
                              </button>

                              {/* Playback Speed */}
                              <button
                                type="button"
                                onClick={() => {
                                  const speeds = [0.75, 1, 1.25, 1.5];
                                  const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length] || 1;
                                  setPlaybackSpeed(next);
                                }}
                                className="w-full flex items-center justify-between p-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="text-sm">⚡</span>
                                  <span className="font-medium">Playback Speed</span>
                                </div>
                                <span className="px-2 py-0.5 rounded-full glass-button text-[10px] font-semibold text-white/80">
                                  {playbackSpeed}x
                                </span>
                              </button>
                            </div>
                          </>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                </div>
              </>
            )}
          </div>

          {/* ZEN MODE FLOATING 3D VISUALIZER HUD */}
          {zenMode ? (
            <div className="relative z-10 flex-1 flex flex-col justify-between p-6 sm:p-10">
              <div className="flex flex-wrap items-center justify-center gap-1.5 mx-auto p-1.5 rounded-full liquid-glass border-0 shadow-2xl relative">
                {VISUALIZER_MODES.map((m) => {
                  const isSelected = visualizerStyle === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        setVisualizerStyle(m.id);
                      }}
                      className="relative px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer select-none"
                    >
                      {isSelected && (
                        <motion.div
                          layoutId="nowplaying-zen-visualizer-pill"
                          transition={{ type: 'spring', bounce: 0.15, duration: 0.32 }}
                          className="absolute inset-0 rounded-full liquid-sliding-pill -z-0 pointer-events-none"
                        />
                      )}
                      <span
                        className={`relative z-10 transition-colors duration-150 ${
                          isSelected
                            ? 'text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        {m.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="w-full max-w-2xl mx-auto rounded-3xl liquid-glass border-0 p-5 shadow-2xl">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <img
                      src={artSrc}
                      alt={currentTrack.title}
                      className={`w-12 h-12 rounded-full object-cover border-0 will-change-transform ${
                        isPlaying ? 'animate-spin' : ''
                      }`}
                      style={{ animationDuration: '8s' }}
                    />
                    <div className="min-w-0">
                      <h3 className="text-base font-extrabold text-white truncate">
                        {currentTrack.title}
                      </h3>
                      <p className="text-xs text-white/60 truncate">{currentTrack.artist}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={prevTrack}
                      aria-label="Previous track"
                      title="Previous track"
                      className="text-white/75 hover:text-white cursor-pointer"
                    >
                      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={togglePlay}
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                      title={isPlaying ? 'Pause' : 'Play'}
                      className="w-12 h-12 p-0 rounded-full glass-button-primary text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform cursor-pointer"
                    >
                      {isPlaying ? (
                        <svg className="w-6 h-6 block" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6.5" y="5" width="3.5" height="14" rx="1.2" />
                          <rect x="14" y="5" width="3.5" height="14" rx="1.2" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6 block" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M7.5 5.65c0-.82.89-1.33 1.6-.91l10.05 6.35c.68.43.68 1.39 0 1.82L9.1 19.26c-.71.42-1.6-.09-1.6-.91V5.65z" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={nextTrack}
                      aria-label="Next track"
                      title="Next track"
                      className="text-white/75 hover:text-white cursor-pointer"
                    >
                      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* STANDARD / VINYL TURNTABLE STUDIO VIEW */
            <div
              className="relative z-10 flex-1 min-h-0 px-4 sm:px-12 pt-6 sm:pt-8 pb-4 overflow-y-auto no-scrollbar flex flex-col"
            >
              <div
                className={`w-full max-w-6xl my-auto mx-auto ${
                  !isPhone && showLyrics
                    ? 'grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 xl:gap-14 items-center'
                    : 'flex flex-col items-center justify-center max-w-lg'
                }`}
              >
                {/* Left / Center Player Column */}
                <div
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
                  className={`flex flex-col items-center justify-center w-full my-auto ${
                    !isPhone && showLyrics ? 'lg:col-span-5 max-w-md mx-auto' : 'max-w-lg'
                  }`}
                >
                  {/* On Phone: When Lyrics Active, Lyrics takes the Center Stage with fluid full-height layout */}
                  {isPhone && showLyrics ? (
                    <motion.div
                      key="mobile-lyrics-stage"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                      className="w-full h-[46vh] min-h-[300px] max-h-[460px] my-auto flex flex-col will-change-transform"
                    >
                      <LyricsView
                        artist={currentTrack.artist}
                        title={currentTrack.title}
                        headerTitle="SYNCHRONIZED LYRICS"
                        onClose={() => {
                          triggerAndroidHaptic('light');
                          setShowLyrics(false);
                        }}
                        onShareLyric={(quote) => {
                          setWaveCardQuote(quote);
                          setShowWaveCard(true);
                        }}
                      />
                    </motion.div>
                  ) : (
                    <div
                      className={`relative flex items-center justify-center flex-shrink-0 ${
                        showLyrics
                          ? 'w-[min(24vh,190px)] h-[min(24vh,190px)] sm:w-[min(28vh,230px)] sm:h-[min(28vh,230px)]'
                          : 'w-[min(28vh,220px)] h-[min(28vh,220px)] sm:w-[min(34vh,270px)] sm:h-[min(34vh,270px)]'
                      }`}
                    >
                      {/* Shared Ambient Album Glow behind either Deck or Cover */}
                      <div
                        className="absolute inset-0 rounded-full pointer-events-none transition-all duration-1000 will-change-transform"
                        style={{
                          background: `radial-gradient(circle, ${palette.primary}80 0%, ${palette.secondary}40 45%, transparent 70%)`,
                          opacity: isPlaying ? 0.95 : 0.5
                        }}
                      />

                      <AnimatePresence mode="wait" initial={false}>
                        {deckMode === 'vinyl' ? (
                          <motion.div
                            key="nowplaying-deck-vinyl"
                            initial={{ opacity: 0, scale: 0.85, rotate: -12, filter: 'blur(6px)' }}
                            animate={{ opacity: 1, scale: 1, rotate: 0, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, scale: 0.85, rotate: 12, filter: 'blur(6px)' }}
                            transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.85 }}
                            onClick={() => {
                              triggerAndroidHaptic('light');
                              setDeckMode('cover');
                            }}
                            title="Click to switch to Album Cover"
                            className="relative w-full h-full flex items-center justify-center cursor-pointer select-none will-change-transform"
                          >
                            {/* 1. Cast Aluminum Heavy Platter Bezel with Strobe Dots Rim */}
                            <div className="absolute -inset-2 sm:-inset-2.5 rounded-full pointer-events-none border border-white/10 shadow-[0_24px_64px_rgba(0,0,0,0.92),0_0_0_1px_rgba(255,255,255,0.06)] bg-gradient-to-b from-[#252530] via-[#121218] to-[#0a0a0e] flex items-center justify-center overflow-hidden">
                              {/* Strobe dots knurled pattern around rotating platter edge */}
                              <div
                                className="absolute inset-0 rounded-full opacity-35"
                                style={{
                                  background:
                                    'repeating-conic-gradient(from 0deg, #94a3b8 0deg 1.5deg, transparent 1.5deg 3deg)',
                                  animation: 'spin 2.2s linear infinite',
                                  animationPlayState: isPlaying ? 'running' : 'paused'
                                }}
                              />
                              {/* Platter top chamfer highlight */}
                              <div className="absolute inset-0 rounded-full border border-white/15 pointer-events-none" />
                            </div>

                            {/* 2. Target Strobe Light Tower (Technics SL-1200 Style) */}
                            <div className="absolute top-0.5 left-0.5 w-5.5 h-5.5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-950 border border-white/20 shadow-[0_4px_12px_rgba(0,0,0,0.8)] flex items-center justify-center pointer-events-none z-10">
                              <div
                                className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full transition-all duration-500 ${
                                  isPlaying
                                    ? 'bg-amber-300 shadow-[0_0_12px_#f59e0b,0_0_24px_rgba(245,158,11,0.6)]'
                                    : 'bg-zinc-600'
                                }`}
                              />
                            </div>

                            {/* 3. Spinning 180-Gram Vinyl Record with Realistic Sound Bands */}
                            <div
                              className="relative w-full h-full rounded-full border-0 flex items-center justify-center overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.95)]"
                              style={{
                                background: `
                                  radial-gradient(circle at center,
                                    transparent 0%,
                                    transparent 34%,
                                    #16161e 34.5%,
                                    #0a0a0e 35%,
                                    #1c1c26 36%,
                                    #0e0e14 43%,
                                    #060609 43.5%,
                                    #161620 44%,
                                    #0a0a0f 47.5%,
                                    #181824 51.5%,
                                    #0c0c12 55.5%,
                                    #050508 56%,
                                    #181824 56.5%,
                                    #0b0b10 61%,
                                    #1a1a26 66%,
                                    #0d0d14 71.5%,
                                    #050508 72%,
                                    #191926 72.5%,
                                    #0b0b10 78%,
                                    #1c1c28 84%,
                                    #0d0d14 90%,
                                    #14141e 94.5%,
                                    #08080c 96%,
                                    #232330 98%,
                                    #08080c 100%
                                  )
                                `,
                                animation: 'spin 2.2s linear infinite',
                                animationPlayState: isPlaying ? 'running' : 'paused'
                              }}
                            >
                              {/* Fine Micro-Groove Audio Spirals */}
                              <div
                                className="absolute inset-0 rounded-full opacity-45 pointer-events-none"
                                style={{
                                  background:
                                    'repeating-radial-gradient(circle at center, #181822 0px, #181822 1.5px, #0c0c12 2px, #08080c 3px)'
                                }}
                              />

                              {/* Center Record Label with Album Art */}
                              <div className="w-[38%] h-[38%] rounded-full overflow-hidden border border-white/10 shadow-[0_0_16px_rgba(0,0,0,0.9),inset_0_0_8px_rgba(0,0,0,0.6)] relative z-0 flex items-center justify-center">
                                <img
                                  src={artSrc}
                                  alt={currentTrack.title}
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                                  }}
                                  className="w-full h-full object-cover"
                                />
                                {/* Vinyl pressing stamp indentation ring */}
                                <div className="absolute inset-2 sm:inset-3 rounded-full border border-white/20 pointer-events-none" />
                                {/* Center spindle hole brass bushing */}
                                <div className="absolute inset-0 m-auto w-4.5 h-4.5 rounded-full bg-gradient-to-br from-amber-200 via-amber-400 to-amber-700 p-0.5 shadow-md flex items-center justify-center">
                                  {/* Center spindle chrome pin */}
                                  <div className="w-full h-full rounded-full bg-gradient-to-tr from-zinc-200 via-zinc-100 to-zinc-400 shadow-inner flex items-center justify-center">
                                    <div className="w-1 h-1 rounded-full bg-zinc-950/70" />
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* 4. Stationary Anisotropic Vinyl Glare (Shimmering Double Butterfly Cones) */}
                            <div
                              className="absolute inset-0 rounded-full pointer-events-none mix-blend-screen opacity-70"
                              style={{
                                background: `conic-gradient(
                                  from -35deg at 50% 50%,
                                  transparent 0deg,
                                  rgba(255,255,255,0.02) 20deg,
                                  rgba(255,255,255,0.18) 42deg,
                                  rgba(255,255,255,0.32) 45deg,
                                  rgba(255,255,255,0.18) 48deg,
                                  rgba(255,255,255,0.02) 70deg,
                                  transparent 90deg,
                                  transparent 180deg,
                                  rgba(255,255,255,0.02) 200deg,
                                  rgba(255,255,255,0.18) 222deg,
                                  rgba(255,255,255,0.32) 225deg,
                                  rgba(255,255,255,0.18) 228deg,
                                  rgba(255,255,255,0.02) 250deg,
                                  transparent 270deg
                                )`
                              }}
                            />

                            {/* Outer Vinyl Gloss Edge Ring */}
                            <div className="absolute inset-0 rounded-full pointer-events-none border border-white/10 shadow-inner" />

                            {/* 5. Precision Audiophile S-Shaped Tonearm */}
                            <motion.div
                              initial={{ opacity: 0, y: -20, rotate: -10 }}
                              animate={{
                                opacity: 1,
                                y: 0,
                                rotate: isPlaying ? 22 : 0
                              }}
                              exit={{ opacity: 0, y: -15, rotate: -8 }}
                              transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.04 }}
                              className="absolute top-0 right-0 sm:right-1 w-20 h-44 sm:w-24 sm:h-52 pointer-events-none z-20 origin-[65.5%_15%]"
                              style={{
                                transformOrigin: '65.5% 15%'
                              }}
                            >
                              <svg
                                viewBox="0 0 110 240"
                                className="w-full h-full drop-shadow-[0_16px_28px_rgba(0,0,0,0.92)] pointer-events-none overflow-visible"
                              >
                                <defs>
                                  {/* Chrome Tube Gradient */}
                                  <linearGradient id="tonearm-tube-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#475569" />
                                    <stop offset="25%" stopColor="#cbd5e1" />
                                    <stop offset="50%" stopColor="#ffffff" />
                                    <stop offset="75%" stopColor="#94a3b8" />
                                    <stop offset="100%" stopColor="#334155" />
                                  </linearGradient>

                                  {/* Gimbal Metallic Gradient */}
                                  <radialGradient id="gimbal-grad" cx="45%" cy="38%" r="62%">
                                    <stop offset="0%" stopColor="#f8fafc" />
                                    <stop offset="40%" stopColor="#94a3b8" />
                                    <stop offset="80%" stopColor="#334155" />
                                    <stop offset="100%" stopColor="#0f172a" />
                                  </radialGradient>

                                  {/* Counterweight Gradient */}
                                  <linearGradient id="counterweight-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#334155" />
                                    <stop offset="30%" stopColor="#e2e8f0" />
                                    <stop offset="65%" stopColor="#64748b" />
                                    <stop offset="100%" stopColor="#0f172a" />
                                  </linearGradient>

                                  {/* Cartridge Gold Accent */}
                                  <linearGradient id="cartridge-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#fef08a" />
                                    <stop offset="50%" stopColor="#eab308" />
                                    <stop offset="100%" stopColor="#854d0e" />
                                  </linearGradient>
                                </defs>

                                {/* A. Gimbal Pivot Housing */}
                                <circle cx="72" cy="36" r="18" fill="url(#gimbal-grad)" stroke="#1e293b" strokeWidth="1" />
                                <circle cx="72" cy="36" r="13" fill="#0f172a" stroke="#475569" strokeWidth="0.8" />
                                <circle cx="72" cy="36" r="8.5" fill="url(#gimbal-grad)" />
                                <circle cx="72" cy="36" r="4" fill="#090d16" stroke="#e2e8f0" strokeWidth="0.8" />
                                <circle cx="71" cy="35" r="1.2" fill="#ffffff" opacity="0.9" />

                                {/* Cueing Lever Bar */}
                                <path d="M 85 45 L 94 49" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" />
                                <circle cx="94" cy="49" r="2.5" fill="#fa2d48" />

                                {/* B. Threaded Rear Counterweight */}
                                <rect x="63" y="10" width="18" height="15" rx="3" fill="url(#counterweight-grad)" stroke="#1e293b" strokeWidth="0.8" />
                                <line x1="63" y1="14" x2="81" y2="14" stroke="#090d16" strokeWidth="0.8" opacity="0.65" />
                                <line x1="63" y1="17" x2="81" y2="17" stroke="#090d16" strokeWidth="0.8" opacity="0.65" />
                                <line x1="63" y1="20" x2="81" y2="20" stroke="#090d16" strokeWidth="0.8" opacity="0.65" />
                                <rect x="67" y="5" width="10" height="5" rx="1.5" fill="#0f172a" stroke="#475569" strokeWidth="0.8" />

                                {/* C. Curved S-Shaped Chrome Tonearm Tube */}
                                <path
                                  d="M 72 40 C 72 70, 58 95, 58 135 C 58 165, 46 182, 38 202"
                                  fill="none"
                                  stroke="rgba(0,0,0,0.5)"
                                  strokeWidth="5.5"
                                  strokeLinecap="round"
                                />
                                <path
                                  d="M 72 40 C 72 70, 58 95, 58 135 C 58 165, 46 182, 38 202"
                                  fill="none"
                                  stroke="url(#tonearm-tube-grad)"
                                  strokeWidth="4"
                                  strokeLinecap="round"
                                />
                                <path
                                  d="M 71.5 41 C 71.5 70, 57.5 95, 57.5 135 C 57.5 165, 45.5 182, 37.5 202"
                                  fill="none"
                                  stroke="#ffffff"
                                  strokeWidth="1.1"
                                  strokeLinecap="round"
                                  opacity="0.8"
                                />

                                {/* D. Headshell & Cartridge Assembly */}
                                <g transform="translate(38, 202)">
                                  {/* Finger lift hook */}
                                  <path
                                    d="M 4 -2 C 9 -5, 14 -3, 14 3 C 14 7, 11 9, 8 9"
                                    fill="none"
                                    stroke="#cbd5e1"
                                    strokeWidth="1.6"
                                    strokeLinecap="round"
                                  />
                                  {/* Angled Headshell Body */}
                                  <polygon points="-7,-4 7,-1 5,16 -5,14" fill="#09090e" stroke="#334155" strokeWidth="0.8" />
                                  {/* Audiophile Red Stripe */}
                                  <line x1="-6" y1="5" x2="6" y2="7.5" stroke="#fa2d48" strokeWidth="1.5" />
                                  {/* Stylus Cartridge Body */}
                                  <polygon points="-4,13 4,14.5 3,22 -3,21" fill="url(#cartridge-gold)" stroke="#78350f" strokeWidth="0.6" />
                                  {/* Diamond Stylus Tip Point */}
                                  <circle cx="0" cy="23" r="1.5" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="0.5" />
                                  {/* Stylus Needle Sparkle */}
                                  <line x1="0" y1="21.5" x2="0" y2="24.5" stroke="#ffffff" strokeWidth="0.8" />
                                  <line x1="-1.5" y1="23" x2="1.5" y2="23" stroke="#ffffff" strokeWidth="0.8" />
                                </g>
                              </svg>
                            </motion.div>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="nowplaying-deck-cover"
                            initial={{ opacity: 0, scale: 0.85, rotate: 8, filter: 'blur(6px)' }}
                            animate={{ opacity: 1, scale: isPlaying ? 1 : 0.95, rotate: 0, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, scale: 0.85, rotate: -8, filter: 'blur(6px)' }}
                            transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.85 }}
                            onClick={() => {
                              triggerAndroidHaptic('light');
                              setDeckMode('vinyl');
                            }}
                            title="Click to switch to Spinning Vinyl Turntable"
                            className="relative w-full h-full aspect-square rounded-3xl overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.75)] border-0 flex-shrink-0 cursor-pointer select-none will-change-transform"
                          >
                            <img
                              src={artSrc}
                              alt={currentTrack.title}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                              }}
                              className="w-full h-full object-cover"
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Track Title & Artist */}
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 340, damping: 28, delay: 0.05 }}
                    className="mt-4 sm:mt-5 w-full flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl sm:text-2xl font-extrabold text-white truncate">
                          {currentTrack.title}
                        </h2>
                        {trackIsOffline && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border-0 whitespace-nowrap flex-shrink-0">
                            Offline
                          </span>
                        )}
                      </div>
                      <p className="text-sm sm:text-base text-white/60 mt-0.5 font-medium truncate">
                        {currentTrack.artist}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* One-tap Offline Vault Download */}
                      <button
                        type="button"
                        onClick={() => {
                          triggerAndroidHaptic('medium');
                          if (currentTrack) toggleOfflineTrack(currentTrack);
                        }}
                        aria-label={trackIsOffline ? 'Saved in Offline Vault (Click to remove)' : 'Download for offline playback'}
                        title={
                          trackIsOffline
                            ? 'Saved in Offline Vault (Click to remove)'
                            : isSavingOffline
                            ? 'Downloading 320kbps audio...'
                            : 'Download for 100% Offline Playback'
                        }
                        className={`w-10 h-10 p-0 flex items-center justify-center rounded-full flex-shrink-0 transition-transform cursor-pointer active:scale-75 ${
                          trackIsOffline
                            ? 'glass-button-emerald text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                            : isSavingOffline
                            ? 'glass-button text-amber-300'
                            : 'glass-button text-white/65 hover:text-white'
                        }`}
                      >
                        {isSavingOffline ? (
                          <span className="w-4 h-4 border-2 border-amber-300/30 border-t-amber-300 rounded-full animate-spin" />
                        ) : trackIsOffline ? (
                          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        )}
                      </button>

                      <HeartBurstButton
                        isLiked={isLiked}
                        onToggle={handleToggleLike}
                        size="md"
                        title={isLiked ? 'Unlike' : 'Like'}
                      />
                    </div>
                  </motion.div>

                  {/* Interactive Waveform Scrubber with Peak Frequency Mini-Map */}
                  <WaveformScrubber
                    fallbackDuration={currentTrack.duration || 210}
                    trackId={currentTrack.id}
                    trackTitle={currentTrack.title}
                    trackArtist={currentTrack.artist}
                  />

                  {/* Symmetric Centered Transport Buttons with Tactile Spring Physics */}
                  <div className="w-full flex items-center justify-center gap-5 sm:gap-6 mt-3">
                    <motion.button
                      whileTap={{ scale: 0.86 }}
                      onClick={handleToggleShuffle}
                      title={isShuffled ? 'Shuffle On' : 'Shuffle Off'}
                      className={`w-10 h-10 p-0 flex items-center justify-center rounded-full transition-all cursor-pointer ${
                        isShuffled
                          ? 'glass-button-primary text-white shadow-[0_0_12px_var(--color-accent)]'
                          : 'glass-button text-white/60 hover:text-white'
                      }`}
                    >
                      <svg className="w-4 h-4 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                      </svg>
                    </motion.button>

                    <motion.button
                      whileTap={{ scale: 0.88 }}
                      onClick={handlePrevTrack}
                      title="Previous Track"
                      className="w-11 h-11 p-0 flex items-center justify-center rounded-full glass-button text-white cursor-pointer"
                    >
                      <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                      </svg>
                    </motion.button>

                    <motion.button
                      whileTap={{ scale: 0.90 }}
                      whileHover={{ scale: 1.05 }}
                      onClick={handleTogglePlay}
                      title={isPlaying ? 'Pause' : 'Play'}
                      className="w-16 h-16 p-0 flex items-center justify-center rounded-full glass-button-primary text-white transition-transform cursor-pointer shadow-[0_10px_32px_rgba(250,45,72,0.45)]"
                    >
                      {isPlaying ? (
                        <svg className="w-7 h-7 block" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6.5" y="5" width="3.5" height="14" rx="1.2" />
                          <rect x="14" y="5" width="3.5" height="14" rx="1.2" />
                        </svg>
                      ) : (
                        <svg className="w-7 h-7 block" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M7.5 5.65c0-.82.89-1.33 1.6-.91l10.05 6.35c.68.43.68 1.39 0 1.82L9.1 19.26c-.71.42-1.6-.09-1.6-.91V5.65z" />
                        </svg>
                      )}
                    </motion.button>

                    <motion.button
                      whileTap={{ scale: 0.88 }}
                      onClick={handleNextTrack}
                      title="Next Track"
                      className="w-11 h-11 p-0 flex items-center justify-center rounded-full glass-button text-white cursor-pointer"
                    >
                      <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                      </svg>
                    </motion.button>

                    <motion.button
                      whileTap={{ scale: 0.86 }}
                      onClick={handleCycleRepeat}
                      title={
                        repeatMode === 'one'
                          ? 'Repeat One Track'
                          : repeatMode === 'all'
                          ? 'Repeat All'
                          : 'Repeat Off'
                      }
                      aria-label={
                        repeatMode === 'one'
                          ? 'Repeat One Track'
                          : repeatMode === 'all'
                          ? 'Repeat All'
                          : 'Repeat Off'
                      }
                      className={`w-10 h-10 p-0 flex items-center justify-center rounded-full transition-all cursor-pointer relative ${
                        repeatMode !== 'off'
                          ? 'glass-button-primary text-white shadow-[0_0_12px_var(--color-accent)]'
                          : 'glass-button text-white/60 hover:text-white'
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
                      {repeatMode === 'one' && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[var(--color-accent)] text-white text-[8px] font-black flex items-center justify-center shadow-sm border-0">
                          1
                        </span>
                      )}
                    </motion.button>
                  </div>

                  {/* Mobile Actions vs Desktop Volume & Feature Toggles */}
                  {isPhone ? (
                    <div
                      className="w-full flex items-center justify-between gap-1.5 mt-5 pt-3 border-0"
                      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
                    >
                      {/* Studio FX Pill */}
                      <button
                        onClick={() => {
                          triggerAndroidHaptic('light');
                          setStudioModalOpen(true);
                        }}
                        className={`flex-1 py-2 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                          fxMode !== 'normal'
                            ? 'glass-button-primary text-white'
                            : 'glass-button text-white/75 hover:text-white'
                        }`}
                      >
                        <svg className="w-3.5 h-3.5 text-[var(--color-accent)] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="4" x2="4" y1="21" y2="14" /><line x1="4" x2="4" y1="10" y2="3" /><line x1="12" x2="12" y1="21" y2="12" /><line x1="12" x2="12" y1="8" y2="3" />
                        </svg>
                        <span className="truncate">{fxMode !== 'normal' ? 'FX' : 'Studio'}</span>
                      </button>

                      {/* Lyrics Pill */}
                      <button
                        onClick={() => {
                          triggerAndroidHaptic('light');
                          setShowLyrics(!showLyrics);
                        }}
                        className={`flex-1 py-2 px-2 rounded-xl text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                          showLyrics
                            ? 'glass-button-primary text-white'
                            : 'glass-button text-white/75 hover:text-white'
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <span>Lyrics</span>
                      </button>

                      {/* Queue Pill */}
                      <button
                        onClick={() => {
                          triggerAndroidHaptic('light');
                          setShowQueue(!showQueue);
                        }}
                        className={`flex-1 py-2 px-2 rounded-xl text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                          showQueue
                            ? 'glass-button-primary text-white'
                            : 'glass-button text-white/75 hover:text-white'
                        }`}
                      >
                        <svg className="w-3.5 h-3.5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
                        </svg>
                        <span>Queue</span>
                      </button>

                      {/* Poster Pill */}
                      <button
                        onClick={() => {
                          triggerAndroidHaptic('light');
                          setWaveCardQuote('');
                          setShowWaveCard(true);
                        }}
                        className="flex-1 py-2 px-2 rounded-xl glass-button text-[11px] font-bold text-white/75 hover:text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
                      >
                        <svg className="w-3.5 h-3.5 text-[var(--color-accent)] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                        </svg>
                        <span>Poster</span>
                      </button>
                    </div>
                  ) : (
                    <div className="w-full flex items-center justify-between gap-2.5 mt-5 pt-3 border-0">
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
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={isMuted ? 0 : volume}
                          onChange={(e) => setVolume(Number(e.target.value))}
                          onPointerDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          className="w-16 sm:w-20 touch-none"
                        />
                        <span className="text-[10px] font-bold text-white/55 tabular-nums w-7">
                          {Math.round((isMuted ? 0 : volume) * 100)}%
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => {
                            setWaveCardQuote('');
                            setShowWaveCard(true);
                          }}
                          className="px-2.5 sm:px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-bold tracking-wider uppercase transition-all cursor-pointer flex items-center gap-1 glass-button text-white/70 hover:text-white"
                          title="Generate Lyric Poster & Social Story"
                        >
                          <svg className="w-3.5 h-3.5 text-[var(--color-accent)] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                          </svg>
                          <span>Poster</span>
                        </button>
                        <button
                          onClick={() => setShowLyrics(!showLyrics)}
                          className={`px-2.5 sm:px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-bold tracking-wider uppercase transition-all cursor-pointer flex items-center gap-1 ${
                            showLyrics
                              ? 'glass-button-primary text-white'
                              : 'glass-button text-white/70 hover:text-white'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                          <span>Lyrics</span>
                        </button>
                        <button
                          onClick={() => setShowQueue(!showQueue)}
                          className={`px-2.5 sm:px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-bold tracking-wider uppercase transition-all cursor-pointer flex items-center gap-1 ${
                            showQueue
                              ? 'glass-button-primary text-white'
                              : 'glass-button text-white/70 hover:text-white'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="4" y1="6" x2="20" y2="6" />
                            <line x1="4" y1="12" x2="20" y2="12" />
                            <line x1="4" y1="18" x2="20" y2="18" />
                          </svg>
                          <span>Queue</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column: Synced Lyrics Panel (Pure GPU transform/opacity entrance on desktop) */}
                <AnimatePresence>
                  {!isPhone && showLyrics && (
                    <motion.div
                      key="lyrics-panel"
                      initial={{ opacity: 0, x: 28, scale: 0.97 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: 28, scale: 0.97 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.65 }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="w-full lg:col-span-7 h-[46vh] lg:h-[72vh] min-w-0 will-change-transform"
                    >
                      <LyricsView
                        artist={currentTrack.artist}
                        title={currentTrack.title}
                        onShareLyric={(quote) => {
                          setWaveCardQuote(quote);
                          setShowWaveCard(true);
                        }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          <QueuePanel isOpen={showQueue} onClose={() => setShowQueue(false)} />
          <WaveCardModal
            isOpen={showWaveCard}
            onClose={() => setShowWaveCard(false)}
            track={currentTrack}
            currentTime={usePlayerStore.getState().currentTime}
            initialQuote={waveCardQuote}
          />
    </motion.div>
  );
}

export default function NowPlaying({ isOpen, onClose }: NowPlayingProps) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>{isOpen && <NowPlayingContent onClose={onClose} />}</AnimatePresence>,
    document.body
  );
}
