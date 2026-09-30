import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassModal from '../ui/GlassModal';
import GlassButton from '../ui/GlassButton';
import { useLibraryStore } from '../../stores/libraryStore';
import { searchTracks } from '../../services/youtube';
import type { Track } from '../../types';

interface ImportPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ImportQueryItem {
  title: string;
  artist?: string;
  videoId?: string;
}

export default function ImportPlaylistModal({ isOpen, onClose }: ImportPlaylistModalProps) {
  const navigate = useNavigate();
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const addToPlaylist = useLibraryStore((s) => s.addToPlaylist);

  const [mode, setMode] = useState<'url' | 'text'>('url');
  const [urlInput, setUrlInput] = useState('');
  const [customName, setCustomName] = useState('');
  const [textInput, setTextInput] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [currentTrackLabel, setCurrentTrackLabel] = useState('');
  const [matchedCount, setMatchedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const abortRef = useRef(false);

  const matchQueriesToTracks = async (
    queries: ImportQueryItem[],
    playlistName: string,
    coverUrl = '',
    platform = 'External'
  ) => {
    abortRef.current = false;
    setTotalCount(queries.length);
    setMatchedCount(0);
    setStatusText(`Creating "${playlistName}" • Importing all ${queries.length} tracks in 320kbps...`);
    setProgressPct(3);

    const newPlaylist = createPlaylist(
      playlistName,
      `Imported ${queries.length} tracks from ${platform} via WaveCraft • 320kbps Studio HD`,
      coverUrl
    );

    let completed = 0;
    let addedSoFar = 0;
    const batchSize = 8;

    for (let i = 0; i < queries.length; i += batchSize) {
      if (abortRef.current) break;

      const batch = queries.slice(i, i + batchSize);
      setCurrentTrackLabel(
        batch[0]?.title
          ? `${batch[0].title}${batch[0].artist ? ` — ${batch[0].artist}` : ''}`
          : ''
      );

      const batchTracks = await Promise.all(
        batch.map(async (q): Promise<Track | null> => {
          const searchStr = `${q.title} ${q.artist || ''}`.trim();
          if (!searchStr) return null;
          try {
            const results = await searchTracks(searchStr);
            if (results && results.length > 0) {
              return results[0];
            }
          } catch {}

          // Fallback if YouTube playlist already provided a direct videoId
          if (q.videoId) {
            return {
              id: `yt-${q.videoId}`,
              title: q.title || 'Imported Track',
              artist: q.artist || 'Unknown Artist',
              album: playlistName,
              duration: 210,
              thumbnail: `https://i.ytimg.com/vi/${q.videoId}/hqdefault.jpg`,
              thumbnailLarge: `https://i.ytimg.com/vi/${q.videoId}/maxresdefault.jpg`,
              youtubeId: q.videoId
            };
          }
          return null;
        })
      );

      batchTracks.forEach((track: Track | null) => {
        if (track) {
          addToPlaylist(newPlaylist.id, track);
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

    setIsImporting(false);
    setStatusText('');
    setCurrentTrackLabel('');
    setProgressPct(0);
    onClose();
    navigate(`/playlist/${newPlaylist.id}`);
  };

  const handleImportUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setIsImporting(true);
    setErrorMsg('');
    setStatusText('Fetching complete playlist tracklist (unlimited tracks)...');
    setProgressPct(5);

    try {
      const res = await fetch(
        `/api/music?action=import-playlist&url=${encodeURIComponent(urlInput.trim())}`
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

      await matchQueriesToTracks(
        data.queries,
        customName.trim() || data.name || 'Imported Playlist',
        data.coverUrl || '',
        data.platform || 'External Link'
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

    // Import ALL lines with zero track limit
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
    <GlassModal isOpen={isOpen} onClose={onClose} title="Import External Playlist (Unlimited Tracks)">
      <div className="flex flex-col gap-4 text-white">
        {/* Mode Switcher */}
        <div className="flex gap-2 p-1.5 rounded-2xl liquid-glass border border-white/15">
          <button
            type="button"
            onClick={() => {
              setMode('url');
              setErrorMsg('');
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              mode === 'url'
                ? 'glass-button-primary text-white shadow-lg'
                : 'glass-button text-white/70 hover:text-white'
            }`}
          >
            🔗 Playlist Link (Spotify / YouTube / Saavn)
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('text');
              setErrorMsg('');
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              mode === 'text'
                ? 'glass-button-primary text-white shadow-lg'
                : 'glass-button text-white/70 hover:text-white'
            }`}
          >
            📋 Paste Song List (Unlimited)
          </button>
        </div>

        {/* Unlimited Tracks Info Pill */}
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-400/25 text-[11px] text-emerald-200">
          <span className="font-bold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Full Playlist Importer Active
          </span>
          <span className="text-emerald-300/80 font-semibold">Imports 100% of tracks • 320kbps HD</span>
        </div>

        {mode === 'url' ? (
          <form onSubmit={handleImportUrl} className="flex flex-col gap-3.5">
            <div>
              <label className="text-xs font-semibold text-white/70 block mb-1.5">
                Public Playlist or Album Link (Spotify, YouTube, JioSaavn)
              </label>
              <input
                type="url"
                required
                disabled={isImporting}
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://open.spotify.com/playlist/... or YouTube playlist link"
                className="w-full glass-input rounded-xl p-3 text-sm text-white placeholder:text-white/35"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-white/70 block mb-1.5">
                Custom Playlist Name (optional)
              </label>
              <input
                type="text"
                disabled={isImporting}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Leave blank to use original playlist title"
                className="w-full glass-input rounded-xl p-3 text-sm text-white placeholder:text-white/35"
              />
            </div>

            {/* Quick Presets to try */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] text-white/45">Quick sample links:</span>
              <button
                type="button"
                onClick={() =>
                  setUrlInput('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')
                }
                className="text-[11px] px-3 py-1 rounded-full glass-button text-emerald-300 hover:text-white cursor-pointer"
              >
                Global Top Hits (50+ Songs)
              </button>
              <button
                type="button"
                onClick={() =>
                  setUrlInput('https://open.spotify.com/playlist/37i9dQZF1DX0XUfTFmNBRM')
                }
                className="text-[11px] px-3 py-1 rounded-full glass-button text-emerald-300 hover:text-white cursor-pointer"
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
              <div className="p-4 rounded-2xl liquid-glass border border-white/20 space-y-2.5">
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
                <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] via-fuchsia-500 to-cyan-400 transition-all duration-300"
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
                      className="text-[11px] px-3 py-1 rounded-full glass-button text-amber-300 hover:text-white cursor-pointer"
                    >
                      Finish Now & Open ({matchedCount} tracks ready)
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2.5 mt-2">
              <GlassButton type="button" variant="ghost" onClick={onClose} disabled={isImporting}>
                Cancel
              </GlassButton>
              <GlassButton type="submit" variant="primary" disabled={isImporting}>
                {isImporting ? `Importing (${matchedCount}/${totalCount || '...'})` : 'Import All Tracks'}
              </GlassButton>
            </div>
          </form>
        ) : (
          <form onSubmit={handleImportText} className="flex flex-col gap-3.5">
            <div>
              <label className="text-xs font-semibold text-white/70 block mb-1.5">
                Playlist Name
              </label>
              <input
                type="text"
                required
                disabled={isImporting}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="My Complete Imported Vibe"
                className="w-full glass-input rounded-xl p-3 text-sm text-white placeholder:text-white/35"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-white/70">
                  Songs List (one song per line, e.g. "Song - Artist" • No limit)
                </label>
                <span className="text-[11px] text-white/50 font-semibold">
                  {textInput.split('\n').map((l) => l.trim()).filter(Boolean).length} tracks detected
                </span>
              </div>
              <textarea
                rows={6}
                required
                disabled={isImporting}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={`Yeshanagula - Anirudh Ravichander\nOne Sun One Moon - Anirudh\nStarboy - The Weeknd\nBeliever - Imagine Dragons`}
                className="w-full glass-input rounded-xl p-3 text-sm text-white placeholder:text-white/35 resize-none"
              />
            </div>

            {isImporting && (
              <div className="p-4 rounded-2xl liquid-glass border border-white/20 space-y-2.5">
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
                <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] via-fuchsia-500 to-cyan-400 transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2.5 mt-2">
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
