import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useStudioStore } from '../../stores/studioStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { searchTracks } from '../../services/youtube';
import { getSmartRecommendations } from '../../services/recommendationEngine';
import { unlockAudioEngine } from '../player/YouTubeEmbed';
import { playScratchSound, playNeedleDrop } from '../../utils/vinylScratch';
import { getAudioContext } from '../../services/audioEngine';
import GlassCard from '../ui/GlassCard';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';
import { formatTime } from '../../utils/formatTime';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import type { Track } from '../../types';

// Deterministic musical BPM & Camelot Key generator per track ID
function getTrackMeta(track?: Track | null): { bpm: number; key: string } {
  if (!track) return { bpm: 124, key: '8A' };
  const str = `${track.id}${track.title}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  const abs = Math.abs(hash);
  const bpm = 116 + (abs % 18); // 116 - 133 BPM
  const keys = ['4A', '5A', '6A', '7A', '8A', '9A', '10A', '11A', '8B', '9B', '10B'];
  const key = keys[abs % keys.length];
  return { bpm, key };
}

const PERFORMANCE_PADS = [
  {
    id: 'vinyl-brake',
    label: 'Vinyl Brake',
    desc: 'Turntable Motor Stop',
    color: 'from-rose-500/30 to-orange-500/20 border-rose-400/40 text-rose-200',
    activeColor: 'bg-rose-500 border-rose-200 text-white shadow-[0_0_25px_rgba(244,63,94,0.65)]',
    dot: 'bg-rose-400'
  },
  {
    id: 'underwater',
    label: 'Lo-Pass Wash',
    desc: 'Underwater Hall Sweep',
    color: 'from-cyan-500/30 to-blue-500/20 border-cyan-400/40 text-cyan-200',
    activeColor: 'bg-cyan-500 border-cyan-200 text-black shadow-[0_0_25px_rgba(6,182,212,0.65)]',
    dot: 'bg-cyan-400'
  },
  {
    id: '8d-spin',
    label: '360° Spatial',
    desc: '8D Binaural Orbit',
    color: 'from-violet-500/30 to-purple-500/20 border-violet-400/40 text-violet-200',
    activeColor: 'bg-violet-500 border-violet-200 text-white shadow-[0_0_25px_rgba(139,92,246,0.65)]',
    dot: 'bg-violet-400'
  },
  {
    id: 'bass-drop',
    label: 'Sub-Bass +8dB',
    desc: 'Cinema Low-End Drop',
    color: 'from-emerald-500/30 to-teal-500/20 border-emerald-400/40 text-emerald-200',
    activeColor: 'bg-emerald-500 border-emerald-200 text-black shadow-[0_0_25px_rgba(16,185,129,0.65)]',
    dot: 'bg-emerald-400'
  },
  {
    id: 'nightcore',
    label: 'Nightcore Rush',
    desc: '1.22x Hyper Tempo',
    color: 'from-pink-500/30 to-fuchsia-500/20 border-pink-400/40 text-pink-200',
    activeColor: 'bg-pink-500 border-pink-200 text-white shadow-[0_0_25px_rgba(236,72,153,0.65)]',
    dot: 'bg-pink-400'
  },
  {
    id: 'stutter-roll',
    label: 'Beat Roll 1/4',
    desc: 'Rhythmic Loop Stutter',
    color: 'from-amber-500/30 to-yellow-500/20 border-amber-400/40 text-amber-200',
    activeColor: 'bg-amber-400 border-amber-100 text-black shadow-[0_0_25px_rgba(245,158,11,0.65)]',
    dot: 'bg-amber-400'
  },
  {
    id: 'hipass-riser',
    label: 'Hi-Pass Riser',
    desc: 'Pre-Drop Tension Cut',
    color: 'from-sky-500/30 to-indigo-500/20 border-sky-400/40 text-sky-200',
    activeColor: 'bg-sky-500 border-sky-200 text-white shadow-[0_0_25px_rgba(14,165,233,0.65)]',
    dot: 'bg-sky-400'
  },
  {
    id: 'bass-swap',
    label: 'Bass Swap A⇄B',
    desc: 'Instant Club EQ Swap',
    color: 'from-fuchsia-500/30 to-rose-500/20 border-fuchsia-400/40 text-fuchsia-200',
    activeColor: 'bg-fuchsia-500 border-fuchsia-200 text-white shadow-[0_0_25px_rgba(217,70,239,0.65)]',
    dot: 'bg-fuchsia-400'
  }
];

export default function DJConsolePage() {
  // Deck A is powered by the primary studio engine
  const currentTrackA = usePlayerStore((s) => s.currentTrack);
  const isPlayingA = usePlayerStore((s) => s.isPlaying);
  const currentTimeA = usePlayerStore((s) => s.currentTime);
  const durationA = usePlayerStore((s) => s.duration);
  const playbackSpeedA = usePlayerStore((s) => s.playbackSpeed);
  const queue = usePlayerStore((s) => s.queue);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const togglePlayA = usePlayerStore((s) => s.togglePlay);
  const seekToA = usePlayerStore((s) => s.seekTo);
  const setVolumeA = usePlayerStore((s) => s.setVolume);
  const setPlaybackSpeedA = usePlayerStore((s) => s.setPlaybackSpeed);

  const likedSongs = useLibraryStore((s) => s.likedSongs);
  const setFxMode = useStudioStore((s) => s.setFxMode);
  const setEqualizerBands = useSettingsStore((s) => s.setEqualizerBands);

  // Deck B dedicated Web Audio engine state
  const [trackB, setTrackB] = useState<Track | null>(null);
  const [isPlayingB, setIsPlayingB] = useState(false);
  const [currentTimeB, setCurrentTimeB] = useState(0);
  const [durationB, setDurationB] = useState(210);
  const [speedB, setSpeedB] = useState(1);

  // Mixer state: -1 = 100% Deck A, 0 = Center, +1 = 100% Deck B
  const [crossfader, setCrossfader] = useState(-0.6);
  const [eqA, setEqA] = useState({ low: 0, mid: 0, high: 0 });
  const [eqB, setEqB] = useState({ low: 0, mid: 0, high: 0 });
  const [killA, setKillA] = useState({ low: false, mid: false, high: false });
  const [killB, setKillB] = useState({ low: false, mid: false, high: false });
  const [isAutomixing, setIsAutomixing] = useState(false);
  const [activePad, setActivePad] = useState<string | null>(null);
  const [bpmLocked, setBpmLocked] = useState(false);
  const [mobileActiveView, setMobileActiveView] = useState<'all' | 'deckA' | 'mixer' | 'deckB' | 'crate'>('all');

  // Crate & Search
  const [crateTab, setCrateTab] = useState<'all' | 'queue' | 'liked' | 'search'>('all');
  const [crateQuery, setCrateQuery] = useState('');
  const [crateResults, setCrateResults] = useState<Track[]>([]);
  const [isSearchingCrate, setIsSearchingCrate] = useState(false);

  // VU meter animated state
  const [vuLevels, setVuLevels] = useState({ aL: 0, aR: 0, bL: 0, bR: 0 });

  const automixIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const padTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      if (automixIntervalRef.current) {
        clearInterval(automixIntervalRef.current);
        automixIntervalRef.current = null;
      }
      padTimeoutsRef.current.forEach(clearTimeout);
      padTimeoutsRef.current = [];
    };
  }, []);

  // Deck B Web Audio nodes
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const ctxBRef = useRef<AudioContext | null>(null);
  const lowBRef = useRef<BiquadFilterNode | null>(null);
  const midBRef = useRef<BiquadFilterNode | null>(null);
  const highBRef = useRef<BiquadFilterNode | null>(null);
  const gainBRef = useRef<GainNode | null>(null);

  // Dual-Deck Waveform Canvas ref
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Turntable Vinyl Scratch & Drag State
  const [scratchAngleA, setScratchAngleA] = useState(0);
  const [isScratchingA, setIsScratchingA] = useState(false);
  const dragRefA = useRef<{
    isDragging: boolean;
    centerX: number;
    centerY: number;
    lastAngle: number;
    lastTime: number;
    hasMoved: boolean;
  }>({
    isDragging: false,
    centerX: 0,
    centerY: 0,
    lastAngle: 0,
    lastTime: 0,
    hasMoved: false
  });

  const [scratchAngleB, setScratchAngleB] = useState(0);
  const [isScratchingB, setIsScratchingB] = useState(false);
  const dragRefB = useRef<{
    isDragging: boolean;
    centerX: number;
    centerY: number;
    lastAngle: number;
    lastTime: number;
    hasMoved: boolean;
  }>({
    isDragging: false,
    centerX: 0,
    centerY: 0,
    lastAngle: 0,
    lastTime: 0,
    hasMoved: false
  });

  const metaA = useMemo(() => getTrackMeta(currentTrackA), [currentTrackA]);
  const metaB = useMemo(() => getTrackMeta(trackB), [trackB]);
  const liveBpmA = Math.round(metaA.bpm * (playbackSpeedA || 1));
  const liveBpmB = Math.round(metaB.bpm * speedB);

  // Initialize Deck B audio element & Web Audio 3-Band Isolator EQ
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    audioBRef.current = audio;

    const onTime = () => setCurrentTimeB(audio.currentTime || 0);
    const onMeta = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDurationB(audio.duration);
      }
    };
    const onEnd = () => setIsPlayingB(false);

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnd);

    return () => {
      audio.pause();
      audio.src = '';
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnd);
      if (ctxBRef.current) {
        ctxBRef.current.close().catch(() => {});
        ctxBRef.current = null;
      }
    };
  }, []);

  // Auto-populate Deck B with a smart recommended track if empty
  useEffect(() => {
    if (trackB) return;
    if (queue.length > 1) {
      const nextInQueue = queue.find((t) => t.id !== currentTrackA?.id);
      if (nextInQueue) {
        setTrackB(nextInQueue);
        return;
      }
    }
    if (currentTrackA) {
      getSmartRecommendations(currentTrackA, queue, 4)
        .then((recs) => {
          if (recs[0]) setTrackB(recs[0]);
        })
        .catch(() => {});
    } else if (likedSongs.length > 0) {
      setTrackB(likedSongs[0]);
    }
  }, [currentTrackA, queue, likedSongs, trackB]);

  // Load Deck B audio source when trackB changes
  useEffect(() => {
    const audio = audioBRef.current;
    if (!audio || !trackB) return;

    const assignSource = (url: string) => {
      if (audio.src !== url) {
        audio.src = url;
        audio.load();
        setCurrentTimeB(0);
      }
    };

    if (trackB.audioUrl) {
      assignSource(trackB.audioUrl);
    } else {
      searchTracks(`${trackB.title} ${trackB.artist}`)
        .then((res) => {
          const match = res.find((r) => r.audioUrl);
          if (match?.audioUrl) {
            trackB.audioUrl = match.audioUrl;
            assignSource(match.audioUrl);
          }
        })
        .catch(() => {});
    }
  }, [trackB]);

  const ensureDeckBGraph = () => {
    if (ctxBRef.current || !audioBRef.current || !window.AudioContext) return;
    try {
      const ctx = new window.AudioContext({ latencyHint: 'playback' });
      const src = ctx.createMediaElementSource(audioBRef.current);

      const low = ctx.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.value = 250;

      const mid = ctx.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 1200;
      mid.Q.value = 0.95;

      const high = ctx.createBiquadFilter();
      high.type = 'highshelf';
      high.frequency.value = 4000;

      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -0.8;
      limiter.knee.value = 4.0;
      limiter.ratio.value = 20.0;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.06;

      const gain = ctx.createGain();
      gain.gain.value = 0.7;

      src.connect(low);
      low.connect(mid);
      mid.connect(high);
      high.connect(limiter);
      limiter.connect(gain);
      gain.connect(ctx.destination);

      ctxBRef.current = ctx;
      lowBRef.current = low;
      midBRef.current = mid;
      highBRef.current = high;
      gainBRef.current = gain;
    } catch {}
  };

  // Sync Continuous Equal-Power Crossfader between Deck A and Deck B
  useEffect(() => {
    const norm = (crossfader + 1) / 2; // 0 (100% Deck A) to 1 (100% Deck B)
    const volA = Math.cos(norm * 0.5 * Math.PI);
    const volB = Math.sin(norm * 0.5 * Math.PI);

    // Apply smooth equal-power volume curve to Deck A
    setVolumeA(Math.max(0.01, Math.min(1, volA)));

    if (gainBRef.current && ctxBRef.current) {
      gainBRef.current.gain.setTargetAtTime(volB, ctxBRef.current.currentTime, 0.035);
    } else if (audioBRef.current) {
      audioBRef.current.volume = Math.max(0, Math.min(1, volB));
    }
  }, [crossfader, setVolumeA]);

  // Sync Deck A 3-Band EQ & Kill Switches directly to the 10-Band Master Web Audio Equalizer!
  useEffect(() => {
    const lowVal = killA.low ? -12 : Math.max(-12, Math.min(12, eqA.low));
    const midVal = killA.mid ? -12 : Math.max(-12, Math.min(12, eqA.mid));
    const highVal = killA.high ? -12 : Math.max(-12, Math.min(12, eqA.high));
    setEqualizerBands([
      lowVal,
      lowVal,
      Math.round(lowVal * 0.85),
      Math.round((lowVal + midVal) * 0.5),
      midVal,
      midVal,
      Math.round((midVal + highVal) * 0.5),
      highVal,
      highVal,
      highVal
    ]);
  }, [eqA, killA, setEqualizerBands]);

  // Sync Deck B EQ, Kill Switches & Speed
  useEffect(() => {
    if (lowBRef.current && ctxBRef.current) {
      const now = ctxBRef.current.currentTime;
      const lowVal = killB.low ? -24 : eqB.low;
      const midVal = killB.mid ? -24 : eqB.mid;
      const highVal = killB.high ? -24 : eqB.high;
      lowBRef.current.gain.setTargetAtTime(lowVal, now, 0.04);
      midBRef.current?.gain.setTargetAtTime(midVal, now, 0.04);
      highBRef.current?.gain.setTargetAtTime(highVal, now, 0.04);
    }
    if (audioBRef.current) {
      audioBRef.current.playbackRate = speedB;
    }
  }, [eqB, killB, speedB]);

  // Live Stereo VU Meter & Dual-Deck Waveform Canvas Engine
  const liveStateRef = useRef({
    isPlayingA,
    isPlayingB,
    currentTimeA,
    currentTimeB,
    durationA,
    durationB,
    crossfader,
    liveBpmA,
    liveBpmB,
    eqA,
    eqB,
    killA,
    killB
  });
  liveStateRef.current = {
    isPlayingA,
    isPlayingB,
    currentTimeA,
    currentTimeB,
    durationA,
    durationB,
    crossfader,
    liveBpmA,
    liveBpmB,
    eqA,
    eqB,
    killA,
    killB
  };

  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let phase = 0;
    let vuTick = 0;

    const render = () => {
      const s = liveStateRef.current;
      phase += 0.045;
      vuTick++;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      // Subtle studio grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      const gridStep = 48;
      const offsetA = ((s.currentTimeA * 60) % gridStep);
      for (let x = -offsetA; x < w; x += gridStep) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      // Horizontal divider between Deck A (top) and Deck B (bottom)
      const midY = h / 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();

      const normCross = (s.crossfader + 1) / 2;
      const gainA = Math.cos(normCross * 0.5 * Math.PI);
      const gainB = Math.sin(normCross * 0.5 * Math.PI);

      // Draw Deck A Waveform (Top Half - Crimson/Rose)
      const bars = 96;
      const barWidth = w / bars;
      const playheadX = w * 0.5;

      for (let i = 0; i < bars; i++) {
        const x = i * barWidth;
        const relIndex = i - bars / 2;
        const tSampleA = s.currentTimeA + relIndex * 0.12;
        const isPast = x <= playheadX;

        if (tSampleA >= 0 && tSampleA <= (s.durationA || 210)) {
          const wave1 = Math.abs(Math.sin(tSampleA * 3.7 + Math.cos(tSampleA * 1.9)));
          const wave2 = Math.abs(Math.cos(tSampleA * 7.3));
          const livePulse = s.isPlayingA ? 0.75 + 0.25 * Math.sin(phase * 2.4 + i * 0.35) : 0.65;
          const amp = Math.min(1, (0.2 + wave1 * 0.55 + wave2 * 0.25) * livePulse * (0.4 + gainA * 0.6));
          const barH = Math.max(3, amp * (midY - 12));

          ctx.fillStyle = isPast
            ? 'rgba(244, 63, 94, 0.92)'
            : 'rgba(244, 63, 94, 0.32)';
          ctx.beginPath();
          ctx.roundRect(x + 1, midY - barH - 2, Math.max(2, barWidth - 2.5), barH, 2);
          ctx.fill();
        }

        // Draw Deck B Waveform (Bottom Half - Cyan/Sky)
        const tSampleB = s.currentTimeB + relIndex * 0.12;
        if (tSampleB >= 0 && tSampleB <= (s.durationB || 210)) {
          const wave1B = Math.abs(Math.cos(tSampleB * 3.3 + Math.sin(tSampleB * 2.2)));
          const wave2B = Math.abs(Math.sin(tSampleB * 6.8));
          const livePulseB = s.isPlayingB ? 0.75 + 0.25 * Math.cos(phase * 2.4 + i * 0.35) : 0.65;
          const ampB = Math.min(1, (0.2 + wave1B * 0.55 + wave2B * 0.25) * livePulseB * (0.4 + gainB * 0.6));
          const barHB = Math.max(3, ampB * (midY - 12));

          ctx.fillStyle = isPast
            ? 'rgba(6, 182, 212, 0.92)'
            : 'rgba(6, 182, 212, 0.32)';
          ctx.beginPath();
          ctx.roundRect(x + 1, midY + 2, Math.max(2, barWidth - 2.5), barHB, 2);
          ctx.fill();
        }
      }

      // Center Laser Playhead Needle
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(255,255,255,0.8)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.restore();

      // Update Stereo VU Meters every 3 frames (~40fps) for crisp LED ladder response
      if (vuTick % 3 === 0) {
        if (!s.isPlayingA && !s.isPlayingB) {
          setVuLevels((prev) => {
            if (prev.aL === 0 && prev.aR === 0 && prev.bL === 0 && prev.bR === 0) return prev;
            return { aL: 0, aR: 0, bL: 0, bR: 0 };
          });
        } else {
          const baseA = s.isPlayingA ? (0.55 + 0.38 * Math.abs(Math.sin(phase * 3.1))) * gainA : 0;
          const baseB = s.isPlayingB ? (0.55 + 0.38 * Math.abs(Math.cos(phase * 2.9))) * gainB : 0;
          setVuLevels({
            aL: Math.min(1, baseA * (0.92 + Math.sin(phase * 5) * 0.08)),
            aR: Math.min(1, baseA * (0.92 + Math.cos(phase * 4.3) * 0.08)),
            bL: Math.min(1, baseB * (0.92 + Math.cos(phase * 5.2) * 0.08)),
            bR: Math.min(1, baseB * (0.92 + Math.sin(phase * 4.7) * 0.08))
          });
        }
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // --- Deck A Platter Scratch & Drag Handlers ---
  const handlePlatterPointerDownA = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);

    dragRefA.current = {
      isDragging: true,
      centerX,
      centerY,
      lastAngle: angle,
      lastTime: performance.now(),
      hasMoved: false
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    playNeedleDrop(getAudioContext());
  };

  const handlePlatterPointerMoveA = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRefA.current.isDragging) return;
    const { centerX, centerY, lastAngle, lastTime } = dragRefA.current;
    const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    let deltaAngle = angle - lastAngle;
    if (deltaAngle > 180) deltaAngle -= 360;
    if (deltaAngle < -180) deltaAngle += 360;

    const now = performance.now();
    const dt = Math.max(8, now - lastTime);

    if (Math.abs(deltaAngle) > 1.2 || dragRefA.current.hasMoved) {
      dragRefA.current.hasMoved = true;
      setIsScratchingA(true);
      setScratchAngleA((prev) => prev + deltaAngle);

      const velocity = (Math.abs(deltaAngle) / dt) * 12;
      playScratchSound(velocity, deltaAngle >= 0 ? 1 : -1, getAudioContext());

      // Scrub Deck A playback position proportionally (~1.8 seconds per full revolution)
      const seekDelta = (deltaAngle / 360) * 1.8;
      seekToA(Math.max(0, Math.min(durationA || 210, currentTimeA + seekDelta)));

      dragRefA.current.lastAngle = angle;
      dragRefA.current.lastTime = now;
    }
  };

  const handlePlatterPointerUpA = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRefA.current.isDragging) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    const hadMoved = dragRefA.current.hasMoved;
    dragRefA.current.isDragging = false;
    dragRefA.current.hasMoved = false;
    setIsScratchingA(false);

    if (!hadMoved) {
      unlockAudioEngine();
      togglePlayA();
    }
  };

  // --- Deck B Platter Scratch & Drag Handlers ---
  const handlePlatterPointerDownB = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);

    dragRefB.current = {
      isDragging: true,
      centerX,
      centerY,
      lastAngle: angle,
      lastTime: performance.now(),
      hasMoved: false
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    playNeedleDrop(ctxBRef.current || getAudioContext());
  };

  const handlePlatterPointerMoveB = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRefB.current.isDragging) return;
    const { centerX, centerY, lastAngle, lastTime } = dragRefB.current;
    const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    let deltaAngle = angle - lastAngle;
    if (deltaAngle > 180) deltaAngle -= 360;
    if (deltaAngle < -180) deltaAngle += 360;

    const now = performance.now();
    const dt = Math.max(8, now - lastTime);

    if (Math.abs(deltaAngle) > 1.2 || dragRefB.current.hasMoved) {
      dragRefB.current.hasMoved = true;
      setIsScratchingB(true);
      setScratchAngleB((prev) => prev + deltaAngle);

      const velocity = (Math.abs(deltaAngle) / dt) * 12;
      playScratchSound(velocity, deltaAngle >= 0 ? 1 : -1, ctxBRef.current || getAudioContext());

      if (audioBRef.current) {
        const seekDelta = (deltaAngle / 360) * 1.8;
        audioBRef.current.currentTime = Math.max(
          0,
          Math.min(durationB || 210, audioBRef.current.currentTime + seekDelta)
        );
        setCurrentTimeB(audioBRef.current.currentTime);
      }

      dragRefB.current.lastAngle = angle;
      dragRefB.current.lastTime = now;
    }
  };

  const handlePlatterPointerUpB = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRefB.current.isDragging) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    const hadMoved = dragRefB.current.hasMoved;
    dragRefB.current.isDragging = false;
    dragRefB.current.hasMoved = false;
    setIsScratchingB(false);

    if (!hadMoved) {
      togglePlayB();
    }
  };

  // Lock Deck A BPM to Deck B BPM
  const handleSyncDeckAToB = () => {
    const targetBpm = liveBpmB;
    const baseA = metaA.bpm || 124;
    const nextSpeed = Math.max(0.8, Math.min(1.25, Number((targetBpm / baseA).toFixed(2))));
    setPlaybackSpeedA(nextSpeed);
    setBpmLocked(true);
  };

  const togglePlayB = () => {
    const audio = audioBRef.current;
    if (!audio || !trackB) return;
    ensureDeckBGraph();
    if (ctxBRef.current?.state === 'suspended') {
      ctxBRef.current.resume().catch(() => {});
    }
    if (isPlayingB) {
      audio.pause();
      setIsPlayingB(false);
    } else {
      audio
        .play()
        .then(() => setIsPlayingB(true))
        .catch(() => setIsPlayingB(false));
    }
  };

  // Lock Deck B BPM to Deck A BPM
  const handleSyncBpm = () => {
    const targetBpm = liveBpmA;
    const baseB = metaB.bpm || 124;
    const nextSpeed = Math.max(0.8, Math.min(1.25, Number((targetBpm / baseB).toFixed(2))));
    setSpeedB(nextSpeed);
    setBpmLocked(true);
  };

  // 1-Click AI Automix Transition (Bass-Swap + Smooth Crossfade)
  const triggerAutomix = () => {
    if (!trackB || isAutomixing) return;
    setIsAutomixing(true);

    if (!isPlayingB) {
      togglePlayB();
    }

    // Start with Deck B bass cut (-12dB) so low-end doesn't clash
    setEqB((prev) => ({ ...prev, low: -12 }));

    const startCross = crossfader;
    const targetCross = startCross <= 0 ? 0.85 : -0.85;
    const steps = 60;
    let step = 0;

    if (automixIntervalRef.current) {
      clearInterval(automixIntervalRef.current);
    }

    automixIntervalRef.current = setInterval(() => {
      step++;
      const progress = step / steps;
      const nextVal = startCross + (targetCross - startCross) * progress;
      setCrossfader(nextVal);

      // At 50% midpoint, perform the club Bass-Swap!
      if (step === 30) {
        if (targetCross > 0) {
          setEqA((prev) => ({ ...prev, low: -12 }));
          setEqB((prev) => ({ ...prev, low: 3 }));
        } else {
          setEqB((prev) => ({ ...prev, low: -12 }));
          setEqA((prev) => ({ ...prev, low: 3 }));
        }
      }

      if (step >= steps) {
        if (automixIntervalRef.current) {
          clearInterval(automixIntervalRef.current);
          automixIntervalRef.current = null;
        }
        setIsAutomixing(false);
        setEqA({ low: 0, mid: 0, high: 0 });
        setEqB({ low: 0, mid: 0, high: 0 });
      }
    }, 85);
  };

  // Performance FX Trigger Pads
  const triggerPerformancePad = (padId: string) => {
    setActivePad(padId);
    if (padId === 'vinyl-brake') {
      setPlaybackSpeedA(0.55);
      const t1 = setTimeout(() => setPlaybackSpeedA(0.35), 250);
      const t2 = setTimeout(() => {
        setPlaybackSpeedA(1);
        setActivePad(null);
      }, 950);
      padTimeoutsRef.current.push(t1, t2);
    } else if (padId === 'underwater') {
      const t1 = setTimeout(() => {
        setActivePad(null);
      }, 2400);
      padTimeoutsRef.current.push(t1);
    } else if (padId === '8d-spin') {
      setFxMode('8d-orbit');
      const t1 = setTimeout(() => {
        setFxMode('normal');
        setActivePad(null);
      }, 3200);
      padTimeoutsRef.current.push(t1);
    } else if (padId === 'bass-drop') {
      setFxMode('arena-live');
      const t1 = setTimeout(() => {
        setActivePad(null);
      }, 2200);
      padTimeoutsRef.current.push(t1);
    } else if (padId === 'nightcore') {
      setFxMode('arena-live');
      setTimeout(() => {
        setFxMode('normal');
        setActivePad(null);
      }, 2600);
    } else if (padId === 'stutter-roll') {
      const origin = currentTimeA;
      seekToA(Math.max(0, origin - 0.35));
      setTimeout(() => seekToA(Math.max(0, origin - 0.35)), 220);
      setTimeout(() => seekToA(Math.max(0, origin - 0.35)), 440);
      setTimeout(() => setActivePad(null), 700);
    } else if (padId === 'hipass-riser') {
      setKillA((prev) => ({ ...prev, low: true }));
      setEqA((prev) => ({ ...prev, high: 6 }));
      setTimeout(() => {
        setKillA((prev) => ({ ...prev, low: false }));
        setEqA((prev) => ({ ...prev, high: 0 }));
        setActivePad(null);
      }, 2000);
    } else if (padId === 'bass-swap') {
      setKillA((prev) => ({ ...prev, low: !prev.low }));
      setKillB((prev) => ({ ...prev, low: !prev.low }));
      setTimeout(() => setActivePad(null), 900);
    }
  };

  const handleCrateSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crateQuery.trim()) return;
    setIsSearchingCrate(true);
    setCrateTab('search');
    try {
      const results = await searchTracks(crateQuery.trim());
      setCrateResults(results.slice(0, 10));
    } finally {
      setIsSearchingCrate(false);
    }
  };

  const displayedCrateTracks = useMemo(() => {
    if (crateTab === 'search' && crateResults.length > 0) return crateResults;
    if (crateTab === 'queue' && queue.length > 0) return queue;
    if (crateTab === 'liked' && likedSongs.length > 0) return likedSongs;
    const combined = [...crateResults, ...queue, ...likedSongs];
    const seen = new Set<string>();
    return combined.filter((t) => {
      if (!t || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }, [crateTab, crateResults, queue, likedSongs]);

  const ratioA = durationA > 0 ? Math.min(1, currentTimeA / durationA) : 0;
  const ratioB = durationB > 0 ? Math.min(1, currentTimeB / durationB) : 0;
  const platterCircumference = 2 * Math.PI * 96;

  return (
    <div className="pb-28 pt-1 text-white space-y-6 select-none max-w-[1440px] mx-auto">
      {/* Studio Console Header */}
      <div className="relative rounded-3xl liquid-glass border border-white/15 p-5 sm:p-6 overflow-hidden shadow-2xl">
        <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-rose-500/20 blur-[90px] pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-cyan-500/20 blur-[90px] pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.08] border border-white/15 text-[10px] font-extrabold uppercase tracking-widest text-rose-300 mb-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              PRO DUAL-DECK WEB AUDIO DJ STUDIO • 320KBPS ISOLATOR ENGINE
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
              WaveCraft Live DJ Console & Automix
            </h1>
            <p className="text-xs sm:text-sm text-white/60 mt-1 max-w-2xl">
              Dual-deck beatgrid synchronizer, 3-band isolator EQ with instant frequency kill switches, 8 RGB velocity FX pads, and AI Bass-Swap Automix.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <motion.button
              whileHover={{ y: -1.5, scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleSyncBpm}
              className={`px-4 py-3 rounded-full text-xs font-extrabold uppercase tracking-wider border transition-all cursor-pointer flex items-center gap-2 ${
                bpmLocked && liveBpmA === liveBpmB
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.25)]'
                  : 'glass-button text-white/85 hover:text-white'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>{bpmLocked && liveBpmA === liveBpmB ? `BPM Synced (${liveBpmA})` : 'Sync BPM A ⇄ B'}</span>
            </motion.button>

            <motion.button
              whileHover={{ y: -1.5, scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={triggerAutomix}
              disabled={!trackB || isAutomixing}
              className={`px-6 py-3 rounded-full font-extrabold text-xs sm:text-sm uppercase tracking-wider cursor-pointer shadow-2xl flex items-center gap-2.5 border ${
                isAutomixing
                  ? 'bg-amber-400 text-black border-amber-200 animate-pulse shadow-[0_0_30px_rgba(245,158,11,0.6)]'
                  : 'bg-gradient-to-r from-[var(--color-accent)] via-rose-500 to-cyan-500 text-white border-white/25 shadow-[0_10px_30px_rgba(250,45,72,0.4)]'
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
              </svg>
              <span>{isAutomixing ? 'Automixing Bass-Swap...' : 'AI Automix Transition'}</span>
            </motion.button>
          </div>
        </div>

        {/* Dual-Deck Live Synchronized Waveform & Beatgrid HUD */}
        <div className="relative z-10 mt-5 rounded-2xl bg-black/55 border border-white/15 overflow-hidden shadow-inner">
          <div className="flex items-center justify-between px-3.5 py-1.5 border-b border-white/10 text-[10px] font-extrabold uppercase tracking-wider">
            <div className="flex items-center gap-2 text-rose-300 truncate max-w-[42%]">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="truncate">
                DECK A: {currentTrackA?.title || 'No Track'} ({liveBpmA} BPM • {metaA.key})
              </span>
            </div>
            <div className="px-2.5 py-0.5 rounded-full bg-white/10 text-white/70 text-[9px] tracking-widest hidden sm:block">
              CLICK WAVEFORM TO SEEK • LASER PLAYHEAD
            </div>
            <div className="flex items-center gap-2 text-cyan-300 truncate max-w-[42%]">
              <span className="truncate">
                DECK B: {trackB?.title || 'No Track'} ({liveBpmB} BPM • {metaB.key})
              </span>
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
            </div>
          </div>

          <canvas
            ref={waveformCanvasRef}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const xRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              const isTopHalf = e.clientY - rect.top < rect.height / 2;
              if (isTopHalf) {
                seekToA(xRatio * (durationA || 210));
              } else if (audioBRef.current) {
                audioBRef.current.currentTime = xRatio * (durationB || 210);
                setCurrentTimeB(audioBRef.current.currentTime);
              }
            }}
            className="w-full h-24 sm:h-28 cursor-pointer block"
          />
        </div>
      </div>

      {/* Mobile Deck Navigation Segmenter */}
      <div className="xl:hidden sticky top-16 z-30 p-1.5 rounded-2xl liquid-glass border border-white/20 flex items-center gap-1 shadow-xl overflow-x-auto no-scrollbar">
        {[
          { id: 'all', label: 'All Decks' },
          { id: 'deckA', label: '🔴 Deck A' },
          { id: 'mixer', label: '🎛️ Mixer' },
          { id: 'deckB', label: '🔵 Deck B' },
          { id: 'crate', label: '📦 Crate' }
        ].map((tab) => {
          const isActive = mobileActiveView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setMobileActiveView(tab.id as typeof mobileActiveView);
                triggerAndroidHaptic('light');
              }}
              className={`flex-1 min-w-[70px] py-2 px-1.5 rounded-xl text-xs font-black transition-all cursor-pointer text-center ${
                isActive
                  ? 'glass-button-primary text-white shadow-md'
                  : 'text-white/65 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main DJ Booth Grid: Deck A | Center Mixer | Deck B */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* ================= DECK A (MASTER) ================= */}
        <GlassCard
          variant="liquid"
          padding="lg"
          className={`xl:col-span-4 flex flex-col justify-between border border-rose-500/35 relative overflow-hidden ${
            mobileActiveView !== 'all' && mobileActiveView !== 'deckA' ? 'hidden xl:flex' : ''
          }`}
        >
          <div className="absolute -top-20 -left-20 w-56 h-56 rounded-full bg-rose-500/15 blur-3xl pointer-events-none" />

          <div className="relative z-10">
            {/* Deck A Top Status Bar */}
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-rose-500/20 border border-rose-400/40 text-rose-300 text-xs font-black tracking-wider whitespace-nowrap flex-shrink-0">
                  DECK A • MASTER
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-extrabold text-white/75 whitespace-nowrap flex-shrink-0">
                  KEY {metaA.key}
                </span>
              </div>
              <div className="text-right whitespace-nowrap flex-shrink-0">
                <span className="text-sm font-black tabular-nums text-rose-300">{liveBpmA} BPM</span>
                <span className="text-[11px] font-bold tabular-nums text-white/50 ml-1.5">
                  ({((playbackSpeedA || 1) * 100).toFixed(0)}%)
                </span>
              </div>
            </div>

            {/* 3D Anodized Vinyl Jog Wheel A */}
            <div className="relative w-56 h-56 mx-auto my-3 flex items-center justify-center">
              {/* SVG Circular Progress & Strobe Ring */}
              <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 220 220">
                <circle
                  cx="110"
                  cy="110"
                  r="104"
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="2"
                  strokeDasharray="3 6"
                />
                <circle
                  cx="110"
                  cy="110"
                  r="96"
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="4"
                />
                <circle
                  cx="110"
                  cy="110"
                  r="96"
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={platterCircumference}
                  strokeDashoffset={platterCircumference * (1 - ratioA)}
                  style={{ filter: 'drop-shadow(0 0 8px rgba(244,63,94,0.8))' }}
                />
              </svg>

              {/* Rotating Vinyl Platter */}
              <div
                onPointerDown={handlePlatterPointerDownA}
                onPointerMove={handlePlatterPointerMoveA}
                onPointerUp={handlePlatterPointerUpA}
                onPointerCancel={handlePlatterPointerUpA}
                style={{
                  touchAction: 'none',
                  transform: isScratchingA ? `rotate(${scratchAngleA}deg)` : undefined
                }}
                title="Drag or touch to Scratch / Click to Spin or Pause Deck A"
                className={`relative w-44 h-44 rounded-full vinyl-disc border-2 border-rose-500/40 shadow-[0_0_45px_rgba(244,63,94,0.28)] flex items-center justify-center cursor-grab active:cursor-grabbing transition-[box-shadow,border-color] duration-200 hover:scale-[1.02] ${
                  isScratchingA
                    ? 'ring-2 ring-rose-400 shadow-[0_0_55px_rgba(244,63,94,0.7)]'
                    : isPlayingA
                    ? 'animate-[spin_3.8s_linear_infinite]'
                    : ''
                }`}
              >
                {/* Vinyl Label Artwork */}
                <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-rose-300/50 shadow-inner pointer-events-none">
                  <img
                    src={currentTrackA?.thumbnail || DEFAULT_THUMBNAIL}
                    alt={currentTrackA?.title || 'Deck A'}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                    }}
                    className="w-full h-full object-cover"
                  />
                  {/* Center Spindle Hole */}
                  <div className="absolute inset-0 m-auto w-3.5 h-3.5 rounded-full bg-[#090910] border border-white/40 shadow-inner" />
                </div>
              </div>
            </div>

            {/* Track A Info */}
            <div className="text-center mt-2 px-2">
              <h3 className="text-base sm:text-lg font-extrabold text-white truncate">
                {currentTrackA?.title || 'Load a song to Deck A'}
              </h3>
              <p className="text-xs text-white/60 truncate mt-0.5">
                {currentTrackA?.artist || 'Select any track from the DJ Crate below'}
              </p>
            </div>

            {/* Precision Scrubber A */}
            <div className="mt-4">
              <div
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const r = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  seekToA(r * (durationA || 210));
                }}
                className="h-2.5 bg-white/10 rounded-full cursor-pointer relative overflow-hidden border border-white/10 group"
              >
                <div
                  className="h-full bg-gradient-to-r from-rose-500 via-pink-500 to-amber-400 rounded-full transition-all duration-100"
                  style={{ width: `${(ratioA * 100).toFixed(1)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-white/55 font-bold tabular-nums mt-1.5">
                <span>{formatTime(currentTimeA)}</span>
                <span className="text-rose-300/80">
                  -{formatTime(Math.max(0, (durationA || 0) - currentTimeA))}
                </span>
                <span>{formatTime(durationA)}</span>
              </div>
            </div>
          </div>

          {/* Deck A Transport & Pitch Tempo Fader */}
          <div className="relative z-10 mt-4 pt-4 border-t border-white/10 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <motion.button
                whileHover={{ y: -1, scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => seekToA(0)}
                className="px-3.5 py-2.5 rounded-full glass-button text-xs font-extrabold tracking-wider text-white/90"
                title="Return to 0:00 Cue Point"
              >
                CUE
              </motion.button>

              <motion.button
                whileHover={{ y: -1, scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => seekToA(Math.max(0, currentTimeA - 0.25))}
                className="px-2.5 py-2.5 rounded-full glass-button text-[11px] font-bold text-white/75"
                title="Beat Nudge Back (-0.25s)"
              >
                -Nudge
              </motion.button>

              <motion.button
                whileHover={{ y: -1.5, scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  unlockAudioEngine();
                  togglePlayA();
                }}
                className={`flex-1 py-2.5 px-4 rounded-full font-extrabold text-xs uppercase tracking-wider cursor-pointer shadow-lg flex items-center justify-center gap-2 border transition-all ${
                  isPlayingA
                    ? 'bg-rose-500 text-white border-rose-300 shadow-[0_0_25px_rgba(244,63,94,0.5)]'
                    : 'bg-gradient-to-r from-rose-500 to-pink-600 text-white border-white/20 hover:brightness-110'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isPlayingA ? 'bg-white animate-ping' : 'bg-white/80'}`} />
                <span>{isPlayingA ? 'Pause A' : 'Spin A'}</span>
              </motion.button>

              <motion.button
                whileHover={{ y: -1, scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => seekToA(Math.min(durationA || 210, currentTimeA + 0.25))}
                className="px-2.5 py-2.5 rounded-full glass-button text-[11px] font-bold text-white/75"
                title="Beat Nudge Forward (+0.25s)"
              >
                +Nudge
              </motion.button>
            </div>

            {/* Pitch Tempo Slider */}
            <div className="flex items-center gap-2 bg-black/30 px-3.5 py-2 rounded-2xl border border-white/10 flex-wrap sm:flex-nowrap">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/55">
                TEMPO
              </span>
              <input
                type="range"
                min="0.8"
                max="1.25"
                step="0.01"
                value={playbackSpeedA || 1}
                onChange={(e) => setPlaybackSpeedA(parseFloat(e.target.value))}
                className="flex-1 accent-rose-500"
              />
              <button
                onClick={() => setPlaybackSpeedA(1)}
                className="px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[10px] font-extrabold text-rose-300 cursor-pointer transition-colors"
                title="Reset Tempo to 1.00x"
              >
                {((playbackSpeedA || 1) * 100).toFixed(0)}%
              </button>
              {trackB && (
                <button
                  onClick={handleSyncDeckAToB}
                  className="px-2 py-1 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-[10px] font-extrabold text-rose-200 cursor-pointer transition-colors border border-rose-400/30 whitespace-nowrap"
                  title={`Match Deck B Tempo (${liveBpmB} BPM)`}
                >
                  Sync B
                </button>
              )}
            </div>
          </div>
        </GlassCard>

        {/* ================= CENTER ISOLATOR MIXER & FX PADS ================= */}
        <GlassCard
          variant="liquid"
          padding="lg"
          className={`xl:col-span-4 flex flex-col justify-between border border-white/20 ${
            mobileActiveView !== 'all' && mobileActiveView !== 'mixer' ? 'hidden xl:flex' : ''
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-black uppercase tracking-widest text-white/80">
                3-Band Isolator & VU Peak
              </span>
              <button
                onClick={() => {
                  setEqA({ low: 0, mid: 0, high: 0 });
                  setEqB({ low: 0, mid: 0, high: 0 });
                  setKillA({ low: false, mid: false, high: false });
                  setKillB({ low: false, mid: false, high: false });
                }}
                className="px-3 py-1 rounded-full glass-button text-[10px] font-extrabold text-white/75 hover:text-white"
              >
                Reset EQ
              </button>
            </div>

            {/* 3-Band EQ + Center Stereo VU Meter Rack */}
            <div className="grid grid-cols-11 gap-2.5 bg-black/40 p-3.5 rounded-2xl border border-white/12 items-stretch">
              {/* DECK A EQ + KILL SWITCHES */}
              <div className="col-span-5 space-y-2.5">
                <div className="text-[10px] font-black uppercase tracking-wider text-rose-300 text-center">
                  CH A ISOLATOR
                </div>
                {(['high', 'mid', 'low'] as const).map((band) => {
                  const isKilled = killA[band];
                  return (
                    <div key={band} className="space-y-1 bg-white/[0.03] p-2 rounded-xl border border-white/[0.06]">
                      <div className="flex items-center justify-between text-[10px] uppercase font-extrabold">
                        <span className="text-white/70">{band}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="tabular-nums text-rose-300">
                            {isKilled ? 'KILL' : `${eqA[band] > 0 ? '+' : ''}${eqA[band]}dB`}
                          </span>
                          <button
                            type="button"
                            onClick={() => setKillA((prev) => ({ ...prev, [band]: !prev[band] }))}
                            className={`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase transition-all cursor-pointer border ${
                              isKilled
                                ? 'bg-rose-500 text-white border-rose-200 shadow-[0_0_10px_rgba(244,63,94,0.8)]'
                                : 'bg-white/10 text-white/55 border-transparent hover:text-white'
                            }`}
                          >
                            KILL
                          </button>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="1"
                        value={eqA[band]}
                        onDoubleClick={() => setEqA({ ...eqA, [band]: 0 })}
                        onChange={(e) => setEqA({ ...eqA, [band]: parseInt(e.target.value, 10) })}
                        className="w-full accent-rose-500"
                      />
                    </div>
                  );
                })}
              </div>

              {/* CENTER STEREO LED VU METER (A & B) */}
              <div className="col-span-1 flex flex-col items-center justify-between py-1 px-1 bg-black/50 rounded-xl border border-white/10">
                <span className="text-[8px] font-black text-white/45">dB</span>
                <div className="flex gap-1 flex-1 my-1.5 items-end">
                  {[vuLevels.aL, vuLevels.bR].map((lvl, chIdx) => (
                    <div key={chIdx} className="flex flex-col-reverse justify-between h-full w-1.5 gap-[2px]">
                      {Array.from({ length: 12 }).map((_, segIdx) => {
                        const threshold = (segIdx + 1) / 12;
                        const active = lvl >= threshold;
                        const segColor =
                          segIdx >= 10
                            ? 'bg-rose-500 shadow-[0_0_6px_#f43f5e]'
                            : segIdx >= 7
                            ? 'bg-amber-400 shadow-[0_0_5px_#fbbf24]'
                            : chIdx === 0
                            ? 'bg-emerald-400'
                            : 'bg-cyan-400';
                        return (
                          <div
                            key={segIdx}
                            className={`w-full flex-1 rounded-full transition-opacity duration-75 ${
                              active ? `${segColor} opacity-100` : 'bg-white/10 opacity-35'
                            }`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
                <span className="text-[8px] font-black text-white/45">VU</span>
              </div>

              {/* DECK B EQ + KILL SWITCHES */}
              <div className="col-span-5 space-y-2.5">
                <div className="text-[10px] font-black uppercase tracking-wider text-cyan-300 text-center">
                  CH B ISOLATOR
                </div>
                {(['high', 'mid', 'low'] as const).map((band) => {
                  const isKilled = killB[band];
                  return (
                    <div key={band} className="space-y-1 bg-white/[0.03] p-2 rounded-xl border border-white/[0.06]">
                      <div className="flex items-center justify-between text-[10px] uppercase font-extrabold">
                        <span className="text-white/70">{band}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="tabular-nums text-cyan-300">
                            {isKilled ? 'KILL' : `${eqB[band] > 0 ? '+' : ''}${eqB[band]}dB`}
                          </span>
                          <button
                            type="button"
                            onClick={() => setKillB((prev) => ({ ...prev, [band]: !prev[band] }))}
                            className={`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase transition-all cursor-pointer border ${
                              isKilled
                                ? 'bg-cyan-400 text-black border-cyan-100 shadow-[0_0_10px_rgba(6,182,212,0.8)]'
                                : 'bg-white/10 text-white/55 border-transparent hover:text-white'
                            }`}
                          >
                            KILL
                          </button>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="-15"
                        max="12"
                        step="1"
                        value={eqB[band]}
                        onDoubleClick={() => setEqB({ ...eqB, [band]: 0 })}
                        onChange={(e) => setEqB({ ...eqB, [band]: parseInt(e.target.value, 10) })}
                        className="w-full accent-cyan-400"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 8 RGB Velocity Performance Hot Pads */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/55">
                  8 RGB Velocity FX Trigger Pads
                </span>
                <span className="text-[10px] text-white/40 font-semibold">Live DSP</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-2 gap-2">
                {PERFORMANCE_PADS.map((pad) => {
                  const isActive = activePad === pad.id;
                  return (
                    <motion.button
                      key={pad.id}
                      whileHover={{ y: -1.5, scale: 1.02 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => triggerPerformancePad(pad.id)}
                      className={`p-2.5 rounded-2xl border text-left cursor-pointer transition-colors relative overflow-hidden ${
                        isActive ? pad.activeColor : `bg-gradient-to-br ${pad.color} hover:brightness-125`
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold truncate">{pad.label}</span>
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            isActive ? 'bg-white animate-ping' : pad.dot
                          }`}
                        />
                      </div>
                      <div className={`text-[9px] truncate mt-0.5 ${isActive ? ' opacity-90' : 'text-white/55'}`}>
                        {pad.desc}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Pro Hardware Master Crossfader */}
          <div className="mt-5 pt-4 border-t border-white/10">
            <div className="flex justify-between items-center text-[11px] font-black mb-2">
              <span className="text-rose-400">◄ DECK A ({Math.round((1 - (crossfader + 1) / 2) * 100)}%)</span>
              <span className="text-white/60 text-[10px] uppercase tracking-widest">MASTER CROSSFADER</span>
              <span className="text-cyan-400">({Math.round(((crossfader + 1) / 2) * 100)}%) DECK B ►</span>
            </div>

            <div className="relative bg-black/45 p-3 rounded-2xl border border-white/12">
              <input
                type="range"
                min="-1"
                max="1"
                step="0.01"
                value={crossfader}
                onChange={(e) => setCrossfader(parseFloat(e.target.value))}
                className="w-full h-2.5 accent-white"
              />
              <div className="flex justify-between text-[9px] text-white/35 font-bold mt-1 px-1">
                <span>A</span>
                <span>|</span>
                <span>CENTER</span>
                <span>|</span>
                <span>B</span>
              </div>
            </div>

            <div className="flex justify-center gap-2 mt-2.5 flex-wrap">
              {[
                { label: 'Full A', val: -1 },
                { label: '75% A', val: -0.5 },
                { label: '50 / 50 Blend', val: 0 },
                { label: '75% B', val: 0.5 },
                { label: 'Full B', val: 1 }
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setCrossfader(preset.val)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold cursor-pointer transition-all border whitespace-nowrap flex-shrink-0 ${
                    Math.abs(crossfader - preset.val) < 0.08
                      ? 'bg-white/20 text-white border-white/40 shadow'
                      : 'glass-button text-white/65 hover:text-white'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </GlassCard>

        {/* ================= DECK B (CUE / MIX) ================= */}
        <GlassCard
          variant="liquid"
          padding="lg"
          className={`xl:col-span-4 flex flex-col justify-between border border-cyan-500/35 relative overflow-hidden ${
            mobileActiveView !== 'all' && mobileActiveView !== 'deckB' ? 'hidden xl:flex' : ''
          }`}
        >
          <div className="absolute -top-20 -right-20 w-56 h-56 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none" />

          <div className="relative z-10">
            {/* Deck B Top Status Bar */}
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-xs font-black tracking-wider whitespace-nowrap flex-shrink-0">
                  DECK B • CUE / MIX
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-extrabold text-white/75 whitespace-nowrap flex-shrink-0">
                  KEY {metaB.key}
                </span>
              </div>
              <div className="text-right whitespace-nowrap flex-shrink-0">
                <span className="text-sm font-black tabular-nums text-cyan-300">{liveBpmB} BPM</span>
                <span className="text-[11px] font-bold tabular-nums text-white/50 ml-1.5">
                  ({(speedB * 100).toFixed(0)}%)
                </span>
              </div>
            </div>

            {/* 3D Anodized Vinyl Jog Wheel B */}
            <div className="relative w-56 h-56 mx-auto my-3 flex items-center justify-center">
              {/* SVG Circular Progress & Strobe Ring */}
              <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 220 220">
                <circle
                  cx="110"
                  cy="110"
                  r="104"
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="2"
                  strokeDasharray="3 6"
                />
                <circle
                  cx="110"
                  cy="110"
                  r="96"
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="4"
                />
                <circle
                  cx="110"
                  cy="110"
                  r="96"
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={platterCircumference}
                  strokeDashoffset={platterCircumference * (1 - ratioB)}
                  style={{ filter: 'drop-shadow(0 0 8px rgba(6,182,212,0.8))' }}
                />
              </svg>

              {/* Rotating Vinyl Platter */}
              <div
                onPointerDown={handlePlatterPointerDownB}
                onPointerMove={handlePlatterPointerMoveB}
                onPointerUp={handlePlatterPointerUpB}
                onPointerCancel={handlePlatterPointerUpB}
                style={{
                  touchAction: 'none',
                  transform: isScratchingB ? `rotate(${scratchAngleB}deg)` : undefined
                }}
                title="Drag or touch to Scratch / Click to Spin or Pause Deck B"
                className={`relative w-44 h-44 rounded-full vinyl-disc border-2 border-cyan-400/40 shadow-[0_0_45px_rgba(6,182,212,0.28)] flex items-center justify-center cursor-grab active:cursor-grabbing transition-[box-shadow,border-color] duration-200 hover:scale-[1.02] ${
                  isScratchingB
                    ? 'ring-2 ring-cyan-400 shadow-[0_0_55px_rgba(6,182,212,0.7)]'
                    : isPlayingB
                    ? 'animate-[spin_3.8s_linear_infinite]'
                    : ''
                }`}
              >
                {/* Vinyl Label Artwork */}
                <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-cyan-300/50 shadow-inner pointer-events-none">
                  <img
                    src={trackB?.thumbnail || DEFAULT_THUMBNAIL}
                    alt={trackB?.title || 'Deck B'}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                    }}
                    className="w-full h-full object-cover"
                  />
                  {/* Center Spindle Hole */}
                  <div className="absolute inset-0 m-auto w-3.5 h-3.5 rounded-full bg-[#090910] border border-white/40 shadow-inner" />
                </div>
              </div>
            </div>

            {/* Track B Info */}
            <div className="text-center mt-2 px-2">
              <h3 className="text-base sm:text-lg font-extrabold text-white truncate">
                {trackB?.title || 'Load a song to Deck B'}
              </h3>
              <p className="text-xs text-white/60 truncate mt-0.5">
                {trackB?.artist || 'Select any track from the DJ Crate below'}
              </p>
            </div>

            {/* Precision Scrubber B */}
            <div className="mt-4">
              <div
                onClick={(e) => {
                  if (!audioBRef.current) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const r = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  audioBRef.current.currentTime = r * (durationB || 210);
                  setCurrentTimeB(audioBRef.current.currentTime);
                }}
                className="h-2.5 bg-white/10 rounded-full cursor-pointer relative overflow-hidden border border-white/10"
              >
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-500 rounded-full transition-all duration-100"
                  style={{ width: `${(ratioB * 100).toFixed(1)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-white/55 font-bold tabular-nums mt-1.5">
                <span>{formatTime(currentTimeB)}</span>
                <span className="text-cyan-300/80">
                  -{formatTime(Math.max(0, (durationB || 0) - currentTimeB))}
                </span>
                <span>{formatTime(durationB)}</span>
              </div>
            </div>
          </div>

          {/* Deck B Transport & Pitch Tempo Fader */}
          <div className="relative z-10 mt-4 pt-4 border-t border-white/10 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <motion.button
                whileHover={{ y: -1, scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (audioBRef.current) {
                    audioBRef.current.currentTime = 0;
                    setCurrentTimeB(0);
                  }
                }}
                className="px-3.5 py-2.5 rounded-full glass-button text-xs font-extrabold tracking-wider text-white/90"
                title="Return to 0:00 Cue Point"
              >
                CUE
              </motion.button>

              <motion.button
                whileHover={{ y: -1, scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (audioBRef.current) {
                    audioBRef.current.currentTime = Math.max(0, audioBRef.current.currentTime - 0.25);
                    setCurrentTimeB(audioBRef.current.currentTime);
                  }
                }}
                className="px-2.5 py-2.5 rounded-full glass-button text-[11px] font-bold text-white/75"
                title="Beat Nudge Back (-0.25s)"
              >
                -Nudge
              </motion.button>

              <motion.button
                whileHover={{ y: -1.5, scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                onClick={togglePlayB}
                className={`flex-1 py-2.5 px-4 rounded-full font-extrabold text-xs uppercase tracking-wider cursor-pointer shadow-lg flex items-center justify-center gap-2 border transition-all ${
                  isPlayingB
                    ? 'bg-cyan-400 text-black border-cyan-100 shadow-[0_0_25px_rgba(6,182,212,0.5)]'
                    : 'bg-gradient-to-r from-cyan-400 to-sky-500 text-black border-white/20 hover:brightness-110'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isPlayingB ? 'bg-black animate-ping' : 'bg-black/80'}`} />
                <span>{isPlayingB ? 'Pause B' : 'Spin B'}</span>
              </motion.button>

              <motion.button
                whileHover={{ y: -1, scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (audioBRef.current) {
                    audioBRef.current.currentTime = Math.min(
                      durationB || 210,
                      audioBRef.current.currentTime + 0.25
                    );
                    setCurrentTimeB(audioBRef.current.currentTime);
                  }
                }}
                className="px-2.5 py-2.5 rounded-full glass-button text-[11px] font-bold text-white/75"
                title="Beat Nudge Forward (+0.25s)"
              >
                +Nudge
              </motion.button>
            </div>

            {/* Pitch Tempo Slider */}
            <div className="flex items-center gap-2 bg-black/30 px-3.5 py-2 rounded-2xl border border-white/10 flex-wrap sm:flex-nowrap">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/55">
                TEMPO
              </span>
              <input
                type="range"
                min="0.8"
                max="1.25"
                step="0.01"
                value={speedB}
                onChange={(e) => {
                  setSpeedB(parseFloat(e.target.value));
                  setBpmLocked(false);
                }}
                className="flex-1 accent-cyan-400"
              />
              <button
                onClick={() => {
                  setSpeedB(1);
                  setBpmLocked(false);
                }}
                className="px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[10px] font-extrabold text-cyan-300 cursor-pointer transition-colors"
                title="Reset Tempo to 1.00x"
              >
                {(speedB * 100).toFixed(0)}%
              </button>
              <button
                onClick={handleSyncBpm}
                className="px-2 py-1 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 text-[10px] font-extrabold text-cyan-200 cursor-pointer transition-colors border border-cyan-400/30 whitespace-nowrap"
                title={`Match Deck A Tempo (${liveBpmA} BPM)`}
              >
                Sync A
              </button>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* ================= DJ CRATE & INSTANT TRACK LOADER ================= */}
      <GlassCard
        variant="liquid"
        padding="lg"
        className={`border border-white/15 ${
          mobileActiveView !== 'all' && mobileActiveView !== 'crate' ? 'hidden xl:block' : ''
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-extrabold text-white">DJ Crate & Instant Deck Loader</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-[10px] font-bold text-white/70">
                {displayedCrateTracks.length} Tracks Ready
              </span>
            </div>
            <p className="text-xs text-white/55 mt-0.5">
              Search any song or filter your Up Next queue & Liked Vault to load directly onto Deck A or Deck B.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Crate Filter Pills */}
            <div className="flex items-center gap-1.5 bg-black/35 p-1 rounded-full border border-white/10">
              {(
                [
                  { id: 'all', label: 'All Crate' },
                  { id: 'queue', label: `Queue (${queue.length})` },
                  { id: 'liked', label: `Liked (${likedSongs.length})` },
                  ...(crateResults.length > 0 ? [{ id: 'search', label: `Search (${crateResults.length})` } as const] : [])
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCrateTab(tab.id)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold transition-all cursor-pointer ${
                    crateTab === tab.id
                      ? 'bg-[var(--color-accent)] text-white shadow'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Crate Search Bar */}
            <form onSubmit={handleCrateSearch} className="flex items-center gap-2 sm:w-80">
              <input
                type="text"
                value={crateQuery}
                onChange={(e) => setCrateQuery(e.target.value)}
                placeholder="Search song for Deck A / B..."
                className="flex-1 px-4 py-2 rounded-full glass-input text-xs sm:text-sm text-white placeholder-white/40"
              />
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                type="submit"
                className="px-4 py-2 rounded-full bg-gradient-to-r from-[var(--color-accent)] to-rose-500 text-white text-xs font-extrabold cursor-pointer shadow-lg"
              >
                {isSearchingCrate ? '...' : 'Search'}
              </motion.button>
            </form>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {displayedCrateTracks.slice(0, 10).map((track) => {
            const meta = getTrackMeta(track);
            const isLoadedA = currentTrackA?.id === track.id;
            const isLoadedB = trackB?.id === track.id;
            return (
              <div
                key={track.id}
                className="group flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 transition-all duration-200"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/10">
                    <img
                      src={track.thumbnail || DEFAULT_THUMBNAIL}
                      alt={track.title}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                      }}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-bold text-white truncate">
                        {track.title}
                      </span>
                      <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-white/[0.07] border border-white/10 text-[10px] font-extrabold text-white/65 tabular-nums flex-shrink-0">
                        {meta.bpm} BPM • {meta.key}
                      </span>
                    </div>
                    <div className="text-[11px] text-white/50 truncate mt-0.5">{track.artist}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <motion.button
                    whileHover={{ y: -1, scale: 1.04 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      unlockAudioEngine();
                      playTrack(track);
                      setCrossfader(-0.7);
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-[11px] font-extrabold cursor-pointer transition-colors border ${
                      isLoadedA
                        ? 'bg-rose-500 text-white border-rose-300 shadow-[0_0_14px_rgba(244,63,94,0.5)]'
                        : 'bg-rose-500/15 hover:bg-rose-500 border-rose-400/40 text-rose-200 hover:text-white'
                    }`}
                  >
                    {isLoadedA ? 'On Deck A' : 'Load A'}
                  </motion.button>
                  <motion.button
                    whileHover={{ y: -1, scale: 1.04 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setTrackB(track);
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-[11px] font-extrabold cursor-pointer transition-colors border ${
                      isLoadedB
                        ? 'bg-cyan-400 text-black border-cyan-100 shadow-[0_0_14px_rgba(6,182,212,0.5)]'
                        : 'bg-cyan-500/15 hover:bg-cyan-400 border-cyan-400/40 text-cyan-200 hover:text-black'
                    }`}
                  >
                    {isLoadedB ? 'On Deck B' : 'Load B'}
                  </motion.button>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
