import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Track, LyricLine } from '../../types';
import { getLyrics } from '../../services/lyrics';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';

interface WaveCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: Track;
  currentTime?: number;
}

const CARD_THEMES = [
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
    id: 'emerald',
    name: 'Emerald Studio',
    primary: '#10b981',
    secondary: '#3b82f6',
    bgStart: '#06241d',
    bgEnd: '#05080c'
  },
  {
    id: 'gold',
    name: 'Sunset Vinyl',
    primary: '#f59e0b',
    secondary: '#ec4899',
    bgStart: '#271505',
    bgEnd: '#08060a'
  }
];

export default function WaveCardModal({
  isOpen,
  onClose,
  track,
  currentTime = 0
}: WaveCardModalProps) {
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<string>('');
  const [themeId, setThemeId] = useState<string>('crimson');
  const [copiedLink, setCopiedLink] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const activeTheme = CARD_THEMES.find((t) => t.id === themeId) || CARD_THEMES[0];

  // Fetch lyrics when opened so user can pick any line
  useEffect(() => {
    if (!isOpen || !track) return;
    let cancelled = false;

    getLyrics(track.artist, track.title).then((lines) => {
      if (cancelled) return;
      const valid = lines.filter(
        (l) =>
          l.text &&
          !l.text.includes('Lyrics for this track') &&
          !l.text.includes('Switch to Visualizer') &&
          !l.text.startsWith('♪')
      );
      setLyrics(valid);

      if (valid.length > 0) {
        // Pick the line closest to currentTime
        let activeIdx = 0;
        for (let i = 0; i < valid.length; i++) {
          if (currentTime >= valid[i].time) activeIdx = i;
        }
        const line1 = valid[activeIdx]?.text || '';
        const line2 = valid[activeIdx + 1]?.text || '';
        setSelectedQuote(line2 ? `${line1}\n${line2}` : line1);
      } else {
        setSelectedQuote(`Lost in the sound of ${track.title} ✨`);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, track, currentTime]);

  const shareUrl = `${window.location.origin}/?play=${encodeURIComponent(
    `${track.title} ${track.artist}`
  )}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {}
  };

  // Render high-res 1080x1350 PNG via HTML5 Canvas
  const generateCanvasBlob = async (): Promise<Blob | null> => {
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 1. Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1350);
    bgGrad.addColorStop(0, activeTheme.bgStart);
    bgGrad.addColorStop(0.55, '#0b0b14');
    bgGrad.addColorStop(1, activeTheme.bgEnd);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1350);

    // 2. Ambient Glow Orbs
    const orb1 = ctx.createRadialGradient(220, 260, 20, 220, 260, 520);
    orb1.addColorStop(0, `${activeTheme.primary}66`);
    orb1.addColorStop(1, 'transparent');
    ctx.fillStyle = orb1;
    ctx.fillRect(0, 0, 1080, 1350);

    const orb2 = ctx.createRadialGradient(880, 1050, 20, 880, 1050, 520);
    orb2.addColorStop(0, `${activeTheme.secondary}55`);
    orb2.addColorStop(1, 'transparent');
    ctx.fillStyle = orb2;
    ctx.fillRect(0, 0, 1080, 1350);

    // 3. Inner Frosted Card Frame
    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(72, 72, 936, 1206, 56);
    ctx.fill();
    ctx.stroke();

    // 4. Load Album Cover safely
    const imgUrl = track.thumbnailLarge || track.thumbnail || DEFAULT_THUMBNAIL;
    const loadImg = (src: string): Promise<HTMLImageElement | null> =>
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });

    const artImg = await loadImg(imgUrl);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(140, 140, 280, 280, 38);
    ctx.clip();
    if (artImg) {
      ctx.drawImage(artImg, 140, 140, 280, 280);
    } else {
      const fallbackGrad = ctx.createLinearGradient(140, 140, 420, 420);
      fallbackGrad.addColorStop(0, activeTheme.primary);
      fallbackGrad.addColorStop(1, activeTheme.secondary);
      ctx.fillStyle = fallbackGrad;
      ctx.fillRect(140, 140, 280, 280);
    }
    ctx.restore();

    // 5. Track Title & Artist next to Album Art
    ctx.fillStyle = activeTheme.primary;
    ctx.font = 'bold 24px Inter, sans-serif';
    ctx.fillText('NOW STREAMING ON WAVECRAFT', 460, 215);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 46px Inter, sans-serif';
    const titleShort = track.title.length > 22 ? track.title.slice(0, 21) + '…' : track.title;
    ctx.fillText(titleShort, 460, 285);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.68)';
    ctx.font = '600 32px Inter, sans-serif';
    const artistShort = track.artist.length > 28 ? track.artist.slice(0, 27) + '…' : track.artist;
    ctx.fillText(artistShort, 460, 340);

    // 6. Decorative Quote Mark & Lyric Quote Block
    ctx.fillStyle = `${activeTheme.primary}44`;
    ctx.font = '800 140px Georgia, serif';
    ctx.fillText('“', 135, 575);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 46px Inter, sans-serif';
    const rawLines = (selectedQuote || track.title).split('\n');
    const wrappedLines: string[] = [];
    for (const raw of rawLines) {
      const words = raw.trim().split(/\s+/);
      let current = '';
      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (ctx.measureText(test).width > 780) {
          if (current) wrappedLines.push(current);
          current = word;
        } else {
          current = test;
        }
      }
      if (current) wrappedLines.push(current);
    }

    let yCursor = 615;
    for (const line of wrappedLines.slice(0, 6)) {
      ctx.fillText(line, 145, yCursor);
      yCursor += 68;
    }

    // 7. Studio Waveform Bars at Bottom
    const waveY = 1075;
    const barCount = 44;
    const totalWaveW = 790;
    const barGap = totalWaveW / barCount;
    for (let i = 0; i < barCount; i++) {
      const h = 16 + Math.abs(Math.sin(i * 0.45) * 48 + Math.cos(i * 0.8) * 22);
      const x = 145 + i * barGap;
      ctx.fillStyle = i < barCount * 0.62 ? activeTheme.primary : 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.roundRect(x, waveY - h / 2, 9, h, 4.5);
      ctx.fill();
    }

    // 8. Footer Branding
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '600 24px Inter, sans-serif';
    ctx.fillText('WaveCraft • Liquid Glass Music Studio', 145, 1195);

    ctx.fillStyle = activeTheme.primary;
    ctx.font = '700 24px Inter, sans-serif';
    ctx.fillText('320kbps HD', 790, 1195);

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

  // Record a 6-second 60fps 9:16 Animated Video Story (.webm) with spinning vinyl & live spectrum
  const handleRecordVideoStory = async () => {
    if (isRecordingVideo || typeof MediaRecorder === 'undefined') return;
    setIsRecordingVideo(true);
    setVideoProgress(0);

    try {
      const vCanvas = document.createElement('canvas');
      vCanvas.width = 720;
      vCanvas.height = 1280;
      const ctx = vCanvas.getContext('2d');
      if (!ctx) {
        setIsRecordingVideo(false);
        return;
      }

      const imgUrl = track.thumbnailLarge || track.thumbnail || DEFAULT_THUMBNAIL;
      const artImg = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = imgUrl;
      });

      const stream = vCanvas.captureStream(60);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 4_500_000
      });

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      const totalMs = 6000;
      const startTime = performance.now();
      let rafId = 0;

      const drawFrame = (now: number) => {
        const elapsed = now - startTime;
        const t = elapsed / 1000;
        const pct = Math.min(100, Math.round((elapsed / totalMs) * 100));
        setVideoProgress(pct);

        // 1. Background
        const bgGrad = ctx.createLinearGradient(0, 0, 720, 1280);
        bgGrad.addColorStop(0, activeTheme.bgStart);
        bgGrad.addColorStop(0.55, '#090912');
        bgGrad.addColorStop(1, activeTheme.bgEnd);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 720, 1280);

        // 2. Orbiting Glow Orbs
        const ox1 = 200 + Math.cos(t * 1.2) * 90;
        const oy1 = 260 + Math.sin(t * 1.2) * 70;
        const orb1 = ctx.createRadialGradient(ox1, oy1, 20, ox1, oy1, 380);
        orb1.addColorStop(0, `${activeTheme.primary}66`);
        orb1.addColorStop(1, 'transparent');
        ctx.fillStyle = orb1;
        ctx.fillRect(0, 0, 720, 1280);

        // 3. Spinning Vinyl Platter
        const vcx = 360;
        const vcy = 340;
        ctx.save();
        ctx.translate(vcx, vcy);
        ctx.rotate(t * 1.6);

        ctx.beginPath();
        ctx.arc(0, 0, 170, 0, Math.PI * 2);
        ctx.fillStyle = '#111116';
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = activeTheme.primary;
        ctx.stroke();

        // Vinyl grooves
        for (const r of [145, 120, 95]) {
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
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

        // 4. Track Title & Artist
        ctx.textAlign = 'center';
        ctx.fillStyle = activeTheme.primary;
        ctx.font = '800 18px Inter, sans-serif';
        ctx.fillText('WAVECRAFT STUDIO STORY', 360, 565);

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 34px Inter, sans-serif';
        const titleShort = track.title.length > 24 ? track.title.slice(0, 23) + '…' : track.title;
        ctx.fillText(titleShort, 360, 612);

        ctx.fillStyle = 'rgba(255,255,255,0.68)';
        ctx.font = '600 22px Inter, sans-serif';
        const artistShort = track.artist.length > 30 ? track.artist.slice(0, 29) + '…' : track.artist;
        ctx.fillText(artistShort, 360, 648);

        // 5. Lyric Quote Box
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(64, 695, 592, 260, 32);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 28px Inter, sans-serif';
        const quoteLines = (selectedQuote || track.title).split('\n').slice(0, 3);
        quoteLines.forEach((line, idx) => {
          const clean = line.length > 34 ? line.slice(0, 33) + '…' : line;
          ctx.fillText(`“${clean}”`, 360, 775 + idx * 48);
        });

        // 6. Animated Bouncing Audio-Reactive Equalizer Bars
        const barCount = 36;
        const startX = 90;
        const stepX = 540 / barCount;
        for (let i = 0; i < barCount; i++) {
          const wave =
            20 +
            Math.abs(Math.sin(t * 7 + i * 0.4) * 52 + Math.cos(t * 4.5 - i * 0.3) * 28);
          ctx.fillStyle = i % 2 === 0 ? activeTheme.primary : activeTheme.secondary;
          ctx.beginPath();
          ctx.roundRect(startX + i * stepX, 1060 - wave / 2, 9, wave, 4.5);
          ctx.fill();
        }

        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '700 18px Inter, sans-serif';
        ctx.fillText('WaveCraft • 320kbps Studio Audio', 360, 1190);

        if (elapsed < totalMs) {
          rafId = requestAnimationFrame(drawFrame);
        } else {
          recorder.stop();
        }
      };

      recorder.onstop = () => {
        cancelAnimationFrame(rafId);
        const videoBlob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(videoBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `WaveStory-${track.title.replace(/[^a-z0-9]/gi, '_').slice(0, 22)}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        setIsRecordingVideo(false);
        setVideoProgress(0);
      };

      recorder.start();
      rafId = requestAnimationFrame(drawFrame);
    } catch {
      setIsRecordingVideo(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-2xl"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-4xl rounded-3xl liquid-glass border border-white/15 p-6 sm:p-8 shadow-[0_28px_90px_rgba(0,0,0,0.85)] max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-accent)]">
                Social Studio Export
              </span>
              <h2 className="text-2xl font-extrabold text-white mt-0.5">
                Create Shareable WaveCard
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full liquid-glass flex items-center justify-center text-white/70 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Live Interactive Card Preview */}
            <div className="lg:col-span-6 flex justify-center">
              <div
                className="w-full max-w-[340px] aspect-[4/5] rounded-3xl p-6 flex flex-col justify-between relative overflow-hidden border border-white/20 shadow-2xl select-none"
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

                {/* Top Track Header */}
                <div className="relative z-10 flex items-center gap-3.5">
                  <img
                    src={track.thumbnailLarge || track.thumbnail || DEFAULT_THUMBNAIL}
                    alt={track.title}
                    className="w-16 h-16 rounded-2xl object-cover shadow-lg border border-white/15 flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <span
                      className="text-[9px] font-extrabold uppercase tracking-widest block"
                      style={{ color: activeTheme.primary }}
                    >
                      WaveCraft Studio
                    </span>
                    <h4 className="text-base font-extrabold text-white truncate mt-0.5">
                      {track.title}
                    </h4>
                    <p className="text-xs text-white/65 truncate">{track.artist}</p>
                  </div>
                </div>

                {/* Center Highlighted Lyric Quote */}
                <div className="relative z-10 my-auto py-4">
                  <div
                    className="text-4xl font-serif leading-none opacity-40 mb-1"
                    style={{ color: activeTheme.primary }}
                  >
                    “
                  </div>
                  <p className="text-lg sm:text-xl font-extrabold text-white leading-snug whitespace-pre-line line-clamp-5">
                    {selectedQuote || `Listening to ${track.title}`}
                  </p>
                </div>

                {/* Bottom Waveform & Badge */}
                <div className="relative z-10 pt-3 border-t border-white/10">
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
                          ? 'border-white bg-white/15 text-white shadow-lg'
                          : 'border-white/10 bg-white/5 text-white/65 hover:text-white'
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
                  className="w-full rounded-2xl bg-white/[0.06] border border-white/15 p-3.5 text-sm text-white placeholder-white/35 focus:outline-none focus:border-white/35 resize-none"
                />
              </div>

              {/* Quick Lyric Line Picker */}
              {lyrics.length > 0 && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-2">
                    Or Tap a Lyric Line From This Track:
                  </label>
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                    {lyrics.slice(0, 25).map((line, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          const nextLine = lyrics[i + 1]?.text;
                          setSelectedQuote(nextLine ? `${line.text}\n${nextLine}` : line.text);
                        }}
                        className="w-full text-left px-3 py-1.5 rounded-xl text-xs text-white/75 hover:text-white hover:bg-white/10 transition-colors truncate cursor-pointer"
                      >
                        “{line.text}”
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Export & Share Buttons */}
              <div className="pt-2 space-y-2.5">
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleDownloadCard}
                    disabled={isExporting || isRecordingVideo}
                    className="flex-1 py-3 px-5 rounded-2xl bg-gradient-to-r from-[var(--color-accent)] to-purple-600 text-white font-bold text-sm shadow-lg hover:brightness-110 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isExporting ? 'Rendering HD Card...' : '⬇ Download Story PNG'}
                  </button>

                  <button
                    onClick={handleNativeShare}
                    disabled={isExporting || isRecordingVideo}
                    className="py-3 px-5 rounded-2xl liquid-glass text-white font-bold text-sm hover:bg-white/15 transition-all cursor-pointer"
                  >
                    Share Card
                  </button>
                </div>

                <button
                  onClick={handleRecordVideoStory}
                  disabled={isRecordingVideo || isExporting}
                  className="w-full py-3 px-5 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 font-extrabold text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>🎬</span>
                  <span>
                    {isRecordingVideo
                      ? `Recording 60fps Video Reel... (${videoProgress}%)`
                      : 'Export 6s Animated Video Story (.webm)'}
                  </span>
                </button>

                <button
                  onClick={handleCopyLink}
                  className="w-full py-2.5 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-white/80 hover:text-white transition-all cursor-pointer"
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
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
