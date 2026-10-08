export const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.jing.rocks',
  'https://vid.puffyan.us'
];

export const LYRICS_API = 'https://api.lyrics.ovh/v1';

export const DEFAULT_THUMBNAIL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Cdefs%3E%3ClinearGradient id='grad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23311042' /%3E%3Cstop offset='100%25' stop-color='%230f172a' /%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='400' fill='url(%23grad)' /%3E%3Ccircle cx='200' cy='200' r='64' fill='none' stroke='%23a855f7' stroke-width='8' opacity='0.5'/%3E%3Ccircle cx='200' cy='200' r='20' fill='%23a855f7' opacity='0.7'/%3E%3C/svg%3E";

export const GENRE_LIST = [
  { id: 'pop', name: 'Pop Hits', query: 'top pop hits songs', colors: ['#ec4899', '#8b5cf6'], colorClass: 'bg-gradient-to-br from-pink-500/80 via-rose-500/70 to-purple-700/80', emoji: '🎤' },
  { id: 'hiphop', name: 'Hip-Hop & Rap', query: 'hip hop rap hits', colors: ['#f59e0b', '#ea580c'], colorClass: 'bg-gradient-to-br from-amber-500/80 via-orange-600/70 to-red-800/80', emoji: '🔥' },
  { id: 'bollywood', name: 'Indian & Bollywood', query: 'latest bollywood hindi hits', colors: ['#10b981', '#059669'], colorClass: 'bg-gradient-to-br from-emerald-500/80 via-teal-600/70 to-cyan-800/80', emoji: '✨' },
  { id: 'telugu', name: 'Telugu & South', query: 'latest telugu tamil hit songs anirudh', colors: ['#6366f1', '#4f46e5'], colorClass: 'bg-gradient-to-br from-indigo-500/80 via-purple-600/70 to-slate-900/80', emoji: '🎬' },
  { id: 'electronic', name: 'Electronic & EDM', query: 'electronic dance edm hits', colors: ['#06b6d4', '#3b82f6'], colorClass: 'bg-gradient-to-br from-cyan-400/80 via-blue-600/70 to-indigo-900/80', emoji: '⚡' },
  { id: 'rock', name: 'Rock Classics', query: 'rock classics hits', colors: ['#ef4444', '#991b1b'], colorClass: 'bg-gradient-to-br from-red-500/80 via-rose-700/70 to-zinc-900/80', emoji: '🎸' },
  { id: 'rnb', name: 'R&B & Soul', query: 'rnb soul chill hits the weeknd', colors: ['#a855f7', '#6366f1'], colorClass: 'bg-gradient-to-br from-purple-500/80 via-fuchsia-600/70 to-indigo-950/80', emoji: '🌙' },
  { id: 'lofi', name: 'Lo-Fi & Chill', query: 'lofi chill beats aesthetic', colors: ['#14b8a6', '#0f766e'], colorClass: 'bg-gradient-to-br from-teal-400/80 via-emerald-600/70 to-slate-900/80', emoji: '☕' },
];

export const MOOD_PLAYLISTS = [
  { id: 'chill', name: 'Chill Vibes', sub: 'Unwind & relax in glass', query: 'chill vibes relax hits', searchQuery: 'chill vibes relax hits', gradient: ['#4facfe', '#00f2fe'], colorClass: 'bg-gradient-to-br from-sky-500/30 via-blue-600/20 to-indigo-900/40 border-sky-400/30', emoji: '😌' },
  { id: 'workout', name: 'Beast Mode', sub: 'High energy gym anthems', query: 'workout gym motivation Phonk hits', searchQuery: 'workout gym motivation hits', gradient: ['#f093fb', '#f5576c'], colorClass: 'bg-gradient-to-br from-rose-500/30 via-orange-600/20 to-red-900/40 border-rose-400/30', emoji: '💪' },
  { id: 'focus', name: 'Deep Focus', sub: 'Flow state & coding beats', query: 'lofi study focus instrumental beats', searchQuery: 'lofi study focus instrumental', gradient: ['#43e97b', '#38f9d7'], colorClass: 'bg-gradient-to-br from-emerald-500/30 via-teal-600/20 to-cyan-900/40 border-emerald-400/30', emoji: '🧠' },
  { id: 'party', name: 'Night Drive', sub: 'Late night synth & bass', query: 'night drive synthwave weeknd after hours', searchQuery: 'night drive weeknd hits', gradient: ['#fa709a', '#fee140'], colorClass: 'bg-gradient-to-br from-purple-500/30 via-fuchsia-600/20 to-pink-900/40 border-purple-400/30', emoji: '🌃' },
  { id: 'party-hits', name: 'Party Anthems', sub: 'Turn up the liquid bass', query: 'party dance club hits', searchQuery: 'party dance club hits', gradient: ['#f59e0b', '#ec4899'], colorClass: 'bg-gradient-to-br from-amber-500/30 via-pink-600/20 to-rose-900/40 border-amber-400/30', emoji: '🎉' },
  { id: 'romantic', name: 'Golden Hour', sub: 'Warm acoustic & love songs', query: 'romantic acoustic love songs hits', searchQuery: 'romantic love songs hits', gradient: ['#fb7185', '#e11d48'], colorClass: 'bg-gradient-to-br from-pink-500/30 via-rose-500/20 to-amber-900/40 border-pink-400/30', emoji: '🌅' },
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
  'Bass Boost': [8, 7, 5, 3, 1, 0, 0, 0, 1, 2],
  'Electronic': [6, 5, 2, 0, -2, 2, 1, 3, 5, 6],
  'Hip-Hop': [7, 6, 3, 0, -1, 1, 2, 2, 4, 5],
  'Classical': [4, 3, 2, 2, -1, -1, 0, 2, 3, 4],
  'Vocal Booster': [-2, -3, -1, 2, 5, 6, 4, 2, 0, -1],
  'Vocal': [-2, -3, -1, 2, 5, 6, 4, 2, 0, -1],
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

