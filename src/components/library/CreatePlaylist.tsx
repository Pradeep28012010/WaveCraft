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

const TAG_SUGGESTIONS = [
  'chill',
  'workout',
  'focus',
  'vibes',
  'night',
  'travel',
  'party',
  'study',
  'favorites',
  'acoustic'
];

export default function CreatePlaylist({ isOpen, onClose, editPlaylist }: CreatePlaylistProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [folderId, setFolderId] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isPinned, setIsPinned] = useState(false);

  const folders = useLibraryStore((state) => state.folders);
  const createPlaylist = useLibraryStore((state) => state.createPlaylist);
  const updatePlaylist = useLibraryStore((state) => state.updatePlaylist);

  useEffect(() => {
    if (editPlaylist) {
      setName(editPlaylist.name);
      setDescription(editPlaylist.description || '');
      setCoverUrl(editPlaylist.coverUrl || editPlaylist.coverImage || '');
      setFolderId(editPlaylist.folderId || '');
      setTags(editPlaylist.tags || []);
      setIsPinned(Boolean(editPlaylist.isPinned));
    } else {
      setName('');
      setDescription('');
      setCoverUrl('');
      setFolderId('');
      setTags([]);
      setIsPinned(false);
    }
    setTagInput('');
  }, [editPlaylist, isOpen]);

  const handleAddTag = (rawTag: string) => {
    const clean = rawTag.trim().replace(/^#+/, '').toLowerCase();
    if (clean && !tags.includes(clean)) {
      setTags([...tags, clean]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag(tagInput);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const selectedFolder = folders.find((f) => f.id === folderId);

    // Also include any tag currently typed in tagInput if user didn't hit enter
    let finalTags = [...tags];
    const pendingTag = tagInput.trim().replace(/^#+/, '').toLowerCase();
    if (pendingTag && !finalTags.includes(pendingTag)) {
      finalTags.push(pendingTag);
    }

    if (editPlaylist) {
      updatePlaylist(editPlaylist.id, {
        name: name.trim(),
        description: description.trim(),
        coverUrl: coverUrl.trim(),
        coverImage: coverUrl.trim(),
        folderId: folderId || undefined,
        folder: selectedFolder ? selectedFolder.name : undefined,
        tags: finalTags,
        isPinned
      });
    } else {
      createPlaylist(name.trim(), description.trim(), coverUrl.trim(), {
        folderId: folderId || undefined,
        folder: selectedFolder ? selectedFolder.name : undefined,
        tags: finalTags,
        isPinned
      });
    }

    onClose();
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={editPlaylist ? 'Edit Playlist' : 'Create New Playlist'}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-white">
        <div className="flex gap-4 items-start">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br from-rose-500/30 to-purple-600/30 border border-white/15 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-lg">
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
              autoFocus
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

        {/* Folder Assignment */}
        {folders.length > 0 && (
          <div>
            <label className="block text-xs font-bold text-white/70 mb-1.5 uppercase tracking-wider">
              Folder Shelf
            </label>
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="w-full glass-input rounded-xl p-3 text-sm text-white bg-slate-900/90 border border-white/15 cursor-pointer"
            >
              <option value="" className="bg-slate-900 text-white">
                None (Unorganized / General Library)
              </option>
              {folders.map((f) => (
                <option key={f.id} value={f.id} className="bg-slate-900 text-white">
                  {f.icon || '📁'} {f.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Smart Mood Tags */}
        <div>
          <label className="block text-xs font-bold text-white/70 mb-1.5 uppercase tracking-wider">
            Smart Mood Tags
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              placeholder="Type tag (e.g. chill, workout) and press Enter"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              className="flex-1 glass-input rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/40"
            />
            <button
              type="button"
              onClick={() => handleAddTag(tagInput)}
              disabled={!tagInput.trim()}
              className="px-3 py-2 rounded-xl text-xs font-bold glass-button text-white disabled:opacity-40 cursor-pointer"
            >
              + Add
            </button>
          </div>

          {/* Active Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full liquid-glass border border-indigo-400/40 text-indigo-200 text-xs font-medium"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-white ml-0.5 cursor-pointer text-indigo-300"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Quick Suggestions */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[10px] text-white/40 mr-1 uppercase font-semibold">Suggested:</span>
            {TAG_SUGGESTIONS.filter((s) => !tags.includes(s)).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleAddTag(suggestion)}
                className="px-2.5 py-1 rounded-lg glass-button text-[11px] text-white/70 hover:text-white transition-all cursor-pointer"
              >
                +{suggestion}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <textarea
            placeholder="Add an optional description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full glass-input rounded-xl p-3 text-sm text-white placeholder:text-white/40 resize-none mt-1"
          />
        </div>

        {/* Pin to Top Checkbox */}
        <label className="flex items-center gap-2.5 p-3 rounded-xl liquid-glass border border-white/12 cursor-pointer hover:border-white/25 transition-all">
          <input
            type="checkbox"
            checked={isPinned}
            onChange={(e) => setIsPinned(e.target.checked)}
            className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 bg-white/10 border-white/20 cursor-pointer"
          />
          <div className="text-xs">
            <span className="font-bold text-white flex items-center gap-1">
              <span>📌</span> Pin to Top of Library
            </span>
            <span className="text-white/50 block mt-0.5">
              Keep this playlist prominently pinned at the top shelf of your library
            </span>
          </div>
        </label>

        <div className="flex justify-end gap-3 mt-2 pt-3 border-t border-white/10">
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
