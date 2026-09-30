import { create } from 'zustand';
import type { Track, Playlist, LibraryState } from '../types';
import * as storage from '../services/storage';
import { usePlayerStore } from './playerStore';
import { searchTracks } from '../services/youtube';

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

export function normalizeQueryFingerprint(title?: string, artist?: string): string {
  return `${(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '')}|${(artist || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')}`;
}

interface LibraryStore extends LibraryState {
  syncingPlaylistIds: Record<string, boolean>;
  loadFromStorage: () => Promise<void>;
  toggleLike: (trackOrId: Track | string) => void;
  isLiked: (trackId: string) => boolean;
  createPlaylist: (
    name: string,
    description?: string,
    coverUrl?: string,
    extra?: Partial<Playlist>
  ) => Playlist;
  updatePlaylist: (id: string, updates: Partial<Playlist>) => void;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  addToPlaylist: (playlistId: string, track: Track) => void;
  removeFromPlaylist: (playlistId: string, trackIndexOrId: number | string) => void;
  reorderPlaylistTrack: (playlistId: string, from: number, to: number) => void;
  updatePlaylistCover: (playlistId: string, coverUrl: string) => void;
  syncLivePlaylist: (
    playlistId: string,
    onProgress?: (status: string, pct: number) => void
  ) => Promise<{ added: number; removed: number; total: number }>;
  syncAllLivePlaylists: () => Promise<void>;
  addToRecentlyPlayed: (track: Track) => void;
  clearHistory: () => void;
  recordPlay: (trackId: string, duration: number, title?: string, artist?: string) => void;
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  likedSongs: [],
  playlists: [],
  recentlyPlayed: [],
  playHistory: [],
  isLoading: true,
  syncingPlaylistIds: {},

  loadFromStorage: async () => {
    set({ isLoading: true });
    try {
      const [likedSongs, playlists, recentlyPlayed, playHistory] = await Promise.all([
        storage.getLikedSongs(),
        storage.getPlaylists(),
        storage.getRecentlyPlayed(),
        storage.getPlayHistory()
      ]);
      // Filter out any corrupted non-object entries in likedSongs
      const validLiked = (likedSongs || []).filter(
        (t: any) => t && typeof t === 'object' && t.id && t.title
      );
      const loadedPlaylists = (playlists || []) as Playlist[];
      set({
        likedSongs: validLiked,
        playlists: loadedPlaylists,
        recentlyPlayed: recentlyPlayed || [],
        playHistory: playHistory || [],
        isLoading: false
      });

      // Automatically check Live Sync Playlists in the background after startup
      if (loadedPlaylists.some((p) => p.isLiveSync && p.sourceUrl)) {
        setTimeout(() => {
          get().syncAllLivePlaylists().catch(() => {});
        }, 3000);
      }
    } catch (e) {
      console.error('Failed to load library from storage', e);
      set({ isLoading: false });
    }
  },

  toggleLike: (trackOrId) => {
    const { likedSongs } = get();
    const track: Track | null =
      typeof trackOrId === 'string'
        ? likedSongs.find((t) => t.id === trackOrId) || usePlayerStore.getState().currentTrack
        : trackOrId;

    if (!track || !track.id) return;

    const alreadyLiked = likedSongs.some((t) => t.id === track.id);
    const newLiked = alreadyLiked
      ? likedSongs.filter((t) => t.id !== track.id)
      : [track, ...likedSongs];

    set({ likedSongs: newLiked });
    storage.saveLikedSongs(newLiked);
  },

  isLiked: (trackId) => get().likedSongs.some((t) => t && t.id === trackId),

  createPlaylist: (name, description = '', coverUrl = '', extra = {}) => {
    const newPlaylist: Playlist = {
      id: generateId(),
      name,
      description,
      tracks: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      coverUrl,
      coverImage: coverUrl,
      ...extra
    };
    const newPlaylists = [...get().playlists, newPlaylist];
    set({ playlists: newPlaylists });
    storage.savePlaylists(newPlaylists as any);
    return newPlaylist;
  },

  updatePlaylist: (id, updates) => {
    const newPlaylists = get().playlists.map((p) =>
      p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
    );
    set({ playlists: newPlaylists });
    storage.savePlaylists(newPlaylists as any);
  },

  deletePlaylist: (id) => {
    const newPlaylists = get().playlists.filter((p) => p.id !== id);
    set({ playlists: newPlaylists });
    storage.savePlaylists(newPlaylists as any);
  },

  renamePlaylist: (id, name) => {
    const newPlaylists = get().playlists.map((p) =>
      p.id === id ? { ...p, name, updatedAt: Date.now() } : p
    );
    set({ playlists: newPlaylists });
    storage.savePlaylists(newPlaylists as any);
  },

