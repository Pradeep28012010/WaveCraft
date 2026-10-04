import { useRef } from 'react';
import type { Track } from '../../types';
import GlassCard from '../ui/GlassCard';
import Skeleton from '../ui/Skeleton';
import { usePlayerStore } from '../../stores/playerStore';
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
          className="flex items-center gap-2.5 overflow-x-auto sm:flex-wrap sm:overflow-visible py-4 px-3 mb-3 no-scrollbar relative z-10"
          style={{ background: 'transparent' }}
        >
          {SPOTIFY_TRENDING_CATEGORIES.map((cat) => {
            const isSelected = cat.key === activeCategory;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => onSelectCategory(cat.key)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer flex-shrink-0 ${
                  isSelected
                    ? 'relative z-20 bg-[#1ed760] text-black font-extrabold border border-[#1ed760]'
                    : 'relative z-10 bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-white/75 hover:text-white'
                }`}
                style={
                  isSelected
                    ? {
                        boxShadow:
                          '0 0 12px rgba(30, 215, 96, 0.8), 0 0 25px rgba(30, 215, 96, 0.5), 0 0 45px rgba(30, 215, 96, 0.25)'
                      }
                    : undefined
                }
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
        className="flex gap-5 overflow-x-auto no-scrollbar pt-5 pb-8 px-2"
      >
        {isLoading
          ? Array(8)
              .fill(0)
              .map((_, i) => (
                <div key={i} className="min-w-[190px] flex-shrink-0">
                  <Skeleton className="w-[190px] h-[190px] rounded-2xl mb-3" />
                  <Skeleton className="w-3/4 h-4 mb-2 rounded" />
                  <Skeleton className="w-1/2 h-3 rounded" />
                </div>
              ))
          : tracks.map((track, i) => {
              const isActive = currentTrack?.id === track.id || currentTrack?.title === track.title;
              return (
                <GlassCard
                  key={`${track.id}-${i}`}
                  padding="sm"
                  hover
                  className={`min-w-[190px] max-w-[190px] flex-shrink-0 group cursor-pointer relative transition-all duration-300 ${
                    isActive
                      ? '!border-2 !border-[var(--color-accent)] ring-1 ring-inset ring-[var(--color-accent)]/60 bg-white/15 shadow-[0_14px_34px_rgba(0,0,0,0.5)]'
                      : 'hover:bg-white/[0.11] hover:border-white/25'
                  }`}
                  onClick={() => {
                    if (isActive) {
                      usePlayerStore.getState().togglePlay();
                    } else {
                      onPlayTrack(track, tracks, i);
                    }
                  }}
                >
                  {/* Rank Badge */}
                  <div className="absolute top-4 left-4 px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-white/20 text-white text-xs font-black z-10 shadow-lg">
                    #{i + 1}
                  </div>

                  <div className="aspect-square rounded-xl overflow-hidden mb-3.5 relative bg-white/5 shadow-lg">
                    <img
                      src={track.thumbnail || track.thumbnailUrl || DEFAULT_THUMBNAIL}
                      alt={track.title}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                      }}
                      className="w-full h-full object-cover group-hover:scale-[1.07] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                    />
                    <div
                      className={`absolute inset-0 bg-gradient-to-t from-black/65 via-black/25 to-transparent flex items-center justify-center transition-opacity duration-300 ${
                        isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <div
                        className={`w-12 h-12 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center shadow-[0_8px_24px_rgba(250,45,72,0.55)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                          isActive
                            ? 'scale-100 translate-y-0'
                            : 'scale-90 translate-y-2.5 group-hover:scale-105 group-hover:translate-y-0'
                        }`}
                      >
                        {isActive && isPlaying ? (
                          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                          </svg>
                        ) : (
                          <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>

                  <h3 className="font-bold text-sm truncate text-white group-hover:text-[var(--color-accent)] transition-colors duration-200">
                    {track.title}
                  </h3>
                  <p className="text-xs text-white/60 truncate mt-1">{track.artist}</p>
                </GlassCard>
              );
            })}
      </div>
    </section>
  );
}
