import { create } from 'zustand';
import type { SettingsState } from '../types';
import { loadSettings, saveSettings } from '../services/storage';
import { EQ_PRESETS } from '../utils/constants';

const SETTINGS_LOCAL_KEY = 'wavecraft_settings_v1';

export type VisualizerStyleOption =
  | 'bars'
  | 'wave'
  | 'blob'
  | 'circular'
  | 'particles'
  | 'nebula'
  | 'starfield';

interface SettingsStore extends SettingsState {
  crossfade: number;
  eqPreset: string;
  eqBands: number[];
  loudnessNormalization: boolean;
  offlineModeOnly: boolean;
  performanceProfile: 'ultra' | 'balanced' | 'performance';
  loadFromStorage: () => Promise<void>;
  setTheme: (theme: 'dark' | 'light' | 'auto') => void;
  setAccentColor: (color: string) => void;
  setCrossfade: (duration: number) => void;
  setAudioQuality: (quality: 'auto' | 'high' | 'medium' | 'low') => void;
  toggleVisualizer: () => void;
  setShowVisualizer: (show: boolean) => void;
  setVisualizerStyle: (style: VisualizerStyleOption) => void;
  setEqualizerPreset: (preset: string) => void;
  setEqPreset: (preset: string) => void;
  setEqualizerBands: (bands: number[]) => void;
  toggleAutoplay: () => void;
  setAutoplay: (val: boolean) => void;
  toggleLyrics: () => void;
  setShowLyrics: (show: boolean) => void;
  setLanguage: (lang: string) => void;
  setDynamicAmbientGlow: (enabled: boolean) => void;
  setAmbientGlowIntensity: (intensity: 'subtle' | 'vibrant' | 'aurora') => void;
  setLoudnessNormalization: (enabled: boolean) => void;
  toggleLoudnessNormalization: () => void;
  setOfflineModeOnly: (enabled: boolean) => void;
  toggleOfflineModeOnly: () => void;
  setPerformanceProfile: (profile: 'ultra' | 'balanced' | 'performance') => void;
  setAiApiProvider: (provider: 'none' | 'gemini' | 'openai') => void;
  setAiApiKey: (key: string) => void;
  setAutoMixerFilterSweeps: (enabled: boolean) => void;
  toggleAutoMixerFilterSweeps: () => void;
  resetSettings: () => void;
}

const defaultSettings: SettingsState = {
  theme: 'dark',
  accentColor: '#fa2d48',
  dynamicAmbientGlow: true,
  ambientGlowIntensity: 'vibrant',
  crossfadeDuration: 0,
  audioQuality: 'high',
  showVisualizer: true,
  visualizerStyle: 'nebula',
  equalizerPreset: 'Flat',
  equalizerBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  autoplay: true,
  showLyrics: false,
  language: 'en',
  loudnessNormalization: true,
  offlineModeOnly: false,
  performanceProfile: 'ultra',
  aiApiProvider: 'none',
  aiApiKey: '',
  autoMixerFilterSweeps: true
};

/**
 * Extracts only plain JSON-serializable settings properties (stripping store functions)
 * so IndexedDB's structured clone algorithm never throws DataCloneError.
 */
function extractSerializableSettings(state: SettingsState): SettingsState {
  return {
    theme: state.theme,
    accentColor: state.accentColor,
    crossfadeDuration: state.crossfadeDuration,
    audioQuality: state.audioQuality,
    showVisualizer: state.showVisualizer,
    visualizerStyle: state.visualizerStyle,
    equalizerPreset: state.equalizerPreset,
    equalizerBands: Array.isArray(state.equalizerBands)
      ? [...state.equalizerBands]
      : [...defaultSettings.equalizerBands],
    autoplay: state.autoplay,
    showLyrics: state.showLyrics,
    language: state.language,
    dynamicAmbientGlow: state.dynamicAmbientGlow ?? true,
    ambientGlowIntensity: state.ambientGlowIntensity ?? 'vibrant',
    loudnessNormalization: state.loudnessNormalization ?? true,
    offlineModeOnly: state.offlineModeOnly ?? false,
    performanceProfile: state.performanceProfile ?? 'ultra',
    aiApiProvider: state.aiApiProvider ?? 'none',
    aiApiKey: state.aiApiKey ?? '',
    autoMixerFilterSweeps: state.autoMixerFilterSweeps ?? true
  };
}

function readInitialSettingsSync(): SettingsState {
  try {
    const raw = localStorage.getItem(SETTINGS_LOCAL_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<SettingsState>;
    const merged: SettingsState = {
      ...defaultSettings,
      ...parsed,
      equalizerBands:
        Array.isArray(parsed.equalizerBands) && parsed.equalizerBands.length === 10
          ? parsed.equalizerBands
          : [...defaultSettings.equalizerBands]
    };
    if (merged.accentColor && typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--color-accent', merged.accentColor);
    }
    return merged;
  } catch {
    return defaultSettings;
  }
}

let pendingSettingsState: SettingsState | null = null;
let settingsSaveTimer: ReturnType<typeof setTimeout> | null = null;

function flushSettings(): void {
  if (!pendingSettingsState) return;
  const clean = extractSerializableSettings(pendingSettingsState);
  pendingSettingsState = null;
  if (settingsSaveTimer) {
    clearTimeout(settingsSaveTimer);
    settingsSaveTimer = null;
  }
  try {
    localStorage.setItem(SETTINGS_LOCAL_KEY, JSON.stringify(clean));
  } catch {}
  saveSettings(clean);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushSettings);
}

function persistSettings(state: SettingsState): void {
  pendingSettingsState = state;
  if (settingsSaveTimer) clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(flushSettings, 120);
}

