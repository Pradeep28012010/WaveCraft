import React, { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassModal from '../ui/GlassModal';
import GlassButton from '../ui/GlassButton';
import { useLibraryStore, normalizeQueryFingerprint } from '../../stores/libraryStore';
import { searchTracks } from '../../services/youtube';
import { parseM3U8String, parseJSONPlaylistString, type ParsedPlaylistFile } from '../../utils/playlistExport';
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

export default function ImportPlaylistModal({
  isOpen,
  onClose,
  initialMode = 'live'
}: ImportPlaylistModalProps) {
  const navigate = useNavigate();
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const addTracksToPlaylist = useLibraryStore((s) => s.addTracksToPlaylist);
  const updatePlaylist = useLibraryStore((s) => s.updatePlaylist);

  const [mode, setMode] = useState<'live' | 'url' | 'text' | 'file'>(initialMode);
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

  // Sync mode synchronously before paint when modal opens so Frame 1 never flashes the wrong tab
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
        textColor: 'text-emerald-300',
        borderColor: 'border-emerald-500/40',
        bgColor: 'bg-emerald-500/10'
      };
    }
    if (raw.includes('youtube.com') || raw.includes('youtu.be')) {
      return {
        name: 'YouTube Music',
        icon: '🔴',
        badge: 'YOUTUBE PLAYLIST',
        accent: 'from-rose-500 to-red-600',
        textColor: 'text-rose-300',
        borderColor: 'border-rose-500/40',
        bgColor: 'bg-rose-500/10'
      };
    }
    if (raw.includes('jiosaavn.com')) {
      return {
        name: 'JioSaavn',
        icon: '🔵',
        badge: 'JIOSAAVN PLAYLIST',
        accent: 'from-cyan-500 to-teal-600',
        textColor: 'text-cyan-300',
        borderColor: 'border-cyan-500/40',
        bgColor: 'bg-cyan-500/10'
      };
    }
    if (raw.includes('apple.com')) {
      return {
        name: 'Apple Music',
        icon: '🍎',
        badge: 'APPLE MUSIC',
        accent: 'from-pink-500 to-rose-600',
        textColor: 'text-pink-300',
        borderColor: 'border-pink-500/40',
        bgColor: 'bg-pink-500/10'
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
      `Creating "${playlistName}" • Importing all ${queries.length} tracks in 320kbps...`
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
    const batchSize = 8;

    for (let i = 0; i < queries.length; i += batchSize) {
      if (abortRef.current) break;

      const batch = queries.slice(i, i + batchSize);
      setCurrentTrackLabel(
        batch[0]?.title
          ? `${batch[0].title}${batch[0].artist ? ` — ${batch[0].artist}` : ''}`
          : ''
      );

      const batchResults = await Promise.all(
        batch.map(async (q): Promise<{ track: Track | null; fp: string }> => {
          const fp = normalizeQueryFingerprint(q.title, q.artist);
          const searchStr = `${q.title} ${q.artist || ''}`.trim();
          if (!searchStr) return { track: null, fp };
          try {
            const results = await searchTracks(searchStr);
            if (results && results.length > 0) {
              return { track: results[0], fp };
            }
          } catch {}

          if (q.videoId) {
            return {
              fp,
              track: {
                id: `yt-${q.videoId}`,
                title: q.title || 'Imported Track',
                artist: q.artist || 'Unknown Artist',
                album: playlistName,
                duration: 210,
                thumbnail: `https://i.ytimg.com/vi/${q.videoId}/hqdefault.jpg`,
                thumbnailLarge: `https://i.ytimg.com/vi/${q.videoId}/maxresdefault.jpg`,
                youtubeId: q.videoId
              }
            };
          }
          return { track: null, fp };
        })
      );

      const batchTracksToAdd: Track[] = [];
      batchResults.forEach(({ track, fp }) => {
        if (track) {
          batchTracksToAdd.push(track);
          matchedFingerprints.push(fp);
          addedSoFar++;
        }
      });
      if (batchTracksToAdd.length > 0) {
        addTracksToPlaylist(newPlaylist.id, batchTracksToAdd);
      }

      completed += batch.length;
      const pct = Math.min(100, Math.round((completed / queries.length) * 100));
      setMatchedCount(addedSoFar);
      setProgressPct(pct);
      setStatusText(
        `Matched ${addedSoFar} of ${queries.length} songs (${Math.min(completed, queries.length)} scanned)...`
      );
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

    setIsImporting(true);
    setErrorMsg('');
    setStatusText(
      mode === 'live'
        ? 'Connecting Live Sync Engine to source playlist...'
        : 'Fetching complete playlist tracklist (unlimited tracks)...'
    );
    setProgressPct(5);

    try {
      const res = await fetch(
        `/api/music?action=import-playlist&url=${encodeURIComponent(cleanedUrl)}`
      );
      const data = await res.json();

      if (!res.ok || data.error || !Array.isArray(data.queries) || data.queries.length === 0) {
        setErrorMsg(
          data.error ||
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
      } catch (err: any) {
        setFileError(err?.message || 'Failed to parse file format. Ensure valid M3U8 or JSON.');
      }
    };
    reader.onerror = () => setFileError('Failed to read file from disk.');
    reader.readAsText(file);
  };

  const handleImportFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedFile || !parsedFile.tracks.length) return;
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
      title="Universal Playlist Importer & Live Auto-Sync"
    >
      <div className="flex flex-col gap-4 text-white">
        {/* ================= VISUAL CONNECTION PIPELINE BANNER ================= */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-white/[0.05] via-white/[0.02] to-white/[0.05] border border-white/12 flex items-center justify-between gap-3 overflow-hidden relative">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-lg flex-shrink-0">
              {detectedPlatform ? detectedPlatform.icon : '🌐'}
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-white/50 block">
                SOURCE STREAM
              </span>
              <span className="text-xs font-extrabold text-white truncate block">
                {detectedPlatform ? detectedPlatform.name : 'Spotify • YouTube • Saavn'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/40 border border-white/10 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span className="text-[10px] font-black uppercase tracking-widest text-cyan-300">
              320kbps HD Matcher
            </span>
            <span className="text-white/40">⟶</span>
          </div>

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-purple-600 border border-white/20 flex items-center justify-center text-white flex-shrink-0 shadow-md">
              <span className="text-sm font-black">W</span>
            </div>
            <div className="min-w-0 hidden sm:block">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-accent)] block">
                WAVECRAFT
              </span>
              <span className="text-xs font-extrabold text-white truncate block">
                Local HD Library
              </span>
            </div>
          </div>
        </div>

        {/* ================= 3-WAY SEGMENTED MODE SELECTOR ================= */}
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-black/45 border border-white/12">
          <button
            type="button"
            onClick={() => {
              setMode('live');
              setErrorMsg('');
            }}
            className={`py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 ${
              mode === 'live'
                ? 'glass-button-emerald text-white shadow-lg'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            <span>Live Auto-Sync</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('url');
              setErrorMsg('');
            }}
            className={`py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 ${
              mode === 'url'
                ? 'glass-button-primary text-white shadow-lg'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>🔗 One-Time Link</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('text');
              setErrorMsg('');
            }}
            className={`py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 ${
              mode === 'text'
                ? 'glass-button-primary text-white shadow-lg'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>📋 Paste Song List</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('file');
              setErrorMsg('');
            }}
            className={`py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 ${
              mode === 'file'
                ? 'glass-button-primary text-white shadow-lg'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>📁 Upload File</span>
          </button>
        </div>

        {/* ================= MODE EXPLANATION ACCORDION ================= */}
        {mode === 'live' ? (
          <div className="px-3.5 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-400/25 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-emerald-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Live Playlist Auto-Sync Engine
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/35 text-[10px] font-extrabold text-emerald-200 uppercase tracking-wider">
                ACTIVE BACKGROUND SYNC
              </span>
            </div>
            <p className="text-[11px] text-white/70 leading-relaxed">
              Maintains an active bridge with your original Spotify or YouTube playlist. When new songs are added to the source, WaveCraft automatically resolves and adds them in 320kbps.
            </p>
          </div>
        ) : mode === 'url' ? (
          <div className="px-3.5 py-2 rounded-xl bg-cyan-500/10 border border-cyan-400/25 flex items-center justify-between text-xs text-cyan-200">
            <span className="font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              One-Time Snapshot Importer
            </span>
            <span className="text-[11px] text-cyan-300/80 font-semibold">
              All tracks • 320kbps Studio Audio
            </span>
          </div>
        ) : mode === 'text' ? (
          <div className="px-3.5 py-2 rounded-xl bg-purple-500/10 border border-purple-400/25 flex items-center justify-between text-xs text-purple-200">
            <span className="font-bold flex items-center gap-2">
              <span>📋 Batch Text Importer</span>
            </span>
            <span className="text-[11px] text-purple-300/80 font-semibold">
              Paste song titles from Notes, Reddit, or YouTube descriptions
            </span>
          </div>
        ) : (
          <div className="px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-400/25 flex items-center justify-between text-xs text-amber-200">
            <span className="font-bold flex items-center gap-2">
              <span>📁 M3U8 & JSON File Importer</span>
            </span>
            <span className="text-[11px] text-amber-300/80 font-semibold">
              VLC, Apple Music, Winamp playlists or WaveCraft JSON backups
            </span>
          </div>
        )}

        {/* ================= TAB 1 & 2: URL IMPORTER (LIVE OR ONE-TIME) ================= */}
        {mode === 'live' || mode === 'url' ? (
          <form onSubmit={handleImportUrl} className="flex flex-col gap-3.5">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-white/85 flex items-center gap-1.5">
                  <span>{mode === 'live' ? 'Source Playlist URL to Monitor' : 'Public Playlist or Album URL'}</span>
                </label>
                {detectedPlatform && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${detectedPlatform.bgColor} ${detectedPlatform.textColor} border ${detectedPlatform.borderColor}`}>
                    {detectedPlatform.icon} {detectedPlatform.badge}
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
                className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-cyan-400/60"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-white/85 block mb-1.5">
                Custom Playlist Name <span className="text-white/45 font-normal">(optional — defaults to original title)</span>
              </label>
              <input
                type="text"
                disabled={isImporting}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Leave blank to use original playlist name"
                className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/35"
              />
            </div>

            {/* LIVE AUTO-SYNC CONFIGURATION CARD */}
            {mode === 'live' && (
              <div className="p-4 rounded-2xl bg-white/[0.035] border border-white/12 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                    <span>⚡ Sync Engine Rules</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-white/50 font-bold mr-1">Check interval:</span>
                    {[
                      { mins: 15, label: '15m' },
                      { mins: 30, label: '30m' },
                      { mins: 60, label: '1h' },
                      { mins: 360, label: '6h' }
                    ].map((opt) => (
                      <button
                        key={opt.mins}
                        type="button"
                        onClick={() => setSyncIntervalMinutes(opt.mins)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer border whitespace-nowrap ${
                          syncIntervalMinutes === opt.mins
                            ? 'bg-emerald-500/25 border-emerald-400/50 text-emerald-200 shadow-sm'
                            : 'bg-white/[0.04] border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSyncStrategy('append')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      syncStrategy === 'append'
                        ? 'bg-emerald-500/20 border-emerald-400/55 text-white shadow-md'
                        : 'bg-white/[0.03] border-white/10 text-white/70 hover:text-white hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="text-xs font-black flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span>➕ Auto-Append Mode</span>
                      </span>
                      {syncStrategy === 'append' && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                      )}
                    </div>
                    <div className="text-[11px] text-white/60 leading-snug">
                      Preserves any tracks you manually add in WaveCraft, while seamlessly fetching newly released tracks from the source.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSyncStrategy('mirror')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      syncStrategy === 'mirror'
                        ? 'bg-emerald-500/20 border-emerald-400/55 text-white shadow-md'
                        : 'bg-white/[0.03] border-white/10 text-white/70 hover:text-white hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="text-xs font-black flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span>🪞 Exact Mirror Mode</span>
                      </span>
                      {syncStrategy === 'mirror' && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                      )}
                    </div>
                    <div className="text-[11px] text-white/60 leading-snug">
                      Mirrors the exact source tracklist. When songs are removed or reordered on Spotify/YouTube, WaveCraft mirrors them.
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* QUICK PRESETS CHIPS */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <span className="text-[11px] text-white/45 font-bold uppercase tracking-wider">
                Instant Charts:
              </span>
              <button
                type="button"
                onClick={() =>
                  setUrlInput('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')
                }
                className="text-[11px] px-3 py-1 rounded-full glass-button text-emerald-300 hover:text-white cursor-pointer whitespace-nowrap"
              >
                Global Top Hits (50+ Songs)
              </button>
              <button
                type="button"
                onClick={() =>
                  setUrlInput('https://open.spotify.com/playlist/37i9dQZF1DX0XUfTFmNBRM')
                }
                className="text-[11px] px-3 py-1 rounded-full glass-button text-emerald-300 hover:text-white cursor-pointer whitespace-nowrap"
              >
                Trending India (50+ Songs)
              </button>
              <button
                type="button"
                onClick={() =>
                  setUrlInput('https://open.spotify.com/playlist/37i9dQZF1DX4t95PaoR1zy')
                }
                className="text-[11px] px-3 py-1 rounded-full glass-button text-purple-300 hover:text-white cursor-pointer whitespace-nowrap"
              >
                Lo-Fi Beats (50+ Songs)
              </button>
            </div>

            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/35 text-xs text-red-200 flex items-center gap-2">
                <span className="text-base flex-shrink-0">⚠️</span>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* IMPORT PROGRESS HUD */}
            {isImporting && (
              <div className="p-4 rounded-2xl liquid-glass border border-white/20 space-y-2.5">
                <div className="flex justify-between items-center text-xs font-bold text-white">
                  <span className="truncate pr-2 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-spin border-2 border-cyan-400 border-t-transparent" />
                    <span>{statusText}</span>
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-white/15 text-[11px] font-black tabular-nums flex-shrink-0">
                    {progressPct}%
                  </span>
                </div>
                {currentTrackLabel && (
                  <p className="text-[11px] text-white/65 truncate">
                    🎵 Matching: <span className="text-white font-semibold">{currentTrackLabel}</span>
                  </p>
                )}
                <div className="w-full h-2.5 bg-black/40 rounded-full overflow-hidden p-0.5 border border-white/10">
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
                        abortRef.current = true;
                      }}
                      className="text-[11px] px-3.5 py-1.5 rounded-full glass-button text-amber-300 hover:text-white cursor-pointer whitespace-nowrap"
                    >
                      Finish Initial Sync & Open ({matchedCount} tracks ready)
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-2">
              <GlassButton type="button" variant="ghost" onClick={onClose} disabled={isImporting}>
                Cancel
              </GlassButton>
              <GlassButton type="submit" variant="primary" disabled={isImporting}>
                {isImporting
                  ? `Syncing (${matchedCount}/${totalCount || '...'})`
                  : mode === 'live'
                  ? 'Connect & Sync Live Playlist'
                  : 'Import All Tracks'}
              </GlassButton>
            </div>
          </form>
        ) : mode === 'text' ? (
          /* ================= TAB 3: BATCH TEXT IMPORTER ================= */
          <form onSubmit={handleImportText} className="flex flex-col gap-3.5">
            <div>
              <label className="text-xs font-bold text-white/85 block mb-1.5">
                Playlist Name
              </label>
              <input
                type="text"
                required
                disabled={isImporting}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="My Curated Vibe"
                className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/35"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-white/85">
                  Song List (one song per line, e.g. "Song Name - Artist" • Unlimited)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setTextInput(
                        `Starboy - The Weeknd\nBlinding Lights - The Weeknd\nCruel Summer - Taylor Swift\nHukum - Anirudh Ravichander\nBeliever - Imagine Dragons\nKesariya - Arijit Singh\nDynamite - BTS\nViva La Vida - Coldplay`
                      )
                    }
                    className="text-[10px] text-cyan-300 hover:text-white cursor-pointer font-bold"
                  >
                    Paste Demo List
                  </button>
                  {parsedLineCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/30 text-[10px] font-extrabold text-purple-200">
                      {parsedLineCount} {parsedLineCount === 1 ? 'track' : 'tracks'} detected
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
                placeholder={`Yeshanagula - Anirudh Ravichander\nOne Sun One Moon - Anirudh\nStarboy - The Weeknd\nBeliever - Imagine Dragons`}
                className="w-full glass-input rounded-xl p-3.5 text-sm text-white placeholder:text-white/35 resize-none font-mono"
              />
            </div>

            {isImporting && (
              <div className="p-4 rounded-2xl liquid-glass border border-white/20 space-y-2.5">
                <div className="flex justify-between items-center text-xs font-bold text-white">
                  <span className="truncate pr-2">{statusText}</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-white/15 text-[11px] font-black tabular-nums flex-shrink-0">
                    {progressPct}%
                  </span>
                </div>
                {currentTrackLabel && (
                  <p className="text-[11px] text-white/60 truncate">
                    🎵 Matching: <span className="text-white font-semibold">{currentTrackLabel}</span>
                  </p>
                )}
                <div className="w-full h-2.5 bg-black/40 rounded-full overflow-hidden p-0.5 border border-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] via-fuchsia-500 to-cyan-400 transition-all duration-300 shadow-[0_0_12px_rgba(250,45,72,0.7)]"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-2">
              <GlassButton type="button" variant="ghost" onClick={onClose} disabled={isImporting}>
                Cancel
              </GlassButton>
              <GlassButton type="submit" variant="primary" disabled={isImporting}>
                {isImporting ? `Matching (${matchedCount}/${totalCount})...` : 'Build Full Playlist'}
              </GlassButton>
            </div>
          </form>
        ) : (
          /* ================= TAB 4: FILE IMPORTER (.M3U8 / .JSON) ================= */
          <form onSubmit={handleImportFile} className="flex flex-col gap-3.5">
            <div>
              <label className="text-xs font-bold text-white/85 block mb-1.5">
                Playlist Name (Optional override)
              </label>
              <input
                type="text"
                disabled={isImporting}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={parsedFile?.name || 'File Playlist Name'}
                className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/35"
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
                  ? 'border-amber-400 bg-amber-500/10 scale-[1.01]'
                  : parsedFile
                  ? 'border-emerald-400/50 bg-emerald-500/[0.06]'
                  : 'border-white/20 hover:border-white/40 bg-white/[0.02]'
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
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-400/30 text-rose-300 text-xs font-semibold">
                ⚠️ {fileError}
              </div>
            )}

            {parsedFile && parsedFile.tracks.length > 0 && (
              <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1.5 max-h-36 overflow-y-auto">
                <span className="text-[10px] font-black uppercase tracking-wider text-white/50 block">
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
              <div className="p-3.5 rounded-2xl liquid-glass border border-white/15 space-y-2 mt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-amber-300 animate-pulse">
                    {statusText || 'Importing tracks...'}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-white/15 text-[11px] font-black tabular-nums flex-shrink-0">
                    {progressPct}%
                  </span>
                </div>
                {currentTrackLabel && (
                  <p className="text-[11px] text-white/60 truncate">
                    🎵 Matching: <span className="text-white font-semibold">{currentTrackLabel}</span>
                  </p>
                )}
                <div className="w-full h-2.5 bg-black/40 rounded-full overflow-hidden p-0.5 border border-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 transition-all duration-300 shadow-[0_0_12px_rgba(245,158,11,0.7)]"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-2">
              <GlassButton type="button" variant="ghost" onClick={onClose} disabled={isImporting}>
                Cancel
              </GlassButton>
              <GlassButton
                type="submit"
                variant="primary"
                disabled={isImporting || !parsedFile || !parsedFile.tracks.length}
              >
                {isImporting
                  ? `Importing (${matchedCount}/${totalCount})...`
                  : `Import ${parsedFile?.tracks.length || 0} Songs`}
              </GlassButton>
            </div>
          </form>
        )}
      </div>
    </GlassModal>
  );
}
