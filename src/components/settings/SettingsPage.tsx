import React from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { clearAllData } from '../../services/storage';
import GlassCard from '../ui/GlassCard';
import GlassButton from '../ui/GlassButton';
import GlassSelect from '../ui/GlassSelect';
import { EQ_PRESETS } from '../../utils/constants';

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (val: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-6 rounded-full transition-colors duration-300 cursor-pointer border ${
        checked
          ? 'bg-[var(--color-accent)] border-[var(--color-accent)] shadow-[0_0_12px_rgba(250,45,72,0.4)]'
          : 'bg-white/10 border-white/15'
      }`}
    >
      <div
        className={`absolute left-0.5 top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform duration-300 ${
          checked ? 'translate-x-6' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function SettingRow({
  label,
  description,
  children
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-white/[0.07] last:border-0 gap-4">
      <div className="flex flex-col">
        <span className="text-white font-semibold text-sm sm:text-base">{label}</span>
        {description && <span className="text-xs text-white/45 mt-0.5">{description}</span>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

const BAND_LABELS = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];

export default function SettingsPage() {
  const settings = useSettingsStore();
  const library = useLibraryStore();

  const handleBandChange = (index: number, newDb: number) => {
    const clamped = Math.round(Math.max(-12, Math.min(12, newDb)));
    const nextBands = [...(settings.equalizerBands || Array(10).fill(0))];
    nextBands[index] = clamped;
    settings.setEqualizerBands(nextBands);
  };

  const handleVerticalDrag = (index: number, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const updateFromClientY = (clientY: number) => {
      const relY = Math.max(0, Math.min(rect.height, clientY - rect.top));
      const ratio = 1 - relY / rect.height; // 1 at top (+12dB), 0 at bottom (-12dB)
      const db = ratio * 24 - 12;
      handleBandChange(index, db);
    };

    updateFromClientY(e.clientY);

    const onMove = (moveEvent: MouseEvent) => updateFromClientY(moveEvent.clientY);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

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
    if (window.confirm('Clear all saved playlists, liked songs, and settings?')) {
      await clearAllData();
      settings.resetSettings();
      await library.loadFromStorage();
    }
  };

  const presetOptions = Object.keys(EQ_PRESETS).map((k) => ({ value: k, label: k }));

  return (
    <div className="w-full max-w-4xl mx-auto pt-2 pb-28 flex flex-col gap-8 text-white">
      <div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Settings & Studio EQ</h1>
        <p className="text-xs text-white/50 mt-1">
          Customize your real-time 10-band Web Audio equalizer, gapless preloading, and liquid glass theme
        </p>
      </div>

      {/* Equalizer Section — Moved to top so it's front and center */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">10-Band Real-Time Studio Equalizer</h2>
            <p className="text-xs text-white/50">
              Drag any frequency slider (-12dB to +12dB) or choose an acoustic preset
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

        {/* Quick Preset Pills */}
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.keys(EQ_PRESETS).map((presetName) => {
            const active = (settings.eqPreset || 'Flat') === presetName;
            return (
              <button
                key={presetName}
                type="button"
                onClick={() => settings.setEqPreset(presetName)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  active
                    ? 'bg-[var(--color-accent)] text-white shadow-lg shadow-[var(--color-accent)]/30'
                    : 'glass text-white/65 hover:text-white'
                }`}
              >
                {presetName}
              </button>
            );
          })}
        </div>

        <GlassCard variant="liquid" padding="lg" className="overflow-x-auto">
          <div className="flex justify-between gap-3 min-w-[540px] h-56 items-center pt-4 pb-2 px-2">
            {(settings.equalizerBands || Array(10).fill(0)).map((val, idx) => {
              const pct = ((val + 12) / 24) * 100; // 0% at -12dB, 50% at 0dB, 100% at +12dB
              return (
                <div key={idx} className="flex flex-col items-center gap-2.5 flex-1 h-full select-none">
                  {/* dB Value Badge */}
                  <span
                    className={`text-[11px] font-bold tabular-nums ${
                      val > 0 ? 'text-[var(--color-accent)]' : val < 0 ? 'text-sky-400' : 'text-white/45'
                    }`}
                  >
                    {val > 0 ? `+${val}` : val}dB
                  </span>

                  {/* Interactive Vertical Slider Track */}
                  <div
                    onMouseDown={(e) => handleVerticalDrag(idx, e)}
                    className="relative w-9 flex-1 bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 rounded-full cursor-ns-resize flex justify-center overflow-hidden"
                  >
                    {/* Center 0dB Reference Line */}
                    <div className="absolute left-0 right-0 top-1/2 h-px bg-white/20 pointer-events-none" />

                    {/* Active Fill Bar */}
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[var(--color-accent)]/70 to-purple-500/70 transition-all duration-75 pointer-events-none"
                      style={{ height: `${pct}%` }}
                    />

                    {/* Draggable Thumb */}
                    <div
                      className="absolute w-6 h-6 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.6)] border-2 border-[var(--color-accent)] pointer-events-none transition-all duration-75"
                      style={{
                        bottom: `calc(${pct}% - 12px)`
                      }}
                    />
                  </div>

                  {/* Frequency Label */}
                  <span className="text-[11px] text-white/65 font-semibold">{BAND_LABELS[idx]}</span>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </section>

      {/* Playback & Flow State Section */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">Playback & Flow State</h2>
        <GlassCard variant="liquid" padding="md">
          <SettingRow
            label="Streaming Audio Quality"
            description="320kbps High-Definition direct streaming"
          >
            <GlassSelect
              value={settings.audioQuality || 'high'}
              onChange={(val) => settings.setAudioQuality(val as any)}
              options={[
                { value: 'high', label: '320kbps Studio HD' },
                { value: 'auto', label: 'Auto Adaptive' },
                { value: 'medium', label: '160kbps High' },
                { value: 'low', label: '96kbps Data Saver' }
              ]}
            />
          </SettingRow>

          <SettingRow
            label="Smooth Crossfade"
            description={
              settings.crossfadeDuration > 0
                ? `${settings.crossfadeDuration}s seamless overlap between songs`
                : 'Off (Instant gapless preloaded transition)'
            }
          >
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-white/70 w-8 text-right">
                {settings.crossfadeDuration}s
              </span>
              <input
                type="range"
                min="0"
                max="12"
                value={settings.crossfadeDuration}
                onChange={(e) => settings.setCrossfade(Number(e.target.value))}
                className="w-32"
              />
            </div>
          </SettingRow>

          <SettingRow
            label="Endless Flow Autoplay"
            description="Preloads the next song ahead of time and auto-extends queue when reaching the end"
          >
            <ToggleSwitch checked={settings.autoplay} onChange={settings.setAutoplay} />
          </SettingRow>
        </GlassCard>
      </section>

      {/* Appearance & Visualizer Section */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">Liquid Glass & Visualizer</h2>
        <GlassCard variant="liquid" padding="md">
          <SettingRow label="Accent Glow Color" description="Personalize your Liquid Glass highlights">
            <div className="flex gap-2.5">
              {[
                { color: '#fa2d48', name: 'Crimson Pulse' },
                { color: '#8b5cf6', name: 'Spatial Violet' },
                { color: '#ec4899', name: 'Neon Rose' },
                { color: '#3b82f6', name: 'Ocean Glass' },
                { color: '#10b981', name: 'Emerald' },
                { color: '#f59e0b', name: 'Sunset Gold' }
              ].map((item) => (
                <button
                  key={item.color}
                  type="button"
                  title={item.name}
                  onClick={() => settings.setAccentColor(item.color)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                    settings.accentColor === item.color
                      ? 'border-white scale-115 shadow-lg'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: item.color }}
                />
              ))}
            </div>
          </SettingRow>

          <SettingRow label="Real-Time Audio Visualizer" description="Show reactive canvas backdrop in Now Playing">
            <ToggleSwitch checked={settings.showVisualizer} onChange={settings.setShowVisualizer} />
          </SettingRow>

          <SettingRow label="Visualizer Mode" description="Choose your 3D or 2D reactive audio geometry">
            <GlassSelect
              value={settings.visualizerStyle || 'nebula'}
              onChange={(val) => settings.setVisualizerStyle(val as any)}
              options={[
                { value: 'nebula', label: '3D Cosmic Nebula' },
                { value: 'starfield', label: '3D Starfield Warp' },
                { value: 'particles', label: 'Bioluminescent Orbs' },
                { value: 'blob', label: 'Liquid Blob' },
                { value: 'circular', label: 'Radial Halo' },
                { value: 'bars', label: 'Spectrum Bars' },
                { value: 'wave', label: 'Harmonic Wave' }
              ]}
            />
          </SettingRow>
        </GlassCard>
      </section>

      {/* Storage & Backup */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <GlassCard variant="liquid" padding="md" className="flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">Library Backup & Reset</h3>
            <p className="text-xs text-white/55 mt-1">
              Export your playlists and liked songs as a portable JSON file or reset local IndexedDB storage.
            </p>
          </div>
          <div className="flex gap-3 mt-6">
            <GlassButton size="sm" onClick={handleExport} className="flex-1">
              Export Backup
            </GlassButton>
            <GlassButton
              size="sm"
              onClick={handleClearData}
              className="flex-1 border-red-500/30 text-red-300 hover:bg-red-500/20"
            >
              Reset All Data
            </GlassButton>
          </div>
        </GlassCard>

        <GlassCard variant="liquid" padding="md" className="flex flex-col justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-purple-600 flex items-center justify-center text-white font-extrabold text-2xl shadow-lg flex-shrink-0">
              W
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">WaveCraft Spatial Edition</h3>
              <p className="text-xs text-white/55 mt-0.5">
                320kbps Studio Engine • 10-Band Web Audio EQ • WaveSync Lyrics • Gapless Preloader
              </p>
            </div>
          </div>
          <p className="text-[11px] text-white/40 leading-relaxed border-t border-white/10 pt-2.5">
            WaveCraft is an independent, non-commercial personal audio web player. All media streams and artwork are indexed dynamically from publicly accessible endpoints and remain the property of their respective copyright holders. WaveCraft is not affiliated with or endorsed by any third-party streaming service.
          </p>
        </GlassCard>
      </section>
    </div>
  );
}
