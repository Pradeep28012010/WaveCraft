import { create } from 'zustand';
import type { Track } from '../types';

export type ContextMenuType = 'track' | 'page';

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  type: ContextMenuType;
  track: Track | null;
  tracks?: Track[];
  onRemove?: (() => void) | null;
  openTrackMenu: (
    e: { clientX: number; clientY: number },
    track: Track,
    tracks?: Track[],
    onRemove?: (() => void) | null
  ) => void;
  openPageMenu: (e: { clientX: number; clientY: number }) => void;
  closeMenu: () => void;
}

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  isOpen: false,
  x: 0,
  y: 0,
  type: 'page',
  track: null,
  tracks: undefined,
  onRemove: null,

  openTrackMenu: (e, track, tracks, onRemove) => {
    const x = typeof e?.clientX === 'number' && isFinite(e.clientX) ? e.clientX : 100;
    const y = typeof e?.clientY === 'number' && isFinite(e.clientY) ? e.clientY : 100;
    set({
      isOpen: true,
      x,
      y,
      type: 'track',
      track,
      tracks,
      onRemove: onRemove || null
    });
  },

  openPageMenu: (e) => {
    const x = typeof e?.clientX === 'number' && isFinite(e.clientX) ? e.clientX : 100;
    const y = typeof e?.clientY === 'number' && isFinite(e.clientY) ? e.clientY : 100;
    set({
      isOpen: true,
      x,
      y,
      type: 'page',
      track: null,
      tracks: undefined,
      onRemove: null
    });
  },

  closeMenu: () => {
    set({ isOpen: false, track: null, tracks: undefined, onRemove: null });
  }
}));
