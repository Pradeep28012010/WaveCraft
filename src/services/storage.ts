import type { Track, Playlist, PlaylistFolder, SettingsState } from '../types';
import { get, set, del, keys } from 'idb-keyval';

export type { Playlist, PlaylistFolder, SettingsState };

export const KEYS = {
  LIKED_SONGS: 'wavecraft_liked_songs',
  PLAYLISTS: 'wavecraft_playlists',
  FOLDERS: 'wavecraft_playlist_folders',
  RECENTLY_PLAYED: 'wavecraft_recently_played',
  PLAY_HISTORY: 'wavecraft_play_history',
  SETTINGS: 'wavecraft_settings',
  SEARCH_HISTORY: 'wavecraft_search_history',
  GALAXY_PREFS: 'wavecraft_galaxy_prefs',
  GALAXY_STAR_CACHE: 'wavecraft_galaxy_star_cache',
  STORAGE_PERSISTENCE: 'wavecraft_storage_persistence'
} as const;

// CacheStorage Permanent Vault Backup
const VAULT_CACHE_NAME = 'wavecraft-permanent-vault-v1';
const VAULT_SNAPSHOT_URL = 'https://wavecraft.local/_vault_backup/snapshot.json';

export interface GalaxyPreferences {
  layout?: 'quadrants' | 'rings' | 'spiral';
  audioReactivityMode?: 'dynamic' | 'ambient' | 'off';
  showCoordinateGrid?: boolean;
  showConstellationFilaments?: boolean;
  autoOrbit?: boolean;
  zoom?: number;
}

export interface LibraryBackupPayload {
  wavecraftVersion?: string;
  exportedAt?: string;
  type?: string;
  likedSongs?: Track[];
  playlists?: Playlist[];
  folders?: PlaylistFolder[];
  settings?: SettingsState;
  playHistory?: { trackId: string; playedAt: number; duration: number }[];
  galaxyPrefs?: GalaxyPreferences;
}

/**
 * Requests the browser to register the origin as "persistent" storage mode.
 * In persistent mode, the browser guarantees the origin's IndexedDB, Cache,
 * and localStorage are not evicted during cache cleanup or disk space pressure.
 */
export async function ensureStoragePersistence(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage) return false;
  try {
    if (typeof navigator.storage.persisted === 'function') {
      const isAlreadyPersisted = await navigator.storage.persisted();
      if (isAlreadyPersisted) {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(KEYS.STORAGE_PERSISTENCE, 'true');
        }
        return true;
      }
    }
    if (typeof navigator.storage.persist === 'function') {
      const granted = await navigator.storage.persist();
      if (granted && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(KEYS.STORAGE_PERSISTENCE, 'true');
      }
      return granted;
    }
  } catch (err) {
    console.warn('[WaveCraft Storage] Could not request persistent storage:', err);
  }
  return false;
}

export async function isStoragePersisted(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persisted === 'function') {
    try {
      return await navigator.storage.persisted();
    } catch {}
  }
  return false;
}

// Request persistent storage as early as module evaluation
if (typeof window !== 'undefined') {
  ensureStoragePersistence().catch(() => {});
}

let snapshotSaveTimer: ReturnType<typeof setTimeout> | null = null;

async function saveVaultSnapshotToCache(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const [liked, playlists, folders, recent, history, settings, galaxy] = await Promise.all([
      get(KEYS.LIKED_SONGS).catch(() => null),
      get(KEYS.PLAYLISTS).catch(() => null),
      get(KEYS.FOLDERS).catch(() => null),
      get(KEYS.RECENTLY_PLAYED).catch(() => null),
      get(KEYS.PLAY_HISTORY).catch(() => null),
      get(KEYS.SETTINGS).catch(() => null),
      get(KEYS.GALAXY_PREFS).catch(() => null)
    ]);

    const snapshot: LibraryBackupPayload = {
      wavecraftVersion: '2.0',
      exportedAt: new Date().toISOString(),
      type: 'vault-cache-snapshot',
      likedSongs: Array.isArray(liked) ? liked : undefined,
      playlists: Array.isArray(playlists) ? playlists : undefined,
      folders: Array.isArray(folders) ? folders : undefined,
      recentlyPlayed: Array.isArray(recent) ? recent : undefined,
      playHistory: Array.isArray(history) ? history.slice(-500) : undefined,
      settings: settings || undefined,
      galaxyPrefs: galaxy || undefined
    };

    const cache = await caches.open(VAULT_CACHE_NAME);
    const response = new Response(JSON.stringify(snapshot), {
      headers: {
        'Content-Type': 'application/json',
        'X-WaveCraft-Backup': 'true',
        'X-Backup-Date': new Date().toISOString()
      }
    });
    await cache.put(new Request(VAULT_SNAPSHOT_URL), response);
  } catch {
    // Non-fatal if CacheStorage is unavailable or restricted
  }
}

