import { Link } from 'react-router-dom';
import type { Playlist } from '../../types';
import GlassCard from '../ui/GlassCard';

interface PlaylistCardProps {
  playlist: Playlist;
  onPlay?: () => void;
}

export default function PlaylistCard({ playlist, onPlay }: PlaylistCardProps) {
  return (
    <Link to={`/playlist/${playlist.id}`} className="block group">
      <GlassCard className="p-4 h-full transition-all hover:bg-white/10 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20">
        <div className="aspect-square rounded-xl overflow-hidden mb-4 relative bg-white/5">
          {playlist.coverUrl ? (
            <img src={playlist.coverUrl} alt={playlist.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-indigo-500/80 to-purple-600/80 flex items-center justify-center text-4xl font-bold text-white">
              {playlist.name.charAt(0).toUpperCase()}
            </div>
          )}
          
          {onPlay && (
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button 
                onClick={(e) => { e.preventDefault(); onPlay(); }}
                className="bg-white/20 backdrop-blur-md text-white p-4 rounded-full hover:bg-white/40 transition-colors shadow-lg shadow-black/20 hover:scale-110 active:scale-95"
              >
                <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
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
