import { useEffect, useRef, useState, memo } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { AmbientPalette } from '../../types';

interface AnimatedBackgroundProps {
  colors?: string[];
  palette?: AmbientPalette;
}

interface BufferState {
  c1: string;
  c2: string;
  c3: string;
  accent: string;
  bgDark: string;
}

const DEFAULT_BUFFER: BufferState = {
  c1: '#fa2d48',
  c2: '#8b5cf6',
  c3: '#0ea5e9',
  accent: '#ff4760',
  bgDark: '#06060b'
};

const AnimatedBackground = memo(({ colors, palette }: AnimatedBackgroundProps) => {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const intensity = useSettingsStore((s) => s.ambientGlowIntensity ?? 'vibrant');
  const dynamicEnabled = useSettingsStore((s) => s.dynamicAmbientGlow ?? true);
  const performanceProfile = useSettingsStore((s) => s.performanceProfile ?? 'ultra');

  // Dual-buffer state for liquid cross-fading
  const [activeBuffer, setActiveBuffer] = useState<'A' | 'B'>('A');
  const [bufferA, setBufferA] = useState<BufferState>(DEFAULT_BUFFER);
  const [bufferB, setBufferB] = useState<BufferState>(DEFAULT_BUFFER);

  // Derive target colors
  const target: BufferState = {
    c1: palette?.primary || colors?.[0] || '#fa2d48',
    c2: palette?.secondary || colors?.[1] || '#8b5cf6',
    c3: palette?.tertiary || colors?.[2] || '#0ea5e9',
    accent: palette?.accent || '#ff4760',
    bgDark: palette?.backgroundDark || '#06060b'
  };

  const lastTargetKey = useRef<string>('');

  useEffect(() => {
    const key = `${target.c1}-${target.c2}-${target.c3}`;
    if (key === lastTargetKey.current) return;
    lastTargetKey.current = key;

    // Set dynamic accent glow on root document for liquid glass reflections
    if (dynamicEnabled && typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--ambient-dynamic-accent', target.c1);
      document.documentElement.style.setProperty('--ambient-dynamic-glow', `${target.c1}40`);
    }

    if (activeBuffer === 'A') {
      setBufferB(target);
      setActiveBuffer('B');
    } else {
      setBufferA(target);
      setActiveBuffer('A');
    }
  }, [target.c1, target.c2, target.c3, activeBuffer, dynamicEnabled]);

  // Opacity tiers based on user settings
  const baseOpacity =
    intensity === 'subtle' ? 0.18 : intensity === 'aurora' ? 0.38 : 0.28;
  const secondaryOpacity =
    intensity === 'subtle' ? 0.14 : intensity === 'aurora' ? 0.32 : 0.24;
  const tertiaryOpacity =
    intensity === 'subtle' ? 0.10 : intensity === 'aurora' ? 0.26 : 0.18;

  const renderAuroraLayer = (buf: BufferState, isVisible: boolean) => (
    <div
      className={`absolute inset-0 transition-opacity duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] pointer-events-none will-change-opacity ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        background: `
          radial-gradient(circle at 14% 18%, ${buf.c1}35 0%, transparent 48%),
          radial-gradient(circle at 86% 24%, ${buf.c2}30 0%, transparent 52%),
          radial-gradient(circle at 50% 84%, ${buf.c3}22 0%, transparent 56%),
          ${buf.bgDark}
        `
      }}
    >
      {isVisible && performanceProfile !== 'performance' && (
      <>
        {/* Radiant Floating Node 1: Primary Dominant Glow (Top Left) */}
        <div
          className={`absolute -top-12 left-[12%] w-[42rem] h-[42rem] rounded-full animate-float blur-[60px] will-change-transform transition-transform duration-1000 ${
            isPlaying ? 'scale-105' : 'scale-95'
          }`}
          style={{
            background: `radial-gradient(circle, ${buf.c1} 0%, transparent 70%)`,
            opacity: baseOpacity,
            transform: 'translate3d(0,0,0)'
          }}
        />

        {/* Radiant Floating Node 2: Secondary Harmonic Glow (Top Right) */}
        <div
          className={`absolute top-[18%] -right-16 w-[46rem] h-[46rem] rounded-full animate-float blur-[70px] will-change-transform transition-transform duration-1000 ${
            isPlaying ? 'scale-105' : 'scale-95'
          }`}
          style={{
            background: `radial-gradient(circle, ${buf.c2} 0%, transparent 68%)`,
            animationDelay: '-3.2s',
            opacity: secondaryOpacity,
            transform: 'translate3d(0,0,0)'
          }}
        />

        {performanceProfile === 'ultra' && (
          <>
            {/* Radiant Floating Node 3: Deep Ambient Foundation (Bottom Center) */}
            <div
              className="absolute -bottom-20 left-[28%] w-[52rem] h-[52rem] rounded-full animate-float blur-[80px] will-change-transform"
              style={{
                background: `radial-gradient(circle, ${buf.c3} 0%, transparent 65%)`,
                animationDelay: '-5.8s',
                opacity: tertiaryOpacity,
                transform: 'translate3d(0,0,0)'
              }}
            />

            {/* Radiant Floating Node 4: High-Energy Accent Heart (Subtle Core) */}
            <div
              className="absolute top-[42%] left-[45%] w-[30rem] h-[30rem] rounded-full animate-float blur-[60px] will-change-transform"
              style={{
                background: `radial-gradient(circle, ${buf.accent} 0%, transparent 72%)`,
                animationDelay: '-8.4s',
                opacity: baseOpacity * 0.75,
                transform: 'translate3d(0,0,0)'
              }}
            />
          </>
        )}
      </>
    )}
  </div>
);

  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none select-none overflow-hidden bg-[#06060b]"
      style={{ contain: 'strict' }}
    >
      {renderAuroraLayer(bufferA, activeBuffer === 'A')}
      {renderAuroraLayer(bufferB, activeBuffer === 'B')}

      {/* Fine Micro-Grain Texture Overlay for authentic cinematic depth */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.8) 1px, transparent 0)',
          backgroundSize: '24px 24px'
        }}
      />
    </div>
  );
});

AnimatedBackground.displayName = 'AnimatedBackground';

export default AnimatedBackground;
