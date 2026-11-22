import type { Track, LyricLine } from '../../types';
import { formatTime } from '../../utils/formatTime';
import { apiUrl } from '../../services/apiConfig';

export interface CardTheme {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  bgStart: string;
  bgEnd: string;
}

export const CARD_THEMES: CardTheme[] = [
  {
    id: 'galaxy',
    name: '8-Sector Galaxy',
    primary: '#06b6d4',
    secondary: '#ec4899',
    bgStart: '#08172e',
    bgEnd: '#050510'
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk 2099',
    primary: '#00f5ff',
    secondary: '#ff007f',
    bgStart: '#150529',
    bgEnd: '#05030f'
  },
  {
    id: 'aurora',
    name: 'Solaris Aurora',
    primary: '#10e7b8',
    secondary: '#38bdf8',
    bgStart: '#04221d',
    bgEnd: '#0c071e'
  },
  {
    id: 'crimson',
    name: 'Crimson Pulse',
    primary: '#fa2d48',
    secondary: '#9333ea',
    bgStart: '#230714',
    bgEnd: '#07070c'
  },
  {
    id: 'violet',
    name: 'Cosmic Nebula',
    primary: '#8b5cf6',
    secondary: '#06b6d4',
    bgStart: '#140b2e',
    bgEnd: '#06060f'
  },
  {
    id: 'gold',
    name: 'Sunset Vinyl',
    primary: '#f59e0b',
    secondary: '#ec4899',
    bgStart: '#271505',
    bgEnd: '#08060a'
  },
  {
    id: 'emerald',
    name: 'Emerald Studio',
    primary: '#10b981',
    secondary: '#3b82f6',
    bgStart: '#06241d',
    bgEnd: '#05080c'
  },
  {
    id: 'obsidian',
    name: 'Obsidian Velvet',
    primary: '#e2e8f0',
    secondary: '#64748b',
    bgStart: '#121318',
    bgEnd: '#020204'
  }
];

export const loadImg = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

export async function fetchAudioBinary(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      if (buf && buf.byteLength > 1024) return buf;
    }
  } catch {}

  try {
    const proxyUrl = apiUrl(`/api/music?action=proxy-stream&url=${encodeURIComponent(url)}`);
    const res = await fetch(proxyUrl);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      if (buf && buf.byteLength > 1024) return buf;
    }
  } catch {}

  return null;
}

export function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export function computeAudioMetrics(
  ch0: Float32Array,
  ch1: Float32Array,
  centerSample: number,
  barCount: number = 36
): { bassPulse: number; freqData: number[] } {
  const windowSize = 1024;
  const start = Math.max(0, centerSample - Math.floor(windowSize / 2));
  const end = Math.min(ch0.length, start + windowSize);
  const actualLen = end - start;

  if (actualLen <= 0) {
    return { bassPulse: 0.2, freqData: new Array(barCount).fill(20) };
  }

  let bassSum = 0;
  const bandSize = Math.max(1, Math.floor(actualLen / barCount));
  const freqData: number[] = new Array(barCount).fill(0);

  for (let b = 0; b < barCount; b++) {
    let bandEnergy = 0;
    const bStart = start + b * bandSize;
    const bEnd = Math.min(end, bStart + bandSize);
    const count = bEnd - bStart;
    if (count > 0) {
      for (let i = bStart; i < bEnd; i++) {
        const s = (ch0[i] + ch1[i]) * 0.5;
        bandEnergy += Math.abs(s);
        if (b < 4) bassSum += Math.abs(s);
      }
      const avg = bandEnergy / count;
      freqData[b] = Math.min(255, Math.floor(avg * 450));
    }
  }

  const bassPulse = Math.min(1, (bassSum / (4 * Math.max(1, bandSize))) * 2.2);
  return { bassPulse, freqData };
}

