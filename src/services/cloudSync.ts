import { getApiBaseUrl } from './apiConfig';
import type { LibraryBackupPayload } from './storage';
import {
  loadLikedSongs,
  loadPlaylists,
  loadFolders,
  loadRecentlyPlayed,
  loadGalaxyPrefs
} from './storage';

export interface CloudSyncResult {
  success: boolean;
  code?: string;
  expiresAt?: number;
  expiresInMinutes?: number;
  payload?: LibraryBackupPayload;
  error?: string;
}

/**
 * Creates a comprehensive library snapshot ready for cross-device beam syncing.
 */
export async function createSyncPayload(): Promise<LibraryBackupPayload> {
  const [likedSongs, playlists, folders, recentlyPlayed, galaxyPrefs] = await Promise.all([
    loadLikedSongs(),
    loadPlaylists(),
    loadFolders(),
    loadRecentlyPlayed(),
    loadGalaxyPrefs()
  ]);

  return {
    wavecraftVersion: '5.3.3',
    exportedAt: new Date().toISOString(),
    type: 'full-library-backup',
    likedSongs,
    playlists,
    folders,
    galaxyPrefs,
    playHistory: recentlyPlayed.map((r) => ({
      trackId: r.track.id,
      playedAt: r.playedAt,
      duration: r.track.duration || 0
    }))
  };
}

/**
 * Publishes the local library snapshot to the temporary WaveCraft Cloud Sync Relay.
 * Returns a 6-character sync code (e.g., WAVE-7492) valid for 30 minutes.
 */
export async function publishCloudSync(
  payload?: LibraryBackupPayload,
  customCode?: string
): Promise<CloudSyncResult> {
  try {
    const dataToSync = payload || (await createSyncPayload());
    const baseUrl = getApiBaseUrl();
    const endpoint = `${baseUrl}/api/music?action=sync-publish`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: customCode || undefined,
        payload: dataToSync
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'Failed to publish cloud sync room.'
      };
    }

    return {
      success: true,
      code: data.code,
      expiresAt: data.expiresAt,
      expiresInMinutes: data.expiresInMinutes || 30
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error during cloud sync';
    return {
      success: false,
      error: message
    };
  }
}

/**
 * Pulls a beamed library snapshot from the Cloud Sync Relay using a 6-character code.
 */
export async function pullCloudSync(code: string): Promise<CloudSyncResult> {
  try {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      return { success: false, error: 'Please enter a valid sync code.' };
    }

    const baseUrl = getApiBaseUrl();
    const endpoint = `${baseUrl}/api/music?action=sync-pull&code=${encodeURIComponent(cleanCode)}`;

    const res = await fetch(endpoint, {
      headers: {
        Accept: 'application/json'
      }
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'Sync code not found or expired.'
      };
    }

    return {
      success: true,
      code: data.code,
      payload: data.payload,
      expiresAt: data.expiresAt
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error while pulling sync code';
    return {
      success: false,
      error: message
    };
  }
}

/**
 * Builds a direct shareable deep-link for instant one-tap sync on another device.
 */
export function buildSyncUrl(code: string): string {
  const origin =
    typeof window !== 'undefined' && window.location.origin.includes('localhost')
      ? window.location.origin
      : 'https://wavecraft-alpha.vercel.app';
  return `${origin}/?sync=${encodeURIComponent(code.trim().toUpperCase())}`;
}
