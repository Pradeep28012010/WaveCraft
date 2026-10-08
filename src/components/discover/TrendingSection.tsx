import { useRef } from 'react';
import type { Track } from '../../types';
import Skeleton from '../ui/Skeleton';
import { usePlayerStore } from '../../stores/playerStore';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';
import { SPOTIFY_TRENDING_CATEGORIES } from '../../services/youtube';

interface TrendingSectionProps {
  tracks: Track[];
  isLoading: boolean;
  activeCategory?: string;
  onSelectCategory?: (category: string) => void;
  onPlayTrack: (track: Track, allTracks: Track[], index?: number) => void;
}

export default function TrendingSection({
  tracks,
  isLoading,
  activeCategory = 'global',
  onSelectCategory,
  onPlayTrack
}: TrendingSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const categoriesRef = useRef<HTMLDivElement>(null);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
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

  return (
    <section className="mb-12">
      {/* Header with Title and Spotify Charts Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-bold text-white tracking-tight">Trending Hits</h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#1DB954]/15 border border-[#1DB954]/30 text-[#1ed760] text-[11px] font-bold">
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.498 17.306c-.218.358-.684.472-1.042.254-2.855-1.745-6.45-2.14-10.684-1.173-.41.094-.82-.162-.914-.572-.094-.41.162-.82.572-.914 4.634-1.059 8.608-.609 11.814 1.363.358.218.472.684.254 1.042zm1.468-3.264c-.274.446-.86.588-1.306.314-3.268-2.008-8.249-2.59-12.115-1.416-.5.152-1.03-.134-1.182-.634-.152-.5.134-1.03.634-1.182 4.417-1.34 9.907-.687 13.655 1.612.446.274.588.86.314 1.306zm.126-3.41c-3.918-2.327-10.377-2.541-14.116-1.405-.6.183-1.237-.16-1.42-.76-.183-.6.16-1.237.76-1.42 4.298-1.305 11.433-1.055 15.937 1.62.54.32.715 1.026.395 1.566-.32.54-1.026.715-1.566.395z" />
              </svg>
              <span>Spotify Charts</span>
            </span>
          </div>
          <p className="text-xs text-white/55 mt-1">
            {activeCategoryInfo.name} • {activeCategoryInfo.genre} • 100% verified stream rankings
          </p>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => scroll('left')}
            className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white/80 hover:text-white"
            title="Scroll Left"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => scroll('right')}
            className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white/80 hover:text-white"
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
          className="flex items-center flex-wrap gap-2 py-2 px-1 mb-4 relative z-10"
        >
          {SPOTIFY_TRENDING_CATEGORIES.map((cat) => {
            const isSelected = cat.key === activeCategory;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => onSelectCategory(cat.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer flex-shrink-0 ${
                  isSelected
                    ? 'bg-[#1ed760] text-black font-bold shadow-md'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Track Cards Horizontal Scroll */}
      <div
        ref={scrollRef}
        className="flex gap-5 overflow-x-auto no-scrollbar pt-2 pb-6 px-1"
      >
        {isLoading
          ? Array(8)
              .fill(0)
              .map((_, i) => (
                <div key={i} className="min-w-[170px] max-w-[170px] flex-shrink-0">
                  <Skeleton className="w-[170px] h-[170px] rounded-2xl mb-3" />
                  <Skeleton className="w-3/4 h-4 mb-2 rounded" />
                  <Skeleton className="w-1/2 h-3 rounded" />
                </div>
              ))
          : tracks.map((track, i) => {
              const isActive = currentTrack?.id === track.id || currentTrack?.title === track.title;
              return (
                <div
                  key={`${track.id}-${i}`}
                  className="min-w-[170px] max-w-[170px] flex-shrink-0 group cursor-pointer relative"
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
                    isActive ? 'ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-black' : ''
                  }`}>
                    <img
                      src={track.thumbnail || track.thumbnailUrl || DEFAULT_THUMBNAIL}
                      alt={track.title}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                      }}
                      className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-500 ease-out"
                    />
                    <div
                      className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity duration-300 ${
                        isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <div
                        className={`w-11 h-11 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-all duration-300 ${
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

                  <h3 className={`font-bold text-sm truncate transition-colors duration-200 ${
                    isActive ? 'text-[var(--color-accent)]' : 'text-white group-hover:text-[var(--color-accent)]'
                  }`}>
                    {track.title}
                  </h3>
                  <p className="text-xs text-white/50 truncate mt-0.5">{track.artist}</p>
                </div>
              );
            })}
      </div>
    </section>
  );
}
