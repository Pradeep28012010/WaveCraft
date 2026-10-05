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
  openTrackMenu: (
    e: { clientX: number; clientY: number },
    track: Track,
    tracks?: Track[]
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

  openTrackMenu: (e, track, tracks) => {
    set({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      type: 'track',
      track,
      tracks
    });
  },

  openPageMenu: (e) => {
    set({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      type: 'page',
      track: null,
      tracks: undefined
    });
  },

  closeMenu: () => {
    set({ isOpen: false, track: null, tracks: undefined });
  }
}));
