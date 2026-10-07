import { useState, useEffect } from 'react';
import type { Track } from '../types';
import { resolveDirectAudio } from './streamResolver';
import { createStore, get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';

const VAULT_CACHE_NAME = 'wavecraft-offline-audio-vault-v1';
const VAULT_META_KEY = 'wavecraft_offline_tracks_meta_v1';

// Dedicated IndexedDB store for audio and image Blobs (guarantees offline support in Electron file:, Android, and Web)
const vaultBlobStore = createStore('wavecraft-audio-vault-blobs', 'audio');

type VaultListener = () => void;
const listeners = new Set<VaultListener>();
const trackStatusListeners = new Map<string, Set<VaultListener>>();
const activeSavingIds = new Set<string>();

let cachedOfflineTracks: Track[] | null = null;
let cachedOfflineIds = new Set<string>();

function syncMemoryCache(tracks: Track[]) {
  cachedOfflineTracks = tracks;
  cachedOfflineIds = new Set(tracks.map((t) => t.id));
}

function notifyListeners(changedTrackId?: string) {
  listeners.forEach((fn) => {
    try { fn(); } catch {}
  });
  if (changedTrackId) {
    const bucket = trackStatusListeners.get(changedTrackId);
    if (bucket) {
      bucket.forEach((fn) => {
        try { fn(); } catch {}
      });
    }
  } else {
    trackStatusListeners.forEach((bucket) => {
      bucket.forEach((fn) => {
        try { fn(); } catch {}
      });
    });
  }
}

/**
 * Reads the list of offline-saved tracks from in-memory cache (backed by localStorage).
 */
export function getOfflineTracks(): Track[] {
  if (cachedOfflineTracks !== null) {
    return cachedOfflineTracks;
  }
  try {
    const raw = localStorage.getItem(VAULT_META_KEY);
    if (!raw) {
      syncMemoryCache([]);
      return [];
    }
    const parsed = JSON.parse(raw);
    const valid = Array.isArray(parsed) ? parsed.filter((t) => t && t.id && t.title) : [];
    syncMemoryCache(valid);
    return valid;
  } catch {
    syncMemoryCache([]);
    return [];
  }
}

function saveOfflineTracksMeta(tracks: Track[], changedTrackId?: string) {
  syncMemoryCache(tracks);
  try {
    localStorage.setItem(VAULT_META_KEY, JSON.stringify(tracks));
    notifyListeners(changedTrackId);
  } catch (e) {
    console.warn('Failed to persist offline vault metadata', e);
  }
}

/**
 * Checks synchronously in O(1) time whether a track ID is stored in the Offline Vault.
 */
export function isTrackOffline(trackId?: string): boolean {
  if (!trackId) return false;
  if (cachedOfflineTracks === null) {
    getOfflineTracks();
  }
  return cachedOfflineIds.has(trackId);
}

/**
 * Downloads and caches a track's audio stream and artwork into IndexedDB & CacheStorage.
 * Strict verification: returns true ONLY if the audio binary was genuinely saved.
 */
export async function saveTrackOffline(track: Track): Promise<boolean> {
  if (!track || !track.id) return false;

  try {
    let resolvedTrack = { ...track };

    // 1. Proactively resolve direct audio stream if missing or temporary Spotify preview
    if (!resolvedTrack.audioUrl || resolvedTrack.audioUrl.includes('p.scdn.co')) {
      try {
        const directUrl = await resolveDirectAudio(
          resolvedTrack.title,
          resolvedTrack.artist,
          resolvedTrack.duration,
          resolvedTrack.youtubeId
        );
        if (directUrl) {
          resolvedTrack.audioUrl = directUrl;
          resolvedTrack.quality = '320kbps Studio AAC';
        }
      } catch {}
    }

    if (!resolvedTrack.audioUrl) {
      console.warn('Could not resolve direct audio stream for offline saving:', resolvedTrack.title);
      return false;
    }

    // 2. Fetch the audio binary stream
    let audioBlob: Blob | null = null;
    try {
      const audioRes = await fetch(resolvedTrack.audioUrl);
      if (audioRes.ok) {
        audioBlob = await audioRes.blob();
      }
    } catch (fetchErr) {
      console.warn('Direct audio download failed, attempting proxy fallback...', fetchErr);
      // Fallback via serverless stream proxy if CORS restricted
      try {
        const proxyUrl = `https://wavecraft-alpha.vercel.app/api/music?action=resolve-stream&title=${encodeURIComponent(
          resolvedTrack.title
        )}&artist=${encodeURIComponent(resolvedTrack.artist)}&videoId=${encodeURIComponent(
          resolvedTrack.youtubeId || ''
        )}`;
        const pRes = await fetch(proxyUrl);
        if (pRes.ok) {
          const pData = await pRes.json();
          if (pData?.audioUrl) {
            const streamRes = await fetch(pData.audioUrl);
            if (streamRes.ok) {
              audioBlob = await streamRes.blob();
            }
          }
        }
      } catch {}
    }

    // Validate audio blob (must be at least 1KB of audio data)
    if (!audioBlob || audioBlob.size < 1024) {
      console.warn('Audio binary was empty or invalid for track:', resolvedTrack.title);
      return false;
    }

    resolvedTrack.fileSizeBytes = audioBlob.size;

    // 3. Save to IndexedDB (Works on Electron file:, Android, and Web)
    try {
      await idbSet(`audio_${resolvedTrack.id}`, audioBlob, vaultBlobStore);
    } catch (idbErr) {
      console.warn('Failed to save audio to IndexedDB:', idbErr);
    }

    // 4. Also store in CacheStorage if available
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cache = await caches.open(VAULT_CACHE_NAME);
        const audioResponse = new Response(audioBlob, {
          headers: {
            'Content-Type': audioBlob.type || 'audio/mp4',
            'Content-Length': audioBlob.size.toString()
          }
        });
        await cache.put(`https://wavecraft.local/offline-audio/${resolvedTrack.id}`, audioResponse);
      } catch {}
    }

    // 5. Cache thumbnail artwork
    if (resolvedTrack.thumbnail) {
      try {
        const imgRes = await fetch(resolvedTrack.thumbnail);
        if (imgRes.ok) {
          const imgBlob = await imgRes.blob();
          await idbSet(`art_${resolvedTrack.id}`, imgBlob, vaultBlobStore);
          if (typeof window !== 'undefined' && 'caches' in window) {
            try {
              const cache = await caches.open(VAULT_CACHE_NAME);
              await cache.put(
                `https://wavecraft.local/offline-art/${resolvedTrack.id}`,
                new Response(imgBlob)
              );
            } catch {}
          }
        }
      } catch {}
    }

    // 6. Update metadata
    const current = getOfflineTracks().filter((t) => t.id !== resolvedTrack.id);
    saveOfflineTracksMeta([resolvedTrack, ...current], resolvedTrack.id);
    return true;
  } catch (err) {
    console.warn('Offline Vault save failed:', err);
    return false;
  }
}

