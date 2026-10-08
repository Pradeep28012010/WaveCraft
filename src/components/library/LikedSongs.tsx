import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useLibraryStore } from '../../stores/libraryStore';
import { usePlayerStore } from '../../stores/playerStore';
import TrackRow from '../ui/TrackRow';
import GlassButton from '../ui/GlassButton';
import GlassSelect from '../ui/GlassSelect';
import {
  savePlaylistOffline,
  isPlaylistFullyOffline,
  getPlaylistOfflineCount,
  type PlaylistDownloadProgress
} from '../../services/offlineVault';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

export default function LikedSongs() {
  const likedSongs = useLibraryStore((state) => state.likedSongs);
  const playTrack = usePlayerStore((state) => state.playTrack);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'artist'>('date');

  const filteredAndSortedSongs = useMemo(() => {
    let result = likedSongs.filter((t) => t && typeof t === 'object' && t.title);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (track) =>
          track.title.toLowerCase().includes(q) ||
          track.artist.toLowerCase().includes(q)
      );
    }

    if (sortBy === 'title') {
      result = [...result].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'artist') {
      result = [...result].sort((a, b) => a.artist.localeCompare(b.artist));
    }

    return result;
  }, [likedSongs, searchQuery, sortBy]);

  const [downloadProgress, setDownloadProgress] = useState<PlaylistDownloadProgress | null>(null);

  const isAllOffline = useMemo(
    () => isPlaylistFullyOffline(filteredAndSortedSongs),
    [filteredAndSortedSongs, downloadProgress]
  );
  const offlineCount = useMemo(
    () => getPlaylistOfflineCount(filteredAndSortedSongs),
    [filteredAndSortedSongs, downloadProgress]
  );

  const handleDownloadAll = async () => {
    if (filteredAndSortedSongs.length === 0 || downloadProgress?.isDownloading) return;
    triggerAndroidHaptic('light');
    await savePlaylistOffline(filteredAndSortedSongs, (prog) => {
      setDownloadProgress({ ...prog });
    });
  };

  const handlePlayAll = () => {
    triggerAndroidHaptic('medium');
    if (filteredAndSortedSongs.length > 0) {
      playTrack(filteredAndSortedSongs[0], filteredAndSortedSongs, 0);
    }
  };

  const handleShuffleAll = () => {
    triggerAndroidHaptic('medium');
    if (filteredAndSortedSongs.length > 0) {
      const shuffled = [...filteredAndSortedSongs].sort(() => Math.random() - 0.5);
      playTrack(shuffled[0], shuffled, 0);
    }
  };

  return (
    <div className="pb-24 pt-2 text-white min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-7 items-start md:items-end mb-8 p-6 rounded-3xl liquid-glass">
        <div className="w-40 h-40 md:w-48 md:h-48 flex-shrink-0 rounded-2xl shadow-2xl overflow-hidden bg-gradient-to-br from-rose-500 via-pink-600 to-purple-700 flex items-center justify-center">
          <svg className="w-20 h-20 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </div>

        <div className="flex flex-col gap-1.5 flex-grow">
          <span className="uppercase text-xs font-bold tracking-widest text-white/60">
            Collection
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">Liked Songs</h1>
          <p className="text-sm text-white/60 mt-1">
            {filteredAndSortedSongs.length} favorite tracks • 320kbps Studio HD
          </p>
        </div>
      </div>

      {/* Actions and Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handlePlayAll}
            className="px-6 py-2.5 rounded-full bg-[var(--color-accent)] text-white font-bold text-sm flex items-center gap-2 hover:scale-105 transition-transform shadow-lg disabled:opacity-50 cursor-pointer"
            disabled={filteredAndSortedSongs.length === 0}
          >
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span>Play All</span>
          </button>
          <GlassButton onClick={handleShuffleAll} disabled={filteredAndSortedSongs.length === 0}>
            Shuffle
          </GlassButton>

          {/* 1-Click Download All to Offline Audio Vault */}
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={filteredAndSortedSongs.length === 0 || downloadProgress?.isDownloading}
            className={`h-10 px-4 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
              downloadProgress?.isDownloading
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                : isAllOffline
                ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200 hover:bg-emerald-500/30'
                : 'glass-button text-white/90 hover:text-white border-white/15'
            }`}
            title={
              isAllOffline
                ? 'All favorite songs saved in Offline Audio Vault'
                : 'Download all liked songs with 1 click for zero-latency offline playback'
            }
          >
            {downloadProgress?.isDownloading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-cyan-300 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <span>
                  Downloading {downloadProgress.completed}/{downloadProgress.total} (
                  {Math.round((downloadProgress.completed / Math.max(1, downloadProgress.total)) * 100)}%)
                </span>
              </>
            ) : isAllOffline ? (
              <>
                <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span>Offline Ready ({offlineCount})</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 text-cyan-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download All ({filteredAndSortedSongs.length - offlineCount})</span>
              </>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Filter liked songs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-52 glass-input rounded-full py-2 px-4 text-sm text-white placeholder:text-white/35"
          />
          <GlassSelect
            value={sortBy}
            onChange={(val) => setSortBy(val as 'date' | 'title' | 'artist')}
            options={[
              { value: 'date', label: 'Recently Added' },
              { value: 'title', label: 'Title (A–Z)' },
              { value: 'artist', label: 'Artist (A–Z)' }
            ]}
          />
        </div>
      </div>

      {/* Tracks */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-1.5">
        {filteredAndSortedSongs.length === 0 ? (
          <div className="text-center py-16 text-white/50 glass rounded-2xl">
            <p className="text-lg font-semibold text-white">No liked songs yet</p>
            <p className="text-sm mt-1">Tap the heart icon on any track to save it here.</p>
          </div>
        ) : (
          filteredAndSortedSongs.map((track, index) => (
            <TrackRow
              key={track.id}
              track={track}
              tracks={filteredAndSortedSongs}
              index={index + 1}
              onPlay={(t) => playTrack(t, filteredAndSortedSongs, index)}
            />
          ))
        )}
      </motion.div>
    </div>
  );
}
