import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useStudioStore } from '../../stores/studioStore';
import { getTrending, getCachedTrending, searchTracks } from '../../services/youtube';
import { getNewReleases, getCachedNewReleases, getAlbumTracks } from '../../services/itunes';
import GlassCard from '../ui/GlassCard';
import Skeleton from '../ui/Skeleton';
import GenreBrowser from '../search/GenreBrowser';
import TrendingSection from './TrendingSection';
import { MOOD_PLAYLISTS, DEFAULT_THUMBNAIL } from '../../utils/constants';
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
        className="flex gap-5 overflow-x-auto no-scrollbar pt-5 pb-8 px-2"
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

  const featuredTrack = trendingTracks[0];

  return (
    <div className="pb-24 pt-2 text-white min-h-screen">
      {/* WaveCraft Spatial Glass Hero Banner */}
      <section className="mb-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl liquid-glass p-7 sm:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-8"
        >
          <div className="absolute -right-20 -top-20 w-96 h-96 rounded-full bg-gradient-to-br from-[var(--color-accent)]/30 via-purple-600/25 to-transparent blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-white/90 mb-4">
              <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-ping" />
              <span>WAVECRAFT SPATIAL GLASS AUDIO</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
              {getGreeting()}, Welcome to WaveCraft
            </h1>
            <p className="text-white/65 text-sm sm:text-base mt-3 leading-relaxed">
              Stream full-length songs in 320kbps studio quality with spatial glass aesthetics, time-synced lyrics, real-time audio visualizers, and zero ads.
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-6">
              <button
                onClick={() => {
                  if (trendingTracks.length > 0) {
                    playTrack(trendingTracks[0], trendingTracks, 0);
                  } else {
                    handlePlayMood('hero', 'top global hits');
                  }
                }}
                className="px-6 py-3 rounded-full glass-button-primary text-white font-bold text-sm flex items-center gap-2.5 cursor-pointer"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>Play Top Hits Now</span>
              </button>

              <button
                onClick={() => navigate('/vibe')}
                className="px-5 py-3 rounded-full glass-button text-sm font-bold text-white flex items-center gap-2 cursor-pointer"
              >
                <span>✨ AI Vibe DJ</span>
              </button>

              <button
                onClick={() => navigate('/jam')}
                className="px-5 py-3 rounded-full glass-button-emerald text-sm font-bold flex items-center gap-2 cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Live Jam Room</span>
              </button>

              <button
                onClick={() => useStudioStore.getState().setStudioModalOpen(true)}
                className="px-5 py-3 rounded-full glass-button-purple text-sm font-bold flex items-center gap-2 cursor-pointer"
              >
                <span>🎛️ Studio FX & Ambient Focus</span>
              </button>
            </div>
          </div>

          {featuredTrack && (
            <div
              onClick={() => playTrack(featuredTrack, trendingTracks, 0)}
              className="relative z-10 hidden lg:flex items-center gap-4 p-4 rounded-2xl glass-heavy cursor-pointer group hover:scale-[1.02] transition-transform w-80 flex-shrink-0"
            >
              <img
                src={featuredTrack.thumbnail || DEFAULT_THUMBNAIL}
                alt={featuredTrack.title}
                className="w-20 h-20 rounded-xl object-cover shadow-lg"
              />
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-accent)]">
                  #1 Trending Track
                </span>
                <h3 className="text-base font-bold text-white truncate mt-0.5">
                  {featuredTrack.title}
                </h3>
                <p className="text-xs text-white/60 truncate mt-0.5">{featuredTrack.artist}</p>
                <span className="inline-block mt-2 text-[11px] font-semibold text-white/80 group-hover:text-white">
                  Tap to play →
                </span>
              </div>
            </div>
          )}
        </motion.div>
      </section>

      {/* Recently Played */}
      {recentlyPlayed.length > 0 && (
        <HorizontalScroll title="Recently Played" subtitle="Jump back into your recent sessions">
          {recentlyPlayed.slice(0, 12).map((historyItem, i) => {
            const track = historyItem.track;
            if (!track) return null;
            return (
              <GlassCard
                key={`${track.id}-${i}`}
                padding="sm"
                hover
                className="min-w-[175px] max-w-[175px] flex-shrink-0 snap-start group cursor-pointer hover:border-white/25 transition-colors duration-300"
                onClick={() =>
                  playTrack(
                    track,
                    recentlyPlayed.map((r) => r.track).filter(Boolean),
                    i
                  )
                }
              >
                <div className="aspect-square rounded-xl overflow-hidden mb-3 relative bg-white/5 shadow-md">
                  <img
                    src={track.thumbnail || track.thumbnailUrl || DEFAULT_THUMBNAIL}
                    alt={track.title}
                    onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
                    className="w-full h-full object-cover group-hover:scale-[1.07] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-out flex items-center justify-center">
                    <div className="w-11 h-11 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.5)] scale-90 translate-y-2.5 group-hover:scale-105 group-hover:translate-y-0 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
                      <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
                <h3 className="font-bold text-sm truncate text-white group-hover:text-[var(--color-accent)] transition-colors duration-200">{track.title}</h3>
                <p className="text-xs text-white/55 truncate mt-0.5">{track.artist}</p>
              </GlassCard>
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
              <GlassCard
                key={album.id}
                padding="sm"
                hover
                className="min-w-[190px] max-w-[190px] flex-shrink-0 snap-start group cursor-pointer hover:border-white/25 transition-all duration-300"
                onClick={() =>
                  navigate(`/search?q=${encodeURIComponent(`${album.title || album.name} ${album.artist}`)}`)
                }
              >
                <div className="aspect-square rounded-xl overflow-hidden mb-3.5 relative bg-white/5 shadow-lg">
                  <img
                    src={album.coverUrl || album.thumbnail || DEFAULT_THUMBNAIL}
                    alt={album.title || album.name}
                    onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
                    className="w-full h-full object-cover group-hover:scale-[1.07] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
                  />
                  <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white/90">
                    Album
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-out flex items-center justify-center">
                    <button
                      onClick={(e) => handlePlayAlbum(album, e)}
                      className="w-12 h-12 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center shadow-[0_8px_24px_rgba(250,45,72,0.55)] scale-90 translate-y-2.5 group-hover:scale-105 group-hover:translate-y-0 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer hover:brightness-110 active:scale-95"
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
                <p className="text-xs text-white/55 truncate mt-1">{album.artist}</p>
              </GlassCard>
            ))}
      </HorizontalScroll>

      {/* Genres */}
      <div className="mt-8">
        <GenreBrowser />
      </div>
    </div>
  );
}