function scheduleVaultSnapshot(): void {
  if (snapshotSaveTimer) clearTimeout(snapshotSaveTimer);
  snapshotSaveTimer = setTimeout(() => {
    snapshotSaveTimer = null;
    saveVaultSnapshotToCache().catch(() => {});
  }, 500);
}

export async function readVaultSnapshotFromCache(): Promise<LibraryBackupPayload | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  try {
    const cache = await caches.open(VAULT_CACHE_NAME);
    const response = await cache.match(new Request(VAULT_SNAPSHOT_URL));
    if (response) {
      return (await response.json()) as LibraryBackupPayload;
    }
  } catch {}
  return null;
}

// Coalesce rapid IndexedDB writes per key so batch operations (like playlist imports or queue drags)
// never block the main UI thread with redundant structured-clone transactions.
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingValues = new Map<string, unknown>();

function scheduleIdbWrite<T>(key: string, value: T, delayMs = 60): Promise<void> {
  pendingValues.set(key, value);

  // 1. Immediately mirror to localStorage (non-cache disk storage that survives cache clears)
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      let storageVal = value;
      // Cap play history in localStorage to 500 items to avoid 5MB quota exhaustion
      if (key === KEYS.PLAY_HISTORY && Array.isArray(value)) {
        storageVal = (value as unknown[]).slice(-500) as T;
      }
      window.localStorage.setItem(key, JSON.stringify(storageVal));
    }
  } catch (err) {
    console.warn(`[Storage] localStorage mirror failed for ${key}:`, err);
  }

  // 2. Schedule debounced CacheStorage vault snapshot (Tier 3 survival)
  scheduleVaultSnapshot();

  // 3. Coalesce IndexedDB write (Tier 1 high-capacity storage)
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
        console.error(`Error persisting ${key} to IndexedDB:`, error);
      }
      resolve();
    }, delayMs);
    pendingTimers.set(key, timer);
  });
}

function flushPendingSynchronously(): void {
  pendingTimers.forEach((timer) => clearTimeout(timer));
  pendingTimers.clear();
  pendingValues.forEach((val, k) => {
    try {
      set(k, val);
    } catch {}
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        let storageVal = val;
        if (k === KEYS.PLAY_HISTORY && Array.isArray(val)) {
          storageVal = val.slice(-500);
        }
        window.localStorage.setItem(k, JSON.stringify(storageVal));
      }
    } catch {}
  });
  pendingValues.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPendingSynchronously);
  window.addEventListener('pagehide', flushPendingSynchronously);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingSynchronously();
    }
  });
}

/**
 * Loads liked songs with 3-tier fallback and automatic self-healing.
 * If browser cache cleared IndexedDB, data is restored from localStorage or CacheStorage.
 */
export async function loadLikedSongs(): Promise<Track[]> {
  let idbData: Track[] | null = null;
  try {
    const data = await get(KEYS.LIKED_SONGS);
    if (Array.isArray(data) && data.length > 0) idbData = data;
  } catch (error) {
    console.warn('[Storage] Error loading liked songs from IDB:', error);
  }

  let localData: Track[] | null = null;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const fallback = window.localStorage.getItem(KEYS.LIKED_SONGS);
      if (fallback) {
        const parsed = JSON.parse(fallback);
        if (Array.isArray(parsed) && parsed.length > 0) localData = parsed;
      }
    }
  } catch {}

  let cacheData: Track[] | null = null;
  if (!idbData && !localData) {
    const snapshot = await readVaultSnapshotFromCache();
    if (snapshot && Array.isArray(snapshot.likedSongs) && snapshot.likedSongs.length > 0) {
      cacheData = snapshot.likedSongs;
    }
  }

  // Prioritize populated IndexedDB data as authoritative instead of picking the longest array,
  // preventing zombie resurrection of unliked songs.
  let best: Track[] = [];
  if (idbData && idbData.length > 0) {
    best = idbData;
  } else if (localData && localData.length > 0) {
    best = localData;
  } else if (cacheData && cacheData.length > 0) {
    best = cacheData;
  }

  // SELF-HEAL: If IndexedDB was empty (e.g. wiped by browser cleanup), restore from secondary tier
  if (best.length > 0) {
    if (!idbData) {
      set(KEYS.LIKED_SONGS, best).catch(() => {});
    }
    if (!localData || localData.length !== best.length) {
      try {
        window.localStorage?.setItem(KEYS.LIKED_SONGS, JSON.stringify(best));
      } catch {}
    }
  }

  return best;
}

