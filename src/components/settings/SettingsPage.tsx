import React, { useState, useEffect, useCallback } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useFeedbackStore } from '../../stores/feedbackStore';
import { useUpdateStore } from '../../stores/updateStore';
import { isAndroidNative, triggerAndroidHaptic } from '../../services/nativeAndroid';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { clearAllData } from '../../services/storage';
import { useOfflineVault } from '../../services/offlineVault';
import { getSearchHistory, clearSearchHistory } from '../../utils/searchHistory';
import GlassButton from '../ui/GlassButton';
import GlassSelect from '../ui/GlassSelect';
import { EQ_PRESETS } from '../../utils/constants';
import { resetAutoMixerFilters } from '../../services/audioEngine';
import type {
  AudioQuality,
  AmbientGlowIntensity,
  VisualizerStyle,
  PerformanceProfile
} from '../../types';

// ============================================================================
// APPLE-INSPIRED TACTILE TOGGLE SWITCH
// ============================================================================
function AppleToggle({
  checked,
  onChange,
  disabled = false
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        triggerAndroidHaptic('light');
        onChange(!checked);
      }}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-250 ease-in-out focus:outline-none disabled:opacity-40 ${
        checked
          ? 'bg-[var(--color-accent)] shadow-[0_0_12px_rgba(250,45,72,0.35)]'
          : 'bg-white/15 hover:bg-white/20'
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-250 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ============================================================================
// INSET GROUPED SETTING ROW
// ============================================================================
function InsetSettingRow({
  icon,
  iconBg = 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  label,
  description,
  children
}: {
  icon?: React.ReactNode;
  iconBg?: string;
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3.5 px-3 sm:px-4 border-b border-white/[0.06] last:border-0 gap-3 sm:gap-4 hover:bg-white/[0.02] transition-colors rounded-xl">
      <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
        {icon && (
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center border flex-shrink-0 mt-0.5 sm:mt-0 ${iconBg}`}>
            {icon}
          </div>
        )}
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-white font-semibold text-sm leading-snug tracking-tight">{label}</span>
          {description && (
            <span className="text-xs text-white/50 mt-0.5 leading-relaxed">{description}</span>
          )}
        </div>
      </div>
      <div className="flex-shrink-0 w-full sm:w-auto flex justify-start sm:justify-end pl-11 sm:pl-0">
        {children}
      </div>
    </div>
  );
}

const BAND_LABELS = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];

type SettingsCategory =
  | 'all'
  | 'eq'
  | 'streaming'
  | 'appearance'
  | 'lyrics'
  | 'controls'
  | 'storage'
  | 'about';

export default function SettingsPage() {
  const settings = useSettingsStore();
  const library = useLibraryStore();
  const openFeedback = useFeedbackStore((s) => s.openFeedback);
  const {
    currentVersion,
    checkForUpdates,
    status: updateStatus,
    openModal: openUpdateModal,
    hasUpdate
  } = useUpdateStore();
  const isNative = isAndroidNative();
  const { isInstalled } = usePWAInstall();

  // Active Category & Live Search Filter
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Search History Count
  const [searchHistoryCount, setSearchHistoryCount] = useState(() => getSearchHistory().length);

  useEffect(() => {
    const handleHistoryUpdate = () => {
      setSearchHistoryCount(getSearchHistory().length);
    };
    window.addEventListener('wavecraft_search_history_updated', handleHistoryUpdate);
    return () => window.removeEventListener('wavecraft_search_history_updated', handleHistoryUpdate);
  }, []);

  const handleClearHistory = () => {
    clearSearchHistory();
    setSearchHistoryCount(0);
    triggerAndroidHaptic('medium');
  };

  // Equalizer Vertical Sliders Drag Handler
  const handleBandChange = (index: number, newDb: number) => {
    const clamped = Math.round(Math.max(-12, Math.min(12, newDb)));
    const nextBands = [...(settings.equalizerBands || Array(10).fill(0))];
    nextBands[index] = clamped;
    settings.setEqualizerBands(nextBands);
  };

  const handleVerticalDrag = (
    index: number,
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const updateFromClientY = (clientY: number) => {
      const relY = Math.max(0, Math.min(rect.height, clientY - rect.top));
      const ratio = 1 - relY / rect.height; // 1 at top (+12dB), 0 at bottom (-12dB)
      const db = ratio * 24 - 12;
      handleBandChange(index, db);
    };

    const initialY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : e.clientY;
    updateFromClientY(initialY);

    if ('touches' in e) {
      const onTouchMove = (moveEvt: TouchEvent) => {
        if (moveEvt.touches[0]) updateFromClientY(moveEvt.touches[0].clientY);
      };
      const onTouchEnd = () => {
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
      };
      window.addEventListener('touchmove', onTouchMove, { passive: true });
      window.addEventListener('touchend', onTouchEnd);
    } else {
      const onMove = (moveEvent: MouseEvent) => updateFromClientY(moveEvent.clientY);
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
  };

  // Export & Reset
  const handleExport = () => {
    const payload = {
      likedSongs: library.likedSongs,
      playlists: library.playlists,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wavecraft-library-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearData = async () => {
    if (
      window.confirm(
        'Reset everything and restore WaveCraft to a clean initial state? This clears your library, queue, search history, and settings.'
      )
    ) {
      await clearAllData();
      settings.resetSettings();
      const pStore = usePlayerStore.getState();
      pStore.clearQueue();
      pStore.pause();
      usePlayerStore.setState({ currentTrack: null, progress: 0, currentTime: 0, duration: 0 });
      await library.loadFromStorage();
      window.location.reload();
    }
  };

  const presetOptions = Object.keys(EQ_PRESETS).map((k) => ({ value: k, label: k }));

  const { offlineTracks, toggleOfflineTrack, removeTrackOffline } = useOfflineVault();
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

  const handleDownloadAllLiked = async () => {
    if (isBulkDownloading || library.likedSongs.length === 0) return;
    const unCached = library.likedSongs.filter(
      (t) => !offlineTracks.some((ot) => ot.id === t.id)
    );
    if (unCached.length === 0) {
      alert('All liked songs are already saved in the Offline Vault!');
      return;
    }
    setIsBulkDownloading(true);
    setBulkProgress({ current: 0, total: unCached.length });
    for (let i = 0; i < unCached.length; i++) {
      await toggleOfflineTrack(unCached[i]);
      setBulkProgress({ current: i + 1, total: unCached.length });
    }
    setIsBulkDownloading(false);
  };

  const handleClearOfflineVault = async () => {
    if (!window.confirm(`Remove all ${offlineTracks.length} tracks from Offline Vault?`)) return;
    for (const t of offlineTracks) {
      await removeTrackOffline(t.id);
    }
  };

  // Filter Helper for Sections
  const matchesSearch = useCallback(
    (keywords: string[]) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return keywords.some((k) => k.toLowerCase().includes(q));
    },
    [searchQuery]
  );

  const shouldShowSection = (category: SettingsCategory, keywords: string[]) => {
    if (activeCategory !== 'all' && activeCategory !== category) return false;
    return matchesSearch(keywords);
  };

  return (
    <div className="w-full max-w-4xl mx-auto pt-4 pb-48 sm:pb-32 px-3 sm:px-6 flex flex-col gap-6 text-white select-none">
      {/* ===================================================================== */}
      {/* HERO HEADER & SEARCH BAR                                              */}
      {/* ===================================================================== */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
            <span>Settings & Station</span>
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/40 text-[var(--color-accent)]">
              Pro Studio
            </span>
          </h1>
          <p className="text-xs text-white/50 mt-1">
            Fine-tune Web Audio DSP acoustics, gapless streaming, liquid glass visuals, lyrics & cache
          </p>
        </div>

        {/* Real-time Settings Search Bar */}
        <div className="relative w-full">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search all settings (e.g., crossfade, eq, cache, lyrics, haptics, quality)..."
            className="w-full px-4 py-3 pl-11 pr-10 rounded-2xl bg-white/[0.06] hover:bg-white/[0.09] focus:bg-white/[0.12] border border-white/15 focus:border-[var(--color-accent)] text-white text-xs sm:text-sm outline-none transition-all placeholder:text-white/40 shadow-inner"
          />
          <svg className="w-4 h-4 absolute left-4 top-3.5 text-white/40 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-3 text-white/50 hover:text-white text-xs p-1"
            >
              ✕
            </button>
          )}
        </div>

        {/* Quick Category Filter Pills */}
        <div
          className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {[
            { id: 'all', label: 'All Settings' },
            { id: 'eq', label: '10-Band EQ & DSP' },
            { id: 'streaming', label: 'Audio & Playback' },
            { id: 'appearance', label: 'Liquid Glass' },
            { id: 'lyrics', label: 'Live Lyrics' },
            { id: 'controls', label: 'Gestures & Haptics' },
            { id: 'storage', label: 'Storage & Vault' },
            { id: 'about', label: 'Updates & About' }
          ].map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  triggerAndroidHaptic('light');
                  setActiveCategory(cat.id as SettingsCategory);
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[var(--color-accent)] text-white shadow-md shadow-[var(--color-accent)]/30'
                    : 'glass text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 1. 10-BAND REAL-TIME STUDIO EQUALIZER & DSP                           */}
      {/* ===================================================================== */}
      {shouldShowSection('eq', ['equalizer', 'eq', 'bands', 'bass', 'treble', 'stereo', 'presets', 'spatial', 'dsp']) && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>🎛️ 10-Band Real-Time Studio Equalizer</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  32Hz - 16kHz
                </span>
              </h2>
              <p className="text-xs text-white/50">
                Touch and drag vertical frequency faders (-12dB to +12dB) or choose audiophile presets
              </p>
            </div>

            <div className="flex items-center gap-2">
              <GlassSelect
                value={settings.eqPreset || 'Flat'}
                options={presetOptions}
                onChange={(preset) => settings.setEqPreset(preset)}
              />
              <GlassButton size="sm" onClick={() => settings.setEqPreset('Flat')}>
                Reset
              </GlassButton>
            </div>
          </div>

          {/* Preset Pills */}
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(EQ_PRESETS).map((presetName) => {
              const active = (settings.eqPreset || 'Flat') === presetName;
              return (
                <button
                  key={presetName}
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    settings.setEqPreset(presetName);
                  }}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-[var(--color-accent)] text-white shadow-md'
                      : 'glass text-white/65 hover:text-white'
                  }`}
                >
                  {presetName}
                </button>
              );
            })}
          </div>

          {/* Equalizer Visual Fader Rack */}
          <div
            className="rounded-[22px] border border-white/15 glass-bloom-menu p-4 overflow-x-auto no-scrollbar shadow-lg"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <div className="flex justify-between gap-1 sm:gap-3 min-w-[340px] sm:min-w-[540px] h-52 items-center pt-2 pb-1 px-1">
              {(settings.equalizerBands || Array(10).fill(0)).map((val, idx) => {
                const pct = ((val + 12) / 24) * 100;
                return (
                  <div key={idx} className="flex flex-col items-center gap-2 flex-1 h-full select-none min-w-0">
                    <span
                      className={`text-[10px] font-bold tabular-nums truncate ${
                        val > 0 ? 'text-[var(--color-accent)]' : val < 0 ? 'text-sky-400' : 'text-white/50'
                      }`}
                    >
                      {val > 0 ? `+${val}` : val}dB
                    </span>

                    <div
                      onMouseDown={(e) => handleVerticalDrag(idx, e)}
                      onTouchStart={(e) => handleVerticalDrag(idx, e)}
                      className="relative w-6 sm:w-8 flex-1 bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 rounded-full cursor-ns-resize flex justify-center overflow-hidden touch-none"
                    >
                      <div className="absolute left-0 right-0 top-1/2 h-px bg-white/20 pointer-events-none" />
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[var(--color-accent)]/80 to-purple-500/80 pointer-events-none transition-all duration-75"
                        style={{ height: `${pct}%` }}
                      />
                      <div
                        className="absolute w-5 h-5 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.6)] border-2 border-[var(--color-accent)] pointer-events-none transition-all duration-75"
                        style={{ bottom: `calc(${pct}% - 10px)` }}
                      />
                    </div>

                    <span className="text-[10px] sm:text-[11px] text-white/60 font-semibold">{BAND_LABELS[idx]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Extra Acoustic DSP Punch & Spatial Controls */}
          <div className="rounded-[22px] border border-white/15 glass-bloom-menu p-3 sm:p-4 flex flex-col gap-1 shadow-md">
            <InsetSettingRow
              icon={<span className="text-sm">💥</span>}
              iconBg="bg-rose-500/20 text-rose-300 border-rose-500/30"
              label="Sub-Bass Acoustic Punch"
              description="Low-frequency saturation harmonic enhancement for headphones and soundbars"
            >
              <div className="flex items-center gap-3 w-48 justify-end">
                <span className="text-xs font-bold text-white/80 tabular-nums w-10 text-right">
                  {settings.bassBoostStrength ?? 0}%
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.bassBoostStrength ?? 0}
                  onChange={(e) => settings.setBassBoostStrength(Number(e.target.value))}
                  className="w-32 accent-[var(--color-accent)] cursor-pointer"
                />
              </div>
            </InsetSettingRow>

            <InsetSettingRow
              icon={<span className="text-sm">🎧</span>}
              iconBg="bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
              label="3D Binaural Stereo Expansion"
              description="Expands the acoustic stage width from standard stereo (100%) to panoramic immersion (200%)"
            >
              <div className="flex items-center gap-3 w-48 justify-end">
                <span className="text-xs font-bold text-white/80 tabular-nums w-10 text-right">
                  {settings.spatialStereoWidth ?? 100}%
                </span>
                <input
                  type="range"
                  min="100"
                  max="200"
                  value={settings.spatialStereoWidth ?? 100}
                  onChange={(e) => settings.setSpatialStereoWidth(Number(e.target.value))}
                  className="w-32 accent-[var(--color-accent)] cursor-pointer"
                />
              </div>
            </InsetSettingRow>
          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* 2. AUDIO STREAMING & FLOW STATE                                       */}
      {/* ===================================================================== */}
      {shouldShowSection('streaming', ['audio', 'streaming', 'quality', 'crossfade', 'gapless', 'loudness', 'normalize', 'autoplay', 'offline', 'sweeps', 'fallback']) && (
        <section className="flex flex-col gap-3">
          <div className="px-1">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🌊 Audio Streaming & Flow State</span>
            </h2>
            <p className="text-xs text-white/50">
              High-definition bitrates, seamless crossfades, and automatic loudness leveling
            </p>
          </div>

          <div className="rounded-[22px] border border-white/15 glass-bloom-menu p-3 sm:p-4 flex flex-col gap-1 shadow-md">
            <InsetSettingRow
              icon={<span className="text-sm">⚡</span>}
              iconBg="bg-blue-500/20 text-blue-300 border-blue-500/30"
              label="Streaming Audio Quality"
              description="High-definition 320kbps direct stream resolution with adaptive bitrate recovery"
            >
              <GlassSelect
                value={settings.audioQuality || 'high'}
                onChange={(val) => settings.setAudioQuality(val as AudioQuality)}
                options={[
                  { value: 'high', label: '320kbps Studio HD' },
                  { value: 'auto', label: 'Auto Adaptive' },
                  { value: 'medium', label: '160kbps High' },
                  { value: 'low', label: '96kbps Data Saver' }
                ]}
              />
            </InsetSettingRow>

            <InsetSettingRow
              icon={<span className="text-sm">🔀</span>}
              iconBg="bg-orange-500/20 text-orange-300 border-orange-500/30"
              label="Smooth Audio Crossfade"
              description={
                settings.crossfadeDuration > 0
                  ? `${settings.crossfadeDuration}s seamless acoustic overlap between songs`
                  : 'Off (Instant gapless preloaded transition)'
              }
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-white/80 tabular-nums w-8 text-right">
                  {settings.crossfadeDuration}s
                </span>
                <input
                  type="range"
                  min="0"
                  max="12"
                  value={settings.crossfadeDuration}
                  onChange={(e) => settings.setCrossfade(Number(e.target.value))}
                  className="w-28 sm:w-36 accent-[var(--color-accent)] cursor-pointer"
                />
              </div>
            </InsetSettingRow>

            <InsetSettingRow
              icon={<span className="text-sm">♾️</span>}
              iconBg="bg-purple-500/20 text-purple-300 border-purple-500/30"
              label="Endless Flow Autoplay"
              description="Continuously appends matching acoustic recommendations when the queue finishes"
            >
              <AppleToggle checked={settings.autoplay} onChange={settings.setAutoplay} />
            </InsetSettingRow>

            <InsetSettingRow
              icon={<span className="text-sm">🔊</span>}
              iconBg="bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
              label="Audiophile Loudness Normalization"
              description="ReplayGain automatic leveling and transparent -2dBFS limiter to eliminate abrupt volume jumps"
            >
              <AppleToggle
                checked={settings.loudnessNormalization ?? true}
                onChange={settings.setLoudnessNormalization}
              />
            </InsetSettingRow>

            <InsetSettingRow
              icon={<span className="text-sm">⚡</span>}
              iconBg="bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
              label="Zero-Gap Preloading"
              description="Buffers the upcoming track in background memory for instant 0ms track transitions"
            >
              <AppleToggle
                checked={settings.gaplessPlayback ?? true}
                onChange={settings.setGaplessPlayback}
              />
            </InsetSettingRow>

            <InsetSettingRow
              icon={<span className="text-sm">🎛️</span>}
              iconBg="bg-amber-500/20 text-amber-300 border-amber-500/30"
              label="Frequency-Carved DJ Sweeps"
              description="Gentle low-pass sweeps on outgoing tracks and high-frequency tilts on incoming tracks"
            >
              <AppleToggle
                checked={settings.autoMixerFilterSweeps ?? true}
                onChange={(val) => {
                  settings.setAutoMixerFilterSweeps(val);
                  if (!val) {
                    try {
                      resetAutoMixerFilters();
                    } catch {}
                  }
                }}
              />
            </InsetSettingRow>

            <InsetSettingRow
              icon={<span className="text-sm">🛡️</span>}
              iconBg="bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
              label="Resilient Stream Fallback Engine"
              description="Automatically fails over to alternative high-bitrate audio mirrors if a stream experiences network stalling"
            >
              <AppleToggle
                checked={settings.streamFallbackEngine ?? true}
                onChange={settings.setStreamFallbackEngine}
              />
            </InsetSettingRow>

            <InsetSettingRow
              icon={<span className="text-sm">📴</span>}
              iconBg="bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
              label="Offline Vault Mode Only"
              description="Plays exclusively from local IndexedDB storage, preventing network usage"
            >
              <AppleToggle
                checked={settings.offlineModeOnly ?? false}
                onChange={settings.setOfflineModeOnly}
              />
            </InsetSettingRow>
          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* 3. APPEARANCE, THEMES & LIQUID GLASS                                  */}
      {/* ===================================================================== */}
      {shouldShowSection('appearance', ['appearance', 'theme', 'color', 'glass', 'aura', 'ambient', 'visualizer', 'fps', 'profile', 'accent', 'miniplayer']) && (
        <section className="flex flex-col gap-3">
          <div className="px-1">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>✨ Appearance, Liquid Glass & Ambient Aura</span>
            </h2>
            <p className="text-xs text-white/50">
              Real-time album cover aura extraction, accent colors, and 3D visualizer styles
            </p>
          </div>

          <div className="rounded-[22px] border border-white/15 glass-bloom-menu p-3 sm:p-4 flex flex-col gap-1 shadow-md">
            <InsetSettingRow
              icon={<span className="text-sm">🌈</span>}
              iconBg="bg-pink-500/20 text-pink-300 border-pink-500/30"
              label="Dynamic Album Ambient Aura"
              description="Extracts and morphs background aurora mesh colors in real time from playing album art"
            >
              <AppleToggle
                checked={settings.dynamicAmbientGlow ?? true}
                onChange={settings.setDynamicAmbientGlow}
              />
            </InsetSettingRow>

            {(settings.dynamicAmbientGlow ?? true) && (
              <InsetSettingRow
                icon={<span className="text-sm">🔆</span>}
                iconBg="bg-amber-500/20 text-amber-300 border-amber-500/30"
                label="Ambient Aura Radiance"
                description="Controls atmospheric diffusion and brightness of the backdrop mesh"
              >
                <div className="flex gap-1.5">
                  {[
                    { id: 'subtle', label: 'Subtle' },
                    { id: 'vibrant', label: 'Radiant' },
                    { id: 'aurora', label: 'Aurora Mesh' }
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => settings.setAmbientGlowIntensity(item.id as AmbientGlowIntensity)}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                        (settings.ambientGlowIntensity ?? 'vibrant') === item.id
                          ? 'bg-[var(--color-accent)] text-white shadow-md'
                          : 'glass text-white/60 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </InsetSettingRow>
            )}

            <InsetSettingRow
              icon={<span className="text-sm">🎨</span>}
              iconBg="bg-rose-500/20 text-rose-300 border-rose-500/30"
              label="Base Accent Highlight Color"
              description="Personalizes buttons, badges, active tabs, and sliders across WaveCraft"
            >
              <div className="flex items-center gap-2">
                {[
                  { color: '#fa2d48', name: 'Crimson Pulse' },
                  { color: '#8b5cf6', name: 'Spatial Violet' },
                  { color: '#ec4899', name: 'Neon Rose' },
                  { color: '#3b82f6', name: 'Ocean Glass' },
                  { color: '#10b981', name: 'Emerald' },
                  { color: '#f59e0b', name: 'Sunset Gold' },
                  { color: '#06b6d4', name: 'Cyan Glow' }
                ].map((item) => (
                  <button
                    key={item.color}
                    type="button"
                    title={item.name}
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      settings.setAccentColor(item.color);
                    }}
                    className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                      settings.accentColor === item.color
                        ? 'border-white scale-125 shadow-lg'
                        : 'border-transparent hover:scale-110'
                    }`}
                    style={{ backgroundColor: item.color }}
                  />
                ))}
              </div>
            </InsetSettingRow>

            <InsetSettingRow
              icon={<span className="text-sm">🌟</span>}
              iconBg="bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
              label="Real-Time Audio Visualizer"
              description="Displays dynamic responsive canvas in Fullscreen Player"
            >
              <AppleToggle checked={settings.showVisualizer} onChange={settings.setShowVisualizer} />
            </InsetSettingRow>

            <InsetSettingRow
              icon={<span className="text-sm">🌌</span>}
              iconBg="bg-purple-500/20 text-purple-300 border-purple-500/30"
              label="Visualizer 3D Geometry Mode"
              description="Selects the mathematical particle and shader model"
            >
              <GlassSelect
                value={settings.visualizerStyle || 'nebula'}
                onChange={(val) => settings.setVisualizerStyle(val as VisualizerStyle)}
                options={[
                  { value: 'cyber-mesh', label: '3D Cyber Wave Mesh' },
                  { value: 'nebula', label: '3D Cosmic Nebula' },
                  { value: 'analog-vu', label: 'Vintage Analog VU Meter' },
                  { value: 'starfield', label: '3D Starfield Warp' },
                  { value: 'particles', label: 'Bioluminescent Orbs' },
                  { value: 'blob', label: 'Liquid Blob' },
                  { value: 'circular', label: 'Radial Halo' },
                  { value: 'bars', label: 'Spectrum Bars' },
                  { value: 'wave', label: 'Harmonic Wave' }
                ]}
              />
            </InsetSettingRow>

            <InsetSettingRow
              icon={<span className="text-sm">🚀</span>}
              iconBg="bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
              label="Liquid Glass FPS Profile"
              description="Adjusts backdrop filter passes, aurora nodes, and particle counts"
            >
              <div className="flex gap-1.5">
                {[
                  { id: 'ultra', label: 'Ultra 120fps' },
                  { id: 'balanced', label: 'Balanced 60fps' },
                  { id: 'performance', label: 'Battery Saver' }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      settings.setPerformanceProfile(item.id as PerformanceProfile);
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      (settings.performanceProfile ?? 'ultra') === item.id
                        ? 'bg-[var(--color-accent)] text-white shadow-md'
                        : 'glass text-white/60 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </InsetSettingRow>

            <InsetSettingRow
              icon={<span className="text-sm">🖼️</span>}
              iconBg="bg-blue-500/20 text-blue-300 border-blue-500/30"
              label="Ultra High-Res Artwork"
              description="Fetches lossless 1000x1000 iTunes/Spotify album covers where available"
            >
              <AppleToggle
                checked={settings.highResArtwork ?? true}
                onChange={settings.setHighResArtwork}
              />
            </InsetSettingRow>

            <InsetSettingRow
              icon={<span className="text-sm">🔢</span>}
              iconBg="bg-gray-500/20 text-gray-300 border-gray-500/30"
              label="Show Track Numbers in Lists"
              description="Displays ordinal track numbers in albums, playlists, and queues"
            >
              <AppleToggle
                checked={settings.showTrackNumbers ?? true}
                onChange={settings.setShowTrackNumbers}
              />
            </InsetSettingRow>
          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* 4. SYNCHRONIZED LYRICS & TYPOGRAPHY                                   */}
      {/* ===================================================================== */}
      {shouldShowSection('lyrics', ['lyrics', 'karaoke', 'romanize', 'transliterate', 'font', 'scroll', 'glow', 'syllable']) && (
        <section className="flex flex-col gap-3">
          <div className="px-1">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🎤 Live Synchronized Lyrics & Typography</span>
            </h2>
            <p className="text-xs text-white/50">
              Karaoke word-by-word timing, phonetics, auto-scrolling, and font sizing
            </p>
          </div>

          <div className="rounded-[22px] border border-white/15 glass-bloom-menu p-3 sm:p-4 flex flex-col gap-1 shadow-md">
            <InsetSettingRow
              icon={<span className="text-sm">📜</span>}
              iconBg="bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
              label="Live Lyrics Auto-Scroll"
              description="Automatically glides lyrics into the center of the viewport synchronously with vocal delivery"
            >
              <AppleToggle
                checked={settings.lyricsAutoScroll ?? true}
                onChange={settings.setLyricsAutoScroll}
              />
            </InsetSettingRow>

            <InsetSettingRow
              icon={<span className="text-sm">🔤</span>}
              iconBg="bg-purple-500/20 text-purple-300 border-purple-500/30"
              label="Lyrics Typography Scale"
              description="Adjusts the readable font size of karaoke lines"
            >
              <div className="flex gap-1.5">
                {[
                  { id: 'compact', label: 'Compact' },
                  { id: 'normal', label: 'Standard' },
                  { id: 'large', label: 'Large' },
                  { id: 'massive', label: 'Cinema' }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      settings.setLyricsFontSize(item.id as any);
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      (settings.lyricsFontSize ?? 'normal') === item.id
                        ? 'bg-[var(--color-accent)] text-white shadow-md'
                        : 'glass text-white/60 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </InsetSettingRow>

            <InsetSettingRow
              icon={<span className="text-sm">🌐</span>}
              iconBg="bg-blue-500/20 text-blue-300 border-blue-500/30"
              label="Automatic Romanized Transliteration"
              description="Generates English phonetic transliteration for Telugu, Hindi, Tamil, Malayalam, Korean, and Japanese songs"
            >
              <AppleToggle
                checked={settings.lyricsShowRomanization ?? true}
                onChange={settings.setLyricsShowRomanization}
              />
            </InsetSettingRow>

            <InsetSettingRow
              icon={<span className="text-sm">✨</span>}
              iconBg="bg-amber-500/20 text-amber-300 border-amber-500/30"
              label="Syllable Glow Sweep Animation"
              description="Word-by-word fluid illumination tracking vocalist cadence"
            >
              <AppleToggle
                checked={settings.lyricsGlowSweep ?? true}
                onChange={settings.setLyricsGlowSweep}
              />
            </InsetSettingRow>
          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* 5. SENSORY, CONTROLS & GESTURES                                       */}
      {/* ===================================================================== */}
      {shouldShowSection('controls', ['controls', 'gestures', 'haptic', 'vibrate', 'click', 'history', 'touch']) && (
        <section className="flex flex-col gap-3">
          <div className="px-1">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🕹️ Sensory, Controls & Gestures</span>
            </h2>
            <p className="text-xs text-white/50">
              Tactile vibrations, mouse interactions, and search memory preferences
            </p>
          </div>

          <div className="rounded-[22px] border border-white/15 glass-bloom-menu p-3 sm:p-4 flex flex-col gap-1 shadow-md">
            <InsetSettingRow
              icon={<span className="text-sm">📳</span>}
              iconBg="bg-amber-500/20 text-amber-300 border-amber-500/30"
              label="Tactile Haptic Feedback"
              description="Subtle physical vibrations on mobile touches, sliders, and button presses"
            >
              <AppleToggle
                checked={settings.hapticFeedback ?? true}
                onChange={settings.setHapticFeedback}
              />
            </InsetSettingRow>

            <InsetSettingRow
              icon={<span className="text-sm">🖱️</span>}
              iconBg="bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
              label="Double-Click to Play on Desktop"
              description="Require double-clicking track rows to start playback on desktop computers"
            >
              <AppleToggle
                checked={settings.doubleClickToPlay ?? false}
                onChange={settings.setDoubleClickToPlay}
              />
            </InsetSettingRow>

            <InsetSettingRow
              icon={<span className="text-sm">🔍</span>}
              iconBg="bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
              label="Remember Search History"
              description="Saves recent searches for 1-tap quick suggestions"
            >
              <AppleToggle
                checked={settings.keepSearchHistory ?? true}
                onChange={settings.setKeepSearchHistory}
              />
            </InsetSettingRow>

            {searchHistoryCount > 0 && (
              <InsetSettingRow
                icon={<span className="text-sm">🗑️</span>}
                iconBg="bg-rose-500/20 text-rose-300 border-rose-500/30"
                label="Clear Search History"
                description={`${searchHistoryCount} recent search queries saved in local memory`}
              >
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 text-xs font-bold transition-all active:scale-95 cursor-pointer"
                >
                  Clear History
                </button>
              </InsetSettingRow>
            )}
          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* 6. STORAGE, CACHE & OFFLINE VAULT                                     */}
      {/* ===================================================================== */}
      {shouldShowSection('storage', ['storage', 'cache', 'vault', 'offline', 'download', 'backup', 'reset', 'export', 'quota']) && (
        <section className="flex flex-col gap-3">
          <div className="px-1">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>💾 Storage, Cache Quota & Offline Vault</span>
            </h2>
            <p className="text-xs text-white/50">
              Local 320kbps offline files, cache quotas, library backups, and reset
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Offline Vault Manager */}
            <div className="rounded-[22px] border border-white/15 glass-bloom-menu p-4 flex flex-col justify-between shadow-md">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>⚡ Offline Audio Vault</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-[10px] font-black text-emerald-300">
                      {offlineTracks.length} Saved
                    </span>
                  </h3>
                  <span className="text-xs font-mono font-bold text-white/60">
                    ~{(offlineTracks.length * 6.8).toFixed(1)} MB
                  </span>
                </div>
                <p className="text-xs text-white/55 mt-1.5 leading-relaxed">
                  Cached 320kbps audio files stored locally in browser storage for instant 0ms latency offline listening.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 mt-5">
                <button
                  type="button"
                  onClick={handleDownloadAllLiked}
                  disabled={isBulkDownloading || library.likedSongs.length === 0}
                  className="flex-1 min-w-[140px] py-2 px-3 rounded-xl glass-button-primary text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span>
                    {isBulkDownloading
                      ? `Saving (${bulkProgress.current}/${bulkProgress.total})...`
                      : `Download Liked (${library.likedSongs.length})`}
                  </span>
                </button>
                {offlineTracks.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearOfflineVault}
                    className="py-2 px-3 rounded-xl glass-button text-xs font-bold text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                  >
                    Clear Vault
                  </button>
                )}
              </div>
            </div>

            {/* Cache Quota Manager */}
            <div className="rounded-[22px] border border-white/15 glass-bloom-menu p-4 flex flex-col justify-between shadow-md">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>📦 Auto-Cache Quota</span>
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/30 text-[10px] font-black text-blue-300">
                      {settings.maxCacheSizeMb ?? 1024} MB Limit
                    </span>
                  </h3>
                </div>
                <p className="text-xs text-white/55 mt-1.5 leading-relaxed">
                  Automatically keeps recently played songs buffered in memory with smart LRU eviction to avoid disk overflow.
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white/80">Auto-cache playing tracks</span>
                  <AppleToggle
                    checked={settings.autoCachePlayingTracks ?? true}
                    onChange={settings.setAutoCachePlayingTracks}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white/80">Max Cache Size</span>
                  <div className="flex gap-1">
                    {[512, 1024, 2048, 4096].map((mb) => (
                      <button
                        key={mb}
                        type="button"
                        onClick={() => settings.setMaxCacheSizeMb(mb)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          (settings.maxCacheSizeMb ?? 1024) === mb
                            ? 'bg-[var(--color-accent)] text-white'
                            : 'glass text-white/50 hover:text-white'
                        }`}
                      >
                        {mb >= 1024 ? `${mb / 1024}GB` : `${mb}MB`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Library Backup & Reset */}
            <div className="rounded-[22px] border border-white/15 glass-bloom-menu p-4 flex flex-col justify-between shadow-md md:col-span-2">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>📥 Portable Backup & Factory Reset</span>
                </h3>
                <p className="text-xs text-white/55 mt-1 leading-relaxed">
                  Export your complete playlists, favorite tracks, and folders to portable JSON format, or reset WaveCraft back to default state.
                </p>
              </div>

              <div className="flex flex-wrap gap-3 mt-4">
                <GlassButton size="sm" onClick={handleExport} className="flex-1 min-w-[140px]">
                  <span>Export Backup (.json)</span>
                </GlassButton>
                <GlassButton
                  size="sm"
                  onClick={handleClearData}
                  className="flex-1 min-w-[140px] border-red-500/30 text-red-300 hover:bg-red-500/20"
                >
                  <span>Reset All App Data</span>
                </GlassButton>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* 7. UPDATES, DIAGNOSTICS & ABOUT                                       */}
      {/* ===================================================================== */}
      {shouldShowSection('about', ['updates', 'version', 'feedback', 'bug', 'about', 'diagnostics', 'support']) && (
        <section className="flex flex-col gap-3">
          <div className="px-1">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🚀 Diagnostics, Updates & About</span>
            </h2>
            <p className="text-xs text-white/50">
              In-app updates, diagnostic feedback reporting, and platform release notes
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Feedback & Bug Reporting */}
            <div className="rounded-[22px] border border-white/15 glass-bloom-menu p-4 flex flex-col justify-between shadow-md">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>💬 Help & Bug Diagnostics</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/30 text-[10px] font-black text-amber-300">
                      Community
                    </span>
                  </h3>
                </div>
                <p className="text-xs text-white/55 mt-1.5 leading-relaxed">
                  Encountered an audio glitch or have an idea to make WaveCraft better? Submit feedback with automatic device telemetry.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => openFeedback('bug')}
                  className="flex-1 min-w-[120px] py-2 px-3 rounded-xl bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 text-xs font-bold text-amber-300 flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95"
                >
                  <span>🐛 Report Bug</span>
                </button>
                <button
                  type="button"
                  onClick={() => openFeedback('feature')}
                  className="flex-1 min-w-[120px] py-2 px-3 rounded-xl bg-purple-500/15 border border-purple-500/30 hover:bg-purple-500/25 text-xs font-bold text-purple-300 flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95"
                >
                  <span>💡 Suggest Idea</span>
                </button>
              </div>
            </div>

            {/* In-App Auto-Updates */}
            <div className="rounded-[22px] border border-white/15 glass-bloom-menu p-4 flex flex-col justify-between shadow-md">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>🚀 App Version & Updates</span>
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/30 text-[10px] font-black text-purple-300">
                      v{currentVersion}
                    </span>
                  </h3>
                  {hasUpdate && (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/40 text-[10px] font-black text-[var(--color-accent)] animate-pulse">
                      Update Ready
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/55 mt-1.5 leading-relaxed">
                  {isNative
                    ? 'Seamless in-app update checks: downloads directly and opens package installer without browsing.'
                    : 'Stay current with latest streaming performance optimizations, acoustic algorithms, and new features.'}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => {
                    if (hasUpdate) {
                      openUpdateModal();
                    } else {
                      checkForUpdates(true);
                    }
                  }}
                  disabled={updateStatus === 'checking'}
                  className="flex-1 min-w-[140px] py-2 px-3 rounded-xl glass-button-primary text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                >
                  {updateStatus === 'checking' ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Checking...</span>
                    </>
                  ) : hasUpdate ? (
                    <span>⚡ Install Update Now</span>
                  ) : (
                    <span>🔄 Check for Updates</span>
                  )}
                </button>
                {!isInstalled && (
                  <a
                    href="/download"
                    className="py-2 px-3 rounded-xl glass-button text-xs font-bold text-white/80 hover:text-white flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Download Hub</span>
                  </a>
                )}
              </div>
            </div>

            {/* About WaveCraft Spatial Edition */}
            <div className="rounded-[22px] border border-white/15 glass-bloom-menu p-4 flex flex-col justify-between gap-3 shadow-md md:col-span-2">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-purple-600 flex items-center justify-center text-white font-extrabold text-xl shadow-lg flex-shrink-0">
                  W
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">WaveCraft Spatial Edition</h3>
                  <p className="text-xs text-white/50 mt-0.5">
                    YouTube Streaming Core • 10-Band Web Audio DSP • WaveSync Syllable Live Lyrics • 3D Spatial Audio
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-white/40 leading-relaxed border-t border-white/10 pt-2.5">
                WaveCraft is an independent, non-commercial personal audio web player. All media streams and artwork are indexed dynamically from publicly accessible endpoints and remain the property of their respective copyright holders. WaveCraft is not affiliated with or endorsed by any third-party streaming service.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
