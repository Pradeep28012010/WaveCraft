/**
 * WaveCraft Smart Dynamic Playlists Engine
 * Intelligently generates dynamic, auto-curated playlists from the user's
 * real listening behavior, play history, and liked songs.
 */

import type { Track, Playlist } from '../types';

export interface SmartPlaylistDef extends Playlist {
  isSmartPlaylist: true;
  badge: string;
  gradient: string;
  icon: string;
  tagline: string;
}

export function computeSmartPlaylists(
  likedSongs: Track[],
  recentlyPlayed: { track: Track; playedAt: number }[],
  playHistory: { trackId: string; title?: string; artist?: string; playedAt: number; duration: number }[],
  userPlaylists: Playlist[]
): SmartPlaylistDef[] {
  // Build a track lookup dictionary from all available user libraries
  const trackMap = new Map<string, Track>();
  likedSongs.forEach((t) => t?.id && trackMap.set(t.id, t));
  recentlyPlayed.forEach((r) => r.track?.id && trackMap.set(r.track.id, r.track));
  userPlaylists.forEach((p) => p.tracks?.forEach((t) => t?.id && trackMap.set(t.id, t)));

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

  // 1. All-time play counts
  const playCounts = new Map<string, number>();
  const recentPlayCounts = new Map<string, number>();
  const lastPlayedMap = new Map<string, number>();
  const lateNightIds = new Set<string>();

  playHistory.forEach((item) => {
    if (!item.trackId) return;
    playCounts.set(item.trackId, (playCounts.get(item.trackId) || 0) + 1);
    
    if (item.playedAt >= sevenDaysAgo) {
      recentPlayCounts.set(item.trackId, (recentPlayCounts.get(item.trackId) || 0) + 1);
    }

    const prevLast = lastPlayedMap.get(item.trackId) || 0;
    if (item.playedAt > prevLast) {
      lastPlayedMap.set(item.trackId, item.playedAt);
    }

    // Check if played during late night (10 PM to 5 AM local time)
    const hour = new Date(item.playedAt).getHours();
    if (hour >= 22 || hour < 5) {
      lateNightIds.add(item.trackId);
    }
  });

  // Also factor recently played for users with fresh history
  recentlyPlayed.forEach((r) => {
    if (!r.track?.id) return;
    playCounts.set(r.track.id, (playCounts.get(r.track.id) || 0) + 1);
    if (r.playedAt >= sevenDaysAgo) {
      recentPlayCounts.set(r.track.id, (recentPlayCounts.get(r.track.id) || 0) + 1);
    }
    const prev = lastPlayedMap.get(r.track.id) || 0;
    if (r.playedAt > prev) lastPlayedMap.set(r.track.id, r.playedAt);
  });

  const smartPlaylists: SmartPlaylistDef[] = [];

  // ================= 1. ON REPEAT • TOP 25 =================
  const sortedByPlays = Array.from(playCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => trackMap.get(id))
    .filter((t): t is Track => Boolean(t))
    .slice(0, 25);

  const onRepeatTracks = sortedByPlays.length > 0 ? sortedByPlays : likedSongs.slice(0, 25);

  if (onRepeatTracks.length > 0) {
    smartPlaylists.push({
      id: 'smart-on-repeat',
      name: 'On Repeat • Top 25',
      description: 'Your absolute most-played tracks, auto-curated from your listening stream.',
      tracks: onRepeatTracks,
      createdAt: now,
      updatedAt: now,
      isSmartPlaylist: true,
      badge: 'TOP PLAYED',
      gradient: 'from-rose-500 via-pink-600 to-amber-500',
      icon: '🔥',
      tagline: 'Most played on loop'
    });
  }

  // ================= 2. HEAVY ROTATION (LAST 7 DAYS) =================
  const sortedRecent = Array.from(recentPlayCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => trackMap.get(id))
    .filter((t): t is Track => Boolean(t))
    .slice(0, 20);

  if (sortedRecent.length >= 2) {
    smartPlaylists.push({
      id: 'smart-heavy-rotation',
      name: 'Heavy Rotation',
      description: 'Tracks taking over your headphones this week.',
      tracks: sortedRecent,
      createdAt: now,
      updatedAt: now,
      isSmartPlaylist: true,
      badge: 'THIS WEEK',
      gradient: 'from-amber-400 via-orange-500 to-rose-600',
      icon: '⚡',
      tagline: 'Trending in your rotation'
    });
  }

  // ================= 3. LATE NIGHT CHILL =================
  const chillKeywords = ['chill', 'night', 'sleep', 'ambient', 'lofi', 'lo-fi', 'slowed', 'reverb', 'rain', 'acoustic'];
  const chillTracks = Array.from(trackMap.values())
    .filter((t) => {
      if (lateNightIds.has(t.id)) return true;
      const combined = `${t.title} ${t.artist} ${t.album || ''}`.toLowerCase();
      return chillKeywords.some((kw) => combined.includes(kw));
    })
    .slice(0, 20);

  if (chillTracks.length >= 3) {
    smartPlaylists.push({
      id: 'smart-late-night',
      name: 'Late Night Chill',
      description: 'Downtempo melodies and midnight favorites for unwinding.',
      tracks: chillTracks,
      createdAt: now,
      updatedAt: now,
      isSmartPlaylist: true,
      badge: 'MIDNIGHT',
      gradient: 'from-indigo-600 via-purple-700 to-slate-900',
      icon: '🌙',
      tagline: 'Midnight unwinding'
    });
  }

  // ================= 4. FORGOTTEN GEMS =================
  const forgottenGems = likedSongs
    .filter((t) => {
      const lastPlay = lastPlayedMap.get(t.id);
      return !lastPlay || lastPlay < fourteenDaysAgo;
    })
    .slice(0, 20);

  if (forgottenGems.length >= 3) {
    smartPlaylists.push({
      id: 'smart-forgotten-gems',
      name: 'Forgotten Gems',
      description: 'Liked songs you haven’t played in a while—ready for rediscovery.',
      tracks: forgottenGems,
      createdAt: now,
      updatedAt: now,
      isSmartPlaylist: true,
      badge: 'REDISCOVER',
      gradient: 'from-emerald-500 via-teal-600 to-cyan-700',
      icon: '💎',
      tagline: 'Rediscover your saved favorites'
    });
  }

  return smartPlaylists;
}
