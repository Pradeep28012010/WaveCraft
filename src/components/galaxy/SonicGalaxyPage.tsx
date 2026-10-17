import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { playTrackWithSmartQueue } from '../../services/recommendationEngine';
import { searchTracks } from '../../services/youtube';
import { unlockAudioEngine, getAudioFrequencyData } from '../player/YouTubeEmbed';
import GlassCard from '../ui/GlassCard';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import type { Track } from '../../types';

interface SonicDNA {
  energy: number;
  bass: number;
  vocal: number;
  euphoria: number;
}

interface TasteMatchBreakdown {
  sonicSimilarityPct: number;
  artistAffinityPct: number;
  vibeSynergyPct: number;
  artistPlayCount: number;
  isLiked: boolean;
  isRecent: boolean;
  reason: string;
}

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
  affinityScore: number; // 55 - 99%
  dna: SonicDNA;
  matchBreakdown: TasteMatchBreakdown;
  sourceLabel: 'Liked Core' | 'Recent Orbit' | 'AI Taste Predicted' | 'Wormhole Discovery';
  hasPlanetaryRing: boolean;
  parsecDistance: number; // Astronomical distance metric (1.2 to 28.5 pc)
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
  speedZ: number;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
}

interface PolarJetParticle {
  y: number;
  xOffset: number;
  zOffset: number;
  speed: number;
  size: number;
  alpha: number;
  color: string;
}

const CLUSTERS = [
  {
    name: 'Supernova Pulse',
    shortName: 'Supernova',
    subtitle: 'High-Energy & Bass Anthems',
    color: '#f43f5e',
    secondary: '#fb7185',
    accentRgb: '244, 63, 94',
    cx: -0.46,
    cy: -0.22,
    cz: 0.16,
    centroidDna: { energy: 88, bass: 86, vocal: 68, euphoria: 82 }
  },
  {
    name: 'Andromeda Velvet',
    shortName: 'Andromeda',
    subtitle: 'Late-Night Melody & Soul',
    color: '#a855f7',
    secondary: '#c084fc',
    accentRgb: '168, 85, 247',
    cx: 0.46,
    cy: -0.20,
    cz: -0.16,
    centroidDna: { energy: 58, bass: 64, vocal: 90, euphoria: 78 }
  },
  {
    name: 'Cyber Hyperion',
    shortName: 'Hyperion',
    subtitle: 'Electronic & Cinema Odyssey',
    color: '#06b6d4',
    secondary: '#22d3ee',
    accentRgb: '6, 182, 212',
    cx: -0.42,
    cy: 0.24,
    cz: -0.2,
    centroidDna: { energy: 84, bass: 82, vocal: 62, euphoria: 91 }
  },
  {
    name: 'Solaris Gold',
    shortName: 'Solaris',
    subtitle: 'Timeless & Acoustic Euphoria',
    color: '#f59e0b',
    secondary: '#fbbf24',
    accentRgb: '245, 158, 11',
    cx: 0.44,
    cy: 0.24,
    cz: 0.2,
    centroidDna: { energy: 64, bass: 56, vocal: 88, euphoria: 86 }
  }
];

const WORMHOLE_PRESETS = [
  { label: '🌌 My Taste Universe', query: '' },
  { label: '🔥 The Weeknd', query: 'The Weeknd best hits' },
  { label: '⚡ Anirudh', query: 'Anirudh Ravichander hits' },
  { label: '💜 Arijit Singh', query: 'Arijit Singh melody hits' },
  { label: '🎹 A.R. Rahman', query: 'A.R. Rahman timeless hits' },
  { label: '🚀 Travis & Metro', query: 'Travis Scott Metro Boomin' }
];

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val)));
}

/**
 * 100% Deterministic 4-Channel Sonic DNA & Cluster Classifier
 */
function analyzeTrackSonicDNA(track: Track): { dna: SonicDNA; clusterIndex: number } {
  const text = `${track.title || ''} ${track.artist || ''} ${track.album || ''} ${track.genre || ''}`.toLowerCase();
  const h = hashString(`${track.id}:${track.title}:${track.artist}`);
  const dur = track.duration || 210;

  let energy = 68 + ((h % 19) - 9);
  let bass = 66 + (((h >> 4) % 19) - 9);
  let vocal = 72 + (((h >> 8) % 17) - 8);
  let euphoria = 70 + (((h >> 12) % 19) - 9);

  if (
    /\b(bass|trap|phonk|hype|party|club|dance|beat|remix|workout|power|kuthu|mass|badass|beast|fire|sicko|fein|starboy|blinding)\b/i.test(
      text
    )
  ) {
    energy += 18;
    bass += 20;
    euphoria += 8;
  }

  if (
    /\b(synth|cyber|electronic|edm|techno|house|trance|future|neon|walker|daft|kavinsky|hans|ost|score|theme|horizon|cosmos)\b/i.test(
      text
    )
  ) {
    energy += 12;
    bass += 12;
    euphoria += 18;
    vocal -= 8;
  }

  if (
    /\b(love|soul|melody|romantic|heart|velvet|night|midnight|lofi|lo-fi|slowed|reverb|chill|arijit|shreya|sid|weeknd|lana|kesariya|tum)\b/i.test(
      text
    )
  ) {
    vocal += 16;
    euphoria += 10;
    energy -= 10;
    bass += 4;
  }

  if (
    /\b(acoustic|unplugged|live|piano|guitar|strings|classic|timeless|gold|rahman|ilaiyaraaja|indie|folk|ballad|sun|moon)\b/i.test(
      text
    )
  ) {
    vocal += 15;
    euphoria += 14;
    bass -= 10;
  }

  if (dur > 0 && dur < 175) {
    energy += 7;
    bass += 5;
  } else if (dur > 265) {
    euphoria += 8;
    vocal += 5;
  }

  const dna: SonicDNA = {
    energy: clamp(energy, 42, 99),
    bass: clamp(bass, 40, 99),
    vocal: clamp(vocal, 45, 99),
    euphoria: clamp(euphoria, 48, 99)
  };

  let bestCluster = 0;
  let bestDist = Infinity;
  CLUSTERS.forEach((c, idx) => {
    const d = Math.hypot(
      dna.energy - c.centroidDna.energy,
      dna.bass - c.centroidDna.bass,
      dna.vocal - c.centroidDna.vocal,
      dna.euphoria - c.centroidDna.euphoria
    );
    if (d < bestDist) {
      bestDist = d;
      bestCluster = idx;
    }
  });

  return { dna, clusterIndex: bestCluster };
}

function computeDnaCosineSimilarity(a: SonicDNA, b: SonicDNA): number {
  const dot =
    a.energy * b.energy +
    a.bass * b.bass +
    a.vocal * b.vocal +
    a.euphoria * b.euphoria;
  const magA = Math.hypot(a.energy, a.bass, a.vocal, a.euphoria);
  const magB = Math.hypot(b.energy, b.bass, b.vocal, b.euphoria);
  if (magA === 0 || magB === 0) return 85;
  const cos = dot / (magA * magB);
  const normalized = Math.max(0, Math.min(1, (cos - 0.88) / 0.12));
  return clamp(65 + normalized * 34, 60, 99);
}

// Memory-bounded image cache for high-FPS circular album art textures
const imageCache = new Map<string, HTMLImageElement>();
const MAX_IMAGE_CACHE_ENTRIES = 140;

function getCachedAlbumImage(url?: string): HTMLImageElement | null {
  if (!url) return null;
  const existing = imageCache.get(url);
  if (existing) {
    return existing.complete && existing.naturalWidth > 0 ? existing : null;
  }
  if (imageCache.size >= MAX_IMAGE_CACHE_ENTRIES) {
    const oldestKey = imageCache.keys().next().value;
    if (oldestKey) imageCache.delete(oldestKey);
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  imageCache.set(url, img);
  return null;
}

/**
 * Interactive 4D Sonic Spider/Radar SVG Chart
 * Compares track DNA polygon against user library centroid
 */
function SonicSpiderRadar({
  trackDna,
  userDna,
  clusterColor
}: {
  trackDna: SonicDNA;
  userDna: SonicDNA;
  clusterColor: string;
}) {
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 64;

  // 4 Axes: Top=Energy, Right=Bass, Bottom=Vocal, Left=Euphoria
  const getCoords = (metric: number, axisIdx: number) => {
    const angle = (axisIdx * Math.PI) / 2 - Math.PI / 2;
    const r = (metric / 100) * maxR;
    return {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r
    };
  };

  const trackPts = [
    getCoords(trackDna.energy, 0),
    getCoords(trackDna.bass, 1),
    getCoords(trackDna.vocal, 2),
    getCoords(trackDna.euphoria, 3)
  ];

  const userPts = [
    getCoords(userDna.energy, 0),
    getCoords(userDna.bass, 1),
    getCoords(userDna.vocal, 2),
    getCoords(userDna.euphoria, 3)
  ];

  const toPath = (pts: { x: number; y: number }[]) =>
    `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y} L ${pts[2].x} ${pts[2].y} L ${pts[3].x} ${pts[3].y} Z`;

  return (
    <div className="relative flex flex-col items-center justify-center p-2 rounded-2xl bg-black/40 border-0">
      <svg width={size} height={size} className="overflow-visible">
        {/* Background Concentric Radar Grids */}
        {[0.25, 0.5, 0.75, 1.0].map((frac, idx) => {
          const r = frac * maxR;
          return (
            <polygon
              key={idx}
              points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
              fill="none"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth={idx === 3 ? 1.4 : 0.8}
              strokeDasharray={idx < 3 ? '3 3' : undefined}
            />
          );
        })}

        {/* Crosshair Axes */}
        <line x1={cx} y1={cy - maxR} x2={cx} y2={cy + maxR} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        <line x1={cx - maxR} y1={cy} x2={cx + maxR} y2={cy} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />

        {/* User Taste Polygon (Dashed White/Emerald) */}
        <path
          d={toPath(userPts)}
          fill="rgba(16, 185, 129, 0.12)"
          stroke="#10b981"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />

        {/* Track DNA Polygon (Solid Vibrant Glow) */}
        <path
          d={toPath(trackPts)}
          fill={`${clusterColor}33`}
          stroke={clusterColor}
          strokeWidth="2.2"
          className="transition-all duration-300"
        />

        {/* Track Vertices */}
        {trackPts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3.5"
            fill={clusterColor}
            stroke="#ffffff"
            strokeWidth="1.5"
            className="shadow-lg"
          />
        ))}

        {/* Axis Labels */}
        <text x={cx} y={cy - maxR - 8} fill="#f43f5e" fontSize="9" fontWeight="800" textAnchor="middle">
          ⚡ ENERGY ({trackDna.energy}%)
        </text>
        <text x={cx + maxR + 8} y={cy + 3} fill="#a855f7" fontSize="9" fontWeight="800" textAnchor="start">
          🔊 BASS ({trackDna.bass}%)
        </text>
        <text x={cx} y={cy + maxR + 14} fill="#06b6d4" fontSize="9" fontWeight="800" textAnchor="middle">
          🎤 VOCAL ({trackDna.vocal}%)
        </text>
        <text x={cx - maxR - 8} y={cy + 3} fill="#f59e0b" fontSize="9" fontWeight="800" textAnchor="end">
          ✨ EUPHORIA ({trackDna.euphoria}%)
        </text>
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-[10px] font-bold">
        <span className="flex items-center gap-1.5 text-white/90">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: clusterColor }} />
          Track DNA
        </span>
        <span className="flex items-center gap-1.5 text-emerald-300">
          <span className="w-2.5 h-1 border-0" />
          Your Taste Centroid
        </span>
      </div>
    </div>
  );
}

