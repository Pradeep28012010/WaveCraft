import { create } from 'zustand';
import type { SettingsState, VisualizerStyle } from '../types';
import { loadSettings, saveSettings } from '../services/storage';
import { EQ_PRESETS } from '../utils/constants';

const SETTINGS_LOCAL_KEY = 'wavecraft_settings_v1';

export type VisualizerStyleOption = VisualizerStyle;

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
  setAutoMixerFilterSweeps: (enabled: boolean) => void;
  toggleAutoMixerFilterSweeps: () => void;
  setAutoCachePlayingTracks: (enabled: boolean) => void;
  toggleAutoCachePlayingTracks: () => void;
  setPrecacheNextTrack: (enabled: boolean) => void;
  setMaxCacheSizeMb: (sizeMb: number) => void;
  setBassBoostStrength: (val: number) => void;
  setSpatialStereoWidth: (val: number) => void;
  setGaplessPlayback: (enabled: boolean) => void;
  setStreamFallbackEngine: (enabled: boolean) => void;
  setHighResArtwork: (enabled: boolean) => void;
  setLyricsAutoScroll: (enabled: boolean) => void;
  setLyricsFontSize: (size: 'compact' | 'normal' | 'large' | 'massive') => void;
  setLyricsShowRomanization: (enabled: boolean) => void;
  setLyricsGlowSweep: (enabled: boolean) => void;
  setHapticFeedback: (enabled: boolean) => void;
  setKeepSearchHistory: (enabled: boolean) => void;
  setDoubleClickToPlay: (enabled: boolean) => void;
  setShowTrackNumbers: (enabled: boolean) => void;
  setCompactMiniPlayer: (enabled: boolean) => void;
  resetSettings: () => void;
}

const isMobileDevice =
  typeof window !== 'undefined' &&
  (window.innerWidth < 768 ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ));

const defaultSettings: SettingsState = {
  theme: 'dark',
  accentColor: '#fa2d48',
  dynamicAmbientGlow: true,
  ambientGlowIntensity: 'vibrant',
  crossfadeDuration: 0,
  audioQuality: 'high',
  showVisualizer: true,
  visualizerStyle: 'cyber-mesh',
  equalizerPreset: 'Flat',
  equalizerBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  autoplay: true,
  showLyrics: false,
  language: 'en',
  loudnessNormalization: true,
  offlineModeOnly: false,
  performanceProfile: isMobileDevice ? 'balanced' : 'ultra',
  autoMixerFilterSweeps: true,
  autoCachePlayingTracks: true,
  precacheNextTrack: true,
  maxCacheSizeMb: 1024,
  bassBoostStrength: 0,
  spatialStereoWidth: 100,
  gaplessPlayback: true,
  streamFallbackEngine: true,
  highResArtwork: true,
  lyricsAutoScroll: true,
  lyricsFontSize: 'normal',
  lyricsShowRomanization: true,
  lyricsGlowSweep: true,
  hapticFeedback: true,
  keepSearchHistory: true,
  doubleClickToPlay: false,
  showTrackNumbers: true,
  compactMiniPlayer: false
};

/**
 * Extracts only plain JSON-serializable settings properties (stripping store functions)
 * so IndexedDB's structured clone algorithm never throws DataCloneError.
 */
