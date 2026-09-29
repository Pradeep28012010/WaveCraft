import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useStudioStore } from '../../stores/studioStore';
import { searchTracks } from '../../services/youtube';
import { getSmartRecommendations } from '../../services/recommendationEngine';
import { unlockAudioEngine } from '../player/YouTubeEmbed';
import GlassCard from '../ui/GlassCard';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';
import type { Track } from '../../types';

const formatTime = (sec: number) => {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

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
  const [isAutomixing, setIsAutomixing] = useState(false);
  const [activePad, setActivePad] = useState<string | null>(null);

  // Crate & Search
  const [crateQuery, setCrateQuery] = useState('');
  const [crateResults, setCrateResults] = useState<Track[]>([]);
  const [isSearchingCrate, setIsSearchingCrate] = useState(false);

  // Deck B Web Audio nodes
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const ctxBRef = useRef<AudioContext | null>(null);
  const lowBRef = useRef<BiquadFilterNode | null>(null);
  const midBRef = useRef<BiquadFilterNode | null>(null);
  const highBRef = useRef<BiquadFilterNode | null>(null);
  const gainBRef = useRef<GainNode | null>(null);

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
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnd);
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

  // Sync Crossfader between Deck A and Deck B only when Deck B is active or crossfader moved
  useEffect(() => {
    const norm = (crossfader + 1) / 2; // 0 (Deck A) to 1 (Deck B)
    const volA = Math.cos(norm * 0.5 * Math.PI);
    const volB = Math.sin(norm * 0.5 * Math.PI);

    if (isPlayingB || isAutomixing) {
      setVolumeA(Math.max(0.02, Math.min(1, volA)));
    }
    if (gainBRef.current && ctxBRef.current) {
      gainBRef.current.gain.setTargetAtTime(volB, ctxBRef.current.currentTime, 0.04);
    } else if (audioBRef.current) {
      audioBRef.current.volume = Math.max(0, Math.min(1, volB));
    }
  }, [crossfader, isPlayingB, isAutomixing, setVolumeA]);

  // Sync Deck B EQ & Speed
  useEffect(() => {
    if (lowBRef.current && ctxBRef.current) {
      const now = ctxBRef.current.currentTime;
      lowBRef.current.gain.setTargetAtTime(eqB.low, now, 0.04);
      midBRef.current?.gain.setTargetAtTime(eqB.mid, now, 0.04);
      highBRef.current?.gain.setTargetAtTime(eqB.high, now, 0.04);
    }
    if (audioBRef.current) {
      audioBRef.current.playbackRate = speedB;
    }
  }, [eqB, speedB]);

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

  // 1-Click AI Automix Transition (Bass-Swap + Smooth Crossfade from Deck A to Deck B)
  const triggerAutomix = () => {
    if (!trackB || isAutomixing) return;
    setIsAutomixing(true);

    // Ensure Deck B is playing
    if (!isPlayingB) {
      togglePlayB();
    }

    // Start with Deck B bass cut (-12dB) so low-end doesn't clash
    setEqB((prev) => ({ ...prev, low: -12 }));

    const startCross = crossfader;
    const steps = 60;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      const progress = step / steps;
      const nextVal = startCross + (0.85 - startCross) * progress;
      setCrossfader(nextVal);

      // At 50% midpoint, perform the club Bass-Swap!
      if (step === 30) {
        setEqA((prev) => ({ ...prev, low: -12 }));
        setEqB((prev) => ({ ...prev, low: 3 }));
      }

      if (step >= steps) {
        clearInterval(interval);
        setIsAutomixing(false);
        setEqA({ low: 0, mid: 0, high: 0 });
        setEqB({ low: 0, mid: 0, high: 0 });
      }
    }, 90);
  };

  // Performance FX Trigger Pads
  const triggerPerformancePad = (padId: string) => {
    setActivePad(padId);
    if (padId === 'vinyl-brake') {
      setPlaybackSpeedA(0.55);
      setTimeout(() => setPlaybackSpeedA(0.35), 250);
      setTimeout(() => {
        setPlaybackSpeedA(1);
        setActivePad(null);
      }, 950);
    } else if (padId === 'underwater') {
      setFxMode('slowed-reverb');
      setTimeout(() => {
        setFxMode('normal');
        setActivePad(null);
      }, 2400);
    } else if (padId === '8d-spin') {
      setFxMode('8d-orbit');
      setTimeout(() => {
        setFxMode('normal');
        setActivePad(null);
      }, 3200);
    } else if (padId === 'bass-drop') {
      setFxMode('bass-cinema');
      setTimeout(() => {
        setActivePad(null);
      }, 2000);
    }
  };

  const handleCrateSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crateQuery.trim()) return;
    setIsSearchingCrate(true);
    try {
      const results = await searchTracks(crateQuery.trim());
      setCrateResults(results.slice(0, 8));
    } finally {
      setIsSearchingCrate(false);
    }
  };

  const ratioA = durationA > 0 ? Math.min(1, currentTimeA / durationA) : 0;
  const ratioB = durationB > 0 ? Math.min(1, currentTimeB / durationB) : 0;

  return (
    <div className="pb-28 pt-2 text-white space-y-8 select-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/40 text-[10px] font-extrabold uppercase tracking-widest text-[var(--color-accent)] mb-2">
            <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-ping" />
            DUAL-DECK WEB AUDIO DJ BOOTH
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
            WaveCraft Live DJ Console & Automix
          </h1>
          <p className="text-xs sm:text-sm text-white/60 mt-1">
            Spin two 320kbps tracks simultaneously, sculpt 3-band isolator EQ, trigger performance pads, or fire an AI Bass-Swap Automix.
          </p>
        </div>

        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={triggerAutomix}
          disabled={!trackB || isAutomixing}
          className={`px-6 py-3.5 rounded-2xl font-extrabold text-xs sm:text-sm uppercase tracking-wider cursor-pointer shadow-2xl flex items-center gap-2.5 ${
            isAutomixing
              ? 'bg-amber-500 text-black animate-pulse'
              : 'bg-gradient-to-r from-[var(--color-accent)] via-rose-500 to-purple-600 text-white'
          }`}
        >
          <span>🤖</span>
          <span>{isAutomixing ? 'Automixing Bass-Swap...' : 'AI Automix A → B'}</span>
        </motion.button>
      </div>

      {/* Main DJ Booth Grid: Deck A | Center Mixer | Deck B */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* DECK A */}
        <GlassCard variant="liquid" padding="lg" className="xl:col-span-4 flex flex-col justify-between border border-rose-500/30">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="px-3 py-1 rounded-full bg-rose-500/20 border border-rose-400/40 text-rose-300 text-xs font-black tracking-wider">
                DECK A • MASTER
              </span>
              <span className="text-xs font-extrabold tabular-nums text-white/60">
                {Math.round(120 * (playbackSpeedA || 1))} BPM • {((playbackSpeedA || 1) * 100).toFixed(0)}%
              </span>
            </div>

            {/* Turntable Platter A */}
            <div className="relative w-48 h-48 mx-auto my-4 flex items-center justify-center">
              <div
                className={`w-full h-full rounded-full vinyl-disc border-4 border-rose-500/40 shadow-[0_0_40px_rgba(244,63,94,0.3)] flex items-center justify-center ${
                  isPlayingA ? 'animate-[spin_4s_linear_infinite]' : ''
                }`}
              >
                <img
                  src={currentTrackA?.thumbnail || DEFAULT_THUMBNAIL}
                  alt={currentTrackA?.title || 'Deck A'}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                  }}
                  className="w-20 h-20 rounded-full object-cover border-2 border-white/30"
                />
              </div>
            </div>

            {/* Track A Info */}
            <div className="text-center mt-2">
              <h3 className="text-lg font-extrabold text-white truncate">
                {currentTrackA?.title || 'Load a song to Deck A'}
              </h3>
              <p className="text-xs text-white/60 truncate mt-0.5">
                {currentTrackA?.artist || 'Select from crate below'}
              </p>
            </div>

            {/* Scrubber A */}
            <div className="mt-4">
              <div
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const r = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  seekToA(r * (durationA || 210));
                }}
                className="h-2 bg-white/15 rounded-full cursor-pointer relative overflow-hidden"
              >
                <div
                  className="h-full bg-gradient-to-r from-rose-500 to-amber-400 rounded-full"
                  style={{ width: `${(ratioA * 100).toFixed(1)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-white/50 font-bold tabular-nums mt-1">
                <span>{formatTime(currentTimeA)}</span>
                <span>{formatTime(durationA)}</span>
              </div>
            </div>
          </div>

          {/* Deck A Controls & Pitch Slider */}
          <div className="mt-5 pt-4 border-t border-white/10 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => seekToA(0)}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-extrabold cursor-pointer"
              >
                ⏮ CUE
              </button>
              <button
                onClick={() => {
                  unlockAudioEngine();
                  togglePlayA();
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-xs uppercase tracking-wider cursor-pointer shadow-lg"
              >
                {isPlayingA ? '⏸ Pause Deck A' : '▶ Spin Deck A'}
              </button>
              <button
                onClick={() => setPlaybackSpeedA(1)}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold cursor-pointer"
              >
                1.0x
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase text-white/50 w-12">Pitch</span>
              <input
                type="range"
                min="0.8"
                max="1.25"
                step="0.01"
                value={playbackSpeedA || 1}
                onChange={(e) => setPlaybackSpeedA(parseFloat(e.target.value))}
                className="flex-1"
              />
            </div>
          </div>
        </GlassCard>

        {/* CENTER MIXER & FX PADS */}
        <GlassCard variant="liquid" padding="lg" className="xl:col-span-4 flex flex-col justify-between border border-white/20">
          <div>
            <div className="text-center mb-4">
              <span className="text-xs font-black uppercase tracking-widest text-white/75">
                🎛️ 3-Band Isolator & Crossfader
              </span>
            </div>

            {/* 3-Band EQ Columns (Deck A vs Deck B) */}
            <div className="grid grid-cols-2 gap-4 bg-black/30 p-4 rounded-2xl border border-white/10">
              {/* EQ A */}
              <div className="space-y-2.5">
                <div className="text-[11px] font-extrabold text-rose-300 text-center">DECK A EQ</div>
                {(['high', 'mid', 'low'] as const).map((band) => (
                  <div key={band} className="space-y-1">
                    <div className="flex justify-between text-[10px] uppercase text-white/55 font-bold">
                      <span>{band}</span>
                      <span>{eqA[band]}dB</span>
                    </div>
                    <input
                      type="range"
                      min="-15"
                      max="12"
                      step="1"
                      value={eqA[band]}
                      onChange={(e) => setEqA({ ...eqA, [band]: parseInt(e.target.value, 10) })}
                      className="w-full"
                    />
                  </div>
                ))}
              </div>

              {/* EQ B */}
              <div className="space-y-2.5">
                <div className="text-[11px] font-extrabold text-cyan-300 text-center">DECK B EQ</div>
                {(['high', 'mid', 'low'] as const).map((band) => (
                  <div key={band} className="space-y-1">
                    <div className="flex justify-between text-[10px] uppercase text-white/55 font-bold">
                      <span>{band}</span>
                      <span>{eqB[band]}dB</span>
                    </div>
                    <input
                      type="range"
                      min="-15"
                      max="12"
                      step="1"
                      value={eqB[band]}
                      onChange={(e) => setEqB({ ...eqB, [band]: parseInt(e.target.value, 10) })}
                      className="w-full"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Performance Hot Pads */}
            <div className="mt-5">
              <div className="text-[10px] font-extrabold uppercase tracking-widest text-white/50 mb-2">
                Performance FX Trigger Pads
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { id: 'vinyl-brake', label: '🛑 Vinyl Brake', desc: 'Turntable Spin-Down' },
                  { id: 'underwater', label: '🌊 Lo-Pass Wash', desc: 'Slowed Hall Sweep' },
                  { id: '8d-spin', label: '🎧 360° Orbit', desc: 'Spatial Panning Drop' },
                  { id: 'bass-drop', label: '🔊 Sub-Bass +8dB', desc: 'Cinema Low-End Punch' }
                ].map((pad) => (
                  <motion.button
                    key={pad.id}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => triggerPerformancePad(pad.id)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      activePad === pad.id
                        ? 'bg-[var(--color-accent)] border-white text-white shadow-lg'
                        : 'bg-white/[0.06] border-white/15 hover:bg-white/[0.12]'
                    }`}
                  >
                    <div className="text-xs font-extrabold">{pad.label}</div>
                    <div className="text-[10px] text-white/55 mt-0.5">{pad.desc}</div>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>

          {/* Master Crossfader */}
          <div className="mt-6 pt-4 border-t border-white/10">
            <div className="flex justify-between text-xs font-black mb-2">
              <span className="text-rose-400">◄ DECK A</span>
              <span className="text-white/60 text-[10px] uppercase tracking-widest">MASTER CROSSFADER</span>
              <span className="text-cyan-400">DECK B ►</span>
            </div>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.02"
              value={crossfader}
              onChange={(e) => setCrossfader(parseFloat(e.target.value))}
              className="w-full h-3"
            />
            <div className="flex justify-center gap-3 mt-2.5">
              <button
                onClick={() => setCrossfader(-1)}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold cursor-pointer"
              >
                Full A
              </button>
              <button
                onClick={() => setCrossfader(0)}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold cursor-pointer"
              >
                50 / 50 Blend
              </button>
              <button
                onClick={() => setCrossfader(1)}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold cursor-pointer"
              >
                Full B
              </button>
            </div>
          </div>
        </GlassCard>

        {/* DECK B */}
        <GlassCard variant="liquid" padding="lg" className="xl:col-span-4 flex flex-col justify-between border border-cyan-500/30">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-xs font-black tracking-wider">
                DECK B • CUE / MIX
              </span>
              <span className="text-xs font-extrabold tabular-nums text-white/60">
                {Math.round(120 * speedB)} BPM • {(speedB * 100).toFixed(0)}%
              </span>
            </div>

            {/* Turntable Platter B */}
            <div className="relative w-48 h-48 mx-auto my-4 flex items-center justify-center">
              <div
                className={`w-full h-full rounded-full vinyl-disc border-4 border-cyan-400/40 shadow-[0_0_40px_rgba(34,211,238,0.28)] flex items-center justify-center ${
                  isPlayingB ? 'animate-[spin_4s_linear_infinite]' : ''
                }`}
              >
                <img
                  src={trackB?.thumbnail || DEFAULT_THUMBNAIL}
                  alt={trackB?.title || 'Deck B'}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                  }}
                  className="w-20 h-20 rounded-full object-cover border-2 border-white/30"
                />
              </div>
            </div>

            {/* Track B Info */}
            <div className="text-center mt-2">
              <h3 className="text-lg font-extrabold text-white truncate">
                {trackB?.title || 'Load a song to Deck B'}
              </h3>
              <p className="text-xs text-white/60 truncate mt-0.5">
                {trackB?.artist || 'Select from crate below'}
              </p>
            </div>

            {/* Scrubber B */}
            <div className="mt-4">
              <div
                onClick={(e) => {
                  if (!audioBRef.current) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const r = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  audioBRef.current.currentTime = r * (durationB || 210);
                }}
                className="h-2 bg-white/15 rounded-full cursor-pointer relative overflow-hidden"
              >
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full"
                  style={{ width: `${(ratioB * 100).toFixed(1)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-white/50 font-bold tabular-nums mt-1">
                <span>{formatTime(currentTimeB)}</span>
                <span>{formatTime(durationB)}</span>
              </div>
            </div>
          </div>

          {/* Deck B Controls & Pitch Slider */}
          <div className="mt-5 pt-4 border-t border-white/10 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => {
                  if (audioBRef.current) audioBRef.current.currentTime = 0;
                }}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-extrabold cursor-pointer"
              >
                ⏮ CUE
              </button>
              <button
                onClick={togglePlayB}
                className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-black font-extrabold text-xs uppercase tracking-wider cursor-pointer shadow-lg"
              >
                {isPlayingB ? '⏸ Pause Deck B' : '▶ Spin Deck B'}
              </button>
              <button
                onClick={() => setSpeedB(1)}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold cursor-pointer"
              >
                1.0x
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase text-white/50 w-12">Pitch</span>
              <input
                type="range"
                min="0.8"
                max="1.25"
                step="0.01"
                value={speedB}
                onChange={(e) => setSpeedB(parseFloat(e.target.value))}
                className="flex-1"
              />
            </div>
          </div>
        </GlassCard>
      </div>

      {/* DJ Crate: Search or Pick from Queue / Liked Songs to Load Deck A or Deck B */}
      <GlassCard variant="liquid" padding="lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-extrabold text-white">🗂️ DJ Crate & Instant Track Loader</h2>
            <p className="text-xs text-white/55 mt-0.5">
              Search any song or pick from your Up Next queue to load directly onto Deck A or Deck B.
            </p>
          </div>
          <form onSubmit={handleCrateSearch} className="flex items-center gap-2 w-full sm:w-96">
            <input
              type="text"
              value={crateQuery}
              onChange={(e) => setCrateQuery(e.target.value)}
              placeholder="Search song for Deck A / Deck B..."
              className="flex-1 px-4 py-2 rounded-xl bg-white/10 border border-white/15 text-xs sm:text-sm text-white placeholder-white/40 focus:outline-none focus:border-[var(--color-accent)]"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[var(--color-accent)] text-white text-xs font-extrabold cursor-pointer"
            >
              {isSearchingCrate ? '...' : 'Search'}
            </button>
          </form>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {(crateResults.length > 0 ? crateResults : queue.length > 0 ? queue : likedSongs)
            .slice(0, 8)
            .map((track) => (
              <div
                key={track.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={track.thumbnail || DEFAULT_THUMBNAIL}
                    alt={track.title}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                    }}
                    className="w-11 h-11 rounded-xl object-cover flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-white truncate">
                      {track.title}
                    </div>
                    <div className="text-[11px] text-white/50 truncate">{track.artist}</div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => {
                      unlockAudioEngine();
                      playTrack(track);
                      setCrossfader(-0.7);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500 border border-rose-400/40 text-rose-200 hover:text-white text-[10px] font-extrabold cursor-pointer transition-colors"
                  >
                    Load A
                  </button>
                  <button
                    onClick={() => {
                      setTrackB(track);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500 border border-cyan-400/40 text-cyan-200 hover:text-black text-[10px] font-extrabold cursor-pointer transition-colors"
                  >
                    Load B
                  </button>
                </div>
              </div>
            ))}
        </div>
      </GlassCard>
    </div>
  );
}
