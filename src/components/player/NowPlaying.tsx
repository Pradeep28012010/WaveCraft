import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { usePlayerStore } from '../../stores/playerStore';
import { useJamStore } from '../../stores/jamStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useStudioStore, STUDIO_FX_MODES } from '../../stores/studioStore';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import QueuePanel from './QueuePanel';
import LyricsView from '../lyrics/LyricsView';
import Visualizer, { type VisualizerStyle } from '../visualizer/Visualizer';
import WaveCardModal from './WaveCardModal';
import { getTrackHarmonics } from '../../utils/audioHarmonics';
import { toggleChorusPreview, isChorusPreviewActive } from '../../services/chorusPreview';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';
import { useDevicePreset } from '../../hooks/useDevicePreset';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import { useTrackOfflineStatus } from '../../services/offlineVault';
import { useColorExtract } from '../../hooks/useColorExtract';
import { useSleepTimer } from '../../hooks/useSleepTimer';
import WindowsTitleBar from '../layout/WindowsTitleBar';
import WaveformScrubber from './WaveformScrubber';
import HeartBurstButton from '../ui/HeartBurstButton';
import NowPlayingScrubber from './NowPlayingScrubber';
import NowPlayingVolumeBar from './NowPlayingVolumeBar';
import NowPlayingBackdrop from './NowPlayingBackdrop';
import { NowPlayingToolsMenu, VISUALIZER_MODES } from './NowPlayingToolsMenu';

