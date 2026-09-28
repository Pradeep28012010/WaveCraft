import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useSettingsStore } from '../../stores/settingsStore';
import QueuePanel from './QueuePanel';
import LyricsView from '../lyrics/LyricsView';
import Visualizer from '../visualizer/Visualizer';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';

interface NowPlayingProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NowPlaying({ isOpen, onClose }: NowPlayingProps) {
  const [showQueue, setShowQueue] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);

  const {
    currentTrack,
    queue,
    queueIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    repeatMode,
    isShuffled,
    playbackSpeed,
    togglePlay,
    nextTrack,
    prevTrack,
    toggleShuffle,
    cycleRepeat,
    setVolume,
    seekTo,
    toggleMute,
    setPlaybackSpeed
  } = usePlayerStore();

  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const isLiked = useLibraryStore((s) => (currentTrack ? s.isLiked(currentTrack.id) : false));

  const showVisualizer = useSettingsStore((s) => s.showVisualizer);
  const visualizerStyle = useSettingsStore((s) => s.visualizerStyle);
  const toggleVisualizer = useSettingsStore((s) => s.toggleVisualizer);

  if (!currentTrack) return null;

  const activeDuration = duration || currentTrack.duration || 1;
  const pct = Math.min(100, Math.max(0, (currentTime / activeDuration) * 100));
  const nextUpTrack = queue[queueIndex + 1] || (repeatMode === 'all' ? queue[0] : null);

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    seekTo(ratio * activeDuration);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 220 }}
          className="fixed inset-0 z-50 flex flex-col bg-[#06060b] overflow-hidden select-none"
        >
          {/* Ambient Blurred Album Art Backdrop */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <img
              src={currentTrack.thumbnailLarge || currentTrack.thumbnail || DEFAULT_THUMBNAIL}
              alt=""
              className="w-full h-full object-cover opacity-45 blur-[110px] scale-125"
            />
            <div className="absolute inset-0 bg-black/55 backdrop-blur-3xl" />
          </div>

          {/* Background Visualizer Layer */}
          {showVisualizer && (
            <div className="absolute inset-0 pointer-events-none opacity-35 z-0">
              <Visualizer
                isActive={isPlaying}
                style={(visualizerStyle === 'particles' ? 'blob' : visualizerStyle) as any}
                fullScreen
              />
            </div>
          )}

          {/* Top Bar (Compact 64px) */}
          <div className="relative z-10 h-16 px-6 sm:px-10 flex items-center justify-between flex-shrink-0">
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full liquid-glass text-white hover:scale-105 transition-transform cursor-pointer"
              title="Minimize Player"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

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

            <button
              onClick={() => {
                const speeds = [0.75, 1, 1.25, 1.5];
                const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length] || 1;
                setPlaybackSpeed(next);
              }}
              className="px-3.5 h-9 rounded-full liquid-glass text-xs font-bold text-white/90 hover:text-white cursor-pointer"
              title="Playback Speed"
            >
              {playbackSpeed}x
            </button>
          </div>

          {/* Main Body — Fits 100% inside remaining viewport height with zero overflow */}
          <div className="relative z-10 flex-1 min-h-0 px-6 sm:px-12 pb-6 flex items-center justify-center overflow-hidden">
            <div
              className={`w-full max-w-6xl h-full flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-12 ${
                showLyrics ? 'lg:justify-between' : ''
              }`}
            >
              {/* Left / Center Player Column */}
              <div
                className={`flex flex-col items-center justify-center w-full ${
                  showLyrics ? 'lg:w-5/12 max-w-md' : 'max-w-lg'
                }`}
              >
                {/* Viewport-aware Album Art */}
                <motion.div
                  animate={{ scale: isPlaying ? 1 : 0.95 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                  className={`relative aspect-square rounded-3xl overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.75)] border border-white/15 flex-shrink-0 ${
                    showLyrics
                      ? 'w-[min(26vh,220px)] h-[min(26vh,220px)] sm:w-[min(32vh,260px)] sm:h-[min(32vh,260px)]'
                      : 'w-[min(36vh,290px)] h-[min(36vh,290px)] sm:w-[min(40vh,320px)] sm:h-[min(40vh,320px)]'
                  }`}
                >
                  <img
                    src={currentTrack.thumbnailLarge || currentTrack.thumbnail || DEFAULT_THUMBNAIL}
                    alt={currentTrack.title}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                    }}
                    className="w-full h-full object-cover"
                  />
                </motion.div>

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

                {/* Progress Bar */}
                <div className="w-full mt-4">
                  <div
                    className="h-2 bg-white/15 rounded-full cursor-pointer relative group"
                    onClick={handleProgressClick}
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-white rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    >
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity translate-x-1/2" />
                    </div>
                  </div>
                  <div className="flex justify-between mt-1.5 text-[11px] text-white/50 font-semibold tabular-nums">
                    <span>{formatTime(currentTime)}</span>
                    <span>-{formatTime(Math.max(0, activeDuration - currentTime))}</span>
                  </div>
                </div>

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
                <div className="w-full flex items-center justify-between gap-4 mt-5 pt-3 border-t border-white/10">
                  <div className="flex items-center gap-2.5">
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
                      className="w-24"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleVisualizer}
                      className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
                        showVisualizer ? 'liquid-glass text-white' : 'text-white/50 hover:text-white'
                      }`}
                    >
                      Visualizer
                    </button>
                    <button
                      onClick={() => setShowLyrics(!showLyrics)}
                      className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
                        showLyrics ? 'bg-[var(--color-accent)] text-white shadow-lg' : 'text-white/50 hover:text-white'
                      }`}
                    >
                      Lyrics
                    </button>
                    <button
                      onClick={() => setShowQueue(!showQueue)}
                      className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
                        showQueue ? 'liquid-glass text-white' : 'text-white/50 hover:text-white'
                      }`}
                    >
                      Queue
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Synced Lyrics Panel */}
              {showLyrics && (
                <motion.div
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  className="w-full lg:w-7/12 h-[42vh] lg:h-[72vh] flex-shrink-0"
                >
                  <LyricsView artist={currentTrack.artist} title={currentTrack.title} />
                </motion.div>
              )}
            </div>
          </div>

          <QueuePanel isOpen={showQueue} onClose={() => setShowQueue(false)} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
