import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibraryStore } from '../../stores/libraryStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useOfflineVault } from '../../services/offlineVault';
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
  const playTrack = usePlayerStore((state) => state.playTrack);
  const { offlineTracks } = useOfflineVault();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [showOfflineVault, setShowOfflineVault] = useState(false);

  return (
    <div className="pb-24 pt-2 text-white min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Your Library</h1>
          <p className="text-xs text-white/50 mt-1">
            All your liked songs, offline 320kbps vault, listening history, and custom playlists
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <GlassButton size="sm" onClick={() => setIsImportModalOpen(true)}>
            ↓ Import Playlist
          </GlassButton>
          <GlassButton variant="primary" size="sm" onClick={() => setIsCreateModalOpen(true)}>
            + New Playlist
          </GlassButton>
        </div>
      </div>

      {/* Quick Access Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-10">
        <Link to="/liked" className="group">
          <GlassCard variant="liquid" padding="md" hover className="flex items-center gap-5 h-full">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-500 via-pink-600 to-purple-700 flex items-center justify-center flex-shrink-0 shadow-xl group-hover:scale-105 transition-transform">
              <svg className="w-9 h-9 text-white drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold mb-1">Liked Songs</h2>
              <p className="text-sm text-white/60">{likedSongs.length} saved tracks</p>
            </div>
          </GlassCard>
        </Link>

        <Link to="/recent" className="group">
          <GlassCard variant="liquid" padding="md" hover className="flex items-center gap-5 h-full">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 via-blue-600 to-cyan-600 flex items-center justify-center flex-shrink-0 shadow-xl group-hover:scale-105 transition-transform">
              <svg className="w-9 h-9 text-white drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold mb-1">Recently Played</h2>
              <p className="text-sm text-white/60">{recentlyPlayed.length} tracks in history</p>
            </div>
          </GlassCard>
        </Link>

        <div
          onClick={() => setShowOfflineVault((v) => !v)}
          className="group cursor-pointer"
        >
          <GlassCard
            variant="liquid"
            padding="md"
            hover
            className={`flex items-center gap-5 h-full border ${
              showOfflineVault ? 'border-emerald-400/50 bg-emerald-500/10' : ''
            }`}
          >
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 flex items-center justify-center flex-shrink-0 shadow-xl group-hover:scale-105 transition-transform">
              <span className="text-3xl">⚡</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold mb-1">Offline Vault</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  320k LOCAL
                </span>
              </div>
              <p className="text-sm text-white/60">
                {offlineTracks.length} zero-internet tracks
              </p>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Expandable Offline Vault Section */}
      {showOfflineVault && (
        <GlassCard variant="liquid" padding="lg" className="mb-10 border border-emerald-400/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
                <span>⚡ Offline 320kbps Audio Vault</span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
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

      <h2 className="text-2xl font-bold mb-5 tracking-tight">Playlists</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
        {/* Create Playlist Card */}
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="text-left group outline-none cursor-pointer"
        >
          <GlassCard
            padding="md"
            className="h-full flex flex-col items-center justify-center border-dashed border-2 border-white/20 bg-white/[0.02] hover:bg-white/[0.06] transition-all min-h-[230px]"
          >
            <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-[var(--color-accent)] transition-all">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h3 className="font-bold text-base text-white">Create Playlist</h3>
            <p className="text-xs text-white/45 mt-1">Build a custom mix</p>
          </GlassCard>
        </button>

        {/* Import Playlist Card */}
        <button
          onClick={() => setIsImportModalOpen(true)}
          className="text-left group outline-none cursor-pointer"
        >
          <GlassCard
            padding="md"
            className="h-full flex flex-col items-center justify-center border-dashed border-2 border-emerald-400/25 bg-emerald-500/[0.03] hover:bg-emerald-500/[0.08] transition-all min-h-[230px]"
          >
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-white transition-all">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <h3 className="font-bold text-base text-white">Import Playlist</h3>
            <p className="text-xs text-white/50 mt-1 text-center">From playlist URLs or song lists</p>
          </GlassCard>
        </button>

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
      <ImportPlaylistModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} />
    </div>
  );
}