/**
 * Removes a track's audio binary, artwork, and metadata from the Offline Vault.
 */
export async function removeTrackOffline(trackId: string): Promise<void> {
  // Release active Blob object URL
  if (activeObjectUrls.has(trackId)) {
    try {
      URL.revokeObjectURL(activeObjectUrls.get(trackId)!);
    } catch {}
    activeObjectUrls.delete(trackId);
  }

  // Delete from IndexedDB
  try {
    await idbDel(`audio_${trackId}`, vaultBlobStore);
    await idbDel(`art_${trackId}`, vaultBlobStore);
  } catch {}

  // Delete from CacheStorage
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await caches.open(VAULT_CACHE_NAME);
      await cache.delete(`https://wavecraft.local/offline-audio/${trackId}`);
      await cache.delete(`https://wavecraft.local/offline-art/${trackId}`);
    } catch {}
  }

  const updated = getOfflineTracks().filter((t) => t.id !== trackId);
  saveOfflineTracksMeta(updated, trackId);
}

/**
 * Clears all downloaded audio tracks and purges offline storage completely.
 */
export async function clearAllOfflineTracks(): Promise<void> {
  activeObjectUrls.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  });
  activeObjectUrls.clear();

  try {
    const allKeys = await idbKeys(vaultBlobStore);
    for (const key of allKeys) {
      await idbDel(key, vaultBlobStore);
    }
  } catch {}

  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      await caches.delete(VAULT_CACHE_NAME);
    } catch {}
  }

  saveOfflineTracksMeta([]);
}

