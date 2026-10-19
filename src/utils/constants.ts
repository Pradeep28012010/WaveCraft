import type { Track } from '../types';

export const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.jing.rocks',
  'https://vid.puffyan.us'
];

export const LYRICS_API = 'https://api.lyrics.ovh/v1';

export const DEFAULT_THUMBNAIL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Cdefs%3E%3ClinearGradient id='grad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23311042' /%3E%3Cstop offset='100%25' stop-color='%230f172a' /%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='400' fill='url(%23grad)' /%3E%3Ccircle cx='200' cy='200' r='64' fill='none' stroke='%23a855f7' stroke-width='8' opacity='0.5'/%3E%3Ccircle cx='200' cy='200' r='20' fill='%23a855f7' opacity='0.7'/%3E%3C/svg%3E";

export const GENRE_LIST = [
  { id: 'pop', name: 'Pop Hits', sub: 'Global Charts & Viral Anthems', query: 'top pop hits songs', colors: ['#ec4899', '#8b5cf6'], colorClass: 'bg-gradient-to-br from-pink-500/85 via-rose-500/75 to-purple-800/85', emoji: '🎤' },
  { id: 'hiphop', name: 'Hip-Hop & Rap', sub: '808 Bass & Heavy Flow', query: 'hip hop rap hits', colors: ['#f59e0b', '#ea580c'], colorClass: 'bg-gradient-to-br from-amber-500/85 via-orange-600/75 to-red-800/85', emoji: '🔥' },
  { id: 'bollywood', name: 'Bollywood & Hindi', sub: 'Melodies, Romance & Desi Energy', query: 'latest bollywood hindi hits', colors: ['#10b981', '#059669'], colorClass: 'bg-gradient-to-br from-emerald-500/85 via-teal-600/75 to-cyan-800/85', emoji: '✨' },
  { id: 'telugu', name: 'Telugu & South Cinema', sub: 'Mass Anthems & Anirudh Beats', query: 'latest telugu tamil hit songs anirudh', colors: ['#6366f1', '#4f46e5'], colorClass: 'bg-gradient-to-br from-indigo-500/85 via-purple-600/75 to-slate-900/85', emoji: '🎬' },
  { id: 'electronic', name: 'EDM & Electronic', sub: 'Festival Bass & Club Nights', query: 'electronic dance edm hits', colors: ['#06b6d4', '#3b82f6'], colorClass: 'bg-gradient-to-br from-cyan-400/85 via-blue-600/75 to-indigo-900/85', emoji: '⚡' },
  { id: 'rock', name: 'Rock & Metal Classics', sub: 'Electric Riffs, Solos & Legends', query: 'rock classics hits', colors: ['#ef4444', '#991b1b'], colorClass: 'bg-gradient-to-br from-red-500/85 via-rose-700/75 to-zinc-900/85', emoji: '🎸' },
  { id: 'rnb', name: 'R&B & Midnight Soul', sub: 'Smooth Vocals & Late Night Moods', query: 'rnb soul chill hits the weeknd', colors: ['#a855f7', '#6366f1'], colorClass: 'bg-gradient-to-br from-purple-500/85 via-fuchsia-600/75 to-indigo-950/85', emoji: '🌙' },
  { id: 'lofi', name: 'Lo-Fi Chill & Study', sub: 'Aesthetic Beats & Relaxing Flow', query: 'lofi chill beats aesthetic', colors: ['#14b8a6', '#0f766e'], colorClass: 'bg-gradient-to-br from-teal-400/85 via-emerald-600/75 to-slate-900/85', emoji: '☕' },
  { id: 'phonk', name: 'Gym Phonk & Adrenaline', sub: 'High BPM Drift & Workout Motivation', query: 'workout gym motivation phonk hits', colors: ['#9333ea', '#dc2626'], colorClass: 'bg-gradient-to-br from-violet-600/85 via-red-600/75 to-zinc-950/85', emoji: '💪' },
  { id: 'acoustic', name: 'Acoustic & Golden Hour', sub: 'Warm Guitars & Unplugged Vocals', query: 'acoustic guitar indie folk hits', colors: ['#f59e0b', '#b45309'], colorClass: 'bg-gradient-to-br from-amber-400/85 via-rose-500/75 to-orange-800/85', emoji: '🌅' },
  { id: 'punjabi', name: 'Punjabi Wave', sub: 'Diljit, AP Dhillon & Urban Desi', query: 'punjabi hits diljit dosanjh', colors: ['#eab308', '#c2410c'], colorClass: 'bg-gradient-to-br from-yellow-500/85 via-amber-600/75 to-red-800/85', emoji: '🪕' },
  { id: 'tamil', name: 'Tamil & Kollywood', sub: 'AR Rahman, Anirudh & Yuvan', query: 'tamil latest hit songs anirudh rahman', colors: ['#3b82f6', '#4338ca'], colorClass: 'bg-gradient-to-br from-blue-500/85 via-indigo-600/75 to-violet-900/85', emoji: '🎺' },
  { id: 'synthwave', name: 'Retro & 80s Synthwave', sub: 'Cyberpunk Basslines & Neon Drive', query: 'synthwave retro 80s electronic weeknd', colors: ['#d946ef', '#701a75'], colorClass: 'bg-gradient-to-br from-fuchsia-500/85 via-pink-600/75 to-purple-950/85', emoji: '🌆' },
  { id: 'classical', name: 'Cinema Score & Orchestral', sub: 'Epic Symphonies & Modern Soundtracks', query: 'epic cinematic orchestral music', colors: ['#78716c', '#44403c'], colorClass: 'bg-gradient-to-br from-stone-500/85 via-amber-900/75 to-stone-950/85', emoji: '🎻' },
  { id: 'indie', name: 'Indie & Alternative', sub: 'Dreamy Bedroom Pop & Hidden Gems', query: 'indie alternative bedroom pop hits', colors: ['#0d9488', '#1e293b'], colorClass: 'bg-gradient-to-br from-teal-500/85 via-cyan-700/75 to-slate-900/85', emoji: '🎧' },
  { id: 'ambient', name: 'Ambient & Deep Sleep', sub: 'Binaural Waves & Pure Meditation', query: 'ambient space sleep meditation music', colors: ['#475569', '#0f172a'], colorClass: 'bg-gradient-to-br from-slate-600/85 via-indigo-900/75 to-black/85', emoji: '🌌' },
];

