import { create } from 'zustand';
import type { Track, Playlist, LibraryState } from '../types';
import * as storage from '../services/storage';
import { usePlayerStore } from './playerStore';

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

interface LibraryStore extends LibraryState {
  loadFromStorage: () => Promise<void>;
  toggleLike: (trackOrId: Track | string) => void;
  isLiked: (trackId: string) => boolean;
  createPlaylist: (name: string, description?: string, coverUrl?: string) => Playlist;
  updatePlaylist: (id: string, updates: Partial<Playlist>) => void;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  addToPlaylist: (playlistId: string, track: Track) => void;
  removeFromPlaylist: (playlistId: string, trackIndexOrId: number | string) => void;
  reorderPlaylistTrack: (playlistId: string, from: number, to: number) => void;
  updatePlaylistCover: (playlistId: string, coverUrl: string) => void;
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
      const validLiked = (likedSongs || []).filter((t: any) => t && typeof t === 'object' && t.id && t.title);
      set({
        likedSongs: validLiked,
        playlists: (playlists || []) as Playlist[],
        recentlyPlayed: recentlyPlayed || [],
        playHistory: playHistory || [],
        isLoading: false
      });
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

  createPlaylist: (name, description = '', coverUrl = '') => {
    const newPlaylist: Playlist = {
      id: generateId(),
      name,
      description,
      tracks: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      coverUrl,
      coverImage: coverUrl
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
