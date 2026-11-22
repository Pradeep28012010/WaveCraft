export type HomeFilter = 'all' | 'music' | 'for_you' | 'charts' | 'moods' | 'radios' | 'eras' | 'albums';

export const FILTER_CHIPS: { id: HomeFilter; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: '✨' },
  { id: 'music', label: 'Music', icon: '🎵' },
  { id: 'for_you', label: 'Made For You', icon: '❤️' },
  { id: 'charts', label: 'Global Charts', icon: '🔥' },
  { id: 'moods', label: 'Moods & Mixes', icon: '🌈' },
  { id: 'radios', label: '24/7 Radios', icon: '📻' },
  { id: 'eras', label: 'Decades', icon: '⏳' },
  { id: 'albums', label: 'Albums', icon: '💿' }
];

export const CURATED_CHARTS = [
  {
    key: 'global',
    name: "Today's Top Hits",
    sub: 'The hottest tracks in the world right now',
    badge: 'GLOBAL #1',
    color: 'from-emerald-500 via-teal-600 to-indigo-950',
    icon: '🌍',
    border: 'border-emerald-500/30'
  },
  {
    key: 'india',
    name: 'Top 50 India',
    sub: 'Trending Bollywood, Punjabi & Indie hits',
    badge: 'VIRAL IN INDIA',
    color: 'from-orange-500 via-amber-600 to-rose-950',
    icon: '🇮🇳',
    border: 'border-orange-500/30'
  },
  {
    key: 'usa',
    name: 'Top 50 USA',
    sub: 'Billboard Hot 100 leaders & US anthems',
    badge: 'HOT 100',
    color: 'from-blue-600 via-indigo-600 to-slate-950',
    icon: '🇺🇸',
    border: 'border-blue-500/30'
  },
  {
    key: 'hiphop',
    name: 'RapCaviar',
    sub: 'Heavyweight trap, drill & hip-hop beats',
    badge: 'HEAVY BASS',
    color: 'from-red-600 via-rose-700 to-zinc-950',
    icon: '🎤',
    border: 'border-red-500/30'
  },
  {
    key: 'dance',
    name: 'mint EDM World',
    sub: 'Global club, house & festival anthems',
    badge: '128 BPM PEAK',
    color: 'from-cyan-400 via-teal-500 to-blue-950',
    icon: '🎧',
    border: 'border-cyan-400/30'
  },
  {
    key: 'kpop',
    name: 'K-Pop ON!',
    sub: 'Idol releases, Korean charts & global viral',
    badge: 'GLOBAL K-WAVE',
    color: 'from-pink-500 via-purple-600 to-indigo-950',
    icon: '🇰🇷',
    border: 'border-pink-500/30'
  }
];

export const CURATED_RADIOS = [
  {
    id: 'lofi-radio',
    name: 'Lofi Girl Study & Beats',
    desc: 'Gentle vinyl crackle, mellow rhodes & chill beats',
    query: 'lofi hip hop mix beats to relax study to',
    tag: 'Theta 432Hz',
    gradient: 'from-amber-600/30 via-orange-900/30 to-black/80',
    icon: '☕',
    glow: '#f59e0b'
  },
  {
    id: 'synthwave-radio',
    name: 'Synthwave 2088 Neon Drive',
    desc: 'Analog arpeggios, retro synthesizers & neon night highway',
    query: 'synthwave mix chill retro beats night drive',
    tag: '110 BPM Flow',
    gradient: 'from-fuchsia-600/30 via-purple-900/30 to-black/80',
    icon: '🌌',
    glow: '#d946ef'
  },
  {
    id: 'phonk-radio',
    name: 'Beast Mode Workout Phonk',
    desc: 'Drift 808 cowbells & high adrenaline gym motivation',
    query: 'drift phonk mix workout gym motivation hits',
    tag: 'High Octane',
    gradient: 'from-rose-600/30 via-red-950/30 to-black/80',
    icon: '🏃',
    glow: '#f43f5e'
  },
  {
    id: 'ambient-radio',
    name: 'Binaural Rain & 432Hz Sleep',
    desc: 'Deep restorative frequencies & soft thunderstorm wash',
    query: 'binaural beats deep sleep rain ambient soundscape mix',
    tag: 'Delta Waves',
    gradient: 'from-indigo-600/30 via-slate-900/30 to-black/80',
    icon: '🌧️',
    glow: '#6366f1'
  },
  {
    id: 'jazz-radio',
    name: 'Nocturnal Velvet Jazz',
    desc: 'Warm acoustic upright bass, muted trumpets & piano bar',
    query: 'cozy coffee shop jazz cafe relaxed instrumental mix',
    tag: 'Acoustic Warmth',
    gradient: 'from-yellow-700/30 via-amber-950/30 to-black/80',
    icon: '🎷',
    glow: '#eab308'
  },
  {
    id: 'club-radio',
    name: 'Tropical & Deep House Sessions',
    desc: 'Sun-drenched chords, melodic 4x4 groove & sunset vibes',
    query: 'tropical house deep chill sunset session mix',
    tag: '122 BPM Groove',
    gradient: 'from-cyan-600/30 via-blue-900/30 to-black/80',
    icon: '🏖️',
    glow: '#06b6d4'
  }
];

