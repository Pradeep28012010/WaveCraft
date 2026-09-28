import React, { useState, useEffect } from 'react';
import { useLibraryStore } from '../../stores/libraryStore';
import GlassModal from '../ui/GlassModal';
import GlassButton from '../ui/GlassButton';
import type { Playlist } from '../../types';

interface CreatePlaylistProps {
  isOpen: boolean;
  onClose: () => void;
  editPlaylist?: Playlist;
}

export default function CreatePlaylist({ isOpen, onClose, editPlaylist }: CreatePlaylistProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');

  const createPlaylist = useLibraryStore((state) => state.createPlaylist);
  const updatePlaylist = useLibraryStore((state) => state.updatePlaylist);

  useEffect(() => {
    if (editPlaylist) {
      setName(editPlaylist.name);
      setDescription(editPlaylist.description || '');
      setCoverUrl(editPlaylist.coverUrl || editPlaylist.coverImage || '');
    } else {
      setName('');
      setDescription('');
      setCoverUrl('');
    }
  }, [editPlaylist, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editPlaylist) {
      updatePlaylist(editPlaylist.id, {
        name: name.trim(),
        description: description.trim(),
        coverUrl: coverUrl.trim(),
        coverImage: coverUrl.trim()
      });
    } else {
      createPlaylist(name.trim(), description.trim(), coverUrl.trim());
    }

    onClose();
  };

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title={editPlaylist ? 'Edit Playlist' : 'Create New Playlist'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-white">
        <div className="flex gap-4 items-start">
          <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-rose-500/30 to-purple-600/30 border border-white/15 flex items-center justify-center overflow-hidden flex-shrink-0">
            {coverUrl ? (
              <img src={coverUrl} alt="Cover preview" className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-extrabold text-white/70">
                {name ? name.charAt(0).toUpperCase() : '♪'}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-3 flex-grow">
            <input
              type="text"
              placeholder="Playlist Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="glass-input rounded-xl p-3 text-sm text-white placeholder:text-white/40"
              required
            />

            <input
              type="text"
              placeholder="Cover Image URL (optional)"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              className="glass-input rounded-xl p-3 text-sm text-white placeholder:text-white/40"
            />
          </div>
        </div>

        <textarea
          placeholder="Add an optional description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="glass-input rounded-xl p-3 text-sm text-white placeholder:text-white/40 resize-none mt-1"
        />

        <div className="flex justify-end gap-3 mt-3">
          <GlassButton type="button" variant="ghost" onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton type="submit" variant="primary">
            {editPlaylist ? 'Save Changes' : 'Create Playlist'}
          </GlassButton>
        </div>
      </form>
    </GlassModal>
  );
}
