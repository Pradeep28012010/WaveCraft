import React, { useState } from 'react';
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
  const [progressPct, setProgressPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const matchQueriesToTracks = async (
    queries: { title: string; artist?: string }[],
    playlistName: string,
    coverUrl = '',
    platform = 'External'
  ) => {
    setStatusText(`Creating "${playlistName}" and matching ${queries.length} tracks in 320kbps...`);
    setProgressPct(5);

    const newPlaylist = createPlaylist(
      playlistName,
      `Imported from ${platform} via WaveCraft • 320kbps Studio HD`,
      coverUrl
    );

    let completed = 0;
    const batchSize = 4;
    for (let i = 0; i < queries.length; i += batchSize) {
      const batch = queries.slice(i, i + batchSize);
      const batchTracks = await Promise.all(
        batch.map(async (q) => {
          const searchStr = `${q.title} ${q.artist || ''}`.trim();
          const results = await searchTracks(searchStr);
          return results[0] || null;
        })
      );

      batchTracks.forEach((track: Track | null) => {
        if (track) {
          addToPlaylist(newPlaylist.id, track);
        }
      });

      completed += batch.length;
      const pct = Math.min(100, Math.round((completed / queries.length) * 100));
      setProgressPct(pct);
      setStatusText(`Matched ${Math.min(completed, queries.length)} of ${queries.length} songs...`);
    }

    setIsImporting(false);
    setStatusText('');
    setProgressPct(0);
    onClose();
    navigate(`/playlist/${newPlaylist.id}`);
  };

  const handleImportUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setIsImporting(true);
    setErrorMsg('');
    setStatusText('Fetching playlist metadata from source...');
    setProgressPct(10);

    try {
      const res = await fetch(`/api/music?action=import-playlist&url=${encodeURIComponent(urlInput.trim())}`);
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
    } catch (err) {
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

    const queries = lines.slice(0, 40).map((line) => {
      const parts = line.split(' - ');
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
    <GlassModal isOpen={isOpen} onClose={onClose} title="Import External Playlist">
      <div className="flex flex-col gap-4 text-white">
        {/* Mode Switcher */}
        <div className="flex gap-2 p-1 rounded-2xl bg-white/[0.06] border border-white/10">
          <button
            type="button"
            onClick={() => {
              setMode('url');
              setErrorMsg('');
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mode === 'url'
                ? 'bg-[var(--color-accent)] text-white shadow-md'
                : 'text-white/65 hover:text-white'
            }`}
          >
            Playlist Link (URL)
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('text');
              setErrorMsg('');
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mode === 'text'
                ? 'bg-[var(--color-accent)] text-white shadow-md'
                : 'text-white/65 hover:text-white'
            }`}
          >
            Paste Song List (Text)
          </button>
        </div>

        {mode === 'url' ? (
          <form onSubmit={handleImportUrl} className="flex flex-col gap-3.5">
            <div>
              <label className="text-xs font-semibold text-white/70 block mb-1.5">
                Public Playlist or Album Link
              </label>
              <input
                type="url"
                required
                disabled={isImporting}
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://.../playlist/..."
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
                className="text-[11px] px-2.5 py-1 rounded-full glass text-emerald-300 hover:text-white cursor-pointer"
              >
                Global Top Hits Mix
              </button>
              <button
                type="button"
                onClick={() =>
                  setUrlInput('https://open.spotify.com/playlist/37i9dQZF1DX0XUfTFmNBRM')
                }
                className="text-[11px] px-2.5 py-1 rounded-full glass text-emerald-300 hover:text-white cursor-pointer"
              >
                Trending India Mix
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-200">
                {errorMsg}
              </div>
            )}

            {isImporting && (
              <div className="p-4 rounded-2xl glass space-y-2">
                <div className="flex justify-between text-xs font-semibold text-white/85">
                  <span>{statusText}</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--color-accent)] to-purple-500 transition-all duration-300"
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
                {isImporting ? 'Importing...' : 'Import to Library'}
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
                placeholder="My Imported Vibe"
                className="w-full glass-input rounded-xl p-3 text-sm text-white placeholder:text-white/35"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-white/70 block mb-1.5">
                Songs List (one song per line, e.g. "Song - Artist")
              </label>
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
              <div className="p-4 rounded-2xl glass space-y-2">
                <div className="flex justify-between text-xs font-semibold text-white/85">
                  <span>{statusText}</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--color-accent)] to-purple-500 transition-all duration-300"
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
                {isImporting ? 'Matching Songs...' : 'Build Playlist'}
              </GlassButton>
            </div>
          </form>
        )}
      </div>
    </GlassModal>
  );
}
