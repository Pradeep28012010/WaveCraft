import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { getSmartRecommendations, playTrackWithSmartQueue } from '../../services/recommendationEngine';
import { searchTracks } from '../../services/youtube';
import { unlockAudioEngine } from '../player/YouTubeEmbed';
import GlassCard from '../ui/GlassCard';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';
import type { Track } from '../../types';

interface StarNode {
  id: string;
  track: Track;
  clusterIndex: number;
  clusterName: string;
  color: string;
  x: number; // normalized -1 to 1
  y: number; // normalized -1 to 1
  baseRadius: number;
  orbitSpeed: number;
  phase: number;
  sourceLabel: 'Liked Core' | 'Recent Orbit' | 'AI Taste Predicted';
}

const CLUSTERS = [
  { name: 'Crimson Pulse', subtitle: 'High-Energy & Anthem Hits', color: '#f43f5e', cx: -0.42, cy: -0.32 },
  { name: 'Midnight Velvet', subtitle: 'Late-Night Melody & Soul', color: '#a855f7', cx: 0.42, cy: -0.28 },
  { name: 'Cyber Horizon', subtitle: 'Cinema & Bass Odyssey', color: '#06b6d4', cx: -0.38, cy: 0.36 },
  { name: 'Golden Aura', subtitle: 'Acoustic & Timeless Classics', color: '#f59e0b', cx: 0.4, cy: 0.34 }
];

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export default function SonicGalaxyPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const playTrack = usePlayerStore((s) => s.playTrack);

  const likedSongs = useLibraryStore((s) => s.likedSongs);
  const recentlyPlayed = useLibraryStore((s) => s.recentlyPlayed);

  const [predictedTracks, setPredictedTracks] = useState<Track[]>([]);
  const [selectedStar, setSelectedStar] = useState<StarNode | null>(null);
  const [hoveredStarId, setHoveredStarId] = useState<string | null>(null);
  const [activeClusterFilter, setActiveClusterFilter] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);

  // Load AI Taste-Predicted stars to enrich the galaxy
  useEffect(() => {
    let active = true;
    const seed =
      currentTrack ||
      likedSongs[0] ||
      recentlyPlayed[0]?.track ||
      queue[0];

    if (seed) {
      getSmartRecommendations(seed, [], 16)
        .then((recs) => {
          if (active) setPredictedTracks(recs);
        })
        .catch(() => {});
    } else {
      searchTracks('Top Global & Indian Hits 2025')
        .then((res) => {
          if (active) setPredictedTracks(res.slice(0, 18));
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [currentTrack?.id, likedSongs.length]);

  // Build deterministic, clustered StarNodes from user's library + AI predictions
  const stars: StarNode[] = useMemo(() => {
    const map = new Map<string, { track: Track; source: StarNode['sourceLabel'] }>();

    for (const t of likedSongs.slice(0, 14)) {
      if (t?.id) map.set(t.id, { track: t, source: 'Liked Core' });
    }
    for (const r of recentlyPlayed.slice(0, 12)) {
      if (r?.track?.id && !map.has(r.track.id)) {
        map.set(r.track.id, { track: r.track, source: 'Recent Orbit' });
      }
    }
    for (const p of predictedTracks) {
      if (p?.id && !map.has(p.id)) {
        map.set(p.id, { track: p, source: 'AI Taste Predicted' });
      }
    }
    for (const q of queue.slice(0, 10)) {
      if (q?.id && !map.has(q.id)) {
        map.set(q.id, { track: q, source: 'AI Taste Predicted' });
      }
    }

    const nodes: StarNode[] = [];
    Array.from(map.values()).forEach(({ track, source }, idx) => {
      const h = hashString(track.id + track.artist);
      const clusterIndex = h % CLUSTERS.length;
      const cluster = CLUSTERS[clusterIndex];
      const angle = ((h % 360) * Math.PI) / 180 + idx * 0.7;
      const dist = 0.08 + ((h % 100) / 100) * 0.24;

      nodes.push({
        id: track.id,
        track,
        clusterIndex,
        clusterName: cluster.name,
        color: cluster.color,
        x: cluster.cx + Math.cos(angle) * dist,
        y: cluster.cy + Math.sin(angle) * dist,
        baseRadius: source === 'Liked Core' ? 8.5 : source === 'Recent Orbit' ? 7 : 6,
        orbitSpeed: 0.15 + (h % 10) * 0.02,
        phase: (h % 628) / 100,
        sourceLabel: source
      });
    });

    return nodes;
  }, [likedSongs, recentlyPlayed, predictedTracks, queue]);

  useEffect(() => {
    if (!selectedStar && stars.length > 0) {
      const currentStar = stars.find((s) => s.id === currentTrack?.id) || stars[0];
      setSelectedStar(currentStar);
    }
  }, [stars, currentTrack?.id, selectedStar]);

  // 120fps Interactive Canvas Renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let time = 0;
    let lastNow = performance.now();
    const screenPositions = new Map<string, { sx: number; sy: number; r: number; node: StarNode }>();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const handlePointerMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let found: string | null = null;

      for (const { sx, sy, r, node } of screenPositions.values()) {
        const dx = mx - sx;
        const dy = my - sy;
        if (dx * dx + dy * dy <= (r + 10) * (r + 10)) {
          found = node.id;
          break;
        }
      }
      canvas.style.cursor = found ? 'pointer' : 'grab';
      setHoveredStarId(found);
    };

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      for (const { sx, sy, r, node } of screenPositions.values()) {
        const dx = mx - sx;
        const dy = my - sy;
        if (dx * dx + dy * dy <= (r + 12) * (r + 12)) {
          setSelectedStar(node);
          return;
        }
      }
    };

    canvas.addEventListener('mousemove', handlePointerMove);
    canvas.addEventListener('click', handleClick);

    const render = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;
      time += dt;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const cx = width / 2;
      const cy = height / 2;
      const scale = Math.min(width, height) * 0.46 * zoom;

      ctx.clearRect(0, 0, width, height);

      // 1. Draw subtle Nebula Cluster Glows
      CLUSTERS.forEach((cluster, idx) => {
        if (activeClusterFilter !== null && activeClusterFilter !== idx) return;
        const gx = cx + cluster.cx * scale;
        const gy = cy + cluster.cy * scale;
        const grad = ctx.createRadialGradient(gx, gy, 8, gx, gy, 150 * zoom);
        grad.addColorStop(0, `${cluster.color}28`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(gx, gy, 150 * zoom, 0, Math.PI * 2);
        ctx.fill();

        // Cluster Title Watermark
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.font = '800 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(cluster.name.toUpperCase(), gx, gy - 95 * zoom);
      });

      screenPositions.clear();
      const visibleNodes = stars.filter(
        (s) => activeClusterFilter === null || s.clusterIndex === activeClusterFilter
      );

      // Compute current screen coordinates with gentle orbital motion
      for (const node of visibleNodes) {
        const wobbleX = Math.cos(time * node.orbitSpeed + node.phase) * 0.018;
        const wobbleY = Math.sin(time * node.orbitSpeed + node.phase) * 0.018;
        const sx = cx + (node.x + wobbleX) * scale;
        const sy = cy + (node.y + wobbleY) * scale;
        screenPositions.set(node.id, { sx, sy, r: node.baseRadius * zoom, node });
      }

      // 2. Draw Constellation Lines between stars in the same cluster or by the same artist
      ctx.lineWidth = 1;
      const posArray = Array.from(screenPositions.values());
      for (let i = 0; i < posArray.length; i++) {
        for (let j = i + 1; j < posArray.length; j++) {
          const a = posArray[i];
          const b = posArray[j];
          const sameCluster = a.node.clusterIndex === b.node.clusterIndex;
          const distHypot = Math.hypot(a.sx - b.sx, a.sy - b.sy);

          if (sameCluster && distHypot < 135 * zoom) {
            const alpha = Math.max(0.05, 0.28 * (1 - distHypot / (135 * zoom)));
            ctx.strokeStyle = `${a.node.color}${Math.round(alpha * 255)
              .toString(16)
              .padStart(2, '0')}`;
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
          }
        }
      }

      // 3. Draw Star Nodes & Labels
      for (const { sx, sy, r, node } of posArray) {
        const isSelected = selectedStar?.id === node.id;
        const isHovered = hoveredStarId === node.id;
        const isPlayingNow = currentTrack?.id === node.id;
        const pulse = 1 + Math.sin(time * 3 + node.phase) * 0.12;
        const drawR = r * (isSelected || isHovered ? 1.45 : pulse);

        // Outer halo
        const halo = ctx.createRadialGradient(sx, sy, drawR * 0.2, sx, sy, drawR * 3.2);
        halo.addColorStop(0, node.color);
        halo.addColorStop(1, 'transparent');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(sx, sy, drawR * 3.2, 0, Math.PI * 2);
        ctx.fill();

        // Core star
        ctx.fillStyle = isSelected || isPlayingNow ? '#ffffff' : node.color;
        ctx.beginPath();
        ctx.arc(sx, sy, drawR, 0, Math.PI * 2);
        ctx.fill();

        // Orbit ring for currently playing or selected star
        if (isSelected || isPlayingNow) {
          ctx.strokeStyle = isPlayingNow ? '#10b981' : '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sx, sy, drawR + 6, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Song title label
        if (isSelected || isHovered || zoom >= 1.15 || node.sourceLabel === 'Liked Core') {
          ctx.font = isSelected || isHovered ? '700 11px Inter, sans-serif' : '500 10px Inter, sans-serif';
          ctx.fillStyle = isSelected || isHovered ? '#ffffff' : 'rgba(255,255,255,0.72)';
          ctx.textAlign = 'center';
          const shortTitle =
            node.track.title.length > 20 ? node.track.title.slice(0, 18) + '…' : node.track.title;
          ctx.fillText(shortTitle, sx, sy + drawR + 14);
        }
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handlePointerMove);
      canvas.removeEventListener('click', handleClick);
    };
  }, [stars, selectedStar, hoveredStarId, activeClusterFilter, zoom, currentTrack?.id]);

  const handleLaunchConstellation = (clusterIdx: number) => {
    const clusterTracks = stars
      .filter((s) => s.clusterIndex === clusterIdx)
      .map((s) => s.track);
    if (clusterTracks.length > 0) {
      unlockAudioEngine();
      playTrack(clusterTracks[0], clusterTracks, 0);
    }
  };

  return (
    <div className="pb-28 pt-2 text-white space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/40 text-[10px] font-extrabold uppercase tracking-widest text-purple-300 mb-2">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
            120FPS INTERACTIVE TASTE CONSTELLATION
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
            Sonic Galaxy • Your Musical Universe
          </h1>
          <p className="text-xs sm:text-sm text-white/60 mt-1">
            Every star is a song from your Liked Core, Recent Orbit, or AI Taste Prediction Engine. Click any star to inspect or launch a Constellation Mix.
          </p>
        </div>

        {/* Cluster Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveClusterFilter(null)}
            className={`px-3.5 py-2 rounded-full text-xs font-extrabold cursor-pointer transition-all ${
              activeClusterFilter === null
                ? 'bg-white text-black shadow-lg'
                : 'bg-white/10 text-white/70 hover:text-white'
            }`}
          >
            🌌 All Nebulae ({stars.length})
          </button>
          {CLUSTERS.map((c, idx) => (
            <button
              key={c.name}
              onClick={() => setActiveClusterFilter(activeClusterFilter === idx ? null : idx)}
              className={`px-3.5 py-2 rounded-full text-xs font-bold cursor-pointer border transition-all flex items-center gap-2 ${
                activeClusterFilter === idx
                  ? 'bg-white/20 border-white text-white shadow-lg'
                  : 'bg-white/[0.05] border-white/10 text-white/70 hover:text-white'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Galaxy Canvas + Star Inspector Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 120fps Interactive Star Map */}
        <div className="lg:col-span-8 relative rounded-3xl overflow-hidden border border-white/20 bg-black/65 shadow-[0_30px_90px_rgba(0,0,0,0.85)] h-[500px] sm:h-[560px]">
          <canvas ref={canvasRef} className="w-full h-full block" />

          {/* Zoom & Legend Overlay */}
          <div className="absolute top-4 left-4 flex flex-wrap items-center gap-2 pointer-events-none">
            <span className="px-2.5 py-1 rounded-full bg-black/70 border border-white/15 text-[10px] font-bold text-white/80">
              ★ Liked Core
            </span>
            <span className="px-2.5 py-1 rounded-full bg-black/70 border border-white/15 text-[10px] font-bold text-white/80">
              ◎ Recent Orbit
            </span>
            <span className="px-2.5 py-1 rounded-full bg-black/70 border border-white/15 text-[10px] font-bold text-purple-300">
              ✦ AI Taste Predicted
            </span>
          </div>

          <div className="absolute bottom-4 right-4 flex items-center gap-2">
            <button
              onClick={() => setZoom((z) => Math.max(0.75, +(z - 0.15).toFixed(2)))}
              className="w-9 h-9 rounded-full liquid-glass flex items-center justify-center text-white font-bold cursor-pointer hover:bg-white/20"
              title="Zoom Out"
            >
              −
            </button>
            <button
              onClick={() => setZoom(1)}
              className="px-3 h-9 rounded-full liquid-glass flex items-center justify-center text-xs font-bold text-white/80 cursor-pointer hover:bg-white/20"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => setZoom((z) => Math.min(1.75, +(z + 0.15).toFixed(2)))}
              className="w-9 h-9 rounded-full liquid-glass flex items-center justify-center text-white font-bold cursor-pointer hover:bg-white/20"
              title="Zoom In"
            >
              +
            </button>
          </div>
        </div>

        {/* Selected Star Inspector & Gravity Mix Launcher */}
        <GlassCard variant="liquid" padding="lg" className="lg:col-span-4 flex flex-col justify-between">
          {selectedStar ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span
                  className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider text-white"
                  style={{ backgroundColor: `${selectedStar.color}44`, border: `1px solid ${selectedStar.color}` }}
                >
                  {selectedStar.clusterName} Nebula
                </span>
                <span className="text-[11px] font-bold text-white/55">
                  {selectedStar.sourceLabel}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <img
                  src={selectedStar.track.thumbnail || DEFAULT_THUMBNAIL}
                  alt={selectedStar.track.title}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                  }}
                  className="w-24 h-24 rounded-2xl object-cover shadow-2xl border border-white/20 flex-shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="text-xl font-extrabold text-white truncate">
                    {selectedStar.track.title}
                  </h3>
                  <p className="text-sm text-white/65 truncate mt-1">
                    {selectedStar.track.artist}
                  </p>
                  {selectedStar.track.album && (
                    <p className="text-xs text-white/45 truncate mt-0.5">
                      {selectedStar.track.album}
                    </p>
                  )}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1.5">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-purple-300">
                  🧠 Taste Prediction Signal
                </div>
                <p className="text-xs text-white/65 leading-relaxed">
                  {selectedStar.sourceLabel === 'Liked Core'
                    ? 'Anchored in your Liked Songs core — acts as a high-gravity seed for your recommendations.'
                    : selectedStar.sourceLabel === 'Recent Orbit'
                      ? 'Part of your active session orbit — shapes your real-time mood constellation.'
                      : `Predicted for you based on your affinity for ${selectedStar.track.artist.split(',')[0]} and ${selectedStar.clusterName} harmonics.`}
                </p>
              </div>

              <div className="space-y-2.5 pt-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    unlockAudioEngine();
                    playTrackWithSmartQueue(selectedStar.track);
                  }}
                  className="w-full py-3 rounded-2xl bg-[var(--color-accent)] text-white font-extrabold text-xs sm:text-sm uppercase tracking-wider cursor-pointer shadow-xl"
                >
                  ▶ Play Star + Smart Taste Queue
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleLaunchConstellation(selectedStar.clusterIndex)}
                  className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-bold text-xs sm:text-sm cursor-pointer"
                >
                  🌌 Play Entire {selectedStar.clusterName} Constellation
                </motion.button>
              </div>
            </div>
          ) : (
            <div className="py-16 text-center text-white/50 text-sm">
              Click any star in the galaxy to inspect and play.
            </div>
          )}

          {/* Constellation Cluster Quick Launchers */}
          <div className="mt-6 pt-5 border-t border-white/10 space-y-2">
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-white/45">
              Quick-Launch Nebula Mixes
            </div>
            <div className="grid grid-cols-2 gap-2">
              {CLUSTERS.map((c, idx) => (
                <button
                  key={c.name}
                  onClick={() => handleLaunchConstellation(idx)}
                  className="p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 text-left cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-white">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="truncate">{c.name}</span>
                  </div>
                  <div className="text-[10px] text-white/45 truncate mt-0.5">{c.subtitle}</div>
                </button>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
