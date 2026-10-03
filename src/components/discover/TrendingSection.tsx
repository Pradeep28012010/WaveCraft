import { useRef } from 'react';
import type { Track } from '../../types';
import GlassCard from '../ui/GlassCard';
import Skeleton from '../ui/Skeleton';
import { usePlayerStore } from '../../stores/playerStore';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';

interface TrendingSectionProps {
  tracks: Track[];
  isLoading: boolean;
  onPlayTrack: (track: Track, allTracks: Track[]) => void;
}

export default function TrendingSection({ tracks, isLoading, onPlayTrack }: TrendingSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
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

  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Trending Now</h2>
          <p className="text-xs text-white/50 mt-0.5">Top global and regional charts</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => scroll('left')}
            className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white/80 hover:text-white"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => scroll('right')}
            className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white/80 hover:text-white"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-5 overflow-x-auto no-scrollbar pt-4 pb-6 px-5 -mx-5 -mt-2"
      >
        {isLoading
          ? Array(6)
              .fill(0)
              .map((_, i) => (
                <div key={i} className="min-w-[190px] flex-shrink-0">
                  <Skeleton className="w-[190px] h-[190px] rounded-2xl mb-3" />
                  <Skeleton className="w-3/4 h-4 mb-2 rounded" />
                  <Skeleton className="w-1/2 h-3 rounded" />
                </div>
              ))
          : tracks.map((track, i) => {
              const isActive = currentTrack?.id === track.id;
              return (
                <GlassCard
                  key={track.id}
                  padding="sm"
                  hover
                  className={`min-w-[190px] max-w-[190px] flex-shrink-0 group cursor-pointer relative transition-colors duration-300 ${
                    isActive
                      ? '!border-2 !border-[var(--color-accent)] ring-1 ring-inset ring-[var(--color-accent)]/60 bg-white/15 shadow-[0_14px_34px_rgba(0,0,0,0.5)]'
                      : 'hover:bg-white/[0.11] hover:border-white/25'
                  }`}
                  onClick={() => onPlayTrack(track, tracks)}
                >
                  {/* Rank Badge */}
                  <div className="absolute top-5 left-5 px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-md border border-white/20 text-white text-xs font-extrabold z-10 shadow-lg">
                    #{i + 1}
                  </div>

                  <div className="aspect-square rounded-xl overflow-hidden mb-3.5 relative bg-white/5 shadow-lg">
                    <img
                      src={track.thumbnail || track.thumbnailUrl || DEFAULT_THUMBNAIL}
                      alt={track.title}
                      onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
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

                  <h3 className="font-bold text-sm truncate text-white group-hover:text-[var(--color-accent)] transition-colors duration-200">{track.title}</h3>
                  <p className="text-xs text-white/60 truncate mt-1">{track.artist}</p>
                </GlassCard>
              );
            })}
      </div>
    </section>
  );
}
