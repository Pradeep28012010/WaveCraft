import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useStudioStore, STUDIO_FX_MODES } from '../../stores/studioStore';
import { getTrending, getCachedTrending, searchTracks } from '../../services/youtube';
import { getNewReleases, getCachedNewReleases, getAlbumTracks, getAlbumArt, FALLBACK_NEW_RELEASES } from '../../services/itunes';
import { computeSmartPlaylists, type SmartPlaylistDef } from '../../services/smartPlaylists';
import { unlockAudioEngine } from '../player/YouTubeEmbed';
import { getSmartRecommendations } from '../../services/recommendationEngine';
import Skeleton from '../ui/Skeleton';
import GenreBrowser from '../search/GenreBrowser';
import TrendingSection from './TrendingSection';
import {
  MOOD_PLAYLISTS,
  getCurrentTimePhase,
  type MoodPlaylist,
  DEFAULT_THUMBNAIL,
  FEATURED_ARTISTS,
  FALLBACK_TRENDING_TRACKS
} from '../../utils/constants';
import { MoodCard } from './MoodCard';
import { shuffleArray } from '../../utils/shuffle';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import type { Track, AlbumResult } from '../../types';
import { useDevicePreset } from '../../hooks/useDevicePreset';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

export type HomeFilter = 'all' | 'music' | 'for_you' | 'charts' | 'moods' | 'radios' | 'eras' | 'albums';

const FILTER_CHIPS: { id: HomeFilter; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: '✨' },
  { id: 'music', label: 'Music', icon: '🎵' },
  { id: 'for_you', label: 'Made For You', icon: '❤️' },
  { id: 'charts', label: 'Global Charts', icon: '🔥' },
  { id: 'moods', label: 'Moods & Mixes', icon: '🌈' },
  { id: 'radios', label: '24/7 Radios', icon: '📻' },
  { id: 'eras', label: 'Decades', icon: '⏳' },
  { id: 'albums', label: 'Albums', icon: '💿' }
];

const CURATED_CHARTS = [
  {
    key: 'global',
    name: "Today's Top Hits",
    sub: 'The hottest tracks in the world right now',
    badge: 'GLOBAL #1',
    color: 'from-emerald-500 via-teal-600 to-indigo-950',
    icon: '🌍',
    border: 'border-emerald-500/30'
  },
  {
    key: 'india',
    name: 'Top 50 India',
    sub: 'Trending Bollywood, Punjabi & Indie hits',
    badge: 'VIRAL IN INDIA',
    color: 'from-orange-500 via-amber-600 to-rose-950',
    icon: '🇮🇳',
    border: 'border-orange-500/30'
  },
  {
    key: 'usa',
    name: 'Top 50 USA',
    sub: 'Billboard Hot 100 leaders & US anthems',
    badge: 'HOT 100',
    color: 'from-blue-600 via-indigo-600 to-slate-950',
    icon: '🇺🇸',
    border: 'border-blue-500/30'
  },
  {
    key: 'hiphop',
    name: 'RapCaviar',
    sub: 'Heavyweight trap, drill & hip-hop beats',
    badge: 'HEAVY BASS',
    color: 'from-red-600 via-rose-700 to-zinc-950',
    icon: '🎤',
    border: 'border-red-500/30'
  },
  {
    key: 'dance',
    name: 'mint EDM World',
    sub: 'Global club, house & festival anthems',
    badge: '128 BPM PEAK',
    color: 'from-cyan-400 via-teal-500 to-blue-950',
    icon: '🎧',
    border: 'border-cyan-400/30'
  },
  {
    key: 'kpop',
    name: 'K-Pop ON!',
    sub: 'Idol releases, Korean charts & global viral',
    badge: 'GLOBAL K-WAVE',
    color: 'from-pink-500 via-purple-600 to-indigo-950',
    icon: '🇰🇷',
    border: 'border-pink-500/30'
  }
];

const CURATED_RADIOS = [
  {
    id: 'lofi-radio',
    name: 'Lofi Girl Study & Beats',
    desc: 'Gentle vinyl crackle, mellow rhodes & chill beats',
    query: 'lofi hip hop radio beats to relax study to',
    tag: 'Theta 432Hz',
    gradient: 'from-amber-600/30 via-orange-900/30 to-black/80',
    icon: '☕',
    glow: '#f59e0b'
  },
  {
    id: 'synthwave-radio',
    name: 'Synthwave 2088 Neon Drive',
    desc: 'Analog arpeggios, retro synthesizers & neon night highway',
    query: 'synthwave radio chill retro beats night drive',
    tag: '110 BPM Flow',
    gradient: 'from-fuchsia-600/30 via-purple-900/30 to-black/80',
    icon: '🌌',
    glow: '#d946ef'
  },
  {
    id: 'phonk-radio',
    name: 'Beast Mode Workout Phonk',
    desc: 'Drift 808 cowbells & high adrenaline gym motivation',
    query: 'drift phonk workout gym motivation radio hits',
    tag: 'High Octane',
    gradient: 'from-rose-600/30 via-red-950/30 to-black/80',
    icon: '🏃',
    glow: '#f43f5e'
  },
  {
    id: 'ambient-radio',
    name: 'Binaural Rain & 432Hz Sleep',
    desc: 'Deep restorative frequencies & soft thunderstorm wash',
    query: 'binaural beats deep sleep rain ambient soundscape',
    tag: 'Delta Waves',
    gradient: 'from-indigo-600/30 via-slate-900/30 to-black/80',
    icon: '🌧️',
    glow: '#6366f1'
  },
  {
    id: 'jazz-radio',
    name: 'Nocturnal Velvet Jazz',
    desc: 'Warm acoustic upright bass, muted trumpets & piano bar',
    query: 'cozy coffee shop jazz cafe radio relaxed instrumental',
    tag: 'Acoustic Warmth',
    gradient: 'from-yellow-700/30 via-amber-950/30 to-black/80',
    icon: '🎷',
    glow: '#eab308'
  },
  {
    id: 'club-radio',
    name: 'Tropical & Deep House Sessions',
    desc: 'Sun-drenched chords, melodic 4x4 groove & sunset vibes',
    query: 'tropical house deep chill radio sunset session',
    tag: '122 BPM Groove',
    gradient: 'from-cyan-600/30 via-blue-900/30 to-black/80',
    icon: '🏖️',
    glow: '#06b6d4'
  }
];