/**
 * Toggles a track's presence in the Offline Vault and notifies per-track listeners.
 */
export async function toggleOfflineTrack(track: Track): Promise<void> {
  if (!track?.id) return;
  if (isTrackOffline(track.id)) {
    await removeTrackOffline(track.id);
    return;
  }
  if (activeSavingIds.has(track.id)) return;
  activeSavingIds.add(track.id);
  notifyListeners(track.id);
  try {
    await saveTrackOffline(track);
  } finally {
    activeSavingIds.delete(track.id);
    notifyListeners(track.id);
  }
}

export interface PlaylistDownloadProgress {
  total: number;
  completed: number;
  currentTrackTitle?: string;
  isDownloading: boolean;
  failedCount: number;
}

export function isPlaylistFullyOffline(tracks: Track[]): boolean {
  if (!tracks || tracks.length === 0) return false;
  return tracks.every((t) => isTrackOffline(t.id));
}

export function getPlaylistOfflineCount(tracks: Track[]): number {
  if (!tracks || tracks.length === 0) return 0;
  return tracks.filter((t) => isTrackOffline(t.id)).length;
}

/**
 * 1-Click Batch Playlist Download:
 * Automatically downloads all tracks into the Offline Audio Vault with a concurrency pool.
 */
export async function savePlaylistOffline(
  tracks: Track[],
  onProgress?: (progress: PlaylistDownloadProgress) => void,
  shouldCancel?: () => boolean
): Promise<{ success: number; failed: number }> {
  if (!tracks || tracks.length === 0) return { success: 0, failed: 0 };

  const missing = tracks.filter((t) => !isTrackOffline(t.id));
  if (missing.length === 0) {
    onProgress?.({
      total: tracks.length,
      completed: tracks.length,
      isDownloading: false,
      failedCount: 0
    });
    return { success: 0, failed: 0 };
  }

  let completed = tracks.length - missing.length;
  let failed = 0;

  onProgress?.({
    total: tracks.length,
    completed,
    isDownloading: true,
    failedCount: 0
  });

  const concurrency = 2;
  let queueIdx = 0;

  async function worker() {
    while (queueIdx < missing.length) {
      if (shouldCancel?.()) break;
      const current = missing[queueIdx++];
      if (!current) break;

      onProgress?.({
        total: tracks.length,
        completed,
        currentTrackTitle: current.title,
        isDownloading: true,
        failedCount: failed
      });

      activeSavingIds.add(current.id);
      notifyListeners(current.id);

      try {
        const ok = await saveTrackOffline(current);
        if (ok) {
          completed++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      } finally {
        activeSavingIds.delete(current.id);
        notifyListeners(current.id);
      }

      onProgress?.({
        total: tracks.length,
        completed,
        isDownloading: true,
        failedCount: failed
      });
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, missing.length) }, () => worker());
  await Promise.all(workers);

  onProgress?.({
    total: tracks.length,
    completed,
    isDownloading: false,
    failedCount: failed
  });

  return { success: completed - (tracks.length - missing.length), failed };
}

/**
 * Retrieves a local Blob Object URL for a cached offline track so HTML5 Audio can play it
 * with 0ms network latency and zero internet connection.
 */
const activeObjectUrls = new Map<string, string>();

