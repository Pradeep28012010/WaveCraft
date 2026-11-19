import { motion } from 'framer-motion';
import { useLibraryStore } from '../../stores/libraryStore';
import { usePlayerStore } from '../../stores/playerStore';
import TrackRow from '../ui/TrackRow';
import GlassButton from '../ui/GlassButton';

export default function RecentlyPlayed() {
  const recentlyPlayed = useLibraryStore((state) => state.recentlyPlayed);
  const clearHistory = useLibraryStore((state) => state.clearHistory);
  const playTrack = usePlayerStore((state) => state.playTrack);

  const formatRelativeTime = (timestamp: number) => {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const extractTrack = (item: { track?: Track; playedAt?: number } | Track): Track | null => {
    if (!item) return null;
    if ('track' in item && item.track) return item.track;
    if ('id' in item && ('title' in item || 'name' in item)) return item as unknown as Track;
    return null;
  };

  const allRecentTracks = recentlyPlayed
    .map(extractTrack)
    .filter(Boolean) as Track[];

  return (
    <div className="pb-44 sm:pb-24 pt-2 text-white min-h-screen">
      <div className="flex items-center justify-between mb-8 border-0 pb-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Recently Played</h1>
          <p className="text-xs text-white/50 mt-1">Your listening timeline</p>
        </div>

        {recentlyPlayed.length > 0 && (
          <GlassButton size="sm" onClick={() => clearHistory()}>
            Clear History
          </GlassButton>
        )}
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-1.5">
        {recentlyPlayed.length === 0 ? (
          <div className="text-center py-20 text-white/50 glass rounded-2xl">
            <p className="text-lg font-semibold text-white">No listening history yet</p>
            <p className="text-sm mt-1">Play any track to start building your history.</p>
          </div>
        ) : (
          recentlyPlayed.map((item, i) => {
            const track = extractTrack(item);
            if (!track) return null;
            const playedAt = ('playedAt' in item && typeof item.playedAt === 'number') ? item.playedAt : Date.now();
            return (
              <div key={`${track.id}-${playedAt}-${i}`} className="flex items-center gap-3">
                <div className="flex-grow min-w-0">
                  <TrackRow
                    track={track}
                    tracks={allRecentTracks}
                    index={i + 1}
                    onPlay={(t) => playTrack(t, allRecentTracks, i)}
                  />
                </div>
                <div className="text-xs text-white/40 w-16 text-right whitespace-nowrap hidden sm:block">
                  {formatRelativeTime(playedAt)}
                </div>
              </div>
            );
          })
        )}
      </motion.div>
    </div>
  );
}
