import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { getTrending, getCachedTrending, searchTracks } from '../../services/youtube';
import { getNewReleases, getCachedNewReleases, getAlbumTracks, FALLBACK_NEW_RELEASES } from '../../services/itunes';
import GlassCard from '../ui/GlassCard';
import Skeleton from '../ui/Skeleton';
import GenreBrowser from '../search/GenreBrowser';
import TrendingSection from './TrendingSection';
import { MOOD_PLAYLISTS, DEFAULT_THUMBNAIL, FEATURED_ARTISTS, FALLBACK_TRENDING_TRACKS } from '../../utils/constants';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import type { Track, AlbumResult } from '../../types';

import { useDevicePreset } from '../../hooks/useDevicePreset';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

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
  const { isPhone } = useDevicePreset();

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
    <section className="mb-8 sm:mb-12">
      <div className="flex items-center justify-between mb-2 px-1">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-white/50 mt-0.5">{subtitle}</p>}
        </div>
        {!isPhone && (
          <div className="flex gap-2">
            <button
              onClick={() => scroll('left')}
              className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white/80 hover:text-white cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => scroll('right')}
              className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white/80 hover:text-white cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>
      <div
        ref={scrollRef}
        className="flex gap-3.5 sm:gap-5 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory pt-2 pb-5 px-1"
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
  const likedSongs = useLibraryStore((state) => state.likedSongs);

  const [activeFilter, setActiveFilter] = useState<'all' | 'music' | 'albums' | 'moods'>('all');
  const [trendingTracks, setTrendingTracks] = useState<Track[]>(() => {
    const cached = getCachedTrending();
    return cached && cached.length > 0 ? cached : FALLBACK_TRENDING_TRACKS;
  });
  const [newReleases, setNewReleases] = useState<AlbumResult[]>(() => {
    const cached = getCachedNewReleases();
    return cached && cached.length > 0 ? cached : FALLBACK_NEW_RELEASES;
  });
  const [isTrendingLoading, setIsTrendingLoading] = useState<boolean>(() => !getCachedTrending());
  const [isReleasesLoading, setIsReleasesLoading] = useState<boolean>(() => !getCachedNewReleases());
  const [activeTrendingCategory, setActiveTrendingCategory] = useState<string>('global');
  const [isCategoryTrendingLoading, setIsCategoryTrendingLoading] = useState<boolean>(false);
  const [loadingMoodId, setLoadingMoodId] = useState<string | null>(null);
  const [playingAlbumId, setPlayingAlbumId] = useState<string | null>(null);

  // Spotify-style top 6 quick-access mix tracks
  const quickMixTracks = React.useMemo<Track[]>(() => {
    const list: Track[] = [];
    for (const h of recentlyPlayed) {
      if (h.track && !list.some((t) => t.id === h.track.id)) {
        list.push(h.track);
      }
      if (list.length >= 6) break;
    }
    if (list.length < 6) {
      for (const t of likedSongs) {
        if (!list.some((x) => x.id === t.id)) {
          list.push(t);
        }
        if (list.length >= 6) break;
      }
    }
    if (list.length < 6) {
      for (const t of trendingTracks) {
        if (!list.some((x) => x.id === t.id)) {
          list.push(t);
        }
        if (list.length >= 6) break;
      }
    }
    return list.slice(0, 6);
  }, [recentlyPlayed, likedSongs, trendingTracks]);

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
          } else {
            setTrendingTracks((prev) => (prev.length > 0 ? prev : FALLBACK_TRENDING_TRACKS));
          }
          setIsTrendingLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Trending fetch error:', err);
        if (isMounted) {
          setTrendingTracks((prev) => (prev.length > 0 ? prev : FALLBACK_TRENDING_TRACKS));
          setIsTrendingLoading(false);
        }
      });

    if (!getCachedNewReleases()) {
      setIsReleasesLoading(true);
    }

    getNewReleases()
      .then((releases) => {
        if (isMounted) {
          if (releases && releases.length > 0) {
            setNewReleases(releases);
          } else {
            setNewReleases((prev) => (prev.length > 0 ? prev : FALLBACK_NEW_RELEASES));
          }
          setIsReleasesLoading(false);
        }
      })
      .catch((err) => {
        console.warn('New releases fetch error:', err);
        if (isMounted) {
          setNewReleases((prev) => (prev.length > 0 ? prev : FALLBACK_NEW_RELEASES));
          setIsReleasesLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 5) return 'Late Night Vibes';
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const handlePlayMood = async (moodId: string, moodQuery: string) => {
    triggerAndroidHaptic('light');
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
    triggerAndroidHaptic('light');
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
    triggerAndroidHaptic('light');
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
      {/* Welcome Header & Android Filter Chips */}
      <div className="mb-6 px-1 pt-1">
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
          {getGreeting()}
        </h1>
        <p className="text-xs sm:text-sm text-white/50 mt-0.5 mb-3">
          Jump into your music
        </p>

        {/* Android Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {([
            { id: 'all', label: 'All' },
            { id: 'music', label: 'Music' },
            { id: 'albums', label: 'Albums' },
            { id: 'moods', label: 'Moods & Mixes' }
          ] as const).map((chip) => {
            const isSelected = activeFilter === chip.id;
            return (
              <button
                key={chip.id}
                onClick={() => {
                  triggerAndroidHaptic('light');
                  setActiveFilter(chip.id);
                }}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'glass-button-primary text-white shadow-md'
                    : 'glass-button text-white/70 hover:text-white'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Top 6 Quick-Access 2-Column Grid (Spotify Android signature) */}
      {(activeFilter === 'all' || activeFilter === 'music') && quickMixTracks.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 mb-7 px-1">
          {quickMixTracks.map((track, i) => (
            <div
              key={`quick-${track.id}-${i}`}
              onClick={() => {
                triggerAndroidHaptic('light');
                playTrack(track, quickMixTracks, i);
              }}
              onContextMenu={(e) => {
                if (e.shiftKey) return;
                e.preventDefault();
                e.stopPropagation();
                triggerAndroidHaptic('medium');
                useContextMenuStore.getState().openTrackMenu(
                  { clientX: e.clientX, clientY: e.clientY },
                  track,
                  quickMixTracks
                );
              }}
              className="flex items-center gap-2.5 p-1 rounded-xl liquid-glass hover:bg-white/[0.12] active:scale-[0.98] border border-white/12 transition-all cursor-pointer shadow-sm overflow-hidden group"
            >
              <img
                src={track.thumbnail || DEFAULT_THUMBNAIL}
                alt={track.title}
                loading="lazy"
                decoding="async"
                onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
                className="w-12 h-12 rounded-lg object-cover flex-shrink-0 shadow-sm"
              />
              <div className="min-w-0 flex-1 pr-1.5">
                <h4 className="text-xs font-bold text-white truncate leading-tight group-hover:text-[var(--color-accent)] transition-colors">
                  {track.title}
                </h4>
                <p className="text-[10px] text-white/50 truncate leading-tight mt-0.5">
                  {track.artist}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recently Played */}
      {(activeFilter === 'all' || activeFilter === 'music') && recentlyPlayed.length > 0 && (
        <HorizontalScroll title="Recently Played" subtitle="Jump back into your recent sessions">
          {recentlyPlayed.slice(0, 12).map((historyItem, i) => {
            const track = historyItem.track;
            if (!track) return null;
            return (
              <div
                key={`${track.id}-${i}`}
                className="min-w-[145px] max-w-[145px] sm:min-w-[170px] sm:max-w-[170px] flex-shrink-0 snap-start group cursor-pointer relative"
                onClick={() => {
                  triggerAndroidHaptic('light');
                  playTrack(
                    track,
                    recentlyPlayed.map((r) => r.track).filter(Boolean) as Track[],
                    i
                  );
                }}
                onContextMenu={(e) => {
                  if (e.shiftKey) return;
                  e.preventDefault();
                  e.stopPropagation();
                  triggerAndroidHaptic('medium');
                  const recentTracks = recentlyPlayed.map((r) => r.track).filter(Boolean) as Track[];
                  useContextMenuStore.getState().openTrackMenu(
                    { clientX: e.clientX, clientY: e.clientY },
                    track,
                    recentTracks
                  );
                }}
              >
                <div className="aspect-square rounded-2xl overflow-hidden mb-2.5 relative bg-white/5 shadow-md group-hover:shadow-2xl transition-all duration-300">
                  <img
                    src={track.thumbnail || track.thumbnailUrl || DEFAULT_THUMBNAIL}
                    alt={track.title}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
                    className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-500 ease-out"
                  />
                  {/* Dedicated 3-Dots Button for Mobile */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerAndroidHaptic('light');
                      const recentTracks = recentlyPlayed.map((r) => r.track).filter(Boolean) as Track[];
                      useContextMenuStore.getState().openTrackMenu(
                        { clientX: e.clientX, clientY: e.clientY },
                        track,
                        recentTracks
                      );
                    }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white/80 active:scale-90"
                    title="Track actions"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                    </svg>
                  </button>
                  {/* Desktop Hover Play Button */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 hidden sm:flex items-center justify-center pointer-events-none">
                    <div className="w-11 h-11 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.5)] scale-90 translate-y-2 group-hover:scale-100 group-hover:translate-y-0 transition-all duration-300">
                      <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
                <h3 className="font-bold text-xs sm:text-sm truncate text-white group-hover:text-[var(--color-accent)] transition-colors duration-200">{track.title}</h3>
                <p className="text-[11px] text-white/50 truncate mt-0.5">{track.artist}</p>
              </div>
            );
          })}
        </HorizontalScroll>
      )}

      {/* Trending Section */}
      {(activeFilter === 'all' || activeFilter === 'music') && (
        <TrendingSection
          tracks={trendingTracks}
          isLoading={isTrendingLoading || isCategoryTrendingLoading}
          activeCategory={activeTrendingCategory}
          onSelectCategory={handleSelectTrendingCategory}
          onPlayTrack={(track, allTracks, idx) => {
            triggerAndroidHaptic('light');
            playTrack(track, allTracks, idx);
          }}
        />
      )}

      {/* Featured Artists Row */}
      {(activeFilter === 'all' || activeFilter === 'music') && (
        <HorizontalScroll title="Featured Artists" subtitle="Top icons and creators defining music today">
          {FEATURED_ARTISTS.map((artist) => (
            <div
              key={artist.id}
              onClick={() => {
                triggerAndroidHaptic('light');
                navigate(`/search?q=${encodeURIComponent(artist.name)}`);
              }}
              className="min-w-[130px] max-w-[130px] sm:min-w-[155px] sm:max-w-[155px] flex-shrink-0 snap-start flex flex-col items-center text-center group cursor-pointer"
            >
              <div className="w-28 h-28 sm:w-34 sm:h-34 rounded-full overflow-hidden mb-2.5 relative bg-white/10 shadow-lg border border-white/15 group-hover:border-[var(--color-accent)] transition-all duration-300">
                <img
                  src={artist.avatar}
                  alt={artist.name}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                  }}
                  className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-500 ease-out"
                />
                <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center shadow-lg scale-90 group-hover:scale-100 transition-transform">
                    <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              </div>
              <h4 className="font-bold text-xs sm:text-sm text-white truncate w-full group-hover:text-[var(--color-accent)] transition-colors">
                {artist.name}
              </h4>
              <p className="text-[11px] text-white/50 truncate w-full mt-0.5">
                {artist.genre || 'Artist'}
              </p>
            </div>
          ))}
        </HorizontalScroll>
      )}

      {/* Mood Playlists (Carousel on 'all', or Immersive 2-column Grid on 'moods') */}
      {(activeFilter === 'all' || activeFilter === 'moods') && (
        activeFilter === 'moods' ? (
          <section className="mb-10 px-1">
            <h2 className="text-xl sm:text-2xl font-extrabold text-white mb-1">All Moods & Activities</h2>
            <p className="text-xs text-white/50 mb-4">Tap any vibe to launch an instant endless curated mix</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {MOOD_PLAYLISTS.map((mood) => {
                const isMoodLoading = loadingMoodId === mood.id;
                return (
                  <GlassCard
                    key={mood.id}
                    padding="md"
                    hover
                    className={`cursor-pointer relative overflow-hidden active:scale-[0.98] transition-transform ${mood.colorClass}`}
                    onClick={() => handlePlayMood(mood.id, mood.query || mood.searchQuery)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-3xl drop-shadow">{mood.emoji}</span>
                      <div className="w-8 h-8 rounded-full glass-button-primary text-white flex items-center justify-center">
                        {isMoodLoading ? (
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <h3 className="font-extrabold text-sm sm:text-base text-white">{mood.name}</h3>
                    <p className="text-[11px] text-white/70 mt-0.5">{mood.sub || 'Play instant mix'}</p>
                  </GlassCard>
                );
              })}
            </div>
          </section>
        ) : (
          <HorizontalScroll title="Moods & Activities" subtitle="Instant curated mixes tailored to your vibe">
            {MOOD_PLAYLISTS.map((mood) => {
              const isMoodLoading = loadingMoodId === mood.id;
              return (
                <GlassCard
                  key={mood.id}
                  padding="md"
                  hover
                  className={`min-w-[190px] max-w-[190px] sm:min-w-[215px] sm:max-w-[215px] flex-shrink-0 snap-start cursor-pointer relative overflow-hidden group ${mood.colorClass}`}
                  onClick={() => handlePlayMood(mood.id, mood.query || mood.searchQuery)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-3xl drop-shadow group-hover:scale-110 transition-transform">{mood.emoji}</span>
                    <div className="w-8 h-8 rounded-full glass-button-primary text-white flex items-center justify-center group-hover:scale-110 transition-all">
                      {isMoodLoading ? (
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <h3 className="font-extrabold text-base text-white">{mood.name}</h3>
                  <p className="text-[11px] text-white/70 mt-0.5">{mood.sub || 'Play instant mix'}</p>
                </GlassCard>
              );
            })}
          </HorizontalScroll>
        )
      )}

      {/* New Releases (Carousel on 'all', or 2-column Grid on 'albums') */}
      {(activeFilter === 'all' || activeFilter === 'albums') && (
        activeFilter === 'albums' ? (
          <section className="mb-10 px-1">
            <h2 className="text-xl sm:text-2xl font-extrabold text-white mb-1">Top Albums & Releases</h2>
            <p className="text-xs text-white/50 mb-4">Latest studio releases and chart toppers</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {newReleases.map((album) => (
                <div
                  key={album.id}
                  className="flex flex-col group cursor-pointer"
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    navigate(`/search?q=${encodeURIComponent(`${album.title || album.name} ${album.artist}`)}`);
                  }}
                >
                  <div className="aspect-square rounded-2xl overflow-hidden mb-2 relative bg-white/5 shadow-md">
                    <img
                      src={album.coverUrl || album.thumbnail || DEFAULT_THUMBNAIL}
                      alt={album.title || album.name}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={(e) => handlePlayAlbum(album, e)}
                      className="absolute bottom-2 right-2 w-10 h-10 rounded-full glass-button-primary text-white flex items-center justify-center shadow-lg active:scale-90 transition-transform cursor-pointer"
                      title={`Play ${album.title || album.name}`}
                    >
                      {playingAlbumId === album.id ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <h3 className="font-bold text-xs truncate text-white">{album.title || album.name}</h3>
                  <p className="text-[11px] text-white/50 truncate mt-0.5">{album.artist}</p>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <HorizontalScroll title="New Releases" subtitle="Top albums making waves worldwide">
            {isReleasesLoading && newReleases.length === 0
              ? Array(6)
                  .fill(0)
                  .map((_, i) => (
                    <div key={i} className="min-w-[155px] sm:min-w-[180px] flex-shrink-0">
                      <Skeleton className="w-[155px] sm:w-[180px] h-[155px] sm:h-[180px] rounded-2xl mb-3" />
                      <Skeleton className="w-3/4 h-4 mb-2 rounded" />
                      <Skeleton className="w-1/2 h-3 rounded" />
                    </div>
                  ))
              : newReleases.map((album) => (
                  <div
                    key={album.id}
                    className="min-w-[150px] max-w-[150px] sm:min-w-[180px] sm:max-w-[180px] flex-shrink-0 snap-start group cursor-pointer"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      navigate(`/search?q=${encodeURIComponent(`${album.title || album.name} ${album.artist}`)}`);
                    }}
                  >
                    <div className="aspect-square rounded-2xl overflow-hidden mb-2.5 relative bg-white/5 shadow-md group-hover:shadow-2xl transition-all duration-300">
                      <img
                        src={album.coverUrl || album.thumbnail || DEFAULT_THUMBNAIL}
                        alt={album.title || album.name}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
                        className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-500 ease-out"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <button
                          onClick={(e) => handlePlayAlbum(album, e)}
                          className="w-11 h-11 rounded-full glass-button-primary text-white flex items-center justify-center shadow-lg scale-90 translate-y-2 group-hover:scale-100 group-hover:translate-y-0 transition-all duration-300 cursor-pointer hover:brightness-110 active:scale-95"
                          title={`Play ${album.title || album.name}`}
                        >
                          {playingAlbumId === album.id ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                    <h3 className="font-bold text-xs sm:text-sm truncate text-white group-hover:text-[var(--color-accent)] transition-colors duration-200">{album.title || album.name}</h3>
                    <p className="text-[11px] text-white/50 truncate mt-0.5">{album.artist}</p>
                  </div>
                ))}
          </HorizontalScroll>
        )
      )}

      {/* Genres */}
      {(activeFilter === 'all' || activeFilter === 'music') && (
        <div className="mt-8 px-1">
          <GenreBrowser />
        </div>
      )}
    </div>
  );
}