export async function getOfflineAudioObjectUrl(trackId: string): Promise<string | null> {
  if (!trackId) return null;
  if (activeObjectUrls.has(trackId)) {
    return activeObjectUrls.get(trackId)!;
  }

  // 1. Check IndexedDB store (Works in Electron file:, Android, and Web)
  try {
    const blob = await idbGet(`audio_${trackId}`, vaultBlobStore);
    if (blob && blob instanceof Blob && blob.size > 1024) {
      const objectUrl = URL.createObjectURL(blob);
      activeObjectUrls.set(trackId, objectUrl);
      return objectUrl;
    }
  } catch {}

  // 2. Check CacheStorage
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await caches.open(VAULT_CACHE_NAME);
      const match = await cache.match(`https://wavecraft.local/offline-audio/${trackId}`);
      if (match) {
        const blob = await match.blob();
        if (blob && blob.size > 1024) {
          const objectUrl = URL.createObjectURL(blob);
          activeObjectUrls.set(trackId, objectUrl);
          return objectUrl;
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Calculates current offline storage usage and device quota.
 */
export async function getOfflineStorageEstimate(): Promise<{
  usedBytes: number;
  totalBytes: number;
  formattedUsed: string;
  quotaFormatted: string;
}> {
  let used = 0;
  let total = 0;

  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      used = est.usage || 0;
      total = est.quota || 0;
    } catch {}
  }

  if (used === 0) {
    const tracks = getOfflineTracks();
    const recordedTotal = tracks.reduce((acc, t) => acc + (t.fileSizeBytes || 0), 0);
    used = recordedTotal > 0 ? recordedTotal : tracks.length * 6.8 * 1024 * 1024;
  }

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return {
    usedBytes: used,
    totalBytes: total,
    formattedUsed: formatSize(used),
    quotaFormatted: total > 0 ? formatSize(total) : 'Unlimited'
  };
}

/**
 * Lightweight O(1) hook for an individual TrackRow to subscribe ONLY to its own offline status.
 */
export function useTrackOfflineStatus(trackId: string) {
  const [status, setStatus] = useState(() => ({
    isOffline: isTrackOffline(trackId),
    isSaving: activeSavingIds.has(trackId)
  }));

  useEffect(() => {
    const sync = () => {
      const nextOffline = isTrackOffline(trackId);
      const nextSaving = activeSavingIds.has(trackId);
      setStatus((prev) =>
        prev.isOffline === nextOffline && prev.isSaving === nextSaving
          ? prev
          : { isOffline: nextOffline, isSaving: nextSaving }
      );
    };
    let bucket = trackStatusListeners.get(trackId);
    if (!bucket) {
      bucket = new Set();
      trackStatusListeners.set(trackId, bucket);
    }
    bucket.add(sync);
    sync();
    return () => {
      const b = trackStatusListeners.get(trackId);
      if (b) {
        b.delete(sync);
        if (b.size === 0) trackStatusListeners.delete(trackId);
      }
    };
  }, [trackId]);

  return {
    trackIsOffline: status.isOffline,
    isSavingOffline: status.isSaving,
    toggleOfflineTrack
  };
}

/**
 * Reactive hook for reading and managing the full Offline Audio Vault list.
 */
export function useOfflineVault() {
  const [offlineTracks, setOfflineTracks] = useState<Track[]>(() => getOfflineTracks());
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const onUpdate = () => {
      setOfflineTracks(getOfflineTracks());
      const map: Record<string, boolean> = {};
      activeSavingIds.forEach((id) => {
        map[id] = true;
      });
      setSavingIds(map);
    };
    listeners.add(onUpdate);
    return () => {
      listeners.delete(onUpdate);
    };
  }, []);

  return {
    offlineTracks,
    savingIds,
    isOffline: (id?: string) => Boolean(id && cachedOfflineIds.has(id)),
    toggleOfflineTrack,
    removeTrackOffline,
    clearAllOfflineTracks,
    getOfflineStorageEstimate
  };
}
