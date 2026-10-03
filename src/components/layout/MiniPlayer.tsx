import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import NowPlaying from '../player/NowPlaying';
import QueuePanel from '../player/QueuePanel';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/**
 * Isolated 120fps GPU-Composited Scrubber (`transform: scaleX`)
 * Prevents the main MiniPlayer tree from re-rendering on `timeupdate`.
 */
const MiniPlayerScrubber = memo(({ fallbackDuration }: { fallbackDuration: number }) => {
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);

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

  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    setHoverX(x);
    setHoverTime((x / rect.width) * activeDuration);
  };

  return (
    <div
      className="absolute top-0 left-4 right-4 h-1.5 bg-white/10 rounded-full cursor-pointer group hover:h-2 transition-all z-20"
      onClick={handleProgressClick}
      onMouseMove={handleProgressHover}
      onMouseLeave={() => setHoverTime(null)}
    >
      {hoverTime !== null && (
        <div
          style={{ transform: `translate3d(${hoverX}px, 0, 0)` }}
          className="pointer-events-none absolute -top-7 left-0 -translate-x-1/2 px-2 py-0.5 rounded-md bg-black/90 border border-white/20 text-[10px] font-bold tabular-nums text-white shadow-lg will-change-transform"
        >
          {formatTime(hoverTime)}
        </div>
      )}
      {/* Soft diffused ambient glow layer underneath (never clipped or horizontally squashed) */}
      <div
        className="pointer-events-none absolute top-1/2 -translate-y-1/2 left-0 h-3 rounded-full bg-gradient-to-r from-[var(--color-accent)] via-rose-500 to-purple-500 opacity-55 blur-md transition-[width] duration-150 ease-linear"
        style={{ width: `${(ratio * 100).toFixed(2)}%` }}
      />
      {/* Crisp rounded progress fill with glowing playhead tip */}
      <div
        className="relative h-full bg-gradient-to-r from-[var(--color-accent)] via-rose-500 to-purple-500 rounded-full transition-[width] duration-150 ease-linear"
        style={{
          width: `${(ratio * 100).toFixed(2)}%`,
          boxShadow: '0 0 10px 1px var(--color-accent)'
        }}
      >
        <div
          className=" -right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all shadow-[0_0_10px_2px_var(--color-accent)] absolute"
        />
      </div>
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

export default function MiniPlayer() {
  const [isNowPlayingOpen, setIsNowPlayingOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);

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
    currentTrack ? s.likedSongs.some((item) => item.id === currentTrack.id) : false
  );

  if (!currentTrack) return null;

  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    setVolume(ratio);
  };

  return (
    <>
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="px-4 pb-3 pt-1 relative z-30 gpu-layer"
      >
        <div className="h-20 liquid-glass rounded-2xl flex items-center px-5 relative overflow-visible shadow-[0_20px_60px_rgba(0,0,0,0.75)]">
          {/* Isolated 120fps Progress Scrubber */}
          <MiniPlayerScrubber fallbackDuration={currentTrack.duration || 210} />

          {/* Left: Track Artwork & Info */}
          <div className="w-1/3 flex items-center min-w-0 pr-4 gap-3.5">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTrack.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 360, damping: 26 }}
                whileHover={{ scale: 1.06, y: -2 }}
                whileTap={{ scale: 0.95 }}
                className="relative w-13 h-13 rounded-xl overflow-hidden flex-shrink-0 cursor-pointer group shadow-lg border border-white/15 will-change-transform"
                onClick={() => setIsNowPlayingOpen(true)}
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
                  <svg
                    className="w-5 h-5 text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                  >
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
                <div className="flex items-center gap-2">
                  <h4
                    className="text-sm font-bold text-white truncate cursor-pointer hover:text-[var(--color-accent)] transition-colors"
                    onClick={() => setIsNowPlayingOpen(true)}
                  >
                    {currentTrack.title}
                  </h4>
                </div>
                <p className="text-xs text-white/60 truncate mt-0.5">{currentTrack.artist}</p>
              </motion.div>
            </AnimatePresence>

            <motion.button
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.75 }}
              animate={isLiked ? { scale: [1, 1.3, 1] } : { scale: 1 }}
              transition={{ duration: 0.28 }}
              onClick={() => toggleLike(currentTrack)}
              title={isLiked ? 'Unlike' : 'Like'}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors flex-shrink-0 cursor-pointer ${
                isLiked
                  ? 'text-[var(--color-accent)] drop-shadow-[0_0_10px_rgba(250,45,72,0.6)]'
                  : 'text-white/45 hover:text-white hover:bg-white/10'
              }`}
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill={isLiked ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </motion.button>
          </div>

          {/* Center: Transport Controls */}
          <div className="w-1/3 flex flex-col items-center justify-center">
            <div className="flex items-center justify-center gap-5">
              <motion.button
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.88 }}
                onClick={toggleShuffle}
                title="Shuffle"
                className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
                  isShuffled ? 'text-[var(--color-accent)] bg-white/10' : 'text-white/50 hover:text-white'
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                </svg>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.12, x: -1 }}
                whileTap={{ scale: 0.88 }}
                onClick={prevTrack}
                title="Previous"
                className="w-9 h-9 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                </svg>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.09 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                onClick={togglePlay}
                title={isPlaying ? 'Pause' : 'Play'}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-white text-black shadow-[0_0_24px_rgba(255,255,255,0.4)] cursor-pointer will-change-transform"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                ) : isPlaying ? (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.12, x: 1 }}
                whileTap={{ scale: 0.88 }}
                onClick={nextTrack}
                title="Next"
                className="w-9 h-9 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.88 }}
                onClick={cycleRepeat}
                title={`Repeat: ${repeatMode}`}
                className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
                  repeatMode !== 'off' ? 'text-[var(--color-accent)] bg-white/10' : 'text-white/50 hover:text-white'
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {repeatMode === 'one' ? (
                    <>
                      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                      <polyline points="17 1 21 5 17 9" />
                      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                      <polyline points="7 23 3 19 7 15" />
                      <text x="10" y="15" fontSize="8" fill="currentColor" stroke="none" fontWeight="bold">
                        1
                      </text>
                    </>
                  ) : (
                    <>
                      <polyline points="17 1 21 5 17 9" />
                      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                      <polyline points="7 23 3 19 7 15" />
                      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    </>
                  )}
                </svg>
              </motion.button>
            </div>
          </div>

          {/* Right: Isolated Time Readout, Queue, Volume, Expand */}
          <div className="w-1/3 flex items-center justify-end gap-3 text-xs text-white/60">
            <MiniPlayerTimeReadout fallbackDuration={currentTrack.duration || 210} />

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsQueueOpen(!isQueueOpen)}
              title="Queue"
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
                isQueueOpen ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </motion.button>

            <div className="hidden sm:flex items-center gap-2 w-28">
              <button
                onClick={toggleMute}
                className="w-6 h-6 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer"
              >
                {isMuted || volume === 0 ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                )}
              </button>
              <div
                className="flex-1 h-1.5 bg-white/20 rounded-full cursor-pointer relative group overflow-hidden"
                onClick={handleVolumeClick}
              >
                <div
                  className="h-full bg-white rounded-full group-hover:bg-[var(--color-accent)] transition-all"
                  style={{ width: `${((isMuted ? 0 : volume) * 100).toFixed(1)}%` }}
                />
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.9 }}
              className="w-8 h-8 flex items-center justify-center rounded-full glass-button text-white/75 hover:text-white"
              onClick={() => setIsNowPlayingOpen(true)}
              title="Full Screen Player"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
