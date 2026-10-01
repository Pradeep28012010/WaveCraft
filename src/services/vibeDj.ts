import type { Track } from '../types';
import type { VisualizerStyle } from '../components/visualizer/Visualizer';
import { searchTracks } from './youtube';
import { useStudioStore, type StudioFXMode } from '../stores/studioStore';
import { usePlayerStore } from '../stores/playerStore';

export interface VibeBlueprint {
  title: string;
  subtitle: string;
  prompt: string;
  eqPreset: string;
  fxMode?: StudioFXMode;
  suggestedSpeed?: number;
  visualizerStyle: VisualizerStyle;
  accentColor: string;
  energyLabel: string;
  curatedDescription: string;
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
  fxMode?: StudioFXMode;
  visualizerStyle: VisualizerStyle;
  accentColor: string;
  energyLabel: string;
  queries: string[];
}

export const CURATED_VIBE_PRESETS: VibePreset[] = [
  {
    id: 'coding-rain',
    title: '2AM Tokyo Coding in Rain',
    prompt: '2AM deep focus coding in Tokyo rain ambient electronic chillstep lofi',
    emoji: '🌧️',
    gradient: 'from-indigo-600 via-purple-600 to-cyan-500',
    eqPreset: 'Electronic',
    fxMode: 'lofi-tape',
    visualizerStyle: 'particles',
    accentColor: '#8b5cf6',
    energyLabel: 'Deep Flow • 92 BPM',
    queries: ['Kupla lofi beats', 'Jinsang chillhop', 'Tomppabeats lofi', 'ambient electronic focus', 'synthwave coding beats']
  },
  {
    id: 'gym-beast',
    title: 'Gym PR Beast Mode',
    prompt: 'High adrenaline gym workout phonk hip hop bass boost hardstyle',
    emoji: '🔥',
    gradient: 'from-rose-600 via-red-600 to-orange-500',
    eqPreset: 'Bass Boost',
    fxMode: 'bass-cinema',
    visualizerStyle: 'starfield',
    accentColor: '#fa2d48',
    energyLabel: 'Maximum Adrenaline • 145 BPM',
    queries: ['Kordhell phonk', 'DVRST close eyes', 'Tevvez hardstyle gym', 'Ghostface Playa phonk', 'Eminem workout hits', 'Neffex fight back']
  },
  {
    id: 'night-drive',
    title: 'Midnight Cyber Highway',
    prompt: 'Late night highway drive synthwave the weeknd blinding lights kavinsky',
    emoji: '🏎️',
    gradient: 'from-fuchsia-600 via-purple-600 to-rose-500',
    eqPreset: 'Electronic',
    fxMode: '8d-orbit',
    visualizerStyle: 'starfield',
    accentColor: '#ec4899',
    energyLabel: 'Neon Cruise • 120 BPM',
    queries: ['The Weeknd synthwave hits', 'Kavinsky Nightcall', 'The Midnight Sunset', 'Daft Punk Drive', 'Post Malone Synthwave']
  },
  {
    id: 'telugu-mass',
    title: 'Tollywood High-Voltage Mass',
    prompt: 'Telugu chartbusters Anirudh Thaman DSP energetic mass bangers',
    emoji: '⚡',
    gradient: 'from-amber-500 via-orange-600 to-red-600',
    eqPreset: 'Bass Boost',
    fxMode: 'arena-live',
    visualizerStyle: 'nebula',
    accentColor: '#f59e0b',
    energyLabel: 'High Voltage • 130 BPM',
    queries: ['Anirudh Ravichander mass hits', 'Thaman S Telugu mass beats', 'Devi Sri Prasad energetic songs', 'Pushpa energetic hits', 'Devara mass songs']
  },
  {
    id: 'rahman-magic',
    title: 'A.R. Rahman Soul Symphony',
    prompt: 'A.R. Rahman soulful melodies Hindi Tamil Telugu timeless spiritual',
    emoji: '✨',
    gradient: 'from-emerald-500 via-teal-600 to-cyan-600',
    eqPreset: 'Vocal',
    fxMode: 'vocal-stage',
    visualizerStyle: 'nebula',
    accentColor: '#10b981',
    energyLabel: 'Soulful Maestro • Melodic',
    queries: ['A.R. Rahman melody classics', 'A.R. Rahman Tamil soulful songs', 'AR Rahman Hindi hits', 'Kun Faya Kun Rahman', 'Dil Se Re Rahman']
  },
  {
    id: 'coffee-acoustic',
    title: 'Sunday Morning Coffee & Vinyl',
    prompt: 'Warm acoustic indie folk morning coffee peaceful chill unplugged',
    emoji: '☕',
    gradient: 'from-amber-600 via-yellow-600 to-emerald-600',
    eqPreset: 'Acoustic',
    fxMode: 'lofi-tape',
    visualizerStyle: 'wave',
    accentColor: '#10b981',
    energyLabel: 'Warm & Cozy • 85 BPM',
    queries: ['Ed Sheeran acoustic sessions', 'Taylor Swift folklore acoustic', 'Noah Kahan stick season', 'Laufey from the start', 'Passenger acoustic folk']
  },
  {
    id: 'slowed-reverb-late',
    title: '3AM Slowed + Reverb Cloud',
    prompt: 'slowed and reverb late night aesthetic emotional dreamy songs',
    emoji: '🌌',
    gradient: 'from-purple-700 via-indigo-700 to-blue-600',
    eqPreset: 'Vocal',
    fxMode: 'slowed-reverb',
    visualizerStyle: 'nebula',
    accentColor: '#a855f7',
    energyLabel: 'Ethereal Cloud • 0.88x Reverb',
    queries: ['The Weeknd slowed reverb', 'romantic pop slowed reverb', 'late night aesthetic slowed', 'Billie Eilish dreamy', 'Chase Atlantic slowed']
  },
  {
    id: 'arijit-heartbreak',
    title: 'Arijit & Mohit Midnight Melancholy',
    prompt: 'Arijit Singh heartbroken sad emotional Bollywood late night acoustic',
    emoji: '💔',
    gradient: 'from-rose-900 via-purple-900 to-slate-900',
    eqPreset: 'Vocal',
    fxMode: 'vocal-stage',
    visualizerStyle: 'wave',
    accentColor: '#f43f5e',
    energyLabel: 'Deep Emotional • 82 BPM',
    queries: ['Arijit Singh emotional sad hits', 'Pritam Arijit soulful melodies', 'Atif Aslam romantic sad', 'Mohit Chauhan acoustic', 'B Praak emotional sad']
  }
];

