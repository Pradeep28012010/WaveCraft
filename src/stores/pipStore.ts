import { create } from 'zustand';
import {
  isDocumentPiPSupported,
  requestDocumentPiP,
  closeDocumentPiP
} from '../services/pipManager';

export type PipMode = 'document' | 'floating' | 'closed';
export type ScriptPreference = 'auto' | 'romanized' | 'native';

interface PipState {
  isOpen: boolean;
  mode: PipMode;
  pipWindow: Window | null;
  activeTab: 'lyrics' | 'player';
  isSyllableSweep: boolean;
  scriptPreference: ScriptPreference;
  canDocumentPiP: boolean;

  openPiP: (preferDocument?: boolean) => Promise<void>;
  closePiP: () => void;
  togglePiP: () => Promise<void>;
  setActiveTab: (tab: 'lyrics' | 'player') => void;
  toggleSyllableSweep: () => void;
  setScriptPreference: (pref: ScriptPreference) => void;
}

export const usePipStore = create<PipState>((set, get) => ({
  isOpen: false,
  mode: 'closed',
  pipWindow: null,
  activeTab: 'lyrics',
  isSyllableSweep: true,
  scriptPreference: 'auto',
  canDocumentPiP: isDocumentPiPSupported(),

  openPiP: async (preferDocument = true) => {
    // If already open in desired mode, do nothing
    if (get().isOpen) return;

    if (preferDocument && isDocumentPiPSupported()) {
      try {
        const win = await requestDocumentPiP(
          { width: 440, height: 540, title: 'WaveCraft • Floating Lyrics' },
          () => {
            // When user closes native PiP window using the OS 'X' button
            set({ isOpen: false, mode: 'closed', pipWindow: null });
          }
        );

        if (win) {
          set({
            isOpen: true,
            mode: 'document',
            pipWindow: win
          });
          return;
        }
      } catch (err) {
        console.warn('[PiP] Document PiP failed, falling back to in-app floating overlay:', err);
      }
    }

    // Fallback to in-app draggable liquid-glass overlay
    set({
      isOpen: true,
      mode: 'floating',
      pipWindow: null
    });
  },

  closePiP: () => {
    closeDocumentPiP();
    set({
      isOpen: false,
      mode: 'closed',
      pipWindow: null
    });
  },

  togglePiP: async () => {
    if (get().isOpen) {
      get().closePiP();
    } else {
      await get().openPiP(true);
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  toggleSyllableSweep: () =>
    set((state) => ({ isSyllableSweep: !state.isSyllableSweep })),

  setScriptPreference: (pref) => set({ scriptPreference: pref })
}));
