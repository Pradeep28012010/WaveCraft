import type { Track } from '../../types';
import type { SonicDNA } from './galaxyTypes';

export interface GalaxyCluster {
  name: string;
  shortName: string;
  subtitle: string;
  color: string;
  secondary: string;
  accentRgb: string;
  cx: number;
  cy: number;
  cz: number;
  centroidDna: SonicDNA;
}

export const CLUSTERS: GalaxyCluster[] = [
  // 1. North-West: Supernova Pulse (High-Energy, Bass, Phonk, Trap)
  {
    name: 'Supernova Pulse',
    shortName: 'Supernova',
    subtitle: 'High-Energy & Bass Anthems',
    color: '#f43f5e',
    secondary: '#fb7185',
    accentRgb: '244, 63, 94',
    cx: -0.42,
    cy: -0.32,
    cz: 0.16,
    centroidDna: { energy: 92, bass: 90, vocal: 60, euphoria: 80 }
  },
  // 2. North: Pulsar Neon (Cyberpunk, Synthwave, High-BPM Dance)
  {
    name: 'Pulsar Neon',
    shortName: 'Pulsar',
    subtitle: 'Cyber Electro & Neon Beats',
    color: '#ec4899',
    secondary: '#f472b6',
    accentRgb: '236, 72, 153',
    cx: 0.0,
    cy: -0.48,
    cz: -0.12,
    centroidDna: { energy: 88, bass: 76, vocal: 52, euphoria: 92 }
  },
  // 3. North-East: Andromeda Velvet (Late-Night Soul, R&B & Melodic Pop)
  {
    name: 'Andromeda Velvet',
    shortName: 'Andromeda',
    subtitle: 'Late-Night Melody & Soul',
    color: '#a855f7',
    secondary: '#c084fc',
    accentRgb: '168, 85, 247',
    cx: 0.42,
    cy: -0.32,
    cz: -0.16,
    centroidDna: { energy: 54, bass: 60, vocal: 92, euphoria: 76 }
  },
  // 4. East: Nebula Horizon (Atmospheric, Lofi, Chill & Dreamscape)
  {
    name: 'Nebula Horizon',
    shortName: 'Nebula',
    subtitle: 'Lofi Chill & Dreamscape',
    color: '#6366f1',
    secondary: '#818cf8',
    accentRgb: '99, 102, 241',
    cx: 0.52,
    cy: 0.02,
    cz: 0.14,
    centroidDna: { energy: 44, bass: 52, vocal: 78, euphoria: 84 }
  },
  // 5. South-East: Solaris Gold (Timeless Acoustic, Folk, Classic & Vocals)
  {
    name: 'Solaris Gold',
    shortName: 'Solaris',
    subtitle: 'Timeless & Acoustic Euphoria',
    color: '#f59e0b',
    secondary: '#fbbf24',
    accentRgb: '245, 158, 11',
    cx: 0.40,
    cy: 0.35,
    cz: 0.18,
    centroidDna: { energy: 58, bass: 48, vocal: 90, euphoria: 86 }
  },
  // 6. South: Orion Aurora (Warm Melodic, Indie & Uplifting Grooves)
  {
    name: 'Orion Aurora',
    shortName: 'Orion',
    subtitle: 'Warm Melodic & Uplifting Anthems',
    color: '#10b981',
    secondary: '#34d399',
    accentRgb: '16, 185, 129',
    cx: 0.0,
    cy: 0.48,
    cz: -0.15,
    centroidDna: { energy: 68, bass: 64, vocal: 82, euphoria: 88 }
  },
  // 7. South-West: Cyber Hyperion (Electronic, Techno & Deep Sub-Bass)
  {
    name: 'Cyber Hyperion',
    shortName: 'Hyperion',
    subtitle: 'Electronic & Deep Sub-Bass',
    color: '#06b6d4',
    secondary: '#22d3ee',
    accentRgb: '6, 182, 212',
    cx: -0.40,
    cy: 0.35,
    cz: -0.18,
    centroidDna: { energy: 84, bass: 86, vocal: 52, euphoria: 88 }
  },
  // 8. West: Astral Abyss (Cinematic Scores, Deep Space & Dark Bass)
  {
    name: 'Astral Abyss',
    shortName: 'Astral',
    subtitle: 'Cinematic Odyssey & Deep Space',
    color: '#8b5cf6',
    secondary: '#a78bfa',
    accentRgb: '139, 92, 246',
    cx: -0.52,
    cy: -0.02,
    cz: 0.12,
    centroidDna: { energy: 76, bass: 82, vocal: 68, euphoria: 74 }
  }
];

