import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  searchTracks,
  getCachedSearch,
  getTrending,
  getCachedTrending
} from '../../services/youtube';
import { searchAlbums, searchArtists, getAlbumTracks } from '../../services/itunes';
import { playTrackWithSmartQueue } from '../../services/recommendationEngine';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { unlockAudioEngine } from '../player/YouTubeEmbed';
import GlassCard from '../ui/GlassCard';
import TrackRow from '../ui/TrackRow';
import Skeleton from '../ui/Skeleton';
import GenreBrowser from './GenreBrowser';
import { PlaylistArtwork } from '../library/PlaylistCard';
import { DEFAULT_THUMBNAIL, MOOD_PLAYLISTS } from '../../utils/constants';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { useSearchHistory } from '../../utils/searchHistory';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import type { Track, AlbumResult, ArtistResult } from '../../types';

const FALLBACK_LIVE_POOL = [
  'Die With A Smile - Bruno Mars & Lady Gaga',
  'Timeless - The Weeknd & Playboi Carti',
  'Arijit Singh Soul Hits',
  'Anirudh Ravichander Mass Anthems',
  'APT. - ROSÉ & Bruno Mars',
  'Birds of a Feather - Billie Eilish',
  'Espresso - Sabrina Carpenter',
  'Aaj Ki Raat - Stree 2',
  'Chuttamalle - Devara',
  'Tauba Tauba - Karan Aujla',
  'Travis Scott - FE!N',
  'AR Rahman Masterpieces',
  'Taylor Swift - Cruel Summer',
  'Kendrick Lamar - Not Like Us',
  'Dua Lipa - Houdini',
  'Coldplay - Viva La Vida',
  'Diljit Dosanjh - Born to Shine',
  'Shreya Ghoshal Melodies',
  'Post Malone - I Had Some Help',
  'Imagine Dragons - Bones'
];

const INSPIRATION_TAGS = [
  { label: '🔥 Global Top 50', query: 'global top 50 viral hits' },
  { label: '✨ Late Night Vibes', query: 'late night vibes the weeknd chill' },
  { label: '⚡ High-Octane Gym', query: 'high energy gym motivation phonk' },
  { label: '🌧️ Rainy Lo-Fi', query: 'lofi hip hop rain chill beats' },
  { label: '🎬 Anirudh Wave', query: 'anirudh ravichander hit songs' },
  { label: '🎤 Arijit Soul', query: 'arijit singh romantic melody hits' },
  { label: '🌙 The Weeknd Hitlist', query: 'the weeknd popular hits' },
  { label: '🎸 Rock Legends', query: 'rock classics queen acdc' },
  { label: '💃 Bollywood Dance', query: 'bollywood party dance songs' }
];

function buildInitialTrendingPool(): string[] {
  const cached = getCachedTrending();
  if (cached && cached.length > 0) {
    const items: string[] = [];
    for (const t of cached) {
      if (t.title && !items.includes(t.title)) items.push(t.title);
      const primaryArtist = t.artist?.split(',')[0]?.trim();
      if (primaryArtist && primaryArtist !== 'Unknown Artist' && !items.includes(primaryArtist)) {
        items.push(primaryArtist);
      }
      if (items.length >= 12) break;
    }
    if (items.length >= 8) return items.slice(0, 12);
  }
  const minuteBucket = Math.floor(Date.now() / 60000);
  const rotated = [...FALLBACK_LIVE_POOL];
  const offset = minuteBucket % rotated.length;
  return [...rotated.slice(offset), ...rotated.slice(0, offset)].slice(0, 12);
}

