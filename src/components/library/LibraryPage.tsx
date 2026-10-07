import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLibraryStore } from '../../stores/libraryStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useOfflineVault } from '../../services/offlineVault';
import { computeSmartPlaylists, type SmartPlaylistDef } from '../../services/smartPlaylists';
import { exportFullLibraryJSON } from '../../utils/playlistExport';
import PlaylistCard from './PlaylistCard';
import CreatePlaylist from './CreatePlaylist';
import ImportPlaylistModal from './ImportPlaylistModal';
import GlassCard from '../ui/GlassCard';
import GlassButton from '../ui/GlassButton';
import TrackRow from '../ui/TrackRow';

export default function LibraryPage() {
  const playlists = useLibraryStore((state) => state.playlists);
  const likedSongs = useLibraryStore((state) => state.likedSongs);
  const recentlyPlayed = useLibraryStore((state) => state.recentlyPlayed);
  const playHistory = useLibraryStore((state) => state.playHistory);
  const createPlaylist = useLibraryStore((state) => state.createPlaylist);
  const addTracksToPlaylist = useLibraryStore((state) => state.addTracksToPlaylist);
  const syncAllLivePlaylists = useLibraryStore((state) => state.syncAllLivePlaylists);
  const syncingPlaylistIds = useLibraryStore((state) => state.syncingPlaylistIds);
  const playTrack = usePlayerStore((state) => state.playTrack);
  const { offlineTracks } = useOfflineVault();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importInitialMode, setImportInitialMode] = useState<'live' | 'url' | 'text' | 'file'>('live');
  const [showOfflineVault, setShowOfflineVault] = useState(false);
  const [savedBanner, setSavedBanner] = useState('');

  const livePlaylistsCount = playlists.filter((p) => p.isLiveSync && p.sourceUrl).length;
  const isAnySyncing = Object.values(syncingPlaylistIds).some(Boolean);

  const smartPlaylists = useMemo(
    () => computeSmartPlaylists(likedSongs, recentlyPlayed, playHistory, playlists),
    [likedSongs, recentlyPlayed, playHistory, playlists]
  );

  const handleSaveSmartPlaylist = (smart: SmartPlaylistDef) => {
    const newPl = createPlaylist(
      smart.name,
      `${smart.description} (Saved from WaveCraft Smart Playlists)`
    );
    addTracksToPlaylist(newPl.id, smart.tracks);
    setSavedBanner(`Saved "${smart.name}" with ${smart.tracks.length} tracks to your playlists!`);
    setTimeout(() => setSavedBanner(''), 3500);
  };

  const openImportModal = (mode: 'live' | 'url' | 'text' | 'file') => {
    setImportInitialMode(mode);
    setIsImportModalOpen(true);
  };

  return (
    <div className="pb-24 pt-2 text-white min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Your Library</h1>
          <p className="text-xs text-white/50 mt-1">
            All your liked songs, offline 320kbps vault, live auto-syncing playlists, and custom mixes
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {livePlaylistsCount > 0 && (
            <button
              type="button"
              onClick={() => syncAllLivePlaylists()}
              disabled={isAnySyncing}
              className="px-3.5 py-2 rounded-full text-xs font-extrabold glass-button-cyan text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              <span className={isAnySyncing ? 'animate-spin inline-block' : ''}>↻</span>
              <span>{isAnySyncing ? 'Syncing Live...' : `Sync Live (${livePlaylistsCount})`}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => openImportModal('live')}
            className="px-3.5 py-2 rounded-full text-xs font-extrabold glass-button-emerald text-white flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-ping" />
            <span>Live Sync Playlist</span>
          </button>
          <button
            type="button"
            onClick={() => exportFullLibraryJSON(playlists, likedSongs)}
            className="px-3.5 py-2 rounded-full text-xs font-extrabold glass-button text-white/80 hover:text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            title="Export full library backup (playlists & liked songs) to JSON"
          >
            <span>📦 Backup JSON</span>
          </button>
          <GlassButton size="sm" onClick={() => openImportModal('url')}>
            ↓ Import Playlist
          </GlassButton>
          <GlassButton variant="primary" size="sm" onClick={() => setIsCreateModalOpen(true)}>
            + New Playlist
          </GlassButton>
        </div>
      </div>

      {/* Quick Access Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
        <Link to="/liked" className="group">
          <GlassCard
            variant="liquid"
            padding="md"
            hover
            className="flex items-center gap-4 h-full overflow-hidden"
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-500 via-pink-600 to-purple-700 flex items-center justify-center flex-shrink-0 shadow-xl group-hover:scale-105 transition-transform">
              <svg className="w-8 h-8 text-white drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-extrabold mb-0.5 truncate">Liked Songs</h2>
              <p className="text-xs text-white/60 truncate">{likedSongs.length} saved tracks</p>
            </div>
          </GlassCard>
        </Link>

        <Link to="/recent" className="group">
          <GlassCard
            variant="liquid"
            padding="md"
            hover
            className="flex items-center gap-4 h-full overflow-hidden"
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 via-blue-600 to-cyan-600 flex items-center justify-center flex-shrink-0 shadow-xl group-hover:scale-105 transition-transform">
              <svg className="w-8 h-8 text-white drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-extrabold mb-0.5 truncate">Recently Played</h2>
              <p className="text-xs text-white/60 truncate">{recentlyPlayed.length} tracks in history</p>
            </div>
          </GlassCard>
        </Link>

        <Link to="/downloads" className="group">
          <GlassCard
            variant="liquid"
            padding="md"
            hover
            className="flex items-center gap-4 h-full overflow-hidden border border-emerald-400/20 hover:border-emerald-400/50 transition-colors"
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 flex items-center justify-center flex-shrink-0 shadow-xl group-hover:scale-105 transition-transform">
              <span className="text-2xl">⚡</span>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-extrabold mb-0.5 truncate">Offline Vault</h2>
              <p className="text-xs text-white/60 truncate">
                {offlineTracks.length} zero-internet 320k tracks
              </p>
            </div>
          </GlassCard>
        </Link>
      </div>

      {/* Expandable Offline Vault Section */}
      {showOfflineVault && (
        <GlassCard variant="liquid" padding="lg" className="mb-10 border border-emerald-400/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="text-xl font-extrabold text-white flex items-center gap-2 flex-wrap">
                <span className="whitespace-nowrap">⚡ Offline 320kbps Audio Vault</span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 whitespace-nowrap flex-shrink-0">
                  {offlineTracks.length} Cached
                </span>
              </h3>
              <p className="text-xs text-white/55 mt-1">
                Stored directly in your browser CacheStorage for 0ms instant playback—even without Wi-Fi. Click the download icon on any song row across WaveCraft to add it here.
              </p>
            </div>
            {offlineTracks.length > 0 && (
              <GlassButton
                variant="primary"
                size="sm"
                onClick={() => playTrack(offlineTracks[0], offlineTracks, 0)}
              >
                ▶ Play Offline Vault
              </GlassButton>
            )}
          </div>
          {offlineTracks.length === 0 ? (
            <div className="py-8 text-center text-sm text-white/50">
              Your Offline Vault is empty. Hover any song and click the <strong className="text-emerald-300">↓ Download</strong> button to cache 320kbps audio locally!
            </div>
          ) : (
            <div className="space-y-1.5">
              {offlineTracks.map((track, idx) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  tracks={offlineTracks}
                  index={idx + 1}
                />
              ))}
            </div>
          )}
        </GlassCard>
      )}

      {/* Toast Notification Banner */}
      {savedBanner && (
        <div className="mb-6 p-3 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold flex items-center justify-between">
          <span>✨ {savedBanner}</span>
          <button onClick={() => setSavedBanner('')} className="text-white/60 hover:text-white cursor-pointer">✕</button>
        </div>
      )}

      {/* Smart Dynamic Playlists Shelf */}
      {smartPlaylists.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white/[0.08] border border-white/15 text-[10px] font-extrabold uppercase tracking-widest text-rose-300 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                INTELLIGENT AUTO-CURATION
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Smart Playlists
              </h2>
            </div>
            <span className="text-xs text-white/50 hidden sm:block">
              Auto-generated from your listening stream & history
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {smartPlaylists.map((smart) => (
              <GlassCard
                key={smart.id}
                variant="liquid"
                padding="md"
                className="relative overflow-hidden flex flex-col justify-between group hover:border-white/30 transition-all border border-white/12"
              >
                <div>
                  {/* Visual Header with Luxury Gradient & Badge */}
                  <div
                    className={`w-full h-28 rounded-2xl bg-gradient-to-br ${smart.gradient} p-3.5 flex flex-col justify-between shadow-lg relative overflow-hidden`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-full bg-black/45 border border-white/20 text-[9px] font-black uppercase tracking-wider text-white">
                        {smart.badge}
                      </span>
                      <span className="text-xl drop-shadow">{smart.icon}</span>
                    </div>

                    <div>
                      <h3 className="text-base font-black text-white drop-shadow-md truncate">
                        {smart.name}
                      </h3>
                      <p className="text-[10px] text-white/80 font-medium truncate drop-shadow">
                        {smart.tagline}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-white/60 mt-3 line-clamp-2 leading-relaxed">
                    {smart.description}
                  </p>
                  <span className="text-[11px] font-bold text-white/45 block mt-1">
                    {smart.tracks.length} tracks
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/10">
                  <GlassButton
                    variant="primary"
                    size="sm"
                    className="flex-1 text-xs font-bold"
                    onClick={() => playTrack(smart.tracks[0], smart.tracks, 0)}
                  >
                    ▶ Play
                  </GlassButton>
                  <button
                    type="button"
                    onClick={() => handleSaveSmartPlaylist(smart)}
                    className="px-3 py-2 rounded-full glass-button text-xs font-bold text-white/75 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                    title="Clone into your custom playlists"
                  >
                    + Save
                  </button>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl font-bold tracking-tight">Playlists</h2>
        {livePlaylistsCount > 0 && (
          <span className="text-xs text-emerald-300/90 font-semibold flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {livePlaylistsCount} Live Auto-Syncing Playlist{livePlaylistsCount === 1 ? '' : 's'} Active
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
        {/* Create Playlist Card */}
        <div
          onClick={() => setIsCreateModalOpen(true)}
          className="text-left group cursor-pointer"
        >
          <GlassCard
            variant="liquid"
            padding="md"
            hover
            className="h-full flex flex-col items-center justify-center border border-white/15 hover:border-white/30 transition-colors min-h-[230px]"
          >
            <div className="w-14 h-14 rounded-full glass-button flex items-center justify-center mb-3.5 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h3 className="font-bold text-base text-white whitespace-nowrap">Create Playlist</h3>
            <p className="text-xs text-white/50 mt-1 text-center">Build a custom mix</p>
          </GlassCard>
        </div>

        {/* Live Auto-Sync Playlist Card */}
        <div
          onClick={() => openImportModal('live')}
          className="text-left group cursor-pointer"
        >
          <GlassCard
            variant="liquid"
            padding="md"
            hover
            className="h-full flex flex-col items-center justify-center border border-emerald-400/35 hover:border-emerald-400/60 transition-colors min-h-[230px] relative overflow-hidden"
          >
            <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/35 text-[9px] font-extrabold text-emerald-300 flex items-center gap-1 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              AUTO-SYNC
            </span>
            <div className="w-14 h-14 rounded-full glass-button-emerald flex items-center justify-center mb-3.5 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6 text-emerald-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h3 className="font-bold text-base text-white whitespace-nowrap">Live Sync Playlist</h3>
            <p className="text-xs text-white/55 mt-1 text-center">
              Auto-updates when original playlist changes
            </p>
          </GlassCard>
        </div>

        {/* Static Import Playlist Card */}
        <div
          onClick={() => openImportModal('url')}
          className="text-left group cursor-pointer"
        >
          <GlassCard
            variant="liquid"
            padding="md"
            hover
            className="h-full flex flex-col items-center justify-center border border-cyan-400/25 hover:border-cyan-400/45 transition-colors min-h-[230px]"
          >
            <div className="w-14 h-14 rounded-full glass-button-cyan flex items-center justify-center mb-3.5 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <h3 className="font-bold text-base text-white whitespace-nowrap">Import Playlist</h3>
            <p className="text-xs text-white/50 mt-1 text-center">One-time URL or song list</p>
          </GlassCard>
        </div>

        {playlists.map((playlist) => (
          <PlaylistCard
            key={playlist.id}
            playlist={playlist}
            onPlay={() => {
              if (playlist.tracks.length > 0) {
                playTrack(playlist.tracks[0], playlist.tracks, 0);
              }
            }}
          />
        ))}
      </div>

      <CreatePlaylist isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
      <ImportPlaylistModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        initialMode={importInitialMode}
      />
    </div>
  );
}
