import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Track, LyricLine } from '../../types';
import { getLyricsData } from '../../services/lyrics';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import { getShareBaseUrl, apiUrl } from '../../services/apiConfig';
import { formatTime } from '../../utils/formatTime';
import { resolveDirectAudio } from '../../services/streamResolver';
import { usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { romanizeIndicText, containsNonLatinScript } from '../../services/transliterate';
import { Muxer, ArrayBufferTarget } from 'webm-muxer';

interface WaveCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: Track;
  currentTime?: number;
  initialQuote?: string;
  sectorName?: string;
  matchScore?: number;
  initialThemeId?: string;
}

const CARD_THEMES = [
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

const loadImg = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

async function fetchAudioBinary(url: string): Promise<ArrayBuffer | null> {
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

function wrapCanvasText(
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

function computeAudioMetrics(
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

  let sumSq = 0;
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
        sumSq += s * s;
        if (b < 4) bassSum += Math.abs(s);
      }
      const avg = bandEnergy / count;
      freqData[b] = Math.min(255, Math.floor(avg * 450));
    }
  }

  const bassPulse = Math.min(1, (bassSum / (4 * Math.max(1, bandSize))) * 2.2);
  return { bassPulse, freqData };
}

function drawStoryFrame(
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
  activeTheme: (typeof CARD_THEMES)[0],
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

export default function WaveCardModal({
  isOpen,
  onClose,
  track,
  currentTime = 0,
  initialQuote,
  sectorName,
  matchScore,
  initialThemeId
}: WaveCardModalProps) {
  const lyricsShowRomanization = useSettingsStore((s) => s.lyricsShowRomanization ?? true);
  const setLyricsShowRomanization = useSettingsStore((s) => s.setLyricsShowRomanization);

  const [rawLyrics, setRawLyrics] = useState<LyricLine[]>([]);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<string>('');
  const [themeId, setThemeId] = useState<string>(initialThemeId || 'galaxy');
  const [aspectMode, setAspectMode] = useState<'story' | 'feed'>('story');
  const [copiedLink, setCopiedLink] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [exportStatusMessage, setExportStatusMessage] = useState<string>('');
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoElapsedSec, setVideoElapsedSec] = useState(0);
  const [targetDurationTotalSec, setTargetDurationTotalSec] = useState(30);
  const [reelStartTime, setReelStartTime] = useState<number>(currentTime || 0);
  const [reelDurationMode, setReelDurationMode] = useState<'15s' | '30s' | '60s' | 'full'>('30s');
  const stopRecordingEarlyRef = useRef<(() => void) | null>(null);
  const cancelRecordingRef = useRef<(() => void) | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Sync themeId if initialThemeId changes or modal opens
  useEffect(() => {
    if (initialThemeId && CARD_THEMES.some((t) => t.id === initialThemeId)) {
      setThemeId(initialThemeId);
    }
  }, [initialThemeId, isOpen]);

  // Map raw lyrics into processed lyrics based on lyricsShowRomanization preference
  useEffect(() => {
    if (rawLyrics.length === 0) {
      setLyrics([]);
      return;
    }
    const processed = rawLyrics.map((l) => ({
      time: l.time,
      text:
        lyricsShowRomanization && containsNonLatinScript(l.text)
          ? romanizeIndicText(l.text)
          : l.text
    }));
    setLyrics(processed);
  }, [rawLyrics, lyricsShowRomanization]);

  // Auto-sync reelStartTime to selected lyric quote or currentTime
  useEffect(() => {
    if (selectedQuote && lyrics.length > 0) {
      const firstQuoteLine = selectedQuote.split('\n')[0]?.trim().toLowerCase();
      const match = lyrics.find(
        (l) =>
          firstQuoteLine &&
          (l.text.toLowerCase().includes(firstQuoteLine) ||
            firstQuoteLine.includes(l.text.toLowerCase()))
      );
      if (match && typeof match.time === 'number') {
        setReelStartTime(Math.max(0, Math.floor(match.time)));
        return;
      }
    }
    if (currentTime && currentTime > 0) {
      setReelStartTime(Math.max(0, Math.floor(currentTime)));
    }
  }, [selectedQuote, lyrics, currentTime]);

  const activeTheme = CARD_THEMES.find((t) => t.id === themeId) || CARD_THEMES[0];

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch lyrics when opened so user can pick any line
  useEffect(() => {
    if (!isOpen || !track) return;
    let cancelled = false;

    if (initialQuote && initialQuote.trim()) {
      setSelectedQuote(initialQuote.trim());
    }

    getLyricsData(track.artist, track.title, track.duration).then((data) => {
      if (cancelled) return;
      const lines = data?.lines || [];
      const valid = lines.filter(
        (l) =>
          l.text &&
          !l.text.includes('Lyrics for this track') &&
          !l.text.includes('Switch to Visualizer') &&
          !l.text.startsWith('♪')
      );
      setRawLyrics(valid);

      if (initialQuote && initialQuote.trim()) {
        return;
      }

      if (valid.length > 0) {
        // Pick the line closest to currentTime
        let activeIdx = 0;
        for (let i = 0; i < valid.length; i++) {
          if (currentTime >= valid[i].time) activeIdx = i;
        }
        const line1 = valid[activeIdx]?.text || '';
        const line2 = valid[activeIdx + 1]?.text || '';
        const q1 =
          lyricsShowRomanization && containsNonLatinScript(line1)
            ? romanizeIndicText(line1)
            : line1;
        const q2 =
          lyricsShowRomanization && containsNonLatinScript(line2)
            ? romanizeIndicText(line2)
            : line2;
        setSelectedQuote(q2 ? `${q1}\n${q2}` : q1);
      } else {
        setSelectedQuote(`Lost in the sound of ${track.title} ✨`);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, track, currentTime, initialQuote, lyricsShowRomanization]);

  const shareUrl = `${getShareBaseUrl()}/?play=${encodeURIComponent(
    `${track.title} ${track.artist}`
  )}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {}
  };

  // Render high-res 1080x1920 (9:16 Story) or 1080x1350 (4:5 Feed) PNG via HTML5 Canvas
  const generateCanvasBlob = async (): Promise<Blob | null> => {
    const canvas = canvasRef.current || document.createElement('canvas');
    const isStory = aspectMode === 'story';
    const W = 1080;
    const H = isStory ? 1920 : 1350;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 1. Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, activeTheme.bgStart);
    bgGrad.addColorStop(0.52, '#080912');
    bgGrad.addColorStop(1, activeTheme.bgEnd);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. Cosmic Star Dust Particles
    ctx.save();
    for (let i = 0; i < 70; i++) {
      const sx = (i * 173 + 37) % W;
      const sy = (i * 281 + 83) % H;
      const sr = i % 4 === 0 ? 2 : 1;
      const sAlpha = 0.12 + (i % 6) * 0.1;
      ctx.fillStyle = `rgba(255, 255, 255, ${sAlpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 3. Ambient Glow Orbs
    const orb1 = ctx.createRadialGradient(280, isStory ? 320 : 220, 20, 280, isStory ? 320 : 220, 680);
    orb1.addColorStop(0, `${activeTheme.primary}77`);
    orb1.addColorStop(1, 'transparent');
    ctx.fillStyle = orb1;
    ctx.fillRect(0, 0, W, H);

    const orb2 = ctx.createRadialGradient(W - 260, H - 360, 20, W - 260, H - 360, 680);
    orb2.addColorStop(0, `${activeTheme.secondary}66`);
    orb2.addColorStop(1, 'transparent');
    ctx.fillStyle = orb2;
    ctx.fillRect(0, 0, W, H);

    // 4. Outer Frosted Glass Border Frame
    const framePadX = 64;
    const framePadY = isStory ? 95 : 60;
    const frameW = W - framePadX * 2;
    const frameH = H - framePadY * 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.038)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(framePadX, framePadY, frameW, frameH, 52);
    ctx.fill();
    ctx.stroke();

    // 5. Top Header Badge Pill
    const headerY = framePadY + 48;
    const badgeText = sectorName
      ? `🪐 ${sectorName.toUpperCase()} • ${matchScore || 96}% MATCH`
      : '✦ WAVECRAFT HIGH-FIDELITY • 320 KBPS';

    ctx.font = 'bold 22px Inter, sans-serif';
    const badgeTextW = ctx.measureText(badgeText).width;
    const badgeW = badgeTextW + 48;
    const badgeH = 46;
    const badgeX = framePadX + 50;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeStyle = `${activeTheme.primary}99`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(badgeX, headerY, badgeW, badgeH, 23);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = activeTheme.primary;
    ctx.fillText(badgeText, badgeX + 24, headerY + 31);

    // Right Header Edition Label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = '700 20px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('STUDIO STORY POSTER', framePadX + frameW - 50, headerY + 31);
    ctx.textAlign = 'left';

    // 6. Load Album Cover safely
    const imgUrl = track.thumbnailLarge || track.thumbnail || DEFAULT_THUMBNAIL;
    const artImg = await loadImg(imgUrl);

    // Hero Vinyl Sleeve Dimensions
    const sleeveSize = isStory ? 460 : 360;
    const sleeveX = framePadX + 54;
    const artY = isStory ? framePadY + 130 : framePadY + 110;

    // Draw Vinyl Record Disc peeking out behind sleeve on the right
    const discRadius = sleeveSize * 0.46;
    const discCenterX = sleeveX + sleeveSize * 0.74;
    const discCenterY = artY + sleeveSize * 0.5;

    ctx.save();
    // Disc base
    ctx.beginPath();
    ctx.arc(discCenterX, discCenterY, discRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#0d0e14';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.stroke();

    // Grooves
    const grooveRadii = [
      discRadius * 0.92,
      discRadius * 0.82,
      discRadius * 0.72,
      discRadius * 0.62,
      discRadius * 0.52
    ];
    for (const gr of grooveRadii) {
      ctx.beginPath();
      ctx.arc(discCenterX, discCenterY, gr, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Center Vinyl Label with art
    const labelRadius = discRadius * 0.35;
    ctx.beginPath();
    ctx.arc(discCenterX, discCenterY, labelRadius, 0, Math.PI * 2);
    ctx.save();
    ctx.clip();
    if (artImg) {
      ctx.drawImage(
        artImg,
        discCenterX - labelRadius,
        discCenterY - labelRadius,
        labelRadius * 2,
        labelRadius * 2
      );
    } else {
      ctx.fillStyle = activeTheme.primary;
      ctx.fill();
    }
    ctx.restore();

    // Vinyl spindle hole
    ctx.beginPath();
    ctx.arc(discCenterX, discCenterY, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#050608';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Album Sleeve (in front of vinyl disc)
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 44;
    ctx.shadowOffsetX = 8;
    ctx.shadowOffsetY = 16;
    ctx.beginPath();
    ctx.roundRect(sleeveX, artY, sleeveSize, sleeveSize, 34);
    ctx.fillStyle = '#151722';
    ctx.fill();
    ctx.restore();

    // Draw clipped artwork in sleeve
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(sleeveX, artY, sleeveSize, sleeveSize, 34);
    ctx.clip();
    if (artImg) {
      ctx.drawImage(artImg, sleeveX, artY, sleeveSize, sleeveSize);
    } else {
      const fallbackGrad = ctx.createLinearGradient(
        sleeveX,
        artY,
        sleeveX + sleeveSize,
        artY + sleeveSize
      );
      fallbackGrad.addColorStop(0, activeTheme.primary);
      fallbackGrad.addColorStop(1, activeTheme.secondary);
      ctx.fillStyle = fallbackGrad;
      ctx.fillRect(sleeveX, artY, sleeveSize, sleeveSize);
    }

    // Specular diagonal sheen on sleeve
    const sheenGrad = ctx.createLinearGradient(
      sleeveX,
      artY,
      sleeveX + sleeveSize * 0.7,
      artY + sleeveSize
    );
    sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
    sheenGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.05)');
    sheenGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = sheenGrad;
    ctx.fillRect(sleeveX, artY, sleeveSize, sleeveSize);

    // Sleeve border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    // 7. Track Title & Artist
    const contentX = framePadX + 54;
    const titleY = artY + sleeveSize + (isStory ? 80 : 60);

    ctx.fillStyle = activeTheme.primary;
    ctx.font = '800 24px Inter, sans-serif';
    ctx.fillText('FEATURED TRACK • 4D SONIC DNA', contentX, titleY);

    ctx.fillStyle = '#ffffff';
    ctx.font = isStory ? '800 52px Inter, sans-serif' : '800 44px Inter, sans-serif';
    const titleLines: string[] = [];
    const rawWords = track.title.split(/\s+/);
    let curTitle = '';
    for (const w of rawWords) {
      const test = curTitle ? `${curTitle} ${w}` : w;
      if (ctx.measureText(test).width > 820) {
        if (curTitle) titleLines.push(curTitle);
        curTitle = w;
      } else {
        curTitle = test;
      }
    }
    if (curTitle) titleLines.push(curTitle);

    let curY = titleY + (isStory ? 54 : 44);
    for (const tline of titleLines.slice(0, 2)) {
      ctx.fillText(tline, contentX, curY);
      curY += isStory ? 60 : 50;
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.font = '600 32px Inter, sans-serif';
    const artistShort =
      track.artist.length > 36 ? track.artist.slice(0, 35) + '…' : track.artist;
    ctx.fillText(`By ${artistShort}`, contentX, curY + 6);

    // 8. Editorial Quote Mark & Lyric Section
    const quoteTopY = curY + (isStory ? 70 : 50);
    ctx.fillStyle = `${activeTheme.primary}4D`;
    ctx.font = '800 130px Georgia, serif';
    ctx.fillText('“', contentX - 6, quoteTopY + 30);

    ctx.fillStyle = '#ffffff';
    ctx.font = isStory ? '700 42px Inter, sans-serif' : '700 36px Inter, sans-serif';
    const rawLines = (selectedQuote || track.title).split('\n');
    const wrappedLines: string[] = [];
    for (const raw of rawLines) {
      const words = raw.trim().split(/\s+/);
      let current = '';
      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (ctx.measureText(test).width > 790) {
          if (current) wrappedLines.push(current);
          current = word;
        } else {
          current = test;
        }
      }
      if (current) wrappedLines.push(current);
    }

    let yCursor = quoteTopY + (isStory ? 50 : 42);
    const maxLines = isStory ? 5 : 4;
    for (const line of wrappedLines.slice(0, maxLines)) {
      ctx.fillText(line, contentX, yCursor);
      yCursor += isStory ? 58 : 48;
    }

    // 9. Studio Waveform Bars at Bottom
    const waveY = H - (isStory ? 230 : 170);
    const barCount = 48;
    const totalWaveW = 820;
    const barGap = totalWaveW / barCount;
    for (let i = 0; i < barCount; i++) {
      const h = 18 + Math.abs(Math.sin(i * 0.42) * 58 + Math.cos(i * 0.75) * 26);
      const x = contentX + i * barGap;
      const waveGrad = ctx.createLinearGradient(0, waveY - h / 2, 0, waveY + h / 2);
      waveGrad.addColorStop(0, activeTheme.primary);
      waveGrad.addColorStop(1, activeTheme.secondary);
      ctx.fillStyle = i < barCount * 0.68 ? waveGrad : 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.roundRect(x, waveY - h / 2, 10, h, 5);
      ctx.fill();
    }

    // 10. Footer Branding
    const footerY = H - (isStory ? 135 : 95);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = '600 24px Inter, sans-serif';
    ctx.fillText('WaveCraft • Liquid Glass Audio Engine', contentX, footerY);

    ctx.fillStyle = activeTheme.primary;
    ctx.font = '700 24px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('wavecraft.app', framePadX + frameW - 54, footerY);
    ctx.textAlign = 'left';

    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 0.95));
  };

  const handleDownloadCard = async () => {
    setIsExporting(true);
    try {
      const blob = await generateCanvasBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `WaveCard-${track.title.replace(/[^a-z0-9]/gi, '_').slice(0, 25)}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const handleNativeShare = async () => {
    setIsExporting(true);
    try {
      const blob = await generateCanvasBlob();
      if (blob && navigator.share) {
        const file = new File([blob], 'wavecard.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `${track.title} — ${track.artist}`,
            text: `Listening to "${track.title}" by ${track.artist} on WaveCraft`,
            url: shareUrl,
            files: [file]
          });
          return;
        }
        await navigator.share({
          title: `${track.title} — ${track.artist}`,
          text: `Listening to "${track.title}" by ${track.artist} on WaveCraft`,
          url: shareUrl
        });
      } else {
        await handleDownloadCard();
      }
    } catch {
      // User cancelled share sheet
    } finally {
      setIsExporting(false);
    }
  };

  // Ultra-Fast Offline WebCodecs + WebM-Muxer Video Reel Exporter
  const handleFastOfflineVideoExport = async (): Promise<boolean> => {
    if (
      typeof window === 'undefined' ||
      typeof (window as any).VideoEncoder === 'undefined' ||
      typeof (window as any).AudioEncoder === 'undefined' ||
      typeof (window as any).VideoFrame === 'undefined' ||
      typeof (window as any).AudioData === 'undefined'
    ) {
      return false;
    }

    const trackDur = track.duration || 180;
    let targetDurationSec = 30;
    if (reelDurationMode === '15s') targetDurationSec = 15;
    else if (reelDurationMode === '30s') targetDurationSec = 30;
    else if (reelDurationMode === '60s') targetDurationSec = 60;
    else if (reelDurationMode === 'full')
      targetDurationSec = Math.max(10, Math.floor(trackDur - reelStartTime));

    setTargetDurationTotalSec(targetDurationSec);
    setIsRecordingVideo(true);
    setVideoProgress(0);
    setVideoElapsedSec(0);
    setExportStatusMessage('Resolving high-fidelity audio stream...');
    isCancelledRef.current = false;

    // Pause player if running so playback doesn't collide
    const wasMainPlaying = usePlayerStore.getState().isPlaying;
    if (wasMainPlaying) {
      usePlayerStore.getState().pause();
    }

    try {
      // 1. Resolve Audio Stream
      let streamUrl = track.audioUrl;
      if (!streamUrl || streamUrl.includes('p.scdn.co')) {
        try {
          const resolved = await resolveDirectAudio(
            track.title,
            track.artist,
            track.duration,
            track.youtubeId
          );
          if (resolved) {
            streamUrl = resolved;
            track.audioUrl = resolved;
          }
        } catch {}
      }
      if (!streamUrl && track.audioUrl) {
        streamUrl = track.audioUrl;
      }
      if (!streamUrl) return false;

      // 2. Fetch audio binary stream
      setExportStatusMessage('Downloading audio track...');
      const audioBinary = await fetchAudioBinary(streamUrl);
      if (!audioBinary || audioBinary.byteLength < 1024) return false;

      // 3. Decode audio data into AudioBuffer
      setExportStatusMessage('Decoding studio audio graph...');
      const tempCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 48000
      });
      const decodedBuffer = await tempCtx.decodeAudioData(audioBinary.slice(0));

      let finalBuffer = decodedBuffer;
      if (decodedBuffer.sampleRate !== 48000) {
        const offlineCtx = new OfflineAudioContext(
          decodedBuffer.numberOfChannels,
          Math.ceil(decodedBuffer.duration * 48000),
          48000
        );
        const src = offlineCtx.createBufferSource();
        src.buffer = decodedBuffer;
        src.connect(offlineCtx.destination);
        src.start(0);
        finalBuffer = await offlineCtx.startRendering();
      }
      try {
        tempCtx.close();
      } catch {}

      // 4. Codec capability checks
      let chosenVideoCodec = 'vp09.00.10.08';
      let chosenMuxerVideoCodec = 'V_VP9';

      const vp9Support = await (window as any).VideoEncoder.isConfigSupported({
        codec: 'vp09.00.10.08',
        width: 720,
        height: 1280,
        bitrate: 3_500_000,
        framerate: 30
      }).catch(() => ({ supported: false }));

      if (vp9Support.supported) {
        chosenVideoCodec = 'vp09.00.10.08';
        chosenMuxerVideoCodec = 'V_VP9';
      } else {
        const vp8Support = await (window as any).VideoEncoder.isConfigSupported({
          codec: 'vp8',
          width: 720,
          height: 1280,
          bitrate: 3_500_000,
          framerate: 30
        }).catch(() => ({ supported: false }));

        if (vp8Support.supported) {
          chosenVideoCodec = 'vp8';
          chosenMuxerVideoCodec = 'V_VP8';
        } else {
          return false;
        }
      }

      const audioSupport = await (window as any).AudioEncoder.isConfigSupported({
        codec: 'opus',
        sampleRate: 48000,
        numberOfChannels: 2,
        bitrate: 192_000
      }).catch(() => ({ supported: false }));

      if (!audioSupport.supported) {
        return false;
      }

      // 5. Initialize WebM Muxer
      const target = new ArrayBufferTarget();
      const fps = 30;
      const totalFrames = Math.floor(targetDurationSec * fps);

      const muxer = new Muxer({
        target,
        video: {
          codec: chosenMuxerVideoCodec,
          width: 720,
          height: 1280,
          frameRate: fps
        },
        audio: {
          codec: 'A_OPUS',
          sampleRate: 48000,
          numberOfChannels: 2
        },
        firstTimestampBehavior: 'offset'
      });

      // 6. Initialize VideoEncoder and AudioEncoder
      const videoEncoder = new (window as any).VideoEncoder({
        output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
        error: (err: any) => console.error('[VideoEncoder Error]', err)
      });
      videoEncoder.configure({
        codec: chosenVideoCodec,
        width: 720,
        height: 1280,
        bitrate: 3_500_000,
        framerate: fps
      });

      const audioEncoder = new (window as any).AudioEncoder({
        output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
        error: (err: any) => console.error('[AudioEncoder Error]', err)
      });
      audioEncoder.configure({
        codec: 'opus',
        sampleRate: 48000,
        numberOfChannels: 2,
        bitrate: 192_000
      });

      // 7. Encode Audio into Opus Chunks (in 960-sample Opus frames)
      setExportStatusMessage('⚡ Turbo Encoding: Audio Stream...');
      const chunkSize = 960;
      const sampleRate = 48000;
      const startSample = Math.floor(reelStartTime * sampleRate);
      const totalAudioSamples = Math.floor(targetDurationSec * sampleRate);
      const ch0 = finalBuffer.getChannelData(0);
      const ch1 =
        finalBuffer.numberOfChannels > 1 ? finalBuffer.getChannelData(1) : ch0;

      for (let offset = 0; offset < totalAudioSamples; offset += chunkSize) {
        if (isCancelledRef.current) break;
        const thisChunk = Math.min(chunkSize, totalAudioSamples - offset);
        const planarData = new Float32Array(thisChunk * 2);
        const left = planarData.subarray(0, thisChunk);
        const right = planarData.subarray(thisChunk);

        for (let i = 0; i < thisChunk; i++) {
          const idx = startSample + offset + i;
          left[i] = idx < ch0.length ? ch0[idx] : 0;
          right[i] = idx < ch1.length ? ch1[idx] : 0;
        }

        const audioData = new (window as any).AudioData({
          format: 'f32-planar',
          sampleRate: 48000,
          numberOfFrames: thisChunk,
          numberOfChannels: 2,
          timestamp: Math.round((offset / sampleRate) * 1_000_000),
          data: planarData
        });
        audioEncoder.encode(audioData);
        audioData.close();
      }
      await audioEncoder.flush();

      // 8. Render Canvas Frames & Encode Video
      setExportStatusMessage('⚡ Turbo Rendering: Dynamic Synced Lyrics...');
      const vCanvas = document.createElement('canvas');
      vCanvas.width = 720;
      vCanvas.height = 1280;
      const vCtx = vCanvas.getContext('2d');
      if (!vCtx) return false;

      const imgUrl = track.thumbnailLarge || track.thumbnail || DEFAULT_THUMBNAIL;
      const artImg = await loadImg(imgUrl);

      let isStoppedEarly = false;
      stopRecordingEarlyRef.current = () => {
        isStoppedEarly = true;
      };
      cancelRecordingRef.current = () => {
        isCancelledRef.current = true;
      };

      for (let f = 0; f < totalFrames; f++) {
        if (isCancelledRef.current || isStoppedEarly) break;
        const elapsedSec = f / fps;
        const songTime = reelStartTime + elapsedSec;

        const centerSample = startSample + Math.floor(elapsedSec * sampleRate);
        const { bassPulse, freqData } = computeAudioMetrics(
          ch0,
          ch1,
          centerSample,
          36
        );

        drawStoryFrame(
          vCtx,
          songTime,
          elapsedSec,
          targetDurationSec,
          bassPulse,
          freqData,
          artImg,
          track,
          lyrics,
          selectedQuote,
          activeTheme,
          sectorName,
          matchScore
        );

        const videoFrame = new (window as any).VideoFrame(vCanvas, {
          timestamp: Math.round(elapsedSec * 1_000_000)
        });
        videoEncoder.encode(videoFrame, { keyFrame: f % 60 === 0 });
        videoFrame.close();

        const pct = Math.min(100, Math.round(((f + 1) / totalFrames) * 100));
        setVideoProgress(pct);
        setVideoElapsedSec(Math.min(targetDurationSec, Math.floor(elapsedSec)));

        // Non-blocking UI yield every 8 frames to update progress
        if (f % 8 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      if (isCancelledRef.current) {
        try {
          videoEncoder.close();
          audioEncoder.close();
        } catch {}
        setIsRecordingVideo(false);
        setVideoProgress(0);
        if (wasMainPlaying) usePlayerStore.getState().resume();
        return true;
      }

      await videoEncoder.flush();
      muxer.finalize();

      const videoBlob = new Blob([target.buffer], { type: 'video/webm' });
      const url = URL.createObjectURL(videoBlob);
      const a = document.createElement('a');
      a.href = url;
      const recordedSec = Math.round(targetDurationSec);
      a.download = `WaveReel-${track.title.replace(/[^a-z0-9]/gi, '_').slice(0, 20)}-${recordedSec}s.webm`;
      a.click();
      URL.revokeObjectURL(url);

      setIsRecordingVideo(false);
      setVideoProgress(0);
      if (wasMainPlaying) usePlayerStore.getState().resume();
      return true;
    } catch (err) {
      console.warn('[Fast Video Export Error, falling back to real-time]', err);
      setIsRecordingVideo(false);
      setVideoProgress(0);
      if (wasMainPlaying) usePlayerStore.getState().resume();
      return false;
    }
  };

  // Real-Time Fallback Video Recorder (.webm)
  const handleRecordVideoStory = async () => {
    if (isRecordingVideo || typeof MediaRecorder === 'undefined') return;
    setIsRecordingVideo(true);
    setVideoProgress(0);
    setVideoElapsedSec(0);
    setExportStatusMessage('Recording video reel with synced audio...');

    // Compute target duration in milliseconds
    const trackDur = track.duration || 180;
    let targetDurationSec = 30;
    if (reelDurationMode === '15s') targetDurationSec = 15;
    else if (reelDurationMode === '30s') targetDurationSec = 30;
    else if (reelDurationMode === '60s') targetDurationSec = 60;
    else if (reelDurationMode === 'full')
      targetDurationSec = Math.max(10, Math.floor(trackDur - reelStartTime));

    setTargetDurationTotalSec(targetDurationSec);
    const totalMs = targetDurationSec * 1000;

    // Pause background player if playing so audio does not collide
    const wasMainPlaying = usePlayerStore.getState().isPlaying;
    if (wasMainPlaying) {
      usePlayerStore.getState().pause();
    }

    try {
      const vCanvas = document.createElement('canvas');
      vCanvas.width = 720;
      vCanvas.height = 1280;
      const ctx = vCanvas.getContext('2d');
      if (!ctx) {
        setIsRecordingVideo(false);
        if (wasMainPlaying) usePlayerStore.getState().resume();
        return;
      }

      // Load artwork
      const imgUrl = track.thumbnailLarge || track.thumbnail || DEFAULT_THUMBNAIL;
      const artImg = await loadImg(imgUrl);

      // Resolve audio stream
      let streamUrl = track.audioUrl;
      if (!streamUrl || streamUrl.includes('p.scdn.co')) {
        try {
          const resolved = await resolveDirectAudio(
            track.title,
            track.artist,
            track.duration,
            track.youtubeId
          );
          if (resolved) {
            streamUrl = resolved;
            track.audioUrl = resolved;
          }
        } catch {}
      }
      if (!streamUrl && track.audioUrl) {
        streamUrl = track.audioUrl;
      }

      // Initialize audio element
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      if (streamUrl) {
        audio.src = streamUrl;
      }

      // Preload audio and seek to reelStartTime
      if (streamUrl) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 3500);
          audio.oncanplay = () => {
            clearTimeout(timer);
            resolve();
          };
          audio.onerror = () => {
            clearTimeout(timer);
            resolve();
          };
        });

        try {
          audio.currentTime = reelStartTime;
        } catch {}
      }

      // Setup Web Audio routing to capture audio tracks SILENTLY
      let audioCtx: AudioContext | null = null;
      let audioDestination: MediaStreamAudioDestinationNode | null = null;
      let analyser: AnalyserNode | null = null;
      let freqData: Uint8Array<ArrayBuffer> | null = null;

      if (streamUrl) {
        try {
          audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          audioDestination = audioCtx.createMediaStreamDestination();
          const source = audioCtx.createMediaElementSource(audio);
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          freqData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));

          source.connect(analyser);
          analyser.connect(audioDestination);
          // NOTE: Do NOT connect to audioCtx.destination! Keeps speakers quiet so user is not disturbed!
        } catch {
          // If mediaElementSource has CORS restriction in this environment, fallback silently
        }
      }

      // Combine video stream from canvas with audio stream
      const vStream = vCanvas.captureStream(60);
      const vTrack = vStream.getVideoTracks()[0];
      const aTracks = audioDestination
        ? audioDestination.stream.getAudioTracks()
        : (audio as any).captureStream
        ? (audio as any).captureStream().getAudioTracks()
        : [];

      const streamTracks = aTracks.length > 0 ? [vTrack, ...aTracks] : [vTrack];
      const combinedStream = new MediaStream(streamTracks);

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 4_500_000,
        audioBitsPerSecond: 192_000
      });

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      const startTime = performance.now();
      let rafId = 0;
      let isCancelled = false;
      let isStoppedEarly = false;

      stopRecordingEarlyRef.current = () => {
        isStoppedEarly = true;
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      };

      cancelRecordingRef.current = () => {
        isCancelled = true;
        cancelAnimationFrame(rafId);
        try {
          audio.pause();
          audio.src = '';
        } catch {}
        if (audioCtx) {
          try {
            audioCtx.close();
          } catch {}
        }
        if (recorder.state === 'recording') {
          recorder.stop();
        }
        setIsRecordingVideo(false);
        setVideoProgress(0);
        if (wasMainPlaying) {
          usePlayerStore.getState().resume();
        }
      };

      const drawFrame = (now: number) => {
        if (isCancelled) return;
        const elapsed = now - startTime;
        const t = elapsed / 1000;
        const pct = Math.min(100, Math.round((elapsed / totalMs) * 100));
        setVideoProgress(pct);
        setVideoElapsedSec(Math.min(targetDurationSec, Math.floor(elapsed / 1000)));

        // Read real audio FFT if analyser is active
        let liveBassPulse = 0;
        if (analyser && freqData) {
          analyser.getByteFrequencyData(freqData);
          liveBassPulse = (freqData[1] + freqData[2] + freqData[3]) / (3 * 255);
        }

        const songTime = reelStartTime + t;
        drawStoryFrame(
          ctx,
          songTime,
          t,
          targetDurationSec,
          liveBassPulse,
          freqData || [],
          artImg,
          track,
          lyrics,
          selectedQuote,
          activeTheme,
          sectorName,
          matchScore
        );

        if (elapsed < totalMs && !isStoppedEarly) {
          rafId = requestAnimationFrame(drawFrame);
        } else {
          recorder.stop();
        }
      };

      recorder.onstop = () => {
        cancelAnimationFrame(rafId);
        try {
          audio.pause();
          audio.src = '';
        } catch {}
        if (audioCtx) {
          try {
            audioCtx.close();
          } catch {}
        }
        if (wasMainPlaying && !isCancelled) {
          usePlayerStore.getState().resume();
        }

        if (isCancelled) {
          setIsRecordingVideo(false);
          setVideoProgress(0);
          return;
        }

        const videoBlob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(videoBlob);
        const a = document.createElement('a');
        a.href = url;
        const recordedSec = Math.round((performance.now() - startTime) / 1000);
        a.download = `WaveReel-${track.title.replace(/[^a-z0-9]/gi, '_').slice(0, 20)}-${recordedSec}s.webm`;
        a.click();
        URL.revokeObjectURL(url);
        setIsRecordingVideo(false);
        setVideoProgress(0);
      };

      // Start audio and recording
      if (streamUrl) {
        try {
          await audio.play();
        } catch {}
      }

      recorder.start(500);
      rafId = requestAnimationFrame(drawFrame);
    } catch {
      setIsRecordingVideo(false);
      if (wasMainPlaying) usePlayerStore.getState().resume();
    }
  };

  const handleStartReelExport = async () => {
    if (isRecordingVideo || isExporting) return;
    const fastSuccess = await handleFastOfflineVideoExport();
    if (!fastSuccess) {
      await handleRecordVideoStory();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 pointer-events-auto modal-backdrop-blur backdrop-blur-xl backdrop-saturate-150"
          onClick={onClose}
        />
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 10 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative z-10 pointer-events-auto w-full max-w-4xl rounded-3xl modal-glass-panel backdrop-blur-2xl backdrop-saturate-150 p-6 sm:p-8 max-h-[90vh] overflow-y-auto glass-heavy liquid-glass"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-accent)]">
                Social Studio Export • 1080p HD
              </span>
              <h2 className="text-2xl font-extrabold text-white mt-0.5">
                Lyric Poster & Social Story Studio
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center p-1 rounded-full liquid-glass border-0 relative">
                <button
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    setAspectMode('story');
                  }}
                  className="relative px-3 py-1 rounded-full text-xs font-bold cursor-pointer select-none"
                >
                  {aspectMode === 'story' && (
                    <motion.div
                      layoutId="wavecard-aspect-mode-pill"
                      transition={{ type: 'spring', bounce: 0.15, duration: 0.32 }}
                      className="absolute inset-0 rounded-full liquid-sliding-pill -z-0 pointer-events-none"
                    />
                  )}
                  <span className={`relative z-10 transition-colors duration-150 ${
                    aspectMode === 'story' ? 'text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]' : 'text-white/60 hover:text-white'
                  }`}>
                    9:16 Story (1080×1920)
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    setAspectMode('feed');
                  }}
                  className="relative px-3 py-1 rounded-full text-xs font-bold cursor-pointer select-none"
                >
                  {aspectMode === 'feed' && (
                    <motion.div
                      layoutId="wavecard-aspect-mode-pill"
                      transition={{ type: 'spring', bounce: 0.15, duration: 0.32 }}
                      className="absolute inset-0 rounded-full liquid-sliding-pill -z-0 pointer-events-none"
                    />
                  )}
                  <span className={`relative z-10 transition-colors duration-150 ${
                    aspectMode === 'feed' ? 'text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]' : 'text-white/60 hover:text-white'
                  }`}>
                    4:5 Feed (1080×1350)
                  </span>
                </button>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full glass-button flex items-center justify-center text-white/70 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Live Interactive Card Preview */}
            <div className="lg:col-span-6 flex justify-center">
              <div
                className={`w-full ${
                  aspectMode === 'story' ? 'max-w-[290px] aspect-[9/16]' : 'max-w-[340px] aspect-[4/5]'
                } rounded-3xl p-6 flex flex-col justify-between relative overflow-hidden border-0 shadow-2xl select-none transition-all duration-300`}
                style={{
                  background: `linear-gradient(145deg, ${activeTheme.bgStart} 0%, #090910 55%, ${activeTheme.bgEnd} 100%)`
                }}
              >
                {/* Glow Orbs */}
                <div
                  className="absolute -top-16 -left-16 w-48 h-48 rounded-full blur-3xl opacity-45 pointer-events-none"
                  style={{ background: activeTheme.primary }}
                />
                <div
                  className="absolute -bottom-16 -right-16 w-48 h-48 rounded-full blur-3xl opacity-35 pointer-events-none"
                  style={{ background: activeTheme.secondary }}
                />

                {/* Top Badge & Header */}
                <div className="relative z-10 flex items-center justify-between gap-2">
                  <span
                    className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider text-white truncate border"
                    style={{
                      backgroundColor: `${activeTheme.primary}25`,
                      borderColor: `${activeTheme.primary}70`
                    }}
                  >
                    {sectorName
                      ? `🪐 ${sectorName} • ${matchScore || 96}% MATCH`
                      : '✦ WAVECRAFT HI-RES'}
                  </span>
                  <span className="text-[9px] font-bold text-white/50 whitespace-nowrap">
                    320kbps HD
                  </span>
                </div>

                {/* Hero Vinyl Sleeve Presentation */}
                <div className="relative z-10 my-1 flex items-center justify-center">
                  {/* Peeking Vinyl Record Disc */}
                  <div className="absolute right-2 sm:right-4 w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-[#0d0e14] border border-white/20 shadow-xl flex items-center justify-center pointer-events-none">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border border-white/10 flex items-center justify-center">
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border border-white/10 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full overflow-hidden border border-white/30">
                          <img
                            src={track.thumbnail || DEFAULT_THUMBNAIL}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Front Album Sleeve */}
                  <div className="relative z-10 mr-12 sm:mr-14 w-32 h-32 sm:w-36 sm:h-36 rounded-2xl overflow-hidden shadow-2xl border border-white/25">
                    <img
                      src={track.thumbnailLarge || track.thumbnail || DEFAULT_THUMBNAIL}
                      alt={track.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/20 via-transparent to-transparent pointer-events-none" />
                  </div>
                </div>

                {/* Track Details */}
                <div className="relative z-10 text-center px-1">
                  <h4 className="text-base sm:text-lg font-black text-white truncate">
                    {track.title}
                  </h4>
                  <p className="text-xs font-semibold text-white/70 truncate mt-0.5">
                    {track.artist}
                  </p>
                </div>

                {/* Center Highlighted Lyric Quote */}
                <div className="relative z-10 my-auto py-2 text-center">
                  <div
                    className="text-3xl font-serif leading-none opacity-40 mb-1"
                    style={{ color: activeTheme.primary }}
                  >
                    “
                  </div>
                  <p className="text-sm sm:text-base font-extrabold text-white leading-snug whitespace-pre-line line-clamp-4">
                    {selectedQuote || `Listening to ${track.title}`}
                  </p>
                </div>

                {/* Bottom Waveform & Badge */}
                <div className="relative z-10 pt-3 border-0">
                  <div className="flex items-center gap-1 h-7 mb-2.5">
                    {Array.from({ length: 32 }).map((_, i) => {
                      const h = 25 + Math.abs(Math.sin(i * 0.5) * 65);
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-full"
                          style={{
                            height: `${h}%`,
                            backgroundColor:
                              i < 20 ? activeTheme.primary : 'rgba(255,255,255,0.2)'
                          }}
                        />
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-bold text-white/55">
                    <span>WaveCraft • Liquid Glass</span>
                    <span style={{ color: activeTheme.primary }}>320kbps HD</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Customization Controls */}
            <div className="lg:col-span-6 space-y-5">
              {/* Theme Picker */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-2.5">
                  1. Card Backdrop Theme
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {CARD_THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setThemeId(t.id)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                        themeId === t.id
                          ? 'glass-button-primary text-white shadow-lg border-0'
                          : 'glass-button text-white/70 hover:text-white'
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: t.primary }}
                      />
                      <span className="truncate">{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Lyric Quote Input */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-2">
                  2. Featured Lyric / Vibe Quote
                </label>
                <textarea
                  rows={3}
                  value={selectedQuote}
                  onChange={(e) => setSelectedQuote(e.target.value)}
                  placeholder="Type a lyric or quote..."
                  className="w-full glass-input rounded-2xl p-3.5 text-sm text-white placeholder-white/35 focus:outline-none focus:ring-1 focus:ring-white/35 resize-none"
                />
              </div>

              {/* Quick Lyric Line Picker (Multi-line toggleable) */}
              {lyrics.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-white/60">
                      Tap Lyric Lines to Toggle on Poster (Up to 4 Lines):
                    </label>
                    <div className="flex items-center gap-2">
                      {rawLyrics.some((l) => containsNonLatinScript(l.text)) && (
                        <button
                          type="button"
                          onClick={() => {
                            triggerAndroidHaptic('light');
                            setLyricsShowRomanization(!lyricsShowRomanization);
                          }}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                            lyricsShowRomanization
                              ? 'glass-button-primary text-cyan-300'
                              : 'glass-button text-white/70 hover:text-white'
                          }`}
                          title="Switch between Romanized and Native Script"
                        >
                          <span>{lyricsShowRomanization ? '🔤 Romanized' : '🌐 Native'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedQuote('')}
                        className="text-[11px] font-bold text-white/50 hover:text-white cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {lyrics.slice(0, 35).map((line, i) => {
                      const activeLines = selectedQuote
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean);
                      const isLineSelected = activeLines.includes(line.text.trim());
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            const clean = line.text.trim();
                            if (isLineSelected) {
                              const next = activeLines.filter((l) => l !== clean);
                              setSelectedQuote(next.join('\n'));
                            } else {
                              const next = [...activeLines, clean].slice(-4);
                              setSelectedQuote(next.join('\n'));
                              if (typeof line.time === 'number') {
                                setReelStartTime(Math.max(0, Math.floor(line.time)));
                              }
                            }
                          }}
                          className={`w-full text-left px-3 py-1.5 rounded-xl text-xs transition-colors truncate cursor-pointer flex items-center justify-between gap-2 ${
                            isLineSelected
                              ? 'bg-[var(--color-accent)]/25 border border-[var(--color-accent)]/50 text-white font-bold'
                              : 'text-white/75 hover:text-white hover:bg-white/10 border-0'
                          }`}
                        >
                          <span className="truncate">“{line.text}”</span>
                          {isLineSelected && (
                            <span className="text-[10px] font-extrabold text-[var(--color-accent)] flex-shrink-0">
                              ✓ ON POSTER
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Video Reel & Audio Settings */}
              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-white/70">
                    3. Video Reel & Audio Settings
                  </label>
                  <span className="text-[10px] font-extrabold text-cyan-300">
                    ⚡ Turbo Offline & Live Synced Audio
                  </span>
                </div>

                {/* Duration Mode Pills */}
                <div>
                  <span className="text-[11px] text-white/50 block mb-1.5">
                    Export Duration:
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['15s', '30s', '60s', 'full'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          triggerAndroidHaptic('light');
                          setReelDurationMode(mode);
                          if (mode === 'full') setReelStartTime(0);
                        }}
                        className={`py-1.5 px-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer text-center ${
                          reelDurationMode === mode
                            ? 'glass-button-primary text-white shadow-md'
                            : 'glass-button text-white/60 hover:text-white'
                        }`}
                      >
                        {mode === '15s'
                          ? '15s Story'
                          : mode === '30s'
                          ? '30s Reel'
                          : mode === '60s'
                          ? '60s Clip'
                          : 'Full Song'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Start Time Offset Scrubber */}
                <div>
                  <div className="flex items-center justify-between text-[11px] text-white/60 mb-1">
                    <span>Start At Lyric / Track Timestamp:</span>
                    <span className="font-mono font-bold text-white">
                      {formatTime(reelStartTime)} / {formatTime(track.duration || 180)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setReelStartTime((t) => Math.max(0, t - 5))}
                      className="px-2 py-1 rounded-lg glass-button text-[10px] font-bold text-white/70 hover:text-white cursor-pointer"
                      title="Rewind 5 seconds"
                    >
                      -5s
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(10, (track.duration || 180) - 5)}
                      value={reelStartTime}
                      onChange={(e) => setReelStartTime(Number(e.target.value))}
                      className="flex-1 accent-[var(--color-accent)] cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setReelStartTime((t) =>
                          Math.min((track.duration || 180) - 5, t + 5)
                        )
                      }
                      className="px-2 py-1 rounded-lg glass-button text-[10px] font-bold text-white/70 hover:text-white cursor-pointer"
                      title="Forward 5 seconds"
                    >
                      +5s
                    </button>
                  </div>
                </div>
              </div>

              {/* Export & Share Buttons */}
              <div className="pt-2 space-y-2.5">
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleDownloadCard}
                    disabled={isExporting || isRecordingVideo}
                    className="flex-1 py-3 px-5 rounded-2xl glass-button-primary text-white font-bold text-sm shadow-lg hover:brightness-110 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isExporting
                      ? 'Rendering HD Poster...'
                      : aspectMode === 'story'
                      ? '⬇ Download 9:16 Story PNG (1080×1920)'
                      : '⬇ Download 4:5 Feed PNG (1080×1350)'}
                  </button>

                  <button
                    onClick={handleNativeShare}
                    disabled={isExporting || isRecordingVideo}
                    className="py-3 px-5 rounded-2xl glass-button text-white font-bold text-sm transition-all cursor-pointer"
                  >
                    Share Card
                  </button>
                </div>

                {isRecordingVideo ? (
                  <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-cyan-200">
                      <span className="flex items-center gap-1.5 truncate max-w-[70%]">
                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping flex-shrink-0" />
                        <span className="truncate">{exportStatusMessage || 'Encoding Video Reel with Synced Lyrics...'}</span>
                      </span>
                      <span className="font-mono flex-shrink-0">
                        {formatTime(videoElapsedSec)} / {formatTime(targetDurationTotalSec)} (
                        {videoProgress}%)
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-pink-500 transition-all duration-150"
                        style={{ width: `${videoProgress}%` }}
                      />
                    </div>

                    {/* Live Action Buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => stopRecordingEarlyRef.current?.()}
                        className="flex-1 py-2 rounded-xl glass-button-primary text-white font-extrabold text-xs shadow-md cursor-pointer"
                      >
                        ⏹ Finish & Save Reel Now
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelRecordingRef.current?.()}
                        className="py-2 px-3 rounded-xl glass-button text-red-300 hover:text-white font-bold text-xs cursor-pointer"
                      >
                        ✕ Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleStartReelExport}
                    disabled={isRecordingVideo || isExporting}
                    className="w-full py-3 px-5 rounded-2xl glass-button-emerald text-emerald-200 font-extrabold text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-2 hover:brightness-110 active:scale-98"
                  >
                    <span>⚡🎬</span>
                    <span>
                      Export{' '}
                      {reelDurationMode === 'full'
                        ? 'Full Song'
                        : `${reelDurationMode} Video`}{' '}
                      Reel (.webm with Synced Audio & Lyrics)
                    </span>
                  </button>
                )}

                <button
                  onClick={handleCopyLink}
                  className="w-full py-2.5 px-4 rounded-xl glass-button text-xs font-semibold text-white/80 hover:text-white transition-all cursor-pointer"
                >
                  {copiedLink
                    ? '✓ Direct Play Link Copied to Clipboard!'
                    : '🔗 Copy Direct Song Link for WhatsApp / Instagram'}
                </button>
              </div>
            </div>
          </div>

          <canvas ref={canvasRef} className="hidden" />
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
