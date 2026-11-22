import type { Track } from '../../types';

export interface SonicDNA {
  energy: number;
  bass: number;
  vocal: number;
  euphoria: number;
}

export interface TasteMatchBreakdown {
  sonicSimilarityPct: number;
  artistAffinityPct: number;
  vibeSynergyPct: number;
  artistPlayCount: number;
  isLiked: boolean;
  isRecent: boolean;
  reason: string;
}

export interface StarNode3D {
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

export interface ProjectedStar {
  node: StarNode3D;
  sx: number;
  sy: number;
  scale: number;
  depthZ: number;
  drawR: number;
}

export interface BackgroundParticle {
  x: number;
  y: number;
  z: number;
  size: number;
  color: string;
  twinklePhase: number;
  speedZ: number;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
}

export interface PolarJetParticle {
  y: number;
  xOffset: number;
  zOffset: number;
  speed: number;
  size: number;
  alpha: number;
  color: string;
}

export interface ConstellationFilament {
  aId: string;
  bId: string;
  sim: number;
  color: string;
}

export interface FilamentPacket {
  filamentIdx: number;
  progress: number;
  speed: number;
  size: number;
  color: string;
}
