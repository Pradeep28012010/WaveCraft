import { useState, useEffect } from 'react';
import type { Track } from '../types';
import { resolveDirectAudio } from './streamResolver';

const VAULT_CACHE_NAME = 'wavecraft-offline-audio-vault-v1';
const VAULT_META_KEY = 'wavecraft_offline_tracks_meta_v1';

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
  listeners.forEach((fn) => fn());
  if (changedTrackId) {
    const bucket = trackStatusListeners.get(changedTrackId);
    if (bucket) bucket.forEach((fn) => fn());
  } else {
    trackStatusListeners.forEach((bucket) => bucket.forEach((fn) => fn()));
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
 * Downloads and caches a track's 320kbps audio stream and artwork in browser CacheStorage
 * for zero-latency local and offline playback.
 */
export async function saveTrackOffline(track: Track): Promise<boolean> {
  if (!track || !track.id) return false;

  try {
    let resolvedTrack = { ...track };

    // Proactively resolve direct 320kbps stream if missing or temporary Spotify preview
    if (!resolvedTrack.audioUrl || resolvedTrack.audioUrl.includes('p.scdn.co')) {
      try {
        const directUrl = await resolveDirectAudio(resolvedTrack.title, resolvedTrack.artist, resolvedTrack.duration);
        if (directUrl) {
          resolvedTrack.audioUrl = directUrl;
          resolvedTrack.quality = '320kbps Studio AAC';
        }
      } catch {}
    }

    if ('caches' in window) {
      const cache = await caches.open(VAULT_CACHE_NAME);
      if (resolvedTrack.audioUrl) {
        try {
          const audioRes = await fetch(resolvedTrack.audioUrl, { mode: 'cors' });
          if (audioRes.ok) {
            await cache.put(`https://wavecraft.local/offline-audio/${resolvedTrack.id}`, audioRes);
          }
        } catch {}
      }

      if (resolvedTrack.thumbnail) {
        try {
          const imgRes = await fetch(resolvedTrack.thumbnail, { mode: 'cors' });
          if (imgRes.ok) {
            await cache.put(`https://wavecraft.local/offline-art/${resolvedTrack.id}`, imgRes);
          }
        } catch {
          // Artwork caching is optional
        }
      }
    }

    const current = getOfflineTracks().filter((t) => t.id !== resolvedTrack.id);
    saveOfflineTracksMeta([resolvedTrack, ...current], resolvedTrack.id);
    return true;
  } catch (err) {
    console.warn('Offline Vault save failed:', err);
    return false;
  }
}

/**
 * Removes a track's audio binary and metadata from the Offline Vault.
 */
export async function removeTrackOffline(trackId: string): Promise<void> {
  try {
    if ('caches' in window) {
      const cache = await caches.open(VAULT_CACHE_NAME);
      await cache.delete(`https://wavecraft.local/offline-audio/${trackId}`);
      await cache.delete(`https://wavecraft.local/offline-art/${trackId}`);
    }
  } catch {}

  const updated = getOfflineTracks().filter((t) => t.id !== trackId);
  saveOfflineTracksMeta(updated, trackId);
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
  if (!trackId || !('caches' in window)) return null;
  if (activeObjectUrls.has(trackId)) {
    return activeObjectUrls.get(trackId)!;
  }
  try {
    const cache = await caches.open(VAULT_CACHE_NAME);
    const match = await cache.match(`https://wavecraft.local/offline-audio/${trackId}`);
    if (!match) return null;
    const blob = await match.blob();
    if (blob.size < 1024) return null;
    const objectUrl = URL.createObjectURL(blob);
    activeObjectUrls.set(trackId, objectUrl);
    return objectUrl;
  } catch {
    return null;
  }
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
 * Reactive hook for reading and managing the full Offline 320kbps Audio Vault list.
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
    removeTrackOffline
  };
}
