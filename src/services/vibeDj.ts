import type { Track } from '../types';
import type { VisualizerStyle } from '../components/visualizer/Visualizer';
import { searchTracks } from './youtube';

export interface VibeBlueprint {
  title: string;
  subtitle: string;
  prompt: string;
  eqPreset: string;
  visualizerStyle: VisualizerStyle;
  accentColor: string;
  energyLabel: string;
  queries: string[];
  tracks: Track[];
}

export interface VibePreset {
  id: string;
  title: string;
  prompt: string;
  emoji: string;
  gradient: string;
  eqPreset: string;
  visualizerStyle: VisualizerStyle;
  accentColor: string;
  energyLabel: string;
  queries: string[];
}

export const CURATED_VIBE_PRESETS: VibePreset[] = [
  {
    id: 'coding-rain',
    title: '2AM Coding in Rain',
    prompt: '2AM deep focus coding in Tokyo rain ambient electronic chillstep',
    emoji: '🌧️',
    gradient: 'from-indigo-600 via-purple-600 to-cyan-500',
    eqPreset: 'Electronic',
    visualizerStyle: 'particles',
    accentColor: '#8b5cf6',
    energyLabel: 'Deep Flow • 95 BPM',
    queries: ['chillstep coding music', 'lofi rain beats study', 'ambient electronic focus']
  },
  {
    id: 'gym-beast',
    title: 'Gym PR Beast Mode',
    prompt: 'High adrenaline gym workout phonk hip hop bass boost',
    emoji: '🔥',
    gradient: 'from-rose-600 via-red-600 to-orange-500',
    eqPreset: 'Bass Boost',
    visualizerStyle: 'starfield',
    accentColor: '#fa2d48',
    energyLabel: 'Maximum Adrenaline • 140 BPM',
    queries: ['workout phonk hits', 'gym hype songs', 'high energy bass workout']
  },
  {
    id: 'night-drive',
    title: 'Midnight Highway Drive',
    prompt: 'Late night highway drive synthwave the weeknd blinding lights',
    emoji: '🏎️',
    gradient: 'from-fuchsia-600 via-purple-600 to-rose-500',
    eqPreset: 'Electronic',
    visualizerStyle: 'starfield',
    accentColor: '#ec4899',
    energyLabel: 'Neon Cruise • 118 BPM',
    queries: ['the weeknd hits', 'night drive synthwave songs', 'late night pop hits']
  },
  {
    id: 'telugu-mass',
    title: 'Tollywood Mass & Vibe',
    prompt: 'Telugu chartbusters Anirudh Thaman DSP energetic hits',
    emoji: '⚡',
    gradient: 'from-amber-500 via-orange-600 to-red-600',
    eqPreset: 'Bass Boost',
    visualizerStyle: 'nebula',
    accentColor: '#f59e0b',
    energyLabel: 'High Voltage • 128 BPM',
    queries: ['Telugu latest hit songs', 'Anirudh Ravichander hits', 'Thaman S Telugu hits']
  },
  {
    id: 'rahman-magic',
    title: 'AR Rahman Timeless Soul',
    prompt: 'A.R. Rahman soulful melodies Hindi Tamil Telugu classics',
    emoji: '✨',
    gradient: 'from-emerald-500 via-teal-600 to-cyan-600',
    eqPreset: 'Vocal',
    visualizerStyle: 'nebula',
    accentColor: '#10b981',
    energyLabel: 'Soulful Maestro • Melodic',
    queries: ['A.R. Rahman melody hits', 'A.R. Rahman best songs', 'AR Rahman soulful hits']
  },
  {
    id: 'coffee-acoustic',
    title: 'Sunday Morning Coffee',
    prompt: 'Warm acoustic indie folk morning coffee peaceful chill',
    emoji: '☕',
    gradient: 'from-amber-600 via-yellow-600 to-emerald-600',
    eqPreset: 'Acoustic',
    visualizerStyle: 'wave',
    accentColor: '#10b981',
    energyLabel: 'Warm & Cozy • 88 BPM',
    queries: ['acoustic morning coffee songs', 'indie folk chill hits', 'ed sheeran acoustic']
  }
];

