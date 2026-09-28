import type { Track, SearchResult, ArtistResult, AlbumResult, LyricLine } from '../types';
import { get, set, del, keys } from 'idb-keyval';

// Extend local interfaces assuming these would normally come from types but are required here
export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
}

export interface SettingsState {
  theme?: string;
  quality?: string;
  [key: string]: any;
}

const KEYS = {
  LIKED_SONGS: 'wavecraft_liked_songs',
  PLAYLISTS: 'wavecraft_playlists',
  RECENTLY_PLAYED: 'wavecraft_recently_played',
  PLAY_HISTORY: 'wavecraft_play_history',
  SETTINGS: 'wavecraft_settings',
  SEARCH_HISTORY: 'wavecraft_search_history',
};

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
  try {
    await set(KEYS.LIKED_SONGS, tracks);
  } catch (error) {
    console.error('Error saving liked songs:', error);
  }
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
  try {
    await set(KEYS.PLAYLISTS, playlists);
  } catch (error) {
    console.error('Error saving playlists:', error);
  }
}

export async function loadRecentlyPlayed(): Promise<{track: Track, playedAt: number}[]> {
  try {
    const data = await get(KEYS.RECENTLY_PLAYED);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error loading recently played:', error);
    return [];
  }
}

export async function saveRecentlyPlayed(items: {track: Track, playedAt: number}[]): Promise<void> {
  try {
    await set(KEYS.RECENTLY_PLAYED, items);
  } catch (error) {
    console.error('Error saving recently played:', error);
  }
}

export async function addToPlayHistory(trackId: string, duration: number): Promise<void> {
  try {
    const history = await loadPlayHistory();
    history.push({
      trackId,
      duration,
      playedAt: Date.now()
    });
    
    // Keep max 10000 entries
    if (history.length > 10000) {
      history.splice(0, history.length - 10000);
    }
    
    await set(KEYS.PLAY_HISTORY, history);
  } catch (error) {
    console.error('Error adding to play history:', error);
  }
}

export async function loadPlayHistory(): Promise<{trackId: string, playedAt: number, duration: number}[]> {
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
  try {
    await set(KEYS.SETTINGS, settings);
  } catch (error) {
    console.error('Error saving settings:', error);
  }
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
  try {
    // Keep max 50 entries
    const limitedHistory = history.slice(0, 50);
    await set(KEYS.SEARCH_HISTORY, limitedHistory);
  } catch (error) {
    console.error('Error saving search history:', error);
  }
}

export async function getStorageUsage(): Promise<{used: number, available: number}> {
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
    const allKeys = await keys();
    const wavecraftKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('wavecraft_'));
    await Promise.all(wavecraftKeys.map(k => del(k as IDBValidKey)));
  } catch (error) {
    console.error('Error clearing data:', error);
  }
}

// Aliases for compatibility with stores that use get* naming
export const getLikedSongs = loadLikedSongs;
export const getPlaylists = loadPlaylists;
export const getRecentlyPlayed = loadRecentlyPlayed;
export const getPlayHistory = loadPlayHistory;

export async function savePlayHistory(history: {trackId: string, playedAt: number, duration: number}[]): Promise<void> {
  try {
    const limited = history.slice(-10000);
    await set(KEYS.PLAY_HISTORY, limited);
  } catch (error) {
    console.error('Error saving play history:', error);
  }
}

