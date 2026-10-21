import React, { useRef, useState, useCallback } from 'react';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

export interface LiquidGlassSliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  defaultValue?: number;
  label?: string;
  formattedValue?: string;
  accentColor?: 'blue' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'purple' | 'accent';
  className?: string;
  disabled?: boolean;
  showValueBadge?: boolean;
}

/**
 * Liquid Glass Slider
 * Inspired by fuwad.design's Figma Community component: "Liquid Glass Toggle & Slider"
 *
 * Features:
 * - Elongated horizontal liquid-glass capsule thumb (34px × 20px with 10px rounded squircle)
 * - Internal optical refraction lens notch revealing the active track underneath
 * - Vibrant electric blue (or custom theme) track with subtle glow
 * - 120fps pointer capture engine with 36px touch hit area and zero gesture hijacking
 * - Tactile liquid elastic stretch during grab & slide
 * - Tactile haptic ticks and double-click reset support
 */
export const LiquidGlassSlider: React.FC<LiquidGlassSliderProps> = ({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  onChangeEnd,
  defaultValue,
  label,
  formattedValue,
  accentColor = 'blue',
  className = '',
  disabled = false,
  showValueBadge = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeValueRef = useRef(value);
  activeValueRef.current = value;

  // Active track color gradients matching Figma specs
  const trackGradients: Record<string, string> = {
    blue: 'from-blue-500 to-indigo-600 shadow-[0_0_12px_rgba(59,130,246,0.45)]',
    cyan: 'from-cyan-400 to-blue-500 shadow-[0_0_12px_rgba(6,182,212,0.45)]',
    emerald: 'from-emerald-400 to-green-500 shadow-[0_0_12px_rgba(16,185,129,0.45)]',
    amber: 'from-amber-400 via-orange-500 to-rose-500 shadow-[0_0_12px_rgba(245,158,11,0.45)]',
    rose: 'from-rose-500 to-pink-500 shadow-[0_0_12px_rgba(244,63,94,0.45)]',
    purple: 'from-purple-500 to-indigo-500 shadow-[0_0_12px_rgba(168,85,247,0.45)]',
    accent: 'from-[var(--color-accent)] to-rose-500 shadow-[0_0_12px_rgba(250,36,60,0.45)]',
  };

  const currentGradient = trackGradients[accentColor] || trackGradients.blue;

  // Clamp & calculate percentage
  const clampedVal = Math.min(max, Math.max(min, value));
  const range = max - min;
  const percent = range > 0 ? ((clampedVal - min) / range) * 100 : 0;

  const updateFromPointer = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const rawPct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const rawVal = min + rawPct * range;
      const steppedVal = Math.round(rawVal / step) * step;
      const finalVal = Math.min(max, Math.max(min, Number(steppedVal.toFixed(4))));

      if (finalVal !== activeValueRef.current) {
        onChange(finalVal);
      }
    },
    [min, max, step, range, onChange]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.stopPropagation();
    e.nativeEvent?.stopImmediatePropagation?.();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    triggerAndroidHaptic('light');
    updateFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      e.stopPropagation();
      e.nativeEvent?.stopImmediatePropagation?.();
      updateFromPointer(e.clientX);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.stopPropagation();
    e.nativeEvent?.stopImmediatePropagation?.();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setIsDragging(false);
    triggerAndroidHaptic('medium');
    onChangeEnd?.(activeValueRef.current);
  };

  const handleDoubleClick = () => {
    if (disabled || defaultValue === undefined) return;
    triggerAndroidHaptic('medium');
    onChange(defaultValue);
    onChangeEnd?.(defaultValue);
  };

  return (
    <div
      className={`relative select-none touch-none flex flex-col justify-center ${className} ${
        disabled ? 'opacity-40 pointer-events-none' : ''
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Optional Top Label & Value Readout */}
      {(label || formattedValue) && (
        <div className="flex items-center justify-between text-xs mb-1.5 px-0.5">
          {label && <span className="font-medium text-white/75">{label}</span>}
          {formattedValue && (
            <span
              onClick={handleDoubleClick}
              className="font-mono text-xs font-bold text-white/90 tabular-nums cursor-pointer hover:text-white transition"
              title={defaultValue !== undefined ? 'Double-click to reset' : undefined}
            >
              {formattedValue}
            </span>
          )}
        </div>
      )}

      {/* Main Touch Slider Region (36px comfortable hit target) */}
      <div
        ref={trackRef}
        role="slider"
        aria-label={label || 'Slider'}
        aria-valuenow={clampedVal}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            const next = Math.max(min, Number((clampedVal - step).toFixed(4)));
            onChange(next);
            onChangeEnd?.(next);
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            const next = Math.min(max, Number((clampedVal + step).toFixed(4)));
            onChange(next);
            onChangeEnd?.(next);
          } else if (e.key === 'Home') {
            e.preventDefault();
            onChange(min);
            onChangeEnd?.(min);
          } else if (e.key === 'End') {
            e.preventDefault();
            onChange(max);
            onChangeEnd?.(max);
          }
        }}
        className="relative h-9 flex items-center cursor-pointer touch-none group"
      >
        {/* Track Bar (Sleek 5px groove with glass depth) */}
        <div className="w-full h-[5px] rounded-full bg-white/15 dark:bg-white/10 backdrop-blur-md relative overflow-hidden border border-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)] transition-all duration-200">
          {/* Active Filled Progress Bar */}
          <div
            className={`h-full bg-gradient-to-r ${currentGradient} rounded-full transition-all ${
              isDragging ? 'duration-0' : 'duration-100 ease-out'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Liquid Glass Capsule Thumb (Fuwad design: elongated horizontal rounded squircle pill) */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none will-change-transform z-20"
          style={{
            left: `${percent}%`,
            transition: isDragging
              ? 'transform 100ms ease-out'
              : 'left 100ms ease-out, transform 150ms ease-out',
          }}
        >
          {/* Capsule pill container */}
          <div
            style={{
              width: isDragging ? '38px' : isHovered ? '36px' : '34px',
              height: '20px',
              borderRadius: '10px',
              background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(240, 244, 250, 0.72) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.9)',
              boxShadow: isDragging
                ? '0 6px 16px rgba(0, 0, 0, 0.32), 0 2px 4px rgba(0, 0, 0, 0.16), inset 0 1.5px 2px rgba(255, 255, 255, 1), inset 0 -1px 2px rgba(0, 0, 0, 0.08)'
                : '0 4px 12px rgba(0, 0, 0, 0.22), 0 1px 3px rgba(0, 0, 0, 0.12), inset 0 1.5px 2px rgba(255, 255, 255, 1), inset 0 -1px 2px rgba(0, 0, 0, 0.06)',
              backdropFilter: 'blur(12px) saturate(180%)',
              WebkitBackdropFilter: 'blur(12px) saturate(180%)',
              transform: isDragging ? 'scale(1.05)' : isHovered ? 'scale(1.02)' : 'scale(1)',
              transition: 'width 150ms ease-out, transform 150ms ease-out, box-shadow 150ms ease-out',
            }}
            className="relative flex items-center justify-center overflow-hidden"
          >
            {/* Top Specular Arc Highlight */}
            <div className="absolute top-[1.5px] inset-x-2 h-[1.5px] rounded-full bg-gradient-to-r from-transparent via-white to-transparent opacity-95" />

            {/* Optical Refraction Lens Center Notch (Signature Fuwad Figma detail) */}
            <div className="w-[14px] h-[3px] rounded-full bg-white/40 border-t border-white/60 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] opacity-70" />
          </div>

          {/* Value tooltip badge on drag */}
          {showValueBadge && isDragging && (
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] font-bold text-white tabular-nums border border-white/10 shadow-lg pointer-events-none whitespace-nowrap">
              {formattedValue || clampedVal}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
