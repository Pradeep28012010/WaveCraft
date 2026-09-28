import { create } from 'zustand'
import type { StatsData, Track } from '../types'

interface StatsStore {
  stats: StatsData | null;
  isLoading: boolean;
  computeStats: (
    likedSongs: Track[],
    recentlyPlayed: { track: Track; playedAt: number }[],
    playHistory: { trackId: string; playedAt: number; duration: number }[]
  ) => void;
}

export const useStatsStore = create<StatsStore>((set) => ({
  stats: null,
  isLoading: false,

  computeStats: (likedSongs, recentlyPlayed, playHistory) => {
    set({ isLoading: true });
    
    setTimeout(() => {
      let totalListeningTime = 0;
      const trackCounts: Record<string, number> = {};
      const artistCounts: Record<string, { plays: number; time: number }> = {};
      const dailyMinutes: Record<string, number> = {};
      const genreCounts: Record<string, number> = {};
      
      const trackMap = new Map<string, Track>();
      recentlyPlayed.forEach(rp => trackMap.set(rp.track.id, rp.track));
      likedSongs.forEach(t => trackMap.set(t.id, t));

      playHistory.forEach(ph => {
        totalListeningTime += ph.duration;
        
        trackCounts[ph.trackId] = (trackCounts[ph.trackId] || 0) + 1;
        
        const track = trackMap.get(ph.trackId);
        if (track) {
          if (track.artist) {
            if (!artistCounts[track.artist]) {
              artistCounts[track.artist] = { plays: 0, time: 0 };
            }
            artistCounts[track.artist].plays += 1;
            artistCounts[track.artist].time += ph.duration;
          }
          if (track.genre) {
            genreCounts[track.genre] = (genreCounts[track.genre] || 0) + 1;
          }
        }
        
        const dateStr = new Date(ph.playedAt).toISOString().split('T')[0];
        dailyMinutes[dateStr] = (dailyMinutes[dateStr] || 0) + (ph.duration / 60);
      });

      const topTracks = Object.entries(trackCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([id, count]) => ({
          trackId: id,
          plays: count,
          track: trackMap.get(id)
        }))
        .filter(t => t.track);
        
      const topArtists = Object.entries(artistCounts)
        .sort((a, b) => b[1].plays - a[1].plays)
        .slice(0, 20)
        .map(([name, data]) => ({
          name,
          plays: data.plays,
          listeningTime: data.time
        }));

      set({
        stats: {
          totalListeningTime,
          topTracks: topTracks as any,
          topArtists,
          dailyListening: dailyMinutes,
          genreDistribution: genreCounts
        },
        isLoading: false
      });
    }, 0);
  }
}));