export type TimePhase = 'morning' | 'afternoon' | 'evening' | 'late_night';

export interface MoodPlaylist {
  id: string;
  name: string;
  sub: string;
  query: string;
  searchQuery: string;
  gradient: [string, string];
  colorClass: string;
  emoji: string;
  glowColor: string;
  accentColor: string;
  bgGradient: string;
  bpmRange: string;
  telemetryTag: string;
  bestTimeSlots: TimePhase[];
  timePhaseLabel: Partial<Record<TimePhase, string>>;
  seedKeywords: string[];
}

export function getCurrentTimePhase(): TimePhase {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'late_night';
}

export const MOOD_PLAYLISTS: MoodPlaylist[] = [
  {
    id: 'chill',
    name: 'Chill Vibes',
    sub: 'Unwind & relax in pure glass',
    query: 'chill vibes relax hits',
    searchQuery: 'chill vibes relax hits',
    gradient: ['#06b6d4', '#3b82f6'],
    colorClass: 'from-cyan-950/80 via-blue-950/70 to-slate-950/90 border-cyan-500/25',
    emoji: '😌',
    glowColor: '#06b6d4',
    accentColor: '#38bdf8',
    bgGradient: 'linear-gradient(135deg, rgba(6,182,212,0.24) 0%, rgba(37,99,235,0.18) 50%, rgba(15,23,42,0.85) 100%)',
    bpmRange: '70–85 BPM',
    telemetryTag: 'Lo-Fi Flow',
    bestTimeSlots: ['morning', 'evening', 'late_night'],
    timePhaseLabel: {
      morning: '☀️ Morning Wind-Down',
      evening: '🌆 Evening Unwind',
      late_night: '🌙 Midnight Chill'
    },
    seedKeywords: ['chill', 'relax', 'lofi', 'rnb', 'ambient', 'acoustic', 'unwind']
  },
  {
    id: 'focus',
    name: 'Deep Focus',
    sub: 'Flow state, binaural & coding beats',
    query: 'lofi study focus instrumental beats',
    searchQuery: 'lofi study focus instrumental',
    gradient: ['#10b981', '#06b6d4'],
    colorClass: 'from-emerald-950/80 via-teal-950/70 to-slate-950/90 border-emerald-500/25',
    emoji: '🧠',
    glowColor: '#10b981',
    accentColor: '#34d399',
    bgGradient: 'linear-gradient(135deg, rgba(16,185,129,0.24) 0%, rgba(13,148,136,0.18) 50%, rgba(15,23,42,0.85) 100%)',
    bpmRange: '80–105 BPM',
    telemetryTag: 'Theta 432Hz',
    bestTimeSlots: ['morning', 'afternoon'],
    timePhaseLabel: {
      morning: '☕ Morning Focus',
      afternoon: '🧠 Peak Flow State'
    },
    seedKeywords: ['focus', 'study', 'coding', 'beats', 'instrumental', 'piano', 'lofi']
  },
  {
    id: 'workout',
    name: 'Beast Mode',
    sub: 'High-octane gym motivation & phonk',
    query: 'workout gym motivation Phonk hits',
    searchQuery: 'workout gym motivation hits',
    gradient: ['#ef4444', '#f97316'],
    colorClass: 'from-rose-950/80 via-red-950/70 to-zinc-950/90 border-rose-500/25',
    emoji: '💪',
    glowColor: '#ef4444',
    accentColor: '#f87171',
    bgGradient: 'linear-gradient(135deg, rgba(239,68,68,0.26) 0%, rgba(225,29,72,0.20) 50%, rgba(24,24,27,0.85) 100%)',
    bpmRange: '140–175 BPM',
    telemetryTag: 'High Adrenaline',
    bestTimeSlots: ['morning', 'afternoon', 'evening'],
    timePhaseLabel: {
      morning: '⚡ Dawn Workout',
      afternoon: '🔥 Midday Boost',
      evening: '💥 Evening Iron'
    },
    seedKeywords: ['workout', 'gym', 'phonk', 'hip hop', 'trap', 'rock', 'motivation', 'beast']
  },
  {
    id: 'party',
    name: 'Night Drive',
    sub: 'Late night synth, neon bass & echoes',
    query: 'night drive synthwave weeknd after hours',
    searchQuery: 'night drive weeknd hits',
    gradient: ['#a855f7', '#ec4899'],
    colorClass: 'from-purple-950/80 via-fuchsia-950/70 to-slate-950/90 border-purple-500/25',
    emoji: '🌃',
    glowColor: '#a855f7',
    accentColor: '#c084fc',
    bgGradient: 'linear-gradient(135deg, rgba(168,85,247,0.26) 0%, rgba(217,70,239,0.20) 50%, rgba(15,23,42,0.85) 100%)',
    bpmRange: '105–125 BPM',
    telemetryTag: 'Retro Synth',
    bestTimeSlots: ['evening', 'late_night'],
    timePhaseLabel: {
      evening: '🌆 Sunset Drive',
      late_night: '🌙 Midnight Highway'
    },
    seedKeywords: ['synthwave', 'synth', 'retro', 'electronic', 'weeknd', 'night drive', 'cyberpunk']
  },
  {
    id: 'party-hits',
    name: 'Party Anthems',
    sub: 'Turn up the club bass & floor hits',
    query: 'party dance club hits',
    searchQuery: 'party dance club hits',
    gradient: ['#f59e0b', '#ef4444'],
    colorClass: 'from-amber-950/80 via-orange-950/70 to-zinc-950/90 border-amber-500/25',
    emoji: '🎉',
    glowColor: '#f59e0b',
    accentColor: '#fbbf24',
    bgGradient: 'linear-gradient(135deg, rgba(245,158,11,0.26) 0%, rgba(234,88,12,0.20) 50%, rgba(24,24,27,0.85) 100%)',
    bpmRange: '124–130 BPM',
    telemetryTag: 'Club Bass',
    bestTimeSlots: ['evening', 'late_night'],
    timePhaseLabel: {
      evening: '✨ Weekend Vibe',
      late_night: '🔥 Peak Club Energy'
    },
    seedKeywords: ['party', 'dance', 'club', 'edm', 'house', 'festival', 'bass']
  },
  {
    id: 'romantic',
    name: 'Golden Hour',
    sub: 'Warm acoustic guitars & indie love',
    query: 'romantic acoustic love songs hits',
    searchQuery: 'romantic love songs hits',
    gradient: ['#fb7185', '#f97316'],
    colorClass: 'from-rose-950/80 via-pink-950/70 to-zinc-950/90 border-rose-400/25',
    emoji: '🌅',
    glowColor: '#fb7185',
    accentColor: '#fda4af',
    bgGradient: 'linear-gradient(135deg, rgba(251,113,133,0.24) 0%, rgba(244,63,94,0.18) 50%, rgba(24,24,27,0.85) 100%)',
    bpmRange: '90–115 BPM',
    telemetryTag: 'Acoustic Warmth',
    bestTimeSlots: ['morning', 'evening'],
    timePhaseLabel: {
      morning: '☀️ Sunrise Acoustic',
      evening: '🌅 Sunset Glow'
    },
    seedKeywords: ['acoustic', 'romantic', 'love', 'guitar', 'unplugged', 'indie', 'golden hour']
  },
  {
    id: 'coffee',
    name: 'Cozy Coffeehouse',
    sub: 'Acoustic folk, jazz cafe & rain',
    query: 'cozy coffee shop acoustic jazz rain beats',
    searchQuery: 'coffee shop acoustic chill',
    gradient: ['#d97706', '#78350f'],
    colorClass: 'from-amber-950/80 via-stone-900/70 to-stone-950/90 border-amber-600/25',
    emoji: '☕',
    glowColor: '#d97706',
    accentColor: '#fde68a',
    bgGradient: 'linear-gradient(135deg, rgba(217,119,6,0.24) 0%, rgba(120,53,15,0.18) 50%, rgba(28,25,23,0.85) 100%)',
    bpmRange: '75–95 BPM',
    telemetryTag: 'Unplugged Folk',
    bestTimeSlots: ['morning', 'afternoon'],
    timePhaseLabel: {
      morning: '☕ Morning Brew',
      afternoon: '📖 Afternoon Reading'
    },
    seedKeywords: ['coffee', 'acoustic', 'jazz', 'folk', 'cafe', 'rain', 'unplugged']
  },
  {
    id: 'ambient',
    name: 'Deep Ambient',
    sub: 'Binaural soundscapes & delta sleep',
    query: 'deep sleep ambient binaural delta waves meditation',
    searchQuery: 'deep ambient sleep meditation',
    gradient: ['#6366f1', '#1e1b4b'],
    colorClass: 'from-indigo-950/80 via-slate-900/70 to-black/90 border-indigo-500/25',
    emoji: '🌌',
    glowColor: '#6366f1',
    accentColor: '#a5b4fc',
    bgGradient: 'linear-gradient(135deg, rgba(99,102,241,0.24) 0%, rgba(30,27,75,0.20) 50%, rgba(0,0,0,0.90) 100%)',
    bpmRange: '60–68 BPM',
    telemetryTag: 'Delta 0.5Hz',
    bestTimeSlots: ['late_night'],
    timePhaseLabel: {
      late_night: '🌌 Deep Sleep Induction'
    },
    seedKeywords: ['ambient', 'sleep', 'meditation', 'drone', 'binaural', 'delta']
  }
];