const formatDuration = (seconds?: number) => {
  if (!seconds || isNaN(seconds)) return '3:30';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function SearchResults() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';

  const { history, removeSearchTerm, clearSearchHistory, saveSearchTerm } = useSearchHistory();
  const libraryPlaylists = useLibraryStore((state) => state.playlists);
  const likedSongs = useLibraryStore((state) => state.likedSongs);
  const toggleLike = useLibraryStore((state) => state.toggleLike);

  const [activeTab, setActiveTab] = useState<'all' | 'songs' | 'artists' | 'playlists' | 'albums'>('all');
  const [tracks, setTracks] = useState<Track[]>(() => (query ? getCachedSearch(query) || [] : []));
  const [albums, setAlbums] = useState<AlbumResult[]>([]);
  const [artists, setArtists] = useState<ArtistResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(query && !getCachedSearch(query)));

  // Player Store
  const currentTrackId = usePlayerStore((state) => state.currentTrack?.id);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const playTrack = usePlayerStore((state) => state.playTrack);
  const addToQueue = usePlayerStore((state) => state.addToQueue);

  // Live Trending Searches state
  const [trendingTerms, setTrendingTerms] = useState<string[]>(buildInitialTrendingPool);
  const [allLiveTerms, setAllLiveTerms] = useState<string[]>(FALLBACK_LIVE_POOL);
  const [isRefreshingTrends, setIsRefreshingTrends] = useState(false);

  // Selected Album View state
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumResult | null>(null);
  const [albumTracks, setAlbumTracks] = useState<Track[]>([]);
  const [isAlbumLoading, setIsAlbumLoading] = useState<boolean>(false);

  const matchingPlaylists = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const libMatches = libraryPlaylists
      .filter((p) => p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q)))
      .map((p) => ({
        id: p.id,
        name: p.name,
        type: 'library' as const,
        trackCount: p.tracks?.length || 0,
        coverUrl: p.coverUrl || p.tracks?.[0]?.thumbnail || DEFAULT_THUMBNAIL,
        colorClass: '',
        emoji: '',
        subtitle: `${p.tracks?.length || 0} tracks`,
        query: ''
      }));
    const moodMatches = MOOD_PLAYLISTS
      .filter((m) => m.name.toLowerCase().includes(q) || (m.sub && m.sub.toLowerCase().includes(q)) || (m.query && m.query.toLowerCase().includes(q)))
      .map((m) => ({
        id: m.id,
        name: m.name,
        type: 'curated' as const,
        trackCount: 0,
        coverUrl: '',
        colorClass: m.colorClass,
        emoji: m.emoji,
        subtitle: m.sub,
        query: m.query || m.searchQuery
      }));
    return [...libMatches, ...moodMatches];
  }, [query, libraryPlaylists]);

  const fetchLiveTrendingSearches = useCallback(async (rotateOffset?: number) => {
    setIsRefreshingTrends(true);
    try {
      const ytTrending = await getTrending().catch(() => [] as Track[]);
      const discovered: string[] = [];
      const addTerm = (raw?: string) => {
        if (!raw) return;
        const clean = raw
          .replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ')
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, ' ')
          .trim();
        if (
          clean.length >= 3 &&
          clean.length <= 36 &&
          !/unknown|wavecraft/i.test(clean) &&
          !discovered.some((d) => d.toLowerCase() === clean.toLowerCase())
        ) {
          discovered.push(clean);
        }
      };

      if (Array.isArray(ytTrending)) {
        for (const t of ytTrending) {
          addTerm(t.title);
          const firstArtist = t.artist?.split(/[,&/]/)[0]?.trim();
          addTerm(firstArtist);
        }
      }

      for (const fallback of FALLBACK_LIVE_POOL) {
        addTerm(fallback);
      }

      setAllLiveTerms(discovered);
      const start =
        rotateOffset !== undefined
          ? rotateOffset % Math.max(1, discovered.length)
          : Math.floor(Date.now() / 45000) % Math.max(1, discovered.length);
      const rotated = [...discovered.slice(start), ...discovered.slice(0, start)].slice(0, 12);
      setTrendingTerms(rotated);
    } catch {
      // keep existing pool
    } finally {
      setIsRefreshingTrends(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveTrendingSearches();
    let tick = 1;
    const interval = setInterval(() => {
      tick += 4;
      setAllLiveTerms((pool) => {
        if (pool.length > 10) {
          const offset = tick % pool.length;
          const nextSlice = [...pool.slice(offset), ...pool.slice(0, offset)].slice(0, 12);
          setTrendingTerms(nextSlice);
        }
        return pool;
      });
    }, 35000);
    return () => clearInterval(interval);
  }, [fetchLiveTrendingSearches]);

  const handleCycleLiveTrends = () => {
    const randomOffset = Math.floor(Math.random() * Math.max(10, allLiveTerms.length));
    if (allLiveTerms.length > 12) {
      const nextSlice = [
        ...allLiveTerms.slice(randomOffset),
        ...allLiveTerms.slice(0, randomOffset)
      ].slice(0, 12);
      setTrendingTerms(nextSlice);
    }
    fetchLiveTrendingSearches(randomOffset);
  };

  useEffect(() => {
    const clean = query.trim();
    setSelectedAlbum(null);
    setAlbumTracks([]);

    if (!clean) {
      setTracks([]);
      setAlbums([]);
      setArtists([]);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const cached = getCachedSearch(clean);
    if (cached) {
      setTracks(cached);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    searchTracks(clean)
      .then((tracksData) => {
        if (isMounted) {
          setTracks(tracksData);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setIsLoading(false);
      });

    searchAlbums(clean)
      .then((albumsData) => {
        if (isMounted) setAlbums(albumsData);
      })
      .catch(() => {});

    searchArtists(clean)
      .then((artistsData) => {
        if (isMounted) setArtists(artistsData);
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [query]);

  const handlePlayTrack = useCallback((track: Track) => {
    unlockAudioEngine();
    playTrackWithSmartQueue(track);
  }, []);

  const handlePlayAlbumTrack = useCallback(
    (t: Track) => {
      unlockAudioEngine();
      setAlbumTracks((currentAlbumTracks) => {
        const idx = currentAlbumTracks.findIndex((track) => track.id === t.id);
        playTrack(t, currentAlbumTracks, idx >= 0 ? idx : 0);
        return currentAlbumTracks;
      });
    },
    [playTrack]
  );

  const handleOpenAlbum = async (album: AlbumResult, autoPlayFirst = false) => {
    if (autoPlayFirst) {
      unlockAudioEngine();
    }
    setSelectedAlbum(album);
    setIsAlbumLoading(true);
    try {
      const loaded = await getAlbumTracks(album);
      setAlbumTracks(loaded);
      if (autoPlayFirst && loaded.length > 0) {
        playTrack(loaded[0], loaded, 0);
      }
    } finally {
      setIsAlbumLoading(false);
    }
  };

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      unlockAudioEngine();
      playTrack(tracks[0], tracks, 0);
    }
  };

  const handleShuffleAll = () => {
    if (tracks.length > 0) {
      unlockAudioEngine();
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      playTrack(shuffled[0], shuffled, 0);
    }
  };

  const handleQuickSearch = (term: string) => {
    saveSearchTerm(term);
    setSelectedAlbum(null);
    setActiveTab('all');
    setSearchParams({ q: term });
  };

  const handlePlayTrendingTerm = async (term: string) => {
    try {
      unlockAudioEngine();
      saveSearchTerm(term);
      const results = await searchTracks(term);
      if (results.length > 0) {
        playTrackWithSmartQueue(results[0]);
      } else {
        handleQuickSearch(term);
      }
    } catch {
      handleQuickSearch(term);
    }
  };

  const getRankStyle = (rank: number) => {
    if (rank === 1) {
      return {
        badge: '01',
        label: '🔥 #1 Viral',
        textStyle: 'text-amber-400 font-black drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]',
        bgBadge: 'bg-amber-400/20 text-amber-300 border-amber-400/40'
      };
    }
    if (rank === 2) {
      return {
        badge: '02',
        label: '⚡ Chart Peak',
        textStyle: 'text-slate-200 font-black drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]',
        bgBadge: 'bg-slate-200/20 text-slate-200 border-slate-300/30'
      };
    }
    if (rank === 3) {
      return {
        badge: '03',
        label: '✨ Top 3',
        textStyle: 'text-amber-600 font-black drop-shadow-[0_0_8px_rgba(217,119,6,0.5)]',
        bgBadge: 'bg-amber-600/20 text-amber-300 border-amber-600/30'
      };
    }
    return {
      badge: rank < 10 ? `0${rank}` : `${rank}`,
      label: rank <= 6 ? '📈 Fast Velocity' : '🎵 Trending',
      textStyle: 'text-white/40 font-bold',
      bgBadge: 'bg-white/10 text-white/70 border-white/10'
    };
  };

  const topTrack = tracks[0];
  const isTopPlaying = Boolean(currentTrackId && topTrack && currentTrackId === topTrack.id && isPlaying);
  const isTopLiked = topTrack ? likedSongs.some((t) => t.id === topTrack.id) : false;

  const tabs: Array<{ id: 'all' | 'songs' | 'artists' | 'playlists' | 'albums'; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'songs', label: `Songs (${tracks.length})` },
    { id: 'artists', label: `Artists (${artists.length})` },
    { id: 'albums', label: `Albums (${albums.length})` },
    { id: 'playlists', label: `Playlists (${matchingPlaylists.length})` }
  ];

  return (
    <div className="flex flex-col gap-6 pb-48 sm:pb-32 pt-1 px-1 sm:px-4 text-white max-w-full">
      {/* ============================================================== */}
      {/* EMPTY DISCOVER STATE (!query.trim())                           */}
      {/* ============================================================== */}
      {!query.trim() ? (
        <div className="space-y-10">
          {/* Search & Discover Header with Quick Vibe Inspiration Chips */}
          <div className="space-y-4 pt-1">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
                  <span className="text-[11px] font-black uppercase tracking-widest text-[var(--color-accent)]">
                    Explore Music
                  </span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">Search & Discover</h1>
                <p className="text-sm text-white/60 mt-1">
                  Type any song title, artist, lyric line, or soundscape into the top search bar
                </p>
              </div>
            </div>

            {/* Quick Inspiration Tags Strip */}
            <div
              className="flex items-center gap-2 overflow-x-auto overflow-y-hidden no-scrollbar py-2.5 px-1"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <span className="text-[10px] font-black uppercase tracking-wider text-white/40 flex-shrink-0">
                Quick Vibes:
              </span>
              {INSPIRATION_TAGS.map((tag) => (
                <button
                  key={tag.label}
                  onClick={() => handleQuickSearch(tag.query)}
                  className="px-3.5 py-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border-0 text-xs font-semibold text-white/80 hover:text-white transition-all cursor-pointer flex-shrink-0 whitespace-nowrap active:scale-95"
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recent Search History with Smooth Clear */}
          {history.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🕒</span>
                  <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">Recent Searches</h2>
                </div>
                <button
                  type="button"
                  onClick={() => clearSearchHistory()}
                  className="px-3 py-1 rounded-full text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)]/15 font-bold cursor-pointer transition-colors"
                >
                  Clear All
                </button>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {history.map((term) => (
                  <div
                    key={term}
                    className="flex items-center gap-2 pl-4 pr-2.5 py-2 rounded-full liquid-glass border-0 text-xs font-bold text-white/90 hover:text-white group cursor-pointer transition-all shadow-md active:scale-95"
                    onClick={() => handleQuickSearch(term)}
                  >
                    <svg className="w-3.5 h-3.5 text-white/40 group-hover:text-white/80 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>{term}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSearchTerm(term);
                      }}
                      className="w-4.5 h-4.5 ml-1 rounded-full hover:bg-white/20 flex items-center justify-center text-white/40 hover:text-white transition-colors"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Editorial Live Trending Streaming Charts Countdown (01 to 10) */}
          <section className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  <span className="text-[11px] font-black uppercase tracking-widest text-rose-400">
                    Live Velocity
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight">Trending Charts Countdown</h2>
                <p className="text-white/60 text-xs sm:text-sm mt-0.5">
                  Real-time streaming charts updated live across global and regional trends
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={handleCycleLiveTrends}
                  className="px-4 py-2 rounded-full glass-button text-xs font-bold text-white/90 hover:text-white flex items-center gap-2 cursor-pointer shadow-md"
                  title="Rotate trending suggestions"
                >
                  <span className={isRefreshingTrends ? 'animate-spin inline-block' : ''}>↻</span>
                  <span>Rotate Trends</span>
                </button>
              </div>
            </div>

            {/* Countdown Grid: 10 High-Impact Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-3.5">
              {trendingTerms.slice(0, 10).map((term, idx) => {
                const rank = idx + 1;
                const { badge, label, textStyle, bgBadge } = getRankStyle(rank);

                return (
                  <motion.div
                    key={`${term}-${rank}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    onClick={() => handleQuickSearch(term)}
                    className="group relative flex items-center justify-between gap-4 p-3.5 sm:p-4 rounded-2xl liquid-glass border-0 hover:bg-white/[0.08] hover:scale-[1.01] active:scale-[0.98] transition-all duration-200 cursor-pointer shadow-lg"
                  >
                    {/* Left Rank & Info */}
                    <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                      <span className={`text-xl sm:text-2xl tracking-tighter w-7 text-center select-none ${textStyle}`}>
                        {badge}
                      </span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${bgBadge}`}>
                            {label}
                          </span>
                        </div>
                        <h3 className="text-sm sm:text-base font-extrabold text-white truncate group-hover:text-[var(--color-accent)] transition-colors">
                          {term}
                        </h3>
                      </div>
                    </div>

                    {/* Right Instant Action Buttons */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayTrendingTerm(term);
                        }}
                        title={`Play “${term}”`}
                        className="w-9 h-9 rounded-full glass-button-primary text-white flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5 ml-0.5 fill-current" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>

          {/* Curated Soundscapes & Genre Stations */}
          <GenreBrowser onSelectGenre={handleQuickSearch} />
        </div>
      ) : (
        /* ============================================================== */
        /* ACTIVE SEARCH RESULTS STATE (query.trim() exists)              */
        /* ============================================================== */
        <div className="space-y-8">
          {/* Header & Liquid-Glass Filter Pill Dock */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-0 pb-5">
            <div className="min-w-0 pr-2">
              <span className="text-[11px] font-black uppercase tracking-widest text-[var(--color-accent)] block mb-1">
                {selectedAlbum ? 'Album Inspection' : 'Search Results'}
              </span>
              <h1 className="text-2xl sm:text-4xl font-black text-white truncate tracking-tight">
                {selectedAlbum ? selectedAlbum.title || selectedAlbum.name : `“${query}”`}
              </h1>
            </div>

            {/* Segmented Filter Pills */}
            <div
              className="inline-flex items-center gap-1 p-1 rounded-full liquid-glass border-0 overflow-x-auto no-scrollbar max-w-full"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {selectedAlbum ? (
                <button
                  onClick={() => setSelectedAlbum(null)}
                  className="px-4 py-1.5 rounded-full glass-button text-xs font-bold text-white hover:bg-white/15 transition-all cursor-pointer flex items-center gap-1.5 flex-shrink-0 shadow-md active:scale-95"
                >
                  <span>← Back to “{query}”</span>
                </button>
              ) : (
                tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      setActiveTab(tab.id);
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex-shrink-0 whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'glass-button-primary text-white shadow-md'
                        : 'text-white/65 hover:text-white hover:bg-white/[0.08]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* SELECTED ALBUM DETAIL VIEW */}
          {selectedAlbum ? (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <GlassCard variant="liquid" padding="lg">
                <div className="flex flex-col md:flex-row items-start md:items-end gap-6 pb-6">
                  <img
                    src={selectedAlbum.coverUrl || selectedAlbum.thumbnail || DEFAULT_THUMBNAIL}
                    alt={selectedAlbum.title || selectedAlbum.name}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                    }}
                    className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl object-cover shadow-[0_20px_50px_rgba(0,0,0,0.8)] border-0 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-black uppercase tracking-wider text-[var(--color-accent)]">
                      Album
                    </span>
                    <h2 className="text-2xl sm:text-4xl font-black text-white mt-2 leading-tight">
                      {selectedAlbum.title || selectedAlbum.name}
                    </h2>
                    <p className="text-sm sm:text-base text-white/70 mt-1.5 font-medium">
                      {selectedAlbum.artist}{' '}
                      {selectedAlbum.year ? `• ${selectedAlbum.year}` : ''} •{' '}
                      {albumTracks.length || selectedAlbum.trackCount || ''} songs
                    </p>

                    <div className="flex flex-wrap items-center gap-3 mt-6">
                      <button
                        onClick={() => {
                          if (albumTracks.length > 0) {
                            unlockAudioEngine();
                            playTrack(albumTracks[0], albumTracks, 0);
                          }
                        }}
                        disabled={isAlbumLoading || albumTracks.length === 0}
                        className="px-6 py-2.5 rounded-full glass-button-primary text-white font-black text-xs sm:text-sm shadow-xl hover:scale-105 transition-transform cursor-pointer disabled:opacity-50"
                      >
                        ▶ Play Album
                      </button>
                      <button
                        onClick={() => {
                          if (albumTracks.length > 0) {
                            unlockAudioEngine();
                            const shuffled = [...albumTracks].sort(() => Math.random() - 0.5);
                            playTrack(shuffled[0], shuffled, 0);
                          }
                        }}
                        disabled={isAlbumLoading || albumTracks.length === 0}
                        className="px-5 py-2.5 rounded-full glass-button text-white font-bold text-xs sm:text-sm hover:bg-white/15 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Shuffle
                      </button>
                      <button
                        onClick={() => setSelectedAlbum(null)}
                        className="px-4 py-2.5 rounded-full glass-button text-white/70 hover:text-white text-xs font-bold cursor-pointer"
                      >
                        ← All Results
                      </button>
                    </div>
                  </div>
                </div>

                {/* Album Songs List */}
                <div className="mt-6">
                  {isAlbumLoading ? (
                    <div className="space-y-2.5">
                      {Array(6)
                        .fill(0)
                        .map((_, i) => (
                          <Skeleton key={i} className="h-14 w-full rounded-2xl" />
                        ))}
                    </div>
                  ) : albumTracks.length === 0 ? (
                    <p className="text-sm text-white/50 py-8 text-center">
                      No playable tracks found for this album.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {albumTracks.map((track, idx) => (
                        <TrackRow
                          key={`${track.id}-${idx}`}
                          track={track}
                          tracks={albumTracks}
                          index={idx + 1}
                          onPlay={handlePlayAlbumTrack}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </GlassCard>
            </motion.div>
          ) : isLoading ? (
            /* Skeleton Loading State */
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <Skeleton className="lg:col-span-5 h-72 w-full rounded-3xl" />
                <div className="lg:col-span-7 space-y-3">
                  <Skeleton className="h-16 w-full rounded-2xl" />
                  <Skeleton className="h-16 w-full rounded-2xl" />
                  <Skeleton className="h-16 w-full rounded-2xl" />
                  <Skeleton className="h-16 w-full rounded-2xl" />
                </div>
              </div>
            </div>
          ) : tracks.length === 0 && albums.length === 0 && artists.length === 0 && matchingPlaylists.length === 0 ? (
            /* Empty Results Card */
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center liquid-glass rounded-3xl border-0">
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-3xl mb-4">
                🔍
              </div>
              <h2 className="text-2xl font-black text-white">No results found for “{query}”</h2>
              <p className="text-sm text-white/60 max-w-md mt-2">
                Double-check your spelling, try searching for the artist directly, or explore trending soundscapes below.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
                <button
                  onClick={() => setSearchParams({})}
                  className="px-5 py-2.5 rounded-full glass-button-primary text-xs font-bold text-white cursor-pointer"
                >
                  Explore Trending Charts
                </button>
              </div>
            </div>
          ) : (
            /* Rich Categorized Results */
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
              {/* Top Result + Top Songs Split (when on 'all' tab) */}
              {activeTab === 'all' && topTrack && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Apple Music / Spotify Flagship Spotlight Card */}
                  <div className="lg:col-span-5 flex flex-col min-w-0">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
                        <span>Top Result</span>
                      </h2>
                    </div>

                    <div
                      onClick={() => {
                        if (isTopPlaying) {
                          togglePlay();
                        } else {
                          handlePlayTrack(topTrack);
                        }
                      }}
                      onContextMenu={(e) => {
                        if (e.shiftKey) return;
                        e.preventDefault();
                        e.stopPropagation();
                        useContextMenuStore.getState().openTrackMenu(
                          { clientX: e.clientX, clientY: e.clientY },
                          topTrack
                        );
                      }}
                      className="group relative overflow-hidden rounded-3xl p-6 liquid-glass border-0 transition-all duration-300 shadow-[0_16px_40px_rgba(0,0,0,0.55)] cursor-pointer flex flex-col justify-between flex-1 min-h-[300px]"
                    >
                      {/* Ambient Bloom Glow */}
                      <div className="absolute -top-12 -left-12 w-48 h-48 rounded-full bg-[var(--color-accent)]/20 blur-3xl pointer-events-none group-hover:scale-125 transition-transform duration-500" />

                      <div className="relative z-10 flex items-start gap-5">
                        {/* Artwork with Live Equalizer & Hover Play Overlay */}
                        <div className="relative flex-shrink-0 w-32 h-32 sm:w-36 sm:h-36 rounded-2xl overflow-hidden shadow-[0_12px_28px_rgba(0,0,0,0.7)] border-0 group-hover:scale-105 transition-transform duration-300">
                          <img
                            src={topTrack.thumbnail || DEFAULT_THUMBNAIL}
                            alt={topTrack.title}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                            }}
                            className="w-full h-full object-cover"
                          />

                          {/* Live Equalizer indicator if currently playing */}
                          {isTopPlaying && (
                            <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-black/60 backdrop-blur-md border-0 flex items-center gap-1 shadow-md">
                              <span className="w-1.5 h-3 bg-[var(--color-accent)] rounded-full animate-pulse" />
                              <span className="text-[10px] font-black uppercase tracking-wider text-white">Playing</span>
                            </div>
                          )}

                          {/* Hover Play Button Overlay */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="w-12 h-12 rounded-full glass-button-primary text-white flex items-center justify-center shadow-2xl scale-90 group-hover:scale-100 transition-transform">
                              {isTopPlaying ? (
                                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                                </svg>
                              ) : (
                                <svg className="w-5 h-5 ml-0.5 fill-current" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Metadata Details */}
                        <div className="flex-1 min-w-0 pr-1">
                          <div className="flex flex-wrap items-center gap-1.5 mb-2">
                            <span className="px-2.5 py-0.5 rounded-full bg-[var(--color-accent)] text-white text-[9px] font-black uppercase tracking-wider shadow-sm">
                              Top Match
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/80 text-[9px] font-bold uppercase tracking-wider border-0">
                              Lossless 320k
                            </span>
                          </div>

                          <h3 className="text-lg sm:text-xl font-black text-white leading-tight line-clamp-2 drop-shadow-sm group-hover:text-[var(--color-accent)] transition-colors">
                            {topTrack.title}
                          </h3>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickSearch(topTrack.artist);
                            }}
                            className="text-xs sm:text-sm text-white/70 hover:text-white font-semibold mt-1.5 line-clamp-1 block text-left underline-offset-2 hover:underline cursor-pointer"
                          >
                            {topTrack.artist}
                          </button>

                          <div className="flex items-center gap-3 text-xs text-white/45 mt-2 font-mono">
                            <span>⏱ {formatDuration(topTrack.duration)}</span>
                            {topTrack.album && !/wavecraft/i.test(topTrack.album) && (
                              <span className="truncate max-w-[140px]">• {topTrack.album}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Integrated Action Tray on Card */}
                      <div className="relative z-10 flex items-center justify-between gap-3 pt-5 mt-4 border-0">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isTopPlaying) {
                                togglePlay();
                              } else {
                                handlePlayTrack(topTrack);
                              }
                            }}
                            className="px-4.5 py-2 rounded-full glass-button-primary text-white text-xs font-black flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 transition-transform cursor-pointer"
                          >
                            {isTopPlaying ? (
                              <>
                                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                                </svg>
                                <span>Pause</span>
                              </>
                            ) : (
                              <>
                                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                                <span>Play Now</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlayTrack(topTrack);
                            }}
                            className="px-3.5 py-2 rounded-full glass-button text-white/80 hover:text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                            title="Start Smart Infinite Queue Radio"
                          >
                            <span>📻</span>
                            <span>Radio</span>
                          </button>
                        </div>

                        {/* Like + Add Queue + Menu */}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLike(topTrack);
                            }}
                            title={isTopLiked ? 'Unlike' : 'Like'}
                            className={`w-8 h-8 rounded-full glass-button flex items-center justify-center transition-colors cursor-pointer ${
                              isTopLiked ? 'text-[var(--color-accent)]' : 'text-white/60 hover:text-white'
                            }`}
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill={isTopLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2">
                              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              addToQueue(topTrack);
                            }}
                            title="Add to Up Next Queue"
                            className="w-8 h-8 rounded-full glass-button flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              useContextMenuStore.getState().openTrackMenu(
                                { clientX: e.clientX, clientY: e.clientY },
                                topTrack
                              );
                            }}
                            title="More Actions"
                            className="w-8 h-8 rounded-full glass-button flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer"
                          >
                            <span className="font-black text-sm tracking-widest leading-none">•••</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Top Songs List */}
                  <div className="lg:col-span-7 flex flex-col min-w-0">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-xl font-black tracking-tight">Songs</h2>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handlePlayAll}
                          className="px-3.5 py-1.5 rounded-full glass-button text-xs font-bold text-white/90 hover:text-white cursor-pointer"
                        >
                          ▶ Play All
                        </button>
                        <button
                          onClick={handleShuffleAll}
                          className="px-3.5 py-1.5 rounded-full glass-button text-xs font-bold text-white/90 hover:text-white cursor-pointer"
                        >
                          Shuffle
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {tracks.slice(0, 4).map((track, i) => (
                        <TrackRow
                          key={track.id}
                          track={track}
                          tracks={tracks}
                          index={i + 1}
                          onPlay={handlePlayTrack}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* All Songs Section */}
              {(activeTab === 'songs' || (activeTab === 'all' && tracks.length > 4)) && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                        {activeTab === 'all' ? 'More Songs' : 'All Songs'}
                      </h2>
                      <p className="text-xs text-white/50 mt-0.5">High-fidelity streaming results</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handlePlayAll}
                        className="px-3.5 py-1.5 rounded-full glass-button text-xs font-bold text-white/90 hover:text-white cursor-pointer"
                      >
                        Play All
                      </button>
                      <button
                        onClick={handleShuffleAll}
                        className="px-3.5 py-1.5 rounded-full glass-button text-xs font-bold text-white/90 hover:text-white cursor-pointer"
                      >
                        Shuffle
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {(activeTab === 'all' ? tracks.slice(4, 20) : tracks).map((track, i) => (
                      <TrackRow
                        key={track.id}
                        track={track}
                        tracks={tracks}
                        index={activeTab === 'all' ? i + 5 : i + 1}
                        onPlay={handlePlayTrack}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Artists Section (Apple Music Circular Avatars) */}
              {(activeTab === 'all' || activeTab === 'artists') && artists.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black tracking-tight">Artists</h2>
                      <p className="text-xs text-white/50 mt-0.5">Explore discographies and top artist tracks</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
                    {(activeTab === 'all' ? artists.slice(0, 5) : artists).map((artist) => (
                      <div
                        key={artist.id}
                        onClick={() => handleQuickSearch(artist.name)}
                        className="group flex flex-col items-center text-center p-4 rounded-3xl liquid-glass border-0 hover:scale-[1.03] transition-all duration-300 cursor-pointer shadow-xl select-none"
                      >
                        <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden mb-3.5 relative shadow-[0_12px_28px_rgba(0,0,0,0.6)] border-0 group-hover:shadow-[0_0_20px_rgba(250,45,72,0.3)] transition-all">
                          {artist.imageUrl || artist.thumbnail ? (
                            <img
                              src={artist.imageUrl || artist.thumbnail}
                              alt={artist.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-rose-500 to-purple-700 flex items-center justify-center text-3xl font-black text-white">
                              {artist.name.charAt(0)}
                            </div>
                          )}

                          {/* Hover Overlay */}
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-xs font-bold text-white bg-black/60 px-2.5 py-1 rounded-full border-0">
                              View →
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-center gap-1.5 w-full">
                          <h3 className="font-extrabold text-sm sm:text-base text-white truncate group-hover:text-[var(--color-accent)] transition-colors">
                            {artist.name}
                          </h3>
                          <span className="text-xs text-cyan-400" title="Verified Artist">✓</span>
                        </div>
                        <p className="text-xs text-white/50 mt-0.5">{artist.genre || 'Artist'}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Albums Section (Vinyl Sleeve Peek-Out Experience) */}
              {(activeTab === 'all' || activeTab === 'albums') && albums.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black tracking-tight">Albums</h2>
                      <p className="text-xs text-white/50 mt-0.5">Click any album to inspect tracklist and play</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
                    {(activeTab === 'all' ? albums.slice(0, 5) : albums).map((album) => (
                      <div
                        key={album.id}
                        onClick={() => handleOpenAlbum(album, false)}
                        className="group flex flex-col p-3.5 sm:p-4 rounded-3xl liquid-glass border-0 hover:scale-[1.03] transition-all duration-300 cursor-pointer shadow-xl select-none"
                      >
                        {/* Artwork with Vinyl Peek Out on Hover */}
                        <div className="relative aspect-square rounded-2xl overflow-hidden mb-3 bg-white/5 transition-all">
                          {/* 3D Vinyl peek out */}
                          <div className="absolute right-1 top-2 bottom-2 w-20 rounded-full bg-zinc-950 border-0 shadow-xl opacity-0 group-hover:opacity-100 group-hover:translate-x-3 transition-all duration-300 pointer-events-none flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-zinc-800 border-0 flex items-center justify-center">
                              <div className="w-2.5 h-2.5 rounded-full bg-black" />
                            </div>
                          </div>

                          <img
                            src={album.coverUrl || album.thumbnail || DEFAULT_THUMBNAIL}
                            alt={album.title || album.name}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                            }}
                            className="relative z-10 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />

                          {/* Hover Play Button */}
                          <div className="absolute inset-0 z-20 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenAlbum(album, true);
                              }}
                              title="Play Album"
                              className="glass-button-primary text-white p-3 rounded-full shadow-2xl scale-90 group-hover:scale-100 transition-transform cursor-pointer"
                            >
                              <svg className="w-5 h-5 ml-0.5 fill-current" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        <h3 className="font-extrabold text-sm text-white truncate group-hover:text-[var(--color-accent)] transition-colors">
                          {album.title || album.name}
                        </h3>
                        <p className="text-xs text-white/55 truncate mt-0.5">
                          {album.artist} {album.year ? `• ${album.year}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Playlists Section */}
              {(activeTab === 'all' || activeTab === 'playlists') && matchingPlaylists.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black tracking-tight">Playlists</h2>
                      <p className="text-xs text-white/50 mt-0.5">Matching library and curated vibe collections</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
                    {(activeTab === 'all' ? matchingPlaylists.slice(0, 5) : matchingPlaylists).map((pl) => (
                      <div
                        key={pl.id}
                        onClick={() => {
                          if (pl.type === 'library') {
                            navigate(`/playlist/${pl.id}`);
                          } else if (pl.query) {
                            handleQuickSearch(pl.query);
                          }
                        }}
                        className={`group flex flex-col p-3.5 sm:p-4 rounded-3xl liquid-glass border-0 hover:scale-[1.03] transition-all duration-300 cursor-pointer shadow-xl select-none ${
                          pl.colorClass || ''
                        }`}
                      >
                        <div className="aspect-square rounded-2xl overflow-hidden mb-3 relative bg-white/5 flex items-center justify-center">
                          {pl.type === 'curated' ? (
                            <span className="text-5xl drop-shadow-lg group-hover:scale-115 transition-transform duration-300">
                              {pl.emoji || '🎵'}
                            </span>
                          ) : (
                            <PlaylistArtwork
                              playlist={
                                libraryPlaylists.find((p) => p.id === pl.id) || ({
                                  id: pl.id,
                                  name: pl.name,
                                  coverUrl: pl.coverUrl,
                                  tracks: []
                                } as any)
                              }
                            />
                          )}

                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="w-10 h-10 rounded-full glass-button-primary text-white flex items-center justify-center shadow-lg">
                              <svg className="w-4 h-4 ml-0.5 fill-current" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                        </div>

                        <h3 className="font-extrabold text-sm text-white truncate group-hover:text-[var(--color-accent)] transition-colors">
                          {pl.name}
                        </h3>
                        <p className="text-xs text-white/55 truncate mt-0.5">
                          {pl.type === 'library' ? `${pl.trackCount} tracks` : pl.subtitle || 'Curated Mix'}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
