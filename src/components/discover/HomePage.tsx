import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useStudioStore, STUDIO_FX_MODES } from '../../stores/studioStore';
import { getTrending, getCachedTrending, searchTracks } from '../../services/youtube';
import { getNewReleases, getCachedNewReleases, getAlbumTracks, FALLBACK_NEW_RELEASES } from '../../services/itunes';
import Skeleton from '../ui/Skeleton';
import GenreBrowser from '../search/GenreBrowser';
import TrendingSection from './TrendingSection';
import { MOOD_PLAYLISTS, DEFAULT_THUMBNAIL, FEATURED_ARTISTS, FALLBACK_TRENDING_TRACKS } from '../../utils/constants';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import type { Track, AlbumResult } from '../../types';

import { useDevicePreset } from '../../hooks/useDevicePreset';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

const HorizontalScroll = memo(({
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
              className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white/80 hover:text-white cursor-pointer active:scale-90 transition-transform"
              title="Scroll left"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => scroll('right')}
              className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white/80 hover:text-white cursor-pointer active:scale-90 transition-transform"
              title="Scroll right"
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
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {children}
      </div>
    </section>
  );
});
HorizontalScroll.displayName = 'HorizontalScroll';

export default function HomePage() {
  const navigate = useNavigate();
  const playTrack = usePlayerStore((state) => state.playTrack);
  const currentTrackId = usePlayerStore((state) => state.currentTrack?.id);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const addToQueue = usePlayerStore((state) => state.addToQueue);

  const recentlyPlayed = useLibraryStore((state) => state.recentlyPlayed);
  const likedSongs = useLibraryStore((state) => state.likedSongs);
  const toggleLike = useLibraryStore((state) => state.toggleLike);
  const likedIds = useLibraryStore((state) => state.likedIds);

  const fxMode = useStudioStore((state) => state.fxMode);
  const setStudioModalOpen = useStudioStore((state) => state.setStudioModalOpen);

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

  // In-app floating micro-toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  };

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

  const todayFormatted = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      }).format(new Date());
    } catch {
      return 'Today';
    }
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

  // Active Studio Mode display label
  const activeStudioMode = useMemo(() => {
    return STUDIO_FX_MODES.find((m) => m.id === fxMode) || STUDIO_FX_MODES[0];
  }, [fxMode]);

  const handlePlayMood = useCallback(async (moodId: string, moodQuery: string) => {
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
  }, [playTrack]);

  const handlePlayAlbum = useCallback(async (album: AlbumResult, e: React.MouseEvent) => {
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
  }, [playTrack, navigate]);

  const handleSelectTrendingCategory = useCallback(async (categoryKey: string) => {
    triggerAndroidHaptic('light');
    setActiveTrendingCategory((currentKey) => {
      if (categoryKey === currentKey) return currentKey;
      setIsCategoryTrendingLoading(true);
      getTrending(categoryKey)
        .then((tracks) => {
          if (tracks && tracks.length > 0) {
            setTrendingTracks(tracks);
          }
        })
        .catch((err) => {
          console.error('Failed to change trending category:', err);
        })
        .finally(() => {
          setIsCategoryTrendingLoading(false);
        });
      return categoryKey;
    });
  }, []);

  return (
    <div className="relative w-full min-w-0 max-w-full overflow-x-hidden pb-44 sm:pb-24 pt-2 text-white min-h-screen">
      {/* Floating Micro-Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl liquid-glass border-0 text-white text-xs font-bold shadow-[0_12px_32px_rgba(0,0,0,0.6)] animate-in fade-in slide-in-from-top-3 duration-200">
          <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-ping" />
          <span>{toastMessage}</span>
        </div>
      )}


      {/* ================= EDITORIAL ATMOSPHERIC HEADER ================= */}
      <div className="mb-8 px-1 pt-1 flex flex-col gap-4 w-full min-w-0 max-w-full">
        <div className="w-full min-w-0">
          {/* Editorial Eyebrow Ribbon */}
          <div className="flex items-center gap-2 sm:gap-2.5 text-[11px] sm:text-xs font-bold tracking-[0.18em] uppercase text-white/45 mb-2.5 flex-wrap min-w-0">
            <span className="text-white/70">{todayFormatted}</span>
            <span className="text-white/25">•</span>
            <span className="inline-flex items-center gap-1.5 text-[var(--color-accent)] font-extrabold tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
              {greetingInfo.vibeBadge}
            </span>
            <span className="hidden sm:inline text-white/25">•</span>
            <span className="hidden sm:inline text-white/40 font-semibold tracking-wider">
              320kbps Spatial Soundstage
            </span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-[-0.03em] leading-tight break-words text-white">
            {greetingInfo.greeting}
          </h1>
          <p className="text-xs sm:text-sm text-white/60 mt-1 sm:mt-1.5 font-medium flex items-center gap-2 flex-wrap min-w-0 leading-relaxed">
            <span>{greetingInfo.tagline}</span>
            <span className="text-white/30">•</span>
            <span className="text-white/80 font-semibold">Mastered for Spatial Audio</span>
          </p>
        </div>

        {/* Unified Discovery & Navigation Control Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1 w-full min-w-0">
          {/* Category Filter Pills (Apple Music / Spotify Segmented Style) */}
          <div
            className="inline-flex items-center gap-1.5 p-1 rounded-full liquid-glass border-0 overflow-x-auto no-scrollbar w-auto max-w-full flex-shrink-0"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
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
                  className={`px-3.5 sm:px-4.5 py-1.5 rounded-full text-xs font-bold transition-all duration-200 whitespace-nowrap flex items-center justify-center cursor-pointer flex-shrink-0 ${
                    isSelected
                      ? 'glass-button-primary text-white shadow-md'
                      : 'text-white/70 hover:text-white hover:bg-white/[0.08]'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          {/* Quick Soundstage Telemetry & Library Portals */}
          <div
            className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 w-full md:w-auto md:justify-end flex-shrink-0"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {/* Liked Songs */}
            <button
              onClick={() => {
                triggerAndroidHaptic('light');
                navigate('/liked');
              }}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.09] text-white/80 hover:text-white text-xs font-semibold transition-all cursor-pointer whitespace-nowrap border border-white/[0.08] hover:border-white/20 active:scale-95 shadow-sm flex-shrink-0"
              title="Liked Songs Library"
            >
              <span className="text-rose-400 text-xs">❤️</span>
              <span>Liked</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500/15 text-rose-300 font-bold">
                {likedSongs.length}
              </span>
            </button>

            {/* 3D Sonic Galaxy */}
            <button
              onClick={() => {
                triggerAndroidHaptic('medium');
                navigate('/galaxy');
              }}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.09] text-white/80 hover:text-white text-xs font-semibold transition-all cursor-pointer whitespace-nowrap border border-white/[0.08] hover:border-white/20 active:scale-95 shadow-sm flex-shrink-0"
              title="Open 3D Sonic Galaxy"
            >
              <span className="text-violet-400 text-xs">🪐</span>
              <span>3D Galaxy</span>
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            </button>

            {/* Studio FX */}
            <button
              onClick={() => {
                triggerAndroidHaptic('light');
                setStudioModalOpen(true);
              }}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.09] text-white/80 hover:text-white text-xs font-semibold transition-all cursor-pointer whitespace-nowrap border border-white/[0.08] hover:border-white/20 active:scale-95 shadow-sm flex-shrink-0"
              title="Studio FX Equalizer & Spatial DSP"
            >
              <span className="text-amber-400 text-xs">⚡</span>
              <span>Studio FX</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-400/15 text-amber-300 font-bold">
                {activeStudioMode.name}
              </span>
            </button>

            {/* Offline Vault */}
            <button
              onClick={() => {
                triggerAndroidHaptic('light');
                navigate('/downloads');
              }}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.09] text-white/80 hover:text-white text-xs font-semibold transition-all cursor-pointer whitespace-nowrap border border-white/[0.08] hover:border-white/20 active:scale-95 shadow-sm flex-shrink-0"
              title="Offline Vault Downloads"
            >
              <span className="text-emerald-400 text-xs">📥</span>
              <span>Vault</span>
            </button>
          </div>
        </div>
      </div>

      {/* ================= HERO SPOTLIGHT BANNER ================= */}
      {(activeFilter === 'all' || activeFilter === 'music') && spotlightTrack && (
        <section className="mb-10 px-1 w-full min-w-0 max-w-full">
          <div
            className="relative rounded-3xl liquid-glass border-0 p-5 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.55)] overflow-hidden group w-full min-w-0 isolate [transform:translateZ(0)]"
          >
            {/* Top Specular Rim Reflection */}
            <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/35 to-transparent pointer-events-none z-10" />

            {/* Ambient Blurred Artwork Backdrop */}
            <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none z-0">
              <img
                src={spotlightTrack.thumbnailLarge || spotlightTrack.thumbnail || DEFAULT_THUMBNAIL}
                alt=""
                className="w-full h-full object-cover blur-3xl opacity-35 scale-125 transition-transform duration-1000 group-hover:scale-130"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/35 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] via-transparent to-black/20" />
            </div>

            <div className="relative z-10 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-5 sm:gap-6 w-full min-w-0">
              {/* Left Column: Hero Art & Acoustic Info */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 min-w-0 flex-1 w-full">
                {/* Artwork Container with 3D Vinyl Sleeve Peeking */}
                <div className="relative flex-shrink-0 group/cover">
                  {/* Realistic Anodized Vinyl Record Peeking from Sleeve on Hover */}
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-20 h-20 sm:w-28 sm:h-28 rounded-full vinyl-disc shadow-[0_8px_24px_rgba(0,0,0,0.8)] transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/cover:translate-x-6 sm:group-hover/cover:translate-x-8 pointer-events-none z-0">
                    {/* Vinyl Center Spindle & Label */}
                    <div className="absolute inset-0 m-auto w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-zinc-800 to-black border border-white/20 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-black border border-white/40" />
                    </div>
                  </div>

                  {/* Primary Front Album Art Sleeve */}
                  <div className="relative z-10 w-24 h-24 sm:w-32 sm:h-32 rounded-2xl overflow-hidden shadow-[0_16px_36px_rgba(0,0,0,0.7)] border-0 group-hover/cover:scale-[1.03] transition-transform duration-500">
                    <img
                      src={spotlightTrack.thumbnailLarge || spotlightTrack.thumbnail || DEFAULT_THUMBNAIL}
                      alt={spotlightTrack.title}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
                    />
                    {/* Subtle Top-Light Specular Sleeve Sheen */}
                    <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />

                    {/* Floating Live Equalizer Bars in Liquid Glass */}
                    <div className="absolute bottom-2 left-2 px-2 py-1 rounded-xl liquid-glass flex items-end gap-1 h-4.5 border-0 shadow-lg">
                      <span className="w-1 bg-[var(--color-accent)] rounded-full animate-[pulse_0.8s_ease-in-out_infinite] h-full" />
                      <span className="w-1 bg-[var(--color-accent)] rounded-full animate-[pulse_1.1s_ease-in-out_infinite] h-2/3" />
                      <span className="w-1 bg-[var(--color-accent)] rounded-full animate-[pulse_0.6s_ease-in-out_infinite] h-5/6" />
                      <span className="w-1 bg-[var(--color-accent)] rounded-full animate-[pulse_0.9s_ease-in-out_infinite] h-1/2" />
                    </div>
                  </div>
                </div>

                <div className="min-w-0 flex-1 w-full">
                  <div className="flex items-center gap-2 mb-2 flex-wrap min-w-0">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest glass-button text-[var(--color-accent)] shadow-sm flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse shadow-[0_0_8px_var(--color-accent)]" />
                      FEATURED SPOTLIGHT
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full glass-button text-[10px] font-bold text-white/70 tracking-wider uppercase flex-shrink-0">
                      <span className="w-1 h-1 rounded-full bg-white/40" />
                      320kbps Studio Master
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full glass-button text-[10px] font-bold text-cyan-300 tracking-wider uppercase flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      Spatial DSP
                    </span>
                  </div>

                  <h2
                    onClick={() => {
                      triggerAndroidHaptic('medium');
                      playTrack(spotlightTrack, trendingTracks, 0);
                    }}
                    className="text-2xl sm:text-3xl lg:text-4xl font-black text-white truncate tracking-tight leading-tight group-hover:text-[var(--color-accent)] transition-colors cursor-pointer block max-w-full"
                  >
                    {spotlightTrack.title}
                  </h2>

                  <p
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      navigate(`/search?q=${encodeURIComponent(spotlightTrack.artist)}`);
                    }}
                    className="text-sm sm:text-base text-white/75 truncate mt-1 font-semibold hover:text-white cursor-pointer transition-colors"
                  >
                    {spotlightTrack.artist}
                  </p>

                  <p className="text-xs text-white/55 mt-1.5 line-clamp-1 max-w-lg hidden sm:block font-medium">
                    Pristine acoustics with zero internet buffering • Tap to experience pure lossless studio sound
                  </p>
                </div>
              </div>

              {/* Action Dock: Sits below on tablet/narrow laptop with full width, and side-by-side on wide desktop */}
              <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap w-full xl:w-auto pt-3 xl:pt-0">
                {/* Play Mix Now */}
                <button
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('medium');
                    playTrack(spotlightTrack, trendingTracks, 0);
                  }}
                  className="flex-1 sm:flex-none px-5 sm:px-6 py-2.5 sm:py-3 rounded-full glass-button-primary text-white font-black text-sm flex items-center justify-center gap-2 shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span>Play Mix Now</span>
                </button>

                {/* 3D Galaxy View */}
                <button
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('medium');
                    navigate('/galaxy');
                  }}
                  className="px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-full glass-button text-white/90 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                  title="Visualize in 3D Sonic Galaxy"
                >
                  <span>🪐</span>
                  <span>3D Galaxy</span>
                </button>

                {/* Add to Queue */}
                <button
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    addToQueue(spotlightTrack);
                    showToast(`Added "${spotlightTrack.title}" to queue`);
                  }}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center glass-button text-white/80 hover:text-white cursor-pointer active:scale-90 transition-all flex-shrink-0"
                  title="Add to queue"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>

                {/* Favorite */}
                <button
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('medium');
                    toggleLike(spotlightTrack);
                    showToast(likedIds[spotlightTrack.id] ? 'Removed from Liked Songs' : 'Saved to Liked Songs');
                  }}
                  className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 flex-shrink-0 ${
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

                {/* Context Menu Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    triggerAndroidHaptic('light');
                    useContextMenuStore.getState().openTrackMenu(
                      { clientX: e.clientX, clientY: e.clientY },
                      spotlightTrack,
                      trendingTracks
                    );
                  }}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center glass-button text-white/70 hover:text-white cursor-pointer active:scale-90 transition-all flex-shrink-0"
                  title="More options"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="19" r="2" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ================= QUICK JUMP IN ================= */}
      {(activeFilter === 'all' || activeFilter === 'music') && quickMixTracks.length > 0 && (
        <section className="mb-10 px-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-white/75 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
              Quick Jump In
            </h3>
            <span className="text-[11px] text-white/45 font-semibold">Instant Sessions & Favorites</span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3.5">
            {quickMixTracks.map((track, i) => {
              const isThisPlaying = currentTrackId === track.id;
              return (
                <div
                  key={`quick-${track.id}-${i}`}
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    if (isThisPlaying) {
                      togglePlay();
                    } else {
                      playTrack(track, quickMixTracks, i);
                    }
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
                  className={`group relative flex items-center gap-2.5 sm:gap-3.5 p-2 sm:p-2.5 rounded-2xl liquid-glass border-0 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-lg overflow-hidden active:scale-[0.98] ${
                    isThisPlaying
                      ? 'ring-1 ring-[var(--color-accent)]/50 shadow-[0_8px_24px_rgba(0,0,0,0.4),0_0_20px_rgba(250,45,72,0.25)]'
                      : 'hover:brightness-110'
                  }`}
                >
                  {/* Subtle top specular sheen */}
                  <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/12 to-transparent pointer-events-none" />

                  <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden flex-shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.4)] bg-white/5">
                    <img
                      src={track.thumbnail || DEFAULT_THUMBNAIL}
                      alt={track.title}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
                      className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-500"
                    />

                    {/* Active Live Equalizer Mini Badge in corner */}
                    {isThisPlaying && isPlaying ? (
                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/85 backdrop-blur-md flex items-end gap-0.5 h-3.5 shadow-md border-0 pointer-events-none">
                        <span className="w-0.5 bg-[var(--color-accent)] rounded-full animate-[pulse_0.7s_ease-in-out_infinite] h-full" />
                        <span className="w-0.5 bg-[var(--color-accent)] rounded-full animate-[pulse_1.0s_ease-in-out_infinite] h-3/5" />
                        <span className="w-0.5 bg-[var(--color-accent)] rounded-full animate-[pulse_0.5s_ease-in-out_infinite] h-4/5" />
                      </div>
                    ) : (
                      /* Hover Play Button */
                      <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-7 h-7 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center shadow-lg scale-90 group-hover:scale-100 transition-transform">
                          <svg className="w-3.5 h-3.5 ml-0.5 fill-current" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 pr-1.5 sm:pr-2">
                    <div className="flex items-center gap-1.5">
                      <h4 className={`text-xs sm:text-sm font-bold truncate leading-snug transition-colors ${
                        isThisPlaying ? 'text-[var(--color-accent)]' : 'text-white group-hover:text-[var(--color-accent)]'
                      }`}>
                        {track.title}
                      </h4>
                      {isThisPlaying && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse flex-shrink-0" title="Now Playing" />
                      )}
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-white/55 truncate leading-snug mt-0.5 font-medium">
                      {track.artist}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ================= 3D SONIC GALAXY OBSERVATORY PORTAL BANNER ================= */}
      {(activeFilter === 'all' || activeFilter === 'music') && (
        <section className="mb-10 px-1 w-full min-w-0 max-w-full">
          <div
            className="relative rounded-3xl liquid-glass border-0 p-5 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.55)] overflow-hidden group w-full min-w-0 isolate [transform:translateZ(0)]"
          >
            {/* Top Specular Rim Reflection */}
            <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/35 to-transparent pointer-events-none z-10" />

            {/* Deep Galactic Gradient Background */}
            <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none z-0">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-950/40 via-indigo-950/25 to-blue-950/35" />
              <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-violet-600/20 blur-3xl" />
              <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-cyan-600/20 blur-3xl" />
            </div>

            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6 w-full min-w-0">
              {/* Left Column: Visual Details & Description */}
              <div className="max-w-2xl min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase glass-button border-0 text-violet-200">
                    <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse shadow-[0_0_8px_#a78bfa]" />
                    OBSERVATORY 3.0 • INTERACTIVE 3D MUSIC MAP
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold glass-button text-white/70">
                    Web Audio 3D Space
                  </span>
                </div>

                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:via-violet-200 group-hover:to-cyan-200 transition-all">
                  Navigate Your Music Universe in 3D Space
                </h2>

                <p className="text-xs sm:text-sm text-white/70 mt-2 font-medium leading-relaxed">
                  Experience your taste across 3 celestial formations — 3D Constellations, Taste Radar & Logarithmic Spiral Galaxy. Orbit audio-reactive star coronas, relativistic black hole accretion disks, and 4D acoustic DNA spider radar.
                </p>

                {/* Feature Badges */}
                <div className="flex items-center gap-2 mt-4 flex-wrap">
                  <span className="px-3 py-1 rounded-full text-[11px] font-bold glass-button border-0 text-white/90 flex items-center gap-1.5">
                    <span>🪐</span> 3 Celestial Formations
                  </span>
                  <span className="px-3 py-1 rounded-full text-[11px] font-bold glass-button border-0 text-white/90 flex items-center gap-1.5">
                    <span>🌀</span> Accretion Core & Jets
                  </span>
                  <span className="px-3 py-1 rounded-full text-[11px] font-bold glass-button border-0 text-white/90 flex items-center gap-1.5">
                    <span>🎯</span> 4D Taste Spider Radar
                  </span>
                  <span className="px-3 py-1 rounded-full text-[11px] font-bold glass-button border-0 text-white/90 flex items-center gap-1.5">
                    <span>🛸</span> Cinematic Tour
                  </span>
                </div>
              </div>

              {/* Right Column: High-Impact Action Button */}
              <div className="flex items-center sm:self-end lg:self-center gap-4 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('medium');
                    navigate('/galaxy');
                  }}
                  className="px-6 sm:px-7 py-3.5 sm:py-4 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-600 hover:from-violet-500 hover:via-indigo-500 hover:to-cyan-500 text-white font-black text-sm flex items-center justify-center gap-3 shadow-[0_12px_36px_rgba(124,58,237,0.4)] hover:shadow-[0_16px_48px_rgba(124,58,237,0.6)] hover:scale-105 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                >
                  <span>🚀 Launch 3D Observatory</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ================= RECENTLY PLAYED ================= */}
      {(activeFilter === 'all' || activeFilter === 'music') && recentlyPlayed.length > 0 && (
        <HorizontalScroll title="Recently Played" subtitle="Jump back into your recent sessions">
          {recentlyPlayed.slice(0, 12).map((historyItem, i) => {
            const track = historyItem.track;
            if (!track) return null;
            const isPlayingThis = currentTrackId === track.id;
            return (
              <div
                key={`${track.id}-${i}`}
                className="min-w-[145px] max-w-[145px] sm:min-w-[170px] sm:max-w-[170px] flex-shrink-0 snap-start group cursor-pointer relative"
                onClick={() => {
                  triggerAndroidHaptic('light');
                  if (isPlayingThis) {
                    togglePlay();
                  } else {
                    playTrack(
                      track,
                      recentlyPlayed.map((r) => r.track).filter(Boolean) as Track[],
                      i
                    );
                  }
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
                <div className={`aspect-square rounded-2xl overflow-hidden mb-2.5 relative bg-white/5 shadow-md group-hover:shadow-2xl transition-all duration-300 ring-1 ring-white/10 group-hover:ring-white/20 ${
                  isPlayingThis ? 'shadow-[0_8px_25px_rgba(250,45,72,0.25)] ring-[var(--color-accent)]/50' : ''
                }`}>
                  <img
                    src={track.thumbnail || track.thumbnailUrl || DEFAULT_THUMBNAIL}
                    alt={track.title}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
                    className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-500 ease-out"
                  />
                  {/* Top Specular Sheen */}
                  <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />

                  {/* Active Live Equalizer Mini Badge */}
                  {isPlayingThis && isPlaying ? (
                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md flex items-end gap-0.5 h-3.5 shadow-md border-0 pointer-events-none">
                      <span className="w-0.5 bg-[var(--color-accent)] rounded-full animate-[pulse_0.7s_ease-in-out_infinite] h-full" />
                      <span className="w-0.5 bg-[var(--color-accent)] rounded-full animate-[pulse_1.0s_ease-in-out_infinite] h-3/5" />
                      <span className="w-0.5 bg-[var(--color-accent)] rounded-full animate-[pulse_0.5s_ease-in-out_infinite] h-4/5" />
                    </div>
                  ) : (
                    /* Desktop Hover Play Button */
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 hidden sm:flex items-center justify-center pointer-events-none">
                      <div className="w-11 h-11 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.5)] scale-90 translate-y-2 group-hover:scale-100 group-hover:translate-y-0 transition-all duration-300">
                        <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  )}

                  {/* Dedicated 3-Dots Button for Mobile & Desktop */}
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
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white/80 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 hover:text-white hover:bg-black/80 active:scale-90 transition-all cursor-pointer"
                    title="Track actions"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                    </svg>
                  </button>
                </div>
                <h3 className={`font-bold text-xs sm:text-sm truncate transition-colors duration-200 ${
                  isPlayingThis ? 'text-[var(--color-accent)]' : 'text-white group-hover:text-[var(--color-accent)]'
                }`}>{track.title}</h3>
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
              <div className="w-28 h-28 sm:w-34 sm:h-34 rounded-full overflow-hidden mb-2.5 relative bg-white/10 shadow-lg border-0 ring-2 ring-white/10 group-hover:ring-[var(--color-accent)]/60 group-hover:shadow-[0_0_25px_rgba(250,45,72,0.35)] transition-all duration-300">
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
                {/* Verified Artist Checkmark Badge */}
                <div className="absolute bottom-1 right-2 w-5 h-5 rounded-full bg-cyan-500 text-black flex items-center justify-center text-[10px] font-black shadow-md border border-black/40 pointer-events-none">
                  ✓
                </div>
              </div>
              <h4 className="font-bold text-xs sm:text-sm text-white truncate w-full group-hover:text-[var(--color-accent)] transition-colors">
                {artist.name}
              </h4>
              <p className="text-[11px] text-white/50 truncate w-full mt-0.5 font-medium">
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
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">All Moods & Activities</h2>
                <p className="text-xs text-white/55 mt-0.5 font-medium">Tap any vibe to launch an instant endless curated mix</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
              {MOOD_PLAYLISTS.map((mood) => {
                const isMoodLoading = loadingMoodId === mood.id;
                return (
                  <div
                    key={mood.id}
                    onClick={() => handlePlayMood(mood.id, mood.query || mood.searchQuery)}
                    className={`relative rounded-2xl overflow-hidden p-5 transition-all duration-300 cursor-pointer group active:scale-[0.98] shadow-md hover:shadow-2xl hover:-translate-y-1 ${mood.colorClass}`}
                  >
                    {/* Top Specular Sheen */}
                    <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />
                    
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-3xl sm:text-4xl drop-shadow-lg group-hover:scale-115 transition-transform duration-300">{mood.emoji}</span>
                      <div className="w-9 h-9 rounded-full glass-button-primary text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-all">
                        {isMoodLoading ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <h3 className="font-black text-sm sm:text-base text-white tracking-tight">{mood.name}</h3>
                    <p className="text-[11px] text-white/75 mt-0.5 font-medium">{mood.sub || 'Play instant mix'}</p>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <HorizontalScroll title="Moods & Activities" subtitle="Instant curated mixes tailored to your vibe">
            {MOOD_PLAYLISTS.map((mood) => {
              const isMoodLoading = loadingMoodId === mood.id;
              return (
                <div
                  key={mood.id}
                  onClick={() => handlePlayMood(mood.id, mood.query || mood.searchQuery)}
                  className={`min-w-[190px] max-w-[190px] sm:min-w-[215px] sm:max-w-[215px] flex-shrink-0 snap-start relative rounded-2xl overflow-hidden p-5 transition-all duration-300 cursor-pointer group active:scale-[0.98] shadow-md hover:shadow-2xl hover:-translate-y-1 ${mood.colorClass}`}
                >
                  {/* Top Specular Sheen */}
                  <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />

                  <div className="flex items-center justify-between mb-4">
                    <span className="text-3xl sm:text-4xl drop-shadow-lg group-hover:scale-115 transition-transform duration-300">{mood.emoji}</span>
                    <div className="w-9 h-9 rounded-full glass-button-primary text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-all">
                      {isMoodLoading ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <h3 className="font-black text-sm sm:text-base text-white tracking-tight">{mood.name}</h3>
                  <p className="text-[11px] text-white/75 mt-0.5 font-medium">{mood.sub || 'Play instant mix'}</p>
                </div>
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
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
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
                    <div className="aspect-square rounded-2xl overflow-hidden mb-2.5 relative bg-white/5 shadow-md group-hover:shadow-2xl transition-all duration-300 ring-1 ring-white/10 group-hover:ring-white/20">
                      <img
                        src={album.coverUrl || album.thumbnail || DEFAULT_THUMBNAIL}
                        alt={album.title || album.name}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        crossOrigin="anonymous"
                        onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
                        className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-500 ease-out"
                      />
                      {/* Top Specular Sheen */}
                      <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />

                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <button
                          onClick={(e) => handlePlayAlbum(album, e)}
                          className="w-11 h-11 rounded-full glass-button-primary text-white flex items-center justify-center shadow-xl scale-90 translate-y-2 group-hover:scale-100 group-hover:translate-y-0 transition-all duration-300 cursor-pointer hover:brightness-110 active:scale-95"
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
                    <p className="text-[11px] text-white/50 truncate mt-0.5 font-medium">{album.artist}</p>
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
