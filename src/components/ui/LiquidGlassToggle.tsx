import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

export interface LiquidGlassToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  activeColor?: string; // e.g. 'emerald' | 'cyan' | 'blue' | 'accent'
  className?: string;
  id?: string;
  'aria-label'?: string;
}

/**
 * Liquid Glass Toggle Switch
 * Exactly matching Jhey Tompkins' CodePen (FreeFrontend: #2025-09-13-liquid-toggle-switch-l)
 * and the user-provided screenshot (media_1792555643298_323a2ae2.png).
 *
 * Features:
 * - Glowing emerald green track with luminous cyan-mint outer aura and glass rim
 * - Glossy porcelain 3D spherical knob with specular reflections
 * - SVG goo filter (#liquid-switch-goo) providing fluid surface tension & liquid stretch
 * - High-speed physics response with elastic snap bounce and haptic ticks
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
  const pressStartTimeRef = useRef(0);

  // Scaled dimensions matching exact proportions from screenshot
  const dimensions = {
    sm: { trackW: 48, trackH: 28, knobSize: 22, stretchW: 28, travel: 20 },
    md: { trackW: 56, trackH: 32, knobSize: 26, stretchW: 34, travel: 24 },
    lg: { trackW: 66, trackH: 38, knobSize: 32, stretchW: 42, travel: 28 },
  }[size];

  // Active track color themes
  const activeColorThemes: Record<string, { bg: string; border: string; glow: string; knobTint: string }> = {
    emerald: {
      bg: '#03b26b',
      border: 'rgba(130, 255, 200, 0.65)',
      glow: '0 0 18px rgba(0, 220, 130, 0.5), 0 0 32px rgba(0, 220, 130, 0.25)',
      knobTint: 'linear-gradient(145deg, #ffffff 0%, #f0fdf4 40%, #e1f3ed 100%)',
    },
    cyan: {
      bg: '#06b6d4',
      border: 'rgba(165, 243, 252, 0.65)',
      glow: '0 0 18px rgba(6, 182, 212, 0.5), 0 0 32px rgba(6, 182, 212, 0.25)',
      knobTint: 'linear-gradient(145deg, #ffffff 0%, #f0fdfa 40%, #e0f2fe 100%)',
    },
    blue: {
      bg: '#2563eb',
      border: 'rgba(191, 219, 254, 0.65)',
      glow: '0 0 18px rgba(37, 99, 235, 0.5), 0 0 32px rgba(37, 99, 235, 0.25)',
      knobTint: 'linear-gradient(145deg, #ffffff 0%, #eff6ff 40%, #dbeafe 100%)',
    },
    accent: {
      bg: 'var(--color-accent, #fa243c)',
      border: 'rgba(254, 205, 211, 0.65)',
      glow: '0 0 18px rgba(250, 36, 60, 0.5), 0 0 32px rgba(250, 36, 60, 0.25)',
      knobTint: 'linear-gradient(145deg, #ffffff 0%, #fff1f2 40%, #ffe4e6 100%)',
    },
  };

  const currentTheme = activeColorThemes[activeColor] || activeColorThemes.emerald;

  const handleToggle = () => {
    if (disabled) return;
    triggerAndroidHaptic('light');
    onChange(!checked);
  };

  return (
    <>
      {/* SVG Liquid Goo Filter Definition (Loaded Once) */}
      <svg
        className="sr-only"
        style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <defs>
          <filter id="liquid-switch-goo" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="
                1 0 0 0 0
                0 1 0 0 0
                0 0 1 0 0
                0 0 0 18 -9
              "
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={handleToggle}
        onPointerDown={() => {
          if (!disabled) {
            pressStartTimeRef.current = Date.now();
            setIsPressed(true);
          }
        }}
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
          backgroundColor: checked ? currentTheme.bg : 'rgba(255, 255, 255, 0.12)',
          borderColor: checked ? currentTheme.border : 'rgba(255, 255, 255, 0.22)',
          boxShadow: checked
            ? `${currentTheme.glow}, inset 0 1px 2px rgba(255, 255, 255, 0.35)`
            : 'inset 0 2px 4px rgba(0, 0, 0, 0.35), 0 1px 2px rgba(0, 0, 0, 0.15)',
        }}
        className={`relative inline-flex items-center flex-shrink-0 cursor-pointer rounded-full p-[3px] border select-none transition-all duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 disabled:opacity-40 disabled:cursor-not-allowed ${
          !checked ? 'backdrop-blur-xl' : ''
        } ${className}`}
      >
        {/* Liquid Gooey Bridge Layer (Simulating Jhey's dynamic surface tension) */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none overflow-hidden"
          style={{ filter: 'url(#liquid-switch-goo)' }}
        >
          {/* Stretching Liquid Puddle */}
          <motion.div
            animate={{
              x: checked ? dimensions.travel : 0,
              width: isPressed ? dimensions.stretchW + 4 : dimensions.knobSize,
            }}
            transition={{
              type: 'spring',
              stiffness: 520,
              damping: 28,
              mass: 0.75,
            }}
            style={{
              height: `${dimensions.knobSize}px`,
              backgroundColor: checked ? currentTheme.bg : 'rgba(255, 255, 255, 0.25)',
            }}
            className="rounded-full will-change-transform"
          />
        </div>

        {/* Glossy 3D Porcelain Knob (Exact match to media_1792555643298_323a2ae2.png) */}
        <motion.div
          animate={{
            x: checked ? dimensions.travel : 0,
            width: isPressed ? dimensions.stretchW : dimensions.knobSize,
          }}
          transition={{
            type: 'spring',
            stiffness: 550,
            damping: 30,
            mass: 0.75,
          }}
          style={{
            height: `${dimensions.knobSize}px`,
          }}
          className="relative flex items-center justify-center rounded-full pointer-events-none will-change-transform z-10"
        >
          <div
            className="w-full h-full rounded-full relative overflow-hidden transition-all duration-150"
            style={{
              background: checked
                ? currentTheme.knobTint
                : 'linear-gradient(145deg, #ffffff 0%, #f1f5f9 45%, #e2e8f0 100%)',
              border: '1.5px solid rgba(255, 255, 255, 0.95)',
              boxShadow: checked
                ? '0 3px 10px rgba(0, 0, 0, 0.28), 0 1px 2px rgba(0, 0, 0, 0.14), inset 0 1.5px 2px #ffffff, inset 0 -1px 2px rgba(0, 0, 0, 0.08)'
                : '0 3px 10px rgba(0, 0, 0, 0.22), 0 1px 2px rgba(0, 0, 0, 0.12), inset 0 1.5px 2px #ffffff, inset 0 -1px 2px rgba(0, 0, 0, 0.06)',
            }}
          >
            {/* Specular Top Crescent Curve (3D Sphere shine) */}
            <div className="absolute top-[1.5px] inset-x-2 h-[2px] rounded-full bg-white opacity-95 blur-[0.2px]" />
          </div>
        </motion.div>
      </button>
    </>
  );
};
