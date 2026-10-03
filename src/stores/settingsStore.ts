import { create } from 'zustand';
import type { SettingsState } from '../types';
import { loadSettings, saveSettings } from '../services/storage';
import { EQ_PRESETS } from '../utils/constants';

interface SettingsStore extends SettingsState {
  crossfade: number;
  eqPreset: string;
  eqBands: number[];
  loadFromStorage: () => Promise<void>;
  setTheme: (theme: 'dark' | 'light' | 'auto') => void;
  setAccentColor: (color: string) => void;
  setCrossfade: (duration: number) => void;
  setAudioQuality: (quality: 'auto' | 'high' | 'medium' | 'low') => void;
  toggleVisualizer: () => void;
  setShowVisualizer: (show: boolean) => void;
  setVisualizerStyle: (style: 'bars' | 'wave' | 'blob' | 'circular' | 'particles') => void;
  setEqualizerPreset: (preset: string) => void;
  setEqPreset: (preset: string) => void;
  setEqualizerBands: (bands: number[]) => void;
  toggleAutoplay: () => void;
  setAutoplay: (val: boolean) => void;
  toggleLyrics: () => void;
  setLanguage: (lang: string) => void;
  resetSettings: () => void;
}

const defaultSettings: SettingsState = {
  theme: 'dark',
  accentColor: '#fa2d48',
  crossfadeDuration: 0,
  audioQuality: 'high',
  showVisualizer: true,
  visualizerStyle: 'blob',
  equalizerPreset: 'Flat',
  equalizerBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  autoplay: true,
  showLyrics: false,
  language: 'en'
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...defaultSettings,
  crossfade: 0,
  eqPreset: 'Flat',
  eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],

  loadFromStorage: async () => {
    const stored = await loadSettings();
    if (stored) {
      if (stored.accentColor) {
        document.documentElement.style.setProperty('--color-accent', stored.accentColor);
      }
      set({
        ...(stored as SettingsState),
        crossfade: stored.crossfadeDuration ?? 0,
        eqPreset: stored.equalizerPreset ?? 'Flat',
        eqBands: stored.equalizerBands ?? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      });
    }
  },

  setTheme: (theme) => {
    set({ theme });
    saveSettings(get());
  },

  setAccentColor: (color) => {
    document.documentElement.style.setProperty('--color-accent', color);
    set({ accentColor: color });
    saveSettings(get());
  },

  setCrossfade: (duration) => {
    set({ crossfadeDuration: duration, crossfade: duration });
    saveSettings(get());
  },

  setAudioQuality: (quality) => {
    set({ audioQuality: quality });
    saveSettings(get());
  },

  toggleVisualizer: () => {
    set((state) => ({ showVisualizer: !state.showVisualizer }));
    saveSettings(get());
  },

  setShowVisualizer: (show) => {
    set({ showVisualizer: show });
    saveSettings(get());
  },

  setVisualizerStyle: (style) => {
    set({ visualizerStyle: style });
    saveSettings(get());
  },

  setEqualizerPreset: (preset) => {
    const bands = EQ_PRESETS[preset] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    set({ equalizerPreset: preset, eqPreset: preset, equalizerBands: bands, eqBands: bands });
    saveSettings(get());
  },

  setEqPreset: (preset) => {
    const bands = EQ_PRESETS[preset] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    set({ equalizerPreset: preset, eqPreset: preset, equalizerBands: bands, eqBands: bands });
    saveSettings(get());
  },

  setEqualizerBands: (bands) => {
    set({ equalizerBands: bands, eqBands: bands });
    saveSettings(get());
  },

  toggleAutoplay: () => {
    set((state) => ({ autoplay: !state.autoplay }));
    saveSettings(get());
  },

  setAutoplay: (val) => {
    set({ autoplay: val });
    saveSettings(get());
  },

  toggleLyrics: () => {
    set((state) => ({ showLyrics: !state.showLyrics }));
    saveSettings(get());
  },

  setLanguage: (lang) => {
    set({ language: lang });
    saveSettings(get());
  },

  resetSettings: () => {
    document.documentElement.style.setProperty('--color-accent', defaultSettings.accentColor);
    set({
      ...defaultSettings,
      crossfade: 0,
      eqPreset: 'Flat',
      eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    });
    saveSettings(defaultSettings);
  }
}));
