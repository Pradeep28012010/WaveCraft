import React, { useState, useEffect } from 'react';
import { useLibraryStore } from '../../stores/libraryStore';
import GlassModal from '../ui/GlassModal';
import GlassButton from '../ui/GlassButton';
import type { PlaylistFolder } from '../../types';

interface FolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  editFolder?: PlaylistFolder | null;
}

const PRESET_COLORS = [
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Purple', hex: '#8b5cf6' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Rose', hex: '#f43f5e' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Cyan', hex: '#06b6d4' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Lime', hex: '#84cc16' },
  { name: 'Ruby', hex: '#e11d48' },
];

const PRESET_ICONS = [
  '📁', '🎧', '⚡', '🏋️', '💻', '🌙', 
  '🚗', '🔥', '☕', '🎮', '🪐', '🌴', 
  '📚', '💖', '🎸', '🚀', '✨', '🔮'
];

export default function FolderModal({ isOpen, onClose, editFolder }: FolderModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [icon, setIcon] = useState('📁');

  const createFolder = useLibraryStore((state) => state.createFolder);
  const updateFolder = useLibraryStore((state) => state.updateFolder);

  useEffect(() => {
    if (editFolder) {
      setName(editFolder.name);
      setDescription(editFolder.description || '');
      setColor(editFolder.color || '#6366f1');
      setIcon(editFolder.icon || '📁');
    } else {
      setName('');
      setDescription('');
      setColor('#6366f1');
      setIcon('📁');
    }
  }, [editFolder, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editFolder) {
      updateFolder(editFolder.id, {
        name: name.trim(),
        description: description.trim(),
        color,
        icon
      });
    } else {
      createFolder(name.trim(), color, icon, description.trim());
    }

    onClose();
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={editFolder ? 'Edit Folder' : 'Create New Folder'}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-white">
        {/* Preview Card */}
        <div
          className="p-4 rounded-2xl border transition-all flex items-center gap-4 relative overflow-hidden liquid-glass"
          style={{
            borderColor: `${color}60`,
            background: `linear-gradient(135deg, ${color}20, rgba(255, 255, 255, 0.03))`
          }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-lg flex-shrink-0"
            style={{
              backgroundColor: `${color}35`,
              boxShadow: `0 0 20px ${color}40`,
              border: `1px solid ${color}80`
            }}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-base font-extrabold truncate text-white">
              {name.trim() || 'New Folder Preview'}
            </h4>
            <p className="text-xs text-white/60 truncate mt-0.5">
              {description.trim() || 'Custom playlist organization shelf'}
            </p>
          </div>
        </div>

        {/* Folder Name */}
        <div>
          <label className="block text-xs font-bold text-white/70 mb-1.5 uppercase tracking-wider">
            Folder Name
          </label>
          <input
            type="text"
            placeholder="e.g., Workout Mixes, Focus Sessions, Night Vibes"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full glass-input rounded-xl p-3 text-sm text-white placeholder:text-white/40"
            required
            autoFocus
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-bold text-white/70 mb-1.5 uppercase tracking-wider">
            Description (Optional)
          </label>
          <input
            type="text"
            placeholder="Short note about what belongs in this folder"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full glass-input rounded-xl p-3 text-sm text-white placeholder:text-white/40"
          />
        </div>

        {/* Icon Selector */}
        <div>
          <label className="block text-xs font-bold text-white/70 mb-1.5 uppercase tracking-wider">
            Folder Icon
          </label>
          <div className="flex flex-wrap gap-2">
            {PRESET_ICONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-transform cursor-pointer ${
                  icon === emoji
                    ? 'ring-2 ring-white scale-110 glass-button-primary shadow-md'
                    : 'glass-button hover:scale-105'
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Color Theme Selector */}
        <div>
          <label className="block text-xs font-bold text-white/70 mb-1.5 uppercase tracking-wider">
            Theme Aura Color
          </label>
          <div className="flex flex-wrap gap-2.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                title={c.name}
                onClick={() => setColor(c.hex)}
                className={`w-7 h-7 rounded-full transition-transform cursor-pointer relative ${
                  color === c.hex ? 'ring-2 ring-white scale-125' : 'hover:scale-110 opacity-80 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: c.hex,
                  boxShadow: color === c.hex ? `0 0 12px ${c.hex}` : undefined
                }}
              />
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 mt-3 pt-3 border-t border-white/10">
          <GlassButton type="button" variant="ghost" onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton type="submit" variant="primary">
            {editFolder ? 'Save Changes' : 'Create Folder'}
          </GlassButton>
        </div>
      </form>
    </GlassModal>
  );
}
