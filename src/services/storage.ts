import type { Track, Playlist, PlaylistFolder } from '../types';
import { get, set, del, keys } from 'idb-keyval';

export type { Playlist, PlaylistFolder };

export interface SettingsState {
  theme?: string;
  quality?: string;
  [key: string]: any;
}

const KEYS = {
  LIKED_SONGS: 'wavecraft_liked_songs',
  PLAYLISTS: 'wavecraft_playlists',
  FOLDERS: 'wavecraft_playlist_folders',
  RECENTLY_PLAYED: 'wavecraft_recently_played',
  PLAY_HISTORY: 'wavecraft_play_history',
  SETTINGS: 'wavecraft_settings',
  SEARCH_HISTORY: 'wavecraft_search_history'
};

// Coalesce rapid IndexedDB writes per key so batch operations (like playlist imports or queue drags)
// never block the main UI thread with redundant structured-clone transactions.
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingValues = new Map<string, any>();

function scheduleIdbWrite(key: string, value: any, delayMs = 60): Promise<void> {
  pendingValues.set(key, value);
  const existing = pendingTimers.get(key);
  if (existing) clearTimeout(existing);

  return new Promise((resolve) => {
    const timer = setTimeout(async () => {
      pendingTimers.delete(key);
      const latest = pendingValues.get(key);
      pendingValues.delete(key);
      try {
        await set(key, latest);
      } catch (error) {
        console.error(`Error persisting ${key}:`, error);
      }
      resolve();
    }, delayMs);
    pendingTimers.set(key, timer);
  });
}

export async function loadLikedSongs(): Promise<Track[]> {
  try {
    const data = await get(KEYS.LIKED_SONGS);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error loading liked songs:', error);
    return [];
  }
}

export async function saveLikedSongs(tracks: Track[]): Promise<void> {
  return scheduleIdbWrite(KEYS.LIKED_SONGS, tracks);
}

export async function loadPlaylists(): Promise<Playlist[]> {
  try {
    const data = await get(KEYS.PLAYLISTS);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error loading playlists:', error);
    return [];
  }
}

export async function savePlaylists(playlists: Playlist[]): Promise<void> {
  return scheduleIdbWrite(KEYS.PLAYLISTS, playlists);
}

export async function loadFolders(): Promise<PlaylistFolder[]> {
  try {
    const data = await get(KEYS.FOLDERS);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error loading folders:', error);
    return [];
  }
}

export async function saveFolders(folders: PlaylistFolder[]): Promise<void> {
  return scheduleIdbWrite(KEYS.FOLDERS, folders);
}

export async function loadRecentlyPlayed(): Promise<{ track: Track; playedAt: number }[]> {
  try {
    const data = await get(KEYS.RECENTLY_PLAYED);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error loading recently played:', error);
    return [];
  }
}

export async function saveRecentlyPlayed(
  items: { track: Track; playedAt: number }[]
): Promise<void> {
  return scheduleIdbWrite(KEYS.RECENTLY_PLAYED, items);
}

export async function addToPlayHistory(trackId: string, duration: number): Promise<void> {
  try {
    const history = await loadPlayHistory();
    history.push({
      trackId,
      duration,
      playedAt: Date.now()
    });

    if (history.length > 10000) {
      history.splice(0, history.length - 10000);
    }

    await scheduleIdbWrite(KEYS.PLAY_HISTORY, history, 120);
  } catch (error) {
    console.error('Error adding to play history:', error);
  }
}

export async function loadPlayHistory(): Promise<
  { trackId: string; playedAt: number; duration: number }[]
> {
  try {
    const data = await get(KEYS.PLAY_HISTORY);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error loading play history:', error);
    return [];
  }
}

export async function loadSettings(): Promise<SettingsState | null> {
  try {
    const data = await get(KEYS.SETTINGS);
    return data || null;
  } catch (error) {
    console.error('Error loading settings:', error);
    return null;
  }
}

export async function saveSettings(settings: SettingsState): Promise<void> {
  return scheduleIdbWrite(KEYS.SETTINGS, settings, 40);
}

export async function loadSearchHistory(): Promise<string[]> {
  try {
    const data = await get(KEYS.SEARCH_HISTORY);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error loading search history:', error);
    return [];
  }
}

export async function saveSearchHistory(history: string[]): Promise<void> {
  const limitedHistory = history.slice(0, 50);
  return scheduleIdbWrite(KEYS.SEARCH_HISTORY, limitedHistory, 60);
}

export async function getStorageUsage(): Promise<{ used: number; available: number }> {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        available: estimate.quota || 0
      };
    }
  } catch (error) {
    console.error('Error getting storage usage:', error);
  }
  return { used: 0, available: 0 };
}

export async function clearAllData(): Promise<void> {
  try {
    pendingTimers.forEach((timer) => clearTimeout(timer));
    pendingTimers.clear();
    pendingValues.clear();
    const allKeys = await keys();
    const wavecraftKeys = allKeys.filter(
      (k) => typeof k === 'string' && k.startsWith('wavecraft_')
    );
    await Promise.all(wavecraftKeys.map((k) => del(k as IDBValidKey)));

    if (typeof window !== 'undefined' && window.localStorage) {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('wavecraft_')) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    }
  } catch (error) {
    console.error('Error clearing data:', error);
  }
}

export const getLikedSongs = loadLikedSongs;
export const getPlaylists = loadPlaylists;
export const getFolders = loadFolders;
export const getRecentlyPlayed = loadRecentlyPlayed;
export const getPlayHistory = loadPlayHistory;

export async function savePlayHistory(
  history: { trackId: string; playedAt: number; duration: number }[]
): Promise<void> {
  const limited = history.slice(-10000);
  return scheduleIdbWrite(KEYS.PLAY_HISTORY, limited, 120);
}
