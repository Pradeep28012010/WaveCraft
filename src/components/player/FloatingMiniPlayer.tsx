import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';

interface FloatingMiniPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  onExpand: () => void;
}

/**
 * Apple Music Floating Island Capsule MiniPlayer (Image 2 Reference)
 * Exact recreation of the floating capsule miniplayer from user reference image.
 */
export const FloatingMiniPlayer = memo(({ isOpen, onClose, onExpand }: FloatingMiniPlayerProps) => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const isLiked = useLibraryStore((s) =>
    currentTrack ? Boolean(s.likedIds[currentTrack.id]) : false
  );

  if (!isOpen || !currentTrack) return null;

  return (
    <AnimatePresence>
      <motion.div
        drag
        dragConstraints={{ left: -500, right: 500, top: -500, bottom: 500 }}
        dragElastic={0.1}
        initial={{ opacity: 0, scale: 0.85, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: 30 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        className="fixed bottom-24 right-8 z-[80] select-none touch-none cursor-grab active:cursor-grabbing"
      >
        <div
          onClick={onExpand}
          className="h-16 px-3.5 rounded-[28px] liquid-glass bg-[#080812]/92 backdrop-blur-3xl border border-white/25 shadow-[0_24px_60px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.3)] flex items-center gap-3.5 min-w-[280px] max-w-sm group cursor-pointer"
        >
          {/* Album Artwork */}
          <div className="relative w-11 h-11 rounded-xl overflow-hidden shadow-md border border-white/15 flex-shrink-0">
            <img
              src={currentTrack.thumbnail || DEFAULT_THUMBNAIL}
              alt={currentTrack.title}
              onError={(e) => {
                (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
              }}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Title & Artist */}
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-bold text-white truncate group-hover:text-rose-400 transition-colors">
              {currentTrack.title}
            </h4>
            <p className="text-[11px] text-white/60 truncate">{currentTrack.artist}</p>
          </div>

          {/* Transport Controls (Play/Pause & Next matching Image 2) */}
          <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => toggleLike(currentTrack)}
              title={isLiked ? 'Favorited' : 'Favorite'}
              className="w-7 h-7 flex items-center justify-center rounded-full glass-button text-white/70 hover:text-white cursor-pointer"
            >
              {isLiked ? (
                <svg className="w-3.5 h-3.5 fill-amber-400 text-amber-400" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 fill-none stroke-currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              )}
            </button>

            <button
              onClick={togglePlay}
              title={isPlaying ? 'Pause' : 'Play'}
              className="w-8 h-8 rounded-full glass-button-primary text-white flex items-center justify-center shadow-md cursor-pointer active:scale-90 transition-transform"
            >
              {isLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isPlaying ? (
                <svg className="w-3.5 h-3.5 block" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6.5" y="5" width="3.5" height="14" rx="1.2" />
                  <rect x="14" y="5" width="3.5" height="14" rx="1.2" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 block" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7.5 5.65c0-.82.89-1.33 1.6-.91l10.05 6.35c.68.43.68 1.39 0 1.82L9.1 19.26c-.71.42-1.6-.09-1.6-.91V5.65z" />
                </svg>
              )}
            </button>

            <button
              onClick={nextTrack}
              title="Next Track"
              className="w-8 h-8 rounded-full glass-button text-white/85 flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>

            <button
              onClick={onClose}
              title="Close Floating Island"
              className="w-6 h-6 rounded-full text-white/40 hover:text-white flex items-center justify-center text-xs ml-0.5 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});
FloatingMiniPlayer.displayName = 'FloatingMiniPlayer';
