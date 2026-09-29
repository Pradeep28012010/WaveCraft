import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLibraryStore } from '../../stores/libraryStore';
import { usePlayerStore } from '../../stores/playerStore';
import TrackRow from '../ui/TrackRow';
import GlassButton from '../ui/GlassButton';
import CreatePlaylist from './CreatePlaylist';
import { formatTime } from '../../utils/formatTime';

export default function PlaylistView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const playlists = useLibraryStore(state => state.playlists);
  const removeFromPlaylist = useLibraryStore(state => state.removeFromPlaylist);
  const deletePlaylist = useLibraryStore(state => state.deletePlaylist);
  const playTrack = usePlayerStore(state => state.playTrack);
  const setQueue = usePlayerStore(state => state.setQueue);
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const playlist = playlists.find(p => p.id === id);

  if (!playlist) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-white/50">
        <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-lg mb-4">Playlist not found</p>
        <GlassButton onClick={() => navigate('/library')}>Back to Library</GlassButton>
      </div>
    );
  }

  const handlePlayAll = () => {
    if (playlist.tracks.length > 0) {
      playTrack(playlist.tracks[0], playlist.tracks, 0);
    }
  };

  const handleShuffleAll = () => {
    if (playlist.tracks.length > 0) {
      const shuffled = [...playlist.tracks].sort(() => Math.random() - 0.5);
      playTrack(shuffled[0], shuffled, 0);
    }
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this playlist?')) {
      deletePlaylist(playlist.id);
      navigate('/library');
    }
  };

  const totalDuration = playlist.tracks.reduce((acc, track) => acc + (track.duration || 0), 0);

  return (
    <div className="pb-24 pt-6 text-white min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-8 items-end mb-8">
        <div className="w-48 h-48 md:w-60 md:h-60 flex-shrink-0 rounded-2xl shadow-2xl overflow-hidden bg-white/10 relative shadow-black/40">
          {playlist.coverUrl ? (
            <img src={playlist.coverUrl} alt={playlist.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-6xl font-bold text-white shadow-inner">
              {playlist.name.charAt(0)}
            </div>
          )}
        </div>
        
        <div className="flex flex-col gap-2 flex-grow">
          <span className="uppercase text-xs font-bold tracking-widest text-white/60">Playlist</span>
          <h1 
            className="text-4xl md:text-6xl font-extrabold tracking-tight cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setIsEditModalOpen(true)}
          >
            {playlist.name}
          </h1>
          {playlist.description && (
            <p className="text-white/70 text-sm md:text-base mt-2 max-w-2xl">{playlist.description}</p>
          )}
          <div className="flex items-center gap-2 text-sm text-white/60 mt-2">
            <span className="font-medium text-white">{playlist.tracks.length} songs</span>
            <span>•</span>
            <span>{formatTime(totalDuration)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={handlePlayAll}
          className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform shadow-lg disabled:opacity-50 disabled:hover:scale-100"
          disabled={playlist.tracks.length === 0}
        >
          <svg className="w-7 h-7 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        </button>
        <GlassButton onClick={handleShuffleAll} disabled={playlist.tracks.length === 0}>
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          Shuffle
        </GlassButton>
        <div className="flex-grow" />
        <button onClick={() => setIsEditModalOpen(true)} className="p-2 text-white/60 hover:text-white transition-colors" title="Edit Playlist">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
        </button>
        <button onClick={handleDelete} className="p-2 text-white/60 hover:text-red-400 transition-colors" title="Delete Playlist">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>

      {/* Tracks */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-1.5">
        {playlist.tracks.length === 0 ? (
          <div className="text-center py-12 text-white/50 border border-dashed border-white/20 rounded-xl">
            <p className="text-lg">This playlist is empty.</p>
            <p className="text-sm mt-1">Search for songs and add them here.</p>
            <GlassButton className="mt-4" onClick={() => navigate('/search')}>Search Songs</GlassButton>
          </div>
        ) : (
          playlist.tracks.map((track, index) => (
            <TrackRow
              key={`${track.id}-${index}`}
              track={track}
              tracks={playlist.tracks}
              index={index + 1}
              onPlay={() => playTrack(track, playlist.tracks, index)}
              onRemove={() => removeFromPlaylist(playlist.id, track.id)}
            />
          ))
        )}
      </motion.div>

      <CreatePlaylist 
        isOpen={isEditModalOpen} 
        onClose={() => setIsEditModalOpen(false)} 
        editPlaylist={playlist} 
      />
    </div>
  );
}
