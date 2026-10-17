import { useRef, useEffect, memo } from 'react';
import { motion } from 'framer-motion';
import type { Track } from '../../types';
import Skeleton from '../ui/Skeleton';
import { usePlayerStore } from '../../stores/playerStore';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';
import { SPOTIFY_TRENDING_CATEGORIES } from '../../services/youtube';
import { preloadTrackArtworks } from '../../utils/imagePreloader';

interface TrendingSectionProps {
  tracks: Track[];
  isLoading: boolean;
  activeCategory?: string;
  onSelectCategory?: (category: string) => void;
  onPlayTrack: (track: Track, allTracks: Track[], index?: number) => void;
}

function TrendingSection({
  tracks,
  isLoading,
  activeCategory = 'global',
  onSelectCategory,
  onPlayTrack
}: TrendingSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const categoriesRef = useRef<HTMLDivElement>(null);
  const currentTrackId = usePlayerStore((s) => s.currentTrack?.id);
  const currentTrackTitle = usePlayerStore((s) => s.currentTrack?.title);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { current } = scrollRef;
      const scrollAmount = current.clientWidth * 0.75;
      current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const activeCategoryInfo =
    SPOTIFY_TRENDING_CATEGORIES.find((c) => c.key === activeCategory) ||
    SPOTIFY_TRENDING_CATEGORIES[0];

  useEffect(() => {
    if (tracks && tracks.length > 0) {
      preloadTrackArtworks(tracks);
    }
  }, [tracks]);

  return (
    <section className="mb-12">
      {/* Header with Title and Spotify Charts Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Trending Hits</h2>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1ed760]/15 border-0 text-[#1ed760] text-[11px] font-black tracking-wide backdrop-blur-md shadow-sm">
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.498 17.306c-.218.358-.684.472-1.042.254-2.855-1.745-6.45-2.14-10.684-1.173-.41.094-.82-.162-.914-.572-.094-.41.162-.82.572-.914 4.634-1.059 8.608-.609 11.814 1.363.358.218.472.684.254 1.042zm1.468-3.264c-.274.446-.86.588-1.306.314-3.268-2.008-8.249-2.59-12.115-1.416-.5.152-1.03-.134-1.182-.634-.152-.5.134-1.03.634-1.182 4.417-1.34 9.907-.687 13.655 1.612.446.274.588.86.314 1.306zm.126-3.41c-3.918-2.327-10.377-2.541-14.116-1.405-.6.183-1.237-.16-1.42-.76-.183-.6.16-1.237.76-1.42 4.298-1.305 11.433-1.055 15.937 1.62.54.32.715 1.026.395 1.566-.32.54-1.026.715-1.566.395z" />
              </svg>
              <span>Spotify Charts</span>
            </span>
          </div>
          <p className="text-xs text-white/60 mt-1 font-medium flex items-center gap-1.5">
            <span className="text-white/80 font-bold">{activeCategoryInfo.name}</span>
            <span>•</span>
            <span>{activeCategoryInfo.genre}</span>
            <span>•</span>
            <span className="text-[#1ed760]/80">Verified stream rankings</span>
          </p>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => scroll('left')}
            className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white/80 hover:text-white cursor-pointer active:scale-90 transition-transform"
            title="Scroll Left"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => scroll('right')}
            className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white/80 hover:text-white cursor-pointer active:scale-90 transition-transform"
            title="Scroll Right"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Genre & Language Category Filter Pills */}
      {onSelectCategory && (
        <div
          ref={categoriesRef}
          className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2 px-1 mb-4 relative z-10"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {SPOTIFY_TRENDING_CATEGORIES.map((cat) => {
            const isSelected = cat.key === activeCategory;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => onSelectCategory(cat.key)}
                className="relative px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap flex items-center gap-1.5 cursor-pointer flex-shrink-0 select-none"
              >
                {isSelected && (
                  <motion.div
                    layoutId="trending-category-pill"
                    transition={{ type: 'spring', bounce: 0.15, duration: 0.32 }}
                    className="absolute inset-0 rounded-full liquid-sliding-pill-emerald -z-0 pointer-events-none"
                  />
                )}
                <span className="relative z-10 text-xs">{cat.icon}</span>
                <span
                  className={`relative z-10 font-bold transition-colors duration-150 ${
                    isSelected ? 'text-emerald-200 drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]' : 'text-white/70 hover:text-white'
                  }`}
                >
                  {cat.name}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Track Cards Horizontal Scroll */}
      <div
        ref={scrollRef}
        className="flex gap-4 sm:gap-5 overflow-x-auto overflow-y-hidden no-scrollbar pt-2 pb-6 px-1 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {isLoading && tracks.length === 0
          ? Array(8)
              .fill(0)
              .map((_, i) => (
                <div key={i} className="min-w-[155px] sm:min-w-[170px] max-w-[170px] flex-shrink-0">
                  <Skeleton className="w-[155px] sm:w-[170px] h-[155px] sm:h-[170px] rounded-2xl mb-3" />
                  <Skeleton className="w-3/4 h-4 mb-2 rounded" />
                  <Skeleton className="w-1/2 h-3 rounded" />
                </div>
              ))
          : tracks.map((track, i) => {
              const isActive = currentTrackId === track.id || currentTrackTitle === track.title;
              return (
                <div
                  key={`${track.id}-${i}`}
                  className="min-w-[150px] max-w-[150px] sm:min-w-[170px] sm:max-w-[170px] flex-shrink-0 snap-start group cursor-pointer relative"
                  onContextMenu={(e) => {
                    if (e.shiftKey) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const clientX = e.clientX;
                    const clientY = e.clientY;
                    useContextMenuStore.getState().openTrackMenu({ clientX, clientY }, track, tracks);
                  }}
                  onClick={() => {
                    if (isActive) {
                      usePlayerStore.getState().togglePlay();
                    } else {
                      onPlayTrack(track, tracks, i);
                    }
                  }}
                >
                  <div className={`aspect-square rounded-2xl overflow-hidden mb-2.5 relative bg-white/5 shadow-md group-hover:shadow-2xl transition-all duration-300 ${
                    isActive ? 'shadow-[0_8px_25px_rgba(250,45,72,0.3)] ring-1 ring-[var(--color-accent)]/40' : ''
                  }`}>
                    {/* Top Chart Rank Badge: #01, #02... */}
                    <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-[10px] font-black tracking-tight text-white/95 shadow-sm border-0 flex items-center gap-0.5">
                      <span className="text-[var(--color-accent)] font-black text-[11px]">#</span>
                      <span className="tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                    </div>

                    {/* Dedicated 3-Dots Action Button for mobile & desktop */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const clientX = e.clientX;
                        const clientY = e.clientY;
                        useContextMenuStore.getState().openTrackMenu({ clientX, clientY }, track, tracks);
                      }}
                      className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white/80 opacity-0 group-hover:opacity-100 sm:group-hover:opacity-100 hover:text-white hover:bg-black/80 active:scale-90 transition-all cursor-pointer"
                      title="Track actions"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>

                    {/* Subtle Music Note Placeholder */}
                    <div className="absolute inset-0 flex items-center justify-center text-white/10 pointer-events-none">
                      <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                      </svg>
                    </div>

                    <img
                      src={track.thumbnail || track.thumbnailUrl || DEFAULT_THUMBNAIL}
                      alt={track.title}
                      loading={i < 8 ? 'eager' : 'lazy'}
                      decoding="async"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                      }}
                      className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-500 ease-out relative z-[1]"
                    />

                    {/* Active Equalizer Mini-Badge */}
                    {isActive && isPlaying && (
                      <div className="absolute bottom-2 left-2 z-10 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md flex items-end gap-0.5 h-3.5 shadow-md border-0 pointer-events-none">
                        <span className="w-0.5 bg-[var(--color-accent)] rounded-full animate-[pulse_0.7s_ease-in-out_infinite] h-full" />
                        <span className="w-0.5 bg-[var(--color-accent)] rounded-full animate-[pulse_1.0s_ease-in-out_infinite] h-3/5" />
                        <span className="w-0.5 bg-[var(--color-accent)] rounded-full animate-[pulse_0.5s_ease-in-out_infinite] h-4/5" />
                      </div>
                    )}

                    {/* Desktop Hover / Active Play Button */}
                    <div
                      className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity duration-300 ${
                        isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <div
                        className={`w-11 h-11 rounded-full glass-button-primary text-white flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-all duration-300 ${
                          isActive
                            ? 'scale-100 translate-y-0'
                            : 'scale-90 translate-y-2 group-hover:scale-100 group-hover:translate-y-0'
                        }`}
                      >
                        {isActive && isPlaying ? (
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>

                  <h3 className={`font-bold text-xs sm:text-sm truncate transition-colors duration-200 ${
                    isActive ? 'text-[var(--color-accent)]' : 'text-white group-hover:text-[var(--color-accent)]'
                  }`}>
                    {track.title}
                  </h3>
                  <p className="text-[11px] text-white/50 truncate mt-0.5 font-medium">{track.artist}</p>
                </div>
              );
            })}
      </div>
    </section>
  );
}

TrendingSection.displayName = 'TrendingSection';

export default memo(TrendingSection);
