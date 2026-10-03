import { useLibraryStore } from '../../stores/libraryStore';
import { formatListeningTime } from '../../utils/formatTime';
import GlassCard from '../ui/GlassCard';

export default function StatsPage() {
  const { playHistory = [], recentlyPlayed = [] } = useLibraryStore();

  // Basic stats computations
  const totalListens = playHistory.length;
  // Assume each play is roughly 3.5 minutes for estimate if no duration available
  const totalMinutes = totalListens * 3.5;
  const uniqueArtists = new Set(playHistory.map(p => p.artist)).size;
  const averageDaily = Math.round(totalMinutes / 30); // simplistic avg over 30 days

  // Top tracks
  const trackCounts = playHistory.reduce((acc, play) => {
    const key = `${play.title}|${play.artist}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topTracks = Object.entries(trackCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([key, count]) => {
      const [title, artist] = key.split('|');
      return { title, artist, count };
    });

  // Top artists
  const artistCounts = playHistory.reduce((acc, play) => {
    acc[play.artist] = (acc[play.artist] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topArtists = Object.entries(artistCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([artist, count]) => ({ artist, count }));

  // Mock activity for chart (last 30 days)
  const activityData = Array.from({ length: 30 }, (_, i) => ({
    day: 30 - i,
    minutes: Math.floor(Math.random() * 120) + 10 // Mock data since playHistory might not have dates
  }));
  const maxMinutes = Math.max(...activityData.map(d => d.minutes), 1);

  if (totalListens === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-white/50 p-8">
        <svg className="w-20 h-20 opacity-50 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <h2 className="text-2xl font-bold text-white">No history yet</h2>
        <p>Start listening to see your stats!</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-4 md:p-8 flex flex-col gap-8 pb-32">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white">Your Music Stats</h1>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlassCard className="p-6 flex flex-col gap-2">
          <span className="text-sm text-white/50 font-medium">Total Time</span>
          <span className="text-3xl font-bold text-white">{formatListeningTime(totalMinutes * 60)}</span>
        </GlassCard>
        <GlassCard className="p-6 flex flex-col gap-2">
          <span className="text-sm text-white/50 font-medium">Tracks Played</span>
          <span className="text-3xl font-bold text-white">{totalListens}</span>
        </GlassCard>
        <GlassCard className="p-6 flex flex-col gap-2">
          <span className="text-sm text-white/50 font-medium">Unique Artists</span>
          <span className="text-3xl font-bold text-white">{uniqueArtists}</span>
        </GlassCard>
        <GlassCard className="p-6 flex flex-col gap-2">
          <span className="text-sm text-white/50 font-medium">Daily Avg</span>
          <span className="text-3xl font-bold text-white">{formatListeningTime(averageDaily * 60)}</span>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Top Tracks */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <h2 className="text-xl font-bold text-white">Top Tracks</h2>
          <GlassCard className="p-2">
            <div className="flex flex-col">
              {topTracks.map((track, idx) => (
                <div key={idx} className="flex items-center gap-4 p-4 hover:bg-white/5 rounded-xl transition-colors cursor-pointer group">
                  <span className="text-lg font-bold text-white/30 w-6 text-center">{idx + 1}</span>
                  <div className="flex-1 flex flex-col min-w-0">
                    <span className="text-white font-medium truncate">{track.title}</span>
                    <span className="text-white/50 text-sm truncate">{track.artist}</span>
                  </div>
                  <span className="text-xs font-medium text-white/40 bg-white/5 px-2 py-1 rounded-full">
                    {track.count} plays
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>

          <h2 className="text-xl font-bold text-white mt-4">Listening Activity (Last 30 Days)</h2>
          <GlassCard className="p-6 h-64 flex items-end justify-between gap-1">
            {activityData.map((data, idx) => (
              <div key={idx} className="relative flex-1 flex justify-center group h-full items-end">
                <div 
                  className="w-full max-w-[12px] bg-white/20 group-hover:bg-white/50 rounded-t-sm transition-all duration-300"
                  style={{ height: `${(data.minutes / maxMinutes) * 100}%` }}
                />
                <div className="absolute bottom-full mb-2 hidden group-hover:block z-10 bg-black/80 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none">
                  Day {data.day}: {data.minutes} min
                </div>
              </div>
            ))}
          </GlassCard>
        </div>

        {/* Right Column: Top Artists & Genres */}
        <div className="flex flex-col gap-6">
          <h2 className="text-xl font-bold text-white">Top Artists</h2>
          <div className="flex flex-col gap-4">
            {topArtists.map((artist, idx) => {
              let medal = '';
              if (idx === 0) medal = '🥇';
              if (idx === 1) medal = '🥈';
              if (idx === 2) medal = '🥉';

              return (
                <GlassCard key={idx} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-xl">
                      {medal || <span className="text-sm text-white/40">{idx + 1}</span>}
                    </div>
                    <span className="text-white font-medium">{artist.artist}</span>
                  </div>
                  <span className="text-sm text-white/50">{artist.count} plays</span>
                </GlassCard>
              );
            })}
          </div>

          <h2 className="text-xl font-bold text-white mt-4">Genre Distribution</h2>
          <GlassCard className="p-6 flex flex-col gap-4">
            {/* Mock genre data */}
            {[
              { name: 'Pop', pct: 45, color: 'bg-purple-500' },
              { name: 'Electronic', pct: 25, color: 'bg-blue-500' },
              { name: 'Hip Hop', pct: 15, color: 'bg-pink-500' },
              { name: 'Indie', pct: 10, color: 'bg-green-500' },
              { name: 'Other', pct: 5, color: 'bg-white/20' }
            ].map((genre, idx) => (
              <div key={idx} className="flex flex-col gap-1">
                <div className="flex justify-between text-sm">
                  <span className="text-white/80">{genre.name}</span>
                  <span className="text-white/50">{genre.pct}%</span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full ${genre.color}`} style={{ width: `${genre.pct}%` }} />
                </div>
              </div>
            ))}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
