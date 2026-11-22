import React, { useState, memo } from 'react';
import { motion, LayoutGroup } from 'framer-motion';
import { useSettingsStore } from '../../stores/settingsStore';
import { EQ_PRESETS } from '../../utils/constants';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import GlassButton from '../ui/GlassButton';
import GlassSelect from '../ui/GlassSelect';

const BAND_LABELS = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];

export const SettingsEqualizer = memo(function SettingsEqualizer() {
  const equalizerBands = useSettingsStore((s) => s.equalizerBands || Array(10).fill(0));
  const setEqualizerBands = useSettingsStore((s) => s.setEqualizerBands);
  const eqPreset = useSettingsStore((s) => s.eqPreset || 'Flat');
  const setEqPreset = useSettingsStore((s) => s.setEqPreset);

  const [activeSettingsBandIdx, setActiveSettingsBandIdx] = useState<number | null>(null);

  const presetOptions = Object.keys(EQ_PRESETS).map((p) => ({
    value: p,
    label: p
  }));

  const handleBandChange = (index: number, newDb: number) => {
    const clamped = Math.round(Math.max(-12, Math.min(12, newDb)));
    const nextBands = [...equalizerBands];
    nextBands[index] = clamped;
    setEqualizerBands(nextBands);
  };

  const updateSettingsBandFromPointer = (index: number, target: HTMLDivElement, clientY: number) => {
    const rect = target.getBoundingClientRect();
    if (rect.height <= 0) return;
    const relY = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const ratio = 1 - relY / rect.height; // 1 at top (+12dB), 0 at bottom (-12dB)
    const db = ratio * 24 - 12;
    handleBandChange(index, db);
  };

  const handleBandPointerDown = (index: number, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent?.stopImmediatePropagation?.();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setActiveSettingsBandIdx(index);
    triggerAndroidHaptic('light');
    updateSettingsBandFromPointer(index, e.currentTarget, e.clientY);
  };

  const handleBandPointerMove = (index: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (activeSettingsBandIdx !== index) return;
    updateSettingsBandFromPointer(index, e.currentTarget, e.clientY);
  };

  const handleBandPointerUp = (_index: number, e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setActiveSettingsBandIdx(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
        <div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span>🎛️ 10-Band Real-Time Studio Equalizer</span>
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border-0 whitespace-nowrap">
              32Hz – 16kHz
            </span>
          </div>
          <p className="text-xs text-white/50">
            Touch and drag vertical frequency faders (-12dB to +12dB) or choose audiophile presets
          </p>
        </div>

        <div className="flex items-center gap-2">
          <GlassSelect
            value={eqPreset}
            options={presetOptions}
            onChange={(preset) => setEqPreset(preset)}
          />
          <GlassButton size="sm" onClick={() => setEqPreset('Flat')}>
            Reset
          </GlassButton>
        </div>
      </div>

      {/* Preset Pills */}
      <div className="flex flex-wrap gap-1.5 p-1 rounded-2xl bg-white/[0.03] relative">
        <LayoutGroup id="settings-eq-presets">
          {Object.keys(EQ_PRESETS).map((presetName) => {
            const active = eqPreset === presetName;
            return (
              <button
                key={presetName}
                type="button"
                onClick={() => {
                  triggerAndroidHaptic('light');
                  setEqPreset(presetName);
                }}
                className="relative px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer select-none"
              >
                {active && (
                  <motion.div
                    layoutId="settings-eq-preset-liquid-pill"
                    layout="position"
                    initial={false}
                    transition={{ type: 'spring', stiffness: 450, damping: 34, mass: 0.5 }}
                    className="absolute inset-0 rounded-full liquid-sliding-pill -z-0 pointer-events-none"
                  />
                )}
                <span
                  className={`relative z-10 transition-colors duration-150 ${
                    active
                      ? 'text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]'
                      : 'text-white/65 hover:text-white'
                  }`}
                >
                  {presetName}
                </span>
              </button>
            );
          })}
        </LayoutGroup>
      </div>

      {/* Equalizer Visual Fader Rack */}
      <div
        className="rounded-[22px] glass-bloom-menu p-4 overflow-x-auto no-scrollbar shadow-lg"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex justify-between gap-1 sm:gap-3 min-w-[340px] sm:min-w-[540px] h-52 items-center pt-2 pb-1 px-1">
          {equalizerBands.map((val, idx) => {
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
                  onPointerDown={(e) => handleBandPointerDown(idx, e)}
                  onPointerMove={(e) => handleBandPointerMove(idx, e)}
                  onPointerUp={(e) => handleBandPointerUp(idx, e)}
                  onPointerCancel={(e) => handleBandPointerUp(idx, e)}
                  onDoubleClick={() => handleBandChange(idx, 0)}
                  className="relative w-7 sm:w-9 flex-1 bg-white/[0.08] hover:bg-white/[0.14] border-0 rounded-full cursor-ns-resize flex justify-center overflow-hidden touch-none select-none"
                  role="slider"
                  aria-label={BAND_LABELS[idx]}
                  aria-valuenow={val}
                  aria-valuemin={-12}
                  aria-valuemax={12}
                >
                  <div className="absolute left-0 right-0 top-1/2 h-px bg-white/20 pointer-events-none" />
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[var(--color-accent)]/80 to-purple-500/80 pointer-events-none transition-all duration-75"
                    style={{ height: `${pct}%` }}
                  />
                  {/* Liquid Glass Capsule Thumb */}
                  <div
                    className="absolute left-1/2 -translate-x-1/2 pointer-events-none transition-transform duration-75"
                    style={{ bottom: `calc(${pct}% - 7px)` }}
                  >
                    <div
                      style={{
                        width: activeSettingsBandIdx === idx ? '26px' : '22px',
                        height: '14px',
                        borderRadius: '7px',
                        background: 'linear-gradient(180deg, #FFFFFF 0%, #EDF0F5 50%, #D2D7E3 100%)',
                        border: '1px solid rgba(255, 255, 255, 0.95)',
                        boxShadow: activeSettingsBandIdx === idx
                          ? '0 0 14px 2px var(--color-accent)'
                          : '0 2px 8px rgba(0, 0, 0, 0.35)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        transform: activeSettingsBandIdx === idx ? 'scale(1.15)' : 'scale(1)',
                        transition: 'width 100ms ease-out, transform 100ms ease-out'
                      }}
                      className="relative flex items-center justify-center overflow-hidden"
                    >
                      <div className="absolute top-[1px] inset-x-1 h-[1px] rounded-full bg-gradient-to-r from-transparent via-white to-transparent opacity-95" />
                      <div
                        style={{
                          width: '10px',
                          height: '2.5px',
                          borderRadius: '9999px',
                          backgroundColor: 'rgba(255, 255, 255, 0.9)',
                          boxShadow: 'inset 0 1px 1px rgba(0, 0, 0, 0.12), 0 1px 1px rgba(255, 255, 255, 0.7)'
                        }}
                      />
                    </div>
                  </div>
                </div>

                <span className="text-[10px] sm:text-[11px] text-white/60 font-semibold">{BAND_LABELS[idx]}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default SettingsEqualizer;