export async function saveLikedSongs(tracks: Track[]): Promise<void> {
  return scheduleIdbWrite(KEYS.LIKED_SONGS, tracks);
}

/**
 * Loads playlists with 3-tier fallback and automatic self-healing.
 */
export async function loadPlaylists(): Promise<Playlist[]> {
  let idbData: Playlist[] | null = null;
  try {
    const data = await get(KEYS.PLAYLISTS);
    if (Array.isArray(data) && data.length > 0) idbData = data;
  } catch (error) {
    console.warn('[Storage] Error loading playlists from IDB:', error);
  }

  let localData: Playlist[] | null = null;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const fallback = window.localStorage.getItem(KEYS.PLAYLISTS);
      if (fallback) {
        const parsed = JSON.parse(fallback);
        if (Array.isArray(parsed) && parsed.length > 0) localData = parsed;
      }
    }
  } catch {}

  let cacheData: Playlist[] | null = null;
  if (!idbData && !localData) {
    const snapshot = await readVaultSnapshotFromCache();
    if (snapshot && Array.isArray(snapshot.playlists) && snapshot.playlists.length > 0) {
      cacheData = snapshot.playlists;
    }
  }

  // Prioritize populated IndexedDB data as authoritative instead of picking the longest array,
  // preventing zombie resurrection of deleted playlists.
  let best: Playlist[] = [];
  if (idbData && idbData.length > 0) {
    best = idbData;
  } else if (localData && localData.length > 0) {
    best = localData;
  } else if (cacheData && cacheData.length > 0) {
    best = cacheData;
  }

  // SELF-HEAL: If IndexedDB was empty (e.g. wiped by browser cleanup), restore from secondary tier
  if (best.length > 0) {
    if (!idbData) {
      set(KEYS.PLAYLISTS, best).catch(() => {});
    }
    if (!localData || localData.length !== best.length) {
      try {
        window.localStorage?.setItem(KEYS.PLAYLISTS, JSON.stringify(best));
      } catch {}
    }
  }

  return best;
}

export async function savePlaylists(playlists: Playlist[]): Promise<void> {
  return scheduleIdbWrite(KEYS.PLAYLISTS, playlists);
}

/**
 * Loads playlist folders with 3-tier fallback and automatic self-healing.
 */
export async function loadFolders(): Promise<PlaylistFolder[]> {
  let idbData: PlaylistFolder[] | null = null;
  try {
    const data = await get(KEYS.FOLDERS);
    if (Array.isArray(data) && data.length > 0) idbData = data;
  } catch {}

  let localData: PlaylistFolder[] | null = null;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const fallback = window.localStorage.getItem(KEYS.FOLDERS);
      if (fallback) {
        const parsed = JSON.parse(fallback);
        if (Array.isArray(parsed) && parsed.length > 0) localData = parsed;
      }
    }
  } catch {}

  let cacheData: PlaylistFolder[] | null = null;
  if (!idbData && !localData) {
    const snapshot = await readVaultSnapshotFromCache();
    if (snapshot && Array.isArray(snapshot.folders) && snapshot.folders.length > 0) {
      cacheData = snapshot.folders;
    }
  }

  // Prioritize populated IndexedDB data as authoritative instead of picking the longest array,
  // preventing zombie resurrection of deleted folders.
  let best: PlaylistFolder[] = [];
  if (idbData && idbData.length > 0) {
    best = idbData;
  } else if (localData && localData.length > 0) {
    best = localData;
  } else if (cacheData && cacheData.length > 0) {
    best = cacheData;
  }

  // SELF-HEAL: If IndexedDB was empty (e.g. wiped by browser cleanup), restore from secondary tier
  if (best.length > 0) {
    if (!idbData) {
      set(KEYS.FOLDERS, best).catch(() => {});
    }
    if (!localData || localData.length !== best.length) {
      try {
        window.localStorage?.setItem(KEYS.FOLDERS, JSON.stringify(best));
      } catch {}
    }
  }

  return best;
}

