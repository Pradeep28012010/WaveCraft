/**
 * WaveCraft Local Audio Import Engine
 * Drag-and-drop & file picker import for local audio files (MP3, FLAC, WAV, M4A, AAC, OGG, OPUS, WEBM).
 * Extracts metadata, stores binary blobs into IndexedDB for persistent offline playback,
 * connects to Web Audio DSP Equalizer & Spatial 8D engine, and updates user library & playlists.
 */

import type { Track } from '../types';
import { createStore, set as idbSet } from 'idb-keyval';
import { useLibraryStore } from '../stores/libraryStore';
import { getOfflineTracks, rehydrateOfflineVault } from './offlineVault';

const vaultBlobStore = createStore('wavecraft-audio-vault-blobs', 'audio');
const VAULT_META_KEY = 'wavecraft_offline_tracks_meta_v1';

export interface BitrateBreakdown {
  losslessCount: number;
  losslessBytes: number;
  studio320Count: number;
  studio320Bytes: number;
  standardCount: number;
  standardBytes: number;
  totalTracks: number;
  totalBytes: number;
  losslessFormatted: string;
  studio320Formatted: string;
  standardFormatted: string;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

/**
 * Computes the bitrate quality distribution across all offline and local tracks.
 */
export function computeBitrateBreakdown(tracks: Track[]): BitrateBreakdown {
  let losslessCount = 0;
  let losslessBytes = 0;
  let studio320Count = 0;
  let studio320Bytes = 0;
  let standardCount = 0;
  let standardBytes = 0;
  let totalBytes = 0;

  for (const t of tracks) {
    const bytes = t.fileSizeBytes || 0;
    totalBytes += bytes;
    const q = (t.quality || '').toLowerCase();
    const title = (t.title || '').toLowerCase();
    const isLossless =
      q.includes('lossless') ||
      q.includes('flac') ||
      q.includes('wav') ||
      title.endsWith('.flac') ||
      title.endsWith('.wav');
    const is320 =
      q.includes('320') ||
      q.includes('aac') ||
      q.includes('studio') ||
      title.endsWith('.m4a') ||
      title.endsWith('.aac') ||
      title.endsWith('.mp3');

    if (isLossless) {
      losslessCount++;
      losslessBytes += bytes;
    } else if (is320) {
      studio320Count++;
      studio320Bytes += bytes;
    } else {
      standardCount++;
      standardBytes += bytes;
    }
  }

  return {
    losslessCount,
    losslessBytes,
    studio320Count,
    studio320Bytes,
    standardCount,
    standardBytes,
    totalTracks: tracks.length,
    totalBytes,
    losslessFormatted: formatBytes(losslessBytes),
    studio320Formatted: formatBytes(studio320Bytes),
    standardFormatted: formatBytes(standardBytes)
  };
}

/**
 * Probes the duration of an audio File via HTML5 Audio metadata extraction.
 */
export function probeAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      resolve(210);
      return;
    }

    const audio = new Audio();
    audio.preload = 'metadata';

    const timeout = setTimeout(() => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {}
      resolve(210);
    }, 3500);

    audio.onloadedmetadata = () => {
      clearTimeout(timeout);
      const dur = audio.duration;
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {}
      resolve(Number.isFinite(dur) && dur > 0 ? Math.round(dur) : 210);
    };

    audio.onerror = () => {
      clearTimeout(timeout);
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {}
      resolve(210);
    };

    audio.src = objectUrl;
  });
}

/**
 * Parses raw filename into clean Title and Artist.
 */
export function parseFilenameMetadata(filename: string): { title: string; artist: string } {
  // Strip extension (.mp3, .flac, .wav, etc.)
  let clean = filename.replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus|webm|wma|aiff)$/i, '').trim();

  // Strip leading track numbers like "01 - ", "01. ", "01 "
  clean = clean.replace(/^(\d{1,3}[\s._-]+)/, '').trim();

  // Try splitting by " - " or " _ "
  if (clean.includes(' - ')) {
    const parts = clean.split(' - ').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return {
        artist: parts[0],
        title: parts.slice(1).join(' - ')
      };
    }
  }

  // Try splitting by " _ "
  if (clean.includes(' _ ')) {
    const parts = clean.split(' _ ').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return {
        artist: parts[0],
        title: parts.slice(1).join(' - ')
      };
    }
  }

  // If no artist delimiter, format title nicely
  const formattedTitle = clean.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    title: formattedTitle || 'Unknown Track',
    artist: 'Local Audio'
  };
}

/**
 * Determines audio quality descriptor based on file MIME type and extension.
 */
