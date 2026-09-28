import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { getTrending, getCachedTrending, searchTracks } from '../../services/youtube';
import { getNewReleases, getCachedNewReleases } from '../../services/itunes';
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
      <div className="flex items-center justify-between mb-5">
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
        className="flex gap-5 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-4 pt-1 px-1"
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
  const [isLoading, setIsLoading] = useState<boolean>(() => !getCachedTrending());
  const [loadingMoodId, setLoadingMoodId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!getCachedTrending()) {
      setIsLoading(true);
    }

    getTrending()
      .then((trending) => {
        if (isMounted) {
          setTrendingTracks(trending);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setIsLoading(false);
      });

    getNewReleases()
      .then((releases) => {
        if (isMounted) setNewReleases(releases);
      })
      .catch(() => {});

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
            <div className="flex flex-wrap items-center gap-3.5 mt-6">
              <button
                onClick={() => {
                  if (trendingTracks.length > 0) {
                    playTrack(trendingTracks[0], trendingTracks, 0);
                  } else {
                    handlePlayMood('hero', 'top global hits');
                  }
                }}
                className="px-6 py-3 rounded-full bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white font-bold text-sm flex items-center gap-2.5 shadow-xl shadow-[var(--color-accent)]/30 hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>Play Top Hits Now</span>
              </button>

              <button
                onClick={() => navigate('/vibe')}
                className="px-5 py-3 rounded-full liquid-glass border border-white/20 text-sm font-bold text-white hover:bg-white/15 transition-all cursor-pointer flex items-center gap-2"
              >
                <span>✨ AI Vibe DJ</span>
              </button>

              <button
                onClick={() => navigate('/jam')}
                className="px-5 py-3 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/30 text-sm font-bold text-emerald-300 transition-all cursor-pointer flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Live Jam Room</span>
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
                className="min-w-[175px] max-w-[175px] flex-shrink-0 snap-start group cursor-pointer"
                onClick={() =>
                  playTrack(
                    track,
                    recentlyPlayed.map((r) => r.track).filter(Boolean),
                    i
                  )
                }
              >
                <div className="aspect-square rounded-xl overflow-hidden mb-3 relative bg-white/5">
                  <img
                    src={track.thumbnail || track.thumbnailUrl || DEFAULT_THUMBNAIL}
                    alt={track.title}
                    onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-11 h-11 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center shadow-lg">
                      <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
                <h3 className="font-bold text-sm truncate text-white">{track.title}</h3>
                <p className="text-xs text-white/55 truncate mt-0.5">{track.artist}</p>
              </GlassCard>
            );
          })}
        </HorizontalScroll>
      )}

      {/* Trending Section */}
      <TrendingSection
        tracks={trendingTracks}
        isLoading={isLoading}
        onPlayTrack={(track, allTracks) => playTrack(track, allTracks)}
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
              className={`min-w-[215px] max-w-[215px] flex-shrink-0 snap-start cursor-pointer relative overflow-hidden ${mood.colorClass}`}
              onClick={() => handlePlayMood(mood.id, mood.query || mood.searchQuery)}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-4xl drop-shadow">{mood.emoji}</span>
                <div className="w-9 h-9 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center text-white">
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
        {isLoading
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
                className="min-w-[180px] max-w-[180px] flex-shrink-0 snap-start group cursor-pointer"
                onClick={() =>
                  navigate(`/search?q=${encodeURIComponent(`${album.title || album.name} ${album.artist}`)}`)
                }
              >
                <div className="aspect-square rounded-xl overflow-hidden mb-3 relative bg-white/5">
                  <img
                    src={album.coverUrl || album.thumbnail || DEFAULT_THUMBNAIL}
                    alt={album.title || album.name}
                    onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-11 h-11 rounded-full bg-white/25 backdrop-blur-md text-white flex items-center justify-center">
                      <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
                <h3 className="font-bold text-sm truncate text-white">{album.title || album.name}</h3>
                <p className="text-xs text-white/55 truncate mt-0.5">{album.artist}</p>
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
