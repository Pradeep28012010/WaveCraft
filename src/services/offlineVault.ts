import { useState, useEffect } from 'react';
import type { Track } from '../types';
import { searchTracks } from './youtube';

const VAULT_CACHE_NAME = 'wavecraft-offline-audio-vault-v1';
const VAULT_META_KEY = 'wavecraft_offline_tracks_meta_v1';

type VaultListener = () => void;
const listeners = new Set<VaultListener>();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

/**
 * Reads the list of offline-saved tracks from localStorage metadata.
 */
export function getOfflineTracks(): Track[] {
  try {
    const raw = localStorage.getItem(VAULT_META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => t && t.id && t.title) : [];
  } catch {
    return [];
  }
}

function saveOfflineTracksMeta(tracks: Track[]) {
  try {
    localStorage.setItem(VAULT_META_KEY, JSON.stringify(tracks));
    notifyListeners();
  } catch (e) {
    console.warn('Failed to persist offline vault metadata', e);
  }
}

/**
 * Checks synchronously whether a track ID is stored in the Offline Vault.
 */
export function isTrackOffline(trackId?: string): boolean {
  if (!trackId) return false;
  return getOfflineTracks().some((t) => t.id === trackId);
}

/**
 * Downloads and caches a track's 320kbps audio stream and artwork in browser CacheStorage
 * for zero-latency local and offline playback.
 */
export async function saveTrackOffline(track: Track): Promise<boolean> {
  if (!track || !track.id) return false;

  try {
    let resolvedTrack = { ...track };

    // If the track doesn't have a direct audioUrl yet, resolve it via JioSaavn search
    if (!resolvedTrack.audioUrl) {
      const matches = await searchTracks(`${track.title} ${track.artist}`);
      const best = matches.find((m) => m.audioUrl) || matches[0];
      if (best?.audioUrl) {
        resolvedTrack.audioUrl = best.audioUrl;
        if (!resolvedTrack.thumbnail && best.thumbnail) {
          resolvedTrack.thumbnail = best.thumbnail;
        }
      }
    }

    if (!resolvedTrack.audioUrl) {
      return false;
    }

    if ('caches' in window) {
      const cache = await caches.open(VAULT_CACHE_NAME);
      const audioRes = await fetch(resolvedTrack.audioUrl, { mode: 'cors' });
      if (!audioRes.ok) return false;
      await cache.put(`https://wavecraft.local/offline-audio/${resolvedTrack.id}`, audioRes);

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
    saveOfflineTracksMeta([resolvedTrack, ...current]);
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
  saveOfflineTracksMeta(updated);
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
 * Reactive hook for reading and managing the Offline 320kbps Audio Vault.
 */
export function useOfflineVault() {
  const [offlineTracks, setOfflineTracks] = useState<Track[]>(() => getOfflineTracks());
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const onUpdate = () => setOfflineTracks(getOfflineTracks());
    listeners.add(onUpdate);
    return () => {
      listeners.delete(onUpdate);
    };
  }, []);

  const toggleOfflineTrack = async (track: Track) => {
    if (!track?.id) return;
    if (isTrackOffline(track.id)) {
      await removeTrackOffline(track.id);
      return;
    }
    setSavingIds((prev) => ({ ...prev, [track.id]: true }));
    try {
      await saveTrackOffline(track);
    } finally {
      setSavingIds((prev) => {
        const next = { ...prev };
        delete next[track.id];
        return next;
      });
    }
  };

  return {
    offlineTracks,
    savingIds,
    isOffline: (id?: string) => Boolean(id && offlineTracks.some((t) => t.id === id)),
    toggleOfflineTrack,
    removeTrackOffline
  };
}
