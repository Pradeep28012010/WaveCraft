import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useOfflineVault,
  getOfflineDetailedStorageBreakdown,
  type DetailedStorageBreakdown
} from '../../services/offlineVault';
import { usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import GlassCard from '../ui/GlassCard';
import GlassButton from '../ui/GlassButton';
import TrackRow from '../ui/TrackRow';
import { formatTime } from '../../utils/formatTime';

type FilterTab = 'all' | 'manual' | 'auto-cache';
type SortOption = 'recent' | 'title' | 'artist' | 'size';

export default function DownloadsPage() {
  const navigate = useNavigate();
  const {
    offlineTracks,
    clearAllOfflineTracks,
    clearAutoCacheOnly
  } = useOfflineVault();
  const playTrack = usePlayerStore((s) => s.playTrack);
  const setQueue = usePlayerStore((s) => s.setQueue);

  // Settings
  const offlineModeOnly = useSettingsStore((s) => s.offlineModeOnly ?? false);
  const toggleOfflineModeOnly = useSettingsStore((s) => s.toggleOfflineModeOnly);
  const autoCachePlayingTracks = useSettingsStore((s) => s.autoCachePlayingTracks ?? true);
  const toggleAutoCachePlayingTracks = useSettingsStore((s) => s.toggleAutoCachePlayingTracks);
  const maxCacheSizeMb = useSettingsStore((s) => s.maxCacheSizeMb ?? 1024);
  const setMaxCacheSizeMb = useSettingsStore((s) => s.setMaxCacheSizeMb);

  // Local UI State
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showClearCacheConfirm, setShowClearCacheConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [storageBreakdown, setStorageBreakdown] = useState<DetailedStorageBreakdown>({
    totalUsedBytes: 0,
    manualBytes: 0,
    autoCacheBytes: 0,
    quotaBytes: 0,
    availableBytes: 0,
    manualFormatted: '0 MB',
    autoCacheFormatted: '0 MB',
    totalFormatted: '0 MB',
    quotaFormatted: 'Calculating...',
    availableFormatted: 'Calculating...',
    percentUsed: 0,
    manualCount: 0,
    autoCacheCount: 0,
    totalCount: 0
  });

  const refreshStorage = () => {
    getOfflineDetailedStorageBreakdown().then((info) => {
      setStorageBreakdown(info);
    });
  };

  useEffect(() => {
    refreshStorage();
  }, [offlineTracks.length]);

  // Tab filtering
  const tabFilteredTracks = useMemo(() => {
    if (activeTab === 'manual') {
      return offlineTracks.filter((t) => t.offlineSource !== 'auto-cache');
    }
    if (activeTab === 'auto-cache') {
      return offlineTracks.filter((t) => t.offlineSource === 'auto-cache');
    }
    return offlineTracks;
  }, [offlineTracks, activeTab]);

  // Search filtering
  const searchedTracks = useMemo(() => {
    if (!searchQuery.trim()) return tabFilteredTracks;
    const q = searchQuery.toLowerCase().trim();
    return tabFilteredTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        (t.album && t.album.toLowerCase().includes(q))
    );
  }, [tabFilteredTracks, searchQuery]);

  // Sorting
  const sortedTracks = useMemo(() => {
    const list = [...searchedTracks];
    switch (sortBy) {
      case 'title':
        return list.sort((a, b) => a.title.localeCompare(b.title));
      case 'artist':
        return list.sort((a, b) => a.artist.localeCompare(b.artist));
      case 'size':
        return list.sort((a, b) => (b.fileSizeBytes || 0) - (a.fileSizeBytes || 0));
      case 'recent':
      default:
        return list.sort((a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0));
    }
  }, [searchedTracks, sortBy]);

  const totalDuration = useMemo(() => {
    return sortedTracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  }, [sortedTracks]);

  const handlePlayAll = (shuffle = false) => {
    if (sortedTracks.length === 0) return;
    let list = [...sortedTracks];
    if (shuffle) {
      list = list.sort(() => Math.random() - 0.5);
    }
    setQueue(list);
    playTrack(list[0], list, 0);
  };

  const handleConfirmClearAll = async () => {
    setIsClearing(true);
    await clearAllOfflineTracks();
    setIsClearing(false);
    setShowClearConfirm(false);
    refreshStorage();
  };

  const handleConfirmClearAutoCache = async () => {
    setIsClearing(true);
    await clearAutoCacheOnly();
    setIsClearing(false);
    setShowClearCacheConfirm(false);
    refreshStorage();
  };

  const handleExportCatalog = () => {
    if (offlineTracks.length === 0) return;
    const catalog = {
      app: 'WaveCraft Offline Audio Vault',
      exportedAt: new Date().toISOString(),
      trackCount: offlineTracks.length,
      tracks: offlineTracks.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        duration: t.duration,
        youtubeId: t.youtubeId,
        quality: t.quality,
        fileSizeBytes: t.fileSizeBytes,
        offlineSource: t.offlineSource || 'manual',
        downloadedAt: t.downloadedAt
      }))
    };
    const blob = new Blob([JSON.stringify(catalog, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WaveCraft_Offline_Catalog_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Stacked progress bar ratios
  const totalBar = Math.max(1, storageBreakdown.quotaBytes || storageBreakdown.totalUsedBytes);
  const manualRatio = Math.min(100, (storageBreakdown.manualBytes / totalBar) * 100);
  const autoCacheRatio = Math.min(100, (storageBreakdown.autoCacheBytes / totalBar) * 100);

  return (
    <div className="pb-44 sm:pb-28 pt-2 text-white min-h-screen">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Offline Audio Vault
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border-0 text-[11px] font-black text-emerald-300 uppercase tracking-wider">
              100% Offline
            </span>
            <button
              onClick={() => toggleOfflineModeOnly()}
              className={`px-3 py-1 rounded-full border text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                offlineModeOnly
                  ? 'bg-emerald-500/25 border-emerald-400/50 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                  : 'bg-white/10 border-white/15 text-white/70 hover:text-white'
              }`}
              title={
                offlineModeOnly
                  ? 'Offline Playback Only is active'
                  : 'Click to enforce Offline Playback Only'
              }
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  offlineModeOnly ? 'bg-emerald-400' : 'bg-white/40'
                }`}
              />
              <span>{offlineModeOnly ? '⚡ Offline Vault Mode' : 'Online Stream Mode'}</span>
            </button>
          </div>
          <p className="text-xs text-white/50 mt-1.5">
            IndexedDB audio blobs cached on device. Zero internet required, 0ms buffer delay.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <GlassButton size="sm" onClick={() => navigate('/library')}>
            ← Library
          </GlassButton>
          {offlineTracks.length > 0 && (
            <>
              <GlassButton
                variant="primary"
                size="sm"
                onClick={() => handlePlayAll(false)}
                className="gap-2"
              >
                <span>▶ Play All ({sortedTracks.length})</span>
              </GlassButton>
              <GlassButton size="sm" onClick={() => handlePlayAll(true)}>
                🔀 Shuffle
              </GlassButton>
              <button
                type="button"
                onClick={handleExportCatalog}
                className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border-0 text-white/90 text-xs font-bold transition cursor-pointer"
                title="Export list of offline tracks to JSON"
              >
                📋 Export
              </button>
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="px-3 py-1.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border-0 text-rose-300 text-xs font-bold transition cursor-pointer"
                title="Free up device storage"
              >
                Purge Storage
              </button>
            </>
          )}
        </div>
      </div>

      {/* Storage & Breakdown Dashboard */}
      <GlassCard variant="liquid" padding="lg" className="border-0 mb-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold text-white/50 uppercase tracking-wider">
              Local Device Storage Breakdown
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-black text-white">
                {storageBreakdown.totalFormatted}
              </span>
              <span className="text-xs text-white/50">
                used of {storageBreakdown.quotaFormatted}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-md bg-emerald-400" />
              <span>
                Saved Playlists ({storageBreakdown.manualFormatted})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-md bg-cyan-400" />
              <span>
                Smart Auto-Cache ({storageBreakdown.autoCacheFormatted})
              </span>
            </div>
          </div>
        </div>

        {/* High-Fidelity Stacked Storage Progress Bar */}
        <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden flex p-0.5 border-0">
          <div
            style={{ width: `${Math.max(2, manualRatio)}%` }}
            className="h-full bg-emerald-400 rounded-l-full transition-all duration-500"
            title={`Manual downloads: ${storageBreakdown.manualFormatted}`}
          />
          <div
            style={{ width: `${Math.max(1, autoCacheRatio)}%` }}
            className="h-full bg-cyan-400 transition-all duration-500"
            title={`Smart Auto-Cache: ${storageBreakdown.autoCacheFormatted}`}
          />
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-0 text-xs">
          <div>
            <p className="text-white/40">Total Saved Tracks</p>
            <p className="text-base font-bold text-white">{offlineTracks.length} Songs</p>
          </div>
          <div>
            <p className="text-white/40">Total Audio Time</p>
            <p className="text-base font-bold text-white">{formatTime(totalDuration)}</p>
          </div>
          <div>
            <p className="text-white/40">Manual Downloads</p>
            <p className="text-base font-bold text-emerald-300">
              {storageBreakdown.manualCount} tracks
            </p>
          </div>
          <div>
            <p className="text-white/40">Smart Auto-Cached</p>
            <p className="text-base font-bold text-cyan-300">
              {storageBreakdown.autoCacheCount} tracks
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Smart Auto-Cache & Caching Controls Banner */}
      <div className="p-4 rounded-3xl bg-white/[0.04] border-0 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border-0 flex items-center justify-center text-xl flex-shrink-0">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-white">Smart Auto-Cache Engine</h3>
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-black uppercase">
                Zero-Lag
              </span>
            </div>
            <p className="text-xs text-white/60 mt-0.5">
              Automatically caches tracks as you listen and prefetches next songs for gapless playback.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Cache Limit Selector */}
          <div className="flex items-center gap-1.5 text-xs text-white/70">
            <span className="text-[11px] font-bold">Quota:</span>
            <select
              value={maxCacheSizeMb}
              onChange={(e) => setMaxCacheSizeMb(Number(e.target.value))}
              className="px-2.5 py-1.5 rounded-xl bg-white/10 border-0 text-white text-xs outline-none cursor-pointer"
            >
              <option value={500} className="bg-[#0c0d18] text-white">500 MB</option>
              <option value={1024} className="bg-[#0c0d18] text-white">1 GB</option>
              <option value={2048} className="bg-[#0c0d18] text-white">2 GB</option>
              <option value={5120} className="bg-[#0c0d18] text-white">5 GB</option>
              <option value={0} className="bg-[#0c0d18] text-white">Unlimited</option>
            </select>
          </div>

          {/* Toggle Auto-Cache Button */}
          <button
            type="button"
            onClick={() => toggleAutoCachePlayingTracks()}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer border ${
              autoCachePlayingTracks
                ? 'bg-cyan-500/25 border-cyan-400/50 text-cyan-200'
                : 'bg-white/10 border-white/15 text-white/50 hover:text-white'
            }`}
          >
            {autoCachePlayingTracks ? '✓ Auto-Cache ON' : '✕ Auto-Cache OFF'}
          </button>

          {/* Clear Only Auto-Cache Button */}
          {storageBreakdown.autoCacheCount > 0 && (
            <button
              type="button"
              onClick={() => setShowClearCacheConfirm(true)}
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border-0 text-xs font-bold text-white transition cursor-pointer"
              title="Clears temporary auto-cache while keeping all manually saved playlists and liked songs"
            >
              Clear Auto-Cache ({storageBreakdown.autoCacheFormatted})
            </button>
          )}
        </div>
      </div>

      {/* Tabs, Search & Sort Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        {/* Category Tabs */}
        <div
          className="flex items-center gap-1.5 bg-white/[0.05] p-1.5 rounded-2xl border-0 overflow-x-auto overflow-y-hidden no-scrollbar"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
              activeTab === 'all'
                ? 'bg-white/20 text-white shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            All Tracks ({offlineTracks.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
              activeTab === 'manual'
                ? 'bg-emerald-500/25 text-emerald-300 border-0 shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            Playlists & Liked ({storageBreakdown.manualCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('auto-cache')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer whitespace-nowrap ${
              activeTab === 'auto-cache'
                ? 'bg-cyan-500/25 text-cyan-300 border-0 shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            Smart Cache ({storageBreakdown.autoCacheCount})
          </button>
        </div>

        {/* Sort & Search Controls */}
        <div className="flex items-center gap-3">
          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 text-xs text-white/60 flex-shrink-0">
            <span>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-2.5 py-1.5 rounded-xl bg-white/10 border-0 text-white text-xs outline-none cursor-pointer"
            >
              <option value="recent" className="bg-[#0c0d18] text-white">Recently Saved</option>
              <option value="title" className="bg-[#0c0d18] text-white">Title (A-Z)</option>
              <option value="artist" className="bg-[#0c0d18] text-white">Artist</option>
              <option value="size" className="bg-[#0c0d18] text-white">File Size</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search offline tracks..."
              className="w-full px-3.5 py-1.5 pl-8 rounded-xl bg-white/[0.06] border-0 text-white placeholder-white/40 text-xs outline-none focus:ring-1 focus:ring-emerald-500/50 transition backdrop-blur-xl"
            />
            <span className="absolute left-2.5 top-2 text-white/40 text-xs pointer-events-none">
              🔍
            </span>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1.5 text-white/40 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Track List or Empty State */}
      {offlineTracks.length === 0 ? (
        <GlassCard variant="liquid" padding="lg" className="text-center py-16 border-0">
          <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border-0 flex items-center justify-center mx-auto mb-5 text-4xl shadow-xl">
            ⚡
          </div>
          <h2 className="text-2xl font-black text-white mb-2">No Offline Tracks Yet</h2>
          <p className="text-sm text-white/60 max-w-md mx-auto mb-6 leading-relaxed">
            Download entire playlists with 1 tap or let Smart Auto-Cache save your favorite songs in the background. Keep your music playing seamlessly with zero internet connection.
          </p>
          <div className="flex justify-center gap-3">
            <GlassButton variant="primary" onClick={() => navigate('/')}>
              Explore Music
            </GlassButton>
            <GlassButton onClick={() => navigate('/library')}>
              Go to Playlists
            </GlassButton>
          </div>
        </GlassCard>
      ) : sortedTracks.length === 0 ? (
        <div className="text-center py-16 text-white/50 text-sm">
          No downloaded tracks match &ldquo;{searchQuery}&rdquo; in this tab.
        </div>
      ) : (
        <div className="space-y-1.5">
          {sortedTracks.map((track, idx) => (
            <TrackRow
              key={track.id}
              track={track}
              tracks={sortedTracks}
              index={idx + 1}
            />
          ))}
        </div>
      )}

      {/* Clear Storage Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="max-w-md w-full p-6 rounded-3xl bg-[#0b0b14] border-0 text-white shadow-2xl space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border-0 flex items-center justify-center text-xl mx-auto">
                🗑
              </div>
              <h3 className="text-lg font-extrabold text-center">Purge Offline Audio Vault?</h3>
              <p className="text-xs text-white/60 text-center leading-relaxed">
                This will delete all {offlineTracks.length} downloaded audio files from your device storage ({storageBreakdown.totalFormatted}). Your liked songs, playlists, and listening history will NOT be deleted.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  disabled={isClearing}
                  className="flex-1 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClearAll}
                  disabled={isClearing}
                  className="flex-1 py-2.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer disabled:opacity-60"
                >
                  {isClearing ? 'Purging...' : 'Delete All Audio'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Clear Auto-Cache Confirmation Modal */}
      <AnimatePresence>
        {showClearCacheConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="max-w-md w-full p-6 rounded-3xl bg-[#0b0b14] border-0 text-white shadow-2xl space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border-0 flex items-center justify-center text-xl mx-auto">
                🧹
              </div>
              <h3 className="text-lg font-extrabold text-center">Clear Smart Auto-Cache?</h3>
              <p className="text-xs text-white/60 text-center leading-relaxed">
                This will remove {storageBreakdown.autoCacheCount} temporarily auto-cached songs ({storageBreakdown.autoCacheFormatted}). All your explicitly downloaded playlists and liked songs will be 100% preserved.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClearCacheConfirm(false)}
                  disabled={isClearing}
                  className="flex-1 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClearAutoCache}
                  disabled={isClearing}
                  className="flex-1 py-2.5 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition cursor-pointer disabled:opacity-60"
                >
                  {isClearing ? 'Clearing...' : 'Clear Auto-Cache'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
