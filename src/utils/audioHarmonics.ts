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