export async function saveFolders(folders: PlaylistFolder[]): Promise<void> {
  return scheduleIdbWrite(KEYS.FOLDERS, folders);
}

/**
 * Loads recently played tracks with 3-tier fallback and automatic self-healing.
 */
export async function loadRecentlyPlayed(): Promise<{ track: Track; playedAt: number }[]> {
  let idbData: { track: Track; playedAt: number }[] | null = null;
  try {
    const data = await get(KEYS.RECENTLY_PLAYED);
    if (Array.isArray(data) && data.length > 0) idbData = data;
  } catch {}

  let localData: { track: Track; playedAt: number }[] | null = null;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const fallback = window.localStorage.getItem(KEYS.RECENTLY_PLAYED);
      if (fallback) {
        const parsed = JSON.parse(fallback);
        if (Array.isArray(parsed) && parsed.length > 0) localData = parsed;
      }
    }
  } catch {}

  let cacheData: { track: Track; playedAt: number }[] | null = null;
  if (!idbData && !localData) {
    const snapshot = await readVaultSnapshotFromCache();
    if (snapshot && Array.isArray(snapshot.recentlyPlayed) && snapshot.recentlyPlayed.length > 0) {
      cacheData = snapshot.recentlyPlayed as { track: Track; playedAt: number }[];
    }
  }

  // Prioritize populated IndexedDB data as authoritative instead of picking the longest array,
  // preventing zombie resurrection of cleared recent tracks.
  let best: { track: Track; playedAt: number }[] = [];
  if (idbData && idbData.length > 0) {
    best = idbData;
  } else if (localData && localData.length > 0) {
    best = localData;
  } else if (cacheData && cacheData.length > 0) {
    best = cacheData;
  }

  // SELF-HEAL: If IndexedDB was empty (e.g. wiped by browser cleanup), restore from secondary tier
  if (best.length > 0) {
    if (!idbData) {
      set(KEYS.RECENTLY_PLAYED, best).catch(() => {});
    }
    if (!localData || localData.length !== best.length) {
      try {
        window.localStorage?.setItem(KEYS.RECENTLY_PLAYED, JSON.stringify(best));
      } catch {}
    }
  }

  return best;
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

/**
 * Loads listening play history with 3-tier fallback and automatic self-healing.
 */
export async function loadPlayHistory(): Promise<
  { trackId: string; playedAt: number; duration: number }[]
> {
  let idbData: { trackId: string; playedAt: number; duration: number }[] | null = null;
  try {
    const data = await get(KEYS.PLAY_HISTORY);
    if (Array.isArray(data) && data.length > 0) idbData = data;
  } catch {}

  let localData: { trackId: string; playedAt: number; duration: number }[] | null = null;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const fallback = window.localStorage.getItem(KEYS.PLAY_HISTORY);
      if (fallback) {
        const parsed = JSON.parse(fallback);
        if (Array.isArray(parsed) && parsed.length > 0) localData = parsed;
      }
    }
  } catch {}

  let cacheData: { trackId: string; playedAt: number; duration: number }[] | null = null;
  if (!idbData && !localData) {
    const snapshot = await readVaultSnapshotFromCache();
    if (snapshot && Array.isArray(snapshot.playHistory) && snapshot.playHistory.length > 0) {
      cacheData = snapshot.playHistory as { trackId: string; playedAt: number; duration: number }[];
    }
  }

  const candidates = [idbData, localData, cacheData].filter(
    (d): d is { trackId: string; playedAt: number; duration: number }[] =>
      Array.isArray(d) && d.length > 0
  );
  candidates.sort((a, b) => b.length - a.length);
  const best = candidates[0] || [];

  if (best.length > 0) {
    if (!idbData || idbData.length < best.length) {
      set(KEYS.PLAY_HISTORY, best).catch(() => {});
    }
    if (!localData || localData.length < best.length) {
      try {
        window.localStorage?.setItem(KEYS.PLAY_HISTORY, JSON.stringify(best.slice(-500)));
      } catch {}
    }
  }

  return best;
}

export async function savePlayHistory(
  history: { trackId: string; playedAt: number; duration: number }[]
): Promise<void> {
  const limited = history.slice(-10000);
  return scheduleIdbWrite(KEYS.PLAY_HISTORY, limited, 120);
}

export async function loadSettings(): Promise<SettingsState | null> {
  try {
    const data = await get(KEYS.SETTINGS);
    if (data && typeof data === 'object') return data as SettingsState;
  } catch {}

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const fallback = window.localStorage.getItem(KEYS.SETTINGS);
      if (fallback) {
        return JSON.parse(fallback) as SettingsState;
      }
    }
  } catch {}

  return null;
}

