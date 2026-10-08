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

const VIBE_STUDIO_PRESETS = [
  { prompt: 'Cyberpunk Midnight Drive with heavy bass synthwave', label: '🌙 Midnight Drive', color: 'from-pink-500/20 to-purple-600/30 border-pink-400/30' },
  { prompt: 'Cozy rainy cafe lo-fi beats with soft piano', label: '☕ Rainy Cafe Lo-Fi', color: 'from-amber-500/20 to-orange-600/30 border-amber-400/30' },
  { prompt: 'High-energy workout phonk and hard bass gym motivation', label: '⚡ Gym Phonk', color: 'from-red-500/20 to-rose-600/30 border-red-400/30' },
  { prompt: 'Deep focus ambient flow state zero distraction electronics', label: '🧘 Deep Focus', color: 'from-cyan-500/20 to-blue-600/30 border-cyan-400/30' },
  { prompt: 'Golden hour sunset indie acoustic chill songs', label: '🌅 Golden Hour', color: 'from-yellow-500/20 to-amber-600/30 border-yellow-400/30' },
  { prompt: 'Bollywood trending energetic party dance tracks', label: '🔥 Desi Party Hits', color: 'from-emerald-500/20 to-teal-600/30 border-emerald-400/30' }
];

export default function HomePage() {
  const navigate = useNavigate();
  const playTrack = usePlayerStore((state) => state.playTrack);
  const recentlyPlayed = useLibraryStore((state) => state.recentlyPlayed);
  const likedSongs = useLibraryStore((state) => state.likedSongs);
  const toggleLike = useLibraryStore((state) => state.toggleLike);
  const likedIds = useLibraryStore((state) => state.likedIds);

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

  // Top 6 quick-access mix tracks
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

  // Featured Spotlight Track
  const spotlightTrack = React.useMemo<Track | null>(() => {
    return trendingTracks[0] || quickMixTracks[0] || null;
  }, [trendingTracks, quickMixTracks]);

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

  const getGreetingData = () => {
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 5) {
      return {
        greeting: 'Late Night Vibes',
        vibeBadge: '🌙 Nocturnal Session • 60–80 BPM Chill Flow',
        tagline: 'Deep ambient resonance & relaxed acoustic textures'
      };
    }
    if (hour < 12) {
      return {
        greeting: 'Good Morning',
        vibeBadge: '☀️ Morning Kickstart • 105–125 BPM Energize',
        tagline: 'Bright acoustic melodies and uplifting rhythms to fuel your day'
      };
    }
    if (hour < 18) {
      return {
        greeting: 'Good Afternoon',
        vibeBadge: '⚡ Daylight Focus • 95–115 BPM Flow State',
        tagline: 'Steady grooves, smooth momentum, and studio sound'
      };
    }
    return {
      greeting: 'Good Evening',
      vibeBadge: '🌆 Sunset Golden Hour • 80–100 BPM Warmth',
      tagline: 'Velvet acoustics and unwinding beats for your evening'
    };
  };

  const greetingInfo = getGreetingData();

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
    <div className="relative pb-24 pt-2 text-white min-h-screen">
      {/* Dynamic Ambient Aurora Background Glows (Eliminates flat muddy background) */}
      <div className="absolute top-0 right-10 w-96 h-96 rounded-full bg-[var(--color-accent)]/15 blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-40 left-0 w-80 h-80 rounded-full bg-purple-600/12 blur-[100px] pointer-events-none -z-10" />

      {/* Welcome Header & Atmosphere Indicator */}
      <div className="mb-6 px-1 pt-1 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-black tracking-wide bg-white/[0.08] border border-white/14 text-white/80 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
              {greetingInfo.vibeBadge}
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
            {greetingInfo.greeting}
          </h1>
          <p className="text-xs sm:text-sm text-white/55 mt-1 font-medium">
            {greetingInfo.tagline} • <span className="text-white/80 font-bold">320kbps Studio Audio</span>
          </p>
        </div>

        {/* Category Filter Pills */}
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

      {/* ================= HERO SPOTLIGHT BANNER ================= */}
      {(activeFilter === 'all' || activeFilter === 'music') && spotlightTrack && (
        <section className="mb-8 px-1">
          <div className="relative rounded-3xl liquid-glass border border-white/20 p-5 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.6)] overflow-hidden group">
            {/* Ambient Blurred Artwork Backdrop */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
              <img
                src={spotlightTrack.thumbnailLarge || spotlightTrack.thumbnail || DEFAULT_THUMBNAIL}
                alt=""
                className="w-full h-full object-cover blur-3xl opacity-30 scale-125 transition-transform duration-1000 group-hover:scale-135"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-transparent" />
            </div>

            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              {/* Left Column: Hero Art & Info */}
              <div className="flex items-center gap-4 sm:gap-6 min-w-0">
                <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-2xl overflow-hidden flex-shrink-0 shadow-2xl border border-white/25 group-hover:scale-105 transition-transform duration-500">
                  <img
                    src={spotlightTrack.thumbnailLarge || spotlightTrack.thumbnail || DEFAULT_THUMBNAIL}
                    alt={spotlightTrack.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
                  />
                  {/* Floating Live Equalizer Bars */}
                  <div className="absolute bottom-2 left-2 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md flex items-end gap-1 h-4">
                    <span className="w-1 bg-[var(--color-accent)] rounded-full animate-[pulse_0.8s_ease-in-out_infinite] h-full" />
                    <span className="w-1 bg-[var(--color-accent)] rounded-full animate-[pulse_1.1s_ease-in-out_infinite] h-2/3" />
                    <span className="w-1 bg-[var(--color-accent)] rounded-full animate-[pulse_0.6s_ease-in-out_infinite] h-5/6" />
                    <span className="w-1 bg-[var(--color-accent)] rounded-full animate-[pulse_0.9s_ease-in-out_infinite] h-1/2" />
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/45 text-[var(--color-accent)]">
                      ✨ FEATURED SPOTLIGHT
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-white/70">
                      Studio Master
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-3xl font-black text-white truncate tracking-tight leading-tight group-hover:text-[var(--color-accent)] transition-colors">
                    {spotlightTrack.title}
                  </h2>
                  <p className="text-sm sm:text-base text-white/70 truncate mt-0.5 font-semibold">
                    {spotlightTrack.artist}
                  </p>
                  <p className="text-xs text-white/50 mt-1.5 line-clamp-1 max-w-lg hidden sm:block">
                    Pristine acoustics with zero internet buffering • Tap to experience pure lossless audio
                  </p>
                </div>
              </div>

              {/* Right Column: High-Impact Action Dock */}
              <div className="flex items-center gap-3 flex-wrap flex-shrink-0 w-full md:w-auto pt-2 md:pt-0">
                <button
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('medium');
                    playTrack(spotlightTrack, trendingTracks, 0);
                  }}
                  className="flex-1 md:flex-none px-6 py-3 rounded-full glass-button-primary text-white font-black text-sm flex items-center justify-center gap-2 shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span>Play Mix Now</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    navigate(`/vibe?prompt=${encodeURIComponent(`${spotlightTrack.title} ${spotlightTrack.artist}`)}&auto=1`);
                  }}
                  className="px-4 py-3 rounded-full glass-button text-xs font-bold text-white/90 hover:text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                  title="Curate an AI DJ set inspired by this track"
                >
                  <span>✨ AI DJ Remix</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('medium');
                    toggleLike(spotlightTrack);
                  }}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
                    likedIds[spotlightTrack.id]
                      ? 'glass-button-primary text-[var(--color-accent)]'
                      : 'glass-button text-white/70 hover:text-white'
                  }`}
                  title={likedIds[spotlightTrack.id] ? 'Liked' : 'Like'}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill={likedIds[spotlightTrack.id] ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ================= AI VIBE STUDIO STRIP ================= */}
      {(activeFilter === 'all' || activeFilter === 'music') && (
        <section className="mb-7 px-1">
          <div className="p-3.5 sm:p-4 rounded-2xl liquid-glass border border-white/14 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-white/90 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] animate-pulse" />
                <span>AI Vibe Studio • What mood are you craving?</span>
              </span>
              <button
                onClick={() => navigate('/vibe')}
                className="text-[11px] font-bold text-cyan-300 hover:text-white cursor-pointer"
              >
                Open Studio →
              </button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
              {VIBE_STUDIO_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    navigate(`/vibe?prompt=${encodeURIComponent(preset.prompt)}&auto=1`);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold text-white/90 hover:text-white bg-gradient-to-r ${preset.color} border transition-all whitespace-nowrap cursor-pointer hover:scale-105 active:scale-95 shadow-sm`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ================= UPGRADED QUICK-ACCESS 6 TILES ================= */}
      {(activeFilter === 'all' || activeFilter === 'music') && quickMixTracks.length > 0 && (
        <section className="mb-8 px-1">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-sm font-black uppercase tracking-wider text-white/60">
              Quick Jump In
            </h3>
            <span className="text-[11px] text-white/40 font-medium">Recent & Liked Favorites</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
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
                className="group relative flex items-center gap-3.5 p-2 rounded-2xl liquid-glass border border-white/14 hover:border-white/35 hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer shadow-md overflow-hidden"
              >
                <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 shadow-md">
                  <img
                    src={track.thumbnail || DEFAULT_THUMBNAIL}
                    alt={track.title}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  {/* Subtle play indicator on hover */}
                  <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-7 h-7 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center shadow-lg scale-90 group-hover:scale-100 transition-transform">
                      <svg className="w-3.5 h-3.5 ml-0.5 fill-current" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 flex-1 pr-2">
                  <h4 className="text-xs sm:text-sm font-bold text-white truncate leading-snug group-hover:text-[var(--color-accent)] transition-colors">
                    {track.title}
                  </h4>
                  <p className="text-[11px] text-white/55 truncate leading-snug mt-0.5 font-medium">
                    {track.artist}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ================= RECENTLY PLAYED ================= */}
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

      {/* ================= TRENDING SECTION ================= */}
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

      {/* ================= FEATURED ARTISTS ================= */}
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

      {/* ================= MOOD PLAYLISTS ================= */}
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

      {/* ================= NEW RELEASES ================= */}
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

      {/* ================= GENRES ================= */}
      {(activeFilter === 'all' || activeFilter === 'music') && (
        <div className="mt-8 px-1">
          <GenreBrowser />
        </div>
      )}
    </div>
  );
}