const ERA_DECINTERS = [
  {
    era: '80s',
    title: '80s Retro Synth & Pop Classics',
    artists: 'Michael Jackson • Queen • Prince • Madonna • Whitney Houston',
    query: '80s greatest hits top songs michael jackson queen prince',
    icon: '📼',
    gradient: 'from-pink-600 via-rose-600 to-purple-950',
    tag: 'Analog Magic'
  },
  {
    era: '90s',
    title: '90s Golden Era & Grunge Anthems',
    artists: 'Nirvana • 2Pac • Oasis • Britney Spears • TLC',
    query: '90s greatest hits top songs nirvana 2pac oasis britney',
    icon: '📻',
    gradient: 'from-amber-600 via-yellow-600 to-stone-950',
    tag: 'Golden Era'
  },
  {
    era: '00s',
    title: '2000s Pop, Rock & Nu-Metal',
    artists: 'Eminem • Linkin Park • Beyoncé • Coldplay • Rihanna',
    query: '2000s greatest hits top songs eminem linkin park beyonce coldplay',
    icon: '💿',
    gradient: 'from-cyan-600 via-blue-700 to-slate-950',
    tag: 'Millennium'
  },
  {
    era: '10s',
    title: '2010s Streaming Era & Global EDM',
    artists: 'Avicii • Drake • The Weeknd • Taylor Swift • Chainsmokers',
    query: '2010s greatest hits top songs avicii drake the weeknd taylor swift',
    icon: '📱',
    gradient: 'from-violet-600 via-indigo-700 to-zinc-950',
    tag: 'Streaming Boom'
  },
  {
    era: '20s',
    title: '2020s Hyperpop, Phonk & Viral Beats',
    artists: 'Dua Lipa • Olivia Rodrigo • Bad Bunny • Burna Boy • Phonk',
    query: '2020s hits viral trending songs dua lipa bad bunny olivia rodrigo',
    icon: '⚡',
    gradient: 'from-emerald-500 via-teal-600 to-neutral-950',
    tag: 'Modern Waves'
  }
];

const DAILY_MIX_DEFINITIONS = [
  {
    id: 'daily-mix-1',
    name: 'Daily Mix 1',
    sub: 'Chill Lo-Fi, Ambient & Acoustic',
    category: 'chill',
    query: 'chill lofi acoustic instrumental beats',
    gradient: 'from-emerald-500 via-teal-600 to-indigo-950',
    icon: '☕',
    tag: '432Hz Calm',
    badge: 'DAILY MIX 1'
  },
  {
    id: 'daily-mix-2',
    name: 'Daily Mix 2',
    sub: 'High-Octane Phonk & Heavy Trap',
    category: 'hiphop',
    query: 'drift phonk gym workout motivation hits',
    gradient: 'from-rose-600 via-red-600 to-zinc-950',
    icon: '⚡',
    tag: '145+ BPM',
    badge: 'DAILY MIX 2'
  },
  {
    id: 'daily-mix-3',
    name: 'Daily Mix 3',
    sub: 'Club Anthems, House & Dance EDM',
    category: 'dance',
    query: 'synthwave night drive retro electronic dance',
    gradient: 'from-purple-600 via-fuchsia-600 to-slate-950',
    icon: '🌃',
    tag: 'Neon Arp',
    badge: 'DAILY MIX 3'
  },
  {
    id: 'daily-mix-4',
    name: 'Daily Mix 4',
    sub: 'Global Pop, Viral Hits & Trending',
    category: 'pop',
    query: 'todays top hits viral pop global',
    gradient: 'from-amber-500 via-orange-600 to-rose-950',
    icon: '🔥',
    tag: 'Chart Topper',
    badge: 'DAILY MIX 4'
  },
  {
    id: 'daily-mix-5',
    name: 'Daily Mix 5',
    sub: 'Ultimate Indie, Alt & Acoustic Discovery',
    category: 'indie',
    query: 'ultimate indie alternative rock acoustic hits',
    gradient: 'from-cyan-500 via-blue-600 to-slate-950',
    icon: '🌿',
    tag: 'Indie Pulse',
    badge: 'DAILY MIX 5'
  }
];