const initialSyncSettings = readInitialSettingsSync();

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...initialSyncSettings,
  crossfade: initialSyncSettings.crossfadeDuration ?? 0,
  eqPreset: initialSyncSettings.equalizerPreset ?? 'Flat',
  eqBands: initialSyncSettings.equalizerBands ?? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],

  loadFromStorage: async () => {
    // Prefer localStorage if already present; fallback to IndexedDB if localStorage was empty
    const hasLocal = Boolean(localStorage.getItem(SETTINGS_LOCAL_KEY));
    const stored = await loadSettings();
    if (stored && !hasLocal) {
      const merged: SettingsState = {
        ...defaultSettings,
        ...(stored as Partial<SettingsState>),
        equalizerBands:
          Array.isArray(stored.equalizerBands) && stored.equalizerBands.length === 10
            ? stored.equalizerBands
            : [...defaultSettings.equalizerBands]
      };
      if (merged.accentColor) {
        document.documentElement.style.setProperty('--color-accent', merged.accentColor);
      }
      set({
        ...merged,
        crossfade: merged.crossfadeDuration ?? 0,
        eqPreset: merged.equalizerPreset ?? 'Flat',
        eqBands: merged.equalizerBands
      });
      try {
        localStorage.setItem(SETTINGS_LOCAL_KEY, JSON.stringify(extractSerializableSettings(merged)));
      } catch {}
    } else {
      const currentAccent = get().accentColor;
      if (currentAccent) {
        document.documentElement.style.setProperty('--color-accent', currentAccent);
      }
    }
  },

  setTheme: (theme) => {
    set({ theme });
    persistSettings(get());
  },

  setAccentColor: (color) => {
    document.documentElement.style.setProperty('--color-accent', color);
    set({ accentColor: color });
    persistSettings(get());
  },

  setCrossfade: (duration) => {
    set({ crossfadeDuration: duration, crossfade: duration });
    persistSettings(get());
  },

  setAudioQuality: (quality) => {
    set({ audioQuality: quality });
    persistSettings(get());
  },

  toggleVisualizer: () => {
    set((state) => ({ showVisualizer: !state.showVisualizer }));
    persistSettings(get());
  },

  setShowVisualizer: (show) => {
    set({ showVisualizer: show });
    persistSettings(get());
  },

  setVisualizerStyle: (style) => {
    set({ visualizerStyle: style });
    persistSettings(get());
  },

  setEqualizerPreset: (preset) => {
    const bands = EQ_PRESETS[preset] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    set({ equalizerPreset: preset, eqPreset: preset, equalizerBands: bands, eqBands: bands });
    persistSettings(get());
  },

  setEqPreset: (preset) => {
    const bands = EQ_PRESETS[preset] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    set({ equalizerPreset: preset, eqPreset: preset, equalizerBands: bands, eqBands: bands });
    persistSettings(get());
  },

  setEqualizerBands: (bands) => {
    set({ equalizerBands: bands, eqBands: bands, equalizerPreset: 'Custom', eqPreset: 'Custom' });
    persistSettings(get());
  },

  toggleAutoplay: () => {
    set((state) => ({ autoplay: !state.autoplay }));
    persistSettings(get());
  },

  setAutoplay: (val) => {
    set({ autoplay: val });
    persistSettings(get());
  },

  toggleLyrics: () => {
    set((state) => ({ showLyrics: !state.showLyrics }));
    persistSettings(get());
  },

  setShowLyrics: (show) => {
    set({ showLyrics: show });
    persistSettings(get());
  },

  setLanguage: (lang) => {
    set({ language: lang });
    persistSettings(get());
  },

  setDynamicAmbientGlow: (enabled: boolean) => {
    set({ dynamicAmbientGlow: enabled });
    persistSettings(get());
  },

  setAmbientGlowIntensity: (intensity: 'subtle' | 'vibrant' | 'aurora') => {
    set({ ambientGlowIntensity: intensity });
    persistSettings(get());
  },

  setLoudnessNormalization: (enabled: boolean) => {
    set({ loudnessNormalization: enabled });
    persistSettings(get());
  },

  toggleLoudnessNormalization: () => {
    set((state) => ({ loudnessNormalization: !state.loudnessNormalization }));
    persistSettings(get());
  },

  setOfflineModeOnly: (enabled: boolean) => {
    set({ offlineModeOnly: enabled });
    persistSettings(get());
  },

  toggleOfflineModeOnly: () => {
    set((state) => ({ offlineModeOnly: !state.offlineModeOnly }));
    persistSettings(get());
  },

  setPerformanceProfile: (profile: 'ultra' | 'balanced' | 'performance') => {
    set({ performanceProfile: profile });
    persistSettings(get());
  },

  setAiApiProvider: (provider) => {
    set({ aiApiProvider: provider });
    persistSettings(get());
  },

  setAiApiKey: (key) => {
    set({ aiApiKey: key });
    persistSettings(get());
  },

  setAutoMixerFilterSweeps: (enabled) => {
    set({ autoMixerFilterSweeps: enabled });
    persistSettings(get());
  },

  toggleAutoMixerFilterSweeps: () => {
    set((state) => ({ autoMixerFilterSweeps: !(state.autoMixerFilterSweeps ?? true) }));
    persistSettings(get());
  },

  resetSettings: () => {
    document.documentElement.style.setProperty('--color-accent', defaultSettings.accentColor);
    set({
      ...defaultSettings,
      crossfade: 0,
      eqPreset: 'Flat',
      eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      loudnessNormalization: true,
      offlineModeOnly: false,
      performanceProfile: 'ultra',
      aiApiProvider: 'none',
      aiApiKey: '',
      autoMixerFilterSweeps: true
    });
    persistSettings(defaultSettings);
  }
}));
