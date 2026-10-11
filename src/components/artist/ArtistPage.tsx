import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { searchTracks } from '../../services/youtube';
import { searchAlbums, searchArtists } from '../../services/itunes';
import { usePlayerStore } from '../../stores/playerStore';
import { useColorExtract } from '../../hooks/useColorExtract';
import TrackRow from '../ui/TrackRow';
import GlassCard from '../ui/GlassCard';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import type { Track, AlbumResult } from '../../types';

export default function ArtistPage() {
  const { name } = useParams<{ name: string }>();
  const artistName = decodeURIComponent(name || 'Unknown Artist');
  const navigate = useNavigate();

  const [topTracks, setTopTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<AlbumResult[]>([]);
  const [heroImage, setHeroImage] = useState<string>('');
  const [genre, setGenre] = useState<string>('Pop');
  const [isLoading, setIsLoading] = useState(true);
  const [isFavorited, setIsFavorited] = useState(false);

  const playTrack = usePlayerStore((s) => s.playTrack);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  const { palette } = useColorExtract(heroImage || topTracks[0]?.thumbnail);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    // Fetch songs, albums, and artist profile
    Promise.all([
      searchTracks(`${artistName} top songs`).catch(() => []),
      searchAlbums(artistName).catch(() => []),
      searchArtists(artistName).catch(() => [])
    ]).then(([tracksData, albumsData, artistsData]) => {
      if (!isMounted) return;

      // Filter and rank tracks by this artist
      const artistTracks = tracksData.filter((t) =>
        t.artist.toLowerCase().includes(artistName.toLowerCase()) ||
        artistName.toLowerCase().includes(t.artist.toLowerCase())
      );
      const displayTracks = artistTracks.length >= 4 ? artistTracks : tracksData;
      setTopTracks(displayTracks);

      setAlbums(albumsData);

      // Best high-res hero image from artist profile, albums, or tracks
      const foundArtist = artistsData.find(
        (a) => a.name.toLowerCase() === artistName.toLowerCase()
      );
      if (foundArtist?.imageUrl || foundArtist?.thumbnail) {
        setHeroImage(foundArtist.imageUrl || foundArtist.thumbnail);
        if (foundArtist.genre) setGenre(foundArtist.genre);
      } else if (albumsData[0]?.coverUrl || albumsData[0]?.thumbnail) {
        setHeroImage(albumsData[0].coverUrl || albumsData[0].thumbnail);
      } else if (displayTracks[0]?.thumbnailLarge || displayTracks[0]?.thumbnail) {
        setHeroImage(displayTracks[0].thumbnailLarge || displayTracks[0].thumbnail);
      }

      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [artistName]);

  const latestRelease = useMemo(() => {
    if (albums.length === 0) return null;
    return albums[0];
  }, [albums]);

  const isCurrentArtistPlaying = useMemo(() => {
    return (
      isPlaying &&
      currentTrack &&
      (currentTrack.artist.toLowerCase().includes(artistName.toLowerCase()) ||
        artistName.toLowerCase().includes(currentTrack.artist.toLowerCase()))
    );
  }, [isPlaying, currentTrack, artistName]);

  const handlePlayArtist = () => {
    triggerAndroidHaptic('medium');
    if (isCurrentArtistPlaying) {
      togglePlay();
      return;
    }
    if (topTracks.length > 0) {
      playTrack(topTracks[0], topTracks, 0);
    }
  };

  const handleShuffleArtist = () => {
    triggerAndroidHaptic('medium');
    if (topTracks.length === 0) return;
    const shuffled = [...topTracks].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled, 0);
  };

  const primaryColor = palette?.primary || '#fa2d48';

  return (
    <div className="relative min-h-screen text-white -mt-6 -mx-6 pb-28 select-none">
      {/* Full-bleed Dynamic Ambient Backdrop matching Image 3 */}
      <div
        className="absolute top-0 left-0 right-0 h-[65vh] max-h-[520px] pointer-events-none overflow-hidden transition-all duration-1000 z-0"
        style={{
          background: `radial-gradient(ellipse 110% 80% at 50% 20%, ${primaryColor}40 0%, #06060b 85%)`
        }}
      >
        {heroImage && (
          <img
            src={heroImage}
            alt={artistName}
            className="w-full h-full object-cover object-top opacity-35 filter blur-sm scale-105"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#06060b]/75 to-[#06060b]" />
      </div>

      {/* Floating Apple Music Top Header Navigation */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-6 py-4 backdrop-blur-md bg-[#06060b]/40 border-b border-white/[0.06]">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 border border-white/15 flex items-center justify-center text-white/90 hover:text-white transition-all cursor-pointer shadow-lg active:scale-95"
        >
          <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          {/* Apple Music Dual-Pill Capsule (Share + More) */}
          <div className="flex items-center rounded-full bg-black/40 border border-white/15 backdrop-blur-xl p-0.5 shadow-lg">
            <button
              type="button"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: artistName, url: window.location.href }).catch(() => {});
                }
              }}
              title="Share Artist"
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
            <div className="w-[1px] h-3.5 bg-white/15" />
            <button
              type="button"
              onClick={() => setIsFavorited((f) => !f)}
              title="Artist Options"
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <span className="text-xs font-bold leading-none tracking-widest">•••</span>
            </button>
          </div>
        </div>
      </div>

      <div className="relative z-10 px-6 max-w-7xl mx-auto pt-4 space-y-8">
        {/* Apple Music Artist Hero Banner (Image 3 reference) */}
        <div className="flex flex-col items-center md:items-start text-center md:text-left pt-6 pb-2">
          {/* Upcoming Concert / Tour Pill */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 backdrop-blur-xl text-[11px] font-semibold text-white/85 mb-3 shadow-md">
            <span className="text-[10px]"></span>
            <span>Featured Artist • {genre}</span>
          </div>

          {/* Giant Stylized Typography (Image 3: DOJA CAT, MAROON 5, KHALID) */}
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight text-white uppercase drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)] max-w-3xl">
            {artistName}
          </h1>

          {/* Action Row: Info, Large Play Pill, Star / Favorite */}
          <div className="flex items-center gap-4 mt-6">
            {/* Info Icon Button */}
            <button
              type="button"
              onClick={() => alert(`${artistName} is verified on Apple Music catalogue with lossless audio streams.`)}
              className="w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 border border-white/20 backdrop-blur-xl flex items-center justify-center text-white/80 hover:text-white transition-all cursor-pointer shadow-md active:scale-95"
              title="Artist Details"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </button>

            {/* Apple Music Large Play Pill */}
            <button
              type="button"
              onClick={handlePlayArtist}
              className="w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-2xl active:scale-95 hover:scale-105"
              style={{
                background: primaryColor,
                boxShadow: `0 8px 30px ${primaryColor}70`
              }}
              title={isCurrentArtistPlaying ? 'Pause Artist' : 'Play Artist'}
            >
              {isCurrentArtistPlaying ? (
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1.5" />
                  <rect x="14" y="4" width="4" height="16" rx="1.5" />
                </svg>
              ) : (
                <svg className="w-6 h-6 ml-0.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Star / Favorite Button */}
            <button
              type="button"
              onClick={() => {
                triggerAndroidHaptic('light');
                setIsFavorited((f) => !f);
              }}
              className={`w-10 h-10 rounded-full border backdrop-blur-xl flex items-center justify-center transition-all cursor-pointer shadow-md active:scale-95 ${
                isFavorited
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-400'
                  : 'bg-black/40 hover:bg-black/60 border-white/20 text-white/80 hover:text-white'
              }`}
              title={isFavorited ? 'Remove Favorite' : 'Favorite Artist'}
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill={isFavorited ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
          </div>
        </div>

        {/* Latest Release Glass Card (Image 3 reference) */}
        {latestRelease && (
          <div className="pt-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-white/50 mb-3">
              Latest Release
            </h2>
            <div
              onClick={() => latestRelease.title && navigate(`/search?q=${encodeURIComponent(latestRelease.title)}`)}
              className="p-4 rounded-3xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 backdrop-blur-2xl flex items-center justify-between gap-4 cursor-pointer transition-all shadow-xl group max-w-xl"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <img
                  src={latestRelease.coverUrl || latestRelease.thumbnail || DEFAULT_THUMBNAIL}
                  alt={latestRelease.title}
                  className="w-14 h-14 rounded-2xl object-cover shadow-lg border border-white/10 flex-shrink-0 group-hover:scale-105 transition-transform"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] text-white/55">
                    <span>{latestRelease.year || new Date().getFullYear()}</span>
                    <span>•</span>
                    <span>Single / Album</span>
                    <span className="px-1 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-white/10 text-white/70 border border-white/15">
                      E
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white truncate mt-0.5">
                    {latestRelease.title}
                  </h3>
                  <p className="text-xs text-white/50 truncate">
                    {latestRelease.trackCount ? `${latestRelease.trackCount} Songs` : '1 Song'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white/90 cursor-pointer flex-shrink-0"
                title="Add to Library"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Top Songs Section (Image 3 reference) */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-1.5">
              <span>Top Songs</span>
              <span className="text-white/40 text-sm">›</span>
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePlayArtist}
                className="px-3.5 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold text-white/90 transition cursor-pointer"
              >
                Play All
              </button>
              <button
                type="button"
                onClick={handleShuffleArtist}
                className="px-3.5 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold text-white/90 transition cursor-pointer"
              >
                Shuffle
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 rounded-2xl bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          ) : topTracks.length > 0 ? (
            <div className="space-y-1">
              {topTracks.slice(0, 10).map((track, idx) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={idx + 1}
                  onPlay={(t) => playTrack(t, topTracks, idx)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/50 py-4">No top songs found for this artist.</p>
          )}
        </div>

        {/* Albums Grid */}
        {albums.length > 0 && (
          <div className="pt-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-1.5">
                <span>Albums</span>
                <span className="text-white/40 text-sm">›</span>
              </h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
              {albums.slice(0, 10).map((album) => (
                <GlassCard
                  key={album.id}
                  padding="sm"
                  hover
                  onClick={() => navigate(`/search?q=${encodeURIComponent(album.title)}`)}
                  className="group cursor-pointer"
                >
                  <div className="aspect-square rounded-2xl overflow-hidden mb-3 relative bg-white/5 shadow-xl">
                    <img
                      src={album.coverUrl || album.thumbnail || DEFAULT_THUMBNAIL}
                      alt={album.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                  <h3 className="font-bold text-sm text-white truncate">{album.title}</h3>
                  <p className="text-xs text-white/55 truncate mt-0.5">
                    {album.year || 'Album'}
                  </p>
                </GlassCard>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
