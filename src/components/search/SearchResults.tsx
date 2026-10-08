import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { searchTracks, getCachedSearch, getTrending, getCachedTrending } from '../../services/youtube';
import { searchAlbums, searchArtists, getAlbumTracks } from '../../services/itunes';
import { playTrackWithSmartQueue } from '../../services/recommendationEngine';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { unlockAudioEngine } from '../player/YouTubeEmbed';
import GlassCard from '../ui/GlassCard';
import GlassButton from '../ui/GlassButton';
import TrackRow from '../ui/TrackRow';
import Skeleton from '../ui/Skeleton';
import GenreBrowser from './GenreBrowser';
import { DEFAULT_THUMBNAIL, MOOD_PLAYLISTS } from '../../utils/constants';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { useSearchHistory } from '../../utils/searchHistory';
import type { Track, AlbumResult, ArtistResult } from '../../types';

const FALLBACK_LIVE_POOL = [
  'Die With A Smile',
  'Timeless - The Weeknd',
  'Arijit Singh',
  'Anirudh Ravichander',
  'APT. - ROSÉ & Bruno Mars',
  'Birds of a Feather',
  'Espresso - Sabrina Carpenter',
  'Aaj Ki Raat',
  'Chuttamalle',
  'Tauba Tauba',
  'Travis Scott',
  'AR Rahman',
  'Taylor Swift',
  'Kendrick Lamar',
  'Dua Lipa',
  'Coldplay',
  'Diljit Dosanjh',
  'Shreya Ghoshal',
  'Post Malone',
  'Imagine Dragons'
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

export default function SearchResults() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';

  const { history, removeSearchTerm, clearSearchHistory, saveSearchTerm } = useSearchHistory();
  const libraryPlaylists = useLibraryStore((state) => state.playlists);

  const [activeTab, setActiveTab] = useState<'all' | 'songs' | 'artists' | 'playlists' | 'albums'>('all');
  const [tracks, setTracks] = useState<Track[]>(() => (query ? getCachedSearch(query) || [] : []));
  const [albums, setAlbums] = useState<AlbumResult[]>([]);
  const [artists, setArtists] = useState<ArtistResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(query && !getCachedSearch(query)));

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

  useEffect(() => {
    if (query.trim()) {
      saveSearchTerm(query.trim());
    }
  }, [query, saveSearchTerm]);

  // Live Trending Searches state (real chart data + frequent rotation)
  const [trendingTerms, setTrendingTerms] = useState<string[]>(buildInitialTrendingPool);
  const [allLiveTerms, setAllLiveTerms] = useState<string[]>(FALLBACK_LIVE_POOL);
  const [isRefreshingTrends, setIsRefreshingTrends] = useState(false);

  // Selected Album View state
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumResult | null>(null);
  const [albumTracks, setAlbumTracks] = useState<Track[]>([]);
  const [isAlbumLoading, setIsAlbumLoading] = useState<boolean>(false);

  const playTrack = usePlayerStore((state) => state.playTrack);

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
          clean.length <= 34 &&
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

  // Fetch real live chart trends on mount and rotate every 30 seconds
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
    }, 30000);
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
      playTrack(tracks[0], tracks, 0);
    }
  };

  const handleShuffleAll = () => {
    if (tracks.length > 0) {
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      playTrack(shuffled[0], shuffled, 0);
    }
  };

  const handlePlayMood = async (_moodId: string, moodQuery: string) => {
    try {
      const results = await searchTracks(moodQuery);
      if (results.length > 0) {
        unlockAudioEngine();
        playTrack(results[0], results, 0);
      }
    } catch {}
  };

  const handleQuickSearch = (term: string) => {
    saveSearchTerm(term);
    setSelectedAlbum(null);
    setActiveTab('all');
    setSearchParams({ q: term });
  };

  if (!query.trim()) {
    return (
      <div className="pb-24 pt-2 text-white space-y-10">
        {/* Recent Search History with One-Tap Clear */}
        {history.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">Recent Searches</h2>
              <button
                type="button"
                onClick={() => clearSearchHistory()}
                className="text-xs text-[var(--color-accent)] hover:underline font-bold cursor-pointer"
              >
                Clear All
              </button>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {history.map((term) => (
                <div
                  key={term}
                  className="flex items-center gap-2 pl-3.5 pr-2 py-1.5 rounded-full glass hover:bg-white/10 text-xs font-semibold text-white/90 hover:text-white group cursor-pointer transition-colors"
                  onClick={() => handleQuickSearch(term)}
                >
                  <svg className="w-3.5 h-3.5 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                    className="w-4 h-4 ml-0.5 rounded-full hover:bg-white/20 flex items-center justify-center text-white/40 hover:text-white"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <h1 className="text-3xl font-extrabold tracking-tight">Search & Discover</h1>
            <button
              type="button"
              onClick={handleCycleLiveTrends}
              className="px-3 py-1 rounded-full glass-button text-[11px] font-bold text-white/80 hover:text-white flex items-center gap-1.5 cursor-pointer"
              title="Rotate trending suggestions"
            >
              <span className={isRefreshingTrends ? 'animate-spin inline-block' : ''}>↻</span>
              <span>Rotate Trends</span>
            </button>
          </div>
          <p className="text-sm text-white/55 mb-5">
            Trending searches right now — updated live from global & regional streaming charts
          </p>
          <div className="flex flex-wrap gap-2.5">
            {trendingTerms.map((term, idx) => (
              <button
                key={`${term}-${idx}`}
                onClick={() => handleQuickSearch(term)}
                className="px-4 py-2 rounded-full glass-button text-xs font-semibold text-white/90 hover:text-white cursor-pointer flex items-center gap-1.5"
              >
                {idx < 3 && <span className="text-[var(--color-accent)] text-[11px]">🔥</span>}
                <span>{term}</span>
              </button>
            ))}
          </div>
        </div>

        <GenreBrowser />
      </div>
    );
  }

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'songs', label: `Songs (${tracks.length})` },
    { id: 'artists', label: `Artists (${artists.length})` },
    { id: 'playlists', label: `Playlists (${matchingPlaylists.length})` },
    { id: 'albums', label: `Albums (${albums.length})` }
  ];

  const topTrack = tracks[0];

  return (
    <div className="flex flex-col gap-6 pb-24 pt-2 text-white">
      {/* Header & Filter Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-white/45">
            {selectedAlbum ? 'Album View' : 'Search Results'}
          </span>
          <h1 className="text-2xl font-extrabold text-white mt-0.5">
            {selectedAlbum ? selectedAlbum.title || selectedAlbum.name : `“${query}”`}
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {selectedAlbum ? (
            <button
              onClick={() => setSelectedAlbum(null)}
              className="px-4 py-2 rounded-full liquid-glass border border-white/20 text-xs font-bold text-white hover:bg-white/15 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>← Back to “{query}”</span>
            </button>
          ) : (
            tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-[var(--color-accent)] text-white shadow-lg shadow-[var(--color-accent)]/25'
                    : 'glass text-white/65 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))
          )}
        </div>
      </div>

      {/* INTERACTIVE ALBUM TRACKLIST VIEW */}
      {selectedAlbum ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <GlassCard variant="liquid" padding="lg" className="border border-white/15">
            <div className="flex flex-col md:flex-row items-start md:items-end gap-6 pb-6 border-b border-white/10">
              <img
                src={selectedAlbum.coverUrl || selectedAlbum.thumbnail || DEFAULT_THUMBNAIL}
                alt={selectedAlbum.title || selectedAlbum.name}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                }}
                className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl object-cover shadow-2xl border border-white/15 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)]">
                  Album
                </span>
                <h2 className="text-2xl sm:text-4xl font-extrabold text-white mt-2">
                  {selectedAlbum.title || selectedAlbum.name}
                </h2>
                <p className="text-sm sm:text-base text-white/65 mt-1 font-medium">
                  {selectedAlbum.artist}{' '}
                  {selectedAlbum.year ? `• ${selectedAlbum.year}` : ''} •{' '}
                  {albumTracks.length || selectedAlbum.trackCount || ''} songs
                </p>

                <div className="flex flex-wrap items-center gap-3 mt-5">
                  <button
                    onClick={() => {
                      if (albumTracks.length > 0) {
                        unlockAudioEngine();
                        playTrack(albumTracks[0], albumTracks, 0);
                      }
                    }}
                    disabled={isAlbumLoading || albumTracks.length === 0}
                    className="px-6 py-2.5 rounded-full bg-[var(--color-accent)] text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-[var(--color-accent)]/30 hover:scale-105 transition-transform cursor-pointer disabled:opacity-50"
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
                    className="px-5 py-2.5 rounded-full liquid-glass text-white font-bold text-xs sm:text-sm hover:bg-white/15 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Shuffle Album
                  </button>
                  <button
                    onClick={() => setSelectedAlbum(null)}
                    className="px-4 py-2.5 rounded-full glass text-white/70 hover:text-white text-xs font-bold cursor-pointer"
                  >
                    ← All Results
                  </button>
                </div>
              </div>
            </div>

            {/* Album Songs List */}
            <div className="mt-5">
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
                      onPlay={(t) => {
                        unlockAudioEngine();
                        playTrack(t, albumTracks, idx);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </GlassCard>
        </motion.div>
      ) : isLoading ? (
        <div className="space-y-3">
          {Array(6)
            .fill(0)
            .map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-10"
        >
          {tracks.length === 0 && albums.length === 0 && artists.length === 0 && matchingPlaylists.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-white/50">
              <p className="text-lg font-semibold text-white">No results found for "{query}"</p>
              <p className="text-sm mt-1">Try searching for another song, artist, playlist, or album.</p>
            </div>
          ) : (
            <>
              {/* Top Result + Top Songs Split (when on 'all' tab) */}
              {activeTab === 'all' && topTrack && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Top Result Spotlight Card */}
                  <div className="lg:col-span-5 flex flex-col">
                    <h2 className="text-xl font-bold mb-3">Top Result</h2>
                    <GlassCard
                      variant="liquid"
                      padding="lg"
                      onClick={() => handlePlayTrack(topTrack)}
                      onContextMenu={(e) => {
                        if (e.shiftKey) return;
                        e.preventDefault();
                        e.stopPropagation();
                        useContextMenuStore.getState().openTrackMenu(
                          { clientX: e.clientX, clientY: e.clientY },
                          topTrack,
                          tracks
                        );
                      }}
                      className="flex-1 flex flex-col justify-between cursor-pointer group relative overflow-hidden"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <img
                          src={topTrack.thumbnail || DEFAULT_THUMBNAIL}
                          alt={topTrack.title}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                          }}
                          className="w-28 h-28 rounded-2xl object-cover shadow-2xl group-hover:scale-105 transition-transform"
                        />
                        <button className="w-14 h-14 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center shadow-xl shadow-[var(--color-accent)]/35 group-hover:scale-110 transition-transform">
                          <svg className="w-7 h-7 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </button>
                      </div>

                      <div className="mt-6">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)] block mb-1">
                          Song
                        </span>
                        <h3 className="text-2xl font-extrabold text-white truncate">{topTrack.title}</h3>
                        <p className="text-sm text-white/65 truncate mt-1">
                          {topTrack.artist} • {topTrack.album}
                        </p>
                      </div>
                    </GlassCard>
                  </div>

                  {/* Top Songs List */}
                  <div className="lg:col-span-7 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-xl font-bold">Songs</h2>
                      <div className="flex gap-2">
                        <GlassButton size="sm" onClick={handlePlayAll}>
                          Play All
                        </GlassButton>
                        <GlassButton size="sm" onClick={handleShuffleAll}>
                          Shuffle
                        </GlassButton>
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

              {/* Full Songs Section */}
              {(activeTab === 'songs' || (activeTab === 'all' && tracks.length > 4)) && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">
                      {activeTab === 'all' ? 'More Songs' : 'All Songs'}
                    </h2>
                    <div className="flex gap-2">
                      <GlassButton size="sm" onClick={handlePlayAll}>
                        Play All
                      </GlassButton>
                      <GlassButton size="sm" onClick={handleShuffleAll}>
                        Shuffle
                      </GlassButton>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {(activeTab === 'all' ? tracks.slice(4, 16) : tracks).map((track, i) => (
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

              {/* Albums Section */}
              {(activeTab === 'all' || activeTab === 'albums') && albums.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">Albums</h2>
                    <span className="text-xs text-white/45">Click any album to view & play tracks</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                    {(activeTab === 'all' ? albums.slice(0, 5) : albums).map((album) => (
                      <GlassCard
                        key={album.id}
                        padding="sm"
                        hover
                        onClick={() => handleOpenAlbum(album, false)}
                        className="group cursor-pointer"
                      >
                        <div className="aspect-square rounded-xl overflow-hidden mb-3 relative bg-white/5">
                          <img
                            src={album.coverUrl || album.thumbnail || DEFAULT_THUMBNAIL}
                            alt={album.title || album.name}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                            }}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenAlbum(album, true);
                              }}
                              title="Play Album Now"
                              className="bg-[var(--color-accent)] text-white p-3 rounded-full shadow-lg hover:scale-110 transition-transform cursor-pointer"
                            >
                              <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <h3 className="font-bold text-sm text-white truncate">
                          {album.title || album.name}
                        </h3>
                        <p className="text-xs text-white/55 truncate mt-0.5">
                          {album.artist} {album.year ? `• ${album.year}` : ''}
                        </p>
                      </GlassCard>
                    ))}
                  </div>
                </section>
              )}

              {/* Artists Section */}
              {(activeTab === 'all' || activeTab === 'artists') && artists.length > 0 && (
                <section>
                  <h2 className="text-xl font-bold mb-4">Artists</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                    {(activeTab === 'all' ? artists.slice(0, 5) : artists).map((artist) => (
                      <GlassCard
                        key={artist.id}
                        padding="md"
                        hover
                        onClick={() => handleQuickSearch(artist.name)}
                        className="flex flex-col items-center text-center group cursor-pointer"
                      >
                        <div className="w-28 h-28 rounded-full overflow-hidden mb-3 relative shadow-xl border border-white/15">
                          {artist.imageUrl || artist.thumbnail ? (
                            <img
                              src={artist.imageUrl || artist.thumbnail}
                              alt={artist.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-rose-500 to-purple-600 flex items-center justify-center text-3xl font-bold">
                              {artist.name.charAt(0)}
                            </div>
                          )}
                        </div>
                        <h3 className="font-bold text-sm text-white truncate w-full">{artist.name}</h3>
                        <p className="text-xs text-white/45 mt-0.5">{artist.genre || 'Artist'}</p>
                      </GlassCard>
                    ))}
                  </div>
                </section>
              )}

              {/* Playlists Section */}
              {(activeTab === 'all' || activeTab === 'playlists') && matchingPlaylists.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">Playlists</h2>
                    <span className="text-xs text-white/45">Matching library & curated vibe playlists</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                    {(activeTab === 'all' ? matchingPlaylists.slice(0, 5) : matchingPlaylists).map((pl) => (
                      <GlassCard
                        key={pl.id}
                        padding="sm"
                        hover
                        onClick={() => {
                          if (pl.type === 'library') {
                            navigate(`/playlist/${pl.id}`);
                          } else if (pl.query) {
                            handlePlayMood(pl.id, pl.query);
                          }
                        }}
                        className={`group cursor-pointer ${pl.colorClass || ''}`}
                      >
                        <div className="aspect-square rounded-xl overflow-hidden mb-3 relative bg-white/5 flex items-center justify-center">
                          {pl.type === 'curated' ? (
                            <span className="text-5xl drop-shadow group-hover:scale-110 transition-transform">
                              {pl.emoji || '🎵'}
                            </span>
                          ) : (
                            <img
                              src={pl.coverUrl}
                              alt={pl.name}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                              }}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          )}
                        </div>
                        <h3 className="font-bold text-sm text-white truncate">{pl.name}</h3>
                        <p className="text-xs text-white/55 truncate mt-0.5">
                          {pl.type === 'library' ? `${pl.trackCount} tracks` : pl.subtitle || 'Curated Mix'}
                        </p>
                      </GlassCard>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </motion.div>
      )}
    </div>
  );
}
