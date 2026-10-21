import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

export interface LiquidGlassToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  activeColor?: string; // e.g. 'emerald' | 'cyan' | 'accent' | 'blue'
  className?: string;
  id?: string;
  'aria-label'?: string;
}

/**
 * Liquid Glass Toggle Switch
 * Inspired by fuwad.design's Figma Community component: "Liquid Glass Toggle & Slider"
 *
 * Features:
 * - Fluid translucent glass track with high-refraction depth
 * - Active glowing emerald / accent state with specular inner highlight
 * - Organic stretching liquid glass thumb that elongates horizontally during press / drag
 * - Crisp top specular highlight rim, multi-layer drop shadow, and tactile haptic feedback
 */
export const LiquidGlassToggle: React.FC<LiquidGlassToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  activeColor = 'emerald',
  className = '',
  id,
  'aria-label': ariaLabel,
}) => {
  const [isPressed, setIsPressed] = useState(false);

  // Dimension scaling
  const dimensions = {
    sm: { trackW: 44, trackH: 26, thumbW: 22, thumbH: 20, stretchW: 28, travel: 18 },
    md: { trackW: 52, trackH: 30, thumbW: 26, thumbH: 24, stretchW: 34, travel: 22 },
    lg: { trackW: 60, trackH: 34, thumbW: 30, thumbH: 28, stretchW: 40, travel: 26 },
  }[size];

  // Active track color themes
  const activeBgStyles: Record<string, string> = {
    emerald: 'bg-gradient-to-r from-emerald-500/90 to-green-500/95 border-emerald-400/40 shadow-[0_0_16px_rgba(16,185,129,0.4),inset_0_1px_2px_rgba(255,255,255,0.45)]',
    cyan: 'bg-gradient-to-r from-cyan-500/90 to-blue-500/95 border-cyan-400/40 shadow-[0_0_16px_rgba(6,182,212,0.4),inset_0_1px_2px_rgba(255,255,255,0.45)]',
    blue: 'bg-gradient-to-r from-blue-600/90 to-indigo-600/95 border-blue-400/40 shadow-[0_0_16px_rgba(37,99,235,0.4),inset_0_1px_2px_rgba(255,255,255,0.45)]',
    accent: 'bg-gradient-to-r from-[var(--color-accent)] to-rose-500 border-rose-400/40 shadow-[0_0_16px_rgba(250,36,60,0.4),inset_0_1px_2px_rgba(255,255,255,0.45)]',
  };

  const handleToggle = () => {
    if (disabled) return;
    triggerAndroidHaptic('light');
    onChange(!checked);
  };

  const currentActiveStyle = activeBgStyles[activeColor] || activeBgStyles.emerald;

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={handleToggle}
      onPointerDown={() => !disabled && setIsPressed(true)}
      onPointerUp={() => setIsPressed(false)}
      onPointerLeave={() => setIsPressed(false)}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          handleToggle();
        }
      }}
      style={{
        width: `${dimensions.trackW}px`,
        height: `${dimensions.trackH}px`,
      }}
      className={`relative inline-flex items-center flex-shrink-0 cursor-pointer rounded-full p-[3px] border select-none transition-all duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 disabled:opacity-40 disabled:cursor-not-allowed ${
        checked
          ? currentActiveStyle
          : 'bg-white/15 dark:bg-white/10 border-white/20 dark:border-white/15 shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),inset_0_-1px_1px_rgba(255,255,255,0.08)] backdrop-blur-xl'
      } ${className}`}
    >
      {/* Specular Inner Rim */}
      <div className="absolute inset-0 rounded-full pointer-events-none border border-white/15" />

      {/* Fluid Liquid Glass Thumb / Capsule */}
      <motion.div
        animate={{
          x: checked ? dimensions.travel : 0,
          width: isPressed ? dimensions.stretchW : dimensions.thumbW,
        }}
        transition={{
          type: 'spring',
          stiffness: 550,
          damping: 32,
          mass: 0.75,
        }}
        style={{
          height: `${dimensions.thumbH}px`,
        }}
        className="relative flex items-center justify-center rounded-full pointer-events-none will-change-transform z-10"
      >
        {/* Outer Liquid Glass Refraction Halo (Visible during tension stretch) */}
        <div
          className={`absolute -inset-[2px] rounded-full pointer-events-none transition-opacity duration-200 ${
            isPressed ? 'opacity-90' : 'opacity-0'
          }`}
          style={{
            background: checked
              ? 'rgba(255, 255, 255, 0.35)'
              : 'rgba(255, 255, 255, 0.25)',
            boxShadow: '0 0 8px rgba(255, 255, 255, 0.4)',
          }}
        />

        {/* Primary Glass Body */}
        <div
          className="w-full h-full rounded-full relative overflow-hidden transition-all duration-150"
          style={{
            background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(240, 244, 250, 0.85) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.9)',
            boxShadow: checked
              ? '0 3px 8px rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.12), inset 0 1.5px 2px rgba(255, 255, 255, 1), inset 0 -1px 2px rgba(0, 0, 0, 0.08)'
              : '0 3px 8px rgba(0, 0, 0, 0.16), 0 1px 2px rgba(0, 0, 0, 0.08), inset 0 1.5px 2px rgba(255, 255, 255, 1), inset 0 -1px 2px rgba(0, 0, 0, 0.06)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          {/* Top Specular Arc Line (Apple / Figma glass reflection) */}
          <div className="absolute top-[1.5px] inset-x-1.5 h-[1.5px] rounded-full bg-gradient-to-r from-transparent via-white to-transparent opacity-90" />
        </div>
      </motion.div>
    </button>
  );
};