function analyzeCustomPrompt(prompt: string): {
  title: string;
  eqPreset: string;
  visualizerStyle: VisualizerStyle;
  accentColor: string;
  energyLabel: string;
  queries: string[];
} {
  const lower = prompt.toLowerCase();

  let eqPreset = 'Pop';
  let visualizerStyle: VisualizerStyle = 'nebula';
  let accentColor = '#fa2d48';
  let energyLabel = 'Adaptive Flow • Studio Mix';

  if (/(gym|workout|beast|phonk|bass|mass|hype|party|dance|club|pr)/.test(lower)) {
    eqPreset = 'Bass Boost';
    visualizerStyle = 'starfield';
    accentColor = '#fa2d48';
    energyLabel = 'High Energy • Bass Boosted';
  } else if (/(code|coding|study|focus|rain|lofi|ambient|sleep|zen|calm|night)/.test(lower)) {
    eqPreset = 'Electronic';
    visualizerStyle = 'particles';
    accentColor = '#8b5cf6';
    energyLabel = 'Deep Focus • Spatial Flow';
  } else if (/(acoustic|coffee|morning|unplugged|guitar|peaceful|chill|sunset)/.test(lower)) {
    eqPreset = 'Acoustic';
    visualizerStyle = 'wave';
    accentColor = '#10b981';
    energyLabel = 'Warm Acoustic • Organic';
  } else if (/(sad|heartbreak|melody|love|romantic|soul|vocal|rahman|arijit|sid sriram)/.test(lower)) {
    eqPreset = 'Vocal';
    visualizerStyle = 'nebula';
    accentColor = '#ec4899';
    energyLabel = 'Emotional & Melodic • Vocal Forward';
  } else if (/(rock|metal|indie|band|guitar)/.test(lower)) {
    eqPreset = 'Rock';
    visualizerStyle = 'bars';
    accentColor = '#f59e0b';
    energyLabel = 'Live Stadium • Punchy';
  } else if (/(drive|highway|synth|cyber|neon|weeknd|retro)/.test(lower)) {
    eqPreset = 'Electronic';
    visualizerStyle = 'starfield';
    accentColor = '#3b82f6';
    energyLabel = 'Midnight Cruise • 3D Warp';
  }

  // Build 3 smart complementary search queries from the prompt
  const cleanPrompt = prompt.trim();
  const queries = [
    cleanPrompt,
    `${cleanPrompt} hits`,
    `${cleanPrompt} best songs`
  ];

  const words = cleanPrompt
    .split(/\s+/)
    .slice(0, 4)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return {
    title: `${words} Mix`,
    eqPreset,
    visualizerStyle,
    accentColor,
    energyLabel,
    queries
  };
}

export async function generateVibeMix(
  promptOrPreset: string | VibePreset
): Promise<VibeBlueprint> {
  const spec =
    typeof promptOrPreset === 'string'
      ? {
          prompt: promptOrPreset,
          ...analyzeCustomPrompt(promptOrPreset)
        }
      : {
          title: promptOrPreset.title,
          prompt: promptOrPreset.prompt,
          eqPreset: promptOrPreset.eqPreset,
          visualizerStyle: promptOrPreset.visualizerStyle,
          accentColor: promptOrPreset.accentColor,
          energyLabel: promptOrPreset.energyLabel,
          queries: promptOrPreset.queries
        };

  // Run all sub-queries concurrently
  const results = await Promise.all(
    spec.queries.map((q) => searchTracks(q).catch(() => [] as Track[]))
  );

  // Interleave & deduplicate tracks for variety
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const interleaved: Track[] = [];
  const maxLen = Math.max(...results.map((r) => r.length), 0);

  for (let i = 0; i < maxLen; i++) {
    for (const list of results) {
      const track = list[i];
      if (!track) continue;
      const normKey = `${track.title.toLowerCase().slice(0, 18)}|${track.artist
        .toLowerCase()
        .slice(0, 12)}`;
      if (!seenIds.has(track.id) && !seenTitles.has(normKey)) {
        seenIds.add(track.id);
        seenTitles.add(normKey);
        interleaved.push(track);
      }
      if (interleaved.length >= 24) break;
    }
    if (interleaved.length >= 24) break;
  }

  return {
    title: spec.title,
    subtitle: `AI Vibe Flow • ${interleaved.length} tracks curated`,
    prompt: spec.prompt,
    eqPreset: spec.eqPreset,
    visualizerStyle: spec.visualizerStyle,
    accentColor: spec.accentColor,
    energyLabel: spec.energyLabel,
    queries: spec.queries,
    tracks: interleaved
  };
}
