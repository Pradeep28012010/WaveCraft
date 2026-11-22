import { useEffect, useRef, useState, memo } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useDevicePreset } from '../../hooks/useDevicePreset';
import { getAudioFrequencyData } from '../player/YouTubeEmbed';
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

const FluidLiquidMeshCanvas = memo(({
  c1,
  c2,
  c3,
  accent,
  isPlaying,
  isAppVisible,
  performanceProfile
}: {
  c1: string;
  c2: string;
  c3: string;
  accent: string;
  isPlaying: boolean;
  isAppVisible: boolean;
  performanceProfile: string;
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!isAppVisible || performanceProfile === 'performance') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = Math.max(220, Math.floor(window.innerWidth / 3.5)));
    let height = (canvas.height = Math.max(160, Math.floor(window.innerHeight / 3.5)));

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = Math.max(220, Math.floor(window.innerWidth / 3.5));
      height = canvas.height = Math.max(160, Math.floor(window.innerHeight / 3.5));
    };
    window.addEventListener('resize', handleResize);

    const freqData = new Uint8Array(32);
    let time = 0;
    let smoothBass = 0;
    let smoothMid = 0;
    let lastRenderTime = performance.now();

    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      // When paused or idle, throttle to ~30fps to cut GPU/CPU load in half with zero visual degradation
      if (!isPlaying && now - lastRenderTime < 32) {
        return;
      }
      lastRenderTime = now;
      time += 0.016;

      let hasLive = false;
      try {
        hasLive = getAudioFrequencyData(freqData);
      } catch {}

      let rawBass = 0;
      let rawMid = 0;
      if (hasLive && isPlaying) {
        rawBass = (freqData[0] + freqData[1] + freqData[2] + freqData[3]) / (4 * 255);
        rawMid = (freqData[8] + freqData[9] + freqData[10] + freqData[11]) / (4 * 255);
      } else if (isPlaying) {
        rawBass = 0.18 + 0.14 * Math.sin(time * 3.2);
        rawMid = 0.14 + 0.10 * Math.cos(time * 2.1);
      }

      smoothBass += (rawBass - smoothBass) * 0.16;
      smoothMid += (rawMid - smoothMid) * 0.12;

      ctx.clearRect(0, 0, width, height);

      // Liquid Node 1: Primary Dominant (Top Left sweep)
      const x1 = width * (0.32 + 0.22 * Math.cos(time * 0.42));
      const y1 = height * (0.28 + 0.18 * Math.sin(time * 0.55));
      const r1 = Math.max(40, width * 0.38 * (1 + smoothBass * 0.52));
      const g1 = ctx.createRadialGradient(x1, y1, 0, x1, y1, r1);
      g1.addColorStop(0, `${c1}dd`);
      g1.addColorStop(0.55, `${c1}55`);
      g1.addColorStop(1, 'transparent');
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.arc(x1, y1, r1, 0, Math.PI * 2);
      ctx.fill();

      // Liquid Node 2: Secondary Harmonic (Top Right sweep)
      const x2 = width * (0.72 + 0.18 * Math.sin(time * 0.38 + 1.2));
      const y2 = height * (0.35 + 0.22 * Math.cos(time * 0.48 + 0.8));
      const r2 = Math.max(40, width * 0.42 * (1 + smoothMid * 0.45));
      const g2 = ctx.createRadialGradient(x2, y2, 0, x2, y2, r2);
      g2.addColorStop(0, `${c2}cc`);
      g2.addColorStop(0.5, `${c2}44`);
      g2.addColorStop(1, 'transparent');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(x2, y2, r2, 0, Math.PI * 2);
      ctx.fill();

      // Liquid Node 3: Deep Foundation (Bottom Center wave)
      const x3 = width * (0.50 + 0.26 * Math.cos(time * 0.32 + 2.5));
      const y3 = height * (0.78 + 0.16 * Math.sin(time * 0.44 + 1.8));
      const r3 = Math.max(50, width * 0.46 * (1 + smoothBass * 0.62));
      const g3 = ctx.createRadialGradient(x3, y3, 0, x3, y3, r3);
      g3.addColorStop(0, `${c3}aa`);
      g3.addColorStop(0.6, `${c3}33`);
      g3.addColorStop(1, 'transparent');
      ctx.fillStyle = g3;
      ctx.beginPath();
      ctx.arc(x3, y3, r3, 0, Math.PI * 2);
      ctx.fill();

      // Liquid Node 4: High-Energy Chromatic Accent Core
      const x4 = width * (0.52 + 0.16 * Math.sin(time * 0.65 + 3.4));
      const y4 = height * (0.50 + 0.18 * Math.cos(time * 0.58 + 2.1));
      const r4 = Math.max(30, width * 0.28 * (1 + smoothBass * 0.72 + smoothMid * 0.32));
      const g4 = ctx.createRadialGradient(x4, y4, 0, x4, y4, r4);
      g4.addColorStop(0, `${accent}ee`);
      g4.addColorStop(0.45, `${accent}66`);
      g4.addColorStop(1, 'transparent');
      ctx.fillStyle = g4;
      ctx.beginPath();
      ctx.arc(x4, y4, r4, 0, Math.PI * 2);
      ctx.fill();
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [c1, c2, c3, accent, isPlaying, isAppVisible, performanceProfile]);

  if (performanceProfile === 'performance') return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none will-change-transform mix-blend-screen transition-opacity duration-1000"
      style={{
        filter: 'blur(52px) saturate(1.8) contrast(1.15)',
        opacity: isPlaying ? 0.36 : 0.22,
        transform: 'translate3d(0,0,0)'
      }}
    />
  );
});
FluidLiquidMeshCanvas.displayName = 'FluidLiquidMeshCanvas';