const HorizontalScroll = memo(({
  children,
  title,
  subtitle,
  actionButton
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  actionButton?: React.ReactNode;
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
        <div className="flex items-center gap-2">
          {actionButton}
          {!isPhone && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => scroll('left')}
                className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white/80 hover:text-white cursor-pointer active:scale-90 transition-transform"
                title="Scroll left"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
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
      </div>
      <div
        ref={scrollRef}
        className="flex gap-3.5 sm:gap-5 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory pt-3 pb-8 -mb-3 px-2"
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
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const currentTrackId = usePlayerStore((state) => state.currentTrack?.id);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const [activeMoodId, setActiveMoodId] = useState<string | null>(null);

  const recentlyPlayed = useLibraryStore((state) => state.recentlyPlayed);
  const likedSongs = useLibraryStore((state) => state.likedSongs);
  const toggleLike = useLibraryStore((state) => state.toggleLike);
  const likedIds = useLibraryStore((state) => state.likedIds);
  const playHistory = useLibraryStore((state) => state.playHistory);
  const playlists = useLibraryStore((state) => state.playlists);

  const fxMode = useStudioStore((state) => state.fxMode);
  const setStudioModalOpen = useStudioStore((state) => state.setStudioModalOpen);

  const [activeFilter, setActiveFilter] = useState<HomeFilter>('all');
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
  const [playingChartKey, setPlayingChartKey] = useState<string | null>(null);
  const [loadingDailyMixId, setLoadingDailyMixId] = useState<string | null>(null);

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

  // Top 8 quick-access mix tracks
  const quickMixTracks = React.useMemo<Track[]>(() => {
    const list: Track[] = [];
    for (const h of recentlyPlayed) {
      if (h.track && !list.some((t) => t.id === h.track.id)) {
        list.push(h.track);
      }
      if (list.length >= 8) break;
    }
    if (list.length < 8) {
      for (const t of likedSongs) {
        if (!list.some((x) => x.id === t.id)) {
          list.push(t);
        }
        if (list.length >= 8) break;
      }
    }
    if (list.length < 8) {
      for (const t of trendingTracks) {
        if (!list.some((x) => x.id === t.id)) {
          list.push(t);
        }
        if (list.length >= 8) break;
      }
    }
    return list.slice(0, 8);
  }, [recentlyPlayed, likedSongs, trendingTracks]);

  // Dynamic Multi-Item Spotlight Showcase (Top 5 Anthems)
  const spotlightTracks = React.useMemo<Track[]>(() => {
    const list: Track[] = [];
    for (const t of trendingTracks) {
      if (t && !list.some((x) => x.id === t.id)) {
        list.push(t);
      }
      if (list.length >= 5) break;
    }
    return list.length > 0 ? list : quickMixTracks.slice(0, 5);
  }, [trendingTracks, quickMixTracks]);

  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [isSpotlightPaused, setIsSpotlightPaused] = useState(false);

  useEffect(() => {
    if (spotlightIndex >= spotlightTracks.length && spotlightTracks.length > 0) {
      setSpotlightIndex(0);
    }
  }, [spotlightTracks.length, spotlightIndex]);

  // Subtle auto-advance every 8 seconds when not hovered
  useEffect(() => {
    if (isSpotlightPaused || spotlightTracks.length <= 1) return;
    const timer = setInterval(() => {
      setSpotlightIndex((prev) => (prev + 1) % spotlightTracks.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [isSpotlightPaused, spotlightTracks.length]);

  const currentSpotlightTrack = spotlightTracks[spotlightIndex] || spotlightTracks[0] || null;

  // High-Res Artwork Resolution & Fallback Engine
  const [spotlightCoverArt, setSpotlightCoverArt] = useState<string | null>(null);
  const [spotlightArtFailed, setSpotlightArtFailed] = useState(false);

  useEffect(() => {
    if (!currentSpotlightTrack) {
      setSpotlightCoverArt(null);
      setSpotlightArtFailed(false);
      return;
    }

    setSpotlightArtFailed(false);
    const initial = currentSpotlightTrack.thumbnail || currentSpotlightTrack.thumbnailLarge || null;
    setSpotlightCoverArt(initial);

    let active = true;
    getAlbumArt(currentSpotlightTrack.title, currentSpotlightTrack.artist)
      .then((art) => {
        if (active && art) {
          setSpotlightCoverArt(art);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [currentSpotlightTrack?.id, currentSpotlightTrack?.title, currentSpotlightTrack?.artist]);

  // Personalized Smart Dynamic Playlists
  const smartPlaylists = useMemo(() => {
    return computeSmartPlaylists(likedSongs, recentlyPlayed, playHistory, playlists);
  }, [likedSongs, recentlyPlayed, playHistory, playlists]);

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
        tagline: 'Deep ambient resonance & relaxed acoustic textures',
        flowQuery: 'late night ambient lo-fi synth acoustic chill'
      };
    }
    if (hour < 12) {
      return {
        greeting: 'Good Morning',
        vibeBadge: '☀️ Morning Kickstart • 105–125 BPM Energize',
        tagline: 'Bright acoustic melodies and uplifting rhythms to fuel your day',
        flowQuery: 'morning acoustic wake up positive energy hits'
      };
    }
    if (hour < 18) {
      return {
        greeting: 'Good Afternoon',
        vibeBadge: '⚡ Daylight Focus • 95–115 BPM Flow State',
        tagline: 'Steady grooves, smooth momentum, and studio sound',
        flowQuery: 'afternoon focus flow state chill beats'
      };
    }
    return {
      greeting: 'Good Evening',
      vibeBadge: '🌆 Sunset Golden Hour • 80–100 BPM Warmth',
      tagline: 'Velvet acoustics and unwinding beats for your evening',
      flowQuery: 'evening sunset acoustic golden hour hits'
    };
  };

  const greetingInfo = getGreetingData();

  const handleLaunchTodayFlow = async () => {
    unlockAudioEngine();
    triggerAndroidHaptic('medium');
    showToast(`Summoning ${greetingInfo.greeting} Flow... 🎶`);
    try {
      const tracks = await searchTracks(greetingInfo.flowQuery);
      if (tracks.length > 0) {
        playTrack(tracks[0], tracks, 0);
        showToast(`Now Playing ${greetingInfo.greeting} Flow 🚀`);
      } else {
        showToast('Unable to launch flow mix');
      }
    } catch (err) {
      console.error('Failed to launch flow:', err);
      showToast('Error loading flow mix');
    }
  };

  const activeStudioMode = useMemo(() => {
    return STUDIO_FX_MODES.find((m) => m.id === fxMode) || STUDIO_FX_MODES[0];
  }, [fxMode]);

  const timePhase = useMemo(() => getCurrentTimePhase(), []);

  const timePhaseSubtitle = useMemo(() => {
    switch (timePhase) {
      case 'morning':
        return 'Curated for your morning flow • Instant liquid glass mixes';
      case 'afternoon':
        return 'Tuned for peak focus & midday energy • Instant curated mixes';
      case 'evening':
        return 'Tailored for your evening groove & wind-down • Liquid glass mixes';
      case 'late_night':
        return 'Crafted for late night synthesis & calm • Deep curated mixes';
    }
  }, [timePhase]);

  const moodCardsData = useMemo(() => {
    const currentTitleLower = (currentTrack?.title || '').toLowerCase();
    const currentArtistLower = (currentTrack?.artist || '').toLowerCase();

    const favoriteArtists: string[] = [];
    const seenArtists = new Set<string>();

    for (const item of recentlyPlayed) {
      const artist = item?.track?.artist?.trim();
      if (artist && !seenArtists.has(artist.toLowerCase())) {
        seenArtists.add(artist.toLowerCase());
        favoriteArtists.push(artist);
      }
    }
    for (const track of likedSongs) {
      const artist = track?.artist?.trim();
      if (artist && !seenArtists.has(artist.toLowerCase())) {
        seenArtists.add(artist.toLowerCase());
        favoriteArtists.push(artist);
      }
    }

    const scored = MOOD_PLAYLISTS.map((mood) => {
      let score = 0;
      let isNowPlayingMatch = false;
      let contextBadge: string | null = null;

      if (mood.bestTimeSlots.includes(timePhase)) {
        score += 40;
        contextBadge = mood.timePhaseLabel[timePhase] || null;
      }

      if (currentTrack) {
        const matchesKeyword = mood.seedKeywords.some(
          (kw) => currentTitleLower.includes(kw) || currentArtistLower.includes(kw)
        );
        if (matchesKeyword) {
          score += 55;
          isNowPlayingMatch = true;
          contextBadge = '🎶 Matches Current Track';
        }
      }

      let matchedArtist: string | null = null;
      for (const fav of favoriteArtists) {
        const favLower = fav.toLowerCase();
        if (
          mood.seedKeywords.some((kw) => favLower.includes(kw) || kw.includes(favLower)) ||
          mood.query.toLowerCase().includes(favLower)
        ) {
          matchedArtist = fav;
          break;
        }
      }

      if (matchedArtist) {
        score += 25;
      } else if (favoriteArtists.length > 0) {
        matchedArtist = favoriteArtists[0];
        score += 10;
      }

      const personalizedQuery = matchedArtist
        ? `${matchedArtist} ${mood.query}`
        : mood.query || mood.searchQuery;

      return {
        mood,
        relativityScore: score,
        isTopRecommendation: false,
        contextBadge,
        personalizedQuery,
        personalizedArtist: matchedArtist,
        isNowPlayingMatch
      };
    });

    const sorted = [...scored].sort((a, b) => b.relativityScore - a.relativityScore);
    if (sorted.length > 0 && sorted[0].relativityScore > 0) {
      sorted[0].isTopRecommendation = true;
      if (!sorted[0].contextBadge) {
        sorted[0].contextBadge = '✨ Top Pick for You';
      }
    }

    return sorted;
  }, [currentTrack, likedSongs, recentlyPlayed, timePhase]);

  const handlePlayMood = useCallback(
    async (mood: MoodPlaylist, customQuery?: string) => {
      unlockAudioEngine();
      triggerAndroidHaptic('medium');

      if (activeMoodId === mood.id) {
        togglePlay();
        showToast(isPlaying ? `Paused ${mood.name}` : `Resumed ${mood.name}`);
        return;
      }

      setLoadingMoodId(mood.id);
      try {
        const q = customQuery || mood.query || mood.searchQuery;
        const tracks = await searchTracks(q);
        if (tracks.length > 0) {
          setActiveMoodId(mood.id);
          playTrack(tracks[0], tracks, 0);
          showToast(`Now Playing ${mood.name} Mix 🎶`);
        } else {
          showToast(`No tracks found for ${mood.name}`);
        }
      } catch (err) {
        console.error('Failed to play mood:', err);
        showToast(`Failed to load ${mood.name}`);
      } finally {
        setLoadingMoodId(null);
      }
    },
    [activeMoodId, isPlaying, togglePlay, playTrack]
  );

  const handleQueueMood = useCallback(
    async (mood: MoodPlaylist, customQuery: string, e: React.MouseEvent) => {
      e.stopPropagation();
      unlockAudioEngine();
      triggerAndroidHaptic('light');

      setLoadingMoodId(mood.id);
      try {
        const q = customQuery || mood.query || mood.searchQuery;
        const tracks = await searchTracks(q);
        if (tracks.length > 0) {
          tracks.forEach((t) => addToQueue(t));
          showToast(`Added ${tracks.length} tracks from ${mood.name} to Up Next ➕`);
        } else {
          showToast(`Could not add ${mood.name} to queue`);
        }
      } catch (err) {
        console.error('Failed to queue mood:', err);
      } finally {
        setLoadingMoodId(null);
      }
    },
    [addToQueue]
  );

  const handleShuffleMood = useCallback(
    async (mood: MoodPlaylist, customQuery: string, e: React.MouseEvent) => {
      e.stopPropagation();
      unlockAudioEngine();
      triggerAndroidHaptic('medium');

      setLoadingMoodId(mood.id);
      try {
        const q = customQuery || mood.query || mood.searchQuery;
        const tracks = await searchTracks(q);
        if (tracks.length > 0) {
          const shuffled = shuffleArray(tracks);
          setActiveMoodId(mood.id);
          playTrack(shuffled[0], shuffled, 0);
          showToast(`Shuffled & playing ${mood.name} 🔀`);
        }
      } catch (err) {
        console.error('Failed to shuffle mood:', err);
      } finally {
        setLoadingMoodId(null);
      }
    },
    [playTrack]
  );

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

  const handlePlayChart = useCallback(
    async (chartKey: string, chartName: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      triggerAndroidHaptic('medium');
      unlockAudioEngine();
      setPlayingChartKey(chartKey);
      setActiveTrendingCategory(chartKey);
      showToast(`Loading ${chartName}... 📈`);

      try {
        setIsCategoryTrendingLoading(true);
        const tracks = await getTrending(chartKey);
        if (tracks && tracks.length > 0) {
          setTrendingTracks(tracks);
          playTrack(tracks[0], tracks, 0);
          showToast(`Now Playing ${chartName} 🎵`);
        } else {
          const fallbackQueryMap: Record<string, string> = {
            global: 'top global hits 2025 songs',
            india: 'top 50 trending songs india bollywood punjabi',
            usa: 'top 50 songs usa billboard hot 100',
            hiphop: 'rapcaviar hip hop drill songs',
            dance: 'top edm dance club festival hits',
            kpop: 'top kpop songs bts blackpink newjeans'
          };
          const query = fallbackQueryMap[chartKey] || `${chartName} hit songs`;
          const searchRes = await searchTracks(query);
          if (searchRes && searchRes.length > 0) {
            setTrendingTracks(searchRes);
            playTrack(searchRes[0], searchRes, 0);
            showToast(`Now Playing ${chartName} 🎵`);
          } else {
            showToast(`No tracks found for ${chartName}`);
          }
        }
      } catch (err) {
        console.error('Failed to play chart:', err);
        showToast(`Failed to load ${chartName}`);
      } finally {
        setIsCategoryTrendingLoading(false);
        setPlayingChartKey(null);
      }
    },
    [playTrack]
  );

  const handlePlaySmartPlaylist = async (smartPl: SmartPlaylistDef, shuffle = false) => {
    unlockAudioEngine();
    triggerAndroidHaptic('medium');
    if (!smartPl.tracks || smartPl.tracks.length === 0) {
      showToast(`No tracks in ${smartPl.name} yet`);
      return;
    }
    const baseTracks = shuffle ? shuffleArray([...smartPl.tracks]) : [...smartPl.tracks];
    playTrack(baseTracks[0], baseTracks, 0);
    showToast(`Now Playing ${smartPl.name} 🎶`);

    // If the playlist has fewer than 10 tracks, auto-enrich the queue with recommendations
    // based on the seed track so the user gets an endless radio experience
    if (baseTracks.length < 10) {
      try {
        const seed = baseTracks[0];
        const recs = await getSmartRecommendations(seed, baseTracks, 15);
        if (recs && recs.length > 0) {
          const combined = [...baseTracks];
          for (const r of recs) {
            if (!combined.some((x) => x.id === r.id)) {
              combined.push(r);
            }
          }
          usePlayerStore.setState({
            queue: combined,
            originalQueue: combined
          });
        }
      } catch (e) {
        console.warn('Could not enrich smart playlist:', e);
      }
    }
  };

  const handlePlayDailyMix = async (mixDef: (typeof DAILY_MIX_DEFINITIONS)[0]) => {
    unlockAudioEngine();
    triggerAndroidHaptic('medium');
    setLoadingDailyMixId(mixDef.id);
    showToast(`Loading ${mixDef.name}... 🎶`);
    try {
      let tracks: Track[] = [];
      if (mixDef.category) {
        tracks = await getTrending(mixDef.category);
      }
      if (!tracks || tracks.length === 0) {
        tracks = await searchTracks(mixDef.query);
      }
      if (tracks && tracks.length > 0) {
        playTrack(tracks[0], tracks, 0);
        showToast(`Now Playing ${mixDef.name} 🎵`);
      } else {
        showToast(`No tracks found for ${mixDef.name}`);
      }
    } catch (err) {
      console.error('Failed to play daily mix:', err);
      showToast(`Failed to load ${mixDef.name}`);
    } finally {
      setLoadingDailyMixId(null);
    }
  };

  const handlePlayRadioStation = async (station: typeof CURATED_RADIOS[0]) => {
    unlockAudioEngine();
    triggerAndroidHaptic('medium');
    showToast(`Tuning into ${station.name}... 📻`);
    try {
      const tracks = await searchTracks(station.query);
      if (tracks.length > 0) {
        playTrack(tracks[0], tracks, 0);
        showToast(`Tuned into ${station.name} ✨`);
      } else {
        showToast(`Unable to tune into ${station.name}`);
      }
    } catch (err) {
      console.error('Failed to play radio station:', err);
      showToast('Failed to load station');
    }
  };

  const handlePlayEra = async (eraItem: typeof ERA_DECINTERS[0]) => {
    unlockAudioEngine();
    triggerAndroidHaptic('medium');
    showToast(`Traveling to the ${eraItem.era}... ⏳`);
    try {
      const tracks = await searchTracks(eraItem.query);
      if (tracks.length > 0) {
        playTrack(tracks[0], tracks, 0);
        showToast(`Now Playing ${eraItem.title} 📼`);
      } else {
        showToast(`No tracks found for ${eraItem.era}`);
      }
    } catch (err) {
      console.error('Failed to play era tracks:', err);
      showToast(`Failed to load ${eraItem.era}`);
    }
  };

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
      <div className="mb-6 sm:mb-8 px-1 pt-1 flex flex-col gap-4 w-full min-w-0 max-w-full">
        <div className="w-full min-w-0 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
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
              <span className="text-white/80 font-semibold">Lossless Audio & Spatial 3D</span>
            </p>
          </div>

          {/* Quick Launch Today's Flow Mix CTA */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleLaunchTodayFlow}
              className="px-5 py-2.5 sm:px-6 sm:py-3 rounded-full glass-button-primary text-white font-black text-xs sm:text-sm flex items-center gap-2.5 shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>Play Today's Flow</span>
            </button>
          </div>
        </div>

        {/* Unified Discovery & Navigation Control Bar */}
        <div className="flex flex-col items-start md:flex-row md:items-center justify-between gap-3 pt-1 w-full min-w-0">
          {/* Category Filter Pills */}
          <div
            className="inline-flex items-center gap-1.5 p-1.5 rounded-full liquid-glass border-0 overflow-x-auto no-scrollbar w-fit max-w-full flex-shrink-0 self-start relative"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {FILTER_CHIPS.map((chip) => {
              const isSelected = activeFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    setActiveFilter(chip.id);
                  }}
                  className="relative px-3 sm:px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap flex items-center gap-1.5 justify-center cursor-pointer flex-shrink-0 select-none"
                >
                  {isSelected && (
                    <motion.div
                      layoutId="home-category-active-pill"
                      transition={{ type: 'spring', bounce: 0.15, duration: 0.32 }}
                      className="absolute inset-0 rounded-full liquid-sliding-pill -z-0 pointer-events-none"
                    />
                  )}
                  <span className="relative z-10 text-xs">{chip.icon}</span>
                  <span
                    className={`relative z-10 transition-colors duration-150 ${
                      isSelected
                        ? 'text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    {chip.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick Soundstage Telemetry & Studio Shortcuts */}
          <div
            className="flex items-center gap-2 overflow-x-auto no-scrollbar py-3 -my-2 px-1 w-full md:w-auto md:justify-end flex-shrink-0"
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

            {/* DJ Decks */}
            <button
              onClick={() => {
                triggerAndroidHaptic('medium');
                navigate('/dj');
              }}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.09] text-white/80 hover:text-white text-xs font-semibold transition-all cursor-pointer whitespace-nowrap border border-white/[0.08] hover:border-white/20 active:scale-95 shadow-sm flex-shrink-0"
              title="Open Dual-Deck DJ Console"
            >
              <span className="text-cyan-400 text-xs">🎛️</span>
              <span>DJ Decks</span>
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

      {/* ================= HERO SPOTLIGHT CAROUSEL ================= */}
      {(activeFilter === 'all' || activeFilter === 'music') && currentSpotlightTrack && (
        <section
          className="mb-10 px-1 w-full min-w-0 max-w-full relative"
          onMouseEnter={() => setIsSpotlightPaused(true)}
          onMouseLeave={() => setIsSpotlightPaused(false)}
        >
          {/* Atmospheric Horizon Glow */}
          <div
            className="absolute -top-24 inset-x-2 h-56 pointer-events-none blur-3xl opacity-35 -z-10 rounded-full"
            style={{
              background: `radial-gradient(ellipse 80% 55% at 50% 20%, var(--color-accent, #fa243c) 0%, rgba(168, 85, 247, 0.45) 45%, transparent 75%)`
            }}
          />

          <div className="relative rounded-3xl liquid-glass border-0 p-5 sm:p-7 shadow-xl shadow-black/25 overflow-hidden group w-full min-w-0">
            {/* Blurred Backdrop */}
            <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none z-0">
              {spotlightCoverArt && !spotlightArtFailed ? (
                <img
                  src={spotlightCoverArt}
                  alt=""
                  className="w-full h-full object-cover blur-3xl opacity-35 scale-125 transition-transform duration-1000 group-hover:scale-130"
                  onError={() => {
                    if (currentSpotlightTrack.thumbnail && spotlightCoverArt !== currentSpotlightTrack.thumbnail) {
                      setSpotlightCoverArt(currentSpotlightTrack.thumbnail);
                    } else {
                      setSpotlightArtFailed(true);
                    }
                  }}
                />
              ) : (
                <div
                  className="w-full h-full opacity-35 blur-3xl"
                  style={{
                    background: 'radial-gradient(ellipse 90% 80% at 30% 40%, var(--color-accent, #fa243c) 0%, #a855f7 45%, #06b6d4 100%)'
                  }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/35 to-transparent" />
            </div>

            <div className="relative z-10 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-5 sm:gap-6 w-full min-w-0">
              {/* Left Column: Hero Art & Info */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 min-w-0 flex-1 w-full">
                {/* Artwork Container with 3D Vinyl Sleeve Peeking */}
                <div className="relative flex-shrink-0 group/cover">
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-20 h-20 sm:w-28 sm:h-28 rounded-full vinyl-disc shadow-[0_8px_24px_rgba(0,0,0,0.8)] transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/cover:translate-x-6 sm:group-hover/cover:translate-x-8 pointer-events-none z-0">
                    <div className="absolute inset-0 m-auto w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-zinc-800 to-black border border-white/20 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-black border border-white/40" />
                    </div>
                  </div>

                  <div className="relative z-10 w-24 h-24 sm:w-32 sm:h-32 rounded-2xl overflow-hidden shadow-[0_16px_36px_rgba(0,0,0,0.7)] border-0 group-hover/cover:scale-[1.03] transition-transform duration-500 bg-black/40">
                    {spotlightCoverArt && !spotlightArtFailed ? (
                      <img
                        src={spotlightCoverArt}
                        alt={currentSpotlightTrack.title}
                        className="w-full h-full object-cover"
                        onError={() => {
                          if (currentSpotlightTrack.thumbnail && spotlightCoverArt !== currentSpotlightTrack.thumbnail) {
                            setSpotlightCoverArt(currentSpotlightTrack.thumbnail);
                          } else {
                            setSpotlightArtFailed(true);
                          }
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-rose-500/85 via-purple-600/85 to-indigo-700/85 flex flex-col items-center justify-center p-3 text-center relative overflow-hidden">
                        <span className="text-3xl sm:text-4xl mb-1 filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">🎵</span>
                        <span className="text-[10px] sm:text-xs font-black text-white/90 line-clamp-1 drop-shadow-md">
                          {currentSpotlightTrack.artist}
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />

                    {/* Equalizer Badge */}
                    <div className="absolute bottom-2 left-2 px-2 py-1 rounded-xl liquid-glass flex items-end gap-1 h-4.5 border-0 shadow-lg">
                      <span className="w-1 bg-[var(--color-accent)] rounded-full animate-[pulse_0.8s_ease-in-out_infinite] h-full" />
                      <span className="w-1 bg-[var(--color-accent)] rounded-full animate-[pulse_1.1s_ease-in-out_infinite] h-2/3" />
                      <span className="w-1 bg-[var(--color-accent)] rounded-full animate-[pulse_0.6s_ease-in-out_infinite] h-5/6" />
                    </div>
                  </div>
                </div>

                <div className="min-w-0 flex-1 w-full">
                  <div className="flex items-center gap-2 mb-2 flex-wrap min-w-0">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest glass-button text-[var(--color-accent)] shadow-sm flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse shadow-[0_0_8px_var(--color-accent)]" />
                      SPOTLIGHT #{spotlightIndex + 1}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full glass-button text-[10px] font-bold text-white/70 tracking-wider uppercase flex-shrink-0">
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
                      unlockAudioEngine();
                      playTrack(currentSpotlightTrack, spotlightTracks, spotlightIndex);
                    }}
                    className="text-2xl sm:text-3xl lg:text-4xl font-black text-white truncate tracking-tight leading-tight active:scale-[0.99] transition-transform cursor-pointer block max-w-full drop-shadow-sm"
                  >
                    {currentSpotlightTrack.title}
                  </h2>

                  <p
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      navigate(`/search?q=${encodeURIComponent(currentSpotlightTrack.artist)}`);
                    }}
                    className="text-sm sm:text-base text-white/75 truncate mt-1 font-semibold hover:text-white cursor-pointer transition-colors"
                  >
                    {currentSpotlightTrack.artist}
                  </p>

                  <p className="text-xs text-white/55 mt-1.5 line-clamp-1 max-w-lg hidden sm:block font-medium">
                    Pure lossless acoustics • Tap to play with ultra-low latency & zero buffering
                  </p>
                </div>
              </div>

              {/* Action Dock & Carousel Controls */}
              <div className="flex flex-col sm:flex-row xl:flex-col items-start xl:items-end gap-3 w-full xl:w-auto pt-2 xl:pt-0">
                <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap w-full xl:w-auto">
                  <button
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('medium');
                      unlockAudioEngine();
                      playTrack(currentSpotlightTrack, spotlightTracks, spotlightIndex);
                    }}
                    className="flex-1 sm:flex-none px-5 sm:px-6 py-2.5 sm:py-3 rounded-full glass-button-primary text-white font-black text-sm flex items-center justify-center gap-2 shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span>Play Mix Now</span>
                  </button>

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

                  <button
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      addToQueue(currentSpotlightTrack);
                      showToast(`Added "${currentSpotlightTrack.title}" to queue`);
                    }}
                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center glass-button text-white/80 hover:text-white cursor-pointer active:scale-90 transition-all flex-shrink-0"
                    title="Add to queue"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('medium');
                      toggleLike(currentSpotlightTrack);
                      showToast(likedIds[currentSpotlightTrack.id] ? 'Removed from Liked Songs' : 'Saved to Liked Songs');
                    }}
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 flex-shrink-0 ${
                      likedIds[currentSpotlightTrack.id]
                        ? 'glass-button-primary text-[var(--color-accent)]'
                        : 'glass-button text-white/70 hover:text-white'
                    }`}
                    title={likedIds[currentSpotlightTrack.id] ? 'Liked' : 'Like'}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill={likedIds[currentSpotlightTrack.id] ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      triggerAndroidHaptic('light');
                      useContextMenuStore.getState().openTrackMenu(
                        { clientX: e.clientX, clientY: e.clientY },
                        currentSpotlightTrack,
                        spotlightTracks
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

                {/* Carousel Navigation Indicators */}
                {spotlightTracks.length > 1 && (
                  <div className="flex items-center gap-2 pt-1 self-end">
                    <button
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        setSpotlightIndex((prev) => (prev - 1 + spotlightTracks.length) % spotlightTracks.length);
                      }}
                      className="w-8 h-8 rounded-full glass-button text-white/70 hover:text-white flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                      title="Previous Spotlight"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>

                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full liquid-glass">
                      {spotlightTracks.map((_, dotIdx) => (
                        <button
                          key={dotIdx}
                          type="button"
                          onClick={() => {
                            triggerAndroidHaptic('light');
                            setSpotlightIndex(dotIdx);
                          }}
                          className={`h-1.5 rounded-full transition-all cursor-pointer ${
                            dotIdx === spotlightIndex
                              ? 'w-6 bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)]'
                              : 'w-1.5 bg-white/30 hover:bg-white/60'
                          }`}
                          title={`Slide ${dotIdx + 1}`}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        setSpotlightIndex((prev) => (prev + 1) % spotlightTracks.length);
                      }}
                      className="w-8 h-8 rounded-full glass-button text-white/70 hover:text-white flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                      title="Next Spotlight"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                )}
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

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
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
                  className={`group relative flex items-center gap-2.5 sm:gap-3 p-2 sm:p-2.5 rounded-2xl liquid-glass border-0 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-lg overflow-hidden active:scale-[0.98] ${
                    isThisPlaying
                      ? 'ring-1 ring-[var(--color-accent)]/50 shadow-[0_8px_24px_rgba(0,0,0,0.4),0_0_20px_rgba(250,45,72,0.25)]'
                      : 'hover:brightness-110'
                  }`}
                >
                  <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/12 to-transparent pointer-events-none" />

                  <div className="relative w-12 h-12 sm:w-13 sm:h-13 rounded-xl overflow-hidden flex-shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.4)] bg-white/5">
                    <img
                      src={track.thumbnail || DEFAULT_THUMBNAIL}
                      alt={track.title}
                      loading="eager"
                      decoding="async"
                      onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
                      className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-500 relative z-[1]"
                    />

                    {isThisPlaying && isPlaying ? (
                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/85 backdrop-blur-md flex items-end gap-0.5 h-3.5 shadow-md border-0 pointer-events-none z-[2]">
                        <span className="w-0.5 bg-[var(--color-accent)] rounded-full animate-[pulse_0.7s_ease-in-out_infinite] h-full" />
                        <span className="w-0.5 bg-[var(--color-accent)] rounded-full animate-[pulse_1.0s_ease-in-out_infinite] h-3/5" />
                        <span className="w-0.5 bg-[var(--color-accent)] rounded-full animate-[pulse_0.5s_ease-in-out_infinite] h-4/5" />
                      </div>
                    ) : (
                      <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-[2]">
                        <div className="w-7 h-7 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center shadow-lg scale-90 group-hover:scale-100 transition-transform">
                          <svg className="w-3.5 h-3.5 ml-0.5 fill-current" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 pr-1 sm:pr-2">
                    <div className="flex items-center gap-1.5">
                      <h4 className={`text-xs sm:text-sm font-bold truncate leading-snug transition-colors ${
                        isThisPlaying ? 'text-[var(--color-accent)]' : 'text-white group-hover:text-[var(--color-accent)]'
                      }`}>
                        {track.title}
                      </h4>
                      {isThisPlaying && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse flex-shrink-0" />
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

      {/* ================= MADE FOR YOU (SMART PLAYLISTS & DAILY MIXES) ================= */}
      {(activeFilter === 'all' || activeFilter === 'for_you') && (
        <HorizontalScroll
          title="Made For You"
          subtitle="Dynamic personalized mixes generated from your acoustic taste"
          actionButton={
            <button
              type="button"
              onClick={() => {
                triggerAndroidHaptic('light');
                navigate('/library');
              }}
              className="text-xs text-[var(--color-accent)] font-bold hover:underline cursor-pointer"
            >
              See Library
            </button>
          }
        >
          {/* Smart Computed Playlists */}
          {smartPlaylists.map((pl) => (
            <div
              key={pl.id}
              onClick={() => handlePlaySmartPlaylist(pl, false)}
              className="min-w-[200px] max-w-[200px] sm:min-w-[230px] sm:max-w-[230px] flex-shrink-0 snap-start rounded-3xl p-4.5 liquid-glass border-0 flex flex-col justify-between group cursor-pointer relative overflow-hidden active:scale-[0.98] transition-all duration-300 shadow-md hover:shadow-xl"
              style={{
                background: `linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0.65) 100%)`
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-transparent pointer-events-none" />

              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl p-2 rounded-2xl bg-white/10 backdrop-blur-md shadow-sm">
                    {pl.icon}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/10 text-white/90">
                    {pl.badge}
                  </span>
                </div>

                <h3 className="font-extrabold text-sm sm:text-base text-white group-hover:text-[var(--color-accent)] transition-colors line-clamp-1">
                  {pl.name}
                </h3>
                <p className="text-[11px] text-white/60 line-clamp-2 mt-1 font-medium leading-relaxed">
                  {pl.description}
                </p>
              </div>

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10">
                <span className="text-[10px] font-bold text-white/50">
                  {pl.tracks?.length || 0} tracks
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlaySmartPlaylist(pl, true);
                    }}
                    className="w-8 h-8 rounded-full glass-button text-white/80 hover:text-white flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                    title="Shuffle Mix"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polyline points="16 3 21 3 21 8" />
                      <line x1="4" y1="20" x2="21" y2="3" />
                      <polyline points="21 16 21 21 16 21" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlaySmartPlaylist(pl, false);
                    }}
                    className="w-8 h-8 rounded-full glass-button-primary text-white flex items-center justify-center active:scale-90 transition-all cursor-pointer shadow-md"
                    title="Play Mix"
                  >
                    <svg className="w-3.5 h-3.5 ml-0.5 fill-current" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Daily Thematic Mixes */}
          {DAILY_MIX_DEFINITIONS.map((mix) => (
            <div
              key={mix.id}
              onClick={() => handlePlayDailyMix(mix)}
              className="min-w-[200px] max-w-[200px] sm:min-w-[230px] sm:max-w-[230px] flex-shrink-0 snap-start rounded-3xl p-4.5 liquid-glass border-0 flex flex-col justify-between group cursor-pointer relative overflow-hidden active:scale-[0.98] transition-all duration-300 shadow-md hover:shadow-xl"
              style={{
                background: `linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0.65) 100%)`
              }}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl p-2 rounded-2xl bg-white/10 backdrop-blur-md shadow-sm">
                    {mix.icon}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-[var(--color-accent)]/20 text-[var(--color-accent)]">
                    {mix.badge}
                  </span>
                </div>

                <h3 className="font-extrabold text-sm sm:text-base text-white group-hover:text-[var(--color-accent)] transition-colors">
                  {mix.name}
                </h3>
                <p className="text-[11px] text-white/60 line-clamp-2 mt-1 font-medium leading-relaxed">
                  {mix.sub}
                </p>
              </div>

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10">
                <span className="text-[10px] font-extrabold text-cyan-300 tracking-wider uppercase">
                  {mix.tag}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlayDailyMix(mix);
                  }}
                  className="w-8 h-8 rounded-full glass-button-primary text-white flex items-center justify-center active:scale-90 transition-all cursor-pointer shadow-md"
                  title={`Play ${mix.name}`}
                >
                  {loadingDailyMixId === mix.id ? (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5 ml-0.5 fill-current" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          ))}
        </HorizontalScroll>
      )}

      {/* ================= GLOBAL CHARTS & CITY PULSE ================= */}
      {(activeFilter === 'all' || activeFilter === 'charts') && (
        <section className="mb-10 px-1">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <span>Global Charts & Pulse</span>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/20">
                  Spotify Verified
                </span>
              </h2>
              <p className="text-xs text-white/50 mt-0.5">Top stream rankings updated hourly across global markets</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {CURATED_CHARTS.map((chart) => {
              const isChartActive = activeTrendingCategory === chart.key;
              const isChartLoading = playingChartKey === chart.key;
              return (
                <div
                  key={chart.key}
                  onClick={() => handlePlayChart(chart.key, chart.name)}
                  className={`group relative p-3.5 rounded-2xl liquid-glass border transition-all duration-300 cursor-pointer overflow-hidden flex flex-col justify-between active:scale-[0.98] ${
                    isChartActive
                      ? 'ring-2 ring-emerald-400 border-transparent shadow-[0_8px_25px_rgba(16,185,129,0.35)]'
                      : `${chart.border} hover:border-white/30`
                  }`}
                  style={{
                    background: `linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.7) 100%)`
                  }}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xl">{chart.icon}</span>
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-white/80">
                        {chart.badge}
                      </span>
                    </div>
                    <h4 className="font-extrabold text-xs sm:text-sm text-white group-hover:text-emerald-300 transition-colors line-clamp-1">
                      {chart.name}
                    </h4>
                    <p className="text-[10px] text-white/55 line-clamp-2 mt-1 leading-snug">
                      {chart.sub}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/10">
                    <span className="text-[10px] font-bold text-emerald-400">
                      {isChartLoading ? (
                        <span className="flex items-center gap-1 text-emerald-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Loading...
                        </span>
                      ) : isChartActive && isPlaying ? (
                        <span className="flex items-center gap-1 text-emerald-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Playing
                        </span>
                      ) : isChartActive ? (
                        'Active Chart'
                      ) : (
                        'Play Chart'
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handlePlayChart(chart.key, chart.name, e)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md ${
                        isChartActive
                          ? 'bg-emerald-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                          : 'bg-white/10 text-white/80 group-hover:bg-emerald-500 group-hover:text-black'
                      }`}
                      title={`Play ${chart.name}`}
                    >
                      {isChartLoading ? (
                        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3.5 h-3.5 fill-current ml-0.5" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ================= TRENDING HIT CHARTS ================= */}
      {(activeFilter === 'all' || activeFilter === 'music' || activeFilter === 'charts') && (
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

      {/* ================= 24/7 CURATED RADIOS & LIVE STREAMS ================= */}
      {(activeFilter === 'all' || activeFilter === 'radios') && (
        <HorizontalScroll
          title="24/7 Endless Radios"
          subtitle="Non-stop atmospheric live flows with smart auto-recommendation stream"
        >
          {CURATED_RADIOS.map((radio) => (
            <div
              key={radio.id}
              onClick={() => handlePlayRadioStation(radio)}
              className="min-w-[210px] max-w-[210px] sm:min-w-[240px] sm:max-w-[240px] flex-shrink-0 snap-start rounded-3xl p-4.5 liquid-glass border-0 flex flex-col justify-between group cursor-pointer relative overflow-hidden active:scale-[0.98] transition-all duration-300 shadow-md hover:shadow-xl"
              style={{
                background: `linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0.7) 100%)`
              }}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl p-2 rounded-2xl bg-white/10 backdrop-blur-md shadow-sm">
                    {radio.icon}
                  </span>
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                    LIVE FLOW
                  </span>
                </div>

                <h3 className="font-extrabold text-sm sm:text-base text-white group-hover:text-[var(--color-accent)] transition-colors">
                  {radio.name}
                </h3>
                <p className="text-[11px] text-white/60 line-clamp-2 mt-1 font-medium leading-relaxed">
                  {radio.desc}
                </p>
              </div>

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10">
                <span className="text-[10px] font-extrabold text-amber-300 tracking-wider uppercase">
                  {radio.tag}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlayRadioStation(radio);
                  }}
                  className="px-3 py-1.5 rounded-full glass-button-primary text-white text-xs font-black flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-md"
                >
                  <span>Tune In</span>
                  <svg className="w-3 h-3 fill-current ml-0.5" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </HorizontalScroll>
      )}

      {/* ================= DECADE & ERA TIME MACHINE ================= */}
      {(activeFilter === 'all' || activeFilter === 'eras') && (
        <section className="mb-10 px-1">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <span>Decade Time Machine</span>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 font-bold border border-purple-500/20">
                  Era Classics
                </span>
              </h2>
              <p className="text-xs text-white/50 mt-0.5">Travel through 50 years of timeless acoustic history</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {ERA_DECINTERS.map((era) => (
              <div
                key={era.era}
                onClick={() => handlePlayEra(era)}
                className="group relative p-4 rounded-3xl liquid-glass border border-white/10 hover:border-white/30 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col justify-between active:scale-[0.98] shadow-md hover:shadow-xl"
                style={{
                  background: `linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0.75) 100%)`
                }}
              >
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-2xl p-2 rounded-2xl bg-white/10">{era.icon}</span>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/10 text-white/80">
                      {era.tag}
                    </span>
                  </div>

                  <h3 className="font-extrabold text-sm sm:text-base text-white group-hover:text-[var(--color-accent)] transition-colors">
                    {era.title}
                  </h3>
                  <p className="text-[11px] text-white/55 line-clamp-2 mt-1 leading-snug">
                    {era.artists}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
                  <span className="text-xs font-black text-[var(--color-accent)] tracking-wider">
                    {era.era} ERA
                  </span>
                  <div className="w-7 h-7 rounded-full glass-button-primary text-white flex items-center justify-center active:scale-90 transition-transform">
                    <svg className="w-3.5 h-3.5 fill-current ml-0.5" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ================= 3D SONIC GALAXY OBSERVATORY PORTAL BANNER ================= */}
      {(activeFilter === 'all' || activeFilter === 'music') && (
        <section className="mb-10 px-1 w-full min-w-0 max-w-full relative">
          <div
            className="absolute -inset-x-4 -inset-y-3 rounded-3xl pointer-events-none blur-3xl opacity-35 -z-10"
            style={{
              background: 'radial-gradient(ellipse 85% 70% at 50% 50%, rgba(139, 92, 246, 0.18) 0%, rgba(6, 182, 212, 0.12) 60%, transparent 80%)'
            }}
          />

          <div className="relative rounded-3xl liquid-glass border-0 p-5 sm:p-7 shadow-xl shadow-black/25 overflow-hidden group w-full min-w-0">
            <div className="absolute inset-x-12 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none z-10" />

            <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none z-0">
              <div className="absolute inset-0 bg-[#06060b]/75 backdrop-blur-3xl" />
              <div className="absolute inset-0 bg-gradient-to-r from-white/[0.025] via-transparent to-white/[0.025]" />
              <div
                className="absolute inset-0 opacity-30 blur-3xl"
                style={{
                  background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(139, 92, 246, 0.18) 0%, rgba(6, 182, 212, 0.12) 50%, transparent 75%)'
                }}
              />
            </div>

            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6 w-full min-w-0">
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

                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
                  Navigate Your Music Universe in 3D Space
                </h2>

                <p className="text-xs sm:text-sm text-white/70 mt-2 font-medium leading-relaxed">
                  Experience your taste across 3 celestial formations — 3D Constellations, Taste Radar & Logarithmic Spiral Galaxy. Orbit audio-reactive star coronas and relativistic accretion cores.
                </p>

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
                    onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
                    className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-500 ease-out relative z-[1]"
                  />
                  <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent pointer-events-none z-[2]" />

                  {isPlayingThis && isPlaying ? (
                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md flex items-end gap-0.5 h-3.5 shadow-md border-0 pointer-events-none">
                      <span className="w-0.5 bg-[var(--color-accent)] rounded-full animate-[pulse_0.7s_ease-in-out_infinite] h-full" />
                      <span className="w-0.5 bg-[var(--color-accent)] rounded-full animate-[pulse_1.0s_ease-in-out_infinite] h-3/5" />
                      <span className="w-0.5 bg-[var(--color-accent)] rounded-full animate-[pulse_0.5s_ease-in-out_infinite] h-4/5" />
                    </div>
                  ) : (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 hidden sm:flex items-center justify-center pointer-events-none">
                      <div className="w-11 h-11 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.5)] scale-90 translate-y-2 group-hover:scale-100 group-hover:translate-y-0 transition-all duration-300">
                        <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  )}

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

      {/* ================= FEATURED ARTISTS ================= */}
      {(activeFilter === 'all' || activeFilter === 'music') && (
        <HorizontalScroll title="Featured Artists" subtitle="Top icons and creators defining music today">
          {FEATURED_ARTISTS.map((artist, i) => (
            <div
              key={artist.id}
              onClick={() => {
                triggerAndroidHaptic('light');
                navigate(`/search?q=${encodeURIComponent(artist.name)}`);
              }}
              className="min-w-[130px] max-w-[130px] sm:min-w-[155px] sm:max-w-[155px] flex-shrink-0 snap-start flex flex-col items-center text-center group cursor-pointer"
            >
              <div className="w-28 h-28 sm:w-34 sm:h-34 rounded-full overflow-hidden mb-2.5 relative bg-white/10 shadow-lg border-0 ring-2 ring-white/10 group-hover:ring-[var(--color-accent)]/60 group-hover:shadow-[0_0_25px_rgba(250,45,72,0.35)] transition-all duration-300">
                <div className="absolute inset-0 flex items-center justify-center text-white/15 pointer-events-none">
                  <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                </div>
                <img
                  src={artist.avatar}
                  alt={artist.name}
                  loading={i < 8 ? 'eager' : 'lazy'}
                  decoding="async"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                  }}
                  className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-500 ease-out relative z-[1]"
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
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                  <span>All Moods & Activities</span>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/10 text-white/70 border border-white/15 font-semibold">
                    Personalized Mixes
                  </span>
                </h2>
                <p className="text-xs text-white/55 mt-0.5 font-medium">{timePhaseSubtitle}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {moodCardsData.map((data) => (
                <MoodCard
                  key={data.mood.id}
                  mood={data.mood}
                  relativityScore={data.relativityScore}
                  isTopRecommendation={data.isTopRecommendation}
                  contextBadge={data.contextBadge}
                  personalizedQuery={data.personalizedQuery}
                  personalizedArtist={data.personalizedArtist}
                  isNowPlayingMatch={data.isNowPlayingMatch}
                  isMoodLoading={loadingMoodId === data.mood.id}
                  isMoodActive={activeMoodId === data.mood.id}
                  isPlaying={isPlaying}
                  onPlay={handlePlayMood}
                  onQueue={handleQueueMood}
                  onShuffle={handleShuffleMood}
                  isGrid={true}
                />
              ))}
            </div>
          </section>
        ) : (
          <HorizontalScroll title="Moods & Activities" subtitle={timePhaseSubtitle}>
            {moodCardsData.map((data) => (
              <MoodCard
                key={data.mood.id}
                mood={data.mood}
                relativityScore={data.relativityScore}
                isTopRecommendation={data.isTopRecommendation}
                contextBadge={data.contextBadge}
                personalizedQuery={data.personalizedQuery}
                personalizedArtist={data.personalizedArtist}
                isNowPlayingMatch={data.isNowPlayingMatch}
                isMoodLoading={loadingMoodId === data.mood.id}
                isMoodActive={activeMoodId === data.mood.id}
                isPlaying={isPlaying}
                onPlay={handlePlayMood}
                onQueue={handleQueueMood}
                onShuffle={handleShuffleMood}
                isGrid={false}
              />
            ))}
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
              {newReleases.map((album, i) => (
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
                      loading={i < 8 ? 'eager' : 'lazy'}
                      decoding="async"
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                      onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
                      className="w-full h-full object-cover relative z-[1]"
                    />
                    <button
                      type="button"
                      onClick={(e) => handlePlayAlbum(album, e)}
                      className="absolute bottom-2 right-2 w-10 h-10 rounded-full glass-button-primary text-white flex items-center justify-center shadow-lg active:scale-90 transition-transform cursor-pointer z-10"
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
              : newReleases.map((album, i) => (
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
                        loading={i < 8 ? 'eager' : 'lazy'}
                        decoding="async"
                        referrerPolicy="no-referrer"
                        crossOrigin="anonymous"
                        onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL; }}
                        className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-500 ease-out relative z-[1]"
                      />
                      <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent pointer-events-none z-[2]" />

                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-[3]">
                        <button
                          type="button"
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