export function drawStoryFrame(
  ctx: CanvasRenderingContext2D,
  songTime: number,
  elapsedSec: number,
  totalSec: number,
  bassPulse: number,
  freqData: number[] | Uint8Array,
  artImg: HTMLImageElement | null,
  track: Track,
  lyrics: LyricLine[],
  selectedQuote: string,
  activeTheme: CardTheme,
  sectorName?: string,
  matchScore?: number
) {
  const W = 720;
  const H = 1280;
  const t = elapsedSec;

  // 1. Background Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, activeTheme.bgStart);
  bgGrad.addColorStop(0.55, '#090912');
  bgGrad.addColorStop(1, activeTheme.bgEnd);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // 2. Cosmic Star Dust
  ctx.save();
  for (let i = 0; i < 40; i++) {
    const sx = (i * 137 + 19) % W;
    const sy = (i * 241 + 43) % H;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.beginPath();
    ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 3. Orbiting Glow Orbs (reacts to real bass pulse)
  const orbScale = 1 + bassPulse * 0.35;
  const ox1 = 200 + Math.cos(t * 1.2) * 90;
  const oy1 = 260 + Math.sin(t * 1.2) * 70;
  const orb1 = ctx.createRadialGradient(ox1, oy1, 20, ox1, oy1, 380 * orbScale);
  orb1.addColorStop(0, `${activeTheme.primary}77`);
  orb1.addColorStop(1, 'transparent');
  ctx.fillStyle = orb1;
  ctx.fillRect(0, 0, W, H);

  // 4. Spinning Vinyl Platter
  const vcx = 360;
  const vcy = 340;
  ctx.save();
  ctx.translate(vcx, vcy);
  ctx.rotate(t * 1.8);

  ctx.beginPath();
  ctx.arc(0, 0, 175, 0, Math.PI * 2);
  ctx.fillStyle = '#0e0f15';
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = activeTheme.primary;
  ctx.stroke();

  // Vinyl grooves
  for (const r of [155, 132, 110, 88]) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Center Album Art
  ctx.beginPath();
  ctx.arc(0, 0, 72, 0, Math.PI * 2);
  ctx.clip();
  if (artImg) {
    ctx.drawImage(artImg, -72, -72, 144, 144);
  } else {
    ctx.fillStyle = activeTheme.primary;
    ctx.fillRect(-72, -72, 144, 144);
  }
  ctx.restore();

  // 5. Track Title & Artist
  ctx.textAlign = 'center';
  ctx.fillStyle = activeTheme.primary;
  ctx.font = '800 18px Inter, sans-serif';
  const storyTag = sectorName
    ? `🪐 ${sectorName.toUpperCase()} • ${matchScore || 96}% MATCH`
    : 'WAVECRAFT AUDIO REEL';
  ctx.fillText(storyTag, 360, 560);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 34px Inter, sans-serif';
  const titleShort =
    track.title.length > 24 ? track.title.slice(0, 23) + '…' : track.title;
  ctx.fillText(titleShort, 360, 608);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '600 22px Inter, sans-serif';
  const artistShort =
    track.artist.length > 30 ? track.artist.slice(0, 29) + '…' : track.artist;
  ctx.fillText(artistShort, 360, 644);

  // 6. DYNAMIC LIVE SYNCED LYRIC BOX
  const boxX = 64;
  const boxY = 675;
  const boxW = 592;
  const boxH = 285;
  const boxRadius = 28;

  // Box Background
  const boxGrad = ctx.createLinearGradient(0, boxY, 0, boxY + boxH);
  boxGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  boxGrad.addColorStop(1, 'rgba(12, 14, 22, 0.7)');
  ctx.fillStyle = boxGrad;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, boxRadius);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Header inside Box
  ctx.save();
  ctx.beginPath();
  ctx.arc(boxX + 32, boxY + 28, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = activeTheme.primary;
  ctx.shadowColor = activeTheme.primary;
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = activeTheme.primary;
  ctx.font = '800 13px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('LIVE SYNCED LYRICS', boxX + 44, boxY + 32);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.font = '700 13px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(
    `${formatTime(songTime)} / ${formatTime(track.duration || totalSec)}`,
    boxX + boxW - 24,
    boxY + 32
  );

  // Synced Lyrics Content
  ctx.textAlign = 'center';
  if (lyrics && lyrics.length > 0) {
    let activeIdx = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= songTime) {
        activeIdx = i;
      } else {
        break;
      }
    }

    if (activeIdx === -1) {
      // Intro before lyrics start
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.font = 'italic 700 24px Inter, sans-serif';
      ctx.fillText('♪ [Instrumental Intro] ♪', 360, boxY + 120);

      if (lyrics[0]) {
        ctx.font = '600 18px Inter, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        const preview =
          lyrics[0].text.length > 35
            ? lyrics[0].text.slice(0, 34) + '…'
            : lyrics[0].text;
        ctx.fillText(`Coming up: "${preview}"`, 360, boxY + 175);
      }
    } else {
      const activeLine = lyrics[activeIdx].text;
      const prevLine = activeIdx > 0 ? lyrics[activeIdx - 1].text : '';
      const nextLine = activeIdx + 1 < lyrics.length ? lyrics[activeIdx + 1].text : '';

      ctx.font = '800 26px Inter, sans-serif';
      const wrappedActive = wrapCanvasText(ctx, activeLine, 500);

      if (wrappedActive.length <= 1) {
        // Single active line: display prevLine, activeLine, nextLine
        if (prevLine) {
          ctx.font = '600 18px Inter, sans-serif';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
          const cleanPrev =
            prevLine.length > 36 ? prevLine.slice(0, 35) + '…' : prevLine;
          ctx.fillText(cleanPrev, 360, boxY + 85);
        }

        // Active Line
        ctx.font = '800 28px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`“${wrappedActive[0] || activeLine}”`, 360, boxY + 145);

        // Next Line
        if (nextLine) {
          ctx.font = '600 18px Inter, sans-serif';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
          const cleanNext =
            nextLine.length > 36 ? nextLine.slice(0, 35) + '…' : nextLine;
          ctx.fillText(cleanNext, 360, boxY + 205);
        }
      } else {
        // Multi-line active lyric: show wrapped active line + nextLine
        ctx.font = '800 26px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`“${wrappedActive[0]}`, 360, boxY + 95);
        ctx.fillText(`${wrappedActive[1]}”`, 360, boxY + 140);

        if (nextLine) {
          ctx.font = '600 18px Inter, sans-serif';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
          const cleanNext =
            nextLine.length > 36 ? nextLine.slice(0, 35) + '…' : nextLine;
          ctx.fillText(cleanNext, 360, boxY + 205);
        }
      }
    }
  } else {
    // Fallback when no lyrics available
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 26px Inter, sans-serif';
    const rawQuote = (selectedQuote || track.title).split('\n').slice(0, 3);
    rawQuote.forEach((line, idx) => {
      const clean = line.length > 34 ? line.slice(0, 33) + '…' : line;
      ctx.fillText(`“${clean}”`, 360, boxY + 95 + idx * 46);
    });
  }

  // 7. Animated Audio-Reactive Equalizer Bars
  const barCount = 36;
  const startX = 90;
  const stepX = 540 / barCount;
  for (let i = 0; i < barCount; i++) {
    let wave = 20;
    if (freqData && freqData.length > 0) {
      const fVal = (freqData[i % freqData.length] || 0) / 255;
      wave = 16 + fVal * 95;
    } else {
      wave =
        20 +
        Math.abs(Math.sin(t * 7 + i * 0.4) * 52 + Math.cos(t * 4.5 - i * 0.3) * 28);
    }
    ctx.fillStyle = i % 2 === 0 ? activeTheme.primary : activeTheme.secondary;
    ctx.beginPath();
    ctx.roundRect(startX + i * stepX, 1060 - wave / 2, 9, wave, 4.5);
    ctx.fill();
  }

  // 8. Bottom Branding
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.font = '700 18px Inter, sans-serif';
  ctx.fillText('WaveCraft • 320kbps Studio Audio', 360, 1190);
}