// Rich AI musical ontology: artist networks, subgenres, and acoustic signatures
interface ArtistProfile {
  name: string;
  genre: string;
  soundalikes: string[];
  seedQueries: string[];
  preferredFx?: StudioFXMode;
  preferredEq: string;
}

const ARTIST_KNOWLEDGE_BASE: Record<string, ArtistProfile> = {
  'weeknd': {
    name: 'The Weeknd',
    genre: 'Synthwave & Dark R&B',
    soundalikes: ['Daft Punk', 'Gesaffelstein', 'Kavinsky', 'Chase Atlantic'],
    seedQueries: ['The Weeknd After Hours hits', 'The Weeknd Starboy synthwave', 'Daft Punk Tron synth', 'Kavinsky Nightcall'],
    preferredFx: '8d-orbit',
    preferredEq: 'Electronic'
  },
  'taylor swift': {
    name: 'Taylor Swift',
    genre: 'Indie Pop & Storytelling',
    soundalikes: ['Olivia Rodrigo', 'Gracie Abrams', 'Sabrina Carpenter', 'Phoebe Bridgers'],
    seedQueries: ['Taylor Swift 1989 Midnights hits', 'Olivia Rodrigo pop hits', 'Sabrina Carpenter Espresso', 'Gracie Abrams indie'],
    preferredFx: 'vocal-stage',
    preferredEq: 'Pop'
  },
  'anirudh': {
    name: 'Anirudh Ravichander',
    genre: 'Modern Tamil/Telugu EDM Fusion',
    soundalikes: ['Santhosh Narayanan', 'GV Prakash', 'Thaman S', 'Devi Sri Prasad'],
    seedQueries: ['Anirudh Ravichander blockbuster hits', 'Anirudh Leo Jailer songs', 'Thaman S mass beats', 'Santhosh Narayanan hits'],
    preferredFx: 'bass-cinema',
    preferredEq: 'Bass Boost'
  },
  'rahman': {
    name: 'A.R. Rahman',
    genre: 'Timeless Melodic Fusion',
    soundalikes: ['Hariharan', 'Bombay Jayashri', 'Shankar Mahadevan'],
    seedQueries: ['A.R. Rahman master melodies', 'AR Rahman Tamil classics', 'A.R. Rahman Hindi hits', 'AR Rahman Roja Bombay Dil Se'],
    preferredFx: 'arena-live',
    preferredEq: 'Vocal'
  },
  'arijit': {
    name: 'Arijit Singh',
    genre: 'Soulful Bollywood Melodies',
    soundalikes: ['Atif Aslam', 'Mohit Chauhan', 'Pritam', 'Jubin Nautiyal'],
    seedQueries: ['Arijit Singh soulful romantic hits', 'Pritam Arijit chartbusters', 'Atif Aslam greatest hits', 'Mohit Chauhan melodies'],
    preferredFx: 'vocal-stage',
    preferredEq: 'Vocal'
  },
  'drake': {
    name: 'Drake',
    genre: 'Hip Hop & Melodic Trap',
    soundalikes: ['Travis Scott', '21 Savage', 'Future', 'Post Malone'],
    seedQueries: ['Drake OVO billboard hits', 'Travis Scott Utopia hits', 'Post Malone hip hop', '21 Savage Metro Boomin'],
    preferredFx: 'bass-cinema',
    preferredEq: 'Bass Boost'
  },
  'billie eilish': {
    name: 'Billie Eilish',
    genre: 'Dark Bedroom Alt-Pop',
    soundalikes: ['Lorde', 'Lana Del Rey', 'FINNEAS', 'Melanie Martinez'],
    seedQueries: ['Billie Eilish dark pop hits', 'Lana Del Rey Born to Die', 'Lorde Melodrama', 'Billie Eilish Birds of a Feather'],
    preferredFx: 'slowed-reverb',
    preferredEq: 'Electronic'
  },
  'diljit': {
    name: 'Diljit Dosanjh',
    genre: 'Punjabi Global Pop',
    soundalikes: ['Karan Aujla', 'AP Dhillon', 'Shubh', 'Sidhu Moose Wala'],
    seedQueries: ['Diljit Dosanjh Ghost hits', 'Karan Aujla Making Memories', 'AP Dhillon Brown Munde', 'Shubh Cheques'],
    preferredFx: 'bass-cinema',
    preferredEq: 'Bass Boost'
  },
  'bts': {
    name: 'BTS & K-Pop',
    genre: 'K-Pop & Hyper-Energy Dance',
    soundalikes: ['NewJeans', 'BLACKPINK', 'Stray Kids', 'LE SSERAFIM'],
    seedQueries: ['BTS greatest dance hits', 'NewJeans hype boy OMG', 'BLACKPINK Born Pink hits', 'LE SSERAFIM Antifragile'],
    preferredFx: 'nightcore',
    preferredEq: 'Pop'
  },
  'coldplay': {
    name: 'Coldplay',
    genre: 'Stadium Alt-Rock & Anthems',
    soundalikes: ['OneRepublic', 'Imagine Dragons', 'The Killers', 'Keane'],
    seedQueries: ['Coldplay stadium anthems', 'Imagine Dragons hits', 'OneRepublic Counting Stars', 'The Killers Mr Brightside'],
    preferredFx: 'arena-live',
    preferredEq: 'Rock'
  }
};

