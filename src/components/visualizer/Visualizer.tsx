import { useRef, useEffect, useCallback, memo } from 'react';
import { getAudioFrequencyData } from '../player/YouTubeEmbed';
import { usePlayerStore } from '../../stores/playerStore';

import type { VisualizerStyle } from '../../types';
export type { VisualizerStyle };

const colorRgbCache = new Map<string, [number, number, number]>();
let colorParserCtx: CanvasRenderingContext2D | null | undefined;

function toRgba(color: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));
  const key = color.trim();
  let rgb = colorRgbCache.get(key);

  if (!rgb) {
    const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(key);
    if (hexMatch) {
      const hex = hexMatch[1];
      if (hex.length === 3) {
        rgb = [
          parseInt(hex[0] + hex[0], 16),
          parseInt(hex[1] + hex[1], 16),
          parseInt(hex[2] + hex[2], 16)
        ];
      } else {
        rgb = [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16)
        ];
      }
    } else {
      const rgbMatch = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(key);
      if (rgbMatch) {
        rgb = [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
      } else if (typeof document !== 'undefined') {
        if (colorParserCtx === undefined) {
          colorParserCtx = document.createElement('canvas').getContext('2d');
        }
        if (colorParserCtx) {
          colorParserCtx.fillStyle = '#000000';
          colorParserCtx.fillStyle = key;
          const parsed = colorParserCtx.fillStyle;
          const pHex = /^#([0-9a-f]{6})$/i.exec(parsed);
          const pRgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(parsed);
          if (pHex) {
            rgb = [
              parseInt(pHex[1].slice(0, 2), 16),
              parseInt(pHex[1].slice(2, 4), 16),
              parseInt(pHex[1].slice(4, 6), 16)
            ];
          } else if (pRgb) {
            rgb = [Number(pRgb[1]), Number(pRgb[2]), Number(pRgb[3])];
          }
        }
      }
    }

    if (!rgb) rgb = [250, 45, 72];
    if (colorRgbCache.size >= 64) colorRgbCache.clear();
    colorRgbCache.set(key, rgb);
  }

  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${clamped})`;
}

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

interface KaleidoscopeLayerDef {
  count: number;
  rBaseMul: number;
  rTipMul: number;
  colorIdx: number;
  freqStart: number;
  rotOffsetStep: number;
  bassScale?: number;
  dataFreqIdx?: number;
  dataFreqScale?: number;
}

const KALEIDOSCOPE_LAYERS: readonly KaleidoscopeLayerDef[] = [
  { count: 12, rBaseMul: 0.5, rTipMul: 0.85, bassScale: 0.3, colorIdx: 0, freqStart: 2, rotOffsetStep: 0 },
  { count: 12, rBaseMul: 0.25, rTipMul: 0.58, dataFreqIdx: 16, dataFreqScale: 0.25, colorIdx: 1, freqStart: 18, rotOffsetStep: 0.5 },
  { count: 12, rBaseMul: 0.08, rTipMul: 0.32, dataFreqIdx: 32, dataFreqScale: 0.2, colorIdx: 2, freqStart: 34, rotOffsetStep: 0 }
];

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

    const isActiveRef = useRef(isActive);
    const styleRef = useRef(style);
    const colorsRef = useRef(colors);
    const fullScreenRef = useRef(fullScreen);
    isActiveRef.current = isActive;
    styleRef.current = style;
    colorsRef.current = colors;
    fullScreenRef.current = fullScreen;

    // 3D Perspective Tilt and Audio Dynamic Physics
    const tiltRef = useRef<{ x: number; y: number; targetX: number; targetY: number }>({
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0
    });
    const prevStyleRef = useRef<VisualizerStyle>(style);
    const canvasSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
    const idleFramesRef = useRef<number>(0);
    const meshOffsetRef = useRef<number>(0);
    const vuNeedleRef = useRef<{ left: number; right: number; tapeAngle: number }>({
      left: 0,
      right: 0,
      tapeAngle: 0
    });
    const matrixColsRef = useRef<
      Array<{
        x: number;
        y: number;
        speed: number;
        chars: string[];
      }>
    >([]);
    const tunnelRotationRef = useRef<number>(0);
    const tunnelZOffsetRef = useRef<number>(0);
    const flareAngleRef = useRef<number>(0);
    const oscPhaseRef = useRef<number>(0);
    const laserPtsXRef = useRef<Float32Array>(new Float32Array(725));
    const laserPtsYRef = useRef<Float32Array>(new Float32Array(725));
    const meshSxRef = useRef<Float32Array>(new Float32Array(35 * 45));
    const meshSyRef = useRef<Float32Array>(new Float32Array(35 * 45));
    const meshAlphaRef = useRef<Float32Array>(new Float32Array(35));
    const tunnelPtsXRef = useRef<Float32Array>(new Float32Array(18 * 6));
    const tunnelPtsYRef = useRef<Float32Array>(new Float32Array(18 * 6));
    const tunnelRingProgRef = useRef<Float32Array>(new Float32Array(18));
    const tunnelRingIdxRef = useRef<Int32Array>(new Int32Array(18));
    const matrixHeadIdxRef = useRef<Int32Array>(new Int32Array(256));

    const initStarsAndParticles = (width: number, height: number) => {
      const sizeChanged =
        canvasSizeRef.current.width === 0 ||
        Math.abs(width - canvasSizeRef.current.width) > 40 ||
        Math.abs(height - canvasSizeRef.current.height) > 40;
      if (sizeChanged) {
        canvasSizeRef.current = { width, height };
      }

      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      const starCount = isMobile ? 45 : 140;
      const particleCount = isMobile ? 20 : 55;
      if (starsRef.current.length === 0 || sizeChanged) {
        starsRef.current = Array.from({ length: starCount }, () => {
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
      if (particlesRef.current.length === 0 || sizeChanged) {
        particlesRef.current = Array.from({ length: particleCount }, () => ({
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
        if (!canvas) {
          requestRef.current = 0;
          return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          requestRef.current = 0;
          return;
        }

        const style = styleRef.current;
        const isActive = isActiveRef.current;
        const colors = colorsRef.current;

        if (typeof document !== 'undefined' && document.hidden) {
          requestRef.current = 0;
          return;
        }

        const dpr = Math.min(2.5, window.devicePixelRatio || 1);
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;
        if (width === 0 || height === 0) {
          requestRef.current = requestAnimationFrame(draw);
          return;
        }

        // Frame-rate independent delta-time normalized to 60fps reference (0.5 on 120Hz displays)
        const elapsed = now - lastTimeRef.current;
        lastTimeRef.current = now;
        const dt = Math.min(2.5, Math.max(0.1, elapsed / 16.667));

        // Smooth camera tilt damping
        const tilt = tiltRef.current;
        tilt.x += (tilt.targetX - tilt.x) * (0.08 * dt);
        tilt.y += (tilt.targetY - tilt.y) * (0.08 * dt);

        initStarsAndParticles(width, height);

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        if (style === 'laser-oscilloscope') {
          if (prevStyleRef.current !== 'laser-oscilloscope') {
            ctx.clearRect(0, 0, width, height);
          } else {
            // Phosphor retention persistence trail over transparent backdrop
            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
          }
        } else {
          ctx.clearRect(0, 0, width, height);
        }
        prevStyleRef.current = style;

        const data = dataRef.current;
        const { isMuted, volume } = usePlayerStore.getState();
        const isAudioActive = isActive && !isMuted && volume > 0.02;

        // Dual-pole audio dynamics: instant transient attack (kick/snare) + silky exponential release
        let maxIdleDelta = 0;
        if (isAudioActive) {
          idleFramesRef.current = 0;
          const hasRealAudio = getAudioFrequencyData(fftBufferRef.current);
          if (hasRealAudio) {
            const attackRate = 1 - Math.pow(1 - 0.45, dt);
            const decayRate = 1 - Math.pow(1 - 0.16, dt);
            for (let i = 0; i < 64; i++) {
              const raw = (fftBufferRef.current[i] || 0) / 255;
              const prev = i > 0 ? (fftBufferRef.current[i - 1] || 0) / 255 : raw;
              const next = i < 63 ? (fftBufferRef.current[i + 1] || 0) / 255 : raw;
              const target = raw * 0.7 + (prev + next) * 0.15;
              const rate = target > data[i] ? attackRate : decayRate;
              data[i] += (target - data[i]) * rate;
            }
          } else {
            const beatPulse = Math.pow((Math.sin(now * 0.0065) + 1) * 0.5, 2.2);
            const fallbackSmooth = 1 - Math.pow(1 - 0.18, dt);
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
            const d = Math.abs(data[i] - 0.02);
            if (d > maxIdleDelta) maxIdleDelta = d;
          }
          idleFramesRef.current += 1;
        }

        // Compute bass energy
        let bassSum = 0;
        for (let i = 0; i < 10; i++) bassSum += data[i];
        const bassEnergy = bassSum / 10;

        const c0 = colors[0] || '#fa2d48';
        const c1 = colors[1] || '#8b5cf6';
        const c2 = colors[2] || '#06b6d4';

        let gradient: string | CanvasGradient = c0;
        if (
          style === 'bars' ||
          style === 'wave' ||
          style === 'blob' ||
          style === 'circular'
        ) {
          const lin = ctx.createLinearGradient(0, 0, width, height);
          lin.addColorStop(0, c0);
          lin.addColorStop(0.5, c1);
          lin.addColorStop(1, c2);
          gradient = lin;
        }

        // ==========================================
        // 1. 3D CYBER WAVE MESH
        // ==========================================
        if (style === 'cyber-mesh') {
          const cx = width / 2;
          const horizonY = height * 0.46 + tilt.y * 25;
          const fov = height * 0.76;
          const camY = height * 0.38 + tilt.y * 35;

          // Horizon Glow & Synthwave Sun
          const sunR = Math.min(width, height) * (0.17 + bassEnergy * 0.05);
          const sunX = cx + tilt.x * 30;
          const sunY = horizonY - 10;

          const sunGlow = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR * 1.9);
          sunGlow.addColorStop(0, c0);
          sunGlow.addColorStop(0.5, toRgba(c1, 0.53));
          sunGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = sunGlow;
          ctx.beginPath();
          ctx.arc(sunX, sunY, sunR * 1.9, 0, Math.PI * 2);
          ctx.fill();

          // Sun Disk with high-precision anti-aliased slats
          ctx.save();
          ctx.beginPath();
          ctx.arc(sunX, sunY, sunR, Math.PI, 0); // Upper half above horizon
          ctx.clip();
          const sunDiskGrad = ctx.createLinearGradient(sunX, sunY - sunR, sunX, sunY);
          sunDiskGrad.addColorStop(0, '#fef08a');
          sunDiskGrad.addColorStop(0.38, c0);
          sunDiskGrad.addColorStop(1, c1);
          ctx.fillStyle = sunDiskGrad;
          ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);

          const slats = 8;
          ctx.fillStyle = '#06060b';
          for (let s = 1; s <= slats; s++) {
            const slatH = s * (sunR * 0.024);
            const slatY = sunY - (s / (slats + 1)) * sunR;
            ctx.fillRect(sunX - sunR, slatY, sunR * 2, slatH);
          }
          ctx.restore();

          // 3D Terrain Grid with Smooth Interpolation
          const cols = 42; // High-density grid for silky 120fps curves
          const rows = 32;
          const rowSpacing = 32;
          const maxDist = rows * rowSpacing;
          meshOffsetRef.current =
            (meshOffsetRef.current + (isActive ? 1.2 + bassEnergy * 2.8 : 0.3) * dt) % rowSpacing;

          const numCols = cols + 1;
          const msx = meshSxRef.current;
          const msy = meshSyRef.current;
          const malpha = meshAlphaRef.current;
          let activeRows = 0;

          for (let r = 0; r < rows; r++) {
            const distZ = r * rowSpacing - meshOffsetRef.current;
            if (distZ < 4 || distZ > maxDist) continue;
            const proj = fov / (fov + distZ);
            const nearFade = Math.min(1, Math.max(0, (distZ - 6) / 110));
            const farFade = Math.min(1, Math.max(0, (maxDist - distZ) / 170));
            const rowAlpha = nearFade * farFade;
            if (rowAlpha <= 0.005) continue;

            malpha[activeRows] = rowAlpha;
            const rowOffset = activeRows * numCols;
            let colIdx = 0;

            for (let c = -cols / 2; c <= cols / 2; c++) {
              const normC = c / (cols / 2); // -1 to 1
              const colSpacing = (width * 1.8) / cols;
              const worldX = c * colSpacing + tilt.x * 60;

              // Mountain ridge elevation: smooth valley in center, continuous reactive mountains on sides
              const absNorm = Math.abs(normC);
              const valley = Math.pow(absNorm, 2.4);
              // Smooth fractional frequency interpolation
              const freqPos = absNorm * 31;
              const f0 = Math.floor(freqPos);
              const f1 = Math.min(31, f0 + 1);
              const fFrac = freqPos - f0;
              const freqVal = (data[f0] || 0) * (1 - fFrac) + (data[f1] || 0) * fFrac;

              const ripple = Math.sin(distZ * 0.035 - now * 0.003 + c * 0.35) * (12 + bassEnergy * 30);
              const worldY = -valley * (freqVal * 110 + 36) - ripple;

              const pointIdx = rowOffset + colIdx;
              msx[pointIdx] = cx + worldX * proj;
              msy[pointIdx] = horizonY + (camY + worldY) * proj;
              colIdx++;
            }
            activeRows++;
          }

          // Draw latitudinal lines with silky smooth curves
          for (let r = 0; r < activeRows; r++) {
            const rowOffset = r * numCols;
            ctx.beginPath();
            ctx.moveTo(msx[rowOffset], msy[rowOffset]);
            for (let i = 0; i < numCols - 1; i++) {
              const idx = rowOffset + i;
              const mx = (msx[idx] + msx[idx + 1]) * 0.5;
              const my = (msy[idx] + msy[idx + 1]) * 0.5;
              ctx.quadraticCurveTo(msx[idx], msy[idx], mx, my);
            }
            ctx.lineTo(msx[rowOffset + numCols - 1], msy[rowOffset + numCols - 1]);

            const rAlpha = malpha[r];
            ctx.strokeStyle = r % 2 === 0 ? c0 : c1;
            ctx.globalAlpha = rAlpha * (0.42 + bassEnergy * 0.38);
            ctx.lineWidth = Math.max(1, 2.0 * rAlpha);
            ctx.stroke();
          }

          // Draw longitudinal lines with smooth perspective curves
          for (let c = 0; c < numCols; c++) {
            ctx.beginPath();
            ctx.moveTo(msx[c], msy[c]);
            for (let r = 1; r < activeRows; r++) {
              const idx = r * numCols + c;
              ctx.lineTo(msx[idx], msy[idx]);
            }
            const colNorm = Math.abs((c - numCols / 2) / (numCols / 2));
            const lineAlpha = Math.max(0.08, 1 - colNorm * 0.5);
            ctx.strokeStyle = c % 2 === 0 ? c1 : c2;
            ctx.globalAlpha = lineAlpha * (0.35 + bassEnergy * 0.45);
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }
          ctx.globalAlpha = 1.0;
        }

        // ==========================================
        // 2. VINTAGE ANALOG VU METER & TAPE DECK
        // ==========================================
        else if (style === 'analog-vu') {
          if (fullScreenRef.current) {
            const scrim = ctx.createLinearGradient(0, 0, 0, height);
            scrim.addColorStop(0, 'rgba(6, 6, 12, 0.28)');
            scrim.addColorStop(0.55, 'rgba(6, 6, 12, 0.48)');
            scrim.addColorStop(1, 'rgba(6, 6, 12, 0.86)');
            ctx.fillStyle = scrim;
            ctx.fillRect(0, 0, width, height);
          }

          const vu = vuNeedleRef.current;
          const leftEnergy = isAudioActive
            ? Math.min(1, Math.max(0, (data[1] * 0.5 + data[2] * 0.3 + data[3] * 0.2) * 1.45))
            : 0;
          const rightEnergy = isAudioActive
            ? Math.min(1, Math.max(0, (data[5] * 0.3 + data[8] * 0.4 + data[12] * 0.3) * 1.45))
            : 0;

          const attack = 0.38 * dt;
          const release = 0.09 * dt;
          vu.left += (leftEnergy - vu.left) * (leftEnergy > vu.left ? attack : release);
          vu.right += (rightEnergy - vu.right) * (rightEnergy > vu.right ? attack : release);

          if (isAudioActive) {
            vu.tapeAngle += (0.045 + bassEnergy * 0.04) * dt;
          }

          const isCompact = width < 540;
          const meterW = Math.min(width * (isCompact ? 0.44 : 0.36), 310);
          const meterH = meterW * 0.62;
          const meterSpacing = isCompact ? 14 : 28;
          const totalW = meterW * 2 + meterSpacing;
          const startX = (width - totalW) / 2;
          const meterY = height / 2 - meterH / 2 + (isCompact ? 28 : 36);

          // Background Cassette Tape Deck Window
          const reelR = Math.min(width, height) * (isCompact ? 0.085 : 0.11);
          const reelY = meterY - reelR - (isCompact ? 14 : 20);
          const leftReelX = width / 2 - reelR * 1.7;
          const rightReelX = width / 2 + reelR * 1.7;

          const deckBoxW = rightReelX - leftReelX + reelR * 2.6;
          const deckBoxH = reelR * 2.3;
          ctx.fillStyle = 'rgba(12, 12, 18, 0.75)';
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(width / 2 - deckBoxW / 2, reelY - reelR * 1.15, deckBoxW, deckBoxH, 16);
          ctx.fill();
          ctx.stroke();

          // Tape ribbon connecting spools
          ctx.strokeStyle = 'rgba(38, 30, 26, 0.9)';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(leftReelX, reelY + reelR * 0.7);
          ctx.lineTo(rightReelX, reelY + reelR * 0.7);
          ctx.stroke();

          const drawReel = (rx: number, ry: number, angle: number) => {
            // Tape pack
            ctx.fillStyle = '#261e1a';
            ctx.beginPath();
            ctx.arc(rx, ry, reelR, 0, Math.PI * 2);
            ctx.fill();

            // White hub
            ctx.fillStyle = '#e2e8f0';
            ctx.beginPath();
            ctx.arc(rx, ry, reelR * 0.44, 0, Math.PI * 2);
            ctx.fill();

            // 3 spokes
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = reelR * 0.12;
            for (let sp = 0; sp < 3; sp++) {
              const a = angle + (sp * Math.PI * 2) / 3;
              ctx.beginPath();
              ctx.moveTo(rx, ry);
              ctx.lineTo(rx + Math.cos(a) * (reelR * 0.42), ry + Math.sin(a) * (reelR * 0.42));
              ctx.stroke();
            }

            // Center spindle
            ctx.fillStyle = '#090d16';
            ctx.beginPath();
            ctx.arc(rx, ry, reelR * 0.14, 0, Math.PI * 2);
            ctx.fill();
          };

          drawReel(leftReelX, reelY, vu.tapeAngle);
          drawReel(rightReelX, reelY, vu.tapeAngle * 0.95);

          const drawVUMeter = (
            mx: number,
            my: number,
            level: number,
            channelLabel: string
          ) => {
            ctx.save();
            ctx.fillStyle = '#14141e';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(mx, my, meterW, meterH, 14);
            ctx.fill();
            ctx.stroke();

            // Corner Screws
            ctx.fillStyle = '#475569';
            const screwOff = 7;
            for (const [sx, sy] of [
              [mx + screwOff, my + screwOff],
              [mx + meterW - screwOff, my + screwOff],
              [mx + screwOff, my + meterH - screwOff],
              [mx + meterW - screwOff, my + meterH - screwOff]
            ]) {
              ctx.beginPath();
              ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
              ctx.fill();
            }

            // Warm cream dial face
            const pad = 11;
            const dialW = meterW - pad * 2;
            const dialH = meterH - pad * 2;
            const dialX = mx + pad;
            const dialY = my + pad;

            const dialGrad = ctx.createLinearGradient(dialX, dialY, dialX, dialY + dialH);
            dialGrad.addColorStop(0, '#fef9c3');
            dialGrad.addColorStop(0.75, '#fef08a');
            dialGrad.addColorStop(1, '#fde047');
            ctx.fillStyle = dialGrad;
            ctx.beginPath();
            ctx.roundRect(dialX, dialY, dialW, dialH, 8);
            ctx.fill();

            const pivotX = dialX + dialW / 2;
            const pivotY = dialY + dialH * 1.08;
            const arcR = dialH * 0.96;

            const startA = -Math.PI * 0.68;
            const endA = -Math.PI * 0.32;
            const zeroA = startA + (endA - startA) * 0.72;

            // Black scale arc (-20 to 0)
            ctx.strokeStyle = '#18181b';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(pivotX, pivotY, arcR, startA, zeroA);
            ctx.stroke();

            // Red scale arc (0 to +3)
            ctx.strokeStyle = '#dc2626';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.arc(pivotX, pivotY, arcR, zeroA, endA);
            ctx.stroke();

            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const ticks = [
              { ratio: 0.0, label: '-20', isRed: false },
              { ratio: 0.22, label: '-10', isRed: false },
              { ratio: 0.38, label: '-7', isRed: false },
              { ratio: 0.52, label: '-5', isRed: false },
              { ratio: 0.62, label: '-3', isRed: false },
              { ratio: 0.72, label: '0', isRed: true },
              { ratio: 0.86, label: '+1', isRed: true },
              { ratio: 1.0, label: '+3', isRed: true }
            ];

            for (const t of ticks) {
              const a = startA + (endA - startA) * t.ratio;
              const cosA = Math.cos(a);
              const sinA = Math.sin(a);
              const innerR = arcR - 4;
              const outerR = arcR + (t.isRed || t.label === '0' ? 8 : 5);
              const textR = arcR - 12;

              ctx.strokeStyle = t.isRed ? '#dc2626' : '#18181b';
              ctx.lineWidth = t.isRed ? 2 : 1.5;
              ctx.beginPath();
              ctx.moveTo(pivotX + cosA * innerR, pivotY + sinA * innerR);
              ctx.lineTo(pivotX + cosA * outerR, pivotY + sinA * outerR);
              ctx.stroke();

              ctx.fillStyle = t.isRed ? '#dc2626' : '#27272a';
              ctx.fillText(t.label, pivotX + cosA * textR, pivotY + sinA * textR);
            }

            // VU Label
            ctx.fillStyle = '#18181b';
            ctx.font = '900 12px sans-serif';
            ctx.fillText('VU', pivotX, dialY + dialH * 0.42);
            ctx.font = 'bold 7px sans-serif';
            ctx.fillStyle = '#52525b';
            ctx.fillText(`${channelLabel} • WAVECRAFT ANALOG`, pivotX, dialY + dialH * 0.54);

            // Peak Warning LED
            const isPeaking = level > 0.72;
            const ledX = dialX + dialW - 14;
            const ledY = dialY + 12;
            ctx.beginPath();
            ctx.arc(ledX, ledY, 4, 0, Math.PI * 2);
            ctx.fillStyle = isPeaking ? '#ef4444' : '#7f1d1d';
            ctx.fill();
            if (isPeaking) {
              ctx.shadowColor = '#ef4444';
              ctx.shadowBlur = 10;
              ctx.stroke();
              ctx.shadowBlur = 0;
            }

            // Needle
            const needleRatio = Math.max(0, Math.min(1.05, level));
            const needleAngle = startA + (endA - startA) * needleRatio;
            const needleLen = arcR + 4;

            // Needle shadow
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(pivotX + 2, pivotY + 2);
            ctx.lineTo(
              pivotX + Math.cos(needleAngle) * needleLen + 2,
              pivotY + Math.sin(needleAngle) * needleLen + 2
            );
            ctx.stroke();

            // Needle Body
            ctx.strokeStyle = '#b91c1c';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(pivotX, pivotY);
            ctx.lineTo(
              pivotX + Math.cos(needleAngle) * needleLen,
              pivotY + Math.sin(needleAngle) * needleLen
            );
            ctx.stroke();

            // Pivot Hub
            ctx.fillStyle = '#18181b';
            ctx.beginPath();
            ctx.arc(pivotX, pivotY, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#3f3f46';
            ctx.beginPath();
            ctx.arc(pivotX, pivotY, 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
          };

          drawVUMeter(startX, meterY, vu.left, 'CH 1 LEFT');
          drawVUMeter(startX + meterW + meterSpacing, meterY, vu.right, 'CH 2 RIGHT');
        }

        // ==========================================
        // 3. 3D STARFIELD
        // ==========================================
        else if (style === 'starfield') {
          const cx = width / 2 + tilt.x * 40;
          const cy = height / 2 + tilt.y * 40;
          const speed = (isActive ? 3.5 + bassEnergy * 24 : 0.6) * dt;

          const coreGrad = ctx.createRadialGradient(
            cx,
            cy,
            2,
            cx,
            cy,
            Math.min(width, height) * (0.28 + bassEnergy * 0.2)
          );
          coreGrad.addColorStop(0, c0);
          coreGrad.addColorStop(0.5, c1);
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
            ctx.strokeStyle = star.hueOffset > 30 ? c0 : c1;
            ctx.globalAlpha = Math.min(1, depthRatio + 0.2);
            ctx.lineWidth = size;
            ctx.lineCap = 'round';
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(sx, sy, size * 0.7, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.globalAlpha = 1.0;
          }
        }

        // ==========================================
        // 4. 3D COSMIC NEBULA
        // ==========================================
        else if (style === 'nebula') {
          const cx = width / 2 + tilt.x * 35;
          const cy = height / 2 + tilt.y * 35;
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
              layerGrad.addColorStop(0, c0);
              layerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            } else if (layer === 1) {
              layerGrad.addColorStop(0, c1);
              layerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            } else {
              layerGrad.addColorStop(0, c2);
              layerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            }

            ctx.globalAlpha = layer === 0 ? 0.42 : layer === 1 ? 0.32 : 0.24;
            ctx.fillStyle = layerGrad;
            ctx.fill();

            ctx.strokeStyle = layer === 0 ? c0 : layer === 1 ? c1 : c2;
            ctx.globalAlpha = 0.35 + bassEnergy * 0.35;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
          }

          for (let i = 0; i < 24; i++) {
            const orbitAngle = (i / 24) * Math.PI * 2 + now * 0.0005 * (i % 2 === 0 ? 1 : -1);
            const orbitDist = minDim * (0.14 + (i % 5) * 0.065) + data[i] * minDim * 0.12;
            const ox = cx + Math.cos(orbitAngle) * orbitDist;
            const oy = cy + Math.sin(orbitAngle) * orbitDist;
            const dotR = 1.5 + data[i] * 4;

            ctx.beginPath();
            ctx.arc(ox, oy, dotR, 0, Math.PI * 2);
            ctx.fillStyle = i % 2 === 0 ? '#ffffff' : c0;
            ctx.fill();
          }
        }

        // ==========================================
        // 5. PARTICLES / BIOLUMINESCENT ORBS
        // ==========================================
        else if (style === 'particles') {
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
            glow.addColorStop(0, c0);
            glow.addColorStop(0.5, c1);
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
        }

        // ==========================================
        // 6. SPECTRUM BARS
        // ==========================================
        else if (style === 'bars') {
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
        }

        // ==========================================
        // 7. HARMONIC WAVE
        // ==========================================
        else if (style === 'wave') {
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
        }

        // ==========================================
        // 8. LIQUID BLOB
        // ==========================================
        else if (style === 'blob') {
          const centerX = width / 2;
          const centerY = height / 2;
          const baseRadius = Math.min(width, height) * 0.24;

          const halo = ctx.createRadialGradient(
            centerX,
            centerY,
            baseRadius * 0.5,
            centerX,
            centerY,
            baseRadius * 1.9
          );
          halo.addColorStop(0, c0);
          halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = halo;
          ctx.globalAlpha = 0.32;
          ctx.beginPath();
          ctx.arc(centerX, centerY, baseRadius * 1.9, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1.0;

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
        }

        // ==========================================
        // 9. RADIAL HALO CIRCULAR
        // ==========================================
        else if (style === 'circular') {
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
          ctx.arc(centerX, centerY, Math.max(1, radius - 8), 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(6, 6, 11, 0.65)';
          ctx.fill();
          ctx.strokeStyle = gradient;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (style === 'quantum-tunnel') {
          // Quantum Hyperdrive Hexagonal Tunnel - Perfectly Sorted Continuous 120fps Depth Rails
          tunnelRotationRef.current += (0.005 + bassEnergy * 0.018) * dt;
          tunnelZOffsetRef.current = (tunnelZOffsetRef.current + (0.0025 + bassEnergy * 0.006) * dt) % 1;
          const cx = width / 2 + tilt.x * 40;
          const cy = height / 2 + tilt.y * 30;
          const maxRadius = Math.hypot(width, height) * 0.68;
          const rings = 18;
          const sides = 6; // Hexagonal geometry

          // Central hyperspace void / singularity glow
          const coreGlow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 65 + bassEnergy * 55);
          coreGlow.addColorStop(0, '#ffffff');
          coreGlow.addColorStop(0.25, c0);
          coreGlow.addColorStop(0.55, toRgba(c1, 0.53));
          coreGlow.addColorStop(1, 'rgba(6, 6, 12, 0)');
          ctx.fillStyle = coreGlow;
          ctx.beginPath();
          ctx.arc(cx, cy, 65 + bassEnergy * 55, 0, Math.PI * 2);
          ctx.fill();

          // Calculate ring progressions sorted strictly by depth (singularity 0 -> camera 1)
          const ringProgs = tunnelRingProgRef.current;
          const ringIdxs = tunnelRingIdxRef.current;
          for (let r = 0; r < rings; r++) {
            ringProgs[r] = (r / rings + tunnelZOffsetRef.current) % 1;
            ringIdxs[r] = r;
          }
          // Zero-allocation insertion sort in-place (18 elements)
          for (let i = 1; i < rings; i++) {
            const keyProg = ringProgs[i];
            const keyIdx = ringIdxs[i];
            let j = i - 1;
            while (j >= 0 && ringProgs[j] > keyProg) {
              ringProgs[j + 1] = ringProgs[j];
              ringIdxs[j + 1] = ringIdxs[j];
              j--;
            }
            ringProgs[j + 1] = keyProg;
            ringIdxs[j + 1] = keyIdx;
          }

          const ptsX = tunnelPtsXRef.current;
          const ptsY = tunnelPtsYRef.current;

          for (let i = 0; i < rings; i++) {
            const progress = ringProgs[i];
            const ringIndex = ringIdxs[i];
            const depth = Math.pow(progress, 2.2);
            const radius = Math.max(6, depth * maxRadius);
            const freqIdx = Math.min(63, Math.floor(ringIndex * (64 / rings)));
            const freqAudio = data[freqIdx] || 0;
            const ringAngle = tunnelRotationRef.current + progress * 0.8;

            const ringBase = i * sides;
            for (let s = 0; s < sides; s++) {
              const theta = ringAngle + (s * 2 * Math.PI) / sides;
              const distortion = 1 + freqAudio * 0.28 + Math.sin(theta * 3 + now * 0.004) * 0.06 * bassEnergy;
              const rad = radius * distortion;
              ptsX[ringBase + s] = cx + Math.cos(theta) * rad;
              ptsY[ringBase + s] = cy + Math.sin(theta) * rad;
            }

            // Ring perimeter with smooth sine fade-in at singularity and fade-out at screen boundary
            const ringAlpha = Math.sin(progress * Math.PI);
            ctx.beginPath();
            ctx.moveTo(ptsX[ringBase], ptsY[ringBase]);
            for (let s = 1; s < sides; s++) {
              ctx.lineTo(ptsX[ringBase + s], ptsY[ringBase + s]);
            }
            ctx.closePath();

            ctx.strokeStyle = ringIndex % 3 === 0 ? c0 : ringIndex % 3 === 1 ? c1 : c2;
            ctx.lineWidth = Math.max(1, depth * 3.6 * (1 + freqAudio * 0.6));
            ctx.globalAlpha = ringAlpha * (0.35 + freqAudio * 0.55);
            ctx.stroke();
          }

          // Tunnel longitudinal warp rails connecting rings strictly in depth order (never tangles!)
          for (let s = 0; s < sides; s++) {
            ctx.beginPath();
            ctx.moveTo(ptsX[s], ptsY[s]);
            for (let r = 1; r < rings; r++) {
              ctx.lineTo(ptsX[r * sides + s], ptsY[r * sides + s]);
            }
            ctx.strokeStyle = s % 2 === 0 ? c1 : c2;
            ctx.lineWidth = 1.4;
            ctx.globalAlpha = 0.4 + bassEnergy * 0.4;
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        } else if (style === 'solar-flare') {
          // Solar Flare & Pulsar Corona
          flareAngleRef.current += (0.005 + bassEnergy * 0.02) * dt;
          const cx = width / 2 + tilt.x * 35;
          const cy = height / 2 + tilt.y * 25;
          const baseRadius = Math.min(width, height) * 0.16 + bassEnergy * 28;

          // Multi-layer glowing corona
          const coronaGlow = ctx.createRadialGradient(cx, cy, baseRadius * 0.4, cx, cy, baseRadius * 2.8);
          coronaGlow.addColorStop(0, toRgba(c0, 0.93));
          coronaGlow.addColorStop(0.35, toRgba(c1, 0.53));
          coronaGlow.addColorStop(0.7, toRgba(c2, 0.2));
          coronaGlow.addColorStop(1, 'rgba(6, 6, 12, 0)');
          ctx.fillStyle = coronaGlow;
          ctx.beginPath();
          ctx.arc(cx, cy, baseRadius * 2.8, 0, Math.PI * 2);
          ctx.fill();

          // Coronal flares & prominence loops
          const rayCount = 48;
          ctx.save();
          ctx.translate(cx, cy);
          for (let i = 0; i < rayCount; i++) {
            const angle = (i * 2 * Math.PI) / rayCount + flareAngleRef.current;
            const freqIdx = Math.floor((i / rayCount) * 48);
            const audioVal = data[freqIdx] || 0;
            const flareLen = baseRadius + audioVal * (baseRadius * 1.5) + Math.sin(i * 3 + now * 0.006) * 14;

            const p1x = Math.cos(angle) * (baseRadius * 0.95);
            const p1y = Math.sin(angle) * (baseRadius * 0.95);
            const p2x = Math.cos(angle) * flareLen;
            const p2y = Math.sin(angle) * flareLen;

            // Arcing prominence loop curve
            const curveOffset = Math.sin(i * 1.5 + now * 0.008) * (20 + audioVal * 30);
            const cpx = Math.cos(angle + 0.1) * (flareLen * 0.7) - Math.sin(angle) * curveOffset;
            const cpy = Math.sin(angle + 0.1) * (flareLen * 0.7) + Math.cos(angle) * curveOffset;

            ctx.beginPath();
            ctx.moveTo(p1x, p1y);
            ctx.quadraticCurveTo(cpx, cpy, p2x, p2y);

            const rayGrad = ctx.createLinearGradient(p1x, p1y, p2x, p2y);
            rayGrad.addColorStop(0, c0);
            rayGrad.addColorStop(0.5, c1);
            rayGrad.addColorStop(1, toRgba(c2, 0));

            ctx.strokeStyle = rayGrad;
            ctx.lineWidth = Math.max(1.2, 2.5 * (1 + audioVal));
            ctx.globalAlpha = 0.5 + audioVal * 0.5;
            ctx.stroke();
          }
          ctx.restore();

          // Central stellar core
          const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius);
          coreGrad.addColorStop(0, '#ffffff');
          coreGrad.addColorStop(0.3, c0);
          coreGrad.addColorStop(0.8, c1);
          coreGrad.addColorStop(1, 'rgba(10, 10, 20, 0.9)');
          ctx.fillStyle = coreGrad;
          ctx.beginPath();
          ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = c0;
          ctx.lineWidth = 2 + bassEnergy * 4;
          ctx.globalAlpha = 0.9;
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (style === 'kaleidoscope') {
          // Sacred Mandala Prism Kaleidoscope - Radiant Sacred Geometry & Blooming Lotus
          tunnelRotationRef.current += (0.003 + bassEnergy * 0.012) * dt;
          const cx = width / 2 + tilt.x * 40;
          const cy = height / 2 + tilt.y * 30;
          const maxRadius = Math.min(width, height) * 0.48;
          const sectors = 12;
          const stepAngle = (2 * Math.PI) / sectors;

          // Background Sacred Harmonic Geometry Aura
          const aura = ctx.createRadialGradient(cx, cy, 10, cx, cy, maxRadius * 1.15);
          aura.addColorStop(0, toRgba(c0, 0.33));
          aura.addColorStop(0.35, toRgba(c1, 0.2));
          aura.addColorStop(0.7, toRgba(c2, 0.09));
          aura.addColorStop(1, 'rgba(6, 6, 12, 0)');
          ctx.fillStyle = aura;
          ctx.beginPath();
          ctx.arc(cx, cy, maxRadius * 1.15, 0, Math.PI * 2);
          ctx.fill();

          // Concentric Sacred Rings with Golden-Ratio Geometry
          const ringRadii = [
            maxRadius * 0.28,
            maxRadius * 0.52,
            maxRadius * 0.78,
            maxRadius * 0.98
          ];
          for (let r = 0; r < ringRadii.length; r++) {
            const freqVal = data[r * 12] || 0;
            const ringR = ringRadii[r] * (1 + freqVal * 0.12 + bassEnergy * 0.08);
            ctx.beginPath();
            ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
            ctx.strokeStyle = r % 2 === 0 ? c1 : c2;
            ctx.lineWidth = 1 + freqVal * 1.8;
            ctx.globalAlpha = 0.25 + freqVal * 0.35;
            ctx.stroke();

            // Interlocking Sacred Circle Arcs (Flower of Life effect)
            if (r === 1 || r === 2) {
              const nodeCount = sectors;
              for (let n = 0; n < nodeCount; n++) {
                const nodeAngle = (n * 2 * Math.PI) / nodeCount + tunnelRotationRef.current * (r === 1 ? 0.5 : -0.5);
                const nx = cx + Math.cos(nodeAngle) * ringR;
                const ny = cy + Math.sin(nodeAngle) * ringR;
                ctx.beginPath();
                ctx.arc(nx, ny, ringR * 0.32, 0, Math.PI * 2);
                ctx.strokeStyle = c0;
                ctx.lineWidth = 0.8;
                ctx.globalAlpha = 0.18 + bassEnergy * 0.22;
                ctx.stroke();
              }
            }
          }

          // Blooming Sacred Lotus Petals (Curved Bezier Jewels)
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(tunnelRotationRef.current);

          for (let l = 0; l < KALEIDOSCOPE_LAYERS.length; l++) {
            const layer = KALEIDOSCOPE_LAYERS[l];
            ctx.save();
            if (layer.rotOffsetStep) ctx.rotate(stepAngle * layer.rotOffsetStep);
            const layerColor = layer.colorIdx === 0 ? c0 : layer.colorIdx === 1 ? c1 : c2;
            const rBase = maxRadius * layer.rBaseMul;
            const extraTip =
              layer.bassScale !== undefined
                ? bassEnergy * layer.bassScale
                : (data[layer.dataFreqIdx || 0] || 0) * (layer.dataFreqScale || 0);
            const rTipBase = maxRadius * (layer.rTipMul + extraTip);

            for (let s = 0; s < layer.count; s++) {
              const theta = (s * 2 * Math.PI) / layer.count;
              const freqVal = data[(layer.freqStart + s) % 64] || 0;
              const rTip = rTipBase * (1 + freqVal * 0.25);
              const halfSpread = (Math.PI / layer.count) * 0.95;

              const b1x = Math.cos(theta - halfSpread) * rBase;
              const b1y = Math.sin(theta - halfSpread) * rBase;
              const b2x = Math.cos(theta + halfSpread) * rBase;
              const b2y = Math.sin(theta + halfSpread) * rBase;

              const tipX = Math.cos(theta) * rTip;
              const tipY = Math.sin(theta) * rTip;

              const cpDist = (rBase + rTip) * 0.55;
              const cpBulge = halfSpread * 1.45 * (1 + freqVal * 0.35);
              const cp1x = Math.cos(theta - cpBulge) * cpDist;
              const cp1y = Math.sin(theta - cpBulge) * cpDist;
              const cp2x = Math.cos(theta + cpBulge) * cpDist;
              const cp2y = Math.sin(theta + cpBulge) * cpDist;

              ctx.beginPath();
              ctx.moveTo(b1x, b1y);
              ctx.quadraticCurveTo(cp1x, cp1y, tipX, tipY);
              ctx.quadraticCurveTo(cp2x, cp2y, b2x, b2y);
              ctx.closePath();

              const petalGrad = ctx.createLinearGradient(0, 0, tipX, tipY);
              petalGrad.addColorStop(0, toRgba(layerColor, 0.08));
              petalGrad.addColorStop(0.6, toRgba(layerColor, 0.27));
              petalGrad.addColorStop(1, 'rgba(255, 255, 255, 0.21)');
              ctx.fillStyle = petalGrad;
              ctx.globalAlpha = 0.45 + freqVal * 0.45;
              ctx.fill();

              ctx.strokeStyle = layerColor;
              ctx.lineWidth = Math.max(1.2, 2.2 * (1 + freqVal * 0.8));
              ctx.globalAlpha = 0.65 + freqVal * 0.35;
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(Math.cos(theta) * rBase, Math.sin(theta) * rBase);
              ctx.lineTo(tipX, tipY);
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1;
              ctx.globalAlpha = 0.3 + freqVal * 0.5;
              ctx.stroke();
            }
            ctx.restore();
          }
          ctx.restore();

          // Central Radiant Sacred Star Gemstone
          const gemRadius = 24 + bassEnergy * 22;
          const gemGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, gemRadius * 1.8);
          gemGrad.addColorStop(0, '#ffffff');
          gemGrad.addColorStop(0.3, c0);
          gemGrad.addColorStop(0.7, toRgba(c1, 0.53));
          gemGrad.addColorStop(1, 'rgba(6, 6, 12, 0)');
          ctx.fillStyle = gemGrad;
          ctx.beginPath();
          ctx.arc(cx, cy, gemRadius * 1.8, 0, Math.PI * 2);
          ctx.fill();

          // 12-Pointed Golden Core Star
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(-tunnelRotationRef.current * 1.5);
          ctx.beginPath();
          const starPoints = 12;
          for (let p = 0; p < starPoints * 2; p++) {
            const rad = p % 2 === 0 ? gemRadius : gemRadius * 0.45;
            const ang = (p * Math.PI) / starPoints;
            const px = Math.cos(ang) * rad;
            const py = Math.sin(ang) * rad;
            if (p === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = 0.9;
          ctx.fill();
          ctx.strokeStyle = c0;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
          ctx.globalAlpha = 1;
        } else if (style === 'matrix-rain') {
          // Cyber Matrix Digital Rain Cascade - Silky 120fps Batched Render Pipeline
          const colWidth = 20;
          const numCols = Math.max(1, Math.floor(width / colWidth));
          const chars = '0123456789ABCDEFｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ';

          if (matrixColsRef.current.length !== numCols) {
            matrixColsRef.current = Array.from({ length: numCols }, (_, idx) => ({
              x: idx * colWidth,
              y: Math.random() * -height,
              speed: 2 + Math.random() * 4,
              chars: Array.from({ length: 22 }, () => chars[Math.floor(Math.random() * chars.length)])
            }));
          }

          if (matrixHeadIdxRef.current.length < numCols) {
            matrixHeadIdxRef.current = new Int32Array(numCols);
          }

          ctx.font = '13px monospace';
          ctx.textAlign = 'center';
          ctx.shadowBlur = 0;

          // Perspective and audio-driven fall
          const globalSpeed = (1 + bassEnergy * 2.8) * dt;
          let headCount = 0;
          const headIdxs = matrixHeadIdxRef.current;
          const colWidthHalf = colWidth / 2;

          // Pass 1: Trailing stream glyphs (zero shadow blur overhead for high 120fps throughput)
          for (let c = 0; c < matrixColsRef.current.length; c++) {
            const col = matrixColsRef.current[c];
            const freqIdx = Math.min(63, Math.floor((c / numCols) * 64));
            const freqVal = data[freqIdx] || 0;

            col.y += (col.speed + freqVal * 8) * globalSpeed;
            if (col.y - 22 * 16 > height) {
              col.y = Math.random() * -60;
              col.speed = 2 + Math.random() * 4;
            }

            // Smooth delta-timed character mutation (eliminates 120Hz strobing flicker)
            if (Math.random() < (0.05 + bassEnergy * 0.12) * dt) {
              const charIdx = Math.floor(Math.random() * col.chars.length);
              col.chars[charIdx] = chars[Math.floor(Math.random() * chars.length)];
            }

            const colCenterX = col.x + colWidthHalf;

            // Draw trailing glyphs (from dimmest tail to brighter body)
            for (let i = 1; i < col.chars.length; i++) {
              const charY = col.y - i * 16;
              if (charY < -16 || charY > height + 16) continue;

              const trailAlpha = Math.max(0.08, (1 - i / col.chars.length) * (0.55 + freqVal * 0.45));
              ctx.fillStyle = i < 4 ? c2 : i < 10 ? c1 : c0;
              ctx.globalAlpha = trailAlpha;
              ctx.fillText(col.chars[i], colCenterX, charY);
            }

            // Collect valid head glyphs into pre-allocated buffer
            if (col.y >= -16 && col.y <= height + 16 && headCount < headIdxs.length) {
              headIdxs[headCount++] = c;
            }
          }

          // Pass 2: Batched glowing head glyphs (single shadow blur state switch across entire frame!)
          if (headCount > 0) {
            ctx.shadowColor = c2;
            ctx.shadowBlur = 8 + bassEnergy * 10;
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = 1;
            for (let h = 0; h < headCount; h++) {
              const col = matrixColsRef.current[headIdxs[h]];
              if (col) {
                ctx.fillText(col.chars[0], col.x + colWidthHalf, col.y);
              }
            }
            ctx.shadowBlur = 0;
          }

          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        } else if (style === 'laser-oscilloscope') {
          // Lissajous Laser Beam CRT Oscilloscope - Phosphor Persistence & Silky Vector Beam
          oscPhaseRef.current += (0.012 + bassEnergy * 0.028) * dt;
          const cx = width / 2 + tilt.x * 40;
          const cy = height / 2 + tilt.y * 30;
          const scale = Math.min(width, height) * 0.36;
          const samples = 720; // Silky smooth 120fps curve

          // CRT phosphor reticle
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cx, cy, scale * 1.08, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx - scale * 1.08, cy);
          ctx.lineTo(cx + scale * 1.08, cy);
          ctx.moveTo(cx, cy - scale * 1.08);
          ctx.lineTo(cx, cy + scale * 1.08);
          ctx.stroke();

          // Harmonic Lissajous ratios (2:3 with audio-reactive phase drift)
          const delta = oscPhaseRef.current;
          const harmonicFreqA = 2;
          const harmonicFreqB = 3;

          // Build continuous closed loop points with smooth Catmull-Rom interpolation
          const lx = laserPtsXRef.current;
          const ly = laserPtsYRef.current;
          for (let i = 0; i <= samples; i++) {
            const t = (i / samples) * Math.PI * 2;
            // Symmetric audio envelope that wraps seamlessly with 0 discontinuity at t = 0 and 2pi
            const normT = i / samples;
            const freqIdx = Math.floor(Math.abs(Math.sin(normT * Math.PI)) * 31);
            const audioWarp = (data[freqIdx] || 0) * 0.28 * Math.sin(t * 6 + delta);
            const amp = scale * (0.82 + bassEnergy * 0.22 + audioWarp);

            lx[i] = cx + Math.sin(harmonicFreqA * t + delta) * amp;
            ly[i] = cy + Math.sin(harmonicFreqB * t) * amp;
          }

          // Render with smooth quadratic splines through points
          const drawBeamPath = () => {
            ctx.beginPath();
            ctx.moveTo(lx[0], ly[0]);
            for (let i = 0; i < samples; i++) {
              const mx = (lx[i] + lx[i + 1]) * 0.5;
              const my = (ly[i] + ly[i + 1]) * 0.5;
              ctx.quadraticCurveTo(lx[i], ly[i], mx, my);
            }
            ctx.closePath();
          };

          // 3-Pass Phosphor Glow Pipeline
          // Pass 1: Wide neon bloom glow
          drawBeamPath();
          ctx.strokeStyle = c0;
          ctx.lineWidth = 8 + bassEnergy * 8;
          ctx.globalAlpha = 0.35 + bassEnergy * 0.3;
          ctx.shadowColor = c0;
          ctx.shadowBlur = 24;
          ctx.stroke();

          // Pass 2: Vivid mid beam
          drawBeamPath();
          ctx.strokeStyle = c1;
          ctx.lineWidth = 3.2;
          ctx.globalAlpha = 0.8;
          ctx.shadowColor = c1;
          ctx.shadowBlur = 10;
          ctx.stroke();

          // Pass 3: Ultra-bright laser core
          drawBeamPath();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.4;
          ctx.globalAlpha = 0.98;
          ctx.shadowBlur = 0;
          ctx.stroke();

          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        }

        ctx.restore();

        const tiltSettled =
          Math.abs(tilt.targetX - tilt.x) < 0.002 && Math.abs(tilt.targetY - tilt.y) < 0.002;
        const vuSettled =
          style !== 'analog-vu' ||
          (vuNeedleRef.current.left < 0.002 && vuNeedleRef.current.right < 0.002);
        const trailSettled = style !== 'laser-oscilloscope' || idleFramesRef.current > 24;

        if (!isAudioActive && maxIdleDelta < 0.002 && tiltSettled && vuSettled && trailSettled) {
          requestRef.current = 0;
          return;
        }

        requestRef.current = requestAnimationFrame(draw);
      },
      []
    );

    const wakeDraw = useCallback(() => {
      idleFramesRef.current = 0;
      if (typeof document !== 'undefined' && document.hidden) return;
      if (!requestRef.current) {
        lastTimeRef.current = performance.now();
        requestRef.current = requestAnimationFrame(draw);
      }
    }, [draw]);

    useEffect(() => {
      wakeDraw();
    }, [isActive, style, colors, fullScreen, wakeDraw]);

    useEffect(() => {
      const canvas = canvasRef.current;

      const handleResize = () => {
        const target = canvasRef.current;
        if (target && target.parentElement) {
          const rect = target.parentElement.getBoundingClientRect();
          const dpr = Math.min(2.5, window.devicePixelRatio || 1);
          const w = Math.round(rect.width);
          const h = Math.round(rect.height);
          if (w > 0 && h > 0) {
            const nextW = Math.round(w * dpr);
            const nextH = Math.round(h * dpr);
            if (target.width !== nextW || target.height !== nextH) {
              target.width = nextW;
              target.height = nextH;
            }
          }
          wakeDraw();
        }
      };

      const handlePointerMove = (e: MouseEvent | TouchEvent) => {
        let clientX = 0;
        let clientY = 0;
        if ('touches' in e && e.touches.length > 0) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        } else if ('clientX' in e) {
          clientX = (e as MouseEvent).clientX;
          clientY = (e as MouseEvent).clientY;
        }
        const w = window.innerWidth || 1000;
        const h = window.innerHeight || 800;
        const nx = (clientX / w) * 2 - 1; // -1 to 1
        const ny = (clientY / h) * 2 - 1; // -1 to 1
        tiltRef.current.targetX = Math.max(-1, Math.min(1, nx));
        tiltRef.current.targetY = Math.max(-1, Math.min(1, ny));
        wakeDraw();
      };

      const handleVisibilityChange = () => {
        if (!document.hidden) {
          cancelAnimationFrame(requestRef.current);
          requestRef.current = 0;
          lastTimeRef.current = performance.now();
          requestRef.current = requestAnimationFrame(draw);
        } else {
          cancelAnimationFrame(requestRef.current);
          requestRef.current = 0;
        }
      };

      const resizeObserver =
        typeof ResizeObserver !== 'undefined' && canvas?.parentElement
          ? new ResizeObserver(() => handleResize())
          : null;
      if (resizeObserver && canvas?.parentElement) {
        resizeObserver.observe(canvas.parentElement);
      }

      const unsubStore = usePlayerStore.subscribe((state, prevState) => {
        if (state.isMuted !== prevState.isMuted || state.volume !== prevState.volume) {
          wakeDraw();
        }
      });

      handleResize();
      window.addEventListener('resize', handleResize);
      window.addEventListener('mousemove', handlePointerMove, { passive: true });
      window.addEventListener('touchmove', handlePointerMove, { passive: true });
      document.addEventListener('visibilitychange', handleVisibilityChange);
      if (typeof document === 'undefined' || !document.hidden) {
        lastTimeRef.current = performance.now();
        if (!requestRef.current) {
          requestRef.current = requestAnimationFrame(draw);
        }
      }

      return () => {
        resizeObserver?.disconnect();
        unsubStore();
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('mousemove', handlePointerMove);
        window.removeEventListener('touchmove', handlePointerMove);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        cancelAnimationFrame(requestRef.current);
        requestRef.current = 0;
      };
    }, [draw, wakeDraw]);

    const containerClasses = fullScreen
      ? 'absolute inset-0 w-full h-full pointer-events-none'
      : 'relative w-full h-full min-h-[200px] bg-white/5 dark:bg-black/20 backdrop-blur-md rounded-2xl border-0 shadow-lg overflow-hidden gpu-layer';

    return (
      <div className={containerClasses}>
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>
    );
  }
);

Visualizer.displayName = 'Visualizer';

export default Visualizer;
