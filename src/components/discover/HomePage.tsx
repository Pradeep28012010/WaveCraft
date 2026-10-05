import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { getTrending, getCachedTrending, searchTracks } from '../../services/youtube';
import { getNewReleases, getCachedNewReleases, getAlbumTracks } from '../../services/itunes';
import GlassCard from '../ui/GlassCard';
import Skeleton from '../ui/Skeleton';
import GenreBrowser from '../search/GenreBrowser';
import TrendingSection from './TrendingSection';
import { MOOD_PLAYLISTS, DEFAULT_THUMBNAIL } from '../../utils/constants';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import type { Track, AlbumResult } from '../../types';

const HorizontalScroll = ({
  children,
  title,
  subtitle
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

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
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-white/50 mt-0.5">{subtitle}</p>}
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
        className="flex gap-5 overflow-x-auto no-scrollbar pt-6 pb-8 px-4"
      >
        {children}
      </div>
    </section>
  );
};

export default function HomePage() {
  const navigate = useNavigate();
  const playTrack = usePlayerStore((state) => state.playTrack);
  const recentlyPlayed = useLibraryStore((state) => state.recentlyPlayed);

  const [trendingTracks, setTrendingTracks] = useState<Track[]>(() => getCachedTrending() || []);
  const [newReleases, setNewReleases] = useState<AlbumResult[]>(() => getCachedNewReleases() || []);
  const [isTrendingLoading, setIsTrendingLoading] = useState<boolean>(() => !getCachedTrending());
  const [isReleasesLoading, setIsReleasesLoading] = useState<boolean>(() => !getCachedNewReleases());
  const [activeTrendingCategory, setActiveTrendingCategory] = useState<string>('global');
  const [isCategoryTrendingLoading, setIsCategoryTrendingLoading] = useState<boolean>(false);
  const [loadingMoodId, setLoadingMoodId] = useState<string | null>(null);
  const [playingAlbumId, setPlayingAlbumId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!getCachedTrending()) {
      setIsTrendingLoading(true);
    }

    getTrending('global')
      .then((trending) => {
        if (isMounted) {
          if (trending && trending.length > 0) {
            setTrendingTracks(trending);
          }
          setIsTrendingLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Trending fetch error:', err);
        if (isMounted) setIsTrendingLoading(false);
      });

    if (!getCachedNewReleases()) {
      setIsReleasesLoading(true);
    }

    getNewReleases()
      .then((releases) => {
        if (isMounted) {
          if (releases && releases.length > 0) {
            setNewReleases(releases);
          }
          setIsReleasesLoading(false);
        }
      })
      .catch((err) => {
        console.warn('New releases fetch error:', err);
        if (isMounted) setIsReleasesLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const handlePlayMood = async (moodId: string, moodQuery: string) => {
    setLoadingMoodId(moodId);
    try {
      const tracks = await searchTracks(moodQuery);
      if (tracks.length > 0) {
        playTrack(tracks[0], tracks, 0);
      }
    } catch (err) {
      console.error('Failed to play mood:', err);
    } finally {
      setLoadingMoodId(null);
    }
  };

  const handlePlayAlbum = async (album: AlbumResult, e: React.MouseEvent) => {
    e.stopPropagation();
    setPlayingAlbumId(album.id);
    try {
      const tracks = await getAlbumTracks(album);
      if (tracks.length > 0) {
        playTrack(tracks[0], tracks, 0);
      } else {
        navigate(`/search?q=${encodeURIComponent(`${album.title || album.name} ${album.artist}`)}`);
      }
    } catch {
      navigate(`/search?q=${encodeURIComponent(`${album.title || album.name} ${album.artist}`)}`);
    } finally {
      setPlayingAlbumId(null);
    }
  };

  const handleSelectTrendingCategory = async (categoryKey: string) => {
    if (categoryKey === activeTrendingCategory && trendingTracks.length > 0) return;
    setActiveTrendingCategory(categoryKey);
    setIsCategoryTrendingLoading(true);
    try {
      const tracks = await getTrending(categoryKey);
      if (tracks && tracks.length > 0) {
        setTrendingTracks(tracks);
      }
    } catch (err) {
      console.error('Failed to change trending category:', err);
    } finally {
      setIsCategoryTrendingLoading(false);
    }
  };

  return (
    <div className="pb-24 pt-2 text-white min-h-screen">
      {/* Clean Welcome Header */}
      <div className="flex items-center justify-between mb-8 px-1 pt-2">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            {getGreeting()}
          </h1>
          <p className="text-xs sm:text-sm text-white/50 mt-1">
            Jump into your music
          </p>
        </div>
      </div>

      {/* Recently Played */}
      {recentlyPlayed.length > 0 && (
        <HorizontalScroll title="Recently Played" subtitle="Jump back into your recent sessions">
          {recentlyPlayed.slice(0, 12).map((historyItem, i) => {
            const track = historyItem.track;
            if (!track) return null;
            return (
              <div
                key={`${track.id}-${i}`}
                className="min-w-[155px] max-w-[155px] sm:min-w-[170px] sm:max-w-[170px] flex-shrink-0 snap-start group cursor-pointer"
                onContextMenu={(e) => {
                  if (e.shiftKey) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const recentTracks = recentlyPlayed.map((r) => r.track).filter(Boolean) as Track[];
                  useContextMenuStore.getState().openTrackMenu(
                    { clientX: e.clientX, clientY: e.clientY },
                    track,
                    recentTracks
                  );
                }}
                onClick={() =>
                  playTrack(
                    track,
                    recentlyPlayed.map((r) => r.track).filter(Boolean) as Track[],
                    i
                  )
                }
              >
                <div className="aspect-square rounded-2xl overflow-hidden mb-2.5 relative bg-white/5 shadow-md group-hover:shadow-2xl transition-all duration-300">
                  <img
                    src={track.thumbnail || track.thumbnailUrl || DEFAULT_THUMBNAIL}
                    alt={track.title}
                    onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
                    className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-500 ease-out will-change-transform"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <div className="w-11 h-11 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.5)] scale-90 translate-y-2 group-hover:scale-100 group-hover:translate-y-0 transition-all duration-300">
                      <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
                <h3 className="font-bold text-sm truncate text-white group-hover:text-[var(--color-accent)] transition-colors duration-200">{track.title}</h3>
                <p className="text-xs text-white/50 truncate mt-0.5">{track.artist}</p>
              </div>
            );
          })}
        </HorizontalScroll>
      )}

      {/* Trending Section */}
      <TrendingSection
        tracks={trendingTracks}
        isLoading={isTrendingLoading || isCategoryTrendingLoading}
        activeCategory={activeTrendingCategory}
        onSelectCategory={handleSelectTrendingCategory}
        onPlayTrack={(track, allTracks, idx) => playTrack(track, allTracks, idx)}
      />

      {/* Mood Playlists */}
      <HorizontalScroll title="Moods & Activities" subtitle="Instant curated mixes tailored to your vibe">
        {MOOD_PLAYLISTS.map((mood) => {
          const isMoodLoading = loadingMoodId === mood.id;
          return (
            <GlassCard
              key={mood.id}
              padding="md"
              hover
              className={`min-w-[215px] max-w-[215px] flex-shrink-0 snap-start cursor-pointer relative overflow-hidden group ${mood.colorClass}`}
              onClick={() => handlePlayMood(mood.id, mood.query || mood.searchQuery)}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-4xl drop-shadow group-hover:scale-110 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">{mood.emoji}</span>
                <div className="w-9 h-9 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center text-white group-hover:scale-110 group-hover:bg-white/25 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
                  {isMoodLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </div>
              </div>
              <h3 className="font-extrabold text-lg text-white">{mood.name}</h3>
              <p className="text-xs text-white/70 mt-1">{mood.sub || 'Play instant mix'}</p>
            </GlassCard>
          );
        })}
      </HorizontalScroll>

      {/* New Releases */}
      <HorizontalScroll title="New Releases" subtitle="Top albums making waves worldwide">
        {isReleasesLoading
          ? Array(6)
              .fill(0)
              .map((_, i) => (
                <div key={i} className="min-w-[180px] flex-shrink-0">
                  <Skeleton className="w-[180px] h-[180px] rounded-2xl mb-3" />
                  <Skeleton className="w-3/4 h-4 mb-2 rounded" />
                  <Skeleton className="w-1/2 h-3 rounded" />
                </div>
              ))
          : newReleases.map((album) => (
              <div
                key={album.id}
                className="min-w-[165px] max-w-[165px] sm:min-w-[180px] sm:max-w-[180px] flex-shrink-0 snap-start group cursor-pointer"
                onClick={() =>
                  navigate(`/search?q=${encodeURIComponent(`${album.title || album.name} ${album.artist}`)}`)
                }
              >
                <div className="aspect-square rounded-2xl overflow-hidden mb-2.5 relative bg-white/5 shadow-md group-hover:shadow-2xl transition-all duration-300">
                  <img
                    src={album.coverUrl || album.thumbnail || DEFAULT_THUMBNAIL}
                    alt={album.title || album.name}
                    onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
                    className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-500 ease-out will-change-transform"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <button
                      onClick={(e) => handlePlayAlbum(album, e)}
                      className="w-12 h-12 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center shadow-lg scale-90 translate-y-2 group-hover:scale-100 group-hover:translate-y-0 transition-all duration-300 cursor-pointer hover:brightness-110 active:scale-95"
                      title={`Play ${album.title || album.name}`}
                    >
                      {playingAlbumId === album.id ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <h3 className="font-bold text-sm truncate text-white group-hover:text-[var(--color-accent)] transition-colors duration-200">{album.title || album.name}</h3>
                <p className="text-xs text-white/50 truncate mt-0.5">{album.artist}</p>
              </div>
            ))}
      </HorizontalScroll>

      {/* Genres */}
      <div className="mt-8">
        <GenreBrowser />
      </div>
    </div>
  );
}
