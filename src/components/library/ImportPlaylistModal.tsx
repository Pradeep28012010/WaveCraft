import React, { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import GlassModal from '../ui/GlassModal';
import { useLibraryStore, normalizeQueryFingerprint } from '../../stores/libraryStore';
import { searchTracks } from '../../services/youtube';
import { parseM3U8String, parseJSONPlaylistString, type ParsedPlaylistFile } from '../../utils/playlistExport';
import { apiUrl } from '../../services/apiConfig';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import type { Track, Playlist } from '../../types';

interface ImportPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'live' | 'url' | 'text' | 'file';
}

interface ImportQueryItem {
  title: string;
  artist?: string;
  videoId?: string;
}

const MODES = [
  { id: 'live', label: 'Live Auto-Sync', icon: '⚡', dot: true },
  { id: 'url', label: 'One-Time Link', icon: '🔗', dot: false },
  { id: 'text', label: 'Paste Song List', icon: '📋', dot: false },
  { id: 'file', label: 'Upload File', icon: '📁', dot: false }
] as const;

type ImportMode = typeof MODES[number]['id'];

export default function ImportPlaylistModal({
  isOpen,
  onClose,
  initialMode = 'live'
}: ImportPlaylistModalProps) {
  const navigate = useNavigate();
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const addTracksToPlaylist = useLibraryStore((s) => s.addTracksToPlaylist);
  const updatePlaylist = useLibraryStore((s) => s.updatePlaylist);

  const [mode, setMode] = useState<ImportMode>(initialMode);
  const [prevOpenKey, setPrevOpenKey] = useState(`${isOpen}:${initialMode}`);
  const [urlInput, setUrlInput] = useState('');
  const [customName, setCustomName] = useState('');
  const [textInput, setTextInput] = useState('');
  const [syncStrategy, setSyncStrategy] = useState<'append' | 'mirror'>('append');
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState<number>(15);
  const [isImporting, setIsImporting] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [currentTrackLabel, setCurrentTrackLabel] = useState('');
  const [matchedCount, setMatchedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const abortRef = useRef(false);

  // File import state
  const [parsedFile, setParsedFile] = useState<ParsedPlaylistFile | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync mode synchronously before paint when modal opens
  const currentOpenKey = `${isOpen}:${initialMode}`;
  if (currentOpenKey !== prevOpenKey) {
    setPrevOpenKey(currentOpenKey);
    if (isOpen) {
      setMode(initialMode);
      setErrorMsg('');
      setFileError('');
    }
  }

  // Detect platform in real time from URL
  const detectedPlatform = useMemo(() => {
    const raw = urlInput.trim().toLowerCase();
    if (!raw) return null;
    if (raw.includes('spotify.com')) {
      return {
        name: 'Spotify',
        icon: '🟢',
        badge: 'SPOTIFY PLAYLIST',
        accent: 'from-emerald-500 to-green-600',
        textColor: 'text-emerald-400',
        borderColor: 'border-emerald-500/40',
        bgColor: 'bg-emerald-500/15'
      };
    }
    if (raw.includes('youtube.com') || raw.includes('youtu.be')) {
      return {
        name: 'YouTube Music',
        icon: '🔴',
        badge: 'YOUTUBE PLAYLIST',
        accent: 'from-rose-500 to-red-600',
        textColor: 'text-rose-400',
        borderColor: 'border-rose-500/40',
        bgColor: 'bg-rose-500/15'
      };
    }
    if (raw.includes('apple.com')) {
      return {
        name: 'Apple Music',
        icon: '🍎',
        badge: 'APPLE MUSIC',
        accent: 'from-pink-500 to-rose-600',
        textColor: 'text-pink-400',
        borderColor: 'border-pink-500/40',
        bgColor: 'bg-pink-500/15'
      };
    }
    return null;
  }, [urlInput]);

  const matchQueriesToTracks = async (
    queries: ImportQueryItem[],
    playlistName: string,
    coverUrl = '',
    platform = 'External',
    extraMeta?: Partial<Playlist>
  ) => {
    abortRef.current = false;
    setTotalCount(queries.length);
    setMatchedCount(0);
    setStatusText(
      `Creating "${playlistName}" • Importing ${queries.length} tracks in 320kbps...`
    );
    setProgressPct(3);

    const newPlaylist = createPlaylist(
      playlistName,
      extraMeta?.isLiveSync
        ? `Live Auto-Syncing Playlist from ${platform} • Updates automatically when original playlist changes`
        : `Imported ${queries.length} tracks from ${platform} via WaveCraft • 320kbps Studio HD`,
      coverUrl,
      extraMeta
    );

    let completed = 0;
    let addedSoFar = 0;
    const matchedFingerprints: string[] = [];

    // Separate pre-resolved tracks (e.g. YouTube playlist/mix items that already have videoId)
    // from tracks that require search (Spotify, Apple Music, text)
    const preResolved: Array<{ track: Track; fp: string }> = [];
    const pendingSearch: Array<{ q: ImportQueryItem; index: number }> = [];

    queries.forEach((q, idx) => {
      const fp = normalizeQueryFingerprint(q.title, q.artist);
      if (q.videoId) {
        preResolved.push({
          fp,
          track: {
            id: `yt_${q.videoId}`,
            title: q.title || 'Imported Track',
            artist: q.artist || 'Unknown Artist',
            album: playlistName,
            duration: 210,
            thumbnail: `https://i.ytimg.com/vi/${q.videoId}/hqdefault.jpg`,
            thumbnailLarge: `https://i.ytimg.com/vi/${q.videoId}/maxresdefault.jpg`,
            youtubeId: q.videoId,
            quality: 'Studio Stream'
          }
        });
      } else {
        pendingSearch.push({ q, index: idx });
      }
    });

    // Fast-path: Add pre-resolved tracks immediately without network latency
    if (preResolved.length > 0) {
      const tracksToAdd = preResolved.map((p) => p.track);
      preResolved.forEach((p) => matchedFingerprints.push(p.fp));
      addTracksToPlaylist(newPlaylist.id, tracksToAdd);
      addedSoFar += tracksToAdd.length;
      completed += preResolved.length;
      setMatchedCount(addedSoFar);
      const pct = Math.min(100, Math.round((completed / queries.length) * 100));
      setProgressPct(pct);
      setStatusText(`Imported ${addedSoFar} of ${queries.length} songs...`);
    }

    // For any remaining tracks that need search resolution (Spotify, Apple Music, text)
    if (pendingSearch.length > 0 && !abortRef.current) {
      const batchSize = 15;
      for (let i = 0; i < pendingSearch.length; i += batchSize) {
        if (abortRef.current) break;

        const chunk = pendingSearch.slice(i, i + batchSize);
        setCurrentTrackLabel(
          chunk[0]?.q?.title
            ? `${chunk[0].q.title}${chunk[0].q.artist ? ` — ${chunk[0].q.artist}` : ''}`
            : ''
        );

        let batchResolvedTracks: Array<{ track: Track; fp: string }> = [];

        // 1. Try server-side batch search first (fast, cached)
        try {
          const endpoint = apiUrl('/api/music?action=batch-search');
          const batchRes = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              queries: chunk.map((c) => ({
                title: c.q.title,
                artist: c.q.artist
              }))
            }),
            signal: AbortSignal.timeout(9000)
          });

          if (batchRes.ok) {
            const batchData = await batchRes.json();
            const results = Array.isArray(batchData?.results) ? batchData.results : [];
            results.forEach((r: { title?: string; artist?: string; track?: Track | null }) => {
              if (r.track) {
                const fp = normalizeQueryFingerprint(r.title || '', r.artist || '');
                batchResolvedTracks.push({ track: r.track, fp });
              }
            });
          }
        } catch {
          // If batch-search failed or timed out, will fall back below
        }

        // 2. Fallback single search for missing ones
        if (batchResolvedTracks.length < chunk.length && !abortRef.current) {
          const resolvedTitles = new Set(
            batchResolvedTracks.map((b) => b.track.title.toLowerCase())
          );
          const unresolved = chunk.filter(
            (c) => !resolvedTitles.has((c.q.title || '').toLowerCase())
          );

          const fallbackResults = await Promise.all(
            unresolved.map(async (c) => {
              const fp = normalizeQueryFingerprint(c.q.title, c.q.artist);
              const searchStr = `${c.q.title} ${c.q.artist || ''}`.trim();
              if (!searchStr) return null;

              try {
                const res = await searchTracks(searchStr);
                if (res && res.length > 0) return { track: res[0], fp };
              } catch {}

              // Clean title fallback if title had noisy words
              const cleanTitle = (c.q.title || '')
                .replace(/\s*[\(\[][^)\]]*?(?:feat\.|ft\.|remaster|deluxe|edition|version|anniversary|live|bonus|explicit)[^)\]]*?[\)\]]/gi, '')
                .replace(/\s*[-–—]\s*(?:(?:\d{4}\s*)?(?:remaster|deluxe|version|live|radio edit)|bonus|anniversary).*$/gi, '')
                .trim();

              if (cleanTitle && cleanTitle !== c.q.title) {
                try {
                  const res = await searchTracks(`${cleanTitle} ${c.q.artist || ''}`.trim());
                  if (res && res.length > 0) return { track: res[0], fp };
                } catch {}
              }

              return null;
            })
          );

          fallbackResults.forEach((fr) => {
            if (fr) batchResolvedTracks.push(fr);
          });
        }

        // Add the batch of resolved tracks to the playlist
        if (batchResolvedTracks.length > 0) {
          const tracksToAdd = batchResolvedTracks.map((b) => b.track);
          batchResolvedTracks.forEach((b) => matchedFingerprints.push(b.fp));
          addTracksToPlaylist(newPlaylist.id, tracksToAdd);
          addedSoFar += tracksToAdd.length;
        }

        completed += chunk.length;
        const pct = Math.min(100, Math.round((completed / queries.length) * 100));
        setMatchedCount(addedSoFar);
        setProgressPct(pct);
        setStatusText(
          `Matched ${addedSoFar} of ${queries.length} songs (${Math.min(completed, queries.length)} scanned)...`
        );

        if (i + batchSize < pendingSearch.length && !abortRef.current) {
          await new Promise((r) => setTimeout(r, 120));
        }
      }
    }

    if (extraMeta?.sourceUrl) {
      updatePlaylist(newPlaylist.id, {
        remoteFingerprints: matchedFingerprints,
        lastSyncedAt: Date.now()
      });
    }

    setIsImporting(false);
    setStatusText('');
    setCurrentTrackLabel('');
    setProgressPct(0);
    onClose();
    navigate(`/playlist/${newPlaylist.id}`);
  };

  const handleImportUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedUrl = urlInput.trim();
    if (!cleanedUrl) return;

    triggerAndroidHaptic('medium');
    setIsImporting(true);
    setErrorMsg('');
    setStatusText(
      mode === 'live'
        ? 'Connecting Live Sync Engine to source playlist...'
        : 'Fetching complete playlist tracklist...'
    );
    setProgressPct(5);

    try {
      let data: {
        title?: string;
        name?: string;
        artist?: string;
        platform?: string;
        coverUrl?: string;
        coverImage?: string;
        queries?: Array<{ title: string; artist?: string; videoId?: string }>;
        error?: string;
      } | null = null;

      try {
        const res = await fetch(
          apiUrl(`/api/music?action=import-playlist&url=${encodeURIComponent(cleanedUrl)}`)
        );
        if (res.ok) {
          data = await res.json();
        }
      } catch (err) {
        console.warn('Initial import fetch failed:', err);
      }

      if (!data || data.error || !Array.isArray(data.queries) || data.queries.length === 0) {
        try {
          const directRes = await fetch(
            `https://wavecraft-alpha.vercel.app/api/music?action=import-playlist&url=${encodeURIComponent(cleanedUrl)}`
          );
          if (directRes.ok) {
            const directData = await directRes.json();
            if (Array.isArray(directData?.queries) && directData.queries.length > 0) {
              data = directData;
            }
          }
        } catch (dirErr) {
          console.warn('Direct fallback import fetch failed:', dirErr);
        }
      }

      if (!data || data.error || !Array.isArray(data.queries) || data.queries.length === 0) {
        setErrorMsg(
          data?.error ||
            'Could not read tracks from this link. Make sure the playlist URL is public, or use the "Paste Song List" tab.'
        );
        setIsImporting(false);
        return;
      }

      const isLive = mode === 'live';
      const sourcePlatformName = data.platform || (detectedPlatform ? detectedPlatform.name : 'External Link');

      await matchQueriesToTracks(
        data.queries,
        customName.trim() || data.name || (isLive ? 'Live Synced Playlist' : 'Imported Playlist'),
        data.coverUrl || '',
        sourcePlatformName,
        {
          isLiveSync: isLive,
          sourceUrl: cleanedUrl,
          sourcePlatform: sourcePlatformName,
          syncStrategy: isLive ? syncStrategy : 'append',
          syncIntervalMinutes: isLive ? syncIntervalMinutes : 15,
          lastSyncedAt: Date.now(),
          lastSyncDelta: 0
        }
      );
    } catch {
      setErrorMsg('Failed to connect to playlist importer. Try pasting the song list instead.');
      setIsImporting(false);
    }
  };

  const handleImportText = async (e: React.FormEvent) => {
    e.preventDefault();
    const lines = textInput
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    triggerAndroidHaptic('medium');
    setIsImporting(true);
    setErrorMsg('');

    const queries: ImportQueryItem[] = lines.map((line) => {
      const cleaned = line.replace(/^\d+[\.\)\-]\s*/, '').trim();
      const parts = cleaned.split(/\s+[-–—]\s+/);
      return {
        title: parts[0].trim(),
        artist: parts.slice(1).join(' ').trim()
      };
    });

    await matchQueriesToTracks(
      queries,
      customName.trim() || 'Imported Mix',
      '',
      'Tracklist Import'
    );
  };

  const handleProcessFile = (file: File) => {
    setFileError('');
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        setFileError('The selected file appears to be empty.');
        return;
      }
      try {
        const lowerName = file.name.toLowerCase();
        let parsed: ParsedPlaylistFile;
        if (lowerName.endsWith('.json')) {
          parsed = parseJSONPlaylistString(text, file.name.replace(/\.[^/.]+$/, ''));
        } else {
          parsed = parseM3U8String(text, file.name.replace(/\.[^/.]+$/, ''));
        }
        if (!parsed.tracks.length) {
          setFileError('No valid songs were found in this file.');
          return;
        }
        setParsedFile(parsed);
        triggerAndroidHaptic('light');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to parse file format. Ensure valid M3U8 or JSON.';
        setFileError(msg);
      }
    };
    reader.onerror = () => setFileError('Failed to read file from disk.');
    reader.readAsText(file);
  };

  const handleImportFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedFile || !parsedFile.tracks.length) return;
    triggerAndroidHaptic('medium');
    setIsImporting(true);
    setErrorMsg('');

    const queries: ImportQueryItem[] = parsedFile.tracks.map((t) => ({
      title: t.title,
      artist: t.artist,
      videoId: t.videoId
    }));

    await matchQueriesToTracks(
      queries,
      customName.trim() || parsedFile.name,
      parsedFile.description || '',
      fileName.endsWith('.json') ? 'JSON File Import' : 'M3U8 Playlist File'
    );
  };

  const parsedLineCount = textInput
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean).length;

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title="Universal Playlist Importer"
    >
      <div className="flex flex-col gap-4 text-white select-none">
        {/* ── Apple-Grade Connection Pipeline Glass Banner ── */}
        <div className="p-3.5 rounded-2xl liquid-glass bg-white/[0.03] border-0 flex items-center justify-between gap-3 overflow-hidden relative shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 transition-all ${
              detectedPlatform
                ? `${detectedPlatform.bgColor} border ${detectedPlatform.borderColor} shadow-md`
                : 'bg-white/10 border-0'
            }`}>
              {detectedPlatform ? detectedPlatform.icon : '🌐'}
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">
                SOURCE STREAM
              </span>
              <span className="text-xs font-bold text-white truncate block">
                {detectedPlatform ? detectedPlatform.name : 'Spotify • YouTube • Apple Music'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 rounded-full liquid-glass bg-black/40 border-0 flex-shrink-0 shadow-inner">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span className="text-[10px] font-black uppercase tracking-wider text-cyan-300">
              Lossless 320k Matcher
            </span>
            <span className="text-white/40 text-xs">⟶</span>
          </div>

          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-purple-600 border-0 flex items-center justify-center text-white flex-shrink-0 shadow-lg">
              <span className="text-sm font-black">W</span>
            </div>
            <div className="min-w-0 hidden sm:block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-accent)] block">
                WAVECRAFT
              </span>
              <span className="text-xs font-bold text-white truncate block">
                Library HD
              </span>
            </div>
          </div>
        </div>

        {/* ── Apple-Style Sliding Segmented Control ── */}
        <div className="flex items-center p-1 rounded-xl liquid-glass bg-white/[0.04] border-0 relative gap-1">
          {MODES.map((m) => {
            const isActive = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  triggerAndroidHaptic('light');
                  setMode(m.id);
                  setErrorMsg('');
                }}
                className={`relative flex-1 py-2 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 z-10 ${
                  isActive ? 'text-white' : 'text-white/60 hover:text-white'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="import-modal-tab-pill"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    className={`absolute inset-0 rounded-lg shadow-md border ${
                      m.id === 'live'
                        ? 'bg-emerald-500/30 border-emerald-400/40'
                        : 'bg-white/15 border-white/20'
                    }`}
                  />
                )}
                {m.dot && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0 relative z-10" />
                )}
                <span className="relative z-10 flex items-center gap-1">
                  <span>{m.icon}</span>
                  <span className="hidden sm:inline">{m.label}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Mode Info Card ── */}
        <AnimatePresence mode="wait">
          {mode === 'live' ? (
            <motion.div
              key="info-live"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="px-3.5 py-2.5 rounded-xl liquid-glass bg-emerald-500/10 border-0 flex flex-col gap-0.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  Live Playlist Auto-Sync Engine
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border-0 text-[9px] font-black text-emerald-200 uppercase tracking-wider">
                  BACKGROUND ENGINE
                </span>
              </div>
              <p className="text-[11px] text-white/70 leading-relaxed">
                Keeps your local playlist in sync with the original Spotify or YouTube link. Any new songs added remotely get resolved automatically in 320kbps.
              </p>
            </motion.div>
          ) : mode === 'url' ? (
            <motion.div
              key="info-url"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="px-3.5 py-2 rounded-xl liquid-glass bg-cyan-500/10 border-0 flex items-center justify-between text-xs text-cyan-200"
            >
              <span className="font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                One-Time Playlist Snapshot
              </span>
              <span className="text-[10px] text-cyan-300/80 font-bold uppercase tracking-wider">
                Unlimited Tracks • 320kbps HD
              </span>
            </motion.div>
          ) : mode === 'text' ? (
            <motion.div
              key="info-text"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="px-3.5 py-2 rounded-xl liquid-glass bg-purple-500/10 border-0 flex items-center justify-between text-xs text-purple-200"
            >
              <span className="font-bold flex items-center gap-1.5">
                <span>📋 Batch Tracklist Importer</span>
              </span>
              <span className="text-[10px] text-purple-300/80 font-bold uppercase tracking-wider">
                Paste from Notes, Reddit, or YouTube
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="info-file"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="px-3.5 py-2 rounded-xl liquid-glass bg-amber-500/10 border-0 flex items-center justify-between text-xs text-amber-200"
            >
              <span className="font-bold flex items-center gap-1.5">
                <span>📁 M3U8 & JSON File Importer</span>
              </span>
              <span className="text-[10px] text-amber-300/80 font-bold uppercase tracking-wider">
                Apple Music, VLC, Winamp or WaveCraft Backups
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── TAB 1 & 2: URL IMPORTER (LIVE OR ONE-TIME) ── */}
        {(mode === 'live' || mode === 'url') && (
          <form onSubmit={handleImportUrl} className="flex flex-col gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                  {mode === 'live' ? 'Source Playlist URL to Monitor' : 'Public Playlist URL'} <span className="text-rose-400">*</span>
                </label>
                {detectedPlatform && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${detectedPlatform.bgColor} ${detectedPlatform.textColor} border ${detectedPlatform.borderColor} flex items-center gap-1`}>
                    <span>{detectedPlatform.icon}</span>
                    <span>{detectedPlatform.badge}</span>
                  </span>
                )}
              </div>
              <input
                type="url"
                required
                disabled={isImporting}
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://open.spotify.com/playlist/... or https://youtube.com/playlist?list=..."
                className="w-full h-11 px-3.5 rounded-xl liquid-glass bg-white/[0.05] border-0 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-all shadow-inner"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
                Custom Playlist Name <span className="text-white/30 lowercase font-normal">(optional — defaults to source name)</span>
              </label>
              <input
                type="text"
                disabled={isImporting}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Leave blank to use original title"
                className="w-full h-10 px-3.5 rounded-xl liquid-glass bg-white/[0.05] border-0 text-xs text-white placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-all shadow-inner"
              />
            </div>

            {/* LIVE AUTO-SYNC CONFIGURATION CARD */}
            {mode === 'live' && (
              <div className="p-3.5 rounded-2xl liquid-glass bg-white/[0.02] border-0 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                    <span>⚡ Sync Engine Rules</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-white/50 font-bold mr-1">Check interval:</span>
                    {[
                      { mins: 15, label: '15m' },
                      { mins: 30, label: '30m' },
                      { mins: 60, label: '1h' },
                      { mins: 360, label: '6h' }
                    ].map((opt) => (
                      <button
                        key={opt.mins}
                        type="button"
                        onClick={() => {
                          triggerAndroidHaptic('light');
                          setSyncIntervalMinutes(opt.mins);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                          syncIntervalMinutes === opt.mins
                            ? 'glass-button-emerald text-emerald-100 shadow-sm'
                            : 'glass-button text-white/60 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      setSyncStrategy('append');
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-1 ${
                      syncStrategy === 'append'
                        ? 'liquid-glass bg-emerald-500/15 border-emerald-400/40 text-white shadow-md'
                        : 'liquid-glass bg-white/[0.02] border-white/10 text-white/70 hover:text-white'
                    }`}
                  >
                    <div className="text-xs font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span>➕ Auto-Append Mode</span>
                      </span>
                      {syncStrategy === 'append' && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                      )}
                    </div>
                    <div className="text-[10px] text-white/60 leading-snug">
                      Preserves any tracks you manually add in WaveCraft, while seamlessly fetching newly released tracks from source.
                    </div>
                  </div>

                  <div
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      setSyncStrategy('mirror');
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-1 ${
                      syncStrategy === 'mirror'
                        ? 'liquid-glass bg-emerald-500/15 border-emerald-400/40 text-white shadow-md'
                        : 'liquid-glass bg-white/[0.02] border-white/10 text-white/70 hover:text-white'
                    }`}
                  >
                    <div className="text-xs font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span>🪞 Exact Mirror Mode</span>
                      </span>
                      {syncStrategy === 'mirror' && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                      )}
                    </div>
                    <div className="text-[10px] text-white/60 leading-snug">
                      Mirrors the exact source tracklist. When songs are removed or reordered on Spotify/YouTube, WaveCraft mirrors them.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* QUICK PRESETS CHIPS */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider mr-1">
                Instant Charts:
              </span>
              <button
                type="button"
                onClick={() => {
                  triggerAndroidHaptic('light');
                  setUrlInput('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
                }}
                className="text-[11px] px-2.5 py-1 rounded-lg glass-button text-emerald-300 hover:text-white cursor-pointer active:scale-95 transition-all"
              >
                Global Top Hits
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerAndroidHaptic('light');
                  setUrlInput('https://open.spotify.com/playlist/37i9dQZF1DX0XUfTFmNBRM');
                }}
                className="text-[11px] px-2.5 py-1 rounded-lg glass-button text-emerald-300 hover:text-white cursor-pointer active:scale-95 transition-all"
              >
                Trending India
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerAndroidHaptic('light');
                  setUrlInput('https://open.spotify.com/playlist/37i9dQZF1DX4t95PaoR1zy');
                }}
                className="text-[11px] px-2.5 py-1 rounded-lg glass-button text-purple-300 hover:text-white cursor-pointer active:scale-95 transition-all"
              >
                Lo-Fi Beats
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/15 border-0 text-xs text-red-200 flex items-center gap-2">
                <span className="text-base flex-shrink-0">⚠️</span>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* IMPORT PROGRESS HUD */}
            {isImporting && (
              <div className="p-3.5 rounded-2xl liquid-glass bg-white/[0.04] border-0 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-white">
                  <span className="truncate pr-2 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-spin border-2 border-cyan-400 border-t-transparent" />
                    <span>{statusText}</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-black tabular-nums flex-shrink-0">
                    {progressPct}%
                  </span>
                </div>
                {currentTrackLabel && (
                  <p className="text-[11px] text-white/60 truncate">
                    🎵 Matching: <span className="text-white font-semibold">{currentTrackLabel}</span>
                  </p>
                )}
                <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden p-0.5 border-0">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-indigo-500 transition-all duration-300 shadow-[0_0_12px_rgba(34,211,238,0.75)]"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                {matchedCount > 0 && totalCount > 15 && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        abortRef.current = true;
                      }}
                      className="text-[11px] px-3 py-1 rounded-lg glass-button text-amber-300 hover:text-white cursor-pointer active:scale-95 transition-all"
                    >
                      Finish Initial Sync & Open ({matchedCount} tracks ready)
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-0 mt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={isImporting}
                className="px-4 py-2 rounded-xl glass-button text-xs font-semibold text-white/70 hover:text-white transition-all cursor-pointer active:scale-95 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isImporting}
                className={`px-5 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-40 ${
                  mode === 'live' ? 'glass-button-emerald' : 'glass-button-primary'
                }`}
              >
                {isImporting
                  ? `Syncing (${matchedCount}/${totalCount || '...'})`
                  : mode === 'live'
                  ? 'Connect & Sync Live Playlist'
                  : 'Import All Tracks'}
              </button>
            </div>
          </form>
        )}

        {/* ── TAB 3: BATCH TEXT IMPORTER ── */}
        {mode === 'text' && (
          <form onSubmit={handleImportText} className="flex flex-col gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
                Playlist Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                disabled={isImporting}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="My Curated Vibe"
                className="w-full h-10 px-3.5 rounded-xl liquid-glass bg-white/[0.05] border-0 text-xs text-white placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-all shadow-inner"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                  Song List (one song per line, e.g. "Song Name - Artist")
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      setTextInput(
                        `Starboy - The Weeknd\nBlinding Lights - The Weeknd\nCruel Summer - Taylor Swift\nHukum - Anirudh Ravichander\nBeliever - Imagine Dragons\nKesariya - Arijit Singh\nDynamite - BTS\nViva La Vida - Coldplay`
                      );
                    }}
                    className="text-[10px] text-cyan-300 hover:text-white cursor-pointer font-bold"
                  >
                    Paste Demo List
                  </button>
                  {parsedLineCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/20 border-0 text-[10px] font-extrabold text-purple-200">
                      {parsedLineCount} {parsedLineCount === 1 ? 'track' : 'tracks'}
                    </span>
                  )}
                </div>
              </div>
              <textarea
                rows={6}
                required
                disabled={isImporting}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={`Starboy - The Weeknd\nBlinding Lights - The Weeknd\nCruel Summer - Taylor Swift\nBeliever - Imagine Dragons`}
                className="w-full p-3 rounded-xl liquid-glass bg-white/[0.05] border-0 text-xs text-white placeholder:text-white/35 resize-none font-mono focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-all shadow-inner"
              />
            </div>

            {isImporting && (
              <div className="p-3.5 rounded-2xl liquid-glass bg-white/[0.04] border-0 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-white">
                  <span className="truncate pr-2">{statusText}</span>
                  <span className="px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-black tabular-nums flex-shrink-0">
                    {progressPct}%
                  </span>
                </div>
                {currentTrackLabel && (
                  <p className="text-[11px] text-white/60 truncate">
                    🎵 Matching: <span className="text-white font-semibold">{currentTrackLabel}</span>
                  </p>
                )}
                <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden p-0.5 border-0">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] via-fuchsia-500 to-cyan-400 transition-all duration-300 shadow-[0_0_12px_rgba(250,45,72,0.7)]"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-0 mt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={isImporting}
                className="px-4 py-2 rounded-xl glass-button text-xs font-semibold text-white/70 hover:text-white transition-all cursor-pointer active:scale-95 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isImporting}
                className="px-5 py-2 rounded-xl glass-button-primary text-xs font-bold text-white transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-40"
              >
                {isImporting ? `Matching (${matchedCount}/${totalCount})...` : 'Build Full Playlist'}
              </button>
            </div>
          </form>
        )}

        {/* ── TAB 4: FILE IMPORTER (.M3U8 / .JSON) ── */}
        {mode === 'file' && (
          <form onSubmit={handleImportFile} className="flex flex-col gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
                Playlist Name <span className="text-white/30 lowercase font-normal">(optional override)</span>
              </label>
              <input
                type="text"
                disabled={isImporting}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={parsedFile?.name || 'File Playlist Name'}
                className="w-full h-10 px-3.5 rounded-xl liquid-glass bg-white/[0.05] border-0 text-xs text-white placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-all shadow-inner"
              />
            </div>

            {/* Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingFile(false);
                const file = e.dataTransfer.files[0];
                if (file) handleProcessFile(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-2 ${
                isDraggingFile
                  ? 'border-amber-400 bg-amber-500/15 scale-[1.01] liquid-glass'
                  : parsedFile
                  ? 'border-emerald-400/50 bg-emerald-500/[0.08] liquid-glass'
                  : 'border-white/20 hover:border-white/40 liquid-glass bg-white/[0.02]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".m3u8,.m3u,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleProcessFile(file);
                }}
              />
              <span className="text-3xl">{parsedFile ? '✅' : '📁'}</span>
              <div>
                <span className="text-sm font-bold text-white block">
                  {parsedFile
                    ? `Loaded: ${fileName}`
                    : 'Drop .m3u8, .m3u, or .json playlist file here'}
                </span>
                <span className="text-xs text-white/50 block mt-0.5">
                  {parsedFile
                    ? `${parsedFile.tracks.length} songs parsed and ready to import`
                    : 'or click to browse your computer files'}
                </span>
              </div>
            </div>

            {fileError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border-0 text-rose-300 text-xs font-semibold">
                ⚠️ {fileError}
              </div>
            )}

            {parsedFile && parsedFile.tracks.length > 0 && (
              <div className="p-3 rounded-xl liquid-glass bg-white/[0.03] border-0 space-y-1.5 max-h-36 overflow-y-auto no-scrollbar">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">
                  Preview ({parsedFile.tracks.length} Tracks)
                </span>
                {parsedFile.tracks.slice(0, 5).map((t, i) => (
                  <div key={i} className="text-xs text-white/70 truncate flex items-center gap-2">
                    <span className="text-[10px] text-white/40 tabular-nums w-4">{i + 1}.</span>
                    <span className="font-semibold text-white">{t.title}</span>
                    {t.artist && <span className="text-white/50">— {t.artist}</span>}
                  </div>
                ))}
                {parsedFile.tracks.length > 5 && (
                  <div className="text-[11px] text-white/40 pt-1 italic">
                    + {parsedFile.tracks.length - 5} more songs...
                  </div>
                )}
              </div>
            )}

            {/* Progress Bar when importing */}
            {isImporting && (
              <div className="p-3.5 rounded-2xl liquid-glass bg-white/[0.04] border-0 space-y-2 mt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-amber-300 animate-pulse">
                    {statusText || 'Importing tracks...'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-black tabular-nums flex-shrink-0">
                    {progressPct}%
                  </span>
                </div>
                {currentTrackLabel && (
                  <p className="text-[11px] text-white/60 truncate">
                    🎵 Matching: <span className="text-white font-semibold">{currentTrackLabel}</span>
                  </p>
                )}
                <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden p-0.5 border-0">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 transition-all duration-300 shadow-[0_0_12px_rgba(245,158,11,0.7)]"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-0 mt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={isImporting}
                className="px-4 py-2 rounded-xl glass-button text-xs font-semibold text-white/70 hover:text-white transition-all cursor-pointer active:scale-95 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isImporting || !parsedFile || !parsedFile.tracks.length}
                className="px-5 py-2 rounded-xl glass-button-primary text-xs font-bold text-white transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-40"
              >
                {isImporting
                  ? `Importing (${matchedCount}/${totalCount})...`
                  : `Import ${parsedFile?.tracks.length || 0} Songs`}
              </button>
            </div>
          </form>
        )}
      </div>
    </GlassModal>
  );
}
