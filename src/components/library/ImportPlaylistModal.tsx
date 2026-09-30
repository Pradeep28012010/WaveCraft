import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassModal from '../ui/GlassModal';
import GlassButton from '../ui/GlassButton';
import { useLibraryStore, normalizeQueryFingerprint } from '../../stores/libraryStore';
import { searchTracks } from '../../services/youtube';
import type { Track, Playlist } from '../../types';

interface ImportPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'live' | 'url' | 'text';
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
  const addToPlaylist = useLibraryStore((s) => s.addToPlaylist);
  const updatePlaylist = useLibraryStore((s) => s.updatePlaylist);

  const [mode, setMode] = useState<'live' | 'url' | 'text'>(initialMode);
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

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setErrorMsg('');
    }
  }, [isOpen, initialMode]);

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

      batchResults.forEach(({ track, fp }) => {
        if (track) {
          addToPlaylist(newPlaylist.id, track);
          matchedFingerprints.push(fp);
          addedSoFar++;
        }
      });

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
      const detectedPlatform = data.platform || 'External Link';

      await matchQueriesToTracks(
        data.queries,
        customName.trim() || data.name || (isLive ? 'Live Synced Playlist' : 'Imported Playlist'),
        data.coverUrl || '',
        detectedPlatform,
        {
          isLiveSync: isLive,
          sourceUrl: cleanedUrl,
          sourcePlatform: detectedPlatform,
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

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={
        mode === 'live'
          ? 'Connect Live Auto-Syncing Playlist'
          : 'Import External Playlist (Unlimited Tracks)'
      }
    >
      <div className="flex flex-col gap-3.5 text-white">
        {/* 3-Way Mode Switcher */}
        <div className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-white/[0.04] border border-white/12">
          <button
            type="button"
            onClick={() => {
              setMode('live');
              setErrorMsg('');
            }}
            className={`py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-1.5 ${
              mode === 'live'
                ? 'glass-button-emerald text-white shadow-lg'
                : 'glass-button text-white/70 hover:text-white'
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
            className={`py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-1.5 ${
              mode === 'url'
                ? 'glass-button-primary text-white shadow-lg'
                : 'glass-button text-white/70 hover:text-white'
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
            className={`py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-1.5 ${
              mode === 'text'
                ? 'glass-button-primary text-white shadow-lg'
                : 'glass-button text-white/70 hover:text-white'
            }`}
          >
            <span>📋 Paste Song List</span>
          </button>
        </div>

        {/* Dynamic Status / Mode Pill */}
        {mode === 'live' ? (
          <div className="px-3.5 py-2.5 rounded-2xl bg-emerald-500/12 border border-emerald-400/30 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-emerald-300 flex items-center gap-2 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Live Playlist Auto-Sync Engine
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/35 text-[10px] font-extrabold text-emerald-200 whitespace-nowrap flex-shrink-0">
                AUTO-UPDATING
              </span>
            </div>
            <p className="text-[11px] text-white/70 leading-snug">
              Stays linked to the original Spotify, YouTube, or JioSaavn playlist and automatically syncs new tracks in 320kbps HD whenever the source updates.
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-cyan-500/10 border border-cyan-400/25 text-[11px] text-cyan-200">
            <span className="font-bold flex items-center gap-2 whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              Full Playlist Importer Active
            </span>
            <span className="text-cyan-300/80 font-semibold whitespace-nowrap">
              Imports 100% of tracks • 320kbps HD
            </span>
          </div>
        )}

        {mode === 'live' || mode === 'url' ? (
          <form onSubmit={handleImportUrl} className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-semibold text-white/75 block mb-1">
                {mode === 'live'
                  ? 'Source Playlist URL to Monitor & Auto-Sync (Spotify, YouTube, JioSaavn)'
                  : 'Public Playlist or Album Link (Spotify, YouTube, JioSaavn)'}
              </label>
              <input
                type="url"
                required
                disabled={isImporting}
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://open.spotify.com/playlist/... or YouTube playlist link"
                className="w-full glass-input rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/35"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-white/75 block mb-1">
                Custom Playlist Name (optional)
              </label>
              <input
                type="text"
                disabled={isImporting}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Leave blank to use original playlist title"
                className="w-full glass-input rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/35"
              />
            </div>

            {/* Live Sync Strategy & Interval Controls (Clean full-width layout, zero pill clipping) */}
            {mode === 'live' && (
              <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/12 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white/80">
                    When Original Playlist Changes
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-white/50 font-medium mr-1">Check every:</span>
                    {[
                      { mins: 15, label: '15m' },
                      { mins: 30, label: '30m' },
                      { mins: 60, label: '1h' }
                    ].map((opt) => (
                      <button
                        key={opt.mins}
                        type="button"
                        onClick={() => setSyncIntervalMinutes(opt.mins)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer border whitespace-nowrap ${
                          syncIntervalMinutes === opt.mins
                            ? 'bg-cyan-500/25 border-cyan-400/50 text-cyan-200 shadow-sm'
                            : 'bg-white/[0.05] border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSyncStrategy('append')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                      syncStrategy === 'append'
                        ? 'bg-emerald-500/20 border-emerald-400/50 text-white shadow-md'
                        : 'bg-white/[0.04] border-white/10 text-white/70 hover:text-white hover:bg-white/[0.08]'
                    }`}
                  >
                    <div className="text-xs font-extrabold flex items-center justify-between">
                      <span>➕ Auto-Append Songs</span>
                      {syncStrategy === 'append' && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      )}
                    </div>
                    <div className="text-[11px] text-white/55">
                      Keep existing tracks & add new ones
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSyncStrategy('mirror')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                      syncStrategy === 'mirror'
                        ? 'bg-emerald-500/20 border-emerald-400/50 text-white shadow-md'
                        : 'bg-white/[0.04] border-white/10 text-white/70 hover:text-white hover:bg-white/[0.08]'
                    }`}
                  >
                    <div className="text-xs font-extrabold flex items-center justify-between">
                      <span>🪞 Exact Mirror Sync</span>
                      {syncStrategy === 'mirror' && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      )}
                    </div>
                    <div className="text-[11px] text-white/55">
                      Match exact additions & removals
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* Quick Presets to try */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-white/45 whitespace-nowrap">Sample charts:</span>
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
                Trending India Mix (50+ Songs)
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-200">
                {errorMsg}
              </div>
            )}

            {isImporting && (
              <div className="p-3.5 rounded-2xl liquid-glass border border-white/20 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-white">
                  <span className="truncate pr-2">{statusText}</span>
                  <span className="px-2 py-0.5 rounded-full bg-white/15 text-[11px] tabular-nums flex-shrink-0">
                    {progressPct}%
                  </span>
                </div>
                {currentTrackLabel && (
                  <p className="text-[11px] text-white/60 truncate">
                    🎵 Matching: <span className="text-white/90 font-semibold">{currentTrackLabel}</span>
                  </p>
                )}
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-indigo-500 transition-all duration-300"
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
                      className="text-[11px] px-3 py-1 rounded-full glass-button text-amber-300 hover:text-white cursor-pointer whitespace-nowrap"
                    >
                      Finish Initial Sync & Open ({matchedCount} tracks ready)
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-1">
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
        ) : (
          <form onSubmit={handleImportText} className="flex flex-col gap-3.5">
            <div>
              <label className="text-xs font-semibold text-white/75 block mb-1">
                Playlist Name
              </label>
              <input
                type="text"
                required
                disabled={isImporting}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="My Complete Imported Vibe"
                className="w-full glass-input rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/35"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-white/75">
                  Songs List (one song per line, e.g. "Song - Artist" • No limit)
                </label>
                <span className="text-[11px] text-white/50 font-semibold whitespace-nowrap">
                  {textInput.split('\n').map((l) => l.trim()).filter(Boolean).length} tracks detected
                </span>
              </div>
              <textarea
                rows={5}
                required
                disabled={isImporting}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={`Yeshanagula - Anirudh Ravichander\nOne Sun One Moon - Anirudh\nStarboy - The Weeknd\nBeliever - Imagine Dragons`}
                className="w-full glass-input rounded-xl p-3 text-sm text-white placeholder:text-white/35 resize-none"
              />
            </div>

            {isImporting && (
              <div className="p-3.5 rounded-2xl liquid-glass border border-white/20 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-white">
                  <span className="truncate pr-2">{statusText}</span>
                  <span className="px-2 py-0.5 rounded-full bg-white/15 text-[11px] tabular-nums flex-shrink-0">
                    {progressPct}%
                  </span>
                </div>
                {currentTrackLabel && (
                  <p className="text-[11px] text-white/60 truncate">
                    🎵 Matching: <span className="text-white/90 font-semibold">{currentTrackLabel}</span>
                  </p>
                )}
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] via-fuchsia-500 to-cyan-400 transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-1">
              <GlassButton type="button" variant="ghost" onClick={onClose} disabled={isImporting}>
                Cancel
              </GlassButton>
              <GlassButton type="submit" variant="primary" disabled={isImporting}>
                {isImporting ? `Matching (${matchedCount}/${totalCount})...` : 'Build Full Playlist'}
              </GlassButton>
            </div>
          </form>
        )}
      </div>
    </GlassModal>
  );
}
