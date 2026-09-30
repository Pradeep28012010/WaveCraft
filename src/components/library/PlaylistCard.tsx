import { Link } from 'react-router-dom';
import type { Playlist } from '../../types';
import { useLibraryStore } from '../../stores/libraryStore';
import GlassCard from '../ui/GlassCard';

interface PlaylistCardProps {
  playlist: Playlist;
  onPlay?: () => void;
}

export function getHighResPlaylistCover(playlist: Playlist): string {
  const raw =
    playlist.coverUrl ||
    playlist.tracks?.[0]?.thumbnailLarge ||
    playlist.tracks?.[0]?.thumbnail ||
    '';
  if (!raw) return '';
  return raw
    .replace('ab67706f00000001', 'ab67706f00000003')
    .replace('ab67706f00000002', 'ab67706f00000003')
    .replace('ab67616d00004851', 'ab67616d0000b273')
    .replace('ab67616d00001e02', 'ab67616d0000b273')
    .replace('150x150', '500x500')
    .replace('50x50', '500x500')
    .replace('100x100bb', '600x600bb');
}

export default function PlaylistCard({ playlist, onPlay }: PlaylistCardProps) {
  const hdCoverUrl = getHighResPlaylistCover(playlist);
  const isSyncing = useLibraryStore((s) => Boolean(s.syncingPlaylistIds[playlist.id]));

  return (
    <Link to={`/playlist/${playlist.id}`} className="block group">
      <GlassCard
        className={`p-4 h-full transition-all hover:bg-white/10 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20 ${
          playlist.isLiveSync ? 'border border-emerald-400/30' : ''
        }`}
      >
        <div className="aspect-square rounded-xl overflow-hidden mb-3.5 relative bg-white/5">
          {hdCoverUrl ? (
            <img
              src={hdCoverUrl}
              alt={playlist.name}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-indigo-500/80 to-purple-600/80 flex items-center justify-center text-4xl font-bold text-white">
              {playlist.name.charAt(0).toUpperCase()}
            </div>
          )}

          {/* Live Auto-Sync Badge */}
          {playlist.isLiveSync && (
            <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-emerald-400/45 flex items-center gap-1.5 shadow-lg">
              <span
                className={`w-2 h-2 rounded-full bg-emerald-400 ${
                  isSyncing ? 'animate-spin' : 'animate-pulse'
                }`}
              />
              <span className="text-[10px] font-extrabold text-emerald-300 tracking-wide whitespace-nowrap">
                {isSyncing ? 'SYNCING...' : 'LIVE SYNC'}
              </span>
            </div>
          )}

          {onPlay && (
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onPlay();
                }}
                className="w-14 h-14 p-0 rounded-full glass-button-primary text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-transform cursor-pointer"
              >
                <svg className="w-7 h-7 block" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7.5 5.65c0-.82.89-1.33 1.6-.91l10.05 6.35c.68.43.68 1.39 0 1.82L9.1 19.26c-.71.42-1.6-.09-1.6-.91V5.65z" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <h3 className="font-bold text-base text-white truncate">{playlist.name}</h3>
        <div className="flex items-center justify-between gap-2 mt-1">
          <p className="text-xs text-white/60 whitespace-nowrap">
            {playlist.tracks.length} tracks
            {playlist.isLiveSync ? ' • Auto-Updates' : ''}
          </p>
          {playlist.isLiveSync && (playlist.lastSyncDelta || 0) > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-extrabold whitespace-nowrap flex-shrink-0">
              +{playlist.lastSyncDelta} new
            </span>
          )}
        </div>
      </GlassCard>
    </Link>
  );
}