export async function saveSettings(settings: SettingsState): Promise<void> {
  return scheduleIdbWrite(KEYS.SETTINGS, settings, 40);
}

export async function loadSearchHistory(): Promise<string[]> {
  try {
    const data = await get(KEYS.SEARCH_HISTORY);
    if (Array.isArray(data) && data.length > 0) return data;
  } catch {}

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const fallback = window.localStorage.getItem(KEYS.SEARCH_HISTORY);
      if (fallback) {
        const parsed = JSON.parse(fallback);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }
  } catch {}

  return [];
}

export async function saveSearchHistory(history: string[]): Promise<void> {
  const limitedHistory = history.slice(0, 50);
  return scheduleIdbWrite(KEYS.SEARCH_HISTORY, limitedHistory, 60);
}

/**
 * Sonic Galaxy layout & viewing preferences persistence.
 * Guarantees galaxy formation (quadrants/rings/spiral) and display options survive restarts.
 */
export async function loadGalaxyPrefs(): Promise<GalaxyPreferences> {
  const defaults: GalaxyPreferences = {
    layout: 'quadrants',
    audioReactivityMode: 'dynamic',
    showCoordinateGrid: false,
    showConstellationFilaments: true,
    autoOrbit: true,
    zoom: 1.05
  };

  try {
    const data = await get(KEYS.GALAXY_PREFS);
    if (data && typeof data === 'object') {
      return { ...defaults, ...(data as GalaxyPreferences) };
    }
  } catch {}

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(KEYS.GALAXY_PREFS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return { ...defaults, ...parsed };
        }
      }
    }
  } catch {}

  return defaults;
}

export function saveGalaxyPrefs(prefs: Partial<GalaxyPreferences>): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const current = window.localStorage.getItem(KEYS.GALAXY_PREFS);
      const merged = { ...(current ? JSON.parse(current) : {}), ...prefs };
      window.localStorage.setItem(KEYS.GALAXY_PREFS, JSON.stringify(merged));
    }
  } catch {}

  return scheduleIdbWrite(KEYS.GALAXY_PREFS, prefs, 100);
}

/**
 * Restores a complete library backup JSON into all storage tiers with self-healing validation.
 */
export async function restoreFullLibraryBackup(backup: LibraryBackupPayload): Promise<{
  likedRestored: number;
  playlistsRestored: number;
  foldersRestored: number;
}> {
  let likedRestored = 0;
  let playlistsRestored = 0;
  let foldersRestored = 0;

  if (Array.isArray(backup.likedSongs) && backup.likedSongs.length > 0) {
    const existing = await loadLikedSongs();
    const existingIds = new Set(existing.map((t) => t.id));
    const merged = [...existing];
    for (const t of backup.likedSongs) {
      if (t && t.id && !existingIds.has(t.id)) {
        existingIds.add(t.id);
        merged.push(t);
        likedRestored++;
      }
    }
    await saveLikedSongs(merged);
  }

  if (Array.isArray(backup.playlists) && backup.playlists.length > 0) {
    const existing = await loadPlaylists();
    const existingIds = new Set(existing.map((p) => p.id));
    const merged = [...existing];
    for (const p of backup.playlists) {
      if (p && p.name) {
        const pId = p.id || `pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        if (!existingIds.has(pId)) {
          existingIds.add(pId);
          merged.push({ ...p, id: pId });
          playlistsRestored++;
        }
      }
    }
    await savePlaylists(merged);
  }

  if (Array.isArray(backup.folders) && backup.folders.length > 0) {
    const existing = await loadFolders();
    const existingIds = new Set(existing.map((f) => f.id));
    const merged = [...existing];
    for (const f of backup.folders) {
      if (f && f.id && !existingIds.has(f.id)) {
        existingIds.add(f.id);
        merged.push(f);
        foldersRestored++;
      }
    }
    await saveFolders(merged);
  }

  // Force an immediate vault snapshot update across CacheStorage
  await saveVaultSnapshotToCache().catch(() => {});

  return { likedRestored, playlistsRestored, foldersRestored };
}

export async function getStorageUsage(): Promise<{ used: number; available: number }> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
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

    if (typeof window !== 'undefined' && 'caches' in window) {
      await caches.delete(VAULT_CACHE_NAME).catch(() => {});
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