export const KEYBOARD_SHORTCUTS: Record<string, string> = {
  'Space': 'Play / Pause',
  'ArrowRight': 'Seek Forward 10s',
  'ArrowLeft': 'Seek Backward 10s',
  'ArrowUp': 'Volume Up',
  'ArrowDown': 'Volume Down',
  'M': 'Mute / Unmute',
  'S': 'Toggle Shuffle',
  'R': 'Cycle Repeat',
  'N': 'Next Track',
  'P': 'Previous Track',
  'L': 'Like Current Track',
};

export const EQ_PRESETS: Record<string, number[]> = {
  'Flat': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Acoustic': [2, 3, 2, 0, 1, 2, 3, 4, 3, 2],
  'Bass Booster': [8, 7, 5, 3, 1, 0, 0, 0, 1, 2],
  'Electronic': [6, 5, 2, 0, -2, 2, 1, 3, 5, 6],
  'Hip-Hop': [7, 6, 3, 0, -1, 1, 2, 2, 4, 5],
  'Classical': [4, 3, 2, 2, -1, -1, 0, 2, 3, 4],
  'Vocal Booster': [-2, -3, -1, 2, 5, 6, 4, 2, 0, -1],
  'Rock': [5, 4, 3, 1, -1, -1, 2, 4, 5, 6],
  'Treble Boost': [0, 0, 0, 0, 1, 2, 4, 6, 7, 8],
  'Late Night': [4, 3, 1, 0, -2, -1, 1, 2, 3, 4],
};

