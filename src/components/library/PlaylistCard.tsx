import { Link } from 'react-router-dom';
import type { Playlist } from '../../types';
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

  return (
    <Link to={`/playlist/${playlist.id}`} className="block group">
      <GlassCard className="p-4 h-full transition-all hover:bg-white/10 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20">
        <div className="aspect-square rounded-xl overflow-hidden mb-4 relative bg-white/5">
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

          {onPlay && (
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onPlay();
                }}
                className="w-14 h-14 rounded-full glass-button-primary text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-transform cursor-pointer"
              >
                <svg className="w-7 h-7 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <h3 className="font-bold text-lg text-white truncate">{playlist.name}</h3>
        <p className="text-sm text-white/60 mt-1">{playlist.tracks.length} tracks</p>
      </GlassCard>
    </Link>
  );
}
