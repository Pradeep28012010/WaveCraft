import { useRef, useEffect, useCallback, memo } from 'react';
import { getAudioFrequencyData } from '../player/YouTubeEmbed';

import type { VisualizerStyle } from '../../types';
export type { VisualizerStyle };

interface VisualizerProps {
  isActive: boolean;
  style?: VisualizerStyle;
  colors?: string[];
  fullScreen?: boolean;
}

interface Star3D {
  x: number;
  y: number;
  z: number;
  pz: number;
  hueOffset: number;
}

interface Particle2D {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  phase: number;
}

const DEFAULT_COLORS = ['#fa2d48', '#8b5cf6', '#06b6d4'];

const Visualizer = memo(
  ({
    isActive,
    style = 'nebula',
    colors = DEFAULT_COLORS,
    fullScreen = false
  }: VisualizerProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(performance.now());
    const dataRef = useRef<Float32Array>(new Float32Array(64));
    const fftBufferRef = useRef<Uint8Array>(new Uint8Array(64));
    const starsRef = useRef<Star3D[]>([]);
    const particlesRef = useRef<Particle2D[]>([]);

    const initStarsAndParticles = (width: number, height: number) => {
      if (starsRef.current.length === 0) {
        starsRef.current = Array.from({ length: 140 }, () => {
          const z = Math.random() * width + 1;
          return {
            x: (Math.random() - 0.5) * width * 2,
            y: (Math.random() - 0.5) * height * 2,
            z,
            pz: z,
            hueOffset: Math.random() * 60
          };
        });
      }
      if (particlesRef.current.length === 0) {
        particlesRef.current = Array.from({ length: 55 }, () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.8,
          vy: -Math.random() * 0.9 - 0.2,
          radius: Math.random() * 3.5 + 1.5,
          alpha: Math.random() * 0.65 + 0.2,
          phase: Math.random() * Math.PI * 2
        }));
      }
    };

    const draw = useCallback(
      (now: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (typeof document !== 'undefined' && document.hidden) {
          // Pause drawing loop when minimized or tab/app is hidden in background
          return;
        }

        const width = canvas.width;
        const height = canvas.height;
        if (width === 0 || height === 0) {
          requestRef.current = requestAnimationFrame(draw);
          return;
        }

        // Frame-rate independent delta-time normalized to 60fps (0.5 on 120Hz displays)
        const elapsed = now - lastTimeRef.current;
        lastTimeRef.current = now;
        const dt = Math.min(2.2, Math.max(0.25, elapsed / 16.667));
        const smoothFactor = 1 - Math.pow(1 - 0.26, dt);

        initStarsAndParticles(width, height);
        ctx.clearRect(0, 0, width, height);

        const data = dataRef.current;

        // Update frequency spectrum (real Web Audio FFT first, rhythmic synth fallback second)
        if (isActive) {
          const hasRealAudio = getAudioFrequencyData(fftBufferRef.current);
          if (hasRealAudio) {
            for (let i = 0; i < 64; i++) {
              const normalized = (fftBufferRef.current[i] || 0) / 255;
              data[i] += (normalized - data[i]) * smoothFactor;
            }
          } else {
            const beatPulse = Math.pow((Math.sin(now * 0.0065) + 1) * 0.5, 2.2);
            const fallbackSmooth = 1 - Math.pow(1 - 0.16, dt);
            for (let i = 0; i < 64; i++) {
              const isBass = i < 12;
              const wave =
                Math.sin(i * 0.28 + now * 0.004) * 0.3 +
                Math.cos(i * 0.15 - now * 0.003) * 0.25 +
                0.45;
              const target = isBass
                ? Math.min(1, wave * 0.55 + beatPulse * 0.48)
                : Math.min(0.85, wave * 0.55);
              data[i] += (target - data[i]) * fallbackSmooth;
            }
          }
        } else {
          const idleSmooth = 1 - Math.pow(1 - 0.08, dt);
          for (let i = 0; i < 64; i++) {
            data[i] += (0.02 - data[i]) * idleSmooth;
          }
        }

        // Compute bass energy
        let bassSum = 0;
        for (let i = 0; i < 10; i++) bassSum += data[i];
        const bassEnergy = bassSum / 10;

        const c0 = colors[0] || '#fa2d48';
        const c1 = colors[1] || '#8b5cf6';
        const c2 = colors[2] || '#06b6d4';

        let gradient: string | CanvasGradient = c0;
        if (style === 'bars' || style === 'wave' || style === 'blob' || style === 'circular') {
          const lin = ctx.createLinearGradient(0, 0, width, height);
          lin.addColorStop(0, c0);
          lin.addColorStop(0.5, c1);
          lin.addColorStop(1, c2);
          gradient = lin;
        }

        if (style === 'starfield') {
          const cx = width / 2;
          const cy = height / 2;
          const speed = (isActive ? 3.5 + bassEnergy * 24 : 0.6) * dt;

          const coreGrad = ctx.createRadialGradient(
            cx,
            cy,
            2,
            cx,
            cy,
            Math.min(width, height) * (0.28 + bassEnergy * 0.2)
          );
          coreGrad.addColorStop(0, `rgba(250, 45, 72, ${0.28 + bassEnergy * 0.35})`);
          coreGrad.addColorStop(0.5, `rgba(139, 92, 246, ${0.14 + bassEnergy * 0.2})`);
          coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = coreGrad;
          ctx.fillRect(0, 0, width, height);

          for (const star of starsRef.current) {
            star.pz = star.z;
            star.z -= speed;

            if (star.z <= 1) {
              star.z = width;
              star.pz = width;
              star.x = (Math.random() - 0.5) * width * 2;
              star.y = (Math.random() - 0.5) * height * 2;
            }

            const sx = (star.x / star.z) * (width * 0.5) + cx;
            const sy = (star.y / star.z) * (height * 0.5) + cy;
            const px = (star.x / star.pz) * (width * 0.5) + cx;
            const py = (star.y / star.pz) * (height * 0.5) + cy;

            const depthRatio = 1 - star.z / width;
            const size = Math.max(0.6, depthRatio * 3.8);

            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(sx, sy);
            ctx.strokeStyle =
              star.hueOffset > 30
                ? `rgba(250, 45, 72, ${Math.min(1, depthRatio + 0.15)})`
                : `rgba(167, 139, 250, ${Math.min(1, depthRatio + 0.2)})`;
            ctx.lineWidth = size;
            ctx.lineCap = 'round';
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(sx, sy, size * 0.7, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
          }
        } else if (style === 'nebula') {
          const cx = width / 2;
          const cy = height / 2;
          const minDim = Math.min(width, height);

          for (let layer = 0; layer < 3; layer++) {
            const baseR = minDim * (0.16 + layer * 0.085) * (1 + bassEnergy * 0.22);
            const rot = now * 0.0004 * (layer % 2 === 0 ? 1 : -1.3);

            ctx.beginPath();
            const steps = 64;
            for (let s = 0; s <= steps; s++) {
              const angle = (s / steps) * Math.PI * 2;
              const idx = Math.floor(((s % 32) / 32) * 48);
              const freqVal = data[idx] || 0;
              const harmonic =
                Math.sin(angle * (3 + layer) + rot * 3) * (14 + bassEnergy * 28) +
                Math.cos(angle * (5 - layer) - rot * 2) * (10 + freqVal * 35);
              const r = baseR + freqVal * minDim * 0.14 + harmonic;
              const x = cx + Math.cos(angle) * r;
              const y = cy + Math.sin(angle) * r;
              if (s === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.closePath();

            const layerGrad = ctx.createRadialGradient(cx, cy, baseR * 0.2, cx, cy, baseR * 1.6);
            if (layer === 0) {
              layerGrad.addColorStop(0, 'rgba(250, 45, 72, 0.45)');
              layerGrad.addColorStop(1, 'rgba(139, 92, 246, 0.05)');
            } else if (layer === 1) {
              layerGrad.addColorStop(0, 'rgba(139, 92, 246, 0.35)');
              layerGrad.addColorStop(1, 'rgba(6, 182, 212, 0.04)');
            } else {
              layerGrad.addColorStop(0, 'rgba(6, 182, 212, 0.25)');
              layerGrad.addColorStop(1, 'rgba(250, 45, 72, 0.02)');
            }

            ctx.fillStyle = layerGrad;
            ctx.fill();
            ctx.strokeStyle =
              layer === 0
                ? `rgba(250, 45, 72, ${0.4 + bassEnergy * 0.4})`
                : layer === 1
                ? `rgba(168, 85, 247, ${0.35 + bassEnergy * 0.35})`
                : `rgba(34, 211, 238, ${0.25 + bassEnergy * 0.3})`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          for (let i = 0; i < 24; i++) {
            const orbitAngle = (i / 24) * Math.PI * 2 + now * 0.0005 * (i % 2 === 0 ? 1 : -1);
            const orbitDist = minDim * (0.14 + (i % 5) * 0.065) + data[i] * minDim * 0.12;
            const ox = cx + Math.cos(orbitAngle) * orbitDist;
            const oy = cy + Math.sin(orbitAngle) * orbitDist;
            const dotR = 1.5 + data[i] * 4;

            ctx.beginPath();
            ctx.arc(ox, oy, dotR, 0, Math.PI * 2);
            ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#f43f5e';
            ctx.fill();
          }
        } else if (style === 'particles') {
          for (let i = 0; i < particlesRef.current.length; i++) {
            const p = particlesRef.current[i];
            const energy = data[i % 32] || 0;
            p.x += (p.vx + Math.sin(now * 0.001 + p.phase) * 0.35) * dt;
            p.y += p.vy * (1 + bassEnergy * 2.4) * dt;

            if (p.y < -20) {
              p.y = height + 15;
              p.x = Math.random() * width;
            }
            if (p.x < -20) p.x = width + 15;
            if (p.x > width + 20) p.x = -15;

            const r = p.radius * (1 + energy * 2.2);
            const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
            glow.addColorStop(0, `rgba(250, 45, 72, ${p.alpha})`);
            glow.addColorStop(0.5, `rgba(139, 92, 246, ${p.alpha * 0.5})`);
            glow.addColorStop(1, 'rgba(0, 0, 0, 0)');

            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.arc(p.x, p.y, r * 0.7, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
          }
        } else if (style === 'bars') {
          const barWidth = (width / 64) * 0.76;
          const spacing = (width / 64) * 0.24;

          for (let i = 0; i < 64; i++) {
            const val = data[i];
            const barHeight = Math.max(4, val * (height * 0.58));
            const x = i * (barWidth + spacing);
            const y = height / 2 - barHeight / 2;

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
            ctx.fill();

            ctx.globalAlpha = 0.2;
            ctx.beginPath();
            ctx.roundRect(
              x,
              height / 2 + barHeight / 2 + 5,
              barWidth,
              barHeight * 0.38,
              barWidth / 2
            );
            ctx.fill();
            ctx.globalAlpha = 1.0;
          }
        } else if (style === 'wave') {
          for (let w = 0; w < 3; w++) {
            ctx.beginPath();
            for (let i = 0; i < 64; i++) {
              const val = data[i];
              const x = (width / 63) * i;
              const y =
                height / 2 +
                Math.sin(i * 0.35 + now * 0.0025 + w * 1.1) *
                  (val * height * (0.28 - w * 0.06));
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = gradient;
            ctx.globalAlpha = 1 - w * 0.3;
            ctx.lineWidth = 4 - w;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        } else if (style === 'blob') {
          const centerX = width / 2;
          const centerY = height / 2;
          const baseRadius = Math.min(width, height) * 0.24;

          // Fast radial halo glow (replaces CPU-bound ctx.shadowBlur for 120fps)
          const halo = ctx.createRadialGradient(
            centerX,
            centerY,
            baseRadius * 0.5,
            centerX,
            centerY,
            baseRadius * 1.9
          );
          halo.addColorStop(0, 'rgba(250, 45, 72, 0.32)');
          halo.addColorStop(1, 'rgba(250, 45, 72, 0)');
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(centerX, centerY, baseRadius * 1.9, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          for (let i = 0; i <= Math.PI * 2; i += 0.09) {
            const dataIndex = Math.floor((i / (Math.PI * 2)) * 32);
            const val = data[dataIndex] || 0;
            const r =
              baseRadius +
              val * baseRadius * 0.6 +
              Math.sin(i * 3 + now * 0.0015) * (12 + bassEnergy * 18);
            const x = centerX + Math.cos(i) * r;
            const y = centerY + Math.sin(i) * r;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }

          ctx.closePath();
          ctx.fillStyle = gradient;
          ctx.fill();

          ctx.globalAlpha = 0.35;
          ctx.beginPath();
          ctx.arc(centerX, centerY, baseRadius * (0.75 + bassEnergy * 0.15), 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.globalAlpha = 1.0;
        } else if (style === 'circular') {
          const centerX = width / 2;
          const centerY = height / 2;
          const radius = Math.min(width, height) * (0.19 + bassEnergy * 0.04);
          const rot = now * 0.0005;

          for (let i = 0; i < 64; i++) {
            const val = data[i];
            const angle = (i / 64) * Math.PI * 2 + rot;
            const length = Math.max(4, val * (Math.min(width, height) * 0.25));

            const x1 = centerX + Math.cos(angle) * radius;
            const y1 = centerY + Math.sin(angle) * radius;
            const x2 = centerX + Math.cos(angle) * (radius + length);
            const y2 = centerY + Math.sin(angle) * (radius + length);

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 3.2;
            ctx.lineCap = 'round';
            ctx.stroke();
          }

          ctx.beginPath();
          ctx.arc(centerX, centerY, radius - 8, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(6, 6, 11, 0.65)';
          ctx.fill();
          ctx.strokeStyle = gradient;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        requestRef.current = requestAnimationFrame(draw);
      },
      [isActive, style, colors]
    );

    useEffect(() => {
      const handleResize = () => {
        const canvas = canvasRef.current;
        if (canvas && canvas.parentElement) {
          canvas.width = canvas.parentElement.clientWidth;
          canvas.height = canvas.parentElement.clientHeight;
        }
      };

      const handleVisibilityChange = () => {
        if (!document.hidden) {
          cancelAnimationFrame(requestRef.current);
          lastTimeRef.current = performance.now();
          requestRef.current = requestAnimationFrame(draw);
        } else {
          cancelAnimationFrame(requestRef.current);
        }
      };

      handleResize();
      window.addEventListener('resize', handleResize);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      lastTimeRef.current = performance.now();
      requestRef.current = requestAnimationFrame(draw);

      return () => {
        window.removeEventListener('resize', handleResize);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        cancelAnimationFrame(requestRef.current);
      };
    }, [draw]);

    const containerClasses = fullScreen
      ? 'absolute inset-0 w-full h-full pointer-events-none'
      : 'relative w-full h-full min-h-[200px] bg-white/5 dark:bg-black/20 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden gpu-layer';

    return (
      <div className={containerClasses}>
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>
    );
  }
);

Visualizer.displayName = 'Visualizer';

export default Visualizer;
