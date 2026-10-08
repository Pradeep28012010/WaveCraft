import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLibraryStore } from '../../stores/libraryStore';
import { usePlayerStore } from '../../stores/playerStore';
import TrackRow from '../ui/TrackRow';
import GlassButton from '../ui/GlassButton';
import GlassCard from '../ui/GlassCard';
import CreatePlaylist from './CreatePlaylist';
import { getHighResPlaylistCover } from './PlaylistCard';
import { formatTime } from '../../utils/formatTime';
import { exportToM3U8, exportToJSON } from '../../utils/playlistExport';
import {
  savePlaylistOffline,
  isPlaylistFullyOffline,
  getPlaylistOfflineCount,
  type PlaylistDownloadProgress
} from '../../services/offlineVault';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

export default function PlaylistView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const playlists = useLibraryStore((state) => state.playlists);
  const folders = useLibraryStore((state) => state.folders);
  const removeFromPlaylist = useLibraryStore((state) => state.removeFromPlaylist);
  const deletePlaylist = useLibraryStore((state) => state.deletePlaylist);
  const updatePlaylist = useLibraryStore((state) => state.updatePlaylist);
  const syncLivePlaylist = useLibraryStore((state) => state.syncLivePlaylist);
  const syncingPlaylistIds = useLibraryStore((state) => state.syncingPlaylistIds);
  const togglePin = useLibraryStore((state) => state.togglePinPlaylist);
  const movePlaylistToFolder = useLibraryStore((state) => state.movePlaylistToFolder);
  const addPlaylistTag = useLibraryStore((state) => state.addPlaylistTag);
  const removePlaylistTag = useLibraryStore((state) => state.removePlaylistTag);
  const playTrack = usePlayerStore((state) => state.playTrack);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [syncStatusText, setSyncStatusText] = useState('');
  const [syncProgressPct, setSyncProgressPct] = useState(0);
  const [syncResultBanner, setSyncResultBanner] = useState('');
  const [attachUrlInput, setAttachUrlInput] = useState('');
  const [showAttachSource, setShowAttachSource] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<PlaylistDownloadProgress | null>(null);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);

  const playlist = playlists.find((p) => p.id === id);
  const currentFolder = playlist?.folderId ? folders.find((f) => f.id === playlist.folderId) : undefined;
  const isSyncing = Boolean(id && syncingPlaylistIds[id]);

  const isAllOffline = useMemo(
    () => (playlist ? isPlaylistFullyOffline(playlist.tracks) : false),
    [playlist?.tracks, downloadProgress]
  );
  const offlineCount = useMemo(
    () => (playlist ? getPlaylistOfflineCount(playlist.tracks) : 0),
    [playlist?.tracks, downloadProgress]
  );

  const handleDownloadAll = async () => {
    if (!playlist || playlist.tracks.length === 0 || downloadProgress?.isDownloading) return;
    triggerAndroidHaptic('light');
    await savePlaylistOffline(playlist.tracks, (prog) => {
      setDownloadProgress({ ...prog });
    });
  };

  const handleCopyTrackList = () => {
    if (!playlist || !playlist.tracks.length) return;
    const text = playlist.tracks
      .map((t, idx) => `${idx + 1}. ${t.artist} - ${t.title}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2200);
  };

  // Auto-sync on mount & interval if Live Sync is enabled
  useEffect(() => {
    if (!playlist || !playlist.isLiveSync || !playlist.sourceUrl) return;

    const intervalMs = Math.max(5, playlist.syncIntervalMinutes || 15) * 60 * 1000;
    const elapsed = Date.now() - (playlist.lastSyncedAt || 0);

    if (elapsed > intervalMs) {
      syncLivePlaylist(playlist.id, (status, pct) => {
        setSyncStatusText(status);
        setSyncProgressPct(pct);
      }).then((res) => {
        setSyncStatusText('');
        setSyncProgressPct(0);
        if (res.added > 0 || res.removed > 0) {
          setSyncResultBanner(
            `Live Sync complete: +${res.added} new song${res.added === 1 ? '' : 's'} added${
              res.removed > 0 ? `, ${res.removed} removed` : ''
            }`
          );
        }
      });
    }

    const timer = setInterval(() => {
      syncLivePlaylist(playlist.id);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [playlist?.id, playlist?.isLiveSync, playlist?.sourceUrl, playlist?.syncIntervalMinutes]);

  if (!playlist) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-white/50">
        <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-lg mb-4">Playlist not found</p>
        <GlassButton onClick={() => navigate('/library')}>Back to Library</GlassButton>
      </div>
    );
  }

  const handleManualSync = async () => {
    if (!playlist.sourceUrl || isSyncing) return;
    setSyncResultBanner('');
    const res = await syncLivePlaylist(playlist.id, (status, pct) => {
      setSyncStatusText(status);
      setSyncProgressPct(pct);
    });
    setSyncStatusText('');
    setSyncProgressPct(0);
    if (res.added > 0 || res.removed > 0) {
      setSyncResultBanner(
        `Synced with source! +${res.added} new track${res.added === 1 ? '' : 's'} added${
          res.removed > 0 ? ` • ${res.removed} removed` : ''
        } (${res.total} total)`
      );
    } else {
      setSyncResultBanner('Up to date — matches original source playlist.');
    }
  };

  const handleAttachLiveSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attachUrlInput.trim()) return;
    updatePlaylist(playlist.id, {
      isLiveSync: true,
      sourceUrl: attachUrlInput.trim(),
      syncStrategy: 'append',
      syncIntervalMinutes: 15
    });
    setShowAttachSource(false);
    setAttachUrlInput('');
    setTimeout(() => {
      syncLivePlaylist(playlist.id, (status, pct) => {
        setSyncStatusText(status);
        setSyncProgressPct(pct);
      }).then((res) => {
        setSyncStatusText('');
        setSyncProgressPct(0);
        setSyncResultBanner(
          `Connected Live Sync! +${res.added} track${res.added === 1 ? '' : 's'} synchronized.`
        );
      });
    }, 100);
  };

  const handlePlayAll = () => {
    triggerAndroidHaptic('medium');
    if (playlist.tracks.length > 0) {
      playTrack(playlist.tracks[0], playlist.tracks, 0);
    }
  };

  const handleShuffleAll = () => {
    triggerAndroidHaptic('medium');
    if (playlist.tracks.length > 0) {
      const shuffled = [...playlist.tracks].sort(() => Math.random() - 0.5);
      playTrack(shuffled[0], shuffled, 0);
    }
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this playlist?')) {
      deletePlaylist(playlist.id);
      navigate('/library');
    }
  };

  const totalDuration = playlist.tracks.reduce((acc, track) => acc + (track.duration || 0), 0);
  const hdCoverUrl = getHighResPlaylistCover(playlist);
  const lastSyncFormatted = playlist.lastSyncedAt
    ? new Date(playlist.lastSyncedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Never';

  return (
    <div className="pb-24 pt-6 text-white min-h-screen">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-white/50 mb-6 font-semibold">
        <button
          onClick={() => navigate('/library')}
          className="hover:text-white transition-colors cursor-pointer flex items-center gap-1"
        >
          <span>←</span> <span>Library</span>
        </button>
        <span>/</span>
        {currentFolder ? (
          <span
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-bold"
            style={{
              backgroundColor: `${currentFolder.color || '#6366f1'}20`,
              borderColor: `${currentFolder.color || '#6366f1'}40`,
              color: currentFolder.color || '#a5b4fc'
            }}
          >
            <span>{currentFolder.icon || '📁'}</span>
            <span>{currentFolder.name}</span>
          </span>
        ) : (
          <span className="text-white/40">General</span>
        )}
        <span>/</span>
        <span className="text-white/90 truncate">{playlist.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row gap-8 items-end mb-8">
        <div className="w-48 h-48 md:w-60 md:h-60 flex-shrink-0 rounded-2xl shadow-2xl overflow-hidden bg-white/10 relative shadow-black/40">
          {hdCoverUrl ? (
            <img src={hdCoverUrl} alt={playlist.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-6xl font-bold text-white shadow-inner">
              {playlist.name.charAt(0)}
            </div>
          )}
          {playlist.isLiveSync && (
            <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/75 backdrop-blur-md border border-emerald-400/50 flex items-center gap-1.5 shadow-lg">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-[10px] font-extrabold text-emerald-300 tracking-wider whitespace-nowrap">
                LIVE AUTO-SYNC
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 flex-grow min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="uppercase text-xs font-bold tracking-widest text-white/60 whitespace-nowrap">
              {playlist.isLiveSync ? 'Live Syncing Playlist' : 'Playlist'}
            </span>
            {playlist.isPinned && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/35 text-[10px] font-bold text-amber-300 flex items-center gap-1 whitespace-nowrap">
                <span>📌</span> Pinned
              </span>
            )}
            {/* Folder Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowFolderDropdown(!showFolderDropdown)}
                className="px-2.5 py-0.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-[10px] font-bold text-white flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <span>{currentFolder ? currentFolder.icon || '📁' : '📁'}</span>
                <span>{currentFolder ? currentFolder.name : 'Add to Folder'}</span>
                <span className="text-[9px] opacity-60">▼</span>
              </button>

              {showFolderDropdown && (
                <div className="absolute top-full left-0 mt-1.5 w-52 rounded-xl liquid-glass border border-white/20 p-1.5 shadow-2xl z-30">
                  <div className="px-2 py-1 text-[10px] font-bold text-white/40 uppercase">
                    Select Folder
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      movePlaylistToFolder(playlist.id, undefined);
                      setShowFolderDropdown(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 cursor-pointer transition-colors ${
                      !playlist.folderId
                        ? 'bg-white/15 text-white'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span>📁</span> <span>None (Unorganized)</span>
                  </button>
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        movePlaylistToFolder(playlist.id, f.id);
                        setShowFolderDropdown(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 cursor-pointer transition-colors ${
                        playlist.folderId === f.id
                          ? 'bg-white/15 text-white'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span>{f.icon || '📁'}</span> <span className="truncate">{f.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {playlist.sourcePlatform && (
              <span className="px-2.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-[10px] font-bold text-cyan-300 whitespace-nowrap">
                Source: {playlist.sourcePlatform}
              </span>
            )}
          </div>
          <h1
            className="text-4xl md:text-6xl font-extrabold tracking-tight cursor-pointer hover:opacity-80 transition-opacity truncate"
            onClick={() => setIsEditModalOpen(true)}
          >
            {playlist.name}
          </h1>
          {playlist.description && (
            <p className="text-white/70 text-sm md:text-base mt-1 max-w-2xl">
              {playlist.description}
            </p>
          )}

          {/* Smart Mood Tags */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {(playlist.tags || []).map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-medium"
              >
                #{t}
                <button
                  type="button"
                  onClick={() => removePlaylistTag(playlist.id, t)}
                  className="hover:text-white ml-0.5 cursor-pointer text-indigo-300 text-xs"
                  title="Remove tag"
                >
                  ×
                </button>
              </span>
            ))}

            {isAddingTag ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newTagInput.trim()) {
                    addPlaylistTag(playlist.id, newTagInput);
                    setNewTagInput('');
                  }
                  setIsAddingTag(false);
                }}
                className="inline-flex items-center gap-1"
              >
                <input
                  type="text"
                  autoFocus
                  placeholder="tag name..."
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onBlur={() => {
                    if (newTagInput.trim()) {
                      addPlaylistTag(playlist.id, newTagInput);
                      setNewTagInput('');
                    }
                    setIsAddingTag(false);
                  }}
                  className="px-2.5 py-0.5 rounded-full bg-white/10 border border-white/20 text-xs text-white placeholder:text-white/40 w-24 outline-none"
                />
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingTag(true)}
                className="px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-bold text-white/60 hover:text-white cursor-pointer transition-colors"
              >
                + Add Tag
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-white/60 mt-2">
            <span className="font-medium text-white whitespace-nowrap">
              {playlist.tracks.length} songs
            </span>
            <span>•</span>
            <span className="whitespace-nowrap">{formatTime(totalDuration)}</span>
            {playlist.lastSyncedAt && (
              <>
                <span>•</span>
                <span className="text-emerald-300/90 text-xs font-semibold whitespace-nowrap">
                  Last synced at {lastSyncFormatted}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Live Auto-Sync Telemetry & Control Bar */}
      {playlist.sourceUrl ? (
        <GlassCard
          variant="liquid"
          padding="md"
          className={`mb-7 border ${
            playlist.isLiveSync ? 'border-emerald-400/35 bg-emerald-500/[0.06]' : 'border-white/15'
          }`}
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-sm font-extrabold text-white flex items-center gap-2 whitespace-nowrap">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      playlist.isLiveSync ? 'bg-emerald-400 animate-pulse' : 'bg-white/35'
                    }`}
                  />
                  {playlist.isLiveSync
                    ? 'Live Auto-Sync Connected'
                    : 'Static Imported Playlist (Live Sync Paused)'}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-[10px] font-extrabold text-emerald-300 whitespace-nowrap">
                  {playlist.syncStrategy === 'mirror' ? '🪞 Exact Mirror Mode' : '➕ Auto-Append Mode'}
                </span>
                {(playlist.lastSyncDelta || 0) > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/30 text-[10px] font-extrabold text-cyan-200 whitespace-nowrap">
                    +{playlist.lastSyncDelta} new from source
                  </span>
                )}
              </div>
              <p className="text-xs text-white/55 mt-1 truncate">
                Tracking original playlist:{' '}
                <a
                  href={playlist.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-300 hover:underline"
                >
                  {playlist.sourceUrl}
                </a>
              </p>
              {syncResultBanner && (
                <p className="text-xs font-bold text-emerald-300 mt-1.5">{syncResultBanner}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Toggle Append vs Mirror Strategy */}
              <button
                type="button"
                onClick={() =>
                  updatePlaylist(playlist.id, {
                    syncStrategy: playlist.syncStrategy === 'mirror' ? 'append' : 'mirror'
                  })
                }
                className="px-3 py-1.5 rounded-xl text-[11px] font-bold glass-button text-white/80 hover:text-white cursor-pointer whitespace-nowrap"
                title="Switch between appending new songs vs mirroring exact source removals"
              >
                Mode: {playlist.syncStrategy === 'mirror' ? 'Exact Mirror' : 'Auto-Append'}
              </button>

              {/* Toggle Auto-Sync Active */}
              <button
                type="button"
                onClick={() =>
                  updatePlaylist(playlist.id, {
                    isLiveSync: !playlist.isLiveSync
                  })
                }
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer whitespace-nowrap ${
                  playlist.isLiveSync
                    ? 'glass-button-emerald text-white'
                    : 'glass-button text-white/65 hover:text-white'
                }`}
              >
                {playlist.isLiveSync ? '● Auto-Sync ON' : '○ Auto-Sync OFF'}
              </button>

              {/* Sync Now Button */}
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
                className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold glass-button-cyan text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                <span className={isSyncing ? 'animate-spin inline-block' : ''}>↻</span>
                <span>{isSyncing ? 'Syncing Source...' : 'Sync Live Now'}</span>
              </button>
            </div>
          </div>

          {isSyncing && (
            <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
              <div className="flex justify-between text-[11px] font-bold text-emerald-200">
                <span>{syncStatusText || 'Checking source playlist for changes...'}</span>
                <span className="tabular-nums">{syncProgressPct}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-300"
                  style={{ width: `${Math.max(8, syncProgressPct)}%` }}
                />
              </div>
            </div>
          )}
        </GlassCard>
      ) : (
        <div className="mb-6">
          {!showAttachSource ? (
            <button
              type="button"
              onClick={() => setShowAttachSource(true)}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold glass-button text-emerald-300 hover:text-white flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Link External Playlist URL for Live Auto-Sync</span>
            </button>
          ) : (
            <form
              onSubmit={handleAttachLiveSource}
              className="p-3.5 rounded-2xl liquid-glass border border-emerald-400/30 flex flex-col sm:flex-row items-center gap-2.5"
            >
              <input
                type="url"
                required
                value={attachUrlInput}
                onChange={(e) => setAttachUrlInput(e.target.value)}
                placeholder="Paste Spotify or YouTube playlist URL to keep this playlist live-synced..."
                className="flex-1 w-full glass-input rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/40"
              />
              <div className="flex items-center gap-2 flex-shrink-0">
                <GlassButton type="button" size="sm" variant="ghost" onClick={() => setShowAttachSource(false)}>
                  Cancel
                </GlassButton>
                <GlassButton type="submit" size="sm" variant="primary">
                  Connect Live Sync
                </GlassButton>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={handlePlayAll}
          className="w-14 h-14 p-0 rounded-full glass-button-primary text-white flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 cursor-pointer"
          disabled={playlist.tracks.length === 0}
        >
          <svg className="w-7 h-7 block" fill="currentColor" viewBox="0 0 24 24">
            <path d="M7.5 5.65c0-.82.89-1.33 1.6-.91l10.05 6.35c.68.43.68 1.39 0 1.82L9.1 19.26c-.71.42-1.6-.09-1.6-.91V5.65z" />
          </svg>
        </button>
        <GlassButton onClick={handleShuffleAll} disabled={playlist.tracks.length === 0}>
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Shuffle
        </GlassButton>

        {/* 1-Click Batch Playlist Download to Offline Vault */}
        <button
          type="button"
          onClick={handleDownloadAll}
          disabled={playlist.tracks.length === 0 || downloadProgress?.isDownloading}
          className={`h-10 px-4 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
            downloadProgress?.isDownloading
              ? 'glass-button-cyan text-cyan-200'
              : isAllOffline
              ? 'glass-button-emerald text-emerald-200'
              : 'glass-button text-white/90 hover:text-white'
          }`}
          title={
            isAllOffline
              ? 'All songs downloaded in Offline Audio Vault'
              : 'Download entire playlist with 1 click for zero-latency offline playback'
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
              <svg className="w-4 h-4 text-emerald-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span>Offline Ready ({offlineCount})</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4 text-cyan-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Download All ({playlist.tracks.length - offlineCount})</span>
            </>
          )}
        </button>

        {/* Toggle Pin to Top Button */}
        <button
          type="button"
          onClick={() => togglePin(playlist.id)}
          className={`h-10 px-4 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            playlist.isPinned
              ? 'glass-button-amber text-amber-200'
              : 'glass-button text-white/80 hover:text-white'
          }`}
          title={playlist.isPinned ? 'Unpin from top' : 'Pin to top of library'}
        >
          <span>📌</span>
          <span>{playlist.isPinned ? 'Pinned' : 'Pin to Top'}</span>
        </button>

        <div className="flex-grow" />

        {/* Export Playlist Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu((v) => !v)}
            className="h-10 px-3.5 rounded-full glass-button flex items-center gap-1.5 text-xs font-bold text-white/80 hover:text-white transition-colors cursor-pointer"
            title="Export Playlist"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>Export</span>
          </button>

          {showExportMenu && (
            <div
              className="absolute right-0 top-12 z-30 w-56 rounded-2xl liquid-glass border border-white/20 p-2 shadow-2xl space-y-1 text-xs"
              onClick={() => setShowExportMenu(false)}
            >
              <button
                onClick={() => exportToM3U8(playlist)}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 text-white flex items-center gap-2 cursor-pointer transition-colors"
              >
                <span className="text-base">🎵</span>
                <div>
                  <div className="font-bold">M3U8 Playlist (.m3u8)</div>
                  <div className="text-[10px] text-white/50">For Apple, VLC & players</div>
                </div>
              </button>

              <button
                onClick={() => exportToJSON(playlist)}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 text-white flex items-center gap-2 cursor-pointer transition-colors"
              >
                <span className="text-base">📦</span>
                <div>
                  <div className="font-bold">WaveCraft JSON (.json)</div>
                  <div className="text-[10px] text-white/50">Full backup with metadata</div>
                </div>
              </button>

              <button
                onClick={handleCopyTrackList}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 text-white flex items-center gap-2 cursor-pointer transition-colors"
              >
                <span className="text-base">📋</span>
                <div>
                  <div className="font-bold">{copyFeedback ? 'Copied to Clipboard!' : 'Copy Track List'}</div>
                  <div className="text-[10px] text-white/50">Plain text song names</div>
                </div>
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => setIsEditModalOpen(true)}
          className="w-10 h-10 p-0 rounded-full glass-button flex items-center justify-center text-white/75 hover:text-white transition-colors cursor-pointer"
          title="Edit Playlist"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
        <button
          onClick={handleDelete}
          className="w-10 h-10 p-0 rounded-full glass-button flex items-center justify-center text-white/75 hover:text-red-400 transition-colors cursor-pointer"
          title="Delete Playlist"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Tracks */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-1.5">
        {playlist.tracks.length === 0 ? (
          <div className="text-center py-12 text-white/50 border border-dashed border-white/20 rounded-xl">
            <p className="text-lg">This playlist is empty.</p>
            <p className="text-sm mt-1">Search for songs and add them here.</p>
            <GlassButton className="mt-4" onClick={() => navigate('/search')}>
              Search Songs
            </GlassButton>
          </div>
        ) : (
          playlist.tracks.map((track, index) => (
            <TrackRow
              key={`${track.id}-${index}`}
              track={track}
              tracks={playlist.tracks}
              index={index + 1}
              onPlay={() => playTrack(track, playlist.tracks, index)}
              onRemove={() => removeFromPlaylist(playlist.id, track.id)}
            />
          ))
        )}
      </motion.div>

      <CreatePlaylist
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        editPlaylist={playlist}
      />
    </div>
  );
}