export const WORMHOLE_PRESETS = [
  { label: '🌌 My Taste Universe', query: '' },
  { label: '🔥 The Weeknd', query: 'The Weeknd best hits' },
  { label: '⚡ Anirudh', query: 'Anirudh Ravichander hits' },
  { label: '💜 Arijit Singh', query: 'Arijit Singh melody hits' },
  { label: '🎹 A.R. Rahman', query: 'A.R. Rahman timeless hits' },
  { label: '🚀 Travis & Metro', query: 'Travis Scott Metro Boomin' }
];

export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val)));
}

/**
 * 100% Deterministic 4-Channel Sonic DNA & 8-Sector Cluster Classifier
 */
export function analyzeTrackSonicDNA(track: Track): { dna: SonicDNA; clusterIndex: number } {
  const text = `${track.title || ''} ${track.artist || ''} ${track.album || ''} ${track.genre || ''}`.toLowerCase();
  const h = hashString(`${track.id}:${track.title}:${track.artist}`);
  const dur = track.duration || 210;

  let energy = 68 + ((h % 19) - 9);
  let bass = 66 + (((h >> 4) % 19) - 9);
  let vocal = 72 + (((h >> 8) % 17) - 8);
  let euphoria = 70 + (((h >> 12) % 19) - 9);

  if (
    /\b(bass|trap|phonk|drill|hype|party|club|power|kuthu|mass|badass|beast|fire|sicko|fein|travis|metro)\b/i.test(
      text
    )
  ) {
    energy += 20;
    bass += 22;
    euphoria += 6;
  }

  if (
    /\b(neon|synth|synthwave|dance|edm|future|disco|speed|fast|run|starboy|blinding|weeknd|rave)\b/i.test(
      text
    )
  ) {
    energy += 16;
    euphoria += 18;
    bass += 8;
  }

  if (
    /\b(love|soul|melody|romantic|heart|velvet|night|midnight|arijit|shreya|sid|kesariya|tum|dil|sensual|slow)\b/i.test(
      text
    )
  ) {
    vocal += 18;
    euphoria += 10;
    energy -= 10;
    bass += 4;
  }

  if (
    /\b(lofi|lo-fi|chill|chillout|slowed|reverb|ambient|relax|sleep|study|cloud|dream|haze|mist)\b/i.test(
      text
    )
  ) {
    vocal += 10;
    euphoria += 16;
    energy -= 18;
    bass -= 4;
  }

  if (
    /\b(acoustic|unplugged|live|piano|guitar|strings|classic|timeless|gold|rahman|ilaiyaraaja|old|vintage)\b/i.test(
      text
    )
  ) {
    vocal += 16;
    euphoria += 14;
    bass -= 8;
  }

  if (
    /\b(indie|folk|sunrise|morning|uplifting|anthem|hope|joy|alive|light|pop|radio|cheer)\b/i.test(
      text
    )
  ) {
    energy += 8;
    vocal += 14;
    euphoria += 16;
    bass += 2;
  }

  if (
    /\b(cyber|electronic|techno|house|trance|glitch|bassline|sub|industrial|daft|kavinsky|skrillex)\b/i.test(
      text
    )
  ) {
    energy += 14;
    bass += 18;
    euphoria += 14;
    vocal -= 12;
  }

  if (
    /\b(ost|score|theme|hans|zimmer|interstellar|cinematic|epic|dark|space|abyss|dune|batman|trailer)\b/i.test(
      text
    )
  ) {
    energy += 10;
    bass += 16;
    euphoria += 6;
    vocal += 4;
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

export function computeDnaCosineSimilarity(a: SonicDNA, b: SonicDNA): number {
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

export function getCachedAlbumImage(url?: string): HTMLImageElement | null {
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