export default function SonicGalaxyPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const addNext = usePlayerStore((s) => s.addNext);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  const likedSongs = useLibraryStore((s) => s.likedSongs);
  const recentlyPlayed = useLibraryStore((s) => s.recentlyPlayed);
  const playHistory = useLibraryStore((s) => s.playHistory);
  const playlists = useLibraryStore((s) => s.playlists);

  const [predictedTracks, setPredictedTracks] = useState<Track[]>([]);
  const [wormholeTracks, setWormholeTracks] = useState<Track[] | null>(null);
  const [activeWormholeLabel, setActiveWormholeLabel] = useState('🌌 My Taste Universe');
  const [warpQuery, setWarpQuery] = useState('');
  const [isWarping, setIsWarping] = useState(false);

  const [selectedStar, setSelectedStar] = useState<StarNode3D | null>(null);
  const [hoveredStarId, setHoveredStarId] = useState<string | null>(null);
  const [activeClusterFilter, setActiveClusterFilter] = useState<number | null>(null);
  const [galaxyLayout, setGalaxyLayout] = useState<'quadrants' | 'rings' | 'spiral'>('quadrants');
  const [inspectorTab, setInspectorTab] = useState<'dna' | 'neighbors' | 'roster'>('dna');
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterSort, setRosterSort] = useState<'match' | 'title' | 'artist'>('match');
  const [zoom, setZoom] = useState(1.05);
  const [autoOrbit, setAutoOrbit] = useState(true);
  const [isCinematicTour, setIsCinematicTour] = useState(false);
  const [showCoordinateGrid, setShowCoordinateGrid] = useState(true);

  // 3D Camera Rotation, Pinch-to-Zoom & Warp Refs
  const cameraRef = useRef({
    yaw: 0.25,
    pitch: 0.22,
    targetYaw: 0.25,
    targetPitch: 0.22,
    velYaw: 0,
    velPitch: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    pointerMoved: false,
    warpBoost: 0,
    initialPinchDist: 0,
    initialPinchZoom: 1.05
  });
  const shockwavesRef = useRef<Shockwave[]>([]);
  const polarJetsRef = useRef<PolarJetParticle[]>([]);

  // Load preview stars only when the user has zero liked songs
  useEffect(() => {
    if (likedSongs.length > 0) return;
    let active = true;
    searchTracks('Top Global Pop Hits 2025')
      .then((res) => {
        if (active) setPredictedTracks(res.slice(0, 12));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [likedSongs.length]);

  // Trigger a Hyperjump Warp into an artist/vibe or return to universe
  const triggerWormholeWarp = async (query: string, label?: string) => {
    triggerAndroidHaptic('medium');
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
        setWormholeTracks(results.slice(0, 28));
      }
    } finally {
      setTimeout(() => setIsWarping(false), 750);
    }
  };

  // Build Real User Taste Profile (Artist Affinity Map + Centroid 4D DNA)
  const userTasteProfile = useMemo(() => {
    const artistCounts = new Map<string, number>();
    const likedIds = new Set<string>();
    const recentIds = new Set<string>();
    const dnaSamples: SonicDNA[] = [];

    const addArtistSignal = (artistStr: string | undefined, weight: number) => {
      if (!artistStr) return;
      artistStr
        .split(/,|&|\bfeat\.?\b|\bft\.?\b/i)
        .map((a) => a.trim().toLowerCase())
        .filter((a) => a.length > 1)
        .forEach((a) => {
          artistCounts.set(a, (artistCounts.get(a) || 0) + weight);
        });
    };

    for (const t of likedSongs) {
      if (!t?.id) continue;
      likedIds.add(t.id);
      addArtistSignal(t.artist, 3);
      dnaSamples.push(analyzeTrackSonicDNA(t).dna);
    }

    for (const r of recentlyPlayed) {
      const t = r?.track;
      if (!t?.id) continue;
      recentIds.add(t.id);
      addArtistSignal(t.artist, 2);
      dnaSamples.push(analyzeTrackSonicDNA(t).dna);
    }

    for (const p of playHistory) {
      if (p?.artist) addArtistSignal(p.artist, 1);
    }

    for (const pl of playlists) {
      for (const t of pl.tracks || []) {
        if (t?.artist) addArtistSignal(t.artist, 1);
      }
    }

    if (currentTrack) {
      addArtistSignal(currentTrack.artist, 3);
      dnaSamples.push(analyzeTrackSonicDNA(currentTrack).dna);
    }

    const userDna: SonicDNA =
      dnaSamples.length > 0
        ? {
            energy: Math.round(dnaSamples.reduce((s, d) => s + d.energy, 0) / dnaSamples.length),
            bass: Math.round(dnaSamples.reduce((s, d) => s + d.bass, 0) / dnaSamples.length),
            vocal: Math.round(dnaSamples.reduce((s, d) => s + d.vocal, 0) / dnaSamples.length),
            euphoria: Math.round(dnaSamples.reduce((s, d) => s + d.euphoria, 0) / dnaSamples.length)
          }
        : { energy: 76, bass: 74, vocal: 78, euphoria: 80 };

    return { artistCounts, likedIds, recentIds, userDna, hasHistory: dnaSamples.length > 0 };
  }, [likedSongs, recentlyPlayed, playHistory, playlists, currentTrack?.id]);

  // Build 3D StarNodes based on chosen formation: Quadrants, Radar Rings, or Spiral Galaxy
  const stars: StarNode3D[] = useMemo(() => {
    const map = new Map<string, { track: Track; source: StarNode3D['sourceLabel'] }>();

    if (wormholeTracks && wormholeTracks.length > 0) {
      for (const t of wormholeTracks) {
        if (t?.id) map.set(t.id, { track: t, source: 'Wormhole Discovery' });
      }
    } else if (likedSongs.length > 0) {
      for (const t of likedSongs) {
        if (t?.id) map.set(t.id, { track: t, source: 'Liked Core' });
      }
    } else {
      for (const p of predictedTracks.slice(0, 12)) {
        if (p?.id && !map.has(p.id)) {
          map.set(p.id, { track: p, source: 'AI Taste Predicted' });
        }
      }
    }

    const entries = Array.from(map.values());
    const clusterBuckets: number[] = [0, 0, 0, 0];

    const rawNodes = entries.map(({ track, source }, idx) => {
      getCachedAlbumImage(track.thumbnail || track.thumbnailUrl);

      const { dna, clusterIndex } = analyzeTrackSonicDNA(track);
      const cluster = CLUSTERS[clusterIndex];
      const rankInCluster = clusterBuckets[clusterIndex]++;

      const sonicSimilarityPct = computeDnaCosineSimilarity(dna, userTasteProfile.userDna);

      const trackArtists = (track.artist || '')
        .split(/,|&|\bfeat\.?\b|\bft\.?\b/i)
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean);

      let artistPlayCount = 0;
      for (const a of trackArtists) {
        artistPlayCount += userTasteProfile.artistCounts.get(a) || 0;
      }

      const isLiked = userTasteProfile.likedIds.has(track.id);
      const isRecent = userTasteProfile.recentIds.has(track.id);

      const artistAffinityPct =
        artistPlayCount > 0
          ? clamp(72 + Math.min(27, artistPlayCount * 6), 72, 99)
          : clamp(sonicSimilarityPct - 8, 55, 84);

      const vibeSynergyPct = computeDnaCosineSimilarity(dna, cluster.centroidDna);

      let affinityScore = Math.round(
        sonicSimilarityPct * 0.48 +
          artistAffinityPct * 0.32 +
          vibeSynergyPct * 0.2 +
          (isLiked ? 7 : isRecent ? 4 : 0)
      );
      affinityScore = clamp(affinityScore, 58, 99);

      let reason = '';
      if (isLiked) {
        reason = `Saved in Liked Songs • ${sonicSimilarityPct}% 4D Cosine DNA resonance`;
      } else if (isRecent) {
        reason = `In Recent Rotation • ${sonicSimilarityPct}% Sonic DNA alignment`;
      } else if (artistPlayCount >= 2) {
        reason = `Artist appears ${artistPlayCount}× in library • ${sonicSimilarityPct}% DNA match`;
      } else if (artistPlayCount === 1) {
        reason = `Familiar artist • ${vibeSynergyPct}% ${cluster.shortName} quadrant synergy`;
      } else {
        reason = `Discovery Star • ${sonicSimilarityPct}% Cosine DNA match to your taste`;
      }

      const h = hashString(track.id + track.title);

      // Distinct 3D positions based on galaxyLayout formation
      let x = 0;
      let y = 0;
      let z = 0;

      if (galaxyLayout === 'rings') {
        // Concentric Radar Rings: higher match orbits closer to the nucleus
        const normalizedDist = Math.max(0.16, ((100 - affinityScore) / 42) * 0.78);
        const angle = idx * 2.39996 + clusterIndex * (Math.PI / 2);
        x = Math.cos(angle) * normalizedDist;
        z = Math.sin(angle) * normalizedDist;
        y = (((h % 100) / 100) - 0.5) * 0.22;
      } else if (galaxyLayout === 'spiral') {
        // Majestic Logarithmic 4-Arm Spiral Galaxy
        const armOffset = clusterIndex * (Math.PI / 2);
        const spiralProgress = (rankInCluster + 1) / Math.max(4, entries.length / 4);
        const armAngle = armOffset + spiralProgress * Math.PI * 2.4;
        const radius = 0.14 + Math.sqrt(spiralProgress) * 0.72;
        const spreadJitter = (((h % 100) / 100) - 0.5) * 0.08;
        x = Math.cos(armAngle) * (radius + spreadJitter);
        z = Math.sin(armAngle) * (radius + spreadJitter);
        // Galactic disk thickness tapers outward
        const diskThickness = 0.16 * (1 - radius * 0.65) + 0.03;
        y = (((h >> 4) % 100) / 100 - 0.5) * diskThickness;
      } else {
        // Quadrant Constellations: golden-angle spiral around each quadrant centroid
        const goldenAngle = rankInCluster * 2.39996 + clusterIndex * 1.1;
        const ringStep = 0.09 + Math.sqrt(rankInCluster + 1) * 0.068;
        const spreadZ = (((h >> 4) % 100) / 100 - 0.5) * 0.36;
        x = cluster.cx + Math.cos(goldenAngle) * Math.min(0.32, ringStep);
        y = cluster.cy + Math.sin(goldenAngle) * Math.min(0.28, ringStep);
        z = cluster.cz + spreadZ;
      }

      // High-affinity stars (> 90%) or core favorites earn planetary rings
      const hasPlanetaryRing = affinityScore >= 91 || isLiked;
      const parsecDistance = +(1.2 + ((100 - affinityScore) / 42) * 27.3).toFixed(1);

      return {
        id: track.id,
        track,
        clusterIndex,
        clusterName: cluster.name,
        color: cluster.color,
        secondaryColor: cluster.secondary,
        x,
        y,
        z,
        baseRadius: isLiked ? 15.5 : isRecent ? 13.8 : 12.2,
        orbitSpeed: 0.1 + (h % 8) * 0.015,
        phase: (h % 628) / 100,
        affinityScore,
        dna,
        matchBreakdown: {
          sonicSimilarityPct,
          artistAffinityPct,
          vibeSynergyPct,
          artistPlayCount,
          isLiked,
          isRecent,
          reason
        },
        sourceLabel: source,
        hasPlanetaryRing,
        parsecDistance
      };
    });

    return rawNodes.sort((a, b) => b.affinityScore - a.affinityScore);
  }, [wormholeTracks, likedSongs, predictedTracks, userTasteProfile, galaxyLayout]);

  const avgTasteMatch = useMemo(() => {
    if (stars.length === 0) return 92;
    return Math.round(stars.reduce((s, n) => s + n.affinityScore, 0) / stars.length);
  }, [stars]);

  const clusterCounts = useMemo(() => {
    const counts = [0, 0, 0, 0];
    for (const s of stars) {
      if (counts[s.clusterIndex] !== undefined) counts[s.clusterIndex]++;
    }
    return counts;
  }, [stars]);

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
    } else {
      const updated = stars.find((s) => s.id === selectedStar.id);
      if (updated) setSelectedStar(updated);
    }
  }, [stars, currentTrack?.id]);

  // Top 5 nearest harmonic neighbors with astronomical parsec distances
  const harmonicNeighbors = useMemo(() => {
    if (!selectedStar) return [];
    return stars
      .filter((s) => s.id !== selectedStar.id)
      .map((s) => {
        const dnaSim = computeDnaCosineSimilarity(selectedStar.dna, s.dna);
        const sameClusterBonus = s.clusterIndex === selectedStar.clusterIndex ? 4 : 0;
        const sameArtistBonus =
          s.track.artist.split(',')[0].trim().toLowerCase() ===
          selectedStar.track.artist.split(',')[0].trim().toLowerCase()
            ? 6
            : 0;
        const pairMatch = clamp(dnaSim + sameClusterBonus + sameArtistBonus, 60, 99);
        const spatialDist = +(
          Math.hypot(s.x - selectedStar.x, s.y - selectedStar.y, s.z - selectedStar.z) * 18.5
        ).toFixed(1);
        return { star: s, pairMatch, spatialDist };
      })
      .sort((a, b) => b.pairMatch - a.pairMatch)
      .slice(0, 5);
  }, [selectedStar, stars]);

  // Synchronized state refs for 120fps canvas rendering loop
  const starsRef = useRef<StarNode3D[]>(stars);
  const selectedStarRef = useRef<StarNode3D | null>(selectedStar);
  const hoveredStarIdRef = useRef<string | null>(hoveredStarId);
  const activeClusterFilterRef = useRef<number | null>(activeClusterFilter);
  const galaxyLayoutRef = useRef<'quadrants' | 'rings' | 'spiral'>(galaxyLayout);
  const zoomRef = useRef<number>(zoom);
  const autoOrbitRef = useRef<boolean>(autoOrbit);
  const currentTrackIdRef = useRef<string | undefined>(currentTrack?.id);
  const isCinematicTourRef = useRef<boolean>(isCinematicTour);
  const showCoordinateGridRef = useRef<boolean>(showCoordinateGrid);

  starsRef.current = stars;
  selectedStarRef.current = selectedStar;
  hoveredStarIdRef.current = hoveredStarId;
  activeClusterFilterRef.current = activeClusterFilter;
  galaxyLayoutRef.current = galaxyLayout;
  zoomRef.current = zoom;
  autoOrbitRef.current = autoOrbit;
  currentTrackIdRef.current = currentTrack?.id;
  isCinematicTourRef.current = isCinematicTour;
  showCoordinateGridRef.current = showCoordinateGrid;

  // Cinematic Tour autonomous step effect
  useEffect(() => {
    if (!isCinematicTour || stars.length === 0) return;
    const interval = setInterval(() => {
      setSelectedStar((prev) => {
        const curIdx = stars.findIndex((s) => s.id === prev?.id);
        const nextIdx = (curIdx + 1) % stars.length;
        const nextStar = stars[nextIdx];
        if (nextStar) {
          // Smoothly bias camera toward next star
          const angle = Math.atan2(nextStar.z, nextStar.x);
          cameraRef.current.targetYaw = angle;
          cameraRef.current.targetPitch = nextStar.y * 0.8;
          unlockAudioEngine();
          playTrackWithSmartQueue(nextStar.track);
        }
        return nextStar;
      });
    }, 7000);
    return () => clearInterval(interval);
  }, [isCinematicTour, stars]);

  // 120fps 3D Audio-Reactive Canvas Universe Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let time = 0;
    let lastNow = performance.now();
    let smoothZoom = zoomRef.current;
    const projectedMap = new Map<string, ProjectedStar>();
    const hoverMixMap = new Map<string, number>();
    const selectMixMap = new Map<string, number>();
    let pointerX = -9999;
    let pointerY = -9999;
    const freqBins = new Uint8Array(64);

    // Initial background deep-space particles
    const bgParticles: BackgroundParticle[] = Array.from({ length: 160 }, (_, i) => {
      const palette = ['#ffffff', '#f43f5e', '#a855f7', '#06b6d4', '#f59e0b', '#38bdf8'];
      return {
        x: (Math.random() - 0.5) * 3.0,
        y: (Math.random() - 0.5) * 2.4,
        z: Math.random() * 2.4 - 1.2,
        size: 0.6 + Math.random() * 1.9,
        color: palette[i % palette.length],
        twinklePhase: Math.random() * Math.PI * 2,
        speedZ: 0.02 + Math.random() * 0.04
      };
    });

    // Relativistic polar jet particles for galactic black hole core
    polarJetsRef.current = Array.from({ length: 36 }, (_, i) => ({
      y: (i % 2 === 0 ? 1 : -1) * (0.05 + Math.random() * 0.45),
      xOffset: (Math.random() - 0.5) * 0.03,
      zOffset: (Math.random() - 0.5) * 0.03,
      speed: 0.15 + Math.random() * 0.35,
      size: 0.8 + Math.random() * 1.6,
      alpha: 0.2 + Math.random() * 0.7,
      color: i % 2 === 0 ? '#38bdf8' : '#c084fc'
    }));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Pointer & Gesture Listeners (with mobile pinch-to-zoom)
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
      pointerX = mx;
      pointerY = my;

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

      let found: string | null = null;
      let minDist = Infinity;
      for (const p of projectedMap.values()) {
        const dx = mx - p.sx;
        const dy = my - p.sy;
        const dist = Math.hypot(dx, dy);
        const hitR = p.drawR + 14;
        if (dist <= hitR && dist < minDist) {
          minDist = dist;
          found = p.node.id;
        }
      }
      canvas.style.cursor = found ? 'pointer' : 'grab';
      if (hoveredStarIdRef.current !== found) {
        hoveredStarIdRef.current = found;
        setHoveredStarId(found);
      }
    };

    const onPointerLeave = () => {
      pointerX = -9999;
      pointerY = -9999;
      if (hoveredStarIdRef.current !== null) {
        hoveredStarIdRef.current = null;
        setHoveredStarId(null);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const wasDragging = cameraRef.current.pointerMoved;
      cameraRef.current.isDragging = false;
      canvas.style.cursor = hoveredStarIdRef.current ? 'pointer' : 'grab';

      if (wasDragging) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const sorted = Array.from(projectedMap.values()).sort((a, b) => a.depthZ - b.depthZ);
      for (const p of sorted) {
        const dx = mx - p.sx;
        const dy = my - p.sy;
        if (dx * dx + dy * dy <= (p.drawR + 14) * (p.drawR + 14)) {
          triggerAndroidHaptic('light');
          shockwavesRef.current.push({
            x: p.sx,
            y: p.sy,
            radius: p.drawR,
            maxRadius: p.drawR * 5.8,
            color: p.node.color,
            alpha: 0.95
          });

          if (selectedStarRef.current?.id === p.node.id) {
            unlockAudioEngine();
            playTrackWithSmartQueue(p.node.track);
          } else {
            selectedStarRef.current = p.node;
            setSelectedStar(p.node);
          }
          return;
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      setZoom((z) => Math.max(0.65, Math.min(1.95, +(z + delta).toFixed(2))));
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // 3D Perspective Projection Math
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

      const rx = x * cosY - z * sinY;
      const rz1 = x * sinY + z * cosY;

      const ry = y * cosP - rz1 * sinP;
      const rz = y * sinP + rz1 * cosP;

      const fov = 1.95;
      const perspective = fov / Math.max(0.42, fov + rz);
      return {
        sx: cx + rx * baseScale * perspective,
        sy: cy + ry * baseScale * perspective,
        scale: perspective,
        depthZ: rz
      };
    };

    const render = (now: number) => {
      if (document.hidden) {
        rafId = requestAnimationFrame(render);
        return;
      }

      const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;
      time += dt;

      smoothZoom += (zoomRef.current - smoothZoom) * Math.min(1, dt * 12);

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const cx = width / 2;
      const cy = height / 2;
      const baseScale = Math.min(width, height) * 0.54 * smoothZoom;

      const currentStars = starsRef.current;
      const currentSelected = selectedStarRef.current;
      const currentHoveredId = hoveredStarIdRef.current;
      const clusterFilter = activeClusterFilterRef.current;
      const layoutMode = galaxyLayoutRef.current;
      const playingTrackId = currentTrackIdRef.current;
      const isTour = isCinematicTourRef.current;
      const showGrid = showCoordinateGridRef.current;

      let bassEnergy = 0;
      let midEnergy = 0;
      let trebleEnergy = 0;
      const hasLiveAudio = getAudioFrequencyData(freqBins);
      if (hasLiveAudio) {
        let bSum = 0;
        for (let i = 0; i < 10; i++) bSum += freqBins[i];
        bassEnergy = bSum / (10 * 255);

        let mSum = 0;
        for (let i = 10; i < 32; i++) mSum += freqBins[i];
        midEnergy = mSum / (22 * 255);

        let tSum = 0;
        for (let i = 32; i < 60; i++) tSum += freqBins[i];
        trebleEnergy = tSum / (28 * 255);
      } else if (usePlayerStore.getState().isPlaying) {
        bassEnergy = 0.28 + Math.pow(Math.sin(time * 3.8) * 0.5 + 0.5, 2) * 0.35;
        midEnergy = 0.22 + Math.sin(time * 5.2) * 0.15;
        trebleEnergy = 0.18 + Math.cos(time * 4.4) * 0.14;
      }

      // Camera Orbit & Glide Mechanics
      if (!cameraRef.current.isDragging) {
        if (isTour) {
          cameraRef.current.yaw += (cameraRef.current.targetYaw - cameraRef.current.yaw) * dt * 1.5;
          cameraRef.current.pitch += (cameraRef.current.targetPitch - cameraRef.current.pitch) * dt * 1.5;
        } else if (autoOrbitRef.current) {
          const hoverBrake = currentHoveredId ? 0.1 : 1.0;
          cameraRef.current.yaw += dt * (0.075 + bassEnergy * 0.05) * hoverBrake;
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

      // Deep Cinema-Grade Cosmic Gradient Background
      const bgGrad = ctx.createRadialGradient(
        cx,
        cy,
        8,
        cx,
        cy,
        Math.max(width, height) * 0.78
      );
      bgGrad.addColorStop(0, '#10061e');
      bgGrad.addColorStop(0.35, '#070411');
      bgGrad.addColorStop(0.75, '#030206');
      bgGrad.addColorStop(1, '#000002');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 1. Draw 3D Astrolabe Celestial Coordinate Grid (Elevation & Azimuth)
      if (showGrid) {
        ctx.save();
        const gridRings = [0.28, 0.54, 0.82];
        gridRings.forEach((r, idx) => {
          ctx.beginPath();
          const segments = 64;
          for (let i = 0; i <= segments; i++) {
            const ang = (i / segments) * Math.PI * 2;
            const px = Math.cos(ang) * r;
            const pz = Math.sin(ang) * r;
            const proj = project3D(px, 0, pz, cx, cy, baseScale);
            if (i === 0) ctx.moveTo(proj.sx, proj.sy);
            else ctx.lineTo(proj.sx, proj.sy);
          }
          ctx.strokeStyle =
            layoutMode === 'rings'
              ? `rgba(56, 189, 248, ${0.15 - idx * 0.03 + bassEnergy * 0.06})`
              : `rgba(255, 255, 255, ${0.05 + idx * 0.015 + bassEnergy * 0.04})`;
          ctx.lineWidth = 1;
          ctx.stroke();

          // Degree Markers
          if (idx === 1) {
            const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
            const labels = ['00h • 0°', '06h • 90°', '12h • 180°', '18h • 270°'];
            angles.forEach((ang, aIdx) => {
              const proj = project3D(Math.cos(ang) * r, 0, Math.sin(ang) * r, cx, cy, baseScale);
              ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
              ctx.font = '700 8px Inter, monospace';
              ctx.textAlign = 'center';
              ctx.fillText(labels[aIdx], proj.sx, proj.sy - 3);
            });
          }
        });
        ctx.restore();
      }

      // 2. Draw Galactic Accretion Core & Supermassive Black Hole at (0, 0, 0)
      const coreProj = project3D(0, 0, 0, cx, cy, baseScale);
      const coreRadius = (16 + bassEnergy * 14) * coreProj.scale;

      ctx.save();
      // Accretion Disk Swirling Halo
      const diskGrad = ctx.createRadialGradient(
        coreProj.sx,
        coreProj.sy,
        coreRadius * 0.4,
        coreProj.sx,
        coreProj.sy,
        coreRadius * 3.8
      );
      diskGrad.addColorStop(0, '#c084fcdd');
      diskGrad.addColorStop(0.25, '#38bdf888');
      diskGrad.addColorStop(0.55, '#f43f5e33');
      diskGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = diskGrad;
      ctx.beginPath();
      ctx.arc(coreProj.sx, coreProj.sy, coreRadius * 3.8, 0, Math.PI * 2);
      ctx.fill();

      // Relativistic Swirling Photon Ring
      ctx.strokeStyle = '#e0e7ff';
      ctx.lineWidth = 2.2 + bassEnergy * 2.0;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.ellipse(
        coreProj.sx,
        coreProj.sy,
        coreRadius * 1.45,
        coreRadius * 0.55,
        cameraRef.current.pitch * 0.6 + time * 0.3,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Event Horizon (Deep Black Sphere)
      ctx.fillStyle = '#010103';
      ctx.beginPath();
      ctx.arc(coreProj.sx, coreProj.sy, coreRadius * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Dual Polar Jets
      for (const jet of polarJetsRef.current) {
        jet.y += jet.speed * dt * (jet.y > 0 ? 1 : -1);
        if (Math.abs(jet.y) > 0.65) {
          jet.y = (jet.y > 0 ? 1 : -1) * (0.04 + Math.random() * 0.08);
        }
        const jProj = project3D(jet.xOffset, jet.y, jet.zOffset, cx, cy, baseScale);
        ctx.fillStyle = jet.color;
        ctx.globalAlpha = jet.alpha * (1 - Math.abs(jet.y) / 0.65);
        ctx.beginPath();
        ctx.arc(jProj.sx, jProj.sy, jet.size * jProj.scale, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // 3. Draw 3D Deep-Space Starfield & Hyperjump Warp Streaks
      const warp = cameraRef.current.warpBoost;
      for (const pt of bgParticles) {
        const proj = project3D(pt.x, pt.y, pt.z, cx, cy, baseScale * 1.15);
        const twinkle = 0.35 + 0.65 * Math.sin(time * 2.4 + pt.twinklePhase);
        const r = pt.size * proj.scale * (1 + trebleEnergy * 0.45);

        if (warp > 0.05) {
          const dirX = proj.sx - cx;
          const dirY = proj.sy - cy;
          ctx.strokeStyle = pt.color;
          ctx.globalAlpha = Math.min(1, twinkle * 0.85);
          ctx.lineWidth = Math.max(1, r);
          ctx.beginPath();
          ctx.moveTo(proj.sx, proj.sy);
          ctx.lineTo(proj.sx + dirX * warp * 0.42, proj.sy + dirY * warp * 0.42);
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

      // 4. Volumetric Nebula Clouds in Quadrants Mode
      if (layoutMode === 'quadrants') {
        CLUSTERS.forEach((cluster, idx) => {
          if (clusterFilter !== null && clusterFilter !== idx) return;
          const proj = project3D(cluster.cx, cluster.cy, cluster.cz, cx, cy, baseScale);
          const nebulaR = (150 + bassEnergy * 42) * proj.scale * smoothZoom;

          const grad = ctx.createRadialGradient(proj.sx, proj.sy, 4, proj.sx, proj.sy, nebulaR);
          grad.addColorStop(0, `${cluster.color}38`);
          grad.addColorStop(0.45, `${cluster.secondary}14`);
          grad.addColorStop(1, 'transparent');

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(proj.sx, proj.sy, nebulaR, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = `${cluster.secondary}d9`;
          ctx.font = '800 10px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`✦ ${cluster.name.toUpperCase()}`, proj.sx, proj.sy - nebulaR * 0.58);
        });
      }

      // 5. Project all visible 3D StarNodes
      projectedMap.clear();
      const visibleNodes = currentStars.filter(
        (s) => clusterFilter === null || s.clusterIndex === clusterFilter
      );

      const lerpSpeed = Math.min(1, dt * 14);
      for (const node of visibleNodes) {
        const targetHover = currentHoveredId === node.id ? 1 : 0;
        const prevHover = hoverMixMap.get(node.id) ?? 0;
        const nextHover = prevHover + (targetHover - prevHover) * lerpSpeed;
        hoverMixMap.set(node.id, nextHover);

        const targetSelect = currentSelected?.id === node.id ? 1 : 0;
        const prevSelect = selectMixMap.get(node.id) ?? 0;
        const nextSelect = prevSelect + (targetSelect - prevSelect) * lerpSpeed;
        selectMixMap.set(node.id, nextSelect);

        const orbitAngle = time * node.orbitSpeed + node.phase;
        const wobbleScale = 1 - nextHover * 0.85;
        const ox = node.x + Math.cos(orbitAngle) * 0.016 * wobbleScale;
        const oy = node.y + Math.sin(orbitAngle * 1.3) * 0.016 * wobbleScale;
        const oz = node.z + Math.sin(orbitAngle) * 0.016 * wobbleScale;

        const proj = project3D(ox, oy, oz, cx, cy, baseScale);

        const magX = nextHover > 0.01 && pointerX > 0 ? (pointerX - proj.sx) * 0.18 * nextHover : 0;
        const magY = nextHover > 0.01 && pointerY > 0 ? (pointerY - proj.sy) * 0.18 * nextHover : 0;

        const drawR = node.baseRadius * proj.scale * Math.sqrt(smoothZoom);
        projectedMap.set(node.id, {
          node,
          sx: proj.sx + magX,
          sy: proj.sy + magY,
          scale: proj.scale,
          depthZ: proj.depthZ,
          drawR
        });
      }

      const backToFront = Array.from(projectedMap.values()).sort(
        (a, b) => b.depthZ - a.depthZ
      );

      // 6. Draw Ambient Constellation Filaments & Harmonic Connectors
      const focusId = currentHoveredId || currentSelected?.id;
      const focusProj = focusId ? projectedMap.get(focusId) : null;

      for (let i = 0; i < backToFront.length; i++) {
        for (let j = i + 1; j < backToFront.length; j++) {
          const a = backToFront[i];
          const b = backToFront[j];
          const dist = Math.hypot(a.sx - b.sx, a.sy - b.sy);

          if (a.node.clusterIndex === b.node.clusterIndex && dist < 125 * smoothZoom) {
            const alpha = Math.max(0.04, 0.22 * (1 - dist / (125 * smoothZoom)));
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

      // Draw Animated Harmonic Laser Connectors from Selected Star
      if (focusProj) {
        const neighbors = backToFront
          .filter((p) => p.node.id !== focusProj.node.id)
          .map((p) => ({
            p,
            sim: computeDnaCosineSimilarity(focusProj.node.dna, p.node.dna),
            d: Math.hypot(p.sx - focusProj.sx, p.sy - focusProj.sy)
          }))
          .sort((a, b) => b.sim - a.sim)
          .slice(0, 4);

        ctx.save();
        for (const { p, sim } of neighbors) {
          const grad = ctx.createLinearGradient(focusProj.sx, focusProj.sy, p.sx, p.sy);
          grad.addColorStop(0, focusProj.node.color);
          grad.addColorStop(1, p.node.color);

          ctx.strokeStyle = grad;
          ctx.lineWidth = 2.2;
          ctx.setLineDash([6, 6]);
          ctx.lineDashOffset = -time * 38;
          ctx.beginPath();
          ctx.moveTo(focusProj.sx, focusProj.sy);
          ctx.lineTo(p.sx, p.sy);
          ctx.stroke();

          // Midpoint Pill Badge with Live 4D DNA %
          const mx = (focusProj.sx + p.sx) / 2;
          const my = (focusProj.sy + p.sy) / 2;
          ctx.fillStyle = 'rgba(8, 8, 16, 0.9)';
          ctx.beginPath();
          ctx.roundRect(mx - 28, my - 9, 56, 18, 9);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = '#6ee7b7';
          ctx.font = '800 9px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${sim}% DNA`, mx, my + 3.5);
        }
        ctx.restore();
      }

      // 7. Supernova Expanding Shockwaves
      shockwavesRef.current = shockwavesRef.current.filter((sw) => sw.alpha > 0.02);
      for (const sw of shockwavesRef.current) {
        sw.radius += dt * 220;
        sw.alpha *= 0.92;
        ctx.strokeStyle = sw.color;
        ctx.globalAlpha = sw.alpha;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 8. Draw 3D Planetary Star Nodes
      for (const { sx, sy, scale, depthZ, drawR, node } of backToFront) {
        const hoverMix = hoverMixMap.get(node.id) ?? 0;
        const selectMix = selectMixMap.get(node.id) ?? 0;
        const activeMix = Math.max(hoverMix, selectMix);
        const isPlayingNow = playingTrackId === node.id;

        const depthAlpha = Math.max(
          0.38,
          Math.min(1, 1.15 - (depthZ + 0.6) * 0.45 + activeMix * 0.4)
        );
        ctx.save();
        ctx.globalAlpha = depthAlpha;

        const idlePulse = Math.sin(time * 2.6 + node.phase) * 0.045;
        const smoothScale =
          1 +
          idlePulse +
          activeMix * (0.42 + midEnergy * 0.12) +
          (isPlayingNow ? 0.28 + bassEnergy * 0.42 : 0);

        const r = drawR * smoothScale;

        // Glowing Audio-Reactive Corona
        const coronaRadius = r * (2.6 + hoverMix * 1.4);
        const corona = ctx.createRadialGradient(sx, sy, r * 0.25, sx, sy, coronaRadius);
        corona.addColorStop(0, isPlayingNow ? '#10b981cc' : `${node.color}aa`);
        corona.addColorStop(0.5, `${node.secondaryColor}33`);
        corona.addColorStop(1, 'transparent');
        ctx.fillStyle = corona;
        ctx.beginPath();
        ctx.arc(sx, sy, coronaRadius, 0, Math.PI * 2);
        ctx.fill();

        // Audio Frequency Spikes / Ray Coronas
        if (activeMix > 0.02 || isPlayingNow) {
          const rayAlpha = isPlayingNow ? 1 : activeMix;
          const rayCount = 24;
          ctx.save();
          ctx.globalAlpha = depthAlpha * rayAlpha;
          ctx.translate(sx, sy);
          ctx.rotate(time * 0.55);
          for (let k = 0; k < rayCount; k++) {
            const ang = (k / rayCount) * Math.PI * 2;
            const binVal = hasLiveAudio
              ? freqBins[(k * 2) % 32] / 255
              : 0.32 + 0.32 * Math.sin(time * 6 + k);
            const innerR = r + 3;
            const outerR =
              r + 6 + binVal * (isPlayingNow ? 28 : 16 * activeMix) * scale;
            ctx.strokeStyle = isPlayingNow ? '#34d399' : node.secondaryColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(ang) * innerR, Math.sin(ang) * innerR);
            ctx.lineTo(Math.cos(ang) * outerR, Math.sin(ang) * outerR);
            ctx.stroke();
          }
          ctx.restore();
        }

        // 3D Saturnian Planetary Rings on Core/Liked Stars
        if (node.hasPlanetaryRing) {
          ctx.save();
          ctx.strokeStyle = `${node.secondaryColor}66`;
          ctx.lineWidth = 2.4 * scale;
          ctx.beginPath();
          ctx.ellipse(
            sx,
            sy,
            r * 1.9,
            r * 0.48,
            cameraRef.current.pitch * 0.5 + 0.35,
            0,
            Math.PI * 2
          );
          ctx.stroke();
          ctx.restore();
        }

        // Circular High-Res Album Art Image Disc
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

        // Star Specular Fresnel Rim
        ctx.strokeStyle = isPlayingNow
          ? '#10b981'
          : activeMix > 0.3
          ? '#ffffff'
          : node.secondaryColor;
        ctx.lineWidth = 1.6 + activeMix * 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.stroke();

        // Floating Title & Real Match % Pill
        if (
          activeMix > 0.05 ||
          isPlayingNow ||
          scale > 1.05 ||
          node.sourceLabel === 'Liked Core'
        ) {
          const shortTitle =
            node.track.title.length > 20
              ? node.track.title.slice(0, 18) + '…'
              : node.track.title;

          ctx.font =
            activeMix > 0.3 || isPlayingNow
              ? '800 11px Inter, sans-serif'
              : '600 10px Inter, sans-serif';
          const labelText = `${shortTitle} • ${node.affinityScore}%`;
          const textWidth = ctx.measureText(labelText).width;
          const pillW = textWidth + 18;
          const pillH = hoverMix > 0.25 ? 32 : 18;
          const pillX = sx - pillW / 2;
          const pillY = sy + r + 7;

          ctx.fillStyle =
            activeMix > 0.25 || isPlayingNow
              ? 'rgba(15, 23, 42, 0.95)'
              : 'rgba(10, 10, 20, 0.8)';
          ctx.beginPath();
          ctx.roundRect(pillX, pillY, pillW, pillH, 9);
          ctx.fill();

          if (activeMix > 0.25 || isPlayingNow) {
            ctx.strokeStyle = isPlayingNow ? '#10b981' : node.color;
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }

          ctx.fillStyle =
            activeMix > 0.25 || isPlayingNow
              ? '#ffffff'
              : 'rgba(255,255,255,0.88)';
          ctx.textAlign = 'center';
          ctx.fillText(labelText, sx, pillY + 12.5);

          if (hoverMix > 0.25) {
            ctx.fillStyle = node.secondaryColor;
            ctx.font = '700 9px Inter, sans-serif';
            ctx.fillText(
              currentSelected?.id === node.id ? '▶ Click to Play Now' : '✦ Click to Inspect DNA',
              sx,
              pillY + 25
            );
          }
        }

        ctx.restore();
      }

      // 9. Floating Celestial Compass / Minimap Radar
      // Positioned cleanly at bottom-right above zoom controls to prevent overlap with top controls
      const mmR = 26;
      const mmX = width - mmR - 16;
      const mmY = height - mmR - 62;

      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mmX, mmY, mmR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Quadrant dividers in minimap
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.moveTo(mmX - mmR, mmY);
      ctx.lineTo(mmX + mmR, mmY);
      ctx.moveTo(mmX, mmY - mmR);
      ctx.lineTo(mmX, mmY + mmR);
      ctx.stroke();

      // Camera Yaw Orientation Arrow
      const arrowAng = cameraRef.current.yaw;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mmX, mmY);
      ctx.lineTo(mmX + Math.cos(arrowAng) * (mmR - 4), mmY + Math.sin(arrowAng) * (mmR - 4));
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '800 7px Inter, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('N', mmX, mmY - mmR + 8);
      ctx.restore();

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  const handleLaunchConstellation = (clusterIdx: number) => {
    triggerAndroidHaptic('medium');
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
    triggerAndroidHaptic('medium');
    const randomStar = stars[Math.floor(Math.random() * stars.length)];
    setSelectedStar(randomStar);
    cameraRef.current.warpBoost = 0.8;
    unlockAudioEngine();
    playTrackWithSmartQueue(randomStar.track);
  };

  const handleChainHarmonicQueue = () => {
    if (harmonicNeighbors.length === 0) return;
    triggerAndroidHaptic('heavy');
    unlockAudioEngine();
    const neighborTracks = harmonicNeighbors.map((n) => n.star.track);
    playTrack(neighborTracks[0], neighborTracks, 0);
  };

  // Filter & Sort Roster Stars
  const filteredRosterStars = useMemo(() => {
    let result = stars.filter(
      (s) => activeClusterFilter === null || s.clusterIndex === activeClusterFilter
    );

    if (rosterSearch.trim()) {
      const q = rosterSearch.toLowerCase();
      result = result.filter(
        (s) =>
          s.track.title.toLowerCase().includes(q) ||
          s.track.artist.toLowerCase().includes(q) ||
          s.clusterName.toLowerCase().includes(q)
      );
    }

    if (rosterSort === 'title') {
      result.sort((a, b) => a.track.title.localeCompare(b.track.title));
    } else if (rosterSort === 'artist') {
      result.sort((a, b) => a.track.artist.localeCompare(b.track.artist));
    } else {
      result.sort((a, b) => b.affinityScore - a.affinityScore);
    }

    return result;
  }, [stars, activeClusterFilter, rosterSearch, rosterSort]);

  return (
    <div className="pb-28 pt-1 text-white space-y-4 select-none">
      {/* ================= VisionOS Liquid Glass Astrolabe Command Deck ================= */}
      <div className="rounded-3xl liquid-glass border-0 p-5 sm:p-6 space-y-4 shadow-2xl">
        {/* Tier 1: Main Header & Formation Switcher */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[11px] font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
              <span className="uppercase tracking-widest text-emerald-300 font-extrabold">
                Observatory Live
              </span>
              <span className="text-white/25">•</span>
              <span className="text-white/70">
                {stars.length} {stars.length === 1 ? 'Star' : 'Stars'}
              </span>
              <span className="text-white/25">•</span>
              <span className="text-cyan-300 font-extrabold">
                {avgTasteMatch}% Resonance
              </span>
              {likedSongs.length > 0 && (
                <>
                  <span className="text-white/25">•</span>
                  <span className="text-rose-300 font-extrabold">
                    ❤️ {likedSongs.length} Liked Orbit
                  </span>
                </>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
              <span>Sonic Galaxy</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/10 text-white/70 font-semibold border-0">
                3D Spatial Map
              </span>
            </h1>
            <p className="text-xs text-white/50">
              Visualizing your library's 4D Sonic DNA across space, tempo, and harmonic affinity
            </p>
          </div>

          {/* 3-Way Formation Switcher */}
          <div className="flex items-center p-1 rounded-2xl bg-white/[0.05] border-0 backdrop-blur-xl shadow-inner self-start md:self-center">
            <button
              type="button"
              onClick={() => {
                triggerAndroidHaptic('light');
                setGalaxyLayout('quadrants');
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                galaxyLayout === 'quadrants'
                  ? 'glass-button-purple text-white shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              🪐 Constellations
            </button>
            <button
              type="button"
              onClick={() => {
                triggerAndroidHaptic('light');
                setGalaxyLayout('rings');
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                galaxyLayout === 'rings'
                  ? 'glass-button-cyan text-white shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              🎯 Taste Radar
            </button>
            <button
              type="button"
              onClick={() => {
                triggerAndroidHaptic('light');
                setGalaxyLayout('spiral');
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                galaxyLayout === 'spiral'
                  ? 'glass-button-primary text-white shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              🌀 Spiral Galaxy
            </button>
          </div>
        </div>

        {/* Tier 2: Quadrant Filters & Integrated Search Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
          {/* Quadrant Constellation Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                triggerAndroidHaptic('light');
                setActiveClusterFilter(null);
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold cursor-pointer transition-all ${
                activeClusterFilter === null
                  ? 'glass-button-primary text-white shadow-sm'
                  : 'glass-button text-white/70 hover:text-white'
              }`}
            >
              All Quadrants ({stars.length})
            </button>
            {CLUSTERS.map((c, idx) => (
              <button
                key={c.name}
                onClick={() => {
                  triggerAndroidHaptic('light');
                  setActiveClusterFilter(activeClusterFilter === idx ? null : idx);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 ${
                  activeClusterFilter === idx
                    ? 'glass-button text-white border-white/50 bg-white/20 shadow-md'
                    : 'glass-button text-white/70 hover:text-white'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                <span>{c.shortName}</span>
                <span className="text-[10px] text-white/50 font-mono">({clusterCounts[idx]})</span>
              </button>
            ))}
          </div>

          {/* Integrated Sleek Search / Warp Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (warpQuery.trim()) {
                triggerWormholeWarp(warpQuery.trim());
              }
            }}
            className="relative flex items-center w-full lg:w-72 flex-shrink-0"
          >
            <span className="absolute left-3 text-white/40 text-xs pointer-events-none">🔍</span>
            <input
              type="text"
              value={warpQuery}
              onChange={(e) => setWarpQuery(e.target.value)}
              placeholder="Warp to artist, genre, or mood..."
              className="w-full h-9 pl-8 pr-20 rounded-full glass-input text-xs text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
            <button
              type="submit"
              disabled={isWarping}
              className="absolute right-1 top-1 bottom-1 px-3 rounded-full glass-button-primary text-white font-extrabold text-[11px] cursor-pointer transition-all flex items-center gap-1 shadow-sm"
            >
              {isWarping ? '...' : '🚀 Warp'}
            </button>
          </form>
        </div>

        {/* Tier 3: Universe Jump Presets Bar */}
        <div
          className="pt-3 flex items-center gap-2 overflow-x-auto no-scrollbar py-3.5 -my-1.5 px-1.5"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <span className="text-[11px] font-extrabold text-white/45 whitespace-nowrap flex items-center gap-1 flex-shrink-0">
            <span>🌌</span>
            <span>Jump Universe:</span>
          </span>
          <div className="flex items-center gap-1.5 flex-nowrap">
            {WORMHOLE_PRESETS.map((preset) => {
              const isActive = activeWormholeLabel === preset.label;
              return (
                <button
                  key={preset.label}
                  onClick={() => triggerWormholeWarp(preset.query, preset.label)}
                  className={`px-3 py-1 rounded-full text-[11px] font-extrabold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'glass-button-purple text-white shadow-sm'
                      : 'glass-button text-white/70 hover:text-white'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ================= Main 12-Column Layout ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left: 120fps 3D Interactive Star Map Viewport (7 cols) */}
        <div className="lg:col-span-7 relative rounded-3xl overflow-hidden border-0 bg-[#040208] shadow-[0_30px_100px_rgba(0,0,0,0.9)] h-[480px] sm:h-[620px] lg:h-[700px]">
          <canvas ref={canvasRef} className="w-full h-full block touch-none" />

          {/* Top Viewport VisionOS Controls */}
          <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between gap-2 pointer-events-none">
            <div
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-3 -my-1 px-1.5 pointer-events-auto max-w-full"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <button
                onClick={() => {
                  triggerAndroidHaptic('light');
                  setAutoOrbit((v) => !v);
                }}
                className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold cursor-pointer transition-all whitespace-nowrap flex-shrink-0 ${
                  autoOrbit ? 'glass-button-emerald' : 'glass-button text-white/75'
                }`}
              >
                {autoOrbit ? '🔄 Orbit: ON' : '✋ Orbit: PAUSED'}
              </button>
              <button
                onClick={() => {
                  triggerAndroidHaptic('medium');
                  setIsCinematicTour((t) => !t);
                }}
                className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold cursor-pointer transition-all whitespace-nowrap flex-shrink-0 ${
                  isCinematicTour ? 'glass-button-purple animate-pulse' : 'glass-button text-white/85'
                }`}
                title="Glide autonomously from star to star in a cinematic cosmic tour"
              >
                {isCinematicTour ? '🛸 Tour: ACTIVE' : '🚀 Cinematic Tour'}
              </button>
              <button
                onClick={() => {
                  triggerAndroidHaptic('light');
                  setShowCoordinateGrid((g) => !g);
                }}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold cursor-pointer transition-all whitespace-nowrap flex-shrink-0 ${
                  showCoordinateGrid ? 'glass-button text-white' : 'glass-button text-white/40'
                }`}
                title="Toggle celestial coordinate grid lines"
              >
                🌐 Grid
              </button>
              <button
                onClick={() => {
                  triggerAndroidHaptic('light');
                  cameraRef.current.yaw = 0.25;
                  cameraRef.current.pitch = 0.22;
                  cameraRef.current.velYaw = 0;
                  cameraRef.current.velPitch = 0;
                  setZoom(1.05);
                }}
                className="px-3 py-1.5 rounded-full glass-button text-[11px] font-bold text-white/85 cursor-pointer whitespace-nowrap flex-shrink-0"
              >
                🎯 Center
              </button>
              <button
                onClick={handleSupernovaShuffle}
                className="px-3 py-1.5 rounded-full glass-button-primary text-[11px] font-extrabold text-white cursor-pointer whitespace-nowrap flex-shrink-0"
              >
                ✨ Shuffle
              </button>
            </div>

            <div className="hidden 2xl:flex items-center gap-1.5 px-3 py-1 rounded-full liquid-glass border-0 text-[10px] font-bold text-white/75 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>DRAG TO ROTATE • SCROLL / PINCH TO ZOOM</span>
            </div>
          </div>

          {/* Bottom-Left Floating Selected Star Quick-Bar */}
          {selectedStar && (
            <div className="absolute bottom-3.5 left-3.5 right-32 sm:right-auto sm:max-w-xs pointer-events-auto">
              <div
                onContextMenu={(e) => {
                  if (e.shiftKey) return;
                  e.preventDefault();
                  e.stopPropagation();
                  useContextMenuStore.getState().openTrackMenu(
                    { clientX: e.clientX, clientY: e.clientY },
                    selectedStar.track
                  );
                }}
                className="p-2.5 rounded-2xl liquid-glass border-0 shadow-2xl flex items-center gap-3 cursor-pointer"
              >
                <img
                  src={selectedStar.track.thumbnail || DEFAULT_THUMBNAIL}
                  alt={selectedStar.track.title}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                  }}
                  className={`w-10 h-10 rounded-xl object-cover flex-shrink-0 border-0 ${
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
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 truncate">
                      {selectedStar.affinityScore}% Match • {selectedStar.parsecDistance} pc
                    </span>
                  </div>
                  <p className="text-xs font-extrabold text-white truncate">
                    {selectedStar.track.title}
                  </p>
                  <p className="text-[10px] text-white/60 truncate">
                    {selectedStar.track.artist}
                  </p>
                </div>
                <button
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    unlockAudioEngine();
                    if (currentTrack?.id === selectedStar.id) {
                      togglePlay();
                    } else {
                      playTrackWithSmartQueue(selectedStar.track);
                    }
                  }}
                  className="px-3.5 py-2 rounded-full glass-button-primary text-white font-extrabold text-xs cursor-pointer flex-shrink-0"
                >
                  {currentTrack?.id === selectedStar.id && isPlaying ? '⏸' : '▶'}
                </button>
              </div>
            </div>
          )}

          {/* Bottom-Right Zoom Controls */}
          <div className="absolute bottom-3.5 right-3.5 flex items-center gap-1.5">
            <button
              onClick={() => {
                triggerAndroidHaptic('light');
                setZoom((z) => Math.max(0.65, +(z - 0.15).toFixed(2)));
              }}
              className="w-9 h-9 rounded-full glass-button flex items-center justify-center text-white font-bold cursor-pointer"
              title="Zoom Out"
            >
              −
            </button>
            <button
              onClick={() => {
                triggerAndroidHaptic('light');
                setZoom(1.05);
              }}
              className="px-3 h-9 rounded-full glass-button flex items-center justify-center text-xs font-bold text-white/90 cursor-pointer tabular-nums"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => {
                triggerAndroidHaptic('light');
                setZoom((z) => Math.min(1.95, +(z + 0.15).toFixed(2)));
              }}
              className="w-9 h-9 rounded-full glass-button flex items-center justify-center text-white font-bold cursor-pointer"
              title="Zoom In"
            >
              +
            </button>
          </div>
        </div>

        {/* Right: VisionOS Planetary Telemetry Station (5 cols) */}
        <GlassCard
          variant="liquid"
          padding="md"
          className="lg:col-span-5 flex flex-col justify-between border-0 h-[520px] sm:h-[620px] lg:h-[700px] overflow-hidden"
        >
          {/* Top Inspector Navigation Tabs */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-black/50 border-0 mb-3 flex-shrink-0 w-full min-w-0 overflow-hidden">
            <button
              type="button"
              onClick={() => {
                triggerAndroidHaptic('light');
                setInspectorTab('dna');
              }}
              title="4D Acoustic DNA & Radar Spider"
              className={`py-2 px-1 sm:px-2 rounded-xl text-[11px] sm:text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
                inspectorTab === 'dna'
                  ? 'glass-button-primary text-white shadow-md'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              <span>🧬</span>
              <span className="truncate">4D DNA</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerAndroidHaptic('light');
                setInspectorTab('neighbors');
              }}
              title="Harmonic Cosmic Neighbors"
              className={`py-2 px-1 sm:px-2 rounded-xl text-[11px] sm:text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
                inspectorTab === 'neighbors'
                  ? 'glass-button-purple text-white shadow-md'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              <span>🔗</span>
              <span className="truncate">Harmonic</span>
              <span className="text-[10px] opacity-75 tabular-nums">({harmonicNeighbors.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerAndroidHaptic('light');
                setInspectorTab('roster');
              }}
              title="Star Roster"
              className={`py-2 px-1 sm:px-2 rounded-xl text-[11px] sm:text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 ${
                inspectorTab === 'roster'
                  ? 'glass-button-cyan text-white shadow-md'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              <span>📋</span>
              <span className="truncate">Roster</span>
              <span className="text-[10px] opacity-75 tabular-nums">({filteredRosterStars.length})</span>
            </button>
          </div>

          {/* Scrollable Inspector Body */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-4">
            {selectedStar ? (
              <>
                {/* Hero Planet Card Header */}
                <div className="p-3.5 rounded-2xl bg-white/[0.04] border-0 flex flex-col gap-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-14 h-14 sm:w-16 sm:h-16 flex-shrink-0">
                      <div
                        className="absolute -inset-1 rounded-2xl blur-md opacity-60"
                        style={{ backgroundColor: selectedStar.color }}
                      />
                      <img
                        src={selectedStar.track.thumbnail || DEFAULT_THUMBNAIL}
                        alt={selectedStar.track.title}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                        }}
                        className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover shadow-xl border-0"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm sm:text-base font-black text-white truncate leading-tight">
                        {selectedStar.track.title}
                      </h3>
                      <p className="text-xs font-semibold text-white/65 truncate mt-0.5">
                        {selectedStar.track.artist}
                      </p>
                    </div>

                    {/* Real Taste Match Circular Badge */}
                    <div className="flex flex-col items-center justify-center px-2.5 py-1.5 rounded-xl bg-emerald-500/15 border-0 flex-shrink-0">
                      <span className="text-base sm:text-lg font-black text-emerald-300 leading-none tabular-nums whitespace-nowrap">
                        {selectedStar.affinityScore}%
                      </span>
                      <span className="text-[8px] font-extrabold uppercase tracking-wider text-emerald-200/80 mt-0.5 whitespace-nowrap">
                        Match
                      </span>
                    </div>
                  </div>

                  {/* Badges Row: Dedicated row with wrap so badges NEVER clip */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1 border-0">
                    <span
                      className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider text-white whitespace-nowrap"
                      style={{
                        backgroundColor: `${selectedStar.color}40`,
                        border: `1px solid ${selectedStar.color}`
                      }}
                    >
                      {selectedStar.clusterName}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-white/10 text-[9px] font-bold text-white/70 whitespace-nowrap">
                      {selectedStar.sourceLabel}
                    </span>
                    <span className="text-[9px] font-semibold text-white/45 ml-auto whitespace-nowrap">
                      {selectedStar.parsecDistance} pc
                    </span>
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {inspectorTab === 'dna' && (
                    <motion.div
                      key="tab-dna"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.16 }}
                      className="space-y-3.5"
                    >
                      {/* Real Taste Match Breakdown Card */}
                      <div className="p-3.5 rounded-2xl bg-black/40 border-0 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 whitespace-nowrap">
                            🎯 Real Taste Match Breakdown
                          </span>
                          <span className="text-[10px] font-bold text-white/50 whitespace-nowrap">
                            Cosine Vector Engine
                          </span>
                        </div>
                        <p className="text-xs text-white/85 font-semibold leading-relaxed bg-white/[0.04] px-3 py-2 rounded-xl border-0">
                          {selectedStar.matchBreakdown.reason}
                        </p>
                        <div className="grid grid-cols-3 gap-2 pt-1">
                          <div className="p-2 rounded-xl bg-white/[0.04] border-0 text-center">
                            <div className="text-sm font-black text-cyan-300 tabular-nums whitespace-nowrap">
                              {selectedStar.matchBreakdown.sonicSimilarityPct}%
                            </div>
                            <div className="text-[9px] font-bold uppercase text-white/50 whitespace-nowrap">
                              4D Sonic DNA
                            </div>
                          </div>
                          <div className="p-2 rounded-xl bg-white/[0.04] border-0 text-center">
                            <div className="text-sm font-black text-purple-300 tabular-nums whitespace-nowrap">
                              {selectedStar.matchBreakdown.artistAffinityPct}%
                            </div>
                            <div className="text-[9px] font-bold uppercase text-white/50 whitespace-nowrap">
                              Artist Affinity
                            </div>
                          </div>
                          <div className="p-2 rounded-xl bg-white/[0.04] border-0 text-center">
                            <div className="text-sm font-black text-rose-300 tabular-nums whitespace-nowrap">
                              {selectedStar.matchBreakdown.vibeSynergyPct}%
                            </div>
                            <div className="text-[9px] font-bold uppercase text-white/50 whitespace-nowrap">
                              Cluster Fit
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Interactive 4D Sonic Spider/Radar SVG Chart */}
                      <SonicSpiderRadar
                        trackDna={selectedStar.dna}
                        userDna={userTasteProfile.userDna}
                        clusterColor={selectedStar.color}
                      />

                      {/* Planetary Sonic DNA 4-Channel Visualizer Bars */}
                      <div className="p-3.5 rounded-2xl bg-black/40 border-0 space-y-2.5">
                        <div className="flex items-center justify-between gap-2 text-[10px] font-extrabold uppercase tracking-wider text-white/65">
                          <span className="whitespace-nowrap truncate">🧬 Acoustic Dimension Channels</span>
                          <span className="text-cyan-300 whitespace-nowrap flex-shrink-0">320kbps HD</span>
                        </div>
                        {[
                          {
                            label: 'Energy Velocity',
                            val: selectedStar.dna.energy,
                            userVal: userTasteProfile.userDna.energy,
                            color: '#f43f5e'
                          },
                          {
                            label: 'Sub-Bass Gravity',
                            val: selectedStar.dna.bass,
                            userVal: userTasteProfile.userDna.bass,
                            color: '#a855f7'
                          },
                          {
                            label: 'Vocal Presence',
                            val: selectedStar.dna.vocal,
                            userVal: userTasteProfile.userDna.vocal,
                            color: '#06b6d4'
                          },
                          {
                            label: 'Cosmic Euphoria',
                            val: selectedStar.dna.euphoria,
                            userVal: userTasteProfile.userDna.euphoria,
                            color: '#f59e0b'
                          }
                        ].map((metric) => (
                          <div key={metric.label} className="space-y-1">
                            <div className="flex justify-between gap-2 text-[11px] font-bold">
                              <span className="text-white/75 whitespace-nowrap">{metric.label}</span>
                              <span className="text-white tabular-nums whitespace-nowrap flex-shrink-0">
                                {metric.val}%{' '}
                                <span className="text-[10px] text-white/40 font-normal">
                                  (You: {metric.userVal}%)
                                </span>
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${metric.val}%` }}
                                transition={{ duration: 0.4, ease: 'easeOut' }}
                                className="h-full rounded-full"
                                style={{ backgroundColor: metric.color }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {inspectorTab === 'neighbors' && (
                    <motion.div
                      key="tab-neighbors"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.16 }}
                      className="space-y-2.5"
                    >
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-bold text-white/60">
                          Resonating stars near <span className="text-white font-extrabold">{selectedStar.track.title}</span>:
                        </span>
                        <button
                          type="button"
                          onClick={handleChainHarmonicQueue}
                          className="px-2.5 py-1 rounded-full glass-button-purple text-[10px] font-extrabold text-white cursor-pointer hover:scale-105 active:scale-95 transition-all"
                        >
                          ⚡ Play Resonant Queue
                        </button>
                      </div>

                      {harmonicNeighbors.map(({ star: neighbor, pairMatch, spatialDist }) => (
                        <div
                          key={neighbor.id}
                          onClick={() => {
                            triggerAndroidHaptic('light');
                            setSelectedStar(neighbor);
                          }}
                          className="p-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.1] border-0 flex items-center justify-between gap-2.5 cursor-pointer transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={neighbor.track.thumbnail || DEFAULT_THUMBNAIL}
                              alt={neighbor.track.title}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                              }}
                              className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-extrabold text-white truncate">
                                {neighbor.track.title}
                              </p>
                              <p className="text-[11px] text-white/55 truncate">
                                {neighbor.track.artist}
                              </p>
                              <span className="text-[9px] text-cyan-300/80 font-mono">
                                🌌 {spatialDist} parsecs away
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border-0 text-[10px] font-extrabold text-emerald-300 tabular-nums whitespace-nowrap flex-shrink-0">
                              {pairMatch}% DNA
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerAndroidHaptic('medium');
                                unlockAudioEngine();
                                playTrackWithSmartQueue(neighbor.track);
                              }}
                              className="w-7 h-7 rounded-full glass-button-primary flex items-center justify-center text-white text-[10px] cursor-pointer"
                              title="Play Track"
                            >
                              ▶
                            </button>
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  )}

                  {inspectorTab === 'roster' && (
                    <motion.div
                      key="tab-roster"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.16 }}
                      className="space-y-2.5"
                    >
                      {/* Search & Sort Bar inside Roster */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={rosterSearch}
                          onChange={(e) => setRosterSearch(e.target.value)}
                          placeholder="Search star roster..."
                          className="flex-1 h-8 px-3 rounded-xl bg-white/[0.06] border-0 text-xs text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/30"
                        />
                        <select
                          value={rosterSort}
                          onChange={(e) => setRosterSort(e.target.value as any)}
                          className="h-8 px-2 rounded-xl bg-white/[0.06] border-0 text-[11px] text-white font-bold focus:outline-none cursor-pointer"
                        >
                          <option value="match" className="bg-[#0b0816] text-white">Sort: Match %</option>
                          <option value="title" className="bg-[#0b0816] text-white">Sort: Title</option>
                          <option value="artist" className="bg-[#0b0816] text-white">Sort: Artist</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        {filteredRosterStars.map((node, i) => {
                          const isSel = selectedStar?.id === node.id;
                          return (
                            <div
                              key={node.id}
                              onClick={() => {
                                triggerAndroidHaptic('light');
                                setSelectedStar(node);
                              }}
                              className={`p-2 rounded-xl border flex items-center justify-between gap-2.5 cursor-pointer transition-all ${
                                isSel
                                  ? 'bg-white/15 border-white/30 shadow-md'
                                  : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/10'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-[10px] font-extrabold text-white/45 w-5 text-center tabular-nums">
                                  #{i + 1}
                                </span>
                                <img
                                  src={node.track.thumbnail || DEFAULT_THUMBNAIL}
                                  alt={node.track.title}
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                                  }}
                                  className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                                />
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-white truncate">
                                    {node.track.title}
                                  </p>
                                  <p className="text-[10px] text-white/50 truncate">
                                    {node.track.artist}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-extrabold text-emerald-300 tabular-nums">
                                  {node.affinityScore}%
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    triggerAndroidHaptic('medium');
                                    unlockAudioEngine();
                                    playTrackWithSmartQueue(node.track);
                                  }}
                                  className="w-7 h-7 rounded-full glass-button flex items-center justify-center text-white text-[10px] cursor-pointer"
                                >
                                  ▶
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            ) : (
              <div className="py-16 text-center text-white/50 text-sm">
                Tap any planet in the 3D galaxy to inspect its real Sonic DNA and Taste Match.
              </div>
            )}
          </div>

          {/* Sticky Bottom Action Dock inside Right Telemetry Inspector */}
          {selectedStar && (
            <div className="pt-3 mt-2 border-0 space-y-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  triggerAndroidHaptic('medium');
                  unlockAudioEngine();
                  playTrackWithSmartQueue(selectedStar.track);
                }}
                className="w-full py-2.5 rounded-full glass-button-primary text-white font-extrabold text-xs uppercase tracking-wider cursor-pointer shadow-lg hover:scale-105 active:scale-95 transition-all"
              >
                ▶ Play Star + Smart Gravity Queue
              </button>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    addNext(selectedStar.track);
                  }}
                  className="py-2 px-2.5 rounded-full glass-button text-white font-bold text-[11px] cursor-pointer truncate hover:text-white"
                >
                  ➕ Play Next
                </button>
                <button
                  type="button"
                  onClick={() => handleLaunchConstellation(selectedStar.clusterIndex)}
                  className="py-2 px-2.5 rounded-full glass-button-cyan font-bold text-[11px] cursor-pointer truncate"
                >
                  🌌 Play Nebula
                </button>
                <button
                  type="button"
                  onClick={() =>
                    triggerWormholeWarp(
                      selectedStar.track.artist.split(',')[0].trim(),
                      `🪐 ${selectedStar.track.artist.split(',')[0].trim()}`
                    )
                  }
                  className="py-2 px-2.5 rounded-full glass-button-purple font-bold text-[11px] cursor-pointer truncate"
                >
                  🚀 Artist Orbit
                </button>
              </div>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