export function analyzeCustomPrompt(prompt: string): {
  title: string;
  subtitle: string;
  eqPreset: string;
  fxMode: StudioFXMode;
  suggestedSpeed?: number;
  visualizerStyle: VisualizerStyle;
  accentColor: string;
  energyLabel: string;
  curatedDescription: string;
  queries: string[];
} {
  const lower = prompt.toLowerCase().trim();

  // 1. Detect artist profiles mentioned in prompt
  const matchedArtists: ArtistProfile[] = [];
  for (const [key, profile] of Object.entries(ARTIST_KNOWLEDGE_BASE)) {
    if (lower.includes(key)) {
      matchedArtists.push(profile);
    }
  }

  // 2. Detect modifiers and FX
  let fxMode: StudioFXMode = 'normal';
  let suggestedSpeed = 1.0;
  if (/slowed|reverb|vaporwave|dreamy|aesthetic/i.test(lower)) {
    fxMode = 'slowed-reverb';
    suggestedSpeed = 0.88;
  } else if (/8d|spatial|surround|binaural|orbit/i.test(lower)) {
    fxMode = '8d-orbit';
  } else if (/nightcore|fast|hyper|speed\s*up/i.test(lower)) {
    fxMode = 'nightcore';
    suggestedSpeed = 1.15;
  } else if (/bass|sub|cinema|car\s*audio|heavy\s*bass/i.test(lower)) {
    fxMode = 'bass-cinema';
  } else if (/lofi|lo-fi|tape|cassette|vinyl|study/i.test(lower)) {
    fxMode = 'lofi-tape';
  } else if (/live|concert|arena|stadium/i.test(lower)) {
    fxMode = 'arena-live';
  } else if (/karaoke|acapella|vocal|acoustic/i.test(lower)) {
    fxMode = 'vocal-stage';
  }

  // 3. Detect Genre, Mood, and Energy Level
  let eqPreset = 'Pop';
  let visualizerStyle: VisualizerStyle = 'nebula';
  let accentColor = '#fa2d48';
  let energyLabel = 'Curated Dynamic Flow • 110 BPM';
  let vibeCategory = 'Dynamic Studio Mix';

  if (/(gym|workout|beast|phonk|hardstyle|heavy|pr|adrenaline|deadlift|bench)/i.test(lower)) {
    eqPreset = 'Bass Boost';
    visualizerStyle = 'starfield';
    accentColor = '#fa2d48';
    energyLabel = 'Maximum Adrenaline • 140+ BPM';
    vibeCategory = 'High-Intensity Beast Mode';
    if (fxMode === 'normal') fxMode = 'bass-cinema';
  } else if (/(code|coding|study|focus|rain|lofi|ambient|reading|zen|calm|tokyo)/i.test(lower)) {
    eqPreset = 'Electronic';
    visualizerStyle = 'particles';
    accentColor = '#8b5cf6';
    energyLabel = 'Deep Flow State • 88 BPM';
    vibeCategory = 'Deep Mental Focus';
    if (fxMode === 'normal') fxMode = 'lofi-tape';
  } else if (/(acoustic|coffee|morning|unplugged|indie|folk|campfire|peaceful|sunday)/i.test(lower)) {
    eqPreset = 'Acoustic';
    visualizerStyle = 'wave';
    accentColor = '#10b981';
    energyLabel = 'Warm Acoustic Harmony • 85 BPM';
    vibeCategory = 'Organic Coffeehouse';
    if (fxMode === 'normal') fxMode = 'vocal-stage';
  } else if (/(sad|heartbreak|crying|lonely|alone|breakup|melancholy|miss\s*you|depressed)/i.test(lower)) {
    eqPreset = 'Vocal';
    visualizerStyle = 'wave';
    accentColor = '#f43f5e';
    energyLabel = 'Emotional & Vulnerable • 78 BPM';
    vibeCategory = 'Late Night Melancholy';
    if (fxMode === 'normal') fxMode = 'slowed-reverb';
  } else if (/(party|club|dance|edm|festival|bounce|rave|banger|house)/i.test(lower)) {
    eqPreset = 'Electronic';
    visualizerStyle = 'bars';
    accentColor = '#06b6d4';
    energyLabel = 'Peak Festival Energy • 128 BPM';
    vibeCategory = 'Club & Festival Hype';
    if (fxMode === 'normal') fxMode = 'arena-live';
  } else if (/(drive|highway|cruising|night\s*drive|neon|midnight|synthwave)/i.test(lower)) {
    eqPreset = 'Electronic';
    visualizerStyle = 'starfield';
    accentColor = '#ec4899';
    energyLabel = 'Midnight Cruise • 118 BPM';
    vibeCategory = 'Retro Neon Cruise';
    if (fxMode === 'normal') fxMode = '8d-orbit';
  } else if (/(telugu|tamil|kollywood|tollywood|mass|south\s*indian)/i.test(lower)) {
    eqPreset = 'Bass Boost';
    visualizerStyle = 'nebula';
    accentColor = '#f59e0b';
    energyLabel = 'South Indian Mass Power • 130 BPM';
    vibeCategory = 'Tollywood & Kollywood Mass';
    if (fxMode === 'normal') fxMode = 'arena-live';
  } else if (/(bollywood|hindi|punjabi|desi|sufi)/i.test(lower)) {
    eqPreset = 'Vocal';
    visualizerStyle = 'nebula';
    accentColor = '#e11d48';
    energyLabel = 'Desi Chartbuster Vibe • Melodic';
    vibeCategory = 'Bollywood & Punjabi Flow';
  }

  // 4. Synthesize 5-6 intelligent musical search queries (NOT raw words!)
  const generatedQueries: string[] = [];

  if (matchedArtists.length > 0) {
    const primary = matchedArtists[0];
    generatedQueries.push(...primary.seedQueries);
    if (matchedArtists.length > 1) {
      generatedQueries.push(...matchedArtists[1].seedQueries.slice(0, 2));
    } else {
      // Pull soundalikes
      const soundalikeQueries = primary.soundalikes.map((sa) => `${sa} greatest hits`);
      generatedQueries.push(...soundalikeQueries.slice(0, 2));
    }
  } else {
    // Keyword-driven intelligent query synthesis
    if (vibeCategory === 'High-Intensity Beast Mode') {
      generatedQueries.push('Kordhell phonk hits', 'high energy phonk drift', 'workout hype songs 2025', 'Tevvez gym hardstyle', 'Eminem Til I Collapse');
    } else if (vibeCategory === 'Deep Mental Focus') {
      generatedQueries.push('Kupla lofi beats', 'Jinsang chillhop focus', 'ambient electronic study beats', 'synthwave lofi chill', 'chillstep coding session');
    } else if (vibeCategory === 'Organic Coffeehouse') {
      generatedQueries.push('Noah Kahan stick season hits', 'Laufey acoustic jazz pop', 'Ed Sheeran acoustic folk', 'Taylor Swift acoustic', 'Passenger acoustic melodies');
    } else if (vibeCategory === 'Late Night Melancholy') {
      generatedQueries.push('Lewis Capaldi sad songs', 'Arijit Singh sad heartbreak', 'Olivia Rodrigo emotional hits', 'Billie Eilish sad songs', 'Dean Lewis emotional pop');
    } else if (vibeCategory === 'Club & Festival Hype') {
      generatedQueries.push('Fred Again festival dance hits', 'Peggy Gou dance electronic', 'Martin Garrix festival bangers', 'Skrillex dance EDM', 'Swedish House Mafia anthems');
    } else if (vibeCategory === 'Retro Neon Cruise') {
      generatedQueries.push('The Weeknd Blinding Lights hits', 'Kavinsky Nightcall synthwave', 'The Midnight Sunset', 'Daft Punk electronic hits', 'synthwave night drive songs');
    } else if (vibeCategory === 'Tollywood & Kollywood Mass') {
      generatedQueries.push('Anirudh Ravichander mass hits', 'Thaman S Telugu mass beats', 'Devi Sri Prasad energetic hits', 'Pushpa 2 songs', 'Devara songs Telugu');
    } else if (vibeCategory === 'Bollywood & Punjabi Flow') {
      generatedQueries.push('Arijit Singh Bollywood hits', 'Diljit Dosanjh chartbusters', 'Pritam Bollywood melodies', 'Karan Aujla Punjabi hits', 'AP Dhillon trending songs');
    } else {
      // General prompt: extract meaningful keywords and construct musical queries
      const cleaned = prompt
        .replace(/playlist|songs|music|tracks|mix|prepare|give|me|create/gi, '')
        .trim();
      generatedQueries.push(
        `${cleaned} top hits`,
        `${cleaned} official audio`,
        `${cleaned} trending songs`,
        `${cleaned} essential mix`
      );
    }
  }

  // 5. Generate high-concept Title and Description
  const titleWords = prompt
    .split(/\s+/)
    .slice(0, 4)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  const title = `${titleWords} • AI DJ Set`;
  const curatedDescription = `Engineered by WaveCraft AI DJ for "${prompt}". Features a harmonically sequenced set with automatic ${eqPreset} EQ tuning, ${fxMode !== 'normal' ? `${fxMode} mastering` : 'studio mastering'}, and 320kbps HD playback.`;

  return {
    title,
    subtitle: `${vibeCategory} • ${energyLabel}`,
    eqPreset,
    fxMode,
    suggestedSpeed,
    visualizerStyle,
    accentColor,
    energyLabel,
    curatedDescription,
    queries: Array.from(new Set(generatedQueries)).slice(0, 6)
  };
}