export function detectLocalFileQuality(file: File): string {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  if (name.endsWith('.flac') || type.includes('flac')) {
    return 'Lossless 24-bit FLAC';
  }
  if (name.endsWith('.wav') || type.includes('wav')) {
    return 'Lossless Studio WAV';
  }
  if (name.endsWith('.m4a') || name.endsWith('.aac') || type.includes('mp4') || type.includes('aac')) {
    return '320kbps Studio AAC';
  }
  if (name.endsWith('.mp3') || type.includes('mpeg') || type.includes('mp3')) {
    return '320kbps Studio MP3';
  }
  if (name.endsWith('.opus') || type.includes('opus')) {
    return 'Hi-Res Opus Audio';
  }
  if (name.endsWith('.ogg') || type.includes('ogg')) {
    return 'Studio OGG Vorbis';
  }
  return 'Hi-Fi Local Audio';
}

/**
 * Generates an SVG Data URI album cover tailored to local audio files.
 */
export function generateLocalCoverArt(title: string, artist: string): string {
  const hash = (title + artist).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const hue1 = hash % 360;
  const hue2 = (hue1 + 45) % 360;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="hsl(${hue1}, 80%, 45%)"/>
        <stop offset="100%" stop-color="hsl(${hue2}, 85%, 25%)"/>
      </linearGradient>
    </defs>
    <rect width="300" height="300" rx="36" fill="url(#grad)"/>
    <circle cx="150" cy="150" r="72" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="8"/>
    <circle cx="150" cy="150" r="28" fill="rgba(255,255,255,0.3)"/>
    <path d="M150 100 v60 l30 18" fill="none" stroke="white" stroke-width="6" stroke-linecap="round"/>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Imports local audio files (MP3, FLAC, WAV, M4A, etc.) into WaveCraft.
 * Stored in IndexedDB for permanent offline preservation and full Web Audio DSP support.
 */
export async function importLocalAudioFiles(
  files: FileList | File[]
): Promise<{ imported: Track[]; failed: number }> {
  const fileArray = Array.from(files).filter((f) => {
    const isAudioType = f.type.startsWith('audio/') || f.type === 'video/ogg' || f.type === 'video/webm';
    const isAudioExt = /\.(mp3|flac|wav|m4a|aac|ogg|opus|webm|wma|aiff)$/i.test(f.name);
    return isAudioType || isAudioExt;
  });

  if (fileArray.length === 0) {
    return { imported: [], failed: 0 };
  }

  const importedTracks: Track[] = [];
  let failed = 0;

  for (const file of fileArray) {
    try {
      const { title, artist } = parseFilenameMetadata(file.name);
      const duration = await probeAudioDuration(file);
      const quality = detectLocalFileQuality(file);
      const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const liveBlobUrl = URL.createObjectURL(file);
      const coverArt = generateLocalCoverArt(title, artist);

      const track: Track = {
        id,
        title,
        artist,
        album: 'Local Import',
        duration,
        thumbnail: coverArt,
        thumbnailLarge: coverArt,
        audioUrl: liveBlobUrl,
        quality,
        fileSizeBytes: file.size,
        offlineSource: 'manual',
        downloadedAt: Date.now(),
        isLocal: true
      };

      // 1. Store audio blob permanently into IndexedDB
      await idbSet(`audio_${id}`, file, vaultBlobStore);

      // 2. Add to Offline Vault metadata in localStorage & IndexedDB
      const currentVault = getOfflineTracks().filter((t) => t.id !== id);
      const updatedVault = [track, ...currentVault];
      try {
        localStorage.setItem(VAULT_META_KEY, JSON.stringify(updatedVault));
      } catch {}
      await idbSet(VAULT_META_KEY, updatedVault, vaultBlobStore);

      importedTracks.push(track);
    } catch (err) {
      console.warn('Failed to import local file:', file.name, err);
      failed++;
    }
  }

  // 3. Add to user library under "Local Imports" playlist
  if (importedTracks.length > 0) {
    try {
      const lib = useLibraryStore.getState();
      let localPlaylist = lib.playlists.find((p) => p.name === 'Local Imports');
      if (!localPlaylist) {
        localPlaylist = lib.createPlaylist(
          'Local Imports',
          'Locally imported tracks (MP3, FLAC, WAV, M4A) stored offline on this device.'
        );
      }
      lib.addTracksToPlaylist(localPlaylist.id, importedTracks);
      // Trigger vault rehydration so memory caches are fully up-to-date
      await rehydrateOfflineVault();
    } catch {}
  }

  return { imported: importedTracks, failed };
}
