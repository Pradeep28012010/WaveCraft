import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLibraryStore } from '../../stores/libraryStore';
import GlassModal from '../ui/GlassModal';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
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
  'acoustic',
  'lofi',
  'electronic'
];

const GRADIENT_PALETTES = [
  { id: 'sunset', label: 'Sunset', gradient: 'from-rose-500 via-pink-500 to-purple-600' },
  { id: 'violet', label: 'Violet', gradient: 'from-violet-600 via-indigo-600 to-blue-500' },
  { id: 'cyan', label: 'Cyber', gradient: 'from-cyan-400 via-blue-500 to-indigo-600' },
  { id: 'emerald', label: 'Mint', gradient: 'from-emerald-400 via-teal-500 to-cyan-600' },
  { id: 'amber', label: 'Amber', gradient: 'from-amber-400 via-orange-500 to-rose-500' },
  { id: 'midnight', label: 'Dark', gradient: 'from-slate-700 via-purple-900 to-slate-950' }
];

export default function CreatePlaylist({ isOpen, onClose, editPlaylist }: CreatePlaylistProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [selectedGradient, setSelectedGradient] = useState(GRADIENT_PALETTES[0].gradient);
  const [useCustomUrl, setUseCustomUrl] = useState(false);
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
      const initialCover = editPlaylist.coverUrl || editPlaylist.coverImage || '';
      setCoverUrl(initialCover);
      setUseCustomUrl(Boolean(initialCover && initialCover.startsWith('http')));
      setFolderId(editPlaylist.folderId || '');
      setTags(editPlaylist.tags || []);
      setIsPinned(Boolean(editPlaylist.isPinned));
    } else {
      setName('');
      setDescription('');
      setCoverUrl('');
      setUseCustomUrl(false);
      setFolderId('');
      setTags([]);
      setIsPinned(false);
      // Pick a random gradient for new playlist
      const randIdx = Math.floor(Math.random() * GRADIENT_PALETTES.length);
      setSelectedGradient(GRADIENT_PALETTES[randIdx].gradient);
    }
    setTagInput('');
  }, [editPlaylist, isOpen]);

  const handleAddTag = (rawTag: string) => {
    const clean = rawTag.trim().replace(/^#+/, '').toLowerCase();
    if (clean && !tags.includes(clean)) {
      triggerAndroidHaptic('light');
      setTags([...tags, clean]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    triggerAndroidHaptic('light');
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

    triggerAndroidHaptic('medium');
    const selectedFolder = folders.find((f) => f.id === folderId);

    let finalTags = [...tags];
    const pendingTag = tagInput.trim().replace(/^#+/, '').toLowerCase();
    if (pendingTag && !finalTags.includes(pendingTag)) {
      finalTags.push(pendingTag);
    }

    const finalCover = useCustomUrl ? coverUrl.trim() : '';

    if (editPlaylist) {
      updatePlaylist(editPlaylist.id, {
        name: name.trim(),
        description: description.trim(),
        coverUrl: finalCover,
        coverImage: finalCover,
        folderId: folderId || undefined,
        folder: selectedFolder ? selectedFolder.name : undefined,
        tags: finalTags,
        isPinned
      });
    } else {
      createPlaylist(name.trim(), description.trim(), finalCover, {
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
      title={editPlaylist ? 'Edit Playlist' : 'New Playlist'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-white select-none">
        {/* ── Apple-Grade Hero Artwork & Title Card ── */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-2xl liquid-glass bg-white/[0.03] border border-white/10">
          {/* Cover Artwork Preview */}
          <div className="relative group flex-shrink-0">
            <div
              className={`w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-gradient-to-br ${
                useCustomUrl && coverUrl ? 'bg-black' : selectedGradient
              } border border-white/20 flex items-center justify-center overflow-hidden shadow-[0_12px_32px_rgba(0,0,0,0.5)] transition-all`}
            >
              {useCustomUrl && coverUrl ? (
                <img
                  src={coverUrl}
                  alt="Playlist Cover"
                  className="w-full h-full object-cover"
                  onError={() => setUseCustomUrl(false)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-2 text-center">
                  <span className="text-4xl font-black text-white drop-shadow-md">
                    {name ? name.charAt(0).toUpperCase() : '♪'}
                  </span>
                  <span className="text-[10px] font-bold text-white/60 tracking-wider uppercase mt-1">
                    PLAYLIST
                  </span>
                </div>
              )}
            </div>

            {/* Subtle Gradient Swatch Dots */}
            {!useCustomUrl && (
              <div className="flex items-center justify-center gap-1.5 mt-2">
                {GRADIENT_PALETTES.map((pal) => (
                  <button
                    key={pal.id}
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      setSelectedGradient(pal.gradient);
                    }}
                    title={pal.label}
                    className={`w-4 h-4 rounded-full bg-gradient-to-br ${pal.gradient} transition-transform ${
                      selectedGradient === pal.gradient
                        ? 'ring-2 ring-white scale-125 shadow-md'
                        : 'opacity-70 hover:opacity-100 hover:scale-110'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Title & Description Fields */}
          <div className="flex flex-col gap-2.5 flex-1 w-full min-w-0">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
                Playlist Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                placeholder="Give your playlist a title..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl liquid-glass bg-white/[0.05] border border-white/15 text-sm text-white font-semibold placeholder:text-white/35 focus:outline-none focus:border-cyan-400/60 transition-all shadow-inner"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
                Description
              </label>
              <textarea
                placeholder="Add an optional description or vibe..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full p-2.5 rounded-xl liquid-glass bg-white/[0.05] border border-white/15 text-xs text-white placeholder:text-white/35 focus:outline-none focus:border-cyan-400/60 transition-all resize-none shadow-inner"
              />
            </div>
          </div>
        </div>

        {/* ── Custom Cover Image URL Toggle ── */}
        <div className="p-3 rounded-xl liquid-glass bg-white/[0.02] border border-white/8 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/80">Use Custom Artwork Image URL</span>
            <button
              type="button"
              onClick={() => {
                triggerAndroidHaptic('light');
                setUseCustomUrl(!useCustomUrl);
              }}
              className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center cursor-pointer ${
                useCustomUrl ? 'bg-[var(--color-accent)]' : 'bg-white/15'
              }`}
            >
              <motion.div
                animate={{ x: useCustomUrl ? 20 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="w-5 h-5 rounded-full bg-white shadow-md"
              />
            </button>
          </div>

          <AnimatePresence>
            {useCustomUrl && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden pt-1"
              >
                <input
                  type="url"
                  placeholder="https://example.com/cover.jpg"
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  className="w-full h-9.5 px-3 rounded-xl liquid-glass bg-white/[0.05] border border-white/15 text-xs text-white placeholder:text-white/35 focus:outline-none focus:border-cyan-400/60 transition-all"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Folder Shelf Selection ── */}
        {folders.length > 0 && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1.5">
              Folder Shelf
            </label>
            <select
              value={folderId}
              onChange={(e) => {
                triggerAndroidHaptic('light');
                setFolderId(e.target.value);
              }}
              className="w-full h-10 px-3 rounded-xl liquid-glass bg-[#0d0f1b]/95 border border-white/15 text-xs text-white cursor-pointer focus:outline-none focus:border-cyan-400/60"
            >
              <option value="" className="bg-slate-900 text-white">
                General Library (No Shelf)
              </option>
              {folders.map((f) => (
                <option key={f.id} value={f.id} className="bg-slate-900 text-white">
                  {f.icon || '📁'} {f.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ── Smart Mood & Vibe Tags ── */}
        <div className="space-y-2">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-white/50">
            Vibe & Mood Tags
          </label>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Type tag (e.g. chill, workout) and press Enter"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              className="flex-1 h-9.5 px-3 rounded-xl liquid-glass bg-white/[0.05] border border-white/15 text-xs text-white placeholder:text-white/35 focus:outline-none focus:border-cyan-400/60"
            />
            <button
              type="button"
              onClick={() => handleAddTag(tagInput)}
              disabled={!tagInput.trim()}
              className="px-3.5 h-9.5 rounded-xl text-xs font-bold glass-button text-white disabled:opacity-40 cursor-pointer active:scale-95 transition-all"
            >
              + Add
            </button>
          </div>

          {/* Active Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full liquid-glass bg-indigo-500/15 border border-indigo-400/40 text-indigo-200 text-xs font-semibold shadow-sm"
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

          {/* Preset Suggestions */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[10px] text-white/40 uppercase font-semibold mr-1">Suggestions:</span>
            {TAG_SUGGESTIONS.filter((s) => !tags.includes(s)).slice(0, 7).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleAddTag(suggestion)}
                className="px-2.5 py-0.5 rounded-lg glass-button text-[11px] text-white/70 hover:text-white transition-all cursor-pointer active:scale-95"
              >
                +{suggestion}
              </button>
            ))}
          </div>
        </div>

        {/* ── Pin to Top iOS Switch ── */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl liquid-glass bg-white/[0.03] border border-white/10 cursor-pointer" onClick={() => {
          triggerAndroidHaptic('light');
          setIsPinned(!isPinned);
        }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-sm">
              📌
            </div>
            <div>
              <span className="text-xs font-bold text-white block">
                Pin to Top of Library
              </span>
              <span className="text-[10px] text-white/50 block">
                Keep prominently pinned on the top shelf of your library
              </span>
            </div>
          </div>

          <div
            className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center cursor-pointer ${
              isPinned ? 'bg-amber-500' : 'bg-white/15'
            }`}
          >
            <motion.div
              animate={{ x: isPinned ? 20 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="w-5 h-5 rounded-full bg-white shadow-md"
            />
          </div>
        </div>

        {/* ── Footer Actions ── */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10 mt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl glass-button text-xs font-semibold text-white/70 hover:text-white transition-all cursor-pointer active:scale-95"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 rounded-xl glass-button-primary text-xs font-bold text-white transition-all shadow-md active:scale-95 cursor-pointer"
          >
            {editPlaylist ? 'Save Changes' : 'Create Playlist'}
          </button>
        </div>
      </form>
    </GlassModal>
  );
}
