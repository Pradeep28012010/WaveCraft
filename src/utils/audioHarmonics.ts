export interface TrackHarmonics {
  bpm: number;
  camelotKey: string;
  musicalKey: string;
  energy: 'Chill' | 'Groove' | 'Upbeat' | 'High Energy';
}

const CAMELOT_KEYS = [
  { camelot: '1A', musical: 'G#m' },
  { camelot: '2A', musical: 'D#m' },
  { camelot: '3A', musical: 'A#m' },
  { camelot: '4A', musical: 'Fm' },
  { camelot: '5A', musical: 'Cm' },
  { camelot: '6A', musical: 'Gm' },
  { camelot: '7A', musical: 'Dm' },
  { camelot: '8A', musical: 'Am' },
  { camelot: '9A', musical: 'Em' },
  { camelot: '10A', musical: 'Bm' },
  { camelot: '11A', musical: 'F#m' },
  { camelot: '12A', musical: 'C#m' },
  { camelot: '8B', musical: 'C Maj' },
  { camelot: '9B', musical: 'G Maj' },
  { camelot: '10B', musical: 'D Maj' },
  { camelot: '11B', musical: 'A Maj' },
  { camelot: '12B', musical: 'E Maj' },
  { camelot: '1B', musical: 'B Maj' },
  { camelot: '4B', musical: 'Ab Maj' },
  { camelot: '5B', musical: 'Eb Maj' }
];

/**
 * Computes or formats stable harmonic key and tempo (BPM) for any song.
 * Uses Camelot wheel notation (e.g. "8A • Am • 124 BPM") that DJs use for harmonic mixing.
 */
export function getTrackHarmonics(
  trackId: string,
  trackTitle: string,
  explicitBpm?: number
): TrackHarmonics {
  let hash = 0;
  const str = `${trackId}:${trackTitle}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const positiveHash = Math.abs(hash);

  const bpm =
    explicitBpm && explicitBpm >= 60 && explicitBpm <= 200
      ? explicitBpm
      : 96 + (positiveHash % 38); // 96 - 134 BPM natural range

  const keyIndex = positiveHash % CAMELOT_KEYS.length;
  const keyInfo = CAMELOT_KEYS[keyIndex];

  let energy: TrackHarmonics['energy'] = 'Groove';
  if (bpm < 104) energy = 'Chill';
  else if (bpm > 124) energy = 'High Energy';
  else if (bpm > 114) energy = 'Upbeat';

  return {
    bpm,
    camelotKey: keyInfo.camelot,
    musicalKey: keyInfo.musical,
    energy
  };
}

export interface HarmonicCompatibility {
  score: number;
  label: string;
  badge: string;
  isMixable: boolean;
  type: 'perfect' | 'boost' | 'drop' | 'mood' | 'lift' | 'contrast';
}

/**
 * Evaluates the DJ Camelot Wheel harmonic transition between two songs.
 * Standard DJ harmonic rules:
 * - Same key (e.g. 8A -> 8A): 100% Harmonic Match
 * - Relative major/minor (e.g. 8A -> 8B): 96% Match (Mood shift)
 * - +1 Camelot key (e.g. 8A -> 9A): 92% Match (Energy Boost)
 * - -1 Camelot key (e.g. 8A -> 7A): 88% Match (Energy Wind-down)
 * - +2 Semitone lift (e.g. 8A -> 10A): 80% Match (Euphoric Lift)
 */
export function getHarmonicCompatibility(keyA?: string | null, keyB?: string | null): HarmonicCompatibility {
  if (!keyA || !keyB) {
    return {
      score: 85,
      label: 'Standard BPM Crossfade',
      badge: 'BPM MIX',
      isMixable: true,
      type: 'boost'
    };
  }

  if (keyA === keyB) {
    return {
      score: 100,
      label: 'Perfect Harmonic Match • Same Key Resonance',
      badge: 'PERFECT 100%',
      isMixable: true,
      type: 'perfect'
    };
  }

  const numA = parseInt(keyA, 10);
  const letterA = keyA.replace(/\d+/g, '').toUpperCase();
  const numB = parseInt(keyB, 10);
  const letterB = keyB.replace(/\d+/g, '').toUpperCase();

  if (isNaN(numA) || isNaN(numB)) {
    return {
      score: 85,
      label: 'Dynamic Auto-Mix Flow',
      badge: 'HARMONIC',
      isMixable: true,
      type: 'boost'
    };
  }

  // Relative Major <-> Minor (e.g. 8A <-> 8B)
  if (numA === numB && letterA !== letterB) {
    return {
      score: 96,
      label: 'Relative Mood Shift • Clean Harmonic Modulation',
      badge: 'MOOD SHIFT 96%',
      isMixable: true,
      type: 'mood'
    };
  }

  // Camelot clock arithmetic
  const clockwiseDiff = (numB - numA + 12) % 12;

  if (clockwiseDiff === 1 && letterA === letterB) {
    return {
      score: 93,
      label: 'Energy Boost (+1 Key) • Floor-Filling Transition',
      badge: 'ENERGY +1',
      isMixable: true,
      type: 'boost'
    };
  }

  if (clockwiseDiff === 11 && letterA === letterB) {
    return {
      score: 89,
      label: 'Deep Wind-Down (-1 Key) • Smooth Dynamic Calm',
      badge: 'WIND-DOWN',
      isMixable: true,
      type: 'drop'
    };
  }

  if (clockwiseDiff === 2 && letterA === letterB) {
    return {
      score: 82,
      label: 'Euphoric Lift (+2 Keys) • Peak-Time Festival Energy',
      badge: 'PEAK LIFT',
      isMixable: true,
      type: 'lift'
    };
  }

  return {
    score: 72,
    label: 'Dynamic Transition • Filter Sweep Crossfade Recommended',
    badge: 'DYNAMIC',
    isMixable: false,
    type: 'contrast'
  };
}
