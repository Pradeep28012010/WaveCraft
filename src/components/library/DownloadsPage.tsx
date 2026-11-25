import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  useOfflineVault,
  getOfflineDetailedStorageBreakdown,
  type DetailedStorageBreakdown
} from '../../services/offlineVault';
import { usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useDownloadStore } from '../../stores/downloadStore';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import { importLocalAudioFiles, computeBitrateBreakdown } from '../../services/localAudio';
import GlassCard from '../ui/GlassCard';
import GlassButton from '../ui/GlassButton';
import GlassSelect from '../ui/GlassSelect';
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
  const likedSongs = useLibraryStore((s) => s.likedSongs);
  const startBatchDownload = useDownloadStore((s) => s.startBatchDownload);

  // Settings
  const offlineModeOnly = useSettingsStore((s) => s.offlineModeOnly ?? false);
  const toggleOfflineModeOnly = useSettingsStore((s) => s.toggleOfflineModeOnly);
  const autoCachePlayingTracks = useSettingsStore((s) => s.autoCachePlayingTracks ?? true);
  const toggleAutoCachePlayingTracks = useSettingsStore((s) => s.toggleAutoCachePlayingTracks);
  const maxCacheSizeMb = useSettingsStore((s) => s.maxCacheSizeMb ?? 1024);
  const setMaxCacheSizeMb = useSettingsStore((s) => s.setMaxCacheSizeMb);

  // Local UI State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showClearCacheConfirm, setShowClearCacheConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string, durationMs = 3500) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage('');
      toastTimerRef.current = null;
    }, durationMs);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const bitrateBreakdown = useMemo(() => computeBitrateBreakdown(offlineTracks), [offlineTracks]);
  const unCachedLiked = useMemo(() => {
    const offlineSet = new Set(offlineTracks.map((ot) => ot.id));
    return likedSongs.filter((t) => !offlineSet.has(t.id));
  }, [likedSongs, offlineTracks]);

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

  const processFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    triggerAndroidHaptic('medium');
    setIsImporting(true);
    setImportStatus(`Analyzing and importing ${files.length} audio file${files.length === 1 ? '' : 's'}...`);
    const res = await importLocalAudioFiles(files);
    refreshStorage();
    setIsImporting(false);
    setImportStatus('');
    if (res.imported.length > 0) {
      showToast(`✓ Imported ${res.imported.length} song${res.imported.length === 1 ? '' : 's'} to Offline Vault!`, 4500);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleDownloadLikedSongs = async () => {
    if (unCachedLiked.length === 0) {
      showToast('All liked songs are already stored in Offline Vault!', 3000);
      return;
    }
    triggerAndroidHaptic('medium');
    await startBatchDownload('liked_songs', 'Liked Songs', unCachedLiked);
  };

  useEffect(() => {
    refreshStorage();
  }, [offlineTracks.length]);

  useEffect(() => {
    if (!showClearConfirm && !showClearCacheConfirm) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isClearing) {
        setShowClearConfirm(false);
        setShowClearCacheConfirm(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showClearConfirm, showClearCacheConfirm, isClearing]);

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
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="pb-44 sm:pb-28 pt-2 text-white min-h-screen">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Offline Audio Vault
            </h1>
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
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.flac,.wav,.m4a,.aac,.ogg,.opus,.webm"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
          />

          <GlassButton size="sm" onClick={() => navigate('/library')}>
            ← Library
          </GlassButton>

          {/* Import Local Audio Files Button */}
          <button
            type="button"
            onClick={() => {
              triggerAndroidHaptic('light');
              fileInputRef.current?.click();
            }}
            disabled={isImporting}
            className="px-3.5 py-1.5 rounded-full glass-button-primary text-white text-xs font-black flex items-center gap-1.5 shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            title="Import local MP3, FLAC, WAV, M4A files into WaveCraft"
          >
            <span>📁 Import Local Files</span>
          </button>

          {/* 1-Tap Cache Liked Songs to Vault */}
          {unCachedLiked.length > 0 && (
            <button
              type="button"
              onClick={handleDownloadLikedSongs}
              className="px-3.5 py-1.5 rounded-full glass-button text-rose-300 hover:text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95 transition-all"
              title="Cache all un-downloaded liked songs directly into your device offline vault"
            >
              <span>❤️ Cache Liked ({unCachedLiked.length})</span>
            </button>
          )}

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

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 px-4 py-2.5 rounded-2xl bg-emerald-500/90 text-white text-xs font-black shadow-2xl backdrop-blur-md flex items-center gap-2 animate-bounce">
          <span>{toastMessage}</span>
        </div>
      )}
      {importStatus && (
        <div className="fixed top-20 right-6 z-50 px-4 py-2.5 rounded-2xl bg-cyan-600/95 text-white text-xs font-black shadow-2xl backdrop-blur-md flex items-center gap-2 animate-pulse">
          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          <span>{importStatus}</span>
        </div>
      )}

      {/* Interactive Local Audio File Drag-and-Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative overflow-hidden rounded-3xl p-5 mb-8 border-2 border-dashed transition-all duration-300 cursor-pointer text-center group ${
          isDraggingOver
            ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15 scale-[1.01] shadow-[0_0_30px_rgba(250,45,72,0.3)]'
            : 'border-white/15 hover:border-white/35 bg-white/[0.03] hover:bg-white/[0.06]'
        }`}
      >
        <div className="flex flex-col items-center justify-center gap-2.5">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
            {isDraggingOver ? '📥' : '🎵'}
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black text-white">
              {isDraggingOver ? 'Drop your audio files here to import!' : 'Drag & Drop Local Songs Here (MP3, FLAC, WAV, M4A)'}
            </h3>
            <p className="text-xs text-white/50 mt-1 max-w-lg mx-auto">
              Or click to browse your computer or phone storage. Songs are stored permanently in IndexedDB with full Web Audio Equalizer, 8D Spatial, and Visualizer DSP.
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-black uppercase tracking-wider">
              Lossless FLAC / WAV
            </span>
            <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-black uppercase tracking-wider">
              320k Studio AAC / MP3
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase tracking-wider">
              100% Offline
            </span>
          </div>
        </div>
      </div>

      {/* Storage & Breakdown Dashboard */}
      <GlassCard variant="liquid" padding="lg" className="border-0 mb-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold text-white/50 uppercase tracking-wider">
              Local Device Storage & Bitrate Manager
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl sm:text-3xl font-black text-white">
                {storageBreakdown.totalFormatted}
              </span>
              <span className="text-xs text-white/50">
                used of {storageBreakdown.quotaFormatted}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
              <span>Lossless ({bitrateBreakdown.losslessFormatted})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
              <span>320k Studio ({bitrateBreakdown.studio320Formatted})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span>Standard HD ({bitrateBreakdown.standardFormatted})</span>
            </div>
          </div>
        </div>

        {/* High-Fidelity Stacked Bitrate & Storage Progress Bar */}
        <div>
          <div className="flex items-center justify-between text-[11px] text-white/50 font-bold mb-1.5">
            <span>Bitrate Distribution</span>
            <span>{offlineTracks.length} Total Tracks</span>
          </div>
          <div className="w-full h-3.5 rounded-full bg-white/10 overflow-hidden flex p-0.5 border-0 shadow-inner">
            <div
              style={{
                width: `${bitrateBreakdown.totalBytes > 0 ? (bitrateBreakdown.losslessBytes / bitrateBreakdown.totalBytes) * 100 : 0}%`
              }}
              className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-l-full transition-all duration-500"
              title={`Lossless Hi-Res: ${bitrateBreakdown.losslessFormatted} (${bitrateBreakdown.losslessCount} tracks)`}
            />
            <div
              style={{
                width: `${bitrateBreakdown.totalBytes > 0 ? (bitrateBreakdown.studio320Bytes / bitrateBreakdown.totalBytes) * 100 : 0}%`
              }}
              className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-500"
              title={`320kbps Studio: ${bitrateBreakdown.studio320Formatted} (${bitrateBreakdown.studio320Count} tracks)`}
            />
            <div
              style={{
                width: `${bitrateBreakdown.totalBytes > 0 ? (bitrateBreakdown.standardBytes / bitrateBreakdown.totalBytes) * 100 : 0}%`
              }}
              className="h-full bg-emerald-400 rounded-r-full transition-all duration-500"
              title={`Standard HD Audio: ${bitrateBreakdown.standardFormatted} (${bitrateBreakdown.standardCount} tracks)`}
            />
          </div>
        </div>

        {/* Quality Tiers Breakdown Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-0 text-xs">
          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
            <p className="text-white/40">Lossless FLAC / WAV</p>
            <p className="text-base font-black text-purple-300 mt-0.5">
              {bitrateBreakdown.losslessCount} <span className="text-xs font-normal text-white/50">({bitrateBreakdown.losslessFormatted})</span>
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
            <p className="text-white/40">320k Studio AAC/MP3</p>
            <p className="text-base font-black text-cyan-300 mt-0.5">
              {bitrateBreakdown.studio320Count} <span className="text-xs font-normal text-white/50">({bitrateBreakdown.studio320Formatted})</span>
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
            <p className="text-white/40">Standard HD Streams</p>
            <p className="text-base font-black text-emerald-300 mt-0.5">
              {bitrateBreakdown.standardCount} <span className="text-xs font-normal text-white/50">({bitrateBreakdown.standardFormatted})</span>
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
            <p className="text-white/40">Total Audio Time</p>
            <p className="text-base font-black text-white mt-0.5">
              {formatTime(totalDuration)}
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
          <GlassSelect
            size="sm"
            prefix="Quota:"
            value={maxCacheSizeMb}
            onChange={(val) => setMaxCacheSizeMb(Number(val))}
            options={[
              { value: 500, label: '500 MB' },
              { value: 1024, label: '1 GB' },
              { value: 2048, label: '2 GB' },
              { value: 5120, label: '5 GB' },
              { value: 0, label: 'Unlimited' }
            ]}
          />

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
        {/* Category Tabs with Liquid Glass Sliding Pill */}
        <div
          className="flex items-center gap-1.5 bg-white/[0.05] p-1.5 rounded-2xl border-0 overflow-x-auto no-scrollbar relative"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {[
            { id: 'all' as const, label: `All Tracks (${offlineTracks.length})` },
            { id: 'manual' as const, label: `Playlists & Liked (${storageBreakdown.manualCount})` },
            { id: 'auto-cache' as const, label: `Smart Cache (${storageBreakdown.autoCacheCount})` }
          ].map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="relative px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer whitespace-nowrap select-none"
              >
                {isSelected && (
                  <motion.div
                    layoutId="downloads-filter-liquid-pill"
                    transition={{ type: 'spring', bounce: 0.15, duration: 0.32 }}
                    className="absolute inset-0 rounded-xl liquid-sliding-pill -z-0 pointer-events-none"
                  />
                )}
                <span
                  className={`relative z-10 transition-colors duration-150 ${
                    isSelected
                      ? 'text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sort & Search Controls */}
        <div className="flex items-center gap-3">
          {/* Sort Selector */}
          <GlassSelect
            size="sm"
            prefix="Sort:"
            value={sortBy}
            onChange={(val) => setSortBy(val as SortOption)}
            options={[
              { value: 'recent', label: 'Recently Saved' },
              { value: 'title', label: 'Title (A-Z)' },
              { value: 'artist', label: 'Artist' },
              { value: 'size', label: 'File Size' }
            ]}
          />

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
        <LayoutGroup id="downloads-track-list">
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
        </LayoutGroup>
      )}

      {/* Clear Storage Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md cursor-pointer"
            onClick={(e) => {
              if (e.target === e.currentTarget && !isClearing) setShowClearConfirm(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-md w-full p-6 rounded-3xl bg-[#0b0b14] border-0 text-white shadow-2xl space-y-4 cursor-default"
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
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md cursor-pointer"
            onClick={(e) => {
              if (e.target === e.currentTarget && !isClearing) setShowClearCacheConfirm(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-md w-full p-6 rounded-3xl bg-[#0b0b14] border-0 text-white shadow-2xl space-y-4 cursor-default"
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