export const ERA_DECINTERS = [
  {
    era: '80s',
    title: '80s Retro Synth & Pop Classics',
    artists: 'Michael Jackson • Queen • Prince • Madonna • Whitney Houston',
    query: '80s greatest hits playlist top songs',
    icon: '📼',
    gradient: 'from-pink-600 via-rose-600 to-purple-950',
    tag: 'Analog Magic'
  },
  {
    era: '90s',
    title: '90s Golden Era & Grunge Anthems',
    artists: 'Nirvana • 2Pac • Oasis • Britney Spears • TLC',
    query: '90s greatest hits playlist top songs',
    icon: '📻',
    gradient: 'from-amber-600 via-yellow-600 to-stone-950',
    tag: 'Golden Era'
  },
  {
    era: '00s',
    title: '2000s Pop, Rock & Nu-Metal',
    artists: 'Eminem • Linkin Park • Beyoncé • Coldplay • Rihanna',
    query: '2000s greatest hits playlist top songs',
    icon: '💿',
    gradient: 'from-cyan-600 via-blue-700 to-slate-950',
    tag: 'Millennium'
  },
  {
    era: '10s',
    title: '2010s Streaming Era & Global EDM',
    artists: 'Avicii • Drake • The Weeknd • Taylor Swift • Chainsmokers',
    query: '2010s greatest hits playlist top songs',
    icon: '📱',
    gradient: 'from-violet-600 via-indigo-700 to-zinc-950',
    tag: 'Streaming Boom'
  },
  {
    era: '20s',
    title: '2020s Hyperpop, Phonk & Viral Beats',
    artists: 'Dua Lipa • Olivia Rodrigo • Bad Bunny • Burna Boy • Phonk',
    query: '2020s hits viral trending songs playlist',
    icon: '⚡',
    gradient: 'from-emerald-500 via-teal-600 to-neutral-950',
    tag: 'Modern Waves'
  }
];

export const DAILY_MIX_DEFINITIONS = [
  {
    id: 'daily-mix-1',
    name: 'Daily Mix 1',
    sub: 'Chill Lo-Fi, Ambient & Acoustic',
    category: 'chill',
    query: 'chill lofi acoustic instrumental beats',
    gradient: 'from-emerald-500 via-teal-600 to-indigo-950',
    icon: '☕',
    tag: '432Hz Calm',
    badge: 'DAILY MIX 1'
  },
  {
    id: 'daily-mix-2',
    name: 'Daily Mix 2',
    sub: 'High-Octane Phonk & Heavy Trap',
    category: 'hiphop',
    query: 'drift phonk gym workout motivation hits',
    gradient: 'from-rose-600 via-red-600 to-zinc-950',
    icon: '⚡',
    tag: '145+ BPM',
    badge: 'DAILY MIX 2'
  },
  {
    id: 'daily-mix-3',
    name: 'Daily Mix 3',
    sub: 'Club Anthems, House & Dance EDM',
    category: 'dance',
    query: 'synthwave night drive retro electronic dance',
    gradient: 'from-purple-600 via-fuchsia-600 to-slate-950',
    icon: '🌃',
    tag: 'Neon Arp',
    badge: 'DAILY MIX 3'
  },
  {
    id: 'daily-mix-4',
    name: 'Daily Mix 4',
    sub: 'Global Pop, Viral Hits & Trending',
    category: 'pop',
    query: 'todays top hits viral pop global',
    gradient: 'from-amber-500 via-orange-600 to-rose-950',
    icon: '🔥',
    tag: 'Chart Topper',
    badge: 'DAILY MIX 4'
  },
  {
    id: 'daily-mix-5',
    name: 'Daily Mix 5',
    sub: 'Ultimate Indie, Alt & Acoustic Discovery',
    category: 'indie',
    query: 'ultimate indie alternative rock acoustic hits',
    gradient: 'from-cyan-500 via-blue-600 to-slate-950',
    icon: '🌿',
    tag: 'Indie Pulse',
    badge: 'DAILY MIX 5'
  }
];
