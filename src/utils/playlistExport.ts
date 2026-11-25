/**
 * WaveCraft Playlist & Library Export / Import Utilities
 * Supports industry-standard Extended M3U8 (.m3u8 / .m3u) and native WaveCraft JSON (.json)
 */

import type { Track, Playlist } from '../types';

/**
 * Trigger a browser download for a Blob
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Format string safe for filenames
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'playlist';
}

export function extractValidYoutubeId(track: { youtubeId?: string; id?: string }): string | undefined {
  if (typeof track.youtubeId === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(track.youtubeId.trim())) {
    return track.youtubeId.trim();
  }
  if (typeof track.id === 'string') {
    const ytPrefixed = track.id.match(/^yt[_-]([a-zA-Z0-9_-]{11})$/);
    if (ytPrefixed) return ytPrefixed[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(track.id)) return track.id;
  }
  return undefined;
}

/**
 * Export a playlist to standard Extended M3U8 format (.m3u8)
 * Compatible with VLC, Apple Music, Foobar2000, Winamp, Android/iOS audio players
 */
export function exportToM3U8(playlist: Playlist): void {
  const lines: string[] = [
    '#EXTM3U',
    '#EXTENC:UTF-8',
    `#PLAYLIST:${playlist.name}`
  ];

  if (playlist.description) {
    lines.push(`#COMMENT:${playlist.description}`);
  }

  playlist.tracks.forEach((track) => {
    const duration = Math.round(track.duration || 0);
    const artist = track.artist || 'Unknown Artist';
    const title = track.title || 'Unknown Title';
    lines.push(`#EXTINF:${duration},${artist} - ${title}`);
    const ytId = extractValidYoutubeId(track);
    if (track.audioUrl) {
      lines.push(track.audioUrl);
    } else if (ytId) {
      lines.push(`https://www.youtube.com/watch?v=${ytId}`);
    } else {
      lines.push(`#TRACKID:${track.id}`);
    }
  });

  const content = lines.join('\n');
  const blob = new Blob([content], { type: 'audio/x-mpegurl;charset=utf-8' });
  downloadBlob(blob, `${sanitizeFilename(playlist.name)}.m3u8`);
}

/**
 * Export a playlist to native WaveCraft JSON (.json)
 */
export function exportToJSON(playlist: Playlist): void {
  const data = {
    wavecraftVersion: '2.0',
    exportedAt: new Date().toISOString(),
    type: 'single-playlist',
    playlist: {
      name: playlist.name,
      description: playlist.description,
      coverUrl: playlist.coverUrl || playlist.coverImage,
      sourceUrl: playlist.sourceUrl,
      sourcePlatform: playlist.sourcePlatform,
      tracks: playlist.tracks.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        duration: t.duration,
        thumbnail: t.thumbnail,
        youtubeId: t.youtubeId,
        audioUrl: t.audioUrl
      }))
    }
  };

  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, `${sanitizeFilename(playlist.name)}.wavecraft.json`);
}

/**
 * Export entire library (all custom playlists + liked songs) to JSON backup
 */
export function exportFullLibraryJSON(playlists: Playlist[], likedSongs: Track[]): void {
  const data = {
    wavecraftVersion: '2.0',
    exportedAt: new Date().toISOString(),
    type: 'full-library-backup',
    likedSongsCount: likedSongs.length,
    playlistsCount: playlists.length,
    likedSongs,
    playlists
  };

  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const dateStr = new Date().toISOString().split('T')[0];
  downloadBlob(blob, `WaveCraft_Library_Backup_${dateStr}.json`);
}

export interface ParsedPlaylistFile {
  name: string;
  description?: string;
  tracks: Array<{
    title: string;
    artist?: string;
    duration?: number;
    videoId?: string;
    audioUrl?: string;
  }>;
}

/**
 * Parse an uploaded M3U / M3U8 string
 */