function extractSerializableSettings(state: SettingsState): SettingsState {
  return {
    theme: state.theme,
    accentColor: state.accentColor,
    crossfadeDuration:
      typeof state.crossfadeDuration === 'number'
        ? state.crossfadeDuration
        : typeof (state as any).crossfade === 'number'
          ? (state as any).crossfade
          : 0,
    audioQuality: state.audioQuality,
    showVisualizer: state.showVisualizer,
    visualizerStyle: state.visualizerStyle,
    equalizerPreset: state.equalizerPreset || (state as any).eqPreset || 'Flat',
    equalizerBands: Array.isArray(state.equalizerBands)
      ? [...state.equalizerBands]
      : Array.isArray((state as any).eqBands)
        ? [...(state as any).eqBands]
        : [...defaultSettings.equalizerBands],
    autoplay: state.autoplay,
    showLyrics: state.showLyrics,
    language: state.language,
    dynamicAmbientGlow: state.dynamicAmbientGlow ?? true,
    ambientGlowIntensity: state.ambientGlowIntensity ?? 'vibrant',
    loudnessNormalization: state.loudnessNormalization ?? true,
    offlineModeOnly: state.offlineModeOnly ?? false,
    performanceProfile: state.performanceProfile ?? 'ultra',
    autoMixerFilterSweeps: state.autoMixerFilterSweeps ?? true,
    autoCachePlayingTracks: state.autoCachePlayingTracks ?? true,
    precacheNextTrack: state.precacheNextTrack ?? true,
    maxCacheSizeMb: typeof state.maxCacheSizeMb === 'number' ? state.maxCacheSizeMb : 1024,
    bassBoostStrength: typeof state.bassBoostStrength === 'number' ? state.bassBoostStrength : 0,
    spatialStereoWidth: typeof state.spatialStereoWidth === 'number' ? state.spatialStereoWidth : 100,
    gaplessPlayback: state.gaplessPlayback ?? true,
    streamFallbackEngine: state.streamFallbackEngine ?? true,
    highResArtwork: state.highResArtwork ?? true,
    lyricsAutoScroll: state.lyricsAutoScroll ?? true,
    lyricsFontSize: state.lyricsFontSize ?? 'normal',
    lyricsShowRomanization: state.lyricsShowRomanization ?? true,
    lyricsGlowSweep: state.lyricsGlowSweep ?? true,
    hapticFeedback: state.hapticFeedback ?? true,
    keepSearchHistory: state.keepSearchHistory ?? true,
    doubleClickToPlay: state.doubleClickToPlay ?? false,
    showTrackNumbers: state.showTrackNumbers ?? true,
    compactMiniPlayer: state.compactMiniPlayer ?? false
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

  setAutoMixerFilterSweeps: (enabled) => {
    set({ autoMixerFilterSweeps: enabled });
    persistSettings(get());
  },

  toggleAutoMixerFilterSweeps: () => {
    set((state) => ({ autoMixerFilterSweeps: !(state.autoMixerFilterSweeps ?? true) }));
    persistSettings(get());
  },

  setAutoCachePlayingTracks: (enabled: boolean) => {
    set({ autoCachePlayingTracks: enabled });
    persistSettings(get());
  },

  toggleAutoCachePlayingTracks: () => {
    set((state) => ({ autoCachePlayingTracks: !(state.autoCachePlayingTracks ?? true) }));
    persistSettings(get());
  },

  setPrecacheNextTrack: (enabled: boolean) => {
    set({ precacheNextTrack: enabled });
    persistSettings(get());
  },

  setMaxCacheSizeMb: (sizeMb: number) => {
    set({ maxCacheSizeMb: Math.max(0, sizeMb) });
    persistSettings(get());
  },

  setBassBoostStrength: (val: number) => {
    set({ bassBoostStrength: Math.max(0, Math.min(100, val)) });
    persistSettings(get());
  },

  setSpatialStereoWidth: (val: number) => {
    set({ spatialStereoWidth: Math.max(100, Math.min(200, val)) });
    persistSettings(get());
  },

  setGaplessPlayback: (enabled: boolean) => {
    set({ gaplessPlayback: enabled });
    persistSettings(get());
  },

  setStreamFallbackEngine: (enabled: boolean) => {
    set({ streamFallbackEngine: enabled });
    persistSettings(get());
  },

  setHighResArtwork: (enabled: boolean) => {
    set({ highResArtwork: enabled });
    persistSettings(get());
  },

  setLyricsAutoScroll: (enabled: boolean) => {
    set({ lyricsAutoScroll: enabled });
    persistSettings(get());
  },

  setLyricsFontSize: (size: 'compact' | 'normal' | 'large' | 'massive') => {
    set({ lyricsFontSize: size });
    persistSettings(get());
  },

  setLyricsShowRomanization: (enabled: boolean) => {
    set({ lyricsShowRomanization: enabled });
    persistSettings(get());
  },

  setLyricsGlowSweep: (enabled: boolean) => {
    set({ lyricsGlowSweep: enabled });
    persistSettings(get());
  },

  setHapticFeedback: (enabled: boolean) => {
    set({ hapticFeedback: enabled });
    persistSettings(get());
  },

  setKeepSearchHistory: (enabled: boolean) => {
    set({ keepSearchHistory: enabled });
    persistSettings(get());
  },

  setDoubleClickToPlay: (enabled: boolean) => {
    set({ doubleClickToPlay: enabled });
    persistSettings(get());
  },

  setShowTrackNumbers: (enabled: boolean) => {
    set({ showTrackNumbers: enabled });
    persistSettings(get());
  },

  setCompactMiniPlayer: (enabled: boolean) => {
    set({ compactMiniPlayer: enabled });
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
      autoMixerFilterSweeps: true,
      autoCachePlayingTracks: true,
      precacheNextTrack: true,
      maxCacheSizeMb: 1024,
      bassBoostStrength: 0,
      spatialStereoWidth: 100,
      gaplessPlayback: true,
      streamFallbackEngine: true,
      highResArtwork: true,
      lyricsAutoScroll: true,
      lyricsFontSize: 'normal',
      lyricsShowRomanization: true,
      lyricsGlowSweep: true,
      hapticFeedback: true,
      keepSearchHistory: true,
      doubleClickToPlay: false,
      showTrackNumbers: true,
      compactMiniPlayer: false
    });
    persistSettings(defaultSettings);
  }
}));