interface NowPlayingProps {
  isOpen: boolean;
  onClose: () => void;
}

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
  const [showVisualizerPicker, setShowVisualizerPicker] = useState(false);
  const visualizerPickerRef = useRef<HTMLDivElement>(null);
  const [showWaveCard, setShowWaveCard] = useState(false);
  const [waveCardQuote, setWaveCardQuote] = useState<string>('');
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showToolsMenu && !showVisualizerPicker) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setShowToolsMenu(false);
      }
      if (visualizerPickerRef.current && !visualizerPickerRef.current.contains(e.target as Node)) {
        setShowVisualizerPicker(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowToolsMenu(false);
        setShowVisualizerPicker(false);
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
  }, [showToolsMenu, showVisualizerPicker]);

  const cycleVisualizer = (direction: 1 | -1) => {
    triggerAndroidHaptic('light');
    const idx = VISUALIZER_MODES.findIndex((m) => m.id === visualizerStyle);
    if (idx === -1) {
      setVisualizerStyle(VISUALIZER_MODES[0].id);
      return;
    }
    const nextIdx = (idx + direction + VISUALIZER_MODES.length) % VISUALIZER_MODES.length;
    setVisualizerStyle(VISUALIZER_MODES[nextIdx].id);
  };

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
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const isShuffled = usePlayerStore((s) => s.isShuffled);
  const playbackSpeed = usePlayerStore((s) => s.playbackSpeed);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);
  const setPlaybackSpeed = usePlayerStore((s) => s.setPlaybackSpeed);

  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const isLiked = useLibraryStore((s) =>
    currentTrack ? Boolean(s.likedIds[currentTrack.id]) : false
  );
  const { trackIsOffline, isSavingOffline, toggleOfflineTrack } = useTrackOfflineStatus(
    currentTrack?.id || ''
  );
  const setNightstandOpen = useStudioStore((s) => s.setNightstandOpen);

  const trackHarmonics = useMemo(() => {
    if (!currentTrack) return null;
    return getTrackHarmonics(currentTrack.id, currentTrack.title, currentTrack.bpm);
  }, [currentTrack?.id, currentTrack?.title, currentTrack?.bpm]);


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

  const isJamGuest = useJamStore((s) => Boolean(s.roomCode && !s.isHost));

  const handleTogglePlay = () => {
    if (isJamGuest) return;
    triggerAndroidHaptic('medium');
    togglePlay();
  };
  const handleNextTrack = () => {
    if (isJamGuest) return;
    triggerAndroidHaptic('light');
    nextTrack();
  };
  const handlePrevTrack = () => {
    if (isJamGuest) return;
    triggerAndroidHaptic('light');
    prevTrack();
  };
  const handleToggleShuffle = () => {
    if (isJamGuest) return;
    triggerAndroidHaptic('light');
    toggleShuffle();
  };
  const handleCycleRepeat = () => {
    if (isJamGuest) return;
    triggerAndroidHaptic('light');
    cycleRepeat();
  };
  const handleToggleLike = () => {
    triggerAndroidHaptic('medium');
    if (currentTrack) toggleLike(currentTrack);
  };

  const dragControls = useDragControls();

  // Native Pull-Down & Artwork Swipe Navigation Gestures
  const artTouchStartX = useRef<number | null>(null);
  const artTouchStartY = useRef<number | null>(null);
  const artTouchStartTime = useRef<number>(0);
  const [artSwipeOffset, setArtSwipeOffset] = useState<number>(0);

  const nextUpTrack = currentTrack
    ? queue[queueIndex + 1] || (repeatMode === 'all' && queue.length > 0 ? queue[0] : null)
    : null;
  const artSrc = currentTrack?.thumbnailLarge || currentTrack?.thumbnail || DEFAULT_THUMBNAIL;
  const { palette } = useColorExtract(currentTrack ? artSrc : undefined);

  if (!currentTrack) return null;

  const handleArtTouchStart = (e: React.TouchEvent) => {
    artTouchStartX.current = e.touches[0].clientX;
    artTouchStartY.current = e.touches[0].clientY;
    artTouchStartTime.current = Date.now();
  };

  const handleArtTouchMove = (e: React.TouchEvent) => {
    if (artTouchStartX.current === null || artTouchStartY.current === null) return;
    const dx = e.touches[0].clientX - artTouchStartX.current;
    const dy = e.touches[0].clientY - artTouchStartY.current;
    if (Math.abs(dx) > Math.abs(dy)) {
      const damped = Math.sign(dx) * Math.min(54, Math.pow(Math.abs(dx), 0.82));
      setArtSwipeOffset(damped);
    }
  };

  const handleArtTouchEnd = (e: React.TouchEvent) => {
    if (artTouchStartX.current === null || artTouchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - artTouchStartX.current;
    const dy = e.changedTouches[0].clientY - artTouchStartY.current;
    const elapsed = Date.now() - artTouchStartTime.current;
    artTouchStartX.current = null;
    artTouchStartY.current = null;
    setArtSwipeOffset(0);

    // Pull down gesture -> Dismiss sheet
    if (dy > 65 && dy > Math.abs(dx) * 1.2) {
      triggerAndroidHaptic('light');
      onClose();
      return;
    }

    // Horizontal swipe gesture -> Skip tracks
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2 && elapsed < 800) {
      if (isJamGuest) return;
      if (dx < 0) {
        triggerAndroidHaptic('light');
        nextTrack();
      } else {
        triggerAndroidHaptic('light');
        prevTrack();
      }
    }
  };

  return (
    <motion.div
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 280, mass: 0.75 }}
      drag={isStudioModalOpen || showQueue || showWaveCard ? false : 'y'}
      dragControls={dragControls}
      dragListener={false}
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

      {/* Deep Dark Ambient Album Art & Dual-Wing Gradient Mesh Backdrop (Encourages Dark Colours Only) */}
      <NowPlayingBackdrop
        palette={palette}
        artSrc={artSrc}
        isPlaying={isPlaying}
        zenMode={zenMode}
      />

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
                colors={[palette.primary, palette.secondary, palette.tertiary || palette.accent || palette.primary]}
                fullScreen
              />
            </div>
          )}

          {/* Top Drag Handle (Native Mobile Sheet Pill) */}
          <div
            onPointerDown={(e) => {
              dragControls.start(e);
            }}
            className="w-full pt-2.5 pb-1 flex justify-center cursor-grab active:cursor-grabbing touch-none select-none relative z-30 flex-shrink-0"
            title="Drag down to minimize"
          >
            <div className="w-12 h-1.5 rounded-full bg-white/30 active:bg-white/55 transition-colors shadow-sm" />
          </div>

          {/* Top Bar */}
          <div
            onPointerDown={(e) => {
              const target = e.target as HTMLElement;
              if (target && target.tagName !== 'BUTTON' && !target.closest('button') && !target.closest('input')) {
                dragControls.start(e);
              }
            }}
            className={`relative z-30 app-region-no-drag ${
              isPhone ? 'h-13 px-4' : 'h-13 px-5 sm:px-8'
            } flex items-center justify-between flex-shrink-0 cursor-grab active:cursor-grabbing`}
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
                  className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full glass-button text-white cursor-pointer active:scale-90 transition-transform"
                  title="Minimize Player"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                <div className="flex-1 min-w-0 px-2 flex flex-col items-center text-center pointer-events-none">
                  <span className="text-[10px] font-bold tracking-[0.16em] text-white/50 uppercase truncate w-full">
                    PLAYING FROM QUEUE
                  </span>
                  <span className="text-xs font-bold text-white/85 truncate w-full">
                    {currentTrack.album && !/wavecraft/i.test(currentTrack.album) ? currentTrack.album : currentTrack.artist}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
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
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      useStudioStore.getState().setSmartDJOpen(true);
                    }}
                    className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white cursor-pointer active:scale-90 transition-transform"
                    title="Smart DJ Console"
                  >
                    <span className="text-sm">🎧</span>
                  </button>

                  <button
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      setNightstandOpen(true);
                    }}
                    className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white cursor-pointer active:scale-90 transition-transform"
                    title="Bedside Nightstand Mode"
                  >
                    <span className="text-sm">🌙</span>
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

                <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center text-center app-region-no-drag pointer-events-none max-w-[42vw]">
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

                  {/* Smart DJ Console & Automix Button */}
                  <button
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      useStudioStore.getState().setSmartDJOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 h-9 rounded-full glass-button text-white/80 hover:text-white cursor-pointer active:scale-95 transition-transform app-region-no-drag"
                    title="Smart DJ Console & Harmonic Automix"
                  >
                    <span className="text-sm">🎧</span>
                    <span className="hidden sm:inline text-xs font-semibold">Smart DJ</span>
                  </button>

                  {/* Bedside Nightstand Mode Button */}
                  <button
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      setNightstandOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 h-9 rounded-full glass-button text-white/80 hover:text-white cursor-pointer active:scale-90 transition-transform app-region-no-drag"
                    title="Open Bedside Nightstand Mode"
                  >
                    <span className="text-sm">🌙</span>
                    <span className="hidden md:inline text-xs font-semibold">Nightstand</span>
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
                    <NowPlayingToolsMenu
                      isOpen={showToolsMenu}
                      onClose={() => setShowToolsMenu(false)}
                      currentTrack={currentTrack}
                      isLiked={isLiked}
                      toggleLike={toggleLike}
                      trackIsOffline={trackIsOffline}
                      isSavingOffline={isSavingOffline}
                      toggleOfflineTrack={toggleOfflineTrack}
                      isChorusPreviewActive={isChorusPreviewActive}
                      toggleChorusPreview={toggleChorusPreview}
                      isAmbientActive={isAmbientActive}
                      fxMode={fxMode}
                      setStudioModalOpen={setStudioModalOpen}
                      setShowWaveCard={setShowWaveCard}
                      setWaveCardQuote={setWaveCardQuote}
                      showVisualizer={showVisualizer}
                      setShowVisualizer={setShowVisualizer}
                      visualizerStyle={visualizerStyle}
                      setVisualizerStyle={setVisualizerStyle}
                      zenMode={zenMode}
                      setZenMode={setZenMode}
                      setNightstandOpen={setNightstandOpen}
                      sleepActive={sleepActive}
                      sleepRemaining={sleepRemaining}
                      sleepEndAtTrack={sleepEndAtTrack}
                      startSleepTimer={startSleepTimer}
                      setEndAtTrack={setEndAtTrack}
                      stopSleepTimer={stopSleepTimer}
                      audioQuality={audioQuality}
                      setAudioQuality={setAudioQuality}
                      preservePitch={preservePitch}
                      setPreservePitch={setPreservePitch}
                      playbackSpeed={playbackSpeed}
                      setPlaybackSpeed={setPlaybackSpeed}
                    />
                </div>

                </div>
              </>
            )}
          </div>

          {/* ZEN MODE FLOATING 3D VISUALIZER HUD */}
          {zenMode ? (
            <div className="relative z-10 flex-1 flex flex-col justify-between p-4 sm:p-8">
              {/* Top Compact Floating Capsule & Popover Grid */}
              <div ref={visualizerPickerRef} className="relative w-full flex items-center justify-between gap-2 mt-1 select-none">
                <div className="hidden sm:block w-[92px] flex-shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0 flex justify-center">
                  <div className="flex items-center gap-1 p-1 rounded-full liquid-glass border-0 shadow-2xl backdrop-blur-2xl max-w-full">
                    {/* Previous Visualizer */}
                    <button
                      type="button"
                      onClick={() => cycleVisualizer(-1)}
                      className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                      title="Previous visualizer style"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                    </button>

                    {/* Active Visualizer Mode Button with Dropdown Trigger */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerAndroidHaptic('light');
                        setShowVisualizerPicker((prev) => !prev);
                      }}
                      className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 rounded-full glass-button-primary pointer-events-auto text-xs font-bold text-white shadow-[0_4px_16px_rgba(250,45,72,0.35)] cursor-pointer select-none hover:brightness-110 active:scale-[0.96] transition-all relative z-20 min-w-0"
                      title="Change visualizer style"
                    >
                      <span className="text-xs flex-shrink-0">✨</span>
                      <span className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)] truncate">
                        {VISUALIZER_MODES.find((m) => m.id === visualizerStyle)?.label || 'Visualizer'}
                      </span>
                      <span className="text-[10px] text-white/60 font-semibold tabular-nums flex-shrink-0">
                        ({Math.max(1, VISUALIZER_MODES.findIndex((m) => m.id === visualizerStyle) + 1)}/{VISUALIZER_MODES.length})
                      </span>
                      <svg
                        className={`w-3.5 h-3.5 flex-shrink-0 text-white/70 transition-transform duration-200 ${
                          showVisualizerPicker ? 'rotate-180' : ''
                        }`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    {/* Next Visualizer */}
                    <button
                      type="button"
                      onClick={() => cycleVisualizer(1)}
                      className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                      title="Next visualizer style"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Exit Zen Mode Quick Pill */}
                <button
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    setZenMode(false);
                  }}
                  className="flex-shrink-0 h-10 px-3 sm:px-3.5 rounded-full liquid-glass border-0 text-white/75 hover:text-white hover:bg-white/10 flex items-center gap-1.5 text-xs font-semibold cursor-pointer active:scale-95 transition-all shadow-lg"
                  title="Exit Zen Mode to standard player"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                  </svg>
                  <span className="hidden sm:inline">Exit Zen</span>
                </button>

                {/* Frosted Glass Dropdown Grid of all 14 Visualizer Styles */}
                <AnimatePresence>
                  {showVisualizerPicker && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.94 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.94 }}
                      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute top-12 left-1/2 -translate-x-1/2 z-50 w-[90vw] max-w-lg p-3 rounded-2xl liquid-glass border-0 shadow-[0_24px_60px_rgba(0,0,0,0.85)] backdrop-blur-3xl max-h-[65vh] overflow-y-auto no-scrollbar flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between px-2 pb-1 border-b border-white/10">
                        <span className="text-[11px] font-bold text-white/80 tracking-widest uppercase">
                          Visualizer Engine ({VISUALIZER_MODES.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowVisualizerPicker(false)}
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 text-xs transition-colors"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {VISUALIZER_MODES.map((m, idx) => {
                          const isSel = visualizerStyle === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                triggerAndroidHaptic('light');
                                setVisualizerStyle(m.id);
                                setShowVisualizerPicker(false);
                              }}
                              className={`p-2.5 rounded-xl text-xs font-bold text-left transition-all cursor-pointer flex flex-col gap-1 ${
                                isSel
                                  ? 'glass-button-primary text-white shadow-[0_0_15px_rgba(250,45,72,0.4)]'
                                  : 'glass-button text-white/70 hover:text-white hover:bg-white/10'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-white/40 font-mono">
                                  {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                                </span>
                                {isSel && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_6px_#fff]" />
                                )}
                              </div>
                              <span className="truncate">{m.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Bottom Upgraded Floating Liquid Glass Music Card */}
              <div className="w-full max-w-xl mx-auto rounded-3xl liquid-glass border-0 p-4 sm:p-5 shadow-2xl backdrop-blur-2xl">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <img
                      src={artSrc}
                      alt={currentTrack.title}
                      className={`w-12 h-12 rounded-full object-cover border-0 shadow-lg will-change-transform ${
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

                  {isJamGuest ? (
                    <div
                      title="Live Jam: Host DJ in control"
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold select-none shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]" />
                      <span>Synced</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 sm:gap-3.5">
                      {/* Like button */}
                      <button
                        type="button"
                        onClick={() => {
                          if (currentTrack) {
                            triggerAndroidHaptic('light');
                            toggleLike(currentTrack);
                          }
                        }}
                        className="w-9 h-9 rounded-full flex items-center justify-center glass-button text-white/80 hover:text-white active:scale-90 transition-transform cursor-pointer"
                        title={isLiked ? 'Unlike track' : 'Like track'}
                      >
                        {isLiked ? (
                          <svg className="w-4 h-4 text-rose-500 fill-current" viewBox="0 0 24 24">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-white/60 hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                          </svg>
                        )}
                      </button>

                      {/* Prev */}
                      <button
                        type="button"
                        onClick={prevTrack}
                        aria-label="Previous track"
                        title="Previous track"
                        className="text-white/75 hover:text-white active:scale-90 transition-transform cursor-pointer"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                        </svg>
                      </button>

                      {/* Play / Pause */}
                      <button
                        type="button"
                        onClick={togglePlay}
                        aria-label={isPlaying ? 'Pause' : 'Play'}
                        title={isPlaying ? 'Pause' : 'Play'}
                        className="w-11 h-11 p-0 rounded-full glass-button-primary text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform cursor-pointer"
                      >
                        {isPlaying ? (
                          <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6.5" y="5" width="3.5" height="14" rx="1.2" />
                            <rect x="14" y="5" width="3.5" height="14" rx="1.2" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 block translate-x-0.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7.5 5.65c0-.82.89-1.33 1.6-.91l10.05 6.35c.68.43.68 1.39 0 1.82L9.1 19.26c-.71.42-1.6-.09-1.6-.91V5.65z" />
                          </svg>
                        )}
                      </button>

                      {/* Next */}
                      <button
                        type="button"
                        onClick={nextTrack}
                        aria-label="Next track"
                        title="Next track"
                        className="text-white/75 hover:text-white active:scale-90 transition-transform cursor-pointer"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Scrubber with exact time & seek */}
                <div className="mt-2 pt-1">
                  <NowPlayingScrubber fallbackDuration={currentTrack?.duration || 210} />
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
                      onTouchStart={handleArtTouchStart}
                      onTouchMove={handleArtTouchMove}
                      onTouchEnd={handleArtTouchEnd}
                      style={{
                        transform: artSwipeOffset !== 0 ? `translate3d(${artSwipeOffset}px, 0, 0)` : undefined,
                        transition: artSwipeOffset === 0 ? 'transform 260ms cubic-bezier(0.2, 0.9, 0.3, 1)' : 'none'
                      }}
                      className={`relative flex items-center justify-center flex-shrink-0 transition-all duration-300 will-change-transform ${
                        deckMode === 'vinyl'
                          ? showLyrics
                            ? 'w-[min(34vh,280px)] h-[min(24vh,195px)] sm:w-[min(40vh,330px)] sm:h-[min(28vh,230px)]'
                            : 'w-[min(38vh,315px)] h-[min(27vh,225px)] sm:w-[min(48vh,385px)] sm:h-[min(34vh,275px)]'
                          : showLyrics
                            ? 'w-[min(24vh,190px)] h-[min(24vh,190px)] sm:w-[min(28vh,230px)] sm:h-[min(28vh,230px)]'
                            : 'w-[min(28vh,220px)] h-[min(28vh,220px)] sm:w-[min(34vh,270px)] sm:h-[min(34vh,270px)]'
                      }`}
                    >
                      <AnimatePresence mode="popLayout" initial={false}>
                        {deckMode === 'vinyl' ? (
                          <motion.div
                            key="nowplaying-deck-vinyl"
                            initial={{ opacity: 0, scale: 0.92, filter: 'blur(6px)' }}
                            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, scale: 0.92, filter: 'blur(6px)' }}
                            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                            onClick={() => {
                              triggerAndroidHaptic('light');
                              setDeckMode('cover');
                            }}
                            title="Click to switch to Album Cover"
                            className="relative w-full h-full rounded-[24px] sm:rounded-[28px] bg-gradient-to-br from-[#1c1d26] via-[#13141b] to-[#0c0d12] border border-white/12 shadow-[0_24px_50px_rgba(0,0,0,0.88),inset_0_1px_1px_rgba(255,255,255,0.18)] cursor-pointer select-none overflow-hidden will-change-transform"
                          >
                            {/* Plinth Corner Dampener Feet Accents */}
                            <div className="absolute top-2.5 left-2.5 w-1.5 h-1.5 rounded-full bg-zinc-500/40 border border-white/10 pointer-events-none" />
                            <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-zinc-500/40 border border-white/10 pointer-events-none" />
                            <div className="absolute bottom-2.5 left-2.5 w-1.5 h-1.5 rounded-full bg-zinc-500/40 border border-white/10 pointer-events-none" />
                            <div className="absolute bottom-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-zinc-500/40 border border-white/10 pointer-events-none" />

                            {/* 1. Target Strobe Light Tower (Technics SL-1200 Style, Top-Left Corner) */}
                            <div className="absolute top-3 left-3 sm:top-4 sm:left-4 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-zinc-500 via-zinc-700 to-zinc-950 border border-white/20 shadow-[0_3px_8px_rgba(0,0,0,0.8)] flex items-center justify-center pointer-events-none z-10">
                              <div
                                className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full transition-all duration-500 ${
                                  isPlaying
                                    ? 'bg-amber-300 shadow-[0_0_12px_#f59e0b,0_0_24px_rgba(245,158,11,0.6)]'
                                    : 'bg-zinc-600'
                                }`}
                              />
                            </div>


                            {/* 3. Recessed Platter Bay & 180-Gram Spinning Vinyl (Centered Vertically with Generous Clearance) */}
                            <div className="absolute top-[10%] bottom-[10%] left-3.5 sm:left-5 aspect-square rounded-full flex items-center justify-center">
                              {/* Recessed Platter Well Shadow */}
                              <div className="absolute inset-0 rounded-full bg-black/75 shadow-[inset_0_4px_12px_rgba(0,0,0,0.95)] border border-white/5 pointer-events-none" />

                              {/* Cast Aluminum Platter Bezel with Rotating Strobe Knurling */}
                              <div className="absolute inset-0.5 rounded-full pointer-events-none border border-white/10 shadow-[0_12px_28px_rgba(0,0,0,0.92),0_0_0_1px_rgba(255,255,255,0.06)] bg-gradient-to-b from-[#252530] via-[#121218] to-[#0a0a0e] flex items-center justify-center overflow-hidden">
                                <div
                                  className="absolute inset-0 rounded-full opacity-35"
                                  style={{
                                    background:
                                      'repeating-conic-gradient(from 0deg, #94a3b8 0deg 1.5deg, transparent 1.5deg 3deg)',
                                    animation: 'spin 2.2s linear infinite',
                                    animationPlayState: isPlaying ? 'running' : 'paused'
                                  }}
                                />
                                <div className="absolute inset-0 rounded-full border border-white/15 pointer-events-none" />
                              </div>

                              {/* Spinning 180-Gram Vinyl Record with Realistic Sound Bands */}
                              <div
                                className="relative w-[92%] h-[92%] rounded-full border-0 flex items-center justify-center overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.95)]"
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
                                    <div className="w-full h-full rounded-full bg-gradient-to-tr from-zinc-200 via-zinc-100 to-zinc-400 shadow-inner flex items-center justify-center">
                                      <div className="w-1 h-1 rounded-full bg-zinc-950/70" />
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Stationary Anisotropic Vinyl Glare (Double Butterfly Cones) */}
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
                            </div>

                            {/* 4. Precision Proportional Tonearm Bay (Scales 1:1 with plinth height, zero cutoff, zero fake disks) */}
                            <div className="absolute top-0 right-0 w-[40%] h-full pointer-events-none select-none overflow-visible z-20">
                              {/* A. Stationary Plinth-Mounted Arm Rest Post & Cradle at (85, 148) */}
                              <svg viewBox="0 0 140 250" className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                                <defs>
                                  <linearGradient id="cradle-post-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#475569" />
                                    <stop offset="50%" stopColor="#cbd5e1" />
                                    <stop offset="100%" stopColor="#334155" />
                                  </linearGradient>
                                </defs>
                                <g>
                                  {/* Base Mounting Flange on Plinth */}
                                  <ellipse cx="85" cy="164" rx="5" ry="2" fill="#1e293b" stroke="#475569" strokeWidth="0.5" />
                                  {/* Vertical Rest Post Stem */}
                                  <rect x="83" y="148" width="4" height="16" rx="1" fill="url(#cradle-post-grad)" stroke="#334155" strokeWidth="0.5" />
                                  {/* U-Shaped Arm Rest Cradle Clip */}
                                  <path d="M 79 143 C 79 149, 91 149, 91 143" fill="none" stroke="#e2e8f0" strokeWidth="2.2" strokeLinecap="round" />
                                  {/* Cradle Inner Rubber Damper */}
                                  <path d="M 81 145 C 81 148, 89 148, 89 145" fill="none" stroke="#090d16" strokeWidth="1.2" strokeLinecap="round" />
                                </g>
                              </svg>

                              {/* B. Rotating Precision Audiophile Tonearm (Pivots smoothly around (85, 45) -> 60.7% 18%) */}
                              <motion.div
                                initial={{ opacity: 0, rotate: -3 }}
                                animate={{
                                  opacity: 1,
                                  rotate: isPlaying ? 40 : 0
                                }}
                                exit={{ opacity: 0, rotate: -2 }}
                                transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.04 }}
                                className="absolute inset-0 w-full h-full pointer-events-none"
                                style={{
                                  transformOrigin: '60.7% 18%'
                                }}
                              >
                                <svg
                                  viewBox="0 0 140 250"
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

                                  {/* 1. Threaded Machined Rear Counterweight with Gram Scale Ring */}
                                  <rect x="76" y="14" width="18" height="15" rx="2" fill="url(#counterweight-grad)" stroke="#1e293b" strokeWidth="0.8" />
                                  <line x1="76" y1="18" x2="94" y2="18" stroke="#090d16" strokeWidth="0.8" opacity="0.6" />
                                  <line x1="76" y1="21" x2="94" y2="21" stroke="#090d16" strokeWidth="0.8" opacity="0.6" />
                                  <line x1="76" y1="24" x2="94" y2="24" stroke="#090d16" strokeWidth="0.8" opacity="0.6" />
                                  <rect x="82" y="8" width="6" height="6" rx="1" fill="#0f172a" stroke="#475569" strokeWidth="0.8" />

                                  {/* 2. Precision 4-Point Gimbal Bearing Pivot Assembly (Direct Plinth-Mounted, NOT a Disk) */}
                                  <circle cx="85" cy="45" r="9" fill="url(#gimbal-grad)" stroke="#1e293b" strokeWidth="0.9" />
                                  {/* Horizontal Gimbal Trunnion Bearing Ears */}
                                  <rect x="73" y="43.5" width="24" height="3" rx="1.5" fill="#64748b" stroke="#334155" strokeWidth="0.5" />
                                  {/* Center Jewel Bearing Pivot Screw */}
                                  <circle cx="85" cy="45" r="4.2" fill="#0f172a" stroke="#cbd5e1" strokeWidth="0.8" />
                                  <circle cx="85" cy="45" r="1.8" fill="url(#gimbal-grad)" />
                                  <circle cx="84" cy="44" r="0.8" fill="#ffffff" opacity="0.95" />

                                  {/* Polished Chrome Cueing Lever */}
                                  <path d="M 94 48 L 102 52" stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round" />
                                  <circle cx="102" cy="52" r="1.5" fill="#334155" stroke="#94a3b8" strokeWidth="0.5" />

                                  {/* 3. Graceful S-Shaped Chrome Tonearm Tube (Passes exactly through cradle clip when parked) */}
                                  <path
                                    d="M 85 48 C 85 75, 77 95, 77 118 C 77 135, 85 142, 85 168"
                                    fill="none"
                                    stroke="rgba(0,0,0,0.5)"
                                    strokeWidth="4.5"
                                    strokeLinecap="round"
                                  />
                                  <path
                                    d="M 85 48 C 85 75, 77 95, 77 118 C 77 135, 85 142, 85 168"
                                    fill="none"
                                    stroke="url(#tonearm-tube-grad)"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                  />
                                  <path
                                    d="M 84.5 49 C 84.5 75, 76.5 95, 76.5 118 C 76.5 135, 84.5 142, 84.5 168"
                                    fill="none"
                                    stroke="#ffffff"
                                    strokeWidth="0.8"
                                    strokeLinecap="round"
                                    opacity="0.85"
                                  />

                                  {/* 4. Audiophile Headshell & Cartridge Assembly */}
                                  <g transform="translate(85, 168)">
                                    {/* Chrome Finger Lift Hook */}
                                    <path
                                      d="M 4 -1 C 8 -4, 12 -1, 11 4 C 11 7, 8 8, 5 8"
                                      fill="none"
                                      stroke="#cbd5e1"
                                      strokeWidth="1.3"
                                      strokeLinecap="round"
                                    />
                                    {/* Matte Black Angled Headshell */}
                                    <polygon points="-7,-3 7,-1 5,14 -5,12" fill="#09090e" stroke="#334155" strokeWidth="0.8" />
                                    {/* Audiophile Red Stripe */}
                                    <line x1="-6" y1="4.5" x2="6" y2="6.5" stroke="#fa2d48" strokeWidth="1.3" />
                                    {/* Gold Stylus Cartridge */}
                                    <polygon points="-4,11 4,12.5 3,18 -3,17" fill="url(#cartridge-gold)" stroke="#78350f" strokeWidth="0.5" />
                                    {/* Diamond Stylus Tip Point */}
                                    <circle cx="0" cy="19" r="1.2" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="0.4" />
                                    {/* Stylus Needle Sparkle Reflection */}
                                    <line x1="0" y1="17.5" x2="0" y2="20.5" stroke="#ffffff" strokeWidth="0.8" />
                                    <line x1="-1.5" y1="19" x2="1.5" y2="19" stroke="#ffffff" strokeWidth="0.8" />
                                  </g>
                                </svg>
                              </motion.div>
                            </div>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="nowplaying-deck-cover"
                            initial={{ opacity: 0, scale: 0.92, filter: 'blur(6px)' }}
                            animate={{ opacity: 1, scale: isPlaying ? 1 : 0.95, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, scale: 0.92, filter: 'blur(6px)' }}
                            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
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
                      <div className="flex items-center gap-2 mt-1 min-w-0">
                        <p className="text-sm sm:text-base text-white/60 font-medium truncate">
                          {currentTrack.artist}
                        </p>
                        {trackHarmonics && (
                          <div
                            onClick={() => {
                              triggerAndroidHaptic('light');
                              useStudioStore.getState().setSmartDJOpen(true);
                            }}
                            title={`Smart DJ Harmonic Profile: ${trackHarmonics.bpm} BPM • Camelot ${trackHarmonics.camelotKey} (${trackHarmonics.musicalKey}) • ${trackHarmonics.energy} — Click to open Smart DJ Console`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/[0.06] border border-white/10 text-white/80 shadow-sm whitespace-nowrap cursor-pointer hover:bg-white/15 hover:border-[var(--color-accent)]/40 active:scale-95 transition-all flex-shrink-0"
                          >
                            <span className="text-amber-400 text-[10px]">⚡</span>
                            <span className="font-mono">{trackHarmonics.bpm} BPM</span>
                            <span className="text-white/30">•</span>
                            <span className="text-[var(--color-accent)] font-mono">{trackHarmonics.camelotKey}</span>
                          </div>
                        )}
                      </div>
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
                    {isJamGuest ? (
                      <div
                        title="Live Jam: Host DJ in control. All devices synchronized."
                        className="flex items-center gap-3 px-6 py-3 rounded-full bg-white/[0.06] border border-white/10 text-white/80 text-xs sm:text-sm font-semibold backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.4)] select-none my-1"
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_#34d399]" />
                        <span>Host DJ in Control • Synced with Jam Room</span>
                      </div>
                    ) : (
                      <>
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
                      </>
                    )}
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
                      <NowPlayingVolumeBar />

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