export const FEATURED_ARTISTS = [
  { id: 'the-weeknd', name: 'The Weeknd', genre: 'R&B / Synth-Pop', avatar: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80', query: 'The Weeknd top hits' },
  { id: 'taylor-swift', name: 'Taylor Swift', genre: 'Pop / Acoustic', avatar: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80', query: 'Taylor Swift top tracks' },
  { id: 'drake', name: 'Drake', genre: 'Hip-Hop / Rap', avatar: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=300&auto=format&fit=crop&q=80', query: 'Drake top hits' },
  { id: 'billie-eilish', name: 'Billie Eilish', genre: 'Alt-Pop / Electronic', avatar: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&auto=format&fit=crop&q=80', query: 'Billie Eilish hits' },
  { id: 'dua-lipa', name: 'Dua Lipa', genre: 'Dance-Pop / Disco', avatar: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=80', query: 'Dua Lipa hits' },
  { id: 'post-malone', name: 'Post Malone', genre: 'Hip-Hop / Indie', avatar: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=300&auto=format&fit=crop&q=80', query: 'Post Malone top songs' },
  { id: 'ed-sheeran', name: 'Ed Sheeran', genre: 'Acoustic / Pop', avatar: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=300&auto=format&fit=crop&q=80', query: 'Ed Sheeran greatest hits' },
  { id: 'ariana-grande', name: 'Ariana Grande', genre: 'Pop / R&B', avatar: 'https://images.unsplash.com/photo-1520523839898-507121c172a7?w=300&auto=format&fit=crop&q=80', query: 'Ariana Grande hits' }
];

export const FALLBACK_TRENDING_TRACKS: Track[] = [
  {
    id: 'yt_fHI8X4GhW61',
    youtubeId: 'fHI8X4GhW61',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    album: 'After Hours',
    duration: 200,
    thumbnail: 'https://i.ytimg.com/vi/fHI8X4GhW61/hqdefault.jpg',
    thumbnailLarge: 'https://i.ytimg.com/vi/fHI8X4GhW61/maxresdefault.jpg',
    quality: 'Studio Stream'
  },
  {
    id: 'yt_JGwWNGJdvx8',
    youtubeId: 'JGwWNGJdvx8',
    title: 'Shape of You',
    artist: 'Ed Sheeran',
    album: '÷ (Divide)',
    duration: 233,
    thumbnail: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg',
    thumbnailLarge: 'https://i.ytimg.com/vi/JGwWNGJdvx8/maxresdefault.jpg',
    quality: 'Studio Stream'
  },
  {
    id: 'yt_4NRXx6U8ABQ',
    youtubeId: '4NRXx6U8ABQ',
    title: 'Starboy',
    artist: 'The Weeknd ft. Daft Punk',
    album: 'Starboy',
    duration: 230,
    thumbnail: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg',
    thumbnailLarge: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/maxresdefault.jpg',
    quality: 'Studio Stream'
  },
  {
    id: 'yt_TUVcZfQe-Kw',
    youtubeId: 'TUVcZfQe-Kw',
    title: 'Levitating',
    artist: 'Dua Lipa',
    album: 'Future Nostalgia',
    duration: 203,
    thumbnail: 'https://i.ytimg.com/vi/TUVcZfQe-Kw/hqdefault.jpg',
    thumbnailLarge: 'https://i.ytimg.com/vi/TUVcZfQe-Kw/maxresdefault.jpg',
    quality: 'Studio Stream'
  },
  {
    id: 'yt_kJQP7kiw5Fk',
    youtubeId: 'kJQP7kiw5Fk',
    title: 'Despacito',
    artist: 'Luis Fonsi ft. Daddy Yankee',
    album: 'VIDA',
    duration: 228,
    thumbnail: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg',
    thumbnailLarge: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/maxresdefault.jpg',
    quality: 'Studio Stream'
  },
  {
    id: 'yt_LHCob76kigA',
    youtubeId: 'LHCob76kigA',
    title: 'Espresso',
    artist: 'Sabrina Carpenter',
    album: "Short n' Sweet",
    duration: 175,
    thumbnail: 'https://i.ytimg.com/vi/LHCob76kigA/hqdefault.jpg',
    thumbnailLarge: 'https://i.ytimg.com/vi/LHCob76kigA/maxresdefault.jpg',
    quality: 'Studio Stream'
  },
  {
    id: 'yt_b1kbLwvqugk',
    youtubeId: 'b1kbLwvqugk',
    title: 'BIRDS OF A FEATHER',
    artist: 'Billie Eilish',
    album: 'HIT ME HARD AND SOFT',
    duration: 194,
    thumbnail: 'https://i.ytimg.com/vi/b1kbLwvqugk/hqdefault.jpg',
    thumbnailLarge: 'https://i.ytimg.com/vi/b1kbLwvqugk/maxresdefault.jpg',
    quality: 'Studio Stream'
  },
  {
    id: 'yt_OPf0YbXqDm0',
    youtubeId: 'OPf0YbXqDm0',
    title: 'Uptown Funk',
    artist: 'Mark Ronson ft. Bruno Mars',
    album: 'Uptown Special',
    duration: 270,
    thumbnail: 'https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg',
    thumbnailLarge: 'https://i.ytimg.com/vi/OPf0YbXqDm0/maxresdefault.jpg',
    quality: 'Studio Stream'
  }
];