  syncLivePlaylist: async (playlistId, onProgress) => {
    const target = get().playlists.find((p) => p.id === playlistId);
    if (!target || !target.sourceUrl || get().syncingPlaylistIds[playlistId]) {
      return { added: 0, removed: 0, total: target?.tracks.length || 0 };
    }

    set((s) => ({
      syncingPlaylistIds: { ...s.syncingPlaylistIds, [playlistId]: true }
    }));

    try {
      onProgress?.('Checking original source playlist for live updates...', 10);
      const res = await fetch(
        `/api/music?action=import-playlist&url=${encodeURIComponent(target.sourceUrl)}`
      );
      const data = await res.json();

      if (!res.ok || data.error || !Array.isArray(data.queries) || data.queries.length === 0) {
        set((s) => ({
          syncingPlaylistIds: { ...s.syncingPlaylistIds, [playlistId]: false }
        }));
        return { added: 0, removed: 0, total: target.tracks.length };
      }

      const remoteQueries: Array<{ title: string; artist?: string; videoId?: string }> =
        data.queries;
      const existingTracks = target.tracks || [];
      const prevFingerprints = target.remoteFingerprints || [];

      // Map existing tracks by fingerprint and by title-only fallback so already-imported songs are reused with 0 API calls
      const fingerprintToTrack = new Map<string, Track>();
      const titleOnlyToTrack = new Map<string, Track>();

      existingTracks.forEach((tr, idx) => {
        const fp = normalizeQueryFingerprint(tr.title, tr.artist);
        fingerprintToTrack.set(fp, tr);
        const titleNorm = (tr.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (titleNorm) titleOnlyToTrack.set(titleNorm, tr);
        if (prevFingerprints[idx]) {
          fingerprintToTrack.set(prevFingerprints[idx], tr);
        }
      });

      const resolvedRemoteTracks: Array<{ fp: string; track: Track | null }> = new Array(
        remoteQueries.length
      );
      const missingIndices: number[] = [];

      remoteQueries.forEach((q, idx) => {
        const fp = normalizeQueryFingerprint(q.title, q.artist);
        const titleNorm = (q.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        const existingMatch =
          fingerprintToTrack.get(fp) || (titleNorm ? titleOnlyToTrack.get(titleNorm) : undefined);

        if (existingMatch) {
          resolvedRemoteTracks[idx] = { fp, track: existingMatch };
        } else {
          resolvedRemoteTracks[idx] = { fp, track: null };
          missingIndices.push(idx);
        }
      });

      // Resolve only NEW songs added to the source playlist in parallel batches
      let newlyAddedCount = 0;
      const batchSize = 6;
      for (let i = 0; i < missingIndices.length; i += batchSize) {
        const slice = missingIndices.slice(i, i + batchSize);
        const pct = Math.min(
          95,
          20 + Math.round(((i + slice.length) / Math.max(1, missingIndices.length)) * 75)
        );
        const firstQuery = remoteQueries[slice[0]];
        onProgress?.(
          `Syncing ${missingIndices.length} new track${missingIndices.length === 1 ? '' : 's'}: ${
            firstQuery?.title || ''
          }...`,
          pct
        );

        await Promise.all(
          slice.map(async (qIdx) => {
            const q = remoteQueries[qIdx];
            const searchStr = `${q.title} ${q.artist || ''}`.trim();
            if (!searchStr) return;
            try {
              const results = await searchTracks(searchStr);
              if (results && results.length > 0) {
                resolvedRemoteTracks[qIdx].track = results[0];
                newlyAddedCount++;
                return;
              }
            } catch {}
            if (q.videoId) {
              resolvedRemoteTracks[qIdx].track = {
                id: `yt-${q.videoId}`,
                title: q.title || 'Synced Track',
                artist: q.artist || 'Unknown Artist',
                album: target.name,
                duration: 210,
                thumbnail: `https://i.ytimg.com/vi/${q.videoId}/hqdefault.jpg`,
                thumbnailLarge: `https://i.ytimg.com/vi/${q.videoId}/maxresdefault.jpg`,
                youtubeId: q.videoId
              };
              newlyAddedCount++;
            }
          })
        );
      }

      const validRemote = resolvedRemoteTracks.filter(
        (item): item is { fp: string; track: Track } => Boolean(item && item.track)
      );

      let finalTracks: Track[] = [];
      let finalFingerprints: string[] = [];
      let removedCount = 0;

      if (target.syncStrategy === 'mirror') {
        finalTracks = validRemote.map((r) => r.track);
        finalFingerprints = validRemote.map((r) => r.fp);
        removedCount = Math.max(0, existingTracks.length + newlyAddedCount - finalTracks.length);
      } else {
        // Default 'append': Keep all existing tracks and append any newly discovered remote tracks
        const existingIds = new Set(existingTracks.map((t) => t.id));
        const newAdditions = validRemote.filter((r) => !existingIds.has(r.track.id));
        finalTracks = [...existingTracks, ...newAdditions.map((r) => r.track)];
        finalFingerprints = [
          ...existingTracks.map(
            (t, idx) => prevFingerprints[idx] || normalizeQueryFingerprint(t.title, t.artist)
          ),
          ...newAdditions.map((r) => r.fp)
        ];
        newlyAddedCount = newAdditions.length;
      }

      const freshCover = data.coverUrl || target.coverUrl || finalTracks[0]?.thumbnailLarge || '';

      get().updatePlaylist(playlistId, {
        tracks: finalTracks,
        coverUrl: freshCover,
        coverImage: freshCover,
        lastSyncedAt: Date.now(),
        lastSyncDelta: newlyAddedCount,
        remoteFingerprints: finalFingerprints
      });

      onProgress?.('Live playlist synchronized!', 100);
      set((s) => ({
        syncingPlaylistIds: { ...s.syncingPlaylistIds, [playlistId]: false }
      }));

      return {
        added: newlyAddedCount,
        removed: removedCount,
        total: finalTracks.length
      };
    } catch {
      set((s) => ({
        syncingPlaylistIds: { ...s.syncingPlaylistIds, [playlistId]: false }
      }));
      return { added: 0, removed: 0, total: target.tracks.length };
    }
  },

  syncAllLivePlaylists: async () => {
    const liveList = get().playlists.filter((p) => p.isLiveSync && p.sourceUrl);
    for (const pl of liveList) {
      await get().syncLivePlaylist(pl.id);
    }
  },

  addToPlaylist: (playlistId, track) => {
    const newPlaylists = get().playlists.map((p) => {
      if (p.id === playlistId) {
        return {
          ...p,
          tracks: [...p.tracks, track],
          updatedAt: Date.now(),
          coverUrl: p.coverUrl || track.thumbnail
        };
      }
      return p;
    });
    set({ playlists: newPlaylists });
    storage.savePlaylists(newPlaylists as any);
  },

  removeFromPlaylist: (playlistId, trackIndexOrId) => {
    const newPlaylists = get().playlists.map((p) => {
      if (p.id === playlistId) {
        const newTracks = [...p.tracks];
        if (typeof trackIndexOrId === 'number') {
          newTracks.splice(trackIndexOrId, 1);
        } else {
          const idx = newTracks.findIndex((t) => t.id === trackIndexOrId);
          if (idx !== -1) newTracks.splice(idx, 1);
        }
        return {
          ...p,
          tracks: newTracks,
          updatedAt: Date.now()
        };
      }
      return p;
    });
    set({ playlists: newPlaylists });
    storage.savePlaylists(newPlaylists as any);
  },

  reorderPlaylistTrack: (playlistId, from, to) => {
    const newPlaylists = get().playlists.map((p) => {
      if (p.id === playlistId) {
        const newTracks = [...p.tracks];
        const [moved] = newTracks.splice(from, 1);
        newTracks.splice(to, 0, moved);
        return {
          ...p,
          tracks: newTracks,
          updatedAt: Date.now()
        };
      }
      return p;
    });
    set({ playlists: newPlaylists });
    storage.savePlaylists(newPlaylists as any);
  },

  updatePlaylistCover: (playlistId, coverUrl) => {
    const newPlaylists = get().playlists.map((p) =>
      p.id === playlistId ? { ...p, coverUrl, coverImage: coverUrl, updatedAt: Date.now() } : p
    );
    set({ playlists: newPlaylists });
    storage.savePlaylists(newPlaylists as any);
  },

  addToRecentlyPlayed: (track) => {
    const { recentlyPlayed } = get();
    const filtered = recentlyPlayed.filter((item) => item.track?.id !== track.id);
    const newRecent = [{ track, playedAt: Date.now() }, ...filtered].slice(0, 100);
    set({ recentlyPlayed: newRecent });
    storage.saveRecentlyPlayed(newRecent);
  },

  clearHistory: () => {
    set({ recentlyPlayed: [], playHistory: [] });
    storage.saveRecentlyPlayed([]);
    storage.savePlayHistory([]);
  },

  recordPlay: (trackId, duration, title, artist) => {
    const { playHistory } = get();
    const newHistory = [
      ...playHistory,
      { trackId, title, artist, playedAt: Date.now(), duration }
    ];
    set({ playHistory: newHistory });
    storage.savePlayHistory(newHistory);
  }
}));
