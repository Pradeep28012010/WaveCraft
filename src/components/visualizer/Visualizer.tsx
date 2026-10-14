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

    // 3D Perspective Tilt and Audio Dynamic Physics
    const tiltRef = useRef<{ x: number; y: number; targetX: number; targetY: number }>({
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0
    });
    const meshOffsetRef = useRef<number>(0);
    const vuNeedleRef = useRef<{ left: number; right: number; tapeAngle: number }>({
      left: 0,
      right: 0,
      tapeAngle: 0
    });

    const initStarsAndParticles = (width: number, height: number) => {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      const starCount = isMobile ? 45 : 140;
      const particleCount = isMobile ? 20 : 55;
      if (starsRef.current.length === 0) {
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
      if (particlesRef.current.length === 0) {
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

        // Smooth camera tilt damping
        const tilt = tiltRef.current;
        tilt.x += (tilt.targetX - tilt.x) * (0.08 * dt);
        tilt.y += (tilt.targetY - tilt.y) * (0.08 * dt);

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
          const fov = height * 0.72;
          const camY = height * 0.36 + tilt.y * 35;

          // Horizon Glow & Synthwave Sun
          const sunR = Math.min(width, height) * (0.17 + bassEnergy * 0.06);
          const sunX = cx + tilt.x * 30;
          const sunY = horizonY - 12;

          const sunGlow = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR * 1.8);
          sunGlow.addColorStop(0, c0);
          sunGlow.addColorStop(0.5, c1);
          sunGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = sunGlow;
          ctx.beginPath();
          ctx.arc(sunX, sunY, sunR * 1.8, 0, Math.PI * 2);
          ctx.fill();

          // Sun Disk with retro scanline slats
          ctx.save();
          ctx.beginPath();
          ctx.arc(sunX, sunY, sunR, Math.PI, 0); // Upper half above horizon
          ctx.clip();
          const sunDiskGrad = ctx.createLinearGradient(sunX, sunY - sunR, sunX, sunY);
          sunDiskGrad.addColorStop(0, '#fef08a');
          sunDiskGrad.addColorStop(0.4, c0);
          sunDiskGrad.addColorStop(1, c1);
          ctx.fillStyle = sunDiskGrad;
          ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);

          const slats = 6;
          ctx.fillStyle = '#06060b';
          for (let s = 1; s <= slats; s++) {
            const slatH = s * (sunR * 0.028);
            const slatY = sunY - (s / (slats + 1)) * sunR;
            ctx.fillRect(sunX - sunR, slatY, sunR * 2, slatH);
          }
          ctx.restore();

          // 3D Terrain Grid
          const cols = 22;
          const rows = 24;
          const rowSpacing = 36;
          meshOffsetRef.current =
            (meshOffsetRef.current + (isActive ? 1.4 + bassEnergy * 3.0 : 0.35) * dt) % rowSpacing;

          const gridPoints: Array<Array<{ sx: number; sy: number; alpha: number }>> = [];

          for (let r = 0; r < rows; r++) {
            const distZ = r * rowSpacing - meshOffsetRef.current;
            if (distZ < 4) continue;
            const proj = fov / (fov + distZ);
            const rowAlpha = Math.max(0, Math.min(1, (1 - distZ / (rows * rowSpacing)) * 1.5));
            const rowPoints: Array<{ sx: number; sy: number; alpha: number }> = [];

            for (let c = -cols / 2; c <= cols / 2; c++) {
              const normC = c / (cols / 2); // -1 to 1
              const colSpacing = (width * 1.75) / cols;
              const worldX = c * colSpacing + tilt.x * 65;

              // Mountain ridge elevation: canyon in center, reactive mountains on sides
              const valley = Math.pow(Math.abs(normC), 2.2);
              const freqIdx = Math.min(31, Math.floor(Math.abs(normC) * 32));
              const freqVal = data[freqIdx] || 0;
              const ripple = Math.sin(distZ * 0.035 - now * 0.003 + c * 0.45) * (14 + bassEnergy * 34);
              const worldY = -valley * (freqVal * 115 + 38) - ripple;

              const sx = cx + worldX * proj;
              const sy = horizonY + (camY + worldY) * proj;
              rowPoints.push({ sx, sy, alpha: rowAlpha });
            }
            gridPoints.push(rowPoints);
          }

          // Draw latitudinal lines (horizontal ribbons)
          for (let r = 0; r < gridPoints.length; r++) {
            const pts = gridPoints[r];
            if (pts.length < 2) continue;
            ctx.beginPath();
            ctx.moveTo(pts[0].sx, pts[0].sy);
            for (let i = 1; i < pts.length; i++) {
              ctx.lineTo(pts[i].sx, pts[i].sy);
            }
            const rAlpha = pts[0].alpha;
            ctx.strokeStyle = r % 2 === 0 ? c0 : c1;
            ctx.globalAlpha = rAlpha * (0.45 + bassEnergy * 0.4);
            ctx.lineWidth = Math.max(1, 2.4 * rAlpha);
            ctx.stroke();
          }

          // Draw longitudinal lines (perspective lines converging towards horizon)
          const numPtsInRow = gridPoints[0]?.length || 0;
          for (let c = 0; c < numPtsInRow; c++) {
            ctx.beginPath();
            let started = false;
            for (let r = 0; r < gridPoints.length; r++) {
              const pt = gridPoints[r][c];
              if (!pt) continue;
              if (!started) {
                ctx.moveTo(pt.sx, pt.sy);
                started = true;
              } else {
                ctx.lineTo(pt.sx, pt.sy);
              }
            }
            const normC = Math.abs((c - numPtsInRow / 2) / (numPtsInRow / 2));
            ctx.strokeStyle = normC > 0.45 ? c0 : c2;
            ctx.globalAlpha = 0.55 + bassEnergy * 0.35;
            ctx.lineWidth = 1.4;
            ctx.stroke();
          }
          ctx.globalAlpha = 1.0;
        }

        // ==========================================
        // 2. VINTAGE ANALOG VU METER & TAPE DECK
        // ==========================================
        else if (style === 'analog-vu') {
          const vu = vuNeedleRef.current;
          const leftEnergy = Math.min(
            1,
            Math.max(0, (data[1] * 0.5 + data[2] * 0.3 + data[3] * 0.2) * 1.45)
          );
          const rightEnergy = Math.min(
            1,
            Math.max(0, (data[5] * 0.3 + data[8] * 0.4 + data[12] * 0.3) * 1.45)
          );

          const attack = 0.38 * dt;
          const release = 0.09 * dt;
          vu.left += (leftEnergy - vu.left) * (leftEnergy > vu.left ? attack : release);
          vu.right += (rightEnergy - vu.right) * (rightEnergy > vu.right ? attack : release);

          if (isActive) {
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
      window.addEventListener('mousemove', handlePointerMove, { passive: true });
      window.addEventListener('touchmove', handlePointerMove, { passive: true });
      document.addEventListener('visibilitychange', handleVisibilityChange);
      lastTimeRef.current = performance.now();
      requestRef.current = requestAnimationFrame(draw);

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('mousemove', handlePointerMove);
        window.removeEventListener('touchmove', handlePointerMove);
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
