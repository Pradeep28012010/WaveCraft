import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

import { useLibraryStore } from '../../stores/libraryStore';
import { usePlayerStore } from '../../stores/playerStore';
import TrackRow from '../ui/TrackRow';
import GlassButton from '../ui/GlassButton';
import CreatePlaylist from './CreatePlaylist';
import { getHighResPlaylistCover } from './PlaylistCard';
import { exportToM3U8, exportToJSON } from '../../utils/playlistExport';
import {
  isPlaylistFullyOffline,
  getPlaylistOfflineCount
} from '../../services/offlineVault';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import { useDownloadStore } from '../../stores/downloadStore';

export default function PlaylistView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const playlists = useLibraryStore((state) => state.playlists);
  const isLoading = useLibraryStore((state) => state.isLoading);
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
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const activeDownloadJob = useDownloadStore((s) => s.activeJob);
  const startBatchDownload = useDownloadStore((s) => s.startBatchDownload);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);

  const playlist = playlists.find((p) => p.id === id);
  const currentFolder = playlist?.folderId ? folders.find((f) => f.id === playlist.folderId) : undefined;
  const isSyncing = Boolean(id && syncingPlaylistIds[id]);

  const tracks = useMemo(() => (Array.isArray(playlist?.tracks) ? playlist.tracks : []), [playlist?.tracks]);

  const isCurrentDownloading = Boolean(
    activeDownloadJob && activeDownloadJob.id === playlist?.id && activeDownloadJob.isDownloading
  );

  const isAllOffline = useMemo(
    () => (playlist ? isPlaylistFullyOffline(tracks) : false),
    [playlist, tracks, activeDownloadJob]
  );
  const offlineCount = useMemo(
    () => (playlist ? getPlaylistOfflineCount(tracks) : 0),
    [playlist, tracks, activeDownloadJob]
  );

  const handleDownloadAll = async () => {
    if (!playlist || tracks.length === 0 || isCurrentDownloading) return;
    triggerAndroidHaptic('light');
    await startBatchDownload(playlist.id, playlist.name, tracks);
  };

  const handleCopyTrackList = () => {
    if (!playlist || !tracks.length) return;
    const text = tracks
      .map((t, idx) => `${idx + 1}. ${t.artist} - ${t.title}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2200);
  };

  // Auto-sync on mount & interval if Live Sync is enabled
  useEffect(() => {
    if (!playlist || !playlist.isLiveSync || !playlist.sourceUrl) return;

    let isCancelled = false;
    const intervalMs = Math.max(5, playlist.syncIntervalMinutes || 15) * 60 * 1000;
    const elapsed = Date.now() - (playlist.lastSyncedAt || 0);

    if (elapsed > intervalMs) {
      syncLivePlaylist(playlist.id, (status, pct) => {
        if (!isCancelled) {
          setSyncStatusText(status);
          setSyncProgressPct(pct);
        }
      }).then((res) => {
        if (!isCancelled) {
          setSyncStatusText('');
          setSyncProgressPct(0);
          if (res.added > 0 || res.removed > 0) {
            setSyncResultBanner(
              `Live Sync complete: +${res.added} new song${res.added === 1 ? '' : 's'} added${
                res.removed > 0 ? `, ${res.removed} removed` : ''
              }`
            );
          }
        }
      });
    }

    const timer = setInterval(() => {
      syncLivePlaylist(playlist.id);
    }, intervalMs);

    return () => {
      isCancelled = true;
      clearInterval(timer);
    };
  }, [playlist?.id, playlist?.isLiveSync, playlist?.sourceUrl, playlist?.syncIntervalMinutes]);

  if (!playlist) {
    if (isLoading) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-white/50">
          <div className="w-8 h-8 border-2 border-white/20 border-t-[var(--color-accent)] rounded-full animate-spin" />
          <p className="text-xs font-semibold text-white/40">Loading playlist...</p>
        </div>
      );
    }
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
    if (tracks.length > 0) {
      playTrack(tracks[0], tracks, 0);
    }
  };

  const handleShuffleAll = () => {
    triggerAndroidHaptic('medium');
    if (tracks.length > 0) {
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      playTrack(shuffled[0], shuffled, 0);
    }
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this playlist?')) {
      deletePlaylist(playlist.id);
      navigate('/library');
    }
  };

  const totalDuration = tracks.reduce((acc, track) => acc + (track?.duration || 0), 0);
  const formattedPlaylistDuration = useMemo(() => {
    if (!totalDuration) return '0 min';
    const hrs = Math.floor(totalDuration / 3600);
    const mins = Math.floor((totalDuration % 3600) / 60);
    if (hrs > 0) {
      return `${hrs} hr ${mins} min`;
    }
    return `${mins} min`;
  }, [totalDuration]);
  const hdCoverUrl = getHighResPlaylistCover(playlist);
  const lastSyncFormatted = playlist.lastSyncedAt
    ? new Date(playlist.lastSyncedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Never';

  return (
    <div className="relative pb-44 sm:pb-24 pt-4 text-white min-h-screen">
      {/* Navigation Breadcrumb */}
      <div className="relative z-10 flex items-center gap-2 text-xs font-semibold text-white/50 mb-6">
        <button
          onClick={() => navigate('/library')}
          className="px-3 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 border border-white/[0.08]"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>Library</span>
        </button>
        <span className="text-white/20">/</span>
        {currentFolder ? (
          <span
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border border-white/10"
            style={{
              backgroundColor: `${currentFolder.color || '#6366f1'}20`,
              color: currentFolder.color || '#a5b4fc'
            }}
          >
            <span>{currentFolder.icon || '📁'}</span>
            <span>{currentFolder.name}</span>
          </span>
        ) : (
          <span className="text-white/40">General</span>
        )}
        <span className="text-white/20">/</span>
        <span className="text-white/80 font-bold truncate max-w-[200px] sm:max-w-md">{playlist.name}</span>
      </div>

      {/* Editorial Playlist Hero */}
      <div className="relative z-10 flex flex-col sm:flex-row gap-5 sm:gap-6 items-start sm:items-end mb-5">
        {/* Compact Squircle Cover Artwork with 3D Specular Sheen */}
        <div className="relative w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 flex-shrink-0 rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_16px_36px_rgba(0,0,0,0.6)] bg-white/10 [clip-path:inset(0_round_1.25rem)] [-webkit-clip-path:inset(0_round_1.25rem)] group/cover">
          {hdCoverUrl ? (
            <img
              src={hdCoverUrl}
              alt={playlist.name}
              className="w-full h-full object-cover group-hover/cover:scale-105 transition-transform duration-700"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-5xl font-bold text-white shadow-inner">
              {playlist.name.charAt(0)}
            </div>
          )}
          {/* Subtle Top-Light Specular Sheen */}
          <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />

          {playlist.isLiveSync && (
            <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-emerald-500/30 flex items-center gap-1 shadow-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px] font-black text-emerald-300 tracking-wider whitespace-nowrap">
                LIVE SYNC
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5 flex-grow min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="uppercase text-[11px] font-black tracking-widest text-white/50 whitespace-nowrap">
              {playlist.isLiveSync ? 'Live Synced Playlist' : 'Playlist'}
            </span>
            {playlist.sourcePlatform && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#1ed760]/15 text-[#1ed760] border border-[#1ed760]/25 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1ed760] animate-pulse" />
                {playlist.sourcePlatform}
              </span>
            )}
            {playlist.isPinned && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30 flex items-center gap-1 whitespace-nowrap">
                <span>📌</span> Pinned
              </span>
            )}
            {/* Folder Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowFolderDropdown(!showFolderDropdown)}
                className="px-2.5 py-0.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white/80 hover:text-white border border-white/[0.08] text-[10px] font-bold flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <span>{currentFolder ? currentFolder.icon || '📁' : '📁'}</span>
                <span>{currentFolder ? currentFolder.name : 'Add to Folder'}</span>
                <span className="text-[9px] opacity-60">▼</span>
              </button>

              {showFolderDropdown && (
                <div className="absolute top-full left-0 mt-1.5 w-52 rounded-2xl bg-[#12131e]/95 backdrop-blur-2xl border border-white/10 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-30">
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
          </div>

          <h1
            className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-[-0.03em] leading-tight text-white cursor-pointer hover:text-[var(--color-accent)] transition-colors truncate"
            onClick={() => setIsEditModalOpen(true)}
            title="Click to edit playlist"
          >
            {playlist.name}
          </h1>

          {playlist.description && (
            <p className="text-white/60 text-xs sm:text-sm max-w-2xl font-medium leading-relaxed line-clamp-2">
              {playlist.description}
            </p>
          )}

          {/* Smart Mood Tags */}
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {(playlist.tags || []).map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/25 text-indigo-200 text-xs font-medium"
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
                  className="px-2.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-xs text-white placeholder:text-white/40 w-24 outline-none"
                />
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingTag(true)}
                className="px-2.5 py-0.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[11px] font-bold text-white/70 hover:text-white cursor-pointer transition-all"
              >
                + Add Tag
              </button>
            )}
          </div>

          {/* Clean Stats Bar (Zero Double-Bullet Glitch) */}
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-white/55 mt-1.5 font-medium">
            <span className="font-bold text-white whitespace-nowrap">
              {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
            </span>
            <span>•</span>
            <span className="whitespace-nowrap">{formattedPlaylistDuration}</span>
            {playlist.sourceUrl && (
              <>
                <span>•</span>
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 transition-all cursor-pointer shadow-sm disabled:opacity-60"
                  title={`Live Synced with ${playlist.sourcePlatform || 'Source'}. Click to sync now.`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${
                      isSyncing ? 'animate-spin' : 'animate-pulse'
                    }`}
                  />
                  <span>{isSyncing ? 'Syncing...' : `Synced ${lastSyncFormatted}`}</span>
                  <span className="text-[11px] opacity-75">↻</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Primary Action Ribbon */}
      <div className="relative z-10 flex items-center gap-2.5 sm:gap-3.5 mb-5 pt-1">
        {/* Big Play All Button */}
        <button
          onClick={handlePlayAll}
          className="w-12 h-12 sm:w-14 sm:h-14 p-0 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center hover:scale-105 active:scale-95 shadow-[0_8px_24px_rgba(250,45,72,0.4)] transition-all disabled:opacity-40 disabled:hover:scale-100 cursor-pointer flex-shrink-0"
          disabled={tracks.length === 0}
          title="Play All"
        >
          <svg className="w-6 h-6 sm:w-7 sm:h-7 ml-0.5 block fill-current" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>

        {/* Shuffle Button */}
        <button
          onClick={handleShuffleAll}
          disabled={tracks.length === 0}
          className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.12] text-white/80 hover:text-white transition-all cursor-pointer active:scale-90 border border-white/[0.08] disabled:opacity-40 flex-shrink-0"
          title="Shuffle"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </button>

        {/* 1-Click Batch Playlist Download to Offline Vault */}
        <button
          type="button"
          onClick={handleDownloadAll}
          disabled={tracks.length === 0 || isCurrentDownloading}
          className={`h-10 sm:h-11 px-3.5 sm:px-4 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border flex-shrink-0 ${
            isCurrentDownloading
              ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30 shadow-[0_0_16px_rgba(6,182,212,0.3)]'
              : isAllOffline
              ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30'
              : 'bg-white/[0.06] hover:bg-white/[0.12] text-white/85 hover:text-white border-white/[0.08]'
          }`}
          title={
            isAllOffline
              ? 'All songs downloaded in Offline Audio Vault'
              : 'Download entire playlist with 1 click for zero-latency offline playback'
          }
        >
          {isCurrentDownloading && activeDownloadJob ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-cyan-300 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <span>
                Downloading {activeDownloadJob.completed}/{activeDownloadJob.total} (
                {Math.round(
                  (activeDownloadJob.completed / Math.max(1, activeDownloadJob.total)) * 100
                )}
                %)
              </span>
            </>
          ) : isAllOffline ? (
            <>
              <svg
                className="w-4 h-4 text-emerald-300 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span className="hidden sm:inline">Offline Ready</span>
              <span>({offlineCount})</span>
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4 text-cyan-300 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span className="hidden sm:inline">Download All</span>
              <span>({Math.max(0, tracks.length - offlineCount)})</span>
            </>
          )}
        </button>

        {/* Sync Now Button in Action Ribbon if live synced */}
        {playlist.sourceUrl && (
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="h-10 sm:h-11 px-3 sm:px-3.5 rounded-full text-xs font-bold bg-white/[0.06] hover:bg-white/[0.12] text-emerald-300 hover:text-white border border-white/[0.08] flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all flex-shrink-0"
            title={`Sync with original ${playlist.sourcePlatform || 'playlist'}`}
          >
            <span className={isSyncing ? 'animate-spin inline-block' : ''}>↻</span>
            <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync'}</span>
          </button>
        )}

        {/* Toggle Pin to Top Button */}
        <button
          type="button"
          onClick={() => togglePin(playlist.id)}
          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all cursor-pointer border flex-shrink-0 ${
            playlist.isPinned
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              : 'bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white border-white/[0.08]'
          }`}
          title={playlist.isPinned ? 'Unpin from top' : 'Pin to top of library'}
        >
          <span>📌</span>
        </button>

        <div className="flex-grow" />

        {/* Unified More Options (•••) Dropdown */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowOptionsMenu((v) => !v)}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.12] text-white/75 hover:text-white transition-all cursor-pointer border border-white/[0.08]"
            title="More options"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>

          <AnimatePresence>
            {showOptionsMenu && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.94, filter: 'blur(10px)' }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -4, scale: 0.96, filter: 'blur(8px)' }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="absolute right-0 top-12 z-40 w-64 rounded-2xl bg-[#12131e]/95 backdrop-blur-2xl border border-white/10 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.8)] space-y-1 text-xs"
                onClick={() => setShowOptionsMenu(false)}
              >
                {/* Live Sync Management in Menu */}
                {playlist.sourceUrl ? (
                  <>
                    <button
                      type="button"
                      onClick={handleManualSync}
                      disabled={isSyncing}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 text-emerald-300 flex items-center gap-2.5 cursor-pointer transition-colors"
                    >
                      <span className={isSyncing ? 'animate-spin' : ''}>↻</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold">{isSyncing ? 'Syncing Now...' : 'Sync Live Now'}</div>
                        <div className="text-[10px] text-emerald-400/60">Pull updates from source</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updatePlaylist(playlist.id, {
                          syncStrategy: playlist.syncStrategy === 'mirror' ? 'append' : 'mirror'
                        })
                      }
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 text-white flex items-center gap-2.5 cursor-pointer transition-colors"
                    >
                      <span>🔄</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold">
                          Mode: {playlist.syncStrategy === 'mirror' ? 'Exact Mirror' : 'Auto-Append'}
                        </div>
                        <div className="text-[10px] text-white/50">
                          {playlist.syncStrategy === 'mirror'
                            ? 'Removes songs not in source'
                            : 'Preserves local, only appends'}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updatePlaylist(playlist.id, {
                          isLiveSync: !playlist.isLiveSync
                        })
                      }
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 text-white flex items-center gap-2.5 cursor-pointer transition-colors"
                    >
                      <span>{playlist.isLiveSync ? '🟢' : '⚪'}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold">
                          Auto-Sync: {playlist.isLiveSync ? 'Enabled' : 'Paused'}
                        </div>
                        <div className="text-[10px] text-white/50">Auto-checks on playlist open</div>
                      </div>
                    </button>

                    <div className="h-[1px] bg-white/10 my-1" />
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowAttachSource(true)}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 text-emerald-300 flex items-center gap-2.5 cursor-pointer transition-colors"
                    >
                      <span>🔗</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold">Connect Live Sync URL</div>
                        <div className="text-[10px] text-emerald-400/60">Link Spotify or YouTube playlist</div>
                      </div>
                    </button>
                    <div className="h-[1px] bg-white/10 my-1" />
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(true)}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 text-white flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  <span className="text-base flex-shrink-0">✏️</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">Edit Details</div>
                    <div className="text-[10px] text-white/50">Change title & description</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => exportToM3U8(playlist)}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 text-white flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  <span className="text-base flex-shrink-0">🎵</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">M3U8 Playlist (.m3u8)</div>
                    <div className="text-[10px] text-white/50">For Apple, VLC & players</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => exportToJSON(playlist)}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 text-white flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  <span className="text-base flex-shrink-0">📦</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">WaveCraft JSON (.json)</div>
                    <div className="text-[10px] text-white/50">Full backup with metadata</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleCopyTrackList}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 text-white flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  <span className="text-base flex-shrink-0">📋</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">
                      {copyFeedback ? 'Copied to Clipboard!' : 'Copy Track List'}
                    </div>
                    <div className="text-[10px] text-white/50">Plain text song names</div>
                  </div>
                </button>

                <div className="h-[1px] bg-white/10 my-1" />

                <button
                  type="button"
                  onClick={handleDelete}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-red-500/20 text-red-400 flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  <span className="text-base flex-shrink-0">🗑️</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">Delete Playlist</div>
                    <div className="text-[10px] text-red-400/60">Remove from library</div>
                  </div>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Sync Status Banner Feedback */}
      {syncResultBanner && (
        <div className="relative z-10 mb-3 px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-between shadow-sm animate-in fade-in duration-200">
          <span>{syncResultBanner}</span>
          <button
            onClick={() => setSyncResultBanner('')}
            className="text-emerald-300/70 hover:text-white ml-2 cursor-pointer font-bold text-sm"
          >
            ×
          </button>
        </div>
      )}

      {/* Syncing Progress Bar */}
      {isSyncing && (
        <div className="relative z-10 mb-3 space-y-1">
          <div className="flex justify-between text-[11px] font-bold text-emerald-300">
            <span>{syncStatusText || 'Synchronizing with source...'}</span>
            <span className="tabular-nums">{syncProgressPct}%</span>
          </div>
          <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-300"
              style={{ width: `${Math.max(10, syncProgressPct)}%` }}
            />
          </div>
        </div>
      )}

      {/* Connect Live Sync Modal Overlay */}
      {showAttachSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl bg-[#12131e] border border-white/10 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span>🔗</span> Connect Live Sync URL
              </h3>
              <button
                onClick={() => setShowAttachSource(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              >
                ×
              </button>
            </div>
            <p className="text-xs text-white/60">
              Paste a Spotify or YouTube playlist URL. WaveCraft will keep this playlist automatically synchronized whenever the source updates.
            </p>
            <form onSubmit={handleAttachLiveSource} className="space-y-3">
              <input
                type="url"
                required
                value={attachUrlInput}
                onChange={(e) => setAttachUrlInput(e.target.value)}
                placeholder="https://open.spotify.com/playlist/... or YouTube playlist URL"
                className="w-full bg-white/[0.06] border border-white/[0.12] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-white/40 outline-none focus:border-[var(--color-accent)]"
              />
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAttachSource(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white/70 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[var(--color-accent)] text-white hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-md"
                >
                  Connect & Sync Now
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Desktop Tracklist Column Headers */}
      {tracks.length > 0 && (
        <div className="relative z-10 hidden sm:flex items-center px-4 py-2 border-b border-white/[0.08] text-[11px] font-black uppercase tracking-wider text-white/40 mb-2">
          <span className="w-8 text-center">#</span>
          <span className="flex-1 ml-4">Title</span>
          <span className="hidden md:block w-48 truncate">Album</span>
          <span className="w-20 text-right pr-6">Duration</span>
          <span className="w-8"></span>
        </div>
      )}

      {/* Tracks */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-1.5">
        {tracks.length === 0 ? (
          <div className="text-center py-12 text-white/50 border-0 bg-white/[0.03] rounded-2xl">
            <p className="text-lg">This playlist is empty.</p>
            <p className="text-sm mt-1">Search for songs and add them here.</p>
            <GlassButton className="mt-4" onClick={() => navigate('/search')}>
              Search Songs
            </GlassButton>
          </div>
        ) : (
          tracks.map((track, index) => (
            <TrackRow
              key={track?.id ? `${track.id}-${index}` : `track-${index}`}
              track={track}
              tracks={tracks}
              index={index + 1}
              onPlay={() => playTrack(track, tracks, index)}
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