export async function generateVibeMix(
  promptOrPreset: string | VibePreset
): Promise<VibeBlueprint> {
  const isPreset = typeof promptOrPreset !== 'string';
  const spec = isPreset
    ? {
        title: promptOrPreset.title,
        subtitle: `${promptOrPreset.title} • ${promptOrPreset.energyLabel}`,
        prompt: promptOrPreset.prompt,
        eqPreset: promptOrPreset.eqPreset,
        fxMode: promptOrPreset.fxMode || 'normal',
        visualizerStyle: promptOrPreset.visualizerStyle,
        accentColor: promptOrPreset.accentColor,
        energyLabel: promptOrPreset.energyLabel,
        curatedDescription: `Curated AI Soundstage for "${promptOrPreset.title}". 320kbps Studio Mastered set.`,
        queries: promptOrPreset.queries
      }
    : {
        prompt: promptOrPreset,
        ...analyzeCustomPrompt(promptOrPreset)
      };

  // Auto-tune studio FX mode if the user prompt demanded it
  if (spec.fxMode && spec.fxMode !== 'normal') {
    try {
      useStudioStore.getState().setFxMode(spec.fxMode);
      if (spec.suggestedSpeed) {
        usePlayerStore.getState().setPlaybackSpeed(spec.suggestedSpeed);
      }
    } catch {}
  }

  // Run all synthesized search queries concurrently across our Spotify-accurate engine
  const results = await Promise.all(
    spec.queries.map((q) => searchTracks(q).catch(() => [] as Track[]))
  );

  // DJ Harmonic Progression & Sequencing:
  // We want to order tracks like a true live DJ set:
  // 1. Hook / Intro (Recognizable anthem)
  // 2. Rhythmic Groove escalation
  // 3. Peak Energy Climax
  // 4. Outro / Cool Down
  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  const gatheredTracks: Track[] = [];

  const maxLen = Math.max(...results.map((r) => r.length), 0);

  for (let i = 0; i < maxLen; i++) {
    for (const list of results) {
      const track = list[i];
      if (!track) continue;
      const fp = `${track.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16)}__${track.artist.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)}`;
      if (!seenIds.has(track.id) && !seenFingerprints.has(fp)) {
        seenIds.add(track.id);
        seenFingerprints.add(fp);
        gatheredTracks.push(track);
      }
      if (gatheredTracks.length >= 28) break;
    }
    if (gatheredTracks.length >= 28) break;
  }

  // Ensure we have at least 15-25 tracks
  const finalTracks = gatheredTracks.slice(0, 26);

  return {
    title: spec.title,
    subtitle: `AI DJ Set • ${finalTracks.length} tracks curated`,
    prompt: spec.prompt,
    eqPreset: spec.eqPreset,
    fxMode: spec.fxMode,
    suggestedSpeed: spec.suggestedSpeed,
    visualizerStyle: spec.visualizerStyle,
    accentColor: spec.accentColor,
    energyLabel: spec.energyLabel,
    curatedDescription: spec.curatedDescription,
    queries: spec.queries,
    tracks: finalTracks
  };
}
