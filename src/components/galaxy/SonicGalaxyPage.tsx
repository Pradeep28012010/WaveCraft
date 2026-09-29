import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { getSmartRecommendations, playTrackWithSmartQueue } from '../../services/recommendationEngine';
import { searchTracks } from '../../services/youtube';
import { unlockAudioEngine, getAudioFrequencyData } from '../player/YouTubeEmbed';
import GlassCard from '../ui/GlassCard';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';
import type { Track } from '../../types';

interface StarNode3D {
  id: string;
  track: Track;
  clusterIndex: number;
  clusterName: string;
  color: string;
  secondaryColor: string;
  // 3D coordinates in [-1, 1]
  x: number;
  y: number;
  z: number;
  baseRadius: number;
  orbitSpeed: number;
  phase: number;
  affinityScore: number; // 84 - 99%
  dna: {
    energy: number;
    bass: number;
    vocal: number;
    euphoria: number;
  };
  sourceLabel: 'Liked Core' | 'Recent Orbit' | 'AI Taste Predicted' | 'Wormhole Discovery';
}

interface ProjectedStar {
  node: StarNode3D;
  sx: number;
  sy: number;
  scale: number;
  depthZ: number;
  drawR: number;
}

interface BackgroundParticle {
  x: number;
  y: number;
  z: number;
  size: number;
  color: string;
  twinklePhase: number;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
}

const CLUSTERS = [
  {
    name: 'Supernova Pulse',
    subtitle: 'High-Energy & Bass Anthems',
    color: '#f43f5e',
    secondary: '#fb7185',
    cx: -0.45,
    cy: -0.22,
    cz: 0.18
  },
  {
    name: 'Andromeda Velvet',
    subtitle: 'Late-Night Melody & Soul',
    color: '#a855f7',
    secondary: '#c084fc',
    cx: 0.46,
    cy: -0.2,
    cz: -0.16
  },
  {
    name: 'Cyber Hyperion',
    subtitle: 'Electronic & Cinema Odyssey',
    color: '#06b6d4',
    secondary: '#22d3ee',
    cx: -0.38,
    cy: 0.28,
    cz: -0.22
  },
  {
    name: 'Solaris Gold',
    subtitle: 'Timeless & Acoustic Euphoria',
    color: '#f59e0b',
    secondary: '#fbbf24',
    cx: 0.42,
    cy: 0.26,
    cz: 0.22
  }
];