export function parseM3U8String(content: string, defaultName = 'Imported M3U Playlist'): ParsedPlaylistFile {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let name = defaultName;
  let description = '';
  const tracks: ParsedPlaylistFile['tracks'] = [];

  let currentTitle = '';
  let currentArtist = '';
  let currentDuration = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#PLAYLIST:')) {
      name = line.replace('#PLAYLIST:', '').trim() || name;
    } else if (line.startsWith('#COMMENT:')) {
      description = line.replace('#COMMENT:', '').trim();
    } else if (line.startsWith('#EXTINF:')) {
      const commaIdx = line.indexOf(',');
      const colonIdx = line.indexOf(':');
      if (commaIdx !== -1 && colonIdx !== -1) {
        const durStr = line.substring(colonIdx + 1, commaIdx).trim();
        currentDuration = parseInt(durStr, 10) || 0;
        const meta = line.substring(commaIdx + 1).trim();
        const dashIdx = meta.indexOf(' - ');
        if (dashIdx !== -1) {
          currentArtist = meta.substring(0, dashIdx).trim();
          currentTitle = meta.substring(dashIdx + 3).trim();
        } else {
          currentArtist = '';
          currentTitle = meta;
        }
      }
    } else if (!line.startsWith('#')) {
      // Audio or YouTube URL
      let videoId = '';
      if (line.includes('youtube.com/watch?v=')) {
        const match = line.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        if (match) videoId = match[1];
      } else if (line.includes('youtu.be/')) {
        const match = line.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
        if (match) videoId = match[1];
      }

      if (currentTitle) {
        tracks.push({
          title: currentTitle,
          artist: currentArtist || 'Unknown Artist',
          duration: currentDuration,
          videoId: videoId || undefined,
          audioUrl: !videoId && line.startsWith('http') ? line : undefined
        });
      }
      currentTitle = '';
      currentArtist = '';
      currentDuration = 0;
    }
  }

  return { name, description, tracks };
}

/**
 * Parse an uploaded JSON string
 */
export function parseJSONPlaylistString(content: string, defaultName = 'Imported JSON Playlist'): ParsedPlaylistFile {
  interface RawJsonTrack {
    title?: string;
    artist?: string;
    duration?: number;
    youtubeId?: string;
    id?: string;
    audioUrl?: string;
  }

  const mapTrack = (t: RawJsonTrack) => ({
    title: t.title || 'Untitled',
    artist: t.artist || 'Unknown Artist',
    duration: t.duration || 0,
    videoId: extractValidYoutubeId(t),
    audioUrl: t.audioUrl
  });

  const parsed = JSON.parse(content);

  // Support Full Library Backup imports directly
  if (parsed.type === 'full-library-backup' || (Array.isArray(parsed.likedSongs) && Array.isArray(parsed.playlists))) {
    const allTracks: RawJsonTrack[] = [];
    if (Array.isArray(parsed.likedSongs)) {
      allTracks.push(...parsed.likedSongs);
    }
    if (Array.isArray(parsed.playlists)) {
      parsed.playlists.forEach((p: { tracks?: RawJsonTrack[] }) => {
        if (Array.isArray(p.tracks)) allTracks.push(...p.tracks);
      });
    }
    return {
      name: parsed.name || 'Restored Library Backup',
      description: `Restored from library backup (${allTracks.length} tracks)`,
      tracks: allTracks.map(mapTrack)
    };
  }

  if (parsed.playlist && typeof parsed.playlist === 'object') {
    return {
      name: parsed.playlist.name || defaultName,
      description: parsed.playlist.description || '',
      tracks: Array.isArray(parsed.playlist.tracks)
        ? (parsed.playlist.tracks as RawJsonTrack[]).map(mapTrack)
        : []
    };
  }

  if (Array.isArray(parsed)) {
    return {
      name: defaultName,
      tracks: (parsed as RawJsonTrack[]).map(mapTrack)
    };
  }

  if (Array.isArray(parsed.tracks)) {
    return {
      name: parsed.name || defaultName,
      description: parsed.description || '',
      tracks: (parsed.tracks as RawJsonTrack[]).map(mapTrack)
    };
  }

  throw new Error('Unsupported JSON playlist structure');
}
