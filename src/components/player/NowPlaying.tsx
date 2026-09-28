import { motion, AnimatePresence } from 'framer-motion';
import { useState, memo } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useStudioStore, STUDIO_FX_MODES } from '../../stores/studioStore';
import QueuePanel from './QueuePanel';
import LyricsView from '../lyrics/LyricsView';
import Visualizer, { type VisualizerStyle } from '../visualizer/Visualizer';
import WaveCardModal from './WaveCardModal';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';

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

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

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
        className="h-2 bg-white/15 rounded-full cursor-pointer relative group overflow-hidden"
        onClick={handleProgressClick}
      >
        <div
          className="h-full w-full bg-white rounded-full origin-left will-change-transform transition-transform duration-150 ease-linear"
          style={{ transform: `scaleX(${ratio.toFixed(4)})` }}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-[11px] text-white/50 font-semibold tabular-nums">
        <span>{formatTime(currentTime)}</span>
        <span>-{formatTime(Math.max(0, activeDuration - currentTime))}</span>
      </div>
    </div>
  );
});
NowPlayingScrubber.displayName = 'NowPlayingScrubber';

export default function NowPlaying({ isOpen, onClose }: NowPlayingProps) {
  const [showQueue, setShowQueue] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [deckMode, setDeckMode] = useState<'cover' | 'vinyl'>('vinyl');
  const [zenMode, setZenMode] = useState(false);
  const [showWaveCard, setShowWaveCard] = useState(false);

  // Atomic Zustand selectors (prevents re-rendering on currentTime / progress ticks!)
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
  const isLiked = useLibraryStore((s) => (currentTrack ? s.isLiked(currentTrack.id) : false));

  const showVisualizer = useSettingsStore((s) => s.showVisualizer);
  const visualizerStyle = useSettingsStore((s) => s.visualizerStyle);
  const setVisualizerStyle = useSettingsStore((s) => s.setVisualizerStyle);
  const setShowVisualizer = useSettingsStore((s) => s.setShowVisualizer);
  const fxMode = useStudioStore((s) => s.fxMode);
  const setStudioModalOpen = useStudioStore((s) => s.setStudioModalOpen);

  if (!currentTrack) return null;

  const nextUpTrack = queue[queueIndex + 1] || (repeatMode === 'all' ? queue[0] : null);
  const artSrc = currentTrack.thumbnailLarge || currentTrack.thumbnail || DEFAULT_THUMBNAIL;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 280, mass: 0.75 }}
          className="fixed inset-0 z-50 flex flex-col bg-[#06060b] overflow-hidden select-none gpu-layer"
        >
          {/* GPU-Cached Ambient Album Art Backdrop */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ contain: 'strict' }}>
            <img
              src={artSrc}
              alt=""
              className={`w-full h-full object-cover blur-[64px] scale-125 transition-opacity duration-500 gpu-layer ${
                zenMode ? 'opacity-20' : 'opacity-42'
              }`}
            />
            <div className="absolute inset-0 bg-black/55" />
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

          {/* Top Bar */}
          <div className="relative z-10 h-16 px-6 sm:px-10 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center rounded-full liquid-glass text-white hover:scale-105 transition-transform cursor-pointer"
                title="Minimize Player"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Cover vs Vinyl Turntable Switcher */}
              {!zenMode && (
                <div className="hidden sm:flex items-center p-1 rounded-full liquid-glass border border-white/10">
                  <button
                    onClick={() => setDeckMode('cover')}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                      deckMode === 'cover' ? 'bg-white text-black shadow' : 'text-white/65 hover:text-white'
                    }`}
                  >
                    Cover
                  </button>
                  <button
                    onClick={() => setDeckMode('vinyl')}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                      deckMode === 'vinyl' ? 'bg-white text-black shadow' : 'text-white/65 hover:text-white'
                    }`}
                  >
                    Vinyl Deck
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-bold tracking-[0.18em] text-white/60 uppercase">
                  {currentTrack.quality || '320kbps Studio AAC'}
                </span>
              </div>
              {nextUpTrack && (
                <span className="text-[11px] text-white/45 truncate max-w-xs mt-0.5">
                  Next Preloaded: <strong className="text-white/75">{nextUpTrack.title}</strong>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Studio Audio FX & Ambient Mixer Button */}
              <button
                onClick={() => setStudioModalOpen(true)}
                className={`px-3.5 h-9 rounded-full text-xs font-extrabold flex items-center gap-1.5 cursor-pointer border transition-all ${
                  fxMode !== 'normal'
                    ? 'bg-gradient-to-r from-[var(--color-accent)] to-purple-600 text-white border-white/25 shadow-[0_0_20px_rgba(250,45,72,0.45)]'
                    : 'liquid-glass text-white/90 hover:text-white border-white/15'
                }`}
                title="Open Studio Audio FX (Slowed + Reverb, 8D Orbit, Nightcore) & Ambient Mixer"
              >
                <span>🎛️</span>
                <span className="hidden sm:inline">
                  {fxMode !== 'normal'
                    ? STUDIO_FX_MODES.find((m) => m.id === fxMode)?.name || 'Studio FX'
                    : 'Studio FX'}
                </span>
              </button>

              {/* Share WaveCard Button */}
              <button
                onClick={() => setShowWaveCard(true)}
                className="px-3.5 h-9 rounded-full liquid-glass text-xs font-bold text-white/90 hover:text-white flex items-center gap-1.5 cursor-pointer border border-white/15"
                title="Generate Shareable Lyric WaveCard"
              >
                <svg className="w-3.5 h-3.5 text-[var(--color-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span className="hidden sm:inline">WaveCard</span>
              </button>

              {/* 3D Zen Mode Toggle */}
              <button
                onClick={() => {
                  const nextZen = !zenMode;
                  setZenMode(nextZen);
                  if (nextZen) setShowVisualizer(true);
                }}
                className={`px-3.5 h-9 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  zenMode
                    ? 'bg-[var(--color-accent)] text-white shadow-[0_0_20px_var(--color-accent)]'
                    : 'liquid-glass text-white/85 hover:text-white'
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
                className="px-3 h-9 rounded-full liquid-glass text-xs font-bold text-white/90 hover:text-white cursor-pointer"
                title="Playback Speed"
              >
                {playbackSpeed}x
              </button>
            </div>
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
                        ? 'bg-[var(--color-accent)] text-white shadow-lg'
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
                    <button onClick={prevTrack} className="text-white/75 hover:text-white cursor-pointer">
                      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                      </svg>
                    </button>
                    <button
                      onClick={togglePlay}
                      className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:scale-105 transition-transform cursor-pointer"
                    >
                      {isPlaying ? (
                        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>
                    <button onClick={nextTrack} className="text-white/75 hover:text-white cursor-pointer">
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
            <div className="relative z-10 flex-1 min-h-0 px-6 sm:px-12 pb-6 flex items-center justify-center overflow-hidden">
              <motion.div
                layout
                transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.7 }}
                className={`w-full max-w-6xl h-full flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-12 will-change-transform ${
                  showLyrics ? 'lg:justify-between' : ''
                }`}
              >
                {/* Left / Center Player Column */}
                <motion.div
                  layout
                  transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.7 }}
                  className={`flex flex-col items-center justify-center w-full will-change-transform ${
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
                      {/* Outer Vinyl Platter */}
                      <div
                        className="relative w-full h-full rounded-full shadow-[0_25px_70px_rgba(0,0,0,0.85)] border-4 border-white/10 flex items-center justify-center overflow-hidden will-change-transform"
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
                        className="absolute -top-2 -right-3 w-20 h-44 pointer-events-none transition-transform duration-500 origin-[75%_16%] will-change-transform"
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
                  )}

                  {/* Track Title & Artist */}
                  <div className="mt-5 w-full flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 text-left">
                      <h2 className="text-xl sm:text-2xl font-extrabold text-white truncate">
                        {currentTrack.title}
                      </h2>
                      <p className="text-sm sm:text-base text-white/60 mt-0.5 font-medium truncate">
                        {currentTrack.artist}
                      </p>
                    </div>

                    <button
                      onClick={() => toggleLike(currentTrack)}
                      className={`w-10 h-10 flex items-center justify-center rounded-full liquid-glass flex-shrink-0 transition-transform cursor-pointer ${
                        isLiked ? 'text-[var(--color-accent)] scale-105' : 'text-white/60 hover:text-white'
                      }`}
                    >
                      <svg
                        className="w-5 h-5"
                        viewBox="0 0 24 24"
                        fill={isLiked ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                    </button>
                  </div>

                  {/* Isolated 120fps Progress Bar */}
                  <NowPlayingScrubber fallbackDuration={currentTrack.duration || 210} />

                  {/* Transport Buttons */}
                  <div className="flex items-center justify-center gap-6 sm:gap-8 mt-3">
                    <button
                      onClick={toggleShuffle}
                      className={`w-10 h-10 flex items-center justify-center rounded-full transition-all cursor-pointer ${
                        isShuffled ? 'liquid-glass text-[var(--color-accent)]' : 'text-white/50 hover:text-white'
                      }`}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                      </svg>
                    </button>

                    <button
                      onClick={prevTrack}
                      className="w-11 h-11 flex items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                      </svg>
                    </button>

                    <button
                      onClick={togglePlay}
                      className="w-15 h-15 flex items-center justify-center rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-transform shadow-[0_0_35px_rgba(255,255,255,0.4)] cursor-pointer"
                    >
                      {isPlaying ? (
                        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                        </svg>
                      ) : (
                        <svg className="w-7 h-7 ml-1" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>

                    <button
                      onClick={nextTrack}
                      className="w-11 h-11 flex items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                      </svg>
                    </button>

                    <button
                      onClick={cycleRepeat}
                      className={`w-10 h-10 flex items-center justify-center rounded-full transition-all cursor-pointer ${
                        repeatMode !== 'off' ? 'liquid-glass text-[var(--color-accent)]' : 'text-white/50 hover:text-white'
                      }`}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="17 1 21 5 17 9" />
                        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                        <polyline points="7 23 3 19 7 15" />
                        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                      </svg>
                    </button>
                  </div>

                  {/* Volume & Feature Toggles Row */}
                  <div className="w-full flex items-center justify-between gap-3 mt-5 pt-3 border-t border-white/10">
                    <div className="flex items-center gap-2">
                      <button onClick={toggleMute} className="text-white/60 hover:text-white cursor-pointer">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        </svg>
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
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <button
                        onClick={() => {
                          const idx = VISUALIZER_MODES.findIndex((m) => m.id === visualizerStyle);
                          const next = VISUALIZER_MODES[(idx + 1) % VISUALIZER_MODES.length];
                          setShowVisualizer(true);
                          setVisualizerStyle(next.id);
                        }}
                        className="px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase liquid-glass text-white/85 hover:text-white cursor-pointer"
                        title="Cycle 3D Visualizer Style"
                      >
                        {VISUALIZER_MODES.find((m) => m.id === visualizerStyle)?.label || '3D Nebula'}
                      </button>
                      <button
                        onClick={() => setShowLyrics(!showLyrics)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
                          showLyrics ? 'bg-[var(--color-accent)] text-white shadow-lg' : 'text-white/50 hover:text-white'
                        }`}
                      >
                        Lyrics
                      </button>
                      <button
                        onClick={() => setShowQueue(!showQueue)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
                          showQueue ? 'liquid-glass text-white' : 'text-white/50 hover:text-white'
                        }`}
                      >
                        Queue
                      </button>
                    </div>
                  </div>
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
                      <LyricsView artist={currentTrack.artist} title={currentTrack.title} />
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
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
