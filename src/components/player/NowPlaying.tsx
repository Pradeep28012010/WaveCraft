import { motion, AnimatePresence } from 'framer-motion';
import { useState, memo } from 'react';
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
import { DEFAULT_THUMBNAIL } from '../../utils/constants';
import { formatTime } from '../../utils/formatTime';
import { useDevicePreset } from '../../hooks/useDevicePreset';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import { useTrackOfflineStatus } from '../../services/offlineVault';
import { useColorExtract } from '../../hooks/useColorExtract';
import WindowsTitleBar from '../layout/WindowsTitleBar';

interface NowPlayingProps {
  isOpen: boolean;
  onClose: () => void;
}

const VISUALIZER_MODES: Array<{ id: VisualizerStyle; label: string }> = [
  { id: 'nebula', label: '3D Nebula' },
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
const NowPlayingScrubber = memo(({ fallbackDuration }: { fallbackDuration: number }) => {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const seekTo = usePlayerStore((s) => s.seekTo);

  const activeDuration = duration || fallbackDuration || 210;
  const ratio = Math.min(1, Math.max(0, currentTime / activeDuration));

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const targetRatio = Math.max(0, Math.min(1, x / rect.width));
    seekTo(targetRatio * activeDuration);
  };

  return (
    <div className="w-full mt-4">
      <div
        className="h-2 bg-white/15 rounded-full cursor-pointer relative group"
        onClick={handleProgressClick}
      >
        {/* Soft diffused ambient glow underneath */}
        <div
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 left-0 h-3.5 rounded-full bg-gradient-to-r from-[var(--color-accent)] via-rose-500 to-purple-500 opacity-50 blur-md transition-[width] duration-150 ease-linear"
          style={{ width: `${(ratio * 100).toFixed(2)}%` }}
        />
        <div
          className="relative h-full bg-gradient-to-r from-[var(--color-accent)] via-rose-400 to-white rounded-full transition-[width] duration-150 ease-linear"
          style={{
            width: `${(ratio * 100).toFixed(2)}%`,
            boxShadow: '0 0 12px 1px var(--color-accent)'
          }}
        >
          <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-[0_0_12px_2px_var(--color-accent)] scale-90 group-hover:scale-110 transition-transform" />
        </div>
      </div>
      <div className="flex justify-between mt-1.5 text-[11px] text-white/50 font-semibold tabular-nums">
        <span>{formatTime(currentTime)}</span>
        <span>-{formatTime(Math.max(0, activeDuration - currentTime))}</span>
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
  const isLiked = useLibraryStore((s) =>
    currentTrack ? Boolean(s.likedIds[currentTrack.id]) : false
  );
  const { trackIsOffline, isSavingOffline, toggleOfflineTrack } = useTrackOfflineStatus(
    currentTrack?.id || ''
  );

  const showVisualizer = useSettingsStore((s) => s.showVisualizer);
  const visualizerStyle = useSettingsStore((s) => s.visualizerStyle);
  const setVisualizerStyle = useSettingsStore((s) => s.setVisualizerStyle);
  const setShowVisualizer = useSettingsStore((s) => s.setShowVisualizer);
  const showLyrics = useSettingsStore((s) => s.showLyrics);
  const setShowLyrics = useSettingsStore((s) => s.setShowLyrics);
  const fxMode = useStudioStore((s) => s.fxMode);
  const setStudioModalOpen = useStudioStore((s) => s.setStudioModalOpen);

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
      drag={isPhone ? 'y' : false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.05, bottom: 0.6 }}
      onDragEnd={(_, info) => {
        if (isPhone && (info.offset.y > 100 || info.velocity.y > 500)) {
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
                zenMode ? 'opacity-95' : 'opacity-45'
              }`}
            >
              <Visualizer
                isActive={isPlaying}
                style={(visualizerStyle || 'nebula') as VisualizerStyle}
                fullScreen
              />
            </div>
          )}

          {/* Top Drag Indicator (Phone Only) */}
          {isPhone && (
            <div className="relative z-10 pt-2 pb-0.5 flex justify-center w-full">
              <div className="w-10 h-1 rounded-full bg-white/30" />
            </div>
          )}

          {/* Top Bar */}
          <div
            className={`relative z-20 app-region-no-drag ${
              isPhone ? 'h-14 px-4' : 'h-16 px-6 sm:px-10'
            } flex items-center justify-between flex-shrink-0`}
            style={{
              paddingTop: isPhone ? 'max(env(safe-area-inset-top), 6px)' : undefined
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
                    {currentTrack.album || currentTrack.artist}
                  </span>
                </div>

                <button
                  onClick={(e) => {
                    triggerAndroidHaptic('light');
                    useContextMenuStore.getState().openTrackMenu(
                      { clientX: e.clientX, clientY: e.clientY },
                      currentTrack,
                      usePlayerStore.getState().queue
                    );
                  }}
                  className="w-10 h-10 flex items-center justify-center rounded-full glass-button text-white cursor-pointer active:scale-90 transition-transform"
                  title="Track Options"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="19" r="2" />
                  </svg>
                </button>
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
                    <div className="hidden sm:flex items-center gap-1 p-1 rounded-full liquid-glass border border-white/15 app-region-no-drag">
                      <button
                        onClick={() => setDeckMode('cover')}
                        className={`px-3.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer app-region-no-drag ${
                          deckMode === 'cover'
                            ? 'glass-button-primary text-white'
                            : 'text-white/65 hover:text-white'
                        }`}
                      >
                        Cover
                      </button>
                      <button
                        onClick={() => setDeckMode('vinyl')}
                        className={`px-3.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer app-region-no-drag ${
                          deckMode === 'vinyl'
                            ? 'glass-button-primary text-white'
                            : 'text-white/65 hover:text-white'
                        }`}
                      >
                        Vinyl Deck
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-center app-region-no-drag">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[11px] font-bold tracking-[0.18em] text-white/60 uppercase">
                      {currentTrack.quality || '320kbps Studio AAC'}
                    </span>
                  </div>
                  {nextUpTrack && (
                    <span className="text-[11px] text-white/45 truncate max-w-xs mt-0.5">
                      Up Next: <strong className="text-white/75">{nextUpTrack.title}</strong>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 app-region-no-drag">
                  {/* Studio Audio FX & Ambient Mixer Button */}
                  <button
                    onClick={() => setStudioModalOpen(true)}
                    className={`px-3.5 h-9 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all app-region-no-drag ${
                      fxMode !== 'normal'
                        ? 'glass-button-primary text-white'
                        : 'glass-button text-white/85 hover:text-white'
                    }`}
                    title="Open Studio Audio FX & Ambient Mixer"
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
                  </button>

                  {/* Share WaveCard Button */}
                  <button
                    onClick={() => {
                      setWaveCardQuote('');
                      setShowWaveCard(true);
                    }}
                    className="px-3.5 h-9 rounded-full glass-button text-xs font-bold text-white/85 hover:text-white flex items-center gap-1.5 cursor-pointer transition-all app-region-no-drag"
                    title="Generate Shareable Poster"
                  >
                    <svg className="w-3.5 h-3.5 text-[var(--color-accent)] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span>Poster</span>
                  </button>

                  {/* Background Visualizer Style Switcher */}
                  <button
                    onClick={() => {
                      if (!showVisualizer) {
                        setShowVisualizer(true);
                        return;
                      }
                      const idx = VISUALIZER_MODES.findIndex((m) => m.id === visualizerStyle);
                      const next = VISUALIZER_MODES[(idx + 1) % VISUALIZER_MODES.length];
                      if (next) setVisualizerStyle(next.id);
                    }}
                    className="hidden md:flex px-3.5 h-9 rounded-full glass-button text-xs font-bold text-white/85 hover:text-white items-center gap-1.5 cursor-pointer transition-all app-region-no-drag"
                    title="Cycle Player Background Visualizer"
                  >
                    <svg className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M2 12h2M6 8v8M10 4v16M14 7v10M18 9v6M22 12h-2" />
                    </svg>
                    <span>
                      {VISUALIZER_MODES.find((m) => m.id === visualizerStyle)?.label || '3D Nebula'}
                    </span>
                  </button>

                  {/* 3D Zen Mode Toggle */}
                  <button
                    onClick={() => {
                      const nextZen = !zenMode;
                      setZenMode(nextZen);
                      if (nextZen) setShowVisualizer(true);
                    }}
                    className={`px-3.5 h-9 rounded-full text-xs font-bold transition-all cursor-pointer app-region-no-drag ${
                      zenMode
                        ? 'glass-button-primary text-white'
                        : 'glass-button text-white/85 hover:text-white'
                    }`}
                    title="Toggle Fullscreen 3D Visualizer Zen Mode"
                  >
                    {zenMode ? 'Exit Zen' : '3D Zen'}
                  </button>

                  <button
                    onClick={() => {
                      const speeds = [0.75, 1, 1.25, 1.5];
                      const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length] || 1;
                      setPlaybackSpeed(next);
                    }}
                    className="px-3 h-9 rounded-full glass-button text-xs font-bold text-white/85 hover:text-white cursor-pointer transition-all tabular-nums app-region-no-drag"
                    title="Playback Speed"
                  >
                    {playbackSpeed}x
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ZEN MODE FLOATING 3D VISUALIZER HUD */}
          {zenMode ? (
            <div className="relative z-10 flex-1 flex flex-col justify-between p-6 sm:p-10">
              <div className="flex flex-wrap items-center justify-center gap-2 mx-auto p-1.5 rounded-full liquid-glass border border-white/15 shadow-2xl">
                {VISUALIZER_MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setVisualizerStyle(m.id)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      visualizerStyle === m.id
                        ? 'glass-button-primary text-white'
                        : 'text-white/65 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="w-full max-w-2xl mx-auto rounded-3xl liquid-glass border border-white/15 p-5 shadow-2xl">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <img
                      src={artSrc}
                      alt={currentTrack.title}
                      className={`w-12 h-12 rounded-full object-cover border border-white/20 will-change-transform ${
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
            <div className="relative z-10 flex-1 min-h-0 px-6 sm:px-12 pb-6 flex items-center justify-center">
              <motion.div
                layout
                transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.7 }}
                className={`w-full max-w-6xl h-full flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-12 ${
                  showLyrics ? 'lg:justify-between' : ''
                }`}
              >
                {/* Left / Center Player Column */}
                <motion.div
                  layout
                  transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.7 }}
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
                  className={`flex flex-col items-center justify-center w-full ${
                    showLyrics ? 'lg:w-5/12 max-w-md' : 'max-w-lg'
                  }`}
                >
                  {/* Album Cover OR Realistic Vinyl Turntable Deck */}
                  {deckMode === 'vinyl' ? (
                    <div
                      onClick={() => setDeckMode('cover')}
                      title="Click to switch between Vinyl Turntable & Album Cover"
                      className={`relative flex items-center justify-center cursor-pointer flex-shrink-0 ${
                        showLyrics
                          ? 'w-[min(26vh,230px)] h-[min(26vh,230px)] sm:w-[min(32vh,265px)] sm:h-[min(32vh,265px)]'
                          : 'w-[min(36vh,295px)] h-[min(36vh,295px)] sm:w-[min(40vh,325px)] sm:h-[min(40vh,325px)]'
                      }`}
                    >
                      {/* Dynamic Ambient Album Glow behind Turntable */}
                      <div
                        className="absolute -inset-12 rounded-full pointer-events-none blur-3xl transition-all duration-1000 will-change-transform"
                        style={{
                          background: `radial-gradient(circle, ${palette.primary}70 0%, ${palette.secondary}35 50%, transparent 72%)`,
                          opacity: isPlaying ? 0.95 : 0.5,
                          transform: isPlaying ? 'scale(1.06)' : 'scale(0.96)'
                        }}
                      />

                      {/* Pure circular radial-gradient aura (zero CSS box-shadow quad / zero tile seam) */}
                      <div
                        className="absolute -inset-6 rounded-full pointer-events-none"
                        style={{
                          background:
                            'radial-gradient(circle, rgba(0,0,0,0.7) 52%, rgba(0,0,0,0.28) 64%, rgba(0,0,0,0) 72%)'
                        }}
                      />

                      {/* Outer Vinyl Platter */}
                      <div
                        className="relative w-full h-full rounded-full border-4 border-white/10 flex items-center justify-center overflow-hidden"
                        style={{
                          background:
                            'repeating-radial-gradient(circle at center, #111116 0px, #111116 3px, #1d1d26 4px, #0d0d12 6px)',
                          animation: 'spin 7s linear infinite',
                          animationPlayState: isPlaying ? 'running' : 'paused'
                        }}
                      >
                        <div
                          className="absolute inset-0 pointer-events-none opacity-30"
                          style={{
                            background:
                              'conic-gradient(from 45deg, transparent 0deg, rgba(255,255,255,0.35) 35deg, transparent 70deg, transparent 180deg, rgba(255,255,255,0.35) 215deg, transparent 250deg)'
                          }}
                        />

                        <div className="w-[46%] h-[46%] rounded-full overflow-hidden border-4 border-black/80 shadow-inner relative">
                          <img
                            src={artSrc}
                            alt={currentTrack.title}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                            }}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 m-auto w-4 h-4 rounded-full bg-[#09090e] border-2 border-white/60 shadow-md" />
                        </div>
                      </div>

                      {/* Animated Studio Tonearm */}
                      <div
                        className="absolute -top-2 -right-3 w-20 h-44 pointer-events-none transition-transform duration-500 origin-[75%_16%]"
                        style={{
                          transform: isPlaying ? 'rotate(24deg)' : 'rotate(0deg)'
                        }}
                      >
                        <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-gradient-to-br from-zinc-300 to-zinc-700 border border-white/40 shadow-lg flex items-center justify-center">
                          <div className="w-3 h-3 rounded-full bg-zinc-900" />
                        </div>
                        <svg viewBox="0 0 80 180" className="w-full h-full drop-shadow-xl">
                          <path
                            d="M 56 24 L 56 115 L 34 152"
                            fill="none"
                            stroke="#d4d4d8"
                            strokeWidth="4.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <rect
                            x="25"
                            y="146"
                            width="14"
                            height="20"
                            rx="3"
                            transform="rotate(28 32 156)"
                            fill="#fa2d48"
                          />
                        </svg>
                      </div>
                    </div>
                  ) : (
                    <div className="relative flex items-center justify-center flex-shrink-0">
                      {/* Dynamic Ambient Album Glow behind Album Cover */}
                      <div
                        className="absolute -inset-8 rounded-3xl pointer-events-none blur-3xl transition-all duration-1000 will-change-transform"
                        style={{
                          background: `radial-gradient(circle, ${palette.primary}65 0%, ${palette.secondary}30 55%, transparent 75%)`,
                          opacity: isPlaying ? 0.9 : 0.45,
                          transform: isPlaying ? 'scale(1.04)' : 'scale(0.96)'
                        }}
                      />
                      <motion.div
                        onClick={() => setDeckMode('vinyl')}
                        title="Click to switch to Spinning Vinyl Turntable"
                        animate={{ scale: isPlaying ? 1 : 0.95 }}
                        transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                        className={`relative aspect-square rounded-3xl overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.75)] border border-white/15 flex-shrink-0 cursor-pointer will-change-transform ${
                          showLyrics
                            ? 'w-[min(26vh,220px)] h-[min(26vh,220px)] sm:w-[min(32vh,260px)] sm:h-[min(32vh,260px)]'
                            : 'w-[min(36vh,290px)] h-[min(36vh,290px)] sm:w-[min(40vh,320px)] sm:h-[min(40vh,320px)]'
                        }`}
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
                    </div>
                  )}

                  {/* Track Title & Artist */}
                  <div className="mt-5 w-full flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl sm:text-2xl font-extrabold text-white truncate">
                          {currentTrack.title}
                        </h2>
                        {trackIsOffline && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 whitespace-nowrap flex-shrink-0">
                            ⚡ OFFLINE
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

                      <button
                        type="button"
                        onClick={handleToggleLike}
                        aria-label={isLiked ? 'Unlike track' : 'Like track'}
                        title={isLiked ? 'Unlike' : 'Like'}
                        className={`w-10 h-10 p-0 flex items-center justify-center rounded-full flex-shrink-0 transition-transform cursor-pointer active:scale-75 ${
                          isLiked
                            ? 'glass-button-primary text-[var(--color-accent)] scale-105'
                            : 'glass-button text-white/65 hover:text-white'
                        }`}
                      >
                        <svg
                          className="w-5 h-5 block"
                          viewBox="0 0 24 24"
                          fill={isLiked ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Isolated 120fps Progress Bar */}
                  <NowPlayingScrubber fallbackDuration={currentTrack.duration || 210} />

                  {/* Symmetric Centered Transport Buttons */}
                  <div className="w-full flex items-center justify-center gap-5 sm:gap-6 mt-3">
                    <button
                      onClick={handleToggleShuffle}
                      title={isShuffled ? 'Shuffle On' : 'Shuffle Off'}
                      className={`w-10 h-10 p-0 flex items-center justify-center rounded-full transition-all cursor-pointer active:scale-90 ${
                        isShuffled
                          ? 'glass-button-primary text-white'
                          : 'glass-button text-white/60 hover:text-white'
                      }`}
                    >
                      <svg className="w-4 h-4 block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                      </svg>
                    </button>

                    <button
                      onClick={handlePrevTrack}
                      title="Previous Track"
                      className="w-11 h-11 p-0 flex items-center justify-center rounded-full glass-button text-white cursor-pointer active:scale-90"
                    >
                      <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                      </svg>
                    </button>

                    <button
                      onClick={handleTogglePlay}
                      title={isPlaying ? 'Pause' : 'Play'}
                      className="w-16 h-16 p-0 flex items-center justify-center rounded-full glass-button-primary text-white hover:scale-105 active:scale-90 transition-transform cursor-pointer shadow-[0_10px_32px_rgba(250,45,72,0.38)]"
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
                    </button>

                    <button
                      onClick={handleNextTrack}
                      title="Next Track"
                      className="w-11 h-11 p-0 flex items-center justify-center rounded-full glass-button text-white cursor-pointer active:scale-90"
                    >
                      <svg className="w-5 h-5 block" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                      </svg>
                    </button>

                    <button
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
                      className={`w-10 h-10 p-0 flex items-center justify-center rounded-full transition-all cursor-pointer relative active:scale-90 ${
                        repeatMode !== 'off'
                          ? 'glass-button-primary text-white'
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
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[var(--color-accent)] text-white text-[8px] font-black flex items-center justify-center shadow-sm border border-white/20">
                          1
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Mobile Actions vs Desktop Volume & Feature Toggles */}
                  {isPhone ? (
                    <div
                      className="w-full flex items-center justify-between gap-1.5 mt-5 pt-3 border-t border-white/10"
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
                    <div className="w-full flex items-center justify-between gap-3 mt-5 pt-3 border-t border-white/10">
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={toggleMute}
                          title={isMuted || volume === 0 ? 'Unmute Audio' : 'Mute Audio'}
                          className={`w-9 h-9 p-0 rounded-full flex items-center justify-center transition-all cursor-pointer flex-shrink-0 ${
                            isMuted || volume === 0
                              ? 'glass-button-primary text-rose-300'
                              : 'glass-button text-white/85 hover:text-white'
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
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={isMuted ? 0 : volume}
                          onChange={(e) => setVolume(Number(e.target.value))}
                          className="w-20 sm:w-24"
                        />
                        <span className="text-[11px] font-bold text-white/55 tabular-nums w-8">
                          {Math.round((isMuted ? 0 : volume) * 100)}%
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowLyrics(!showLyrics)}
                          className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
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
                          className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
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
                </motion.div>

                {/* Right Column: Synced Lyrics Panel (Pure GPU transform/opacity entrance) */}
                <AnimatePresence mode="popLayout">
                  {showLyrics && (
                    <motion.div
                      key="lyrics-panel"
                      initial={{ opacity: 0, x: 32, scale: 0.96 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: 32, scale: 0.96 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.65 }}
                      className="w-full lg:w-7/12 h-[42vh] lg:h-[72vh] flex-shrink-0 will-change-transform"
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
              </motion.div>
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