const WORMHOLE_PRESETS = [
  { label: '🌌 My Taste Universe', query: '' },
  { label: '🔥 The Weeknd Orbit', query: 'The Weeknd best hits' },
  { label: '⚡ Anirudh Ravichander', query: 'Anirudh Ravichander hits' },
  { label: '💜 Arijit Singh Soul', query: 'Arijit Singh melody hits' },
  { label: '🎹 A.R. Rahman Cosmos', query: 'A.R. Rahman timeless hits' },
  { label: '🚀 Travis & Metro Bass', query: 'Travis Scott Metro Boomin' }
];

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// Cache loaded HTMLImageElements so canvas can draw circular album artwork inside 3D stars at 120fps
const imageCache = new Map<string, HTMLImageElement>();
function getCachedAlbumImage(url?: string): HTMLImageElement | null {
  if (!url) return null;
  const existing = imageCache.get(url);
  if (existing) {
    return existing.complete && existing.naturalWidth > 0 ? existing : null;
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  imageCache.set(url, img);
  return null;
}

export default function SonicGalaxyPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const queue = usePlayerStore((s) => s.queue);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  const likedSongs = useLibraryStore((s) => s.likedSongs);
  const recentlyPlayed = useLibraryStore((s) => s.recentlyPlayed);

  const [predictedTracks, setPredictedTracks] = useState<Track[]>([]);
  const [wormholeTracks, setWormholeTracks] = useState<Track[] | null>(null);
  const [activeWormholeLabel, setActiveWormholeLabel] = useState('🌌 My Taste Universe');
  const [warpQuery, setWarpQuery] = useState('');
  const [isWarping, setIsWarping] = useState(false);

  const [selectedStar, setSelectedStar] = useState<StarNode3D | null>(null);
  const [hoveredStarId, setHoveredStarId] = useState<string | null>(null);
  const [activeClusterFilter, setActiveClusterFilter] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1.05);
  const [autoOrbit, setAutoOrbit] = useState(true);

  // 3D Camera Rotation & Warp Refs for 120fps Canvas Loop
  const cameraRef = useRef({
    yaw: 0.25,
    pitch: 0.18,
    velYaw: 0,
    velPitch: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    pointerMoved: false,
    warpBoost: 0
  });
  const shockwavesRef = useRef<Shockwave[]>([]);

  // Load AI Taste-Predicted stars to enrich the user's personal galaxy
  useEffect(() => {
    let active = true;
    const seed =
      currentTrack ||
      likedSongs[0] ||
      recentlyPlayed[0]?.track ||
      queue[0];

    if (seed) {
      getSmartRecommendations(seed, [], 18)
        .then((recs) => {
          if (active) setPredictedTracks(recs);
        })
        .catch(() => {});
    } else {
      searchTracks('Top Global & Indian Hits 2025')
        .then((res) => {
          if (active) setPredictedTracks(res.slice(0, 20));
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [currentTrack?.id, likedSongs.length]);

  // Trigger a Hyperjump Warp into a custom artist/vibe or preset
  const triggerWormholeWarp = async (query: string, label?: string) => {
    setIsWarping(true);
    cameraRef.current.warpBoost = 1.0;

    if (!query.trim()) {
      setWormholeTracks(null);
      setActiveWormholeLabel('🌌 My Taste Universe');
      setTimeout(() => setIsWarping(false), 650);
      return;
    }

    setActiveWormholeLabel(label || `🚀 ${query}`);
    try {
      const results = await searchTracks(query.trim());
      if (results.length > 0) {
        setWormholeTracks(results.slice(0, 24));
      }
    } finally {
      setTimeout(() => setIsWarping(false), 750);
    }
  };

  // Build 3D StarNodes from either Wormhole discovery or User's Personal Taste Universe
  const stars: StarNode3D[] = useMemo(() => {
    const map = new Map<string, { track: Track; source: StarNode3D['sourceLabel'] }>();

    if (wormholeTracks && wormholeTracks.length > 0) {
      for (const t of wormholeTracks) {
        if (t?.id) map.set(t.id, { track: t, source: 'Wormhole Discovery' });
      }
    } else {
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
    }

    const nodes: StarNode3D[] = [];
    const entries = Array.from(map.values());

    entries.forEach(({ track, source }, idx) => {
      // Pre-warm album art cache
      getCachedAlbumImage(track.thumbnail || track.thumbnailUrl);

      const h = hashString(track.id + track.title + track.artist);
      const clusterIndex = h % CLUSTERS.length;
      const cluster = CLUSTERS[clusterIndex];

      // Golden-angle 3D spiral distribution around each cluster center
      const goldenAngle = idx * 2.39996 + (h % 360) * 0.01745;
      const radiusXY = 0.11 + ((h % 100) / 100) * 0.28;
      const spreadZ = (((h >> 4) % 100) / 100 - 0.5) * 0.52;

      const affinityScore =
        source === 'Liked Core'
          ? 96 + (h % 4)
          : source === 'Recent Orbit'
          ? 91 + (h % 6)
          : 85 + (h % 12);

      nodes.push({
        id: track.id,
        track,
        clusterIndex,
        clusterName: cluster.name,
        color: cluster.color,
        secondaryColor: cluster.secondary,
        x: cluster.cx + Math.cos(goldenAngle) * radiusXY,
        y: cluster.cy + Math.sin(goldenAngle) * radiusXY,
        z: cluster.cz + spreadZ,
        baseRadius:
          source === 'Liked Core'
            ? 15
            : source === 'Recent Orbit'
            ? 13
            : 11.5,
        orbitSpeed: 0.14 + (h % 10) * 0.018,
        phase: (h % 628) / 100,
        affinityScore,
        dna: {
          energy: 65 + (h % 34),
          bass: 60 + ((h >> 3) % 38),
          vocal: 62 + ((h >> 6) % 36),
          euphoria: 68 + ((h >> 9) % 31)
        },
        sourceLabel: source
      });
    });

    return nodes;
  }, [wormholeTracks, likedSongs, recentlyPlayed, predictedTracks, queue]);

  // Keep selectedStar synced with currently playing song or first star
  useEffect(() => {
    if (stars.length === 0) return;
    if (currentTrack) {
      const playingNode = stars.find((s) => s.id === currentTrack.id);
      if (playingNode) {
        setSelectedStar(playingNode);
        return;
      }
    }
    if (!selectedStar || !stars.some((s) => s.id === selectedStar.id)) {
      setSelectedStar(stars[0]);
    }
  }, [stars, currentTrack?.id]);

  // Compute top 4 nearest 3D harmonic neighbors for the selected star
  const harmonicNeighbors = useMemo(() => {
    if (!selectedStar) return [];
    return stars
      .filter((s) => s.id !== selectedStar.id)
      .map((s) => {
        const dist = Math.hypot(
          s.x - selectedStar.x,
          s.y - selectedStar.y,
          s.z - selectedStar.z
        );
        const sameClusterBonus = s.clusterIndex === selectedStar.clusterIndex ? -0.25 : 0;
        const sameArtistBonus =
          s.track.artist.split(',')[0].trim().toLowerCase() ===
          selectedStar.track.artist.split(',')[0].trim().toLowerCase()
            ? -0.35
            : 0;
        return { star: s, score: dist + sameClusterBonus + sameArtistBonus };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 4)
      .map((item) => item.star);
  }, [selectedStar, stars]);

  // 120fps 3D Audio-Reactive Canvas Universe Renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let time = 0;
    let lastNow = performance.now();
    const projectedMap = new Map<string, ProjectedStar>();
    const freqBins = new Uint8Array(64);

    // 140 Deep-Space 3D Starfield Dust Particles
    const bgParticles: BackgroundParticle[] = Array.from({ length: 140 }, (_, i) => {
      const palette = ['#ffffff', '#f43f5e', '#a855f7', '#06b6d4', '#f59e0b'];
      return {
        x: (Math.random() - 0.5) * 2.6,
        y: (Math.random() - 0.5) * 2.0,
        z: Math.random() * 2.0 - 1.0,
        size: 0.7 + Math.random() * 1.8,
        color: palette[i % palette.length],
        twinklePhase: Math.random() * Math.PI * 2
      };
    });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Mouse & Touch 3D Orbit Drag Handlers
    const onPointerDown = (e: PointerEvent) => {
      cameraRef.current.isDragging = true;
      cameraRef.current.pointerMoved = false;
      cameraRef.current.dragStartX = e.clientX;
      cameraRef.current.dragStartY = e.clientY;
      canvas.style.cursor = 'grabbing';
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (cameraRef.current.isDragging) {
        const dx = e.clientX - cameraRef.current.dragStartX;
        const dy = e.clientY - cameraRef.current.dragStartY;
        if (Math.hypot(dx, dy) > 4) {
          cameraRef.current.pointerMoved = true;
        }
        cameraRef.current.yaw += dx * 0.0055;
        cameraRef.current.pitch = Math.max(
          -0.85,
          Math.min(0.85, cameraRef.current.pitch + dy * 0.0045)
        );
        cameraRef.current.velYaw = dx * 0.0008;
        cameraRef.current.velPitch = dy * 0.0006;
        cameraRef.current.dragStartX = e.clientX;
        cameraRef.current.dragStartY = e.clientY;
        return;
      }

      // Hit-test front-to-back
      let found: string | null = null;
      const sorted = Array.from(projectedMap.values()).sort((a, b) => a.depthZ - b.depthZ);
      for (const p of sorted) {
        const dx = mx - p.sx;
        const dy = my - p.sy;
        if (dx * dx + dy * dy <= (p.drawR + 8) * (p.drawR + 8)) {
          found = p.node.id;
          break;
        }
      }
      canvas.style.cursor = found ? 'pointer' : 'grab';
      setHoveredStarId(found);
    };

    const onPointerUp = (e: PointerEvent) => {
      const wasDragging = cameraRef.current.pointerMoved;
      cameraRef.current.isDragging = false;
      canvas.style.cursor = 'grab';

      if (wasDragging) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const sorted = Array.from(projectedMap.values()).sort((a, b) => a.depthZ - b.depthZ);
      for (const p of sorted) {
        const dx = mx - p.sx;
        const dy = my - p.sy;
        if (dx * dx + dy * dy <= (p.drawR + 10) * (p.drawR + 10)) {
          // Spawn a visual supernova shockwave on the clicked star!
          shockwavesRef.current.push({
            x: p.sx,
            y: p.sy,
            radius: p.drawR,
            maxRadius: p.drawR * 5.5,
            color: p.node.color,
            alpha: 0.95
          });

          // If clicking the already-selected star, or double-tapping, immediately play it!
          if (selectedStar?.id === p.node.id) {
            unlockAudioEngine();
            playTrackWithSmartQueue(p.node.track);
          } else {
            setSelectedStar(p.node);
          }
          return;
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      setZoom((z) => Math.max(0.7, Math.min(1.85, +(z + delta).toFixed(2))));
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const project3D = (
      x: number,
      y: number,
      z: number,
      cx: number,
      cy: number,
      baseScale: number
    ) => {
      const { yaw, pitch } = cameraRef.current;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);

      // Rotate around Y axis (yaw)
      const rx = x * cosY - z * sinY;
      const rz1 = x * sinY + z * cosY;

      // Rotate around X axis (pitch)
      const ry = y * cosP - rz1 * sinP;
      const rz = y * sinP + rz1 * cosP;

      const fov = 1.9;
      const perspective = fov / Math.max(0.45, fov + rz);
      return {
        sx: cx + rx * baseScale * perspective,
        sy: cy + ry * baseScale * perspective,
        scale: perspective,
        depthZ: rz
      };
    };

    const render = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;
      time += dt;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const cx = width / 2;
      const cy = height / 2;
      const baseScale = Math.min(width, height) * 0.54 * zoom;

      // Read real-time Web Audio FFT energy for live audio-reactive galaxy pulse!
      let bassEnergy = 0;
      let midEnergy = 0;
      const hasLiveAudio = getAudioFrequencyData(freqBins);
      if (hasLiveAudio) {
        let bSum = 0;
        for (let i = 0; i < 10; i++) bSum += freqBins[i];
        bassEnergy = bSum / (10 * 255);

        let mSum = 0;
        for (let i = 10; i < 32; i++) mSum += freqBins[i];
        midEnergy = mSum / (22 * 255);
      } else if (usePlayerStore.getState().isPlaying) {
        // Smooth synthesized pulse fallback when playing YouTube stream
        bassEnergy = 0.28 + Math.pow(Math.sin(time * 3.8) * 0.5 + 0.5, 2) * 0.35;
        midEnergy = 0.22 + Math.sin(time * 5.2) * 0.15;
      }

      // Smooth camera inertia & auto-orbit
      if (!cameraRef.current.isDragging) {
        if (autoOrbit) {
          cameraRef.current.yaw += dt * (0.11 + bassEnergy * 0.08);
        } else {
          cameraRef.current.yaw += cameraRef.current.velYaw;
          cameraRef.current.pitch = Math.max(
            -0.85,
            Math.min(0.85, cameraRef.current.pitch + cameraRef.current.velPitch)
          );
          cameraRef.current.velYaw *= 0.93;
          cameraRef.current.velPitch *= 0.93;
        }
      }

      if (cameraRef.current.warpBoost > 0.01) {
        cameraRef.current.warpBoost *= 0.91;
      }

      // Deep Cosmic Background Gradient
      const bgGrad = ctx.createRadialGradient(
        cx,
        cy,
        10,
        cx,
        cy,
        Math.max(width, height) * 0.75
      );
      bgGrad.addColorStop(0, '#130924');
      bgGrad.addColorStop(0.5, '#070510');
      bgGrad.addColorStop(1, '#020205');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 1. Draw 3D Concentric Celestial Orbit Rings
      ctx.save();
      [0.32, 0.58, 0.84].forEach((ringR, idx) => {
        ctx.beginPath();
        const segments = 72;
        for (let i = 0; i <= segments; i++) {
          const ang = (i / segments) * Math.PI * 2;
          const px = Math.cos(ang) * ringR;
          const pz = Math.sin(ang) * ringR;
          const proj = project3D(px, 0, pz, cx, cy, baseScale);
          if (i === 0) ctx.moveTo(proj.sx, proj.sy);
          else ctx.lineTo(proj.sx, proj.sy);
        }
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.04 + idx * 0.015 + bassEnergy * 0.04})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      });
      ctx.restore();

      // 2. Draw 3D Deep-Space Starfield & Hyperjump Warp Streaks
      const warp = cameraRef.current.warpBoost;
      for (const pt of bgParticles) {
        const proj = project3D(pt.x, pt.y, pt.z, cx, cy, baseScale * 1.15);
        const twinkle = 0.35 + 0.65 * Math.sin(time * 2.4 + pt.twinklePhase);
        const r = pt.size * proj.scale * (1 + bassEnergy * 0.45);

        if (warp > 0.05) {
          // Draw hyperspace warp streak
          const dirX = proj.sx - cx;
          const dirY = proj.sy - cy;
          ctx.strokeStyle = pt.color;
          ctx.globalAlpha = Math.min(1, twinkle * 0.85);
          ctx.lineWidth = Math.max(1, r);
          ctx.beginPath();
          ctx.moveTo(proj.sx, proj.sy);
          ctx.lineTo(proj.sx + dirX * warp * 0.38, proj.sy + dirY * warp * 0.38);
          ctx.stroke();
        } else {
          ctx.fillStyle = pt.color;
          ctx.globalAlpha = twinkle * 0.65;
          ctx.beginPath();
          ctx.arc(proj.sx, proj.sy, Math.max(0.5, r), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // 3. Draw Volumetric 3D Nebula Clouds & Titles
      CLUSTERS.forEach((cluster, idx) => {
        if (activeClusterFilter !== null && activeClusterFilter !== idx) return;
        const proj = project3D(cluster.cx, cluster.cy, cluster.cz, cx, cy, baseScale);
        const nebulaR = (155 + bassEnergy * 45) * proj.scale * zoom;

        const grad = ctx.createRadialGradient(proj.sx, proj.sy, 4, proj.sx, proj.sy, nebulaR);
        grad.addColorStop(0, `${cluster.color}38`);
        grad.addColorStop(0.45, `${cluster.secondary}16`);
        grad.addColorStop(1, 'transparent');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(proj.sx, proj.sy, nebulaR, 0, Math.PI * 2);
        ctx.fill();

        // Subtle glowing Nebula title badge in 3D space
        ctx.fillStyle = `${cluster.secondary}cc`;
        ctx.font = '800 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          `✦ ${cluster.name.toUpperCase()}`,
          proj.sx,
          proj.sy - nebulaR * 0.58
        );
      });

      // 4. Project all visible 3D StarNodes
      projectedMap.clear();
      const visibleNodes = stars.filter(
        (s) => activeClusterFilter === null || s.clusterIndex === activeClusterFilter
      );

      for (const node of visibleNodes) {
        const orbitAngle = time * node.orbitSpeed + node.phase;
        const ox = node.x + Math.cos(orbitAngle) * 0.022;
        const oy = node.y + Math.sin(orbitAngle * 1.3) * 0.022;
        const oz = node.z + Math.sin(orbitAngle) * 0.022;

        const proj = project3D(ox, oy, oz, cx, cy, baseScale);
        const drawR = node.baseRadius * proj.scale * Math.sqrt(zoom);
        projectedMap.set(node.id, {
          node,
          sx: proj.sx,
          sy: proj.sy,
          scale: proj.scale,
          depthZ: proj.depthZ,
          drawR
        });
      }

      // Sort back-to-front (painter's algorithm) so closer 3D planets render in front of distant ones
      const backToFront = Array.from(projectedMap.values()).sort(
        (a, b) => b.depthZ - a.depthZ
      );

      // 5. Draw Ambient Cluster Constellation Web + Active Harmonic Energy Filaments
      const focusId = hoveredStarId || selectedStar?.id;
      const focusProj = focusId ? projectedMap.get(focusId) : null;

      for (let i = 0; i < backToFront.length; i++) {
        for (let j = i + 1; j < backToFront.length; j++) {
          const a = backToFront[i];
          const b = backToFront[j];
          const dist = Math.hypot(a.sx - b.sx, a.sy - b.sy);

          if (a.node.clusterIndex === b.node.clusterIndex && dist < 130 * zoom) {
            const alpha = Math.max(0.04, 0.22 * (1 - dist / (130 * zoom)));
            ctx.strokeStyle = `${a.node.color}${Math.round(alpha * 255)
              .toString(16)
              .padStart(2, '0')}`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
          }
        }
      }

      // Draw animated Harmonic Filaments from the selected/hovered star to its top neighbors
      if (focusProj) {
        const neighbors = backToFront
          .filter((p) => p.node.id !== focusProj.node.id)
          .map((p) => ({
            p,
            d: Math.hypot(p.sx - focusProj.sx, p.sy - focusProj.sy)
          }))
          .sort((a, b) => a.d - b.d)
          .slice(0, 4);

        ctx.save();
        for (const { p } of neighbors) {
          const grad = ctx.createLinearGradient(focusProj.sx, focusProj.sy, p.sx, p.sy);
          grad.addColorStop(0, focusProj.node.color);
          grad.addColorStop(1, p.node.color);

          ctx.strokeStyle = grad;
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]);
          ctx.lineDashOffset = -time * 38;
          ctx.beginPath();
          ctx.moveTo(focusProj.sx, focusProj.sy);
          ctx.lineTo(p.sx, p.sy);
          ctx.stroke();

          // Midpoint affinity badge
          const mx = (focusProj.sx + p.sx) / 2;
          const my = (focusProj.sy + p.sy) / 2;
          ctx.fillStyle = 'rgba(8, 8, 16, 0.85)';
          ctx.beginPath();
          ctx.roundRect(mx - 22, my - 8, 44, 16, 8);
          ctx.fill();
          ctx.fillStyle = '#e2e8f0';
          ctx.font = '700 9px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${p.node.affinityScore}%`, mx, my + 3);
        }
        ctx.restore();
      }

      // 6. Draw Expanding Supernova Shockwaves
      shockwavesRef.current = shockwavesRef.current.filter((sw) => sw.alpha > 0.02);
      for (const sw of shockwavesRef.current) {
        sw.radius += dt * 210;
        sw.alpha *= 0.92;
        ctx.strokeStyle = sw.color;
        ctx.globalAlpha = sw.alpha;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 7. Draw 3D Planetary Star Nodes with Album Art Cores & Audio-Reactive Coronas
      for (const { sx, sy, scale, depthZ, drawR, node } of backToFront) {
        const isSelected = selectedStar?.id === node.id;
        const isHovered = hoveredStarId === node.id;
        const isPlayingNow = currentTrack?.id === node.id;

        const depthAlpha = Math.max(0.35, Math.min(1, 1.15 - (depthZ + 0.6) * 0.45));
        ctx.save();
        ctx.globalAlpha = depthAlpha;

        const reactiveScale =
          isPlayingNow
            ? 1.38 + bassEnergy * 0.42
            : isSelected || isHovered
            ? 1.32 + midEnergy * 0.15
            : 1 + Math.sin(time * 2.6 + node.phase) * 0.06;

        const r = drawR * reactiveScale;

        // Outer Volumetric Corona Glow
        const corona = ctx.createRadialGradient(sx, sy, r * 0.3, sx, sy, r * 3.1);
        corona.addColorStop(0, isPlayingNow ? '#10b98188' : `${node.color}77`);
        corona.addColorStop(0.5, `${node.secondaryColor}22`);
        corona.addColorStop(1, 'transparent');
        ctx.fillStyle = corona;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 3.1, 0, Math.PI * 2);
        ctx.fill();

        // If this star is currently playing or selected, draw 3D Audio-Reactive Spectrum Rays!
        if (isPlayingNow || isSelected) {
          const rayCount = 24;
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(time * 0.45);
          for (let k = 0; k < rayCount; k++) {
            const ang = (k / rayCount) * Math.PI * 2;
            const binVal = hasLiveAudio
              ? freqBins[(k * 2) % 32] / 255
              : 0.3 + 0.3 * Math.sin(time * 6 + k);
            const innerR = r + 4;
            const outerR = r + 8 + binVal * (isPlayingNow ? 26 : 14) * scale;
            ctx.strokeStyle = isPlayingNow ? '#34d399' : node.secondaryColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(ang) * innerR, Math.sin(ang) * innerR);
            ctx.lineTo(Math.cos(ang) * outerR, Math.sin(ang) * outerR);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Planetary Core: Circular Album Artwork (or Glowing Gradient Orb fallback)
        const albumImg = getCachedAlbumImage(
          node.track.thumbnail || node.track.thumbnailUrl
        );
        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        if (albumImg) {
          ctx.drawImage(albumImg, sx - r, sy - r, r * 2, r * 2);
        } else {
          const orbGrad = ctx.createRadialGradient(
            sx - r * 0.3,
            sy - r * 0.3,
            r * 0.1,
            sx,
            sy,
            r
          );
          orbGrad.addColorStop(0, '#ffffff');
          orbGrad.addColorStop(0.5, node.secondaryColor);
          orbGrad.addColorStop(1, node.color);
          ctx.fillStyle = orbGrad;
          ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
        }
        ctx.restore();

        // Crisp Neon Planetary Rim Ring
        ctx.strokeStyle = isPlayingNow
          ? '#10b981'
          : isSelected || isHovered
          ? '#ffffff'
          : node.secondaryColor;
        ctx.lineWidth = isSelected || isHovered || isPlayingNow ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.stroke();

        // Floating Title Pill below prominent / selected / hovered stars
        if (
          isSelected ||
          isHovered ||
          isPlayingNow ||
          scale > 1.04 ||
          node.sourceLabel === 'Liked Core'
        ) {
          const shortTitle =
            node.track.title.length > 20
              ? node.track.title.slice(0, 18) + '…'
              : node.track.title;

          ctx.font =
            isSelected || isHovered || isPlayingNow
              ? '800 11px Inter, sans-serif'
              : '600 10px Inter, sans-serif';
          const textWidth = ctx.measureText(shortTitle).width;
          const pillW = textWidth + 14;
          const pillH = 18;
          const pillX = sx - pillW / 2;
          const pillY = sy + r + 7;

          ctx.fillStyle =
            isSelected || isPlayingNow
              ? 'rgba(15, 23, 42, 0.92)'
              : 'rgba(10, 10, 20, 0.72)';
          ctx.beginPath();
          ctx.roundRect(pillX, pillY, pillW, pillH, 9);
          ctx.fill();

          if (isSelected || isPlayingNow) {
            ctx.strokeStyle = isPlayingNow ? '#10b981' : node.color;
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          ctx.fillStyle =
            isSelected || isHovered || isPlayingNow
              ? '#ffffff'
              : 'rgba(255,255,255,0.85)';
          ctx.textAlign = 'center';
          ctx.fillText(shortTitle, sx, pillY + 12.5);
        }

        ctx.restore();
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [stars, selectedStar, hoveredStarId, activeClusterFilter, zoom, autoOrbit, currentTrack?.id]);

  const handleLaunchConstellation = (clusterIdx: number) => {
    const clusterTracks = stars
      .filter((s) => s.clusterIndex === clusterIdx)
      .map((s) => s.track);
    if (clusterTracks.length > 0) {
      unlockAudioEngine();
      playTrack(clusterTracks[0], clusterTracks, 0);
    }
  };

  const handleSupernovaShuffle = () => {
    if (stars.length === 0) return;
    const randomStar = stars[Math.floor(Math.random() * stars.length)];
    setSelectedStar(randomStar);
    cameraRef.current.warpBoost = 0.75;
    unlockAudioEngine();
    playTrackWithSmartQueue(randomStar.track);
  };

  return (
    <div className="pb-28 pt-2 text-white space-y-6 select-none">
      {/* Top Hero Header + Wormhole Spawner Bar */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-5">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/40 text-[10px] font-extrabold uppercase tracking-widest text-purple-300 mb-2">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
            3D AUDIO-REACTIVE SONIC OBSERVATORY
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight bg-gradient-to-r from-white via-purple-200 to-cyan-300 bg-clip-text text-transparent">
            Sonic Galaxy • 3D Musical Cosmos
          </h1>
          <p className="text-xs sm:text-sm text-white/60 mt-1 max-w-2xl">
            Drag to rotate in 3D space, inspect harmonic filaments, or warp into any artist’s solar system. Click any planet to inspect — click again to launch playback.
          </p>
        </div>

        {/* Wormhole Hyperjump Search Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (warpQuery.trim()) {
              triggerWormholeWarp(warpQuery.trim());
            }
          }}
          className="flex items-center gap-2 w-full xl:w-auto"
        >
          <input
            type="text"
            value={warpQuery}
            onChange={(e) => setWarpQuery(e.target.value)}
            placeholder="Warp to any artist, mood, or era..."
            className="flex-1 xl:w-72 h-11 px-4 rounded-2xl bg-white/[0.06] border border-white/15 text-xs text-white placeholder-white/40 focus:outline-none focus:border-purple-400"
          />
          <button
            type="submit"
            disabled={isWarping}
            className="px-5 h-11 rounded-2xl bg-gradient-to-r from-purple-500 via-fuchsia-500 to-rose-500 text-white font-extrabold text-xs uppercase tracking-wider shadow-lg hover:brightness-110 transition-all cursor-pointer flex-shrink-0"
          >
            {isWarping ? 'Warping...' : '🚀 Hyperjump'}
          </button>
        </form>
      </div>

      {/* Wormhole Presets & Nebula Filter Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 max-w-full">
          {WORMHOLE_PRESETS.map((preset) => {
            const isActive = activeWormholeLabel === preset.label;
            return (
              <button
                key={preset.label}
                onClick={() => triggerWormholeWarp(preset.query, preset.label)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer border ${
                  isActive
                    ? 'bg-gradient-to-r from-purple-500/30 to-cyan-500/30 border-purple-400 text-white shadow-lg'
                    : 'bg-white/[0.04] border-white/10 text-white/65 hover:text-white hover:bg-white/[0.08]'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Cluster Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveClusterFilter(null)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold cursor-pointer transition-all ${
              activeClusterFilter === null
                ? 'bg-white text-black shadow'
                : 'bg-white/10 text-white/70 hover:text-white'
            }`}
          >
            All ({stars.length})
          </button>
          {CLUSTERS.map((c, idx) => (
            <button
              key={c.name}
              onClick={() => setActiveClusterFilter(activeClusterFilter === idx ? null : idx)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold cursor-pointer border transition-all flex items-center gap-1.5 ${
                activeClusterFilter === idx
                  ? 'bg-white/20 border-white text-white shadow'
                  : 'bg-white/[0.04] border-white/10 text-white/65 hover:text-white'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main 12-Column Observatory Grid: 3D Interactive Viewport (8 cols) + Telemetry Inspector (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: 120fps 3D Interactive Star Map */}
        <div className="lg:col-span-8 relative rounded-3xl overflow-hidden border border-white/20 bg-[#05030a] shadow-[0_30px_100px_rgba(0,0,0,0.9)] h-[520px] sm:h-[620px]">
          <canvas ref={canvasRef} className="w-full h-full block touch-none" />

          {/* Top-Left VisionOS Telemetry & Camera Controls */}
          <div className="absolute top-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
              <button
                onClick={() => setAutoOrbit((v) => !v)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold border backdrop-blur-xl cursor-pointer transition-all ${
                  autoOrbit
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                    : 'bg-black/70 border-white/15 text-white/70 hover:text-white'
                }`}
              >
                {autoOrbit ? '🔄 3D Auto-Orbit: ON' : '✋ Manual 3D Orbit'}
              </button>
              <button
                onClick={() => {
                  cameraRef.current.yaw = 0.25;
                  cameraRef.current.pitch = 0.18;
                  cameraRef.current.velYaw = 0;
                  cameraRef.current.velPitch = 0;
                  setZoom(1.05);
                }}
                className="px-3 py-1.5 rounded-full bg-black/70 hover:bg-white/15 border border-white/15 text-[11px] font-bold text-white/80 backdrop-blur-xl cursor-pointer"
              >
                🎯 Reset Camera
              </button>
              <button
                onClick={handleSupernovaShuffle}
                className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-[var(--color-accent)] to-purple-600 text-[11px] font-extrabold text-white shadow-lg cursor-pointer hover:brightness-110"
              >
                ✨ Supernova Shuffle
              </button>
            </div>

            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-black/70 border border-white/15 text-[10px] font-bold text-white/75 backdrop-blur-xl">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>DRAG TO ROTATE 3D • SCROLL TO ZOOM</span>
            </div>
          </div>

          {/* Bottom-Left Floating Now Playing / Selected Quick-Play Pill */}
          {selectedStar && (
            <div className="absolute bottom-4 left-4 right-28 sm:right-auto sm:max-w-sm pointer-events-auto">
              <div className="p-2.5 rounded-2xl bg-black/80 backdrop-blur-2xl border border-white/20 shadow-2xl flex items-center gap-3">
                <img
                  src={selectedStar.track.thumbnail || DEFAULT_THUMBNAIL}
                  alt={selectedStar.track.title}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                  }}
                  className={`w-11 h-11 rounded-xl object-cover flex-shrink-0 border border-white/20 ${
                    currentTrack?.id === selectedStar.id && isPlaying
                      ? 'animate-[spin_6s_linear_infinite]'
                      : ''
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: selectedStar.color }}
                    />
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/60 truncate">
                      {selectedStar.clusterName} • {selectedStar.affinityScore}% Match
                    </span>
                  </div>
                  <p className="text-xs font-extrabold text-white truncate">
                    {selectedStar.track.title}
                  </p>
                  <p className="text-[11px] text-white/60 truncate">
                    {selectedStar.track.artist}
                  </p>
                </div>
                <button
                  onClick={() => {
                    unlockAudioEngine();
                    if (currentTrack?.id === selectedStar.id) {
                      togglePlay();
                    } else {
                      playTrackWithSmartQueue(selectedStar.track);
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[var(--color-accent)] text-white font-extrabold text-xs cursor-pointer shadow-lg flex-shrink-0 hover:brightness-110"
                >
                  {currentTrack?.id === selectedStar.id && isPlaying ? '⏸ Pause' : '▶ Play'}
                </button>
              </div>
            </div>
          )}

          {/* Bottom-Right Zoom Controls */}
          <div className="absolute bottom-4 right-4 flex items-center gap-1.5">
            <button
              onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.15).toFixed(2)))}
              className="w-9 h-9 rounded-full bg-black/75 border border-white/20 flex items-center justify-center text-white font-bold cursor-pointer hover:bg-white/20 backdrop-blur-xl"
              title="Zoom Out"
            >
              −
            </button>
            <button
              onClick={() => setZoom(1.05)}
              className="px-3 h-9 rounded-full bg-black/75 border border-white/20 flex items-center justify-center text-xs font-bold text-white/85 cursor-pointer hover:bg-white/20 backdrop-blur-xl"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => setZoom((z) => Math.min(1.85, +(z + 0.15).toFixed(2)))}
              className="w-9 h-9 rounded-full bg-black/75 border border-white/20 flex items-center justify-center text-white font-bold cursor-pointer hover:bg-white/20 backdrop-blur-xl"
              title="Zoom In"
            >
              +
            </button>
          </div>
        </div>

        {/* Right: Planetary Telemetry Inspector & Harmonic Sequencer (4 cols) */}
        <GlassCard
          variant="liquid"
          padding="lg"
          className="lg:col-span-4 flex flex-col justify-between border border-white/20"
        >
          <AnimatePresence mode="wait">
            {selectedStar ? (
              <motion.div
                key={selectedStar.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                {/* Top Status Badges */}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider text-white shadow"
                    style={{
                      backgroundColor: `${selectedStar.color}38`,
                      border: `1px solid ${selectedStar.color}`
                    }}
                  >
                    ✦ {selectedStar.clusterName}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-[10px] font-extrabold text-emerald-300">
                    {selectedStar.affinityScore}% Taste Match
                  </span>
                </div>

                {/* Planetary Artwork & Track Identity */}
                <div className="flex items-center gap-4">
                  <div className="relative w-24 h-24 flex-shrink-0">
                    <div
                      className="absolute -inset-1.5 rounded-2xl blur-md opacity-70"
                      style={{ backgroundColor: selectedStar.color }}
                    />
                    <img
                      src={selectedStar.track.thumbnail || DEFAULT_THUMBNAIL}
                      alt={selectedStar.track.title}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                      }}
                      className="relative w-24 h-24 rounded-2xl object-cover shadow-2xl border border-white/25"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-white/45 mb-0.5">
                      {selectedStar.sourceLabel}
                    </div>
                    <h3 className="text-xl font-black text-white truncate">
                      {selectedStar.track.title}
                    </h3>
                    <p className="text-sm font-semibold text-white/70 truncate mt-0.5">
                      {selectedStar.track.artist}
                    </p>
                    {selectedStar.track.album && (
                      <p className="text-xs text-white/45 truncate mt-0.5">
                        {selectedStar.track.album}
                      </p>
                    )}
                  </div>
                </div>

                {/* Sonic DNA Harmonic Profile Bars */}
                <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-white/60">
                    <span>🧬 Planetary Sonic DNA</span>
                    <span className="text-cyan-300">320kbps HD</span>
                  </div>
                  {[
                    { label: 'Energy Velocity', val: selectedStar.dna.energy, color: '#f43f5e' },
                    { label: 'Sub-Bass Gravity', val: selectedStar.dna.bass, color: '#a855f7' },
                    { label: 'Vocal Presence', val: selectedStar.dna.vocal, color: '#06b6d4' },
                    { label: 'Cosmic Euphoria', val: selectedStar.dna.euphoria, color: '#f59e0b' }
                  ].map((metric) => (
                    <div key={metric.label} className="space-y-1">
                      <div className="flex justify-between text-[11px] font-bold">
                        <span className="text-white/70">{metric.label}</span>
                        <span className="text-white tabular-nums">{metric.val}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${metric.val}%` }}
                          transition={{ duration: 0.45, ease: 'easeOut' }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: metric.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-1 gap-2.5">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      unlockAudioEngine();
                      playTrackWithSmartQueue(selectedStar.track);
                    }}
                    className="w-full py-3 rounded-2xl bg-gradient-to-r from-[var(--color-accent)] via-rose-500 to-purple-600 text-white font-extrabold text-xs uppercase tracking-wider cursor-pointer shadow-xl"
                  >
                    ▶ Play Star + Smart Gravity Queue
                  </motion.button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleLaunchConstellation(selectedStar.clusterIndex)}
                      className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-bold text-xs cursor-pointer truncate"
                    >
                      🌌 Play Nebula
                    </button>
                    <button
                      onClick={() =>
                        triggerWormholeWarp(
                          selectedStar.track.artist.split(',')[0].trim(),
                          `🪐 ${selectedStar.track.artist.split(',')[0].trim()}`
                        )
                      }
                      className="py-2.5 px-3 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/35 text-purple-200 font-bold text-xs cursor-pointer truncate"
                    >
                      🚀 Warp to Artist
                    </button>
                  </div>
                </div>

                {/* Nearest Harmonic Neighbors (Click to Hop Star-to-Star) */}
                {harmonicNeighbors.length > 0 && (
                  <div className="pt-3 border-t border-white/10 space-y-2">
                    <div className="text-[10px] font-extrabold uppercase tracking-widest text-white/50">
                      🔗 Connected Harmonic Neighbors
                    </div>
                    <div className="space-y-1.5">
                      {harmonicNeighbors.map((neighbor) => (
                        <div
                          key={neighbor.id}
                          onClick={() => setSelectedStar(neighbor)}
                          className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 flex items-center justify-between gap-2.5 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={neighbor.track.thumbnail || DEFAULT_THUMBNAIL}
                              alt={neighbor.track.title}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                              }}
                              className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white truncate">
                                {neighbor.track.title}
                              </p>
                              <p className="text-[10px] text-white/50 truncate">
                                {neighbor.track.artist}
                              </p>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-extrabold text-emerald-300 flex-shrink-0">
                            {neighbor.affinityScore}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="py-16 text-center text-white/50 text-sm">
                Tap any planet in the 3D galaxy to inspect its Sonic DNA and play.
              </div>
            )}
          </AnimatePresence>
        </GlassCard>
      </div>
    </div>
  );
}