const AnimatedBackground = memo(({ colors, palette }: AnimatedBackgroundProps) => {
  const { isPhone } = useDevicePreset();
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isNowPlayingOpen = usePlayerStore((s) => s.isNowPlayingOpen);
  const intensity = useSettingsStore((s) => s.ambientGlowIntensity ?? 'vibrant');
  const dynamicEnabled = useSettingsStore((s) => s.dynamicAmbientGlow ?? true);
  const performanceProfile = useSettingsStore((s) => s.performanceProfile ?? 'ultra');

  const [isAppVisible, setIsAppVisible] = useState(() =>
    typeof document === 'undefined' ? true : !document.hidden
  );

  useEffect(() => {
    const handleVis = () => {
      setIsAppVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVis);

    const cleanupElectron =
      typeof window !== 'undefined' &&
      (window as unknown as { electronAPI?: { onVisibilityChange?: (cb: (v: boolean) => void) => () => void } }).electronAPI?.onVisibilityChange?.(
        (visible: boolean) => {
          setIsAppVisible(visible && !document.hidden);
        }
      );

    return () => {
      document.removeEventListener('visibilitychange', handleVis);
      if (typeof cleanupElectron === 'function') {
        cleanupElectron();
      }
    };
  }, []);

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

    setActiveBuffer((prev) => {
      if (prev === 'A') {
        setBufferB(target);
        return 'B';
      } else {
        setBufferA(target);
        return 'A';
      }
    });
  }, [target.c1, target.c2, target.c3, dynamicEnabled]);

  // Opacity tiers based on user settings
  const baseOpacity =
    intensity === 'subtle' ? 0.18 : intensity === 'aurora' ? 0.38 : 0.28;
  const secondaryOpacity =
    intensity === 'subtle' ? 0.14 : intensity === 'aurora' ? 0.32 : 0.24;
  const tertiaryOpacity =
    intensity === 'subtle' ? 0.10 : intensity === 'aurora' ? 0.26 : 0.18;

  const shouldAnimateNodes = isAppVisible && !isNowPlayingOpen && performanceProfile !== 'performance';

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
      {isVisible && shouldAnimateNodes && (
      <>
        {/* Radiant Floating Node 1: Primary Dominant Glow (Top Left) */}
        <div
          className={`absolute -top-12 left-[12%] ${isPhone ? 'w-56 h-56 blur-xl' : 'w-[42rem] h-[42rem] blur-[60px]'} rounded-full animate-float will-change-transform transition-transform duration-1000 ${
            isPlaying ? 'scale-105' : 'scale-95'
          }`}
          style={{
            background: `radial-gradient(circle, ${buf.c1} 0%, transparent 70%)`,
            opacity: baseOpacity,
            animationPlayState: isPlaying ? 'running' : 'paused',
            transform: 'translate3d(0,0,0)'
          }}
        />

        {/* Radiant Floating Node 2: Secondary Harmonic Glow (Top Right) */}
        <div
          className={`absolute top-[18%] -right-16 ${isPhone ? 'w-56 h-56 blur-xl' : 'w-[46rem] h-[46rem] blur-[70px]'} rounded-full animate-float will-change-transform transition-transform duration-1000 ${
            isPlaying ? 'scale-105' : 'scale-95'
          }`}
          style={{
            background: `radial-gradient(circle, ${buf.c2} 0%, transparent 68%)`,
            animationDelay: '-3.2s',
            opacity: secondaryOpacity,
            animationPlayState: isPlaying ? 'running' : 'paused',
            transform: 'translate3d(0,0,0)'
          }}
        />

        {!isPhone && performanceProfile === 'ultra' && (
          <>
            {/* Radiant Floating Node 3: Deep Ambient Foundation (Bottom Center) */}
            <div
              className="absolute -bottom-20 left-[28%] w-[52rem] h-[52rem] rounded-full animate-float blur-[80px] will-change-transform"
              style={{
                background: `radial-gradient(circle, ${buf.c3} 0%, transparent 65%)`,
                animationDelay: '-5.8s',
                opacity: tertiaryOpacity,
                animationPlayState: isPlaying ? 'running' : 'paused',
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
                animationPlayState: isPlaying ? 'running' : 'paused',
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

      {/* Hardware-Accelerated Audio-Reactive Fluid Liquid Glass Mesh Canvas */}
      {dynamicEnabled && (
        <FluidLiquidMeshCanvas
          c1={target.c1}
          c2={target.c2}
          c3={target.c3}
          accent={target.accent}
          isPlaying={isPlaying}
          isAppVisible={isAppVisible}
          performanceProfile={performanceProfile}
        />
      )}

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
