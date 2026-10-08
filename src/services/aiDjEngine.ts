import type { Track, VibeEnergyCurve, AcousticInsights, AiDjMix, VisualizerStyle } from '../types';
import type { StudioFXMode } from '../stores/studioStore';
import { searchTracks } from './youtube';
import { searchItunesSongs } from './itunes';
import { useSettingsStore } from '../stores/settingsStore';
import { useStudioStore } from '../stores/studioStore';
import { usePlayerStore } from '../stores/playerStore';

// ============================================================================
// 1. RICH ACOUSTIC & VIBE TAXONOMY (60+ MICRO-VIBES)
// ============================================================================

export interface MicroVibeDefinition {
  id: string;
  name: string;
  category: 'electronic' | 'lofi_chill' | 'high_energy' | 'regional' | 'mood' | 'ambient';
  keywords: string[];
  bpmRange: [number, number]; // [min, max]
  targetBpm: number;
  energyLevel: number; // 1 - 10
  genre: string;
  mood: string;
  suggestedEq: string;
  suggestedFx: StudioFXMode;
  suggestedVisualizer: VisualizerStyle;
  suggestedSpeed?: number;
  accentColor: string;
  energyLabel: string;
  seedQueries: string[];
  vibeTag: string;
}

export interface InspirationalPreset {
  id: string;
  title: string;
  prompt: string;
  emoji: string;
  energyLabel: string;
  gradient: string;
}

export const INSPIRATIONAL_PRESETS: InspirationalPreset[] = [
  {
    id: 'cyberpunk-night-drive',
    title: 'Cyberpunk Night Drive',
    prompt: 'Cyberpunk night drive dark synthwave highway neon kavinsky 120 bpm',
    emoji: '🏎️',
    energyLabel: 'Neon Cruise • 124 BPM',
    gradient: 'from-fuchsia-600 via-purple-600 to-rose-500'
  },
  {
    id: 'rainy-coffee-shop-study',
    title: 'Rainy Coffee Shop Study',
    prompt: 'Rainy coffee shop study warm lofi jazzhop acoustic beats',
    emoji: '☕',
    energyLabel: 'Warm Hearth • 80 BPM',
    gradient: 'from-amber-600 via-yellow-600 to-emerald-600'
  },
  {
    id: 'golden-hour-chill',
    title: 'Golden Hour Chill',
    prompt: 'Golden hour chill sunset warm indie acoustic groove',
    emoji: '🌅',
    energyLabel: 'Sunset Radiance • 98 BPM',
    gradient: 'from-amber-500 via-orange-500 to-rose-500'
  },
  {
    id: 'beast-mode-workout',
    title: 'Beast Mode Workout',
    prompt: 'Beast mode workout gym phonk high adrenaline hardstyle 150 bpm',
    emoji: '🔥',
    energyLabel: 'Maximum Adrenaline • 148 BPM',
    gradient: 'from-rose-600 via-red-600 to-orange-500'
  },
  {
    id: 'late-night-lofi-echoes',
    title: 'Late Night Lo-Fi Echoes',
    prompt: 'Late night lo-fi echoes 3am solitude chill beats slowed reverb',
    emoji: '🌌',
    energyLabel: '3AM Solitude • 76 BPM',
    gradient: 'from-purple-700 via-indigo-700 to-blue-600'
  },
  {
    id: 'deep-focus-ambient',
    title: 'Deep Focus Ambient',
    prompt: 'Deep focus ambient coding flow state electronic beats',
    emoji: '🧠',
    energyLabel: 'Flow State • 88 BPM',
    gradient: 'from-indigo-600 via-purple-600 to-cyan-500'
  }
];

export const VIBE_TAXONOMY: MicroVibeDefinition[] = [
  // --- ELECTRONIC & SYNTH (10) ---
  {
    id: 'cyberpunk-night-drive',
    name: 'Cyberpunk Night Drive',
    category: 'electronic',
    keywords: ['cyberpunk', 'night drive', 'highway', 'outrun', 'synthwave', 'neon', 'kavinsky', 'dark synth', 'blinding lights'],
    bpmRange: [118, 130],
    targetBpm: 124,
    energyLevel: 8,
    genre: 'Synthwave & Darksynth',
    mood: 'Adrenaline & Neon Noir',
    suggestedEq: 'Electronic',
    suggestedFx: '8d-orbit',
    suggestedVisualizer: 'starfield',
    accentColor: '#ec4899',
    energyLabel: 'Neon Pulse • 124 BPM',
    seedQueries: ['Kavinsky Nightcall', 'The Midnight Sunset', 'The Weeknd synthwave', 'Daft Punk Tron synth', 'Carpenter Brut synthwave', 'Gunship tech noir'],
    vibeTag: 'Cyberpunk Synth'
  },
  {
    id: 'retrowave-sunset',
    name: 'Retrowave Sunset Boulevard',
    category: 'electronic',
    keywords: ['retrowave', '80s', 'retro', 'synth', 'sunset drive', 'miami nights', 'vintage electronic'],
    bpmRange: [105, 120],
    targetBpm: 112,
    energyLevel: 7,
    genre: 'Retrowave',
    mood: 'Nostalgic & Warm',
    suggestedEq: 'Electronic',
    suggestedFx: '8d-orbit',
    suggestedVisualizer: 'starfield',
    accentColor: '#f43f5e',
    energyLabel: 'Analog Warmth • 112 BPM',
    seedQueries: ['Miami Nights 1984', 'Timecop1983 Lovers', 'FM-84 Running in the Night', 'Trevor Something', 'Lazerhawk Overdrive'],
    vibeTag: 'Retrowave'
  },
  {
    id: 'deep-house-sunset',
    name: 'Ibiza Deep Melodic House',
    category: 'electronic',
    keywords: ['deep house', 'melodic house', 'ibiza', 'club', 'sunset', 'lane 8', 'ben bohmer', 'anjunadeep'],
    bpmRange: [120, 126],
    targetBpm: 123,
    energyLevel: 7,
    genre: 'Melodic Deep House',
    mood: 'Hypnotic & Euphoric',
    suggestedEq: 'Electronic',
    suggestedFx: 'normal',
    suggestedVisualizer: 'wave',
    accentColor: '#06b6d4',
    energyLabel: 'Hypnotic Groove • 123 BPM',
    seedQueries: ['Lane 8 melodic house', 'Ben Bohmer sunset live', 'Nora En Pure deep house', 'RÜFÜS DU SOL Innerbloom', 'Tinlicker melodic house'],
    vibeTag: 'Melodic House'
  },
  {
    id: 'acid-techno-underground',
    name: 'Berlin Acid Underground',
    category: 'electronic',
    keywords: ['techno', 'acid', 'berlin', 'underground', 'warehouse', 'dark techno', 'industrial', 'berghain'],
    bpmRange: [130, 142],
    targetBpm: 136,
    energyLevel: 9,
    genre: 'Industrial Acid Techno',
    mood: 'Dark & Hypnotic',
    suggestedEq: 'Bass Boost',
    suggestedFx: 'arena-live',
    suggestedVisualizer: 'bars',
    accentColor: '#a855f7',
    energyLabel: 'Underground Pulse • 136 BPM',
    seedQueries: ['Charlotte de Witte acid techno', 'Amelie Lens industrial techno', 'Enrico Sangiuliano', 'Rebekah techno', 'I Hate Models warehouse'],
    vibeTag: 'Acid Techno'
  },
  {
    id: 'liquid-dnb-flight',
    name: 'Liquid Drum & Bass Velocity',
    category: 'electronic',
    keywords: ['dnb', 'drum and bass', 'liquid', 'roller', 'fast', 'high speed', 'sub focus', 'wilkinson'],
    bpmRange: [170, 178],
    targetBpm: 174,
    energyLevel: 9,
    genre: 'Liquid Drum & Bass',
    mood: 'Weightless & Uplifting',
    suggestedEq: 'Electronic',
    suggestedFx: 'normal',
    suggestedVisualizer: 'starfield',
    accentColor: '#38bdf8',
    energyLabel: 'Supersonic Flow • 174 BPM',
    seedQueries: ['Sub Focus Desire', 'Hybrid Minds liquid dnb', 'Wilkinson Afterglow', 'Koven drum and bass', 'Fred V Grafix liquid'],
    vibeTag: 'Liquid DnB'
  },
  {
    id: 'french-touch-disco',
    name: 'French Touch & Nu-Disco',
    category: 'electronic',
    keywords: ['french touch', 'disco', 'nu-disco', 'funk', 'daft punk', 'justice', 'breakbot', 'groove'],
    bpmRange: [118, 128],
    targetBpm: 122,
    energyLevel: 8,
    genre: 'French Electro / Nu-Disco',
    mood: 'Funky & Celebratory',
    suggestedEq: 'Pop',
    suggestedFx: 'normal',
    suggestedVisualizer: 'circular',
    accentColor: '#fbbf24',
    energyLabel: 'Disco Funk • 122 BPM',
    seedQueries: ['Daft Punk Discovery hits', 'Justice D.A.N.C.E.', 'Breakbot Baby I am yours', 'Modjo Lady', 'Duck Sauce disco house'],
    vibeTag: 'French Touch'
  },
  {
    id: 'psytrance-odyssey',
    name: 'Psychedelic Goa Odyssey',
    category: 'electronic',
    keywords: ['psytrance', 'goa', 'trance', 'psychedelic', 'infected mushroom', 'astrix', 'vini vici'],
    bpmRange: [138, 146],
    targetBpm: 142,
    energyLevel: 10,
    genre: 'Psytrance',
    mood: 'Cosmic & Intense',
    suggestedEq: 'Electronic',
    suggestedFx: 'arena-live',
    suggestedVisualizer: 'nebula',
    accentColor: '#10b981',
    energyLabel: 'Cosmic Velocity • 142 BPM',
    seedQueries: ['Vini Vici Great Spirit', 'Astrix Deep Jungle Walk', 'Infected Mushroom Heavyweight', 'Blastoyz psytrance', 'Hilight Tribe Free Tibet'],
    vibeTag: 'Psytrance'
  },
  {
    id: 'ambient-drone-space',
    name: 'Cosmic Stargazing & Drone',
    category: 'ambient',
    keywords: ['ambient', 'drone', 'space', 'stargazing', 'brian eno', 'weightless', 'celestial', 'meditation'],
    bpmRange: [60, 75],
    targetBpm: 68,
    energyLevel: 2,
    genre: 'Space Ambient Drone',
    mood: 'Zero-Gravity & Serene',
    suggestedEq: 'Flat',
    suggestedFx: '8d-orbit',
    suggestedVisualizer: 'nebula',
    accentColor: '#6366f1',
    energyLabel: 'Deep Horizon • 68 BPM',
    seedQueries: ['Marconi Union Weightless', 'Brian Eno Music for Airports', 'Stars of the Lid ambient', 'Hammock ambient sleep', 'C418 ambient serene'],
    vibeTag: 'Space Ambient'
  },
  {
    id: 'future-garage-fog',
    name: '2AM London Fog Garage',
    category: 'electronic',
    keywords: ['future garage', 'burial', 'fog', '2am', 'rainy street', 'chillstep', 'sad electronic'],
    bpmRange: [128, 136],
    targetBpm: 132,
    energyLevel: 5,
    genre: 'Future Garage',
    mood: 'Melancholy & Haunting',
    suggestedEq: 'Electronic',
    suggestedFx: '8d-orbit',
    suggestedVisualizer: 'particles',
    accentColor: '#64748b',
    energyLabel: 'Midnight Echoes • 132 BPM',
    seedQueries: ['Burial Archangel', 'Sorrow future garage', 'Vacant future garage', 'Phelian future garage', 'Volor Flex'],
    vibeTag: 'Future Garage'
  },
  {
    id: 'hyperpop-surge',
    name: 'Hyperpop Glitch Surge',
    category: 'electronic',
    keywords: ['hyperpop', 'glitch', 'charli xcx', 'sophie', '100 gecs', 'fast pop', 'digital'],
    bpmRange: [145, 175],
    targetBpm: 160,
    energyLevel: 10,
    genre: 'Hyperpop & Glitchcore',
    mood: 'Frenetic & Euphoric',
    suggestedEq: 'Pop',
    suggestedFx: 'arena-live',
    suggestedVisualizer: 'blob',
    accentColor: '#ec4899',
    energyLabel: 'Digital Overdrive • 160 BPM',
    seedQueries: ['Charli XCX Brat hits', '100 gecs Money Machine', 'Sophie Faceshopping', 'PinkPantheress fast', 'AG Cook hyperpop'],
    vibeTag: 'Hyperpop'
  },

  // --- LO-FI, CHILL & COZY STUDY (10) ---
  {
    id: 'rainy-coffee-shop',
    name: 'Rainy Coffee Shop Study',
    category: 'lofi_chill',
    keywords: ['rain', 'coffee', 'study', 'reading', 'cozy', 'lofi', 'chill', 'cafe', 'tokyo rain', 'rainy coffee'],
    bpmRange: [72, 85],
    targetBpm: 80,
    energyLevel: 3,
    genre: 'Lo-Fi Jazzhop & Rain',
    mood: 'Warm & Contemplative',
    suggestedEq: 'Electronic',
    suggestedFx: 'normal',
    suggestedVisualizer: 'particles',
    accentColor: '#8b5cf6',
    energyLabel: 'Warm Hearth • 80 BPM',
    seedQueries: ['Kupla lofi beats', 'Jinsang feelings lofi', 'Tomppabeats lofi hip hop', 'idealism rainy lofi', 'Kudasai Technicolor lofi'],
    vibeTag: 'Rainy Lo-Fi'
  },
  {
    id: 'late-night-lofi-echoes',
    name: 'Late Night Lo-Fi Echoes',
    category: 'lofi_chill',
    keywords: ['late night', 'lo-fi echoes', '3am lofi', 'insomnia', 'midnight bedroom', 'sleep lofi'],
    bpmRange: [70, 82],
    targetBpm: 76,
    energyLevel: 3,
    genre: 'Midnight Lo-Fi',
    mood: 'Dreamy & Solitary',
    suggestedEq: 'Acoustic',
    suggestedFx: 'normal',
    suggestedVisualizer: 'nebula',
    accentColor: '#a78bfa',
    energyLabel: '3AM Solitude • 76 BPM',
    seedQueries: ['potsu lofi beats', 'Saib lounge lofi', 'Nohidea lofi', 'Elijah Who lofi', 'Komorebi lofi chill'],
    vibeTag: 'Late Lo-Fi'
  },
  {
    id: 'deep-focus-ambient',
    name: 'Deep Focus Ambient Code',
    category: 'lofi_chill',
    keywords: ['deep focus', 'focus', 'ambient coding', 'programming', 'work', 'terminal', 'productivity'],
    bpmRange: [80, 95],
    targetBpm: 88,
    energyLevel: 4,
    genre: 'Minimal Ambient IDM',
    mood: 'Hypnotic & Clear',
    suggestedEq: 'Electronic',
    suggestedFx: 'normal',
    suggestedVisualizer: 'particles',
    accentColor: '#6366f1',
    energyLabel: 'Flow State • 88 BPM',
    seedQueries: ['Tycho Awake focus', 'Kiasmos minimal ambient', 'Bonobo instrumental focus', 'Jon Hopkins Singularity ambient', 'Emancipator Soon It Will Be Cold'],
    vibeTag: 'Deep Focus'
  },
  {
    id: 'ghibli-pastoral-piano',
    name: 'Ghibli Pastoral Meadow',
    category: 'lofi_chill',
    keywords: ['ghibli', 'joe hisaishi', 'piano', 'meadow', 'peaceful', 'pastoral', 'anime lofi', 'spirited away'],
    bpmRange: [65, 80],
    targetBpm: 72,
    energyLevel: 3,
    genre: 'Pastoral Instrumental Piano',
    mood: 'Gentle & Pure',
    suggestedEq: 'Acoustic',
    suggestedFx: 'normal',
    suggestedVisualizer: 'wave',
    accentColor: '#34d399',
    energyLabel: 'Gentle Breeze • 72 BPM',
    seedQueries: ['Joe Hisaishi piano classics', 'Ghibli peaceful lofi piano', 'The Wind Rises soundtrack', 'Summer Joe Hisaishi', 'Howls Moving Castle theme'],
    vibeTag: 'Pastoral Piano'
  },
  {
    id: 'dusty-vinyl-boombap',
    name: 'Dusty Vinyl 90s Boom-Bap',
    category: 'lofi_chill',
    keywords: ['vinyl', 'boombap', '90s', 'crackle', 'dilla', 'nujabes', 'jazz rap', 'hip hop beats'],
    bpmRange: [84, 94],
    targetBpm: 89,
    energyLevel: 5,
    genre: 'Analog Boom-Bap Jazzhop',
    mood: 'Soulful & Streetwise',
    suggestedEq: 'Hip-Hop',
    suggestedFx: 'normal',
    suggestedVisualizer: 'bars',
    accentColor: '#f59e0b',
    energyLabel: 'Vinyl Groove • 89 BPM',
    seedQueries: ['Nujabes Feather', 'J Dilla Donuts instrumental', 'Pete Rock instrumental beats', 'DJ Premier classic boom bap beats', 'MF DOOM instrumental beats'],
    vibeTag: 'Boom-Bap Jazz'
  },
  {
    id: 'cozy-autumn-acoustic',
    name: 'Cozy Autumn Acoustic Afternoon',
    category: 'lofi_chill',
    keywords: ['cozy', 'autumn', 'acoustic', 'afternoon', 'sweater', 'indie folk', 'campfire', 'unplugged'],
    bpmRange: [78, 92],
    targetBpm: 84,
    energyLevel: 4,
    genre: 'Warm Indie Folk',
    mood: 'Intimate & Earthy',
    suggestedEq: 'Acoustic',
    suggestedFx: 'normal',
    suggestedVisualizer: 'wave',
    accentColor: '#d97706',
    energyLabel: 'Golden Hearth • 84 BPM',
    seedQueries: ['Noah Kahan Stick Season acoustic', 'Iron and Wine Boy with a Coin', 'Bon Iver Holocene acoustic', 'The Lumineers acoustic', 'Vance Joy Riptide acoustic'],
    vibeTag: 'Autumn Folk'
  },
  {
    id: 'sunday-morning-bossa',
    name: 'Sunday Morning Bossa Nova',
    category: 'lofi_chill',
    keywords: ['bossa nova', 'sunday morning', 'brazil', 'guitar', 'warm sunlight', 'smooth jazz', 'breakfast'],
    bpmRange: [88, 102],
    targetBpm: 95,
    energyLevel: 4,
    genre: 'Bossa Nova & Acoustic Jazz',
    mood: 'Sunlit & Carefree',
    suggestedEq: 'Acoustic',
    suggestedFx: 'normal',
    suggestedVisualizer: 'circular',
    accentColor: '#facc15',
    energyLabel: 'Sunlit Breeze • 95 BPM',
    seedQueries: ['Stan Getz The Girl from Ipanema', 'Astrud Gilberto bossa', 'Laufey bossa nova jazz', 'Antonio Carlos Jobim Wave', 'bossa nova coffee lounge'],
    vibeTag: 'Bossa Nova'
  },
  {
    id: 'neo-soul-midnight-lounge',
    name: 'Neo-Soul Velvet Lounge',
    category: 'lofi_chill',
    keywords: ['neo soul', 'velvet', 'erykah badu', 'dangelo', 'smooth r&b', 'candlelight', 'groove'],
    bpmRange: [76, 90],
    targetBpm: 83,
    energyLevel: 5,
    genre: 'Neo-Soul & Warm R&B',
    mood: 'Sensual & Silky',
    suggestedEq: 'Vocal',
    suggestedFx: 'normal',
    suggestedVisualizer: 'wave',
    accentColor: '#e11d48',
    energyLabel: 'Velvet Glow • 83 BPM',
    seedQueries: ['Erykah Badu On & On', 'DAngelo Brown Sugar', 'Leon Bridges Coming Home', 'Sade Smooth Operator', 'Daniel Caesar Get You'],
    vibeTag: 'Neo-Soul'
  },
  {
    id: 'zen-temple-mindfulness',
    name: 'Zen Temple Mindfulness',
    category: 'ambient',
    keywords: ['zen', 'meditation', 'mindfulness', 'temple', 'bamboo', 'calm', 'breathing', 'stress relief'],
    bpmRange: [55, 68],
    targetBpm: 60,
    energyLevel: 1,
    genre: 'Mindfulness & Tibetan Bells',
    mood: 'Transcendent & Still',
    suggestedEq: 'Flat',
    suggestedFx: 'normal',
    suggestedVisualizer: 'particles',
    accentColor: '#10b981',
    energyLabel: 'Deep Stillness • 60 BPM',
    seedQueries: ['Tibetan singing bowls meditation', 'bamboo water flutes zen', 'Deuter healing meditation', 'sacred earth calming music', 'zen temple peaceful sound'],
    vibeTag: 'Zen Stillness'
  },
  {
    id: 'bedroom-indie-dream',
    name: 'Dreamy Bedroom Indie Pop',
    category: 'lofi_chill',
    keywords: ['bedroom pop', 'dream pop', 'clairo', 'beabadoobee', 'mac demarco', 'lofi pop', 'indie bedroom'],
    bpmRange: [80, 96],
    targetBpm: 88,
    energyLevel: 5,
    genre: 'Lo-Fi Bedroom Pop',
    mood: 'Sweet & Melancholy',
    suggestedEq: 'Pop',
    suggestedFx: 'normal',
    suggestedVisualizer: 'blob',
    accentColor: '#f472b6',
    energyLabel: 'Sweet Reverie • 88 BPM',
    seedQueries: ['Clairo Sofia Pretty Girl', 'Beabadoobee Coffee', 'Mac DeMarco Chamber of Reflection', 'Men I Trust Show Me How', 'Boy Pablo Dance Baby'],
    vibeTag: 'Bedroom Pop'
  },

  // --- HIGH-ENERGY, WORKOUT & ADRENALINE (10) ---
  {
    id: 'beast-mode-phonk',
    name: 'Beast Mode Gym Phonk',
    category: 'high_energy',
    keywords: ['beast mode', 'gym phonk', 'phonk', 'drift', 'workout', 'deadlift', 'kordhell', 'dvrst', 'heavy bass', 'pr'],
    bpmRange: [135, 160],
    targetBpm: 148,
    energyLevel: 10,
    genre: 'Drift Phonk & Bass Overdrive',
    mood: 'Aggressive & Invincible',
    suggestedEq: 'Bass Boost',
    suggestedFx: 'arena-live',
    suggestedVisualizer: 'starfield',
    accentColor: '#fa2d48',
    energyLabel: 'Maximum Adrenaline • 148 BPM',
    seedQueries: ['Kordhell Live Another Day phonk', 'DVRST Close Eyes', 'Ghostface Playa Why Not', 'Hensonn Sahara phonk', 'Maniako drift phonk bangers'],
    vibeTag: 'Drift Phonk'
  },
  {
    id: 'hardstyle-pr-euphoria',
    name: 'Hardstyle Euphoric PR Surge',
    category: 'high_energy',
    keywords: ['hardstyle', 'tevvez', 'gym pr', 'euphoric hardstyle', 'zyzz', 'shredded', 'workout hype'],
    bpmRange: [150, 165],
    targetBpm: 156,
    energyLevel: 10,
    genre: 'Euphoric Hardstyle',
    mood: 'Heroic & Unstoppable',
    suggestedEq: 'Bass Boost',
    suggestedFx: 'arena-live',
    suggestedVisualizer: 'starfield',
    accentColor: '#ef4444',
    energyLabel: 'Apex Euphoria • 156 BPM',
    seedQueries: ['Tevvez Legend gym hardstyle', 'Tevvez Mystique', 'Headhunterz hardstyle', 'Wildstylez Year of Summer', 'Da Tweekaz hardstyle workout'],
    vibeTag: 'Hardstyle PR'
  },
  {
    id: 'brazilian-phonk-carnaval',
    name: 'Brazilian Phonk & Favela Hype',
    category: 'high_energy',
    keywords: ['brazilian phonk', 'favela', 'montagem', 'brazil phonk', 'funk mandelao', 'funk rj', 'speed funk'],
    bpmRange: [130, 145],
    targetBpm: 138,
    energyLevel: 10,
    genre: 'Brazilian Phonk / Funk',
    mood: 'Raw & Kinetic',
    suggestedEq: 'Bass Boost',
    suggestedFx: 'arena-live',
    suggestedVisualizer: 'bars',
    accentColor: '#eab308',
    energyLabel: 'Kinetic Surge • 138 BPM',
    seedQueries: ['Montagem Diamante Rosa phonk', 'Phonk Brasileiro bass boosted', 'DJ Paulinho da Capital funk', 'Montagem anos 70 phonk', 'DJ Arana funk mandelao'],
    vibeTag: 'Brazilian Phonk'
  },
  {
    id: 'heavy-metal-iron-workout',
    name: 'Heavy Metalcore Iron Strike',
    category: 'high_energy',
    keywords: ['metal', 'metalcore', 'heavy rock', 'iron', 'bring me the horizon', 'slipknot', 'rage', 'disturbed'],
    bpmRange: [135, 165],
    targetBpm: 145,
    energyLevel: 10,
    genre: 'Modern Metalcore & Heavy Rock',
    mood: 'Ferocious & Relentless',
    suggestedEq: 'Rock',
    suggestedFx: 'arena-live',
    suggestedVisualizer: 'starfield',
    accentColor: '#dc2626',
    energyLabel: 'Ferocious Drive • 145 BPM',
    seedQueries: ['Bring Me The Horizon Can You Feel My Heart', 'Disturbed Down with the Sickness', 'Slipknot Duality', 'Architects Animals metal', 'Avenged Sevenfold Hail to the King'],
    vibeTag: 'Metalcore Iron'
  },
  {
    id: 'trap-anthem-banger',
    name: '808 Stadium Trap Bangers',
    category: 'high_energy',
    keywords: ['trap', '808', 'banger', 'travis scott', 'metro boomin', '21 savage', 'carti', 'hype hip hop'],
    bpmRange: [130, 150],
    targetBpm: 140,
    energyLevel: 9,
    genre: 'Trap & Bass Anthem',
    mood: 'Swagger & High Roller',
    suggestedEq: 'Bass Boost',
    suggestedFx: 'arena-live',
    suggestedVisualizer: 'bars',
    accentColor: '#f97316',
    energyLabel: 'Heavy 808s • 140 BPM',
    seedQueries: ['Travis Scott FE!N Sicko Mode', 'Metro Boomin Superhero', 'Carti Magnolia banger', '21 Savage Redrum', 'Future March Madness'],
    vibeTag: '808 Stadium Trap'
  },
  {
    id: 'festival-edm-mainstage',
    name: 'Festival EDM Mainstage Drop',
    category: 'high_energy',
    keywords: ['festival', 'edm', 'mainstage', 'martin garrix', 'skrillex', 'tiesto', 'rave', 'banger drop'],
    bpmRange: [126, 134],
    targetBpm: 128,
    energyLevel: 9,
    genre: 'Festival Big Room & Bass EDM',
    mood: 'Colossal & Euphoric',
    suggestedEq: 'Electronic',
    suggestedFx: 'arena-live',
    suggestedVisualizer: 'bars',
    accentColor: '#06b6d4',
    energyLabel: 'Mainstage Drop • 128 BPM',
    seedQueries: ['Martin Garrix Animals Tremor', 'Swedish House Mafia Don’t You Worry Child', 'Skrillex Bangarang', 'Fisher Losing It', 'Fred Again Rumble'],
    vibeTag: 'Festival EDM'
  },
  {
    id: 'gaming-speedrun-arcade',
    name: 'High-Octane Speedrun Arcade',
    category: 'high_energy',
    keywords: ['speedrun', 'arcade', 'gaming', 'chiptune', 'fast game', 'geometry dash', 'camellia'],
    bpmRange: [150, 180],
    targetBpm: 165,
    energyLevel: 10,
    genre: 'Chiptune Speed / Hardcore',
    mood: 'Electrifying & Hyper',
    suggestedEq: 'Electronic',
    suggestedFx: 'normal',
    suggestedVisualizer: 'starfield',
    accentColor: '#38bdf8',
    energyLabel: 'Hyper Velocity • 165 BPM',
    seedQueries: ['Camellia Ghost electro', 'Waterflame Glorious Morning', 'F-777 Sonic Blaster', 'TheFatRat Unity', 'Panda Eyes high score'],
    vibeTag: 'Speedrun Arcade'
  },
  {
    id: 'eurodance-nostalgia-rave',
    name: '90s Eurodance Rave Energy',
    category: 'high_energy',
    keywords: ['eurodance', '90s rave', 'cascada', 'vengaboys', 'scooter', 'fast dance', 'happy hardcore'],
    bpmRange: [135, 150],
    targetBpm: 140,
    energyLevel: 9,
    genre: 'Eurodance & Nostalgia Rave',
    mood: 'Joyful & High Energy',
    suggestedEq: 'Pop',
    suggestedFx: 'arena-live',
    suggestedVisualizer: 'circular',
    accentColor: '#ec4899',
    energyLabel: 'Rave Pulse • 140 BPM',
    seedQueries: ['Cascada Everytime We Touch', 'Alice Deejay Better Off Alone', 'Vengaboys We Like to Party', 'Scooter The Logical Song', 'Darude Sandstorm'],
    vibeTag: 'Eurodance Rave'
  },
  {
    id: 'boxing-hiit-tempo',
    name: 'Boxing HIIT Sprint Tempo',
    category: 'high_energy',
    keywords: ['boxing', 'hiit', 'sprint', 'cardio', 'jump rope', 'neffex', 'eminem workout', 'intense interval'],
    bpmRange: [140, 160],
    targetBpm: 150,
    energyLevel: 9,
    genre: 'Cardio Hype Rock / Rap',
    mood: 'Focused & Gritty',
    suggestedEq: 'Rock',
    suggestedFx: 'normal',
    suggestedVisualizer: 'starfield',
    accentColor: '#ef4444',
    energyLabel: 'HIIT Fire • 150 BPM',
    seedQueries: ['Eminem Till I Collapse', 'Neffex Fight Back', 'Fort Minor Remember The Name', 'The Score Unstoppable', 'Roy Jones Can’t Be Touched'],
    vibeTag: 'Boxing HIIT'
  },
  {
    id: 'bass-house-club-groove',
    name: 'Bass House Midnight Stepper',
    category: 'high_energy',
    keywords: ['bass house', 'night bass', 'joyryde', 'habstrakt', 'jauz', 'heavy groove', 'wobble'],
    bpmRange: [126, 132],
    targetBpm: 128,
    energyLevel: 8,
    genre: 'Bass House',
    mood: 'Gritty & Bouncy',
    suggestedEq: 'Bass Boost',
    suggestedFx: 'normal',
    suggestedVisualizer: 'bars',
    accentColor: '#84cc16',
    energyLabel: 'Heavy Wobble • 128 BPM',
    seedQueries: ['JOYRYDE Hot Drum', 'Habstrakt De la street', 'Jauz Feel The Volume', 'AC Slater bass house', 'Tchami Promesses'],
    vibeTag: 'Bass House'
  },

  // --- REGIONAL & CULTURAL VIBES (10) ---
  {
    id: 'tollywood-high-voltage-mass',
    name: 'Tollywood High-Voltage Mass',
    category: 'regional',
    keywords: ['telugu', 'tollywood', 'mass', 'anirudh', 'thaman', 'dsp', 'energetic', 'devara', 'pushpa', 'banger'],
    bpmRange: [124, 138],
    targetBpm: 130,
    energyLevel: 10,
    genre: 'South Indian Mass EDM Fusion',
    mood: 'Electric & Euphoric',
    suggestedEq: 'Bass Boost',
    suggestedFx: 'arena-live',
    suggestedVisualizer: 'nebula',
    accentColor: '#f59e0b',
    energyLabel: 'Mass Explosion • 130 BPM',
    seedQueries: ['Anirudh Ravichander mass hits', 'Thaman S Telugu mass beats', 'Devi Sri Prasad energetic songs', 'Pushpa energetic hits', 'Devara mass songs Telugu'],
    vibeTag: 'Tollywood Mass'
  },
  {
    id: 'kollywood-kuthu-frenzy',
    name: 'Kollywood Kuthu Dance Frenzy',
    category: 'regional',
    keywords: ['tamil', 'kollywood', 'kuthu', 'dappan kuthu', 'santhosh narayanan', 'yuvan', 'marana mass', 'dance'],
    bpmRange: [128, 142],
    targetBpm: 134,
    energyLevel: 10,
    genre: 'Tamil Kuthu Folk-EDM',
    mood: 'Frenetic & Festive',
    suggestedEq: 'Bass Boost',
    suggestedFx: 'arena-live',
    suggestedVisualizer: 'circular',
    accentColor: '#fb923c',
    energyLabel: 'Kuthu Beats • 134 BPM',
    seedQueries: ['Anirudh Tamil kuthu bangers', 'Santhosh Narayanan energetic hits', 'Yuvan Shankar Raja mass songs', 'Vijay movie mass songs', 'Dhanush energetic songs'],
    vibeTag: 'Tamil Kuthu'
  },
  {
    id: 'rahman-soul-symphony',
    name: 'A.R. Rahman Soul Symphony',
    category: 'regional',
    keywords: ['rahman', 'a.r. rahman', 'spiritual', 'soulful', 'sufi', 'melody', 'hindi classics', 'tamil classics', 'nostalgia'],
    bpmRange: [75, 105],
    targetBpm: 88,
    energyLevel: 6,
    genre: 'Timeless Melodic Fusion',
    mood: 'Spiritual & Transcendent',
    suggestedEq: 'Vocal',
    suggestedFx: 'normal',
    suggestedVisualizer: 'nebula',
    accentColor: '#10b981',
    energyLabel: 'Timeless Maestro • Melodic',
    seedQueries: ['A.R. Rahman melody classics', 'A.R. Rahman Tamil soulful songs', 'AR Rahman Hindi hits', 'Kun Faya Kun Rahman', 'Dil Se Re Rahman'],
    vibeTag: 'Rahman Melody'
  },
  {
    id: 'arijit-midnight-heartbreak',
    name: 'Arijit Midnight Heartbreak',
    category: 'regional',
    keywords: ['arijit', 'arijit singh', 'sad', 'heartbreak', 'bollywood sad', 'pritam', 'emotional', 'channa mereya'],
    bpmRange: [68, 82],
    targetBpm: 74,
    energyLevel: 4,
    genre: 'Soulful Bollywood Ballad',
    mood: 'Vulnerable & Tearful',
    suggestedEq: 'Vocal',
    suggestedFx: 'normal',
    suggestedVisualizer: 'wave',
    accentColor: '#f43f5e',
    energyLabel: 'Deep Emotional • 74 BPM',
    seedQueries: ['Arijit Singh emotional sad hits', 'Pritam Arijit soulful melodies', 'Atif Aslam romantic sad', 'Mohit Chauhan acoustic', 'B Praak emotional sad'],
    vibeTag: 'Bollywood Melancholy'
  },
  {
    id: 'punjabi-global-drill',
    name: 'Punjabi Dhol & Urban Drill',
    category: 'regional',
    keywords: ['punjabi', 'diljit', 'ap dhillon', 'karan aujla', 'shubh', 'sidhu moose wala', 'dhol', 'urban desi'],
    bpmRange: [94, 108],
    targetBpm: 100,
    energyLevel: 8,
    genre: 'Punjabi Urban Wave / Drill',
    mood: 'Swagger & Confident',
    suggestedEq: 'Hip-Hop',
    suggestedFx: 'arena-live',
    suggestedVisualizer: 'bars',
    accentColor: '#f97316',
    energyLabel: 'Desi Swagger • 100 BPM',
    seedQueries: ['Diljit Dosanjh Ghost hits', 'Karan Aujla Making Memories', 'AP Dhillon Brown Munde', 'Shubh Cheques', 'Sidhu Moose Wala bangers'],
    vibeTag: 'Punjabi Drill'
  },
  {
    id: 'kpop-hyper-dance',
    name: 'K-Pop High-Octane Choreography',
    category: 'regional',
    keywords: ['kpop', 'bts', 'blackpink', 'newjeans', 'stray kids', 'le sserafim', 'k-pop dance', 'hyper pop'],
    bpmRange: [118, 134],
    targetBpm: 126,
    energyLevel: 9,
    genre: 'K-Pop Dance Anthem',
    mood: 'Vibrant & Polished',
    suggestedEq: 'Pop',
    suggestedFx: 'arena-live',
    suggestedVisualizer: 'starfield',
    accentColor: '#ec4899',
    energyLabel: 'Choreo Energy • 126 BPM',
    seedQueries: ['BTS greatest dance hits', 'NewJeans hype boy OMG', 'BLACKPINK Born Pink hits', 'LE SSERAFIM Antifragile', 'Stray Kids Maniac bangers'],
    vibeTag: 'K-Pop Dance'
  },
  {
    id: 'afrobeat-lagos-golden-hour',
    name: 'Lagos Afrobeat Golden Hour',
    category: 'regional',
    keywords: ['afrobeat', 'burna boy', 'wizkid', 'rema', 'asake', 'amapiano', 'golden hour', 'african'],
    bpmRange: [100, 115],
    targetBpm: 108,
    energyLevel: 7,
    genre: 'Afro-Fusion & Amapiano',
    mood: 'Sun-Soaked & Joyful',
    suggestedEq: 'Pop',
    suggestedFx: 'normal',
    suggestedVisualizer: 'circular',
    accentColor: '#eab308',
    energyLabel: 'Lagos Groove • 108 BPM',
    seedQueries: ['Burna Boy Last Last', 'Wizkid Essence', 'Rema Calm Down', 'Asake Amapiano hits', 'Tyla Water dance'],
    vibeTag: 'Afrobeats'
  },
  {
    id: 'latin-reggaeton-perreo',
    name: 'Latin Reggaeton Club Perreo',
    category: 'regional',
    keywords: ['reggaeton', 'bad bunny', 'feid', 'karol g', 'latin', 'dembow', 'perreo', 'puerto rico'],
    bpmRange: [92, 102],
    targetBpm: 96,
    energyLevel: 8,
    genre: 'Urban Reggaeton Dembow',
    mood: 'Hot & Irresistible',
    suggestedEq: 'Bass Boost',
    suggestedFx: 'normal',
    suggestedVisualizer: 'bars',
    accentColor: '#f43f5e',
    energyLabel: 'Dembow Rhythm • 96 BPM',
    seedQueries: ['Bad Bunny Tití Me Preguntó', 'Feid Ferxxo hits', 'Karol G QLONA', 'Rauw Alejandro Todo de Ti', 'Daddy Yankee classic reggaeton'],
    vibeTag: 'Latin Reggaeton'
  },
  {
    id: 'sufi-mystic-ecstasy',
    name: 'Sufi Mystic Qawwali Trance',
    category: 'regional',
    keywords: ['sufi', 'nusrat', 'qawwali', 'mystic', 'abida parveen', 'spiritual trance', 'dervish'],
    bpmRange: [80, 120],
    targetBpm: 95,
    energyLevel: 7,
    genre: 'Sufi Qawwali & Mystic Folk',
    mood: 'Ecstatic & Devotional',
    suggestedEq: 'Vocal',
    suggestedFx: 'arena-live',
    suggestedVisualizer: 'nebula',
    accentColor: '#059669',
    energyLabel: 'Mystic Trance • Dynamic',
    seedQueries: ['Nusrat Fateh Ali Khan classic qawwali', 'Abida Parveen sufi', 'Rahat Fateh Ali Khan melodies', 'Coke Studio sufi hits', 'Kailash Kher sufi bangers'],
    vibeTag: 'Sufi Mystic'
  },
  {
    id: 'celtic-irish-folk-hearth',
    name: 'Celtic Hearth & Fiddle',
    category: 'regional',
    keywords: ['celtic', 'irish', 'fiddle', 'folk', 'bagpipes', 'pub', 'loreena mckennitt', 'clannad'],
    bpmRange: [100, 128],
    targetBpm: 114,
    energyLevel: 6,
    genre: 'Traditional Celtic & Irish Folk',
    mood: 'Earthy & Storybook',
    suggestedEq: 'Acoustic',
    suggestedFx: 'normal',
    suggestedVisualizer: 'wave',
    accentColor: '#15803d',
    energyLabel: 'Hearthside Jig • 114 BPM',
    seedQueries: ['Loreena McKennitt The Mummer’s Dance', 'The Chieftains Irish folk', 'Clannad Theme from Harry’s Game', 'Celtic fiddle lively reels', 'Dropkick Murphys acoustic'],
    vibeTag: 'Celtic Folk'
  },

  // --- MOOD & EMOTIONAL STATES (10+) ---
  {
    id: 'golden-hour-chill',
    name: 'Golden Hour Chill',
    category: 'mood',
    keywords: ['golden hour', 'sunset', 'warm', 'chill', 'ocean', 'breeze', 'calm evening', 'afternoon warm'],
    bpmRange: [90, 110],
    targetBpm: 98,
    energyLevel: 5,
    genre: 'Indie Chill & Soft Pop',
    mood: 'Radiant & Serene',
    suggestedEq: 'Acoustic',
    suggestedFx: 'normal',
    suggestedVisualizer: 'wave',
    accentColor: '#f59e0b',
    energyLabel: 'Sunset Radiance • 98 BPM',
    seedQueries: ['Leon Bridges Texas Sun', 'Khruangbin Texas Sun', 'Surfaces Sunday Best', 'Jack Johnson Banana Pancakes', 'Lord Huron The Night We Met'],
    vibeTag: 'Golden Hour'
  },
  {
    id: '3am-slowed-reverb-cloud',
    name: '3AM Slowed + Reverb Cloud',
    category: 'mood',
    keywords: ['slowed', 'reverb', 'slowed and reverb', 'slowed reverb', 'cloud', '3am', 'ethereal', 'aesthetic'],
    bpmRange: [65, 80],
    targetBpm: 72,
    energyLevel: 3,
    genre: 'Ethereal Slowed + Reverb',
    mood: 'Detached & Hypnotic',
    suggestedEq: 'Vocal',
    suggestedFx: 'normal',
    suggestedVisualizer: 'nebula',
    suggestedSpeed: 0.88,
    accentColor: '#c084fc',
    energyLabel: 'Ethereal Cloud • 0.88x Reverb',
    seedQueries: ['The Weeknd slowed reverb', 'romantic pop slowed reverb aesthetic', 'late night aesthetic slowed', 'Billie Eilish dreamy slowed', 'Chase Atlantic slowed'],
    vibeTag: 'Slowed + Reverb'
  },
  {
    id: 'neon-noir-detective',
    name: 'Neon Noir Dark Jazz',
    category: 'mood',
    keywords: ['neon noir', 'dark jazz', 'detective', 'saxophone', 'rainy city', 'film noir', 'blade runner'],
    bpmRange: [60, 75],
    targetBpm: 66,
    energyLevel: 3,
    genre: 'Dark Jazz & Ambient Noir',
    mood: 'Brooding & Atmospheric',
    suggestedEq: 'Vocal',
    suggestedFx: '8d-orbit',
    suggestedVisualizer: 'particles',
    accentColor: '#475569',
    energyLabel: 'Neon Shadow • 66 BPM',
    seedQueries: ['Bohren & der Club of Gore', 'Kilimanjaro Darkjazz Ensemble', 'Vangelis Blade Runner Blues', 'dark jazz saxophone rainy', 'Miles Davis Ascenseur pour l’échafaud'],
    vibeTag: 'Neon Noir'
  },
  {
    id: 'dark-academia-chamber',
    name: 'Dark Academia Chamber & Cello',
    category: 'mood',
    keywords: ['dark academia', 'chamber', 'cello', 'classical', 'library', 'max richter', 'ludovico einaudi'],
    bpmRange: [60, 80],
    targetBpm: 70,
    energyLevel: 3,
    genre: 'Modern Classical & Chamber Strings',
    mood: 'Intellectual & Melancholy',
    suggestedEq: 'Classical',
    suggestedFx: 'normal',
    suggestedVisualizer: 'wave',
    accentColor: '#78350f',
    energyLabel: 'Literary Echoes • 70 BPM',
    seedQueries: ['Max Richter On The Nature of Daylight', 'Ludovico Einaudi Nuvole Bianche', 'Olafur Arnalds strings', 'Chopin Nocturnes cello', 'dark academia classical violin'],
    vibeTag: 'Dark Academia'
  },
  {
    id: 'nostalgic-2000s-anthem',
    name: '2000s Pop & MTV Nostalgia',
    category: 'mood',
    keywords: ['2000s', 'nostalgia', '00s', 'mtv', 'britney', 'rihanna', 'katy perry', 'flashback', 'throwback'],
    bpmRange: [110, 130],
    targetBpm: 120,
    energyLevel: 8,
    genre: '2000s Millennium Pop',
    mood: 'Youthful & Carefree',
    suggestedEq: 'Pop',
    suggestedFx: 'normal',
    suggestedVisualizer: 'circular',
    accentColor: '#3b82f6',
    energyLabel: 'Y2K Anthem • 120 BPM',
    seedQueries: ['Rihanna Umbrella hits', 'Britney Spears Toxic', 'Katy Perry Teenage Dream', 'Black Eyed Peas I Gotta Feeling', 'Kesha TiK ToK'],
    vibeTag: 'Y2K Pop'
  },
  {
    id: 'dreamy-cloudrap-trap',
    name: 'Dreamy Cloud Rap & Ambient Trap',
    category: 'mood',
    keywords: ['cloud rap', 'ambient trap', 'asap rocky', 'clams casino', 'yung lean', 'dreamy rap', 'floating'],
    bpmRange: [120, 140],
    targetBpm: 130,
    energyLevel: 6,
    genre: 'Cloud Rap & Floating 808s',
    mood: 'Hazy & Lucid',
    suggestedEq: 'Electronic',
    suggestedFx: '8d-orbit',
    suggestedVisualizer: 'nebula',
    accentColor: '#818cf8',
    energyLabel: 'Floating 808s • 130 BPM',
    seedQueries: ['Clams Casino I’m God', 'A$AP Rocky L$D', 'Yung Lean Kyoto', 'Travis Scott Astrothunder', 'Kid Cudi Day N Nite'],
    vibeTag: 'Cloud Rap'
  },
  {
    id: 'stargazing-celestial-chill',
    name: 'Stargazing Cosmic Chill',
    category: 'ambient',
    keywords: ['stargazing', 'celestial', 'stars', 'night sky', 'cosmos', 'weightless chill', 'interstellar'],
    bpmRange: [65, 85],
    targetBpm: 75,
    energyLevel: 3,
    genre: 'Celestial Chill & Acoustic Space',
    mood: 'Awe-Inspiring & Peaceful',
    suggestedEq: 'Flat',
    suggestedFx: '8d-orbit',
    suggestedVisualizer: 'starfield',
    accentColor: '#38bdf8',
    energyLabel: 'Cosmic Drift • 75 BPM',
    seedQueries: ['Hans Zimmer Interstellar theme', 'M83 Wait Outro', 'Sleeping At Last Saturn', 'Vancouver Sleep Clinic Someone To Stay', 'Jonsi We Bought A Zoo soundtrack'],
    vibeTag: 'Stargazing'
  },
  {
    id: 'road-trip-singalong',
    name: 'Cross-Country Road Trip Anthems',
    category: 'mood',
    keywords: ['road trip', 'singalong', 'highway', 'windows down', 'indie rock', 'killers', 'coldplay', 'car'],
    bpmRange: [110, 128],
    targetBpm: 120,
    energyLevel: 8,
    genre: 'Anthemic Indie Pop & Rock',
    mood: 'Free & Exhilarating',
    suggestedEq: 'Rock',
    suggestedFx: 'arena-live',
    suggestedVisualizer: 'wave',
    accentColor: '#0ea5e9',
    energyLabel: 'Open Highway • 120 BPM',
    seedQueries: ['The Killers Mr Brightside', 'Coldplay Viva La Vida', 'OneRepublic Counting Stars', 'Walk the Moon Shut Up and Dance', 'Foster the People Pumped Up Kicks'],
    vibeTag: 'Road Trip'
  },
  {
    id: 'rainy-day-melancholy',
    name: 'Rainy Day Melancholy & Piano',
    category: 'mood',
    keywords: ['rainy day', 'sad piano', 'crying', 'melancholy rain', 'gloomy', 'grey sky', 'lonely'],
    bpmRange: [65, 78],
    targetBpm: 70,
    energyLevel: 2,
    genre: 'Melancholic Piano & Strings',
    mood: 'Pensive & Vulnerable',
    suggestedEq: 'Acoustic',
    suggestedFx: 'normal',
    suggestedVisualizer: 'particles',
    accentColor: '#64748b',
    energyLabel: 'Grey Sky • 70 BPM',
    seedQueries: ['Yiruma River Flows in You', 'Billie Eilish when the party is over', 'Adele Someone Like You piano', 'Dean Lewis Be Alright acoustic', 'Lewis Capaldi Someone You Loved'],
    vibeTag: 'Rainy Piano'
  },
  {
    id: 'euphoric-sunset-festival',
    name: 'Sunset Euphoria & Horizon',
    category: 'mood',
    keywords: ['euphoric', 'sunset euphoria', 'avicii', 'kygo', 'tropical house', 'beach party', 'uplifting'],
    bpmRange: [118, 126],
    targetBpm: 122,
    energyLevel: 8,
    genre: 'Uplifting Melodic / Tropical Pop',
    mood: 'Blissful & Grateful',
    suggestedEq: 'Pop',
    suggestedFx: 'normal',
    suggestedVisualizer: 'circular',
    accentColor: '#f97316',
    energyLabel: 'Golden Sunset • 122 BPM',
    seedQueries: ['Avicii The Nights Wake Me Up', 'Kygo Firestone Stargazing', 'Gryffin Feel Good', 'Illenium Takeaway', 'Galantis Runaway'],
    vibeTag: 'Sunset Euphoria'
  },
  // --- AMBIENT & TRANSCENDENCE (4) ---
  {
    id: 'nordic-glacier-ambient',
    name: 'Nordic Glacier Ambient & Drone',
    category: 'ambient',
    keywords: ['nordic', 'glacier', 'ambient drone', 'aurora', 'subzero', 'brian eno', 'ice', 'polar'],
    bpmRange: [60, 72],
    targetBpm: 65,
    energyLevel: 2,
    genre: 'Subzero Ambient Drone',
    mood: 'Vast & Still',
    suggestedEq: 'Acoustic',
    suggestedFx: '8d-orbit',
    suggestedVisualizer: 'particles',
    accentColor: '#38bdf8',
    energyLabel: 'Subzero Vastness • 65 BPM',
    seedQueries: ['Brian Eno Music for Airports', 'Biosphere Substrata', 'Stars of the Lid drone', 'Hammock ambient sleep'],
    vibeTag: 'Nordic Ambient'
  },
  {
    id: 'rainforest-canopy-dusk',
    name: 'Rainforest Canopy & Field Flute',
    category: 'ambient',
    keywords: ['rainforest', 'canopy', 'nature', 'bamboo flute', 'jungle rain', 'organic ambient', 'birdsong'],
    bpmRange: [65, 78],
    targetBpm: 72,
    energyLevel: 3,
    genre: 'Organic Nature Ambient',
    mood: 'Peaceful & Grounded',
    suggestedEq: 'Acoustic',
    suggestedFx: 'normal',
    suggestedVisualizer: 'wave',
    accentColor: '#10b981',
    energyLabel: 'Canopy Rain • 72 BPM',
    seedQueries: ['Shakuhachi bamboo flute ambient', 'Rainforest acoustic field meditation', 'Native American flute rain', 'Deuter Earth Peace'],
    vibeTag: 'Rainforest Nature'
  },
  {
    id: 'deep-space-interstellar',
    name: 'Interstellar Cosmic Synth Void',
    category: 'ambient',
    keywords: ['space', 'interstellar', 'cosmic', 'void', 'hans zimmer', 'nebula space', 'astronomy', 'stars'],
    bpmRange: [60, 75],
    targetBpm: 68,
    energyLevel: 2,
    genre: 'Cosmic Cinematic Ambient',
    mood: 'Awe & Infinite Solitude',
    suggestedEq: 'Electronic',
    suggestedFx: '8d-orbit',
    suggestedVisualizer: 'nebula',
    accentColor: '#818cf8',
    energyLabel: 'Infinite Orbit • 68 BPM',
    seedQueries: ['Hans Zimmer Interstellar Stay', 'Max Richter On the Nature of Daylight', 'Solar Fields space ambient', 'Carbon Based Lifeforms interstellar'],
    vibeTag: 'Cosmic Void'
  },
  {
    id: 'meditation-singing-bowls',
    name: '432Hz Tibetan Singing Bowls & Healing',
    category: 'ambient',
    keywords: ['singing bowls', 'tibetan', '432hz', 'chakra', 'sound bath', 'sound healing', 'gong bath', 'zen meditation'],
    bpmRange: [60, 70],
    targetBpm: 60,
    energyLevel: 1,
    genre: 'Sacred Sound Bath',
    mood: 'Harmonic Equilibrium',
    suggestedEq: 'Flat',
    suggestedFx: 'normal',
    suggestedVisualizer: 'circular',
    accentColor: '#fbbf24',
    energyLabel: '432Hz Sound Bath • Harmonic',
    seedQueries: ['Tibetan singing bowls 432Hz', 'Crystal sound bath deep healing', 'Hang drum zen meditation', 'Sacred solfeggio meditation'],
    vibeTag: 'Sacred Sound Bath'
  },
  // --- EXPANDED ELECTRONIC (4) ---
  {
    id: 'berlin-minimal-techno',
    name: 'Berlin Vault Minimal Techno',
    category: 'electronic',
    keywords: ['techno', 'berlin techno', 'berghain', 'minimal techno', 'dark rumble', 'hypnotic techno', 'tresor'],
    bpmRange: [126, 136],
    targetBpm: 132,
    energyLevel: 9,
    genre: 'Dark Peak Minimal Techno',
    mood: 'Hypnotic & Relentless',
    suggestedEq: 'Electronic',
    suggestedFx: 'normal',
    suggestedVisualizer: 'bars',
    accentColor: '#475569',
    energyLabel: 'Berghain Pulse • 132 BPM',
    seedQueries: ['Boris Brejcha minimal techno', 'Richie Hawtin Plastikman', 'Tale of Us Afterlife techno', 'Charlotte de Witte peak techno'],
    vibeTag: 'Berlin Techno'
  },
  {
    id: 'downtempo-trip-hop',
    name: 'Bristol Dusk Trip-Hop & Vinyl',
    category: 'electronic',
    keywords: ['trip hop', 'trip-hop', 'massive attack', 'portishead', 'bristol', 'downtempo electronic', 'tricky'],
    bpmRange: [78, 92],
    targetBpm: 84,
    energyLevel: 5,
    genre: 'Classic Bristol Trip-Hop',
    mood: 'Smoky & Atmospheric',
    suggestedEq: 'Electronic',
    suggestedFx: 'normal',
    suggestedVisualizer: 'wave',
    accentColor: '#a855f7',
    energyLabel: 'Smoky Groove • 84 BPM',
    seedQueries: ['Massive Attack Teardrop', 'Portishead Glory Box', 'Morcheeba The Sea', 'Sneaker Pimps 6 Underground', 'Zero 7 Destiny'],
    vibeTag: 'Bristol Trip-Hop'
  },
  {
    id: 'uk-drill-garage',
    name: 'London Midnight UK Garage & 2-Step',
    category: 'electronic',
    keywords: ['uk garage', 'ukg', '2-step', 'overmono', 'fred again', 'bicep', 'syncopated bass', 'london club'],
    bpmRange: [130, 138],
    targetBpm: 134,
    energyLevel: 8,
    genre: 'Modern UK Garage / 2-Step',
    mood: 'Euphoric Kineticism',
    suggestedEq: 'Electronic',
    suggestedFx: 'normal',
    suggestedVisualizer: 'wave',
    accentColor: '#06b6d4',
    energyLabel: 'London Shuffle • 134 BPM',
    seedQueries: ['Overmono Good Lies', 'Fred again.. Delilah', 'Bicep Glue', 'Disclosure garage bangers', 'Sammy Virji UK garage'],
    vibeTag: 'UK Garage'
  },
  {
    id: 'synthwave-outrun-chase',
    name: 'Outrun 80s Highway Pursuit',
    category: 'electronic',
    keywords: ['outrun chase', 'police chase', 'laser synth', 'perturbator', 'carpenter brut', '80s arpeggio', 'high speed synth'],
    bpmRange: [124, 140],
    targetBpm: 130,
    energyLevel: 9,
    genre: 'High-Octane Darksynth / Outrun',
    mood: 'High-Speed Adrenaline',
    suggestedEq: 'Electronic',
    suggestedFx: '8d-orbit',
    suggestedVisualizer: 'starfield',
    accentColor: '#ef4444',
    energyLabel: 'Pursuit Mode • 130 BPM',
    seedQueries: ['Carpenter Brut Turbo Killer', 'Perturbator Future Club', 'Dance With the Dead Riot', 'Magic Sword In The Face Of Evil'],
    vibeTag: 'Outrun Pursuit'
  },
  // --- EXPANDED HIGH ENERGY (3) ---
  {
    id: 'cyber-dnb-neurofunk',
    name: 'Neurofunk Cyber D&B Velocity',
    category: 'high_energy',
    keywords: ['neurofunk', 'drum and bass', 'dnb banger', 'noisia', 'mefjus', 'camo & krooked', 'fast bass', '174 bpm'],
    bpmRange: [170, 178],
    targetBpm: 174,
    energyLevel: 10,
    genre: 'Neurofunk Drum & Bass',
    mood: 'Maximum Velocity & Tech Precision',
    suggestedEq: 'Bass Boost',
    suggestedFx: 'arena-live',
    suggestedVisualizer: 'bars',
    accentColor: '#f43f5e',
    energyLabel: 'Kinetic 174 BPM • Neurofunk',
    seedQueries: ['Noisia The Upbeats Dead Limit', 'Mefjus Blitz', 'Chase and Status Baddadan', 'Sub Focus solar system dnb'],
    vibeTag: 'Neurofunk DnB'
  },
  {
    id: 'brazilian-funk-favela',
    name: 'Rio Baile Funk Favela Boom',
    category: 'high_energy',
    keywords: ['baile funk', 'brazilian funk', 'favela', 'tamborzao', 'kondzilla', 'mc poze', 'funk rj', 'funk sp'],
    bpmRange: [126, 136],
    targetBpm: 130,
    energyLevel: 9,
    genre: 'Baile Funk & Tamborzão',
    mood: 'Raw Swagger & Festive Shock',
    suggestedEq: 'Bass Boost',
    suggestedFx: 'arena-live',
    suggestedVisualizer: 'bars',
    accentColor: '#10b981',
    energyLabel: 'Rio Tamborzão • 130 BPM',
    seedQueries: ['Baile funk brasil top hits', 'MC Poze do Rodo hits', 'Funk favela bass bangers', 'Pedro Sampaio funk mix'],
    vibeTag: 'Baile Funk'
  },
  {
    id: 'rock-stadium-overdrive',
    name: 'Stadium Hard Rock & Distortion',
    category: 'high_energy',
    keywords: ['stadium rock', 'hard rock', 'guitar solo', 'distortion', 'ac/dc', 'guns n roses', 'foo fighters', 'metallica'],
    bpmRange: [120, 140],
    targetBpm: 130,
    energyLevel: 9,
    genre: 'Anthemic Stadium Hard Rock',
    mood: 'Raw Power & Electrifying Grit',
    suggestedEq: 'Rock',
    suggestedFx: 'arena-live',
    suggestedVisualizer: 'bars',
    accentColor: '#f97316',
    energyLabel: 'Overdrive Grit • 130 BPM',
    seedQueries: ['Foo Fighters Everlong rock', 'AC/DC Thunderstruck', 'Guns N Roses Welcome to the Jungle', 'Muse Hysteria rock'],
    vibeTag: 'Stadium Rock'
  },
  // --- EXPANDED REGIONAL (4) ---
  {
    id: 'carnatic-progressive-rock',
    name: 'Carnatic Fusion & Electric Veena',
    category: 'regional',
    keywords: ['carnatic', 'carnatic rock', 'thaikkudam bridge', 'agam', 'ragam', 'indian rock', 'indian progressive'],
    bpmRange: [100, 120],
    targetBpm: 110,
    energyLevel: 8,
    genre: 'Indian Classical Progressive Rock',
    mood: 'Intricate Virtuosity & Fire',
    suggestedEq: 'Rock',
    suggestedFx: 'arena-live',
    suggestedVisualizer: 'nebula',
    accentColor: '#e11d48',
    energyLabel: 'Ragam Surge • 110 BPM',
    seedQueries: ['Thaikkudam Bridge Fish Rock', 'Agam progressive rock Malhar', 'Avial Malayalam rock', 'Pineapple Express carnatic fusion'],
    vibeTag: 'Carnatic Rock'
  },
  {
    id: 'japanese-city-pop-breeze',
    name: 'Tokyo 1986 Japanese City Pop',
    category: 'regional',
    keywords: ['city pop', 'japanese city pop', 'mariya takeuchi', 'tatsuro yamashita', 'miki matsubara', '80s tokyo', 'plastic love'],
    bpmRange: [108, 122],
    targetBpm: 115,
    energyLevel: 7,
    genre: 'Vintage Japanese City Pop',
    mood: 'Breezy & Sophisticated Nostalgia',
    suggestedEq: 'Pop',
    suggestedFx: 'normal',
    suggestedVisualizer: 'wave',
    accentColor: '#ec4899',
    energyLabel: 'Tokyo Boulevard • 115 BPM',
    seedQueries: ['Mariya Takeuchi Plastic Love', 'Miki Matsubara Stay With Me', 'Tatsuro Yamashita Sparkle', 'Anri Remember Summer Days'],
    vibeTag: 'Tokyo City Pop'
  },
  {
    id: 'amapiano-johannesburg-logdrum',
    name: 'South African Amapiano Log Drum Groove',
    category: 'regional',
    keywords: ['amapiano', 'log drum', 'south african', 'kabza de small', 'dj maphorisa', 'tyla', 'johannesburg groove'],
    bpmRange: [110, 118],
    targetBpm: 113,
    energyLevel: 7,
    genre: 'Amapiano Deep Log Drum',
    mood: 'Hypnotic Bounce & Soulful Warmth',
    suggestedEq: 'Bass Boost',
    suggestedFx: 'normal',
    suggestedVisualizer: 'wave',
    accentColor: '#f59e0b',
    energyLabel: 'Log Drum Bounce • 113 BPM',
    seedQueries: ['Kabza De Small amapiano hits', 'Tyler ICU amapiano', 'Tyla Water dance groove', 'Uncle Waffles amapiano mix'],
    vibeTag: 'Amapiano Groove'
  },
  {
    id: 'arabic-desert-oud-groove',
    name: 'Levantine Desert Oud & Groove',
    category: 'regional',
    keywords: ['oud', 'arabic', 'middle eastern', 'habibi funk', 'desert groove', 'oriental electronic', 'microtonal'],
    bpmRange: [92, 110],
    targetBpm: 102,
    energyLevel: 7,
    genre: 'Oriental Desert Groove & Oud Fusion',
    mood: 'Mystical & Hypnotic Swagger',
    suggestedEq: 'Acoustic',
    suggestedFx: 'normal',
    suggestedVisualizer: 'circular',
    accentColor: '#d97706',
    energyLabel: 'Desert Caravan • 102 BPM',
    seedQueries: ['Habibi Funk greatest hits', 'Acid Arab oriental electronic', 'Omar Souleyman wedding dabke', 'Dhafer Youssef oud fusion'],
    vibeTag: 'Desert Oud Fusion'
  },
  // --- EXPANDED MOOD (3) ---
  {
    id: 'rainy-tokyo-neon-melancholy',
    name: 'Midnight Shinjuku Rainy Neon',
    category: 'mood',
    keywords: ['shinjuku', 'tokyo rain', 'lost in translation', 'midnight city rain', 'neon reflections', 'downtempo rain'],
    bpmRange: [72, 85],
    targetBpm: 78,
    energyLevel: 4,
    genre: 'Cinematic Rainy Neon Downtempo',
    mood: 'Nocturnal Solitude & Yearning',
    suggestedEq: 'Electronic',
    suggestedFx: '8d-orbit',
    suggestedVisualizer: 'particles',
    accentColor: '#0ea5e9',
    energyLabel: 'Midnight Rain • 78 BPM',
    seedQueries: ['Burial Archangel night', 'Kavinsky Nightcall slowed', 'Tycho rainy day ambient', 'Lorn Acid Rain'],
    vibeTag: 'Shinjuku Rain'
  },
  {
    id: 'golden-hour-coastal-cruise',
    name: 'Pacific Highway Golden Sunset Cruise',
    category: 'mood',
    keywords: ['coastal cruise', 'pacific highway', 'windows down', 'warm groove', 'california sunset', 'yacht rock'],
    bpmRange: [98, 112],
    targetBpm: 104,
    energyLevel: 6,
    genre: 'Warm Coastal Funk & Indie Groove',
    mood: 'Sun-Drenched Carefree Freedom',
    suggestedEq: 'Pop',
    suggestedFx: 'normal',
    suggestedVisualizer: 'wave',
    accentColor: '#f59e0b',
    energyLabel: 'PCH Sunset • 104 BPM',
    seedQueries: ['Men I Trust Show Me How', 'Parcels Overnight', 'Still Woozy Goodie Bag', 'Tame Impala Breathe Deeper'],
    vibeTag: 'Coastal Cruise'
  },
  {
    id: 'late-night-coding-synthwave-rain',
    name: 'Late Night Coding Synthwave & Rain',
    category: 'electronic',
    keywords: ['late night coding', 'coding synthwave', 'synthwave with rain', 'developer flow', 'terminal synth', 'hacker lo-fi'],
    bpmRange: [105, 122],
    targetBpm: 114,
    energyLevel: 6,
    genre: 'Nocturnal Coding Synthwave',
    mood: 'Laser Focus & Rainy Solitude',
    suggestedEq: 'Electronic',
    suggestedFx: '8d-orbit',
    suggestedVisualizer: 'starfield',
    accentColor: '#6366f1',
    energyLabel: 'Cyber Terminal • 114 BPM',
    seedQueries: ['The Midnight Days of Thunder', 'Kavinsky synthwave', 'HOME Resonance synth', 'Com Truise coding flow'],
    vibeTag: 'Rainy Synthwave Code'
  }
];

// ============================================================================
// 2. NATURAL LANGUAGE PROMPT PARSER
// ============================================================================

export interface ParsedVibePrompt {
  rawPrompt: string;
  cleanedPrompt: string;
  matchedVibe: MicroVibeDefinition;
  detectedBpmRange: [number, number];
  targetBpm: number;
  detectedEnergy: number; // 1-10
  detectedMood: string;
  detectedActivity: string;
  detectedTimeOfDay: string;
  detectedGenres: string[];
  suggestedEq: string;
  suggestedFx: StudioFXMode;
  suggestedVisualizer: VisualizerStyle;
  suggestedSpeed?: number;
  accentColor: string;
  energyLabel: string;
  generatedQueries: string[];
}

export function parseVibePrompt(prompt: string): ParsedVibePrompt {
  const lower = (prompt || '').toLowerCase().trim();

  // 1. Detect explicit BPM if typed by user (e.g. "140 bpm", "128bpm")
  let userBpm: number | null = null;
  const bpmMatch = lower.match(/(\d{2,3})\s*(?:bpm|tempo)/i);
  if (bpmMatch && bpmMatch[1]) {
    const val = parseInt(bpmMatch[1], 10);
    if (val >= 50 && val <= 220) userBpm = val;
  }

  // 2. Detect Activity
  let detectedActivity = 'general';
  if (/(gym|workout|lift|deadlift|bench|sprint|hiit|run|running|cardio|pr|sweat)/.test(lower)) {
    detectedActivity = 'workout';
  } else if (/(code|coding|dev|program|terminal|debug|algorithm)/.test(lower)) {
    detectedActivity = 'coding';
  } else if (/(study|read|reading|homework|exam|library|write|focus)/.test(lower)) {
    detectedActivity = 'study';
  } else if (/(drive|driving|highway|cruise|cruising|night drive|car)/.test(lower)) {
    detectedActivity = 'drive';
  } else if (/(sleep|insomnia|rest|bed|nap|relax)/.test(lower)) {
    detectedActivity = 'sleep';
  } else if (/(party|club|rave|festival|dance|pregame)/.test(lower)) {
    detectedActivity = 'party';
  }

  // 3. Detect Time of Day
  let detectedTimeOfDay = 'anytime';
  if (/(3am|2am|late night|midnight|1am|4am|insomnia)/.test(lower)) {
    detectedTimeOfDay = 'late_night';
  } else if (/(morning|sunrise|dawn|breakfast|coffee morning)/.test(lower)) {
    detectedTimeOfDay = 'morning';
  } else if (/(sunset|golden hour|dusk|evening|afternoon)/.test(lower)) {
    detectedTimeOfDay = 'golden_hour';
  }

  // 4. Score all micro-vibes in taxonomy against user prompt
  let bestMatch = VIBE_TAXONOMY[0];
  let highestScore = -1;

  for (const vibe of VIBE_TAXONOMY) {
    let score = 0;
    // Check keywords
    for (const kw of vibe.keywords) {
      if (lower.includes(kw)) {
        score += kw.length > 5 ? 3 : 2;
      }
    }
    // Check taxonomy name
    if (lower.includes(vibe.name.toLowerCase())) {
      score += 5;
    }
    // Check activity alignment
    if (detectedActivity === 'workout' && (vibe.category === 'high_energy' || vibe.id.includes('phonk'))) score += 4;
    if (detectedActivity === 'coding' && (vibe.id.includes('focus') || vibe.id.includes('rain') || vibe.id.includes('cyberpunk') || vibe.id.includes('coding'))) score += 4;
    if (detectedActivity === 'study' && (vibe.category === 'lofi_chill' || vibe.id.includes('study'))) score += 4;
    if (detectedActivity === 'drive' && (vibe.id.includes('drive') || vibe.id.includes('retrowave') || vibe.id.includes('highway') || vibe.id.includes('cruise') || vibe.id.includes('pursuit'))) score += 4;
    if (detectedActivity === 'sleep' && (vibe.category === 'ambient' || vibe.id.includes('lofi') || vibe.energyLevel <= 3)) score += 4;
    if (detectedActivity === 'party' && (vibe.energyLevel >= 8 || vibe.category === 'high_energy')) score += 4;

    // Check time-of-day alignment
    if (detectedTimeOfDay === 'late_night' && (vibe.name.includes('Night') || vibe.id.includes('3am') || vibe.id.includes('midnight') || vibe.id.includes('late-night'))) score += 3;
    if (detectedTimeOfDay === 'morning' && (vibe.name.includes('Morning') || vibe.name.includes('Sunlight') || vibe.name.includes('Pastoral'))) score += 3;
    if (detectedTimeOfDay === 'golden_hour' && (vibe.name.includes('Golden') || vibe.name.includes('Sunset') || vibe.id.includes('autumn') || vibe.id.includes('afternoon'))) score += 3;

    // Check explicit BPM closeness if provided
    if (userBpm !== null) {
      const diff = Math.abs(vibe.targetBpm - userBpm);
      if (diff <= 8) score += 4;
      else if (diff <= 18) score += 2;
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = vibe;
    }
  }

  // Fallback defaults if very general prompt
  const targetBpm = userBpm ?? bestMatch.targetBpm;
  const detectedEnergy = bestMatch.energyLevel;
  const detectedMood = bestMatch.mood;
  const detectedGenres = [bestMatch.genre];

  // Synthesize progressive search queries
  const synthesizedQueries = [...bestMatch.seedQueries];
  const cleaned = lower.replace(/playlist|songs|music|tracks|mix|prepare|give|me|create/gi, '').trim();
  if (cleaned.length > 3 && !synthesizedQueries.some((q) => q.toLowerCase().includes(cleaned))) {
    synthesizedQueries.unshift(`${cleaned} top hits`, `${cleaned} audio`);
  }

  return {
    rawPrompt: prompt,
    cleanedPrompt: cleaned,
    matchedVibe: bestMatch,
    detectedBpmRange: bestMatch.bpmRange,
    targetBpm,
    detectedEnergy,
    detectedMood,
    detectedActivity,
    detectedTimeOfDay,
    detectedGenres,
    suggestedEq: bestMatch.suggestedEq,
    suggestedFx: bestMatch.suggestedFx,
    suggestedVisualizer: bestMatch.suggestedVisualizer,
    suggestedSpeed: bestMatch.suggestedSpeed,
    accentColor: bestMatch.accentColor,
    energyLabel: bestMatch.energyLabel,
    generatedQueries: Array.from(new Set(synthesizedQueries)).slice(0, 6)
  };
}

// ============================================================================
// 3. DETERMINISTIC ACOUSTIC ESTIMATOR PER TRACK
// ============================================================================

/**
 * Deterministically computes estimated BPM, mood tag, and energy rating (1-10)
 * for any given track using harmonic heuristics, artist ontology, and duration.
 */
export function estimateTrackAcoustics(
  track: Track,
  vibeContext?: Partial<AcousticInsights>
): AcousticInsights {
  // If track already has pre-populated acoustics, preserve them
  if (track.bpm && track.energy) {
    return {
      bpm: track.bpm,
      mood: track.mood || vibeContext?.mood || 'Harmonic',
      energy: track.energy,
      vibeTag: track.vibeTag || vibeContext?.vibeTag || 'AI Soundstage',
      genre: track.genre || vibeContext?.genre || 'Studio'
    };
  }

  const titleLower = (track.title || '').toLowerCase();
  const artistLower = (track.artist || '').toLowerCase();
  const combined = `${titleLower} ${artistLower}`;

  let bpm = vibeContext?.bpm || 115;
  let energy = vibeContext?.energy || 6;
  let mood = vibeContext?.mood || 'Harmonic';
  let vibeTag = vibeContext?.vibeTag || 'AI Soundstage';
  const genre = track.genre || vibeContext?.genre || 'Studio';

  // Keyword modifiers
  if (/phonk|drift|hardstyle|metal|aggressive|pr|rage|death|heavy/i.test(combined)) {
    bpm = Math.max(bpm, 142);
    energy = Math.min(10, Math.max(energy, 9));
    mood = 'Adrenaline Overdrive';
    vibeTag = 'High Energy PR';
  } else if (/slowed|reverb|ambient|sleep|relax|rain|calm|zen|meditation/i.test(combined)) {
    bpm = Math.min(bpm, 74);
    energy = Math.max(2, Math.min(energy, 4));
    mood = 'Deep Relax';
    vibeTag = 'Chill Horizon';
  } else if (/kuthu|mass|banger|edm|club|dance|party|festival/i.test(combined)) {
    bpm = Math.max(126, bpm);
    energy = Math.min(10, Math.max(energy, 8));
    mood = 'Festival Hype';
    vibeTag = 'Dancefloor Velocity';
  } else if (/acoustic|piano|unplugged|folk|indie folk|coffee/i.test(combined)) {
    bpm = Math.min(94, bpm);
    energy = Math.max(3, Math.min(energy, 5));
    mood = 'Organic Warmth';
    vibeTag = 'Acoustic Soul';
  } else if (/sad|heartbreak|crying|lonely|alone|melancholy/i.test(combined)) {
    bpm = Math.min(84, bpm);
    energy = Math.max(3, Math.min(energy, 4));
    mood = 'Vulnerable Emotion';
    vibeTag = 'Midnight Tears';
  }

  // Hash-based subtle dispersion (deterministic based on track title & artist) so tracks aren't all identical
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash * 31 + combined.charCodeAt(i)) & 0xfffff;
  }
  const varianceBpm = (hash % 11) - 5; // ±5 BPM
  const finalBpm = Math.max(55, Math.min(185, bpm + varianceBpm));

  return {
    bpm: finalBpm,
    mood,
    energy,
    vibeTag,
    genre
  };
}

// ============================================================================
// 4. ENERGY FLOW CURVE SORTER
// ============================================================================

/**
 * Organizes tracks according to the requested Energy Flow Curve:
 * 1. "wave": Wave Flow (Gentle warm-up -> Peak crescendo -> Smooth cool-down)
 * 2. "peak": Peak Energy (High octane, sustained fast BPM)
 * 3. "steady": Deep Steady (Consistent hypnotic flow)
 */
export function applyEnergyCurve(
  tracks: Track[],
  curve: VibeEnergyCurve
): Track[] {
  if (tracks.length <= 2) return [...tracks];

  const enriched = tracks.map((t) => ({
    track: t,
    acoustics: estimateTrackAcoustics(t)
  }));

  if (curve === 'peak') {
    // Highest energy and tempo sustained first and throughout
    return enriched
      .sort((a, b) => {
        const scoreB = b.acoustics.energy * 20 + b.acoustics.bpm;
        const scoreA = a.acoustics.energy * 20 + a.acoustics.bpm;
        return scoreB - scoreA;
      })
      .map((item) => {
        item.track.bpm = item.acoustics.bpm;
        item.track.mood = item.acoustics.mood;
        item.track.energy = item.acoustics.energy;
        item.track.vibeTag = item.acoustics.vibeTag;
        return item.track;
      });
  }

  if (curve === 'steady') {
    // Minimal BPM delta from track to track (smooth gradient)
    const sorted = [...enriched].sort((a, b) => a.acoustics.bpm - b.acoustics.bpm);
    const medianIndex = Math.floor(sorted.length / 2);
    const medianBpm = sorted[medianIndex]?.acoustics.bpm || 110;

    // Order tracks outward from median BPM for consistent hypnotic flow
    const steadySorted = [...sorted].sort((a, b) => {
      const diffA = Math.abs(a.acoustics.bpm - medianBpm);
      const diffB = Math.abs(b.acoustics.bpm - medianBpm);
      return diffA - diffB;
    });

    return steadySorted.map((item) => {
      item.track.bpm = item.acoustics.bpm;
      item.track.mood = item.acoustics.mood;
      item.track.energy = item.acoustics.energy;
      item.track.vibeTag = item.acoustics.vibeTag;
      return item.track;
    });
  }

  // Default: 'wave' (Wave Flow)
  // Warm-up (lower energy/BPM) -> Build-up -> Peak Crescendo at 60-70% mark -> Smooth Cool-down
  const sortedByEnergy = [...enriched].sort((a, b) => a.acoustics.energy - b.acoustics.energy);
  const total = sortedByEnergy.length;
  const warmupCount = Math.max(1, Math.floor(total * 0.25));
  const cooldownCount = Math.max(1, Math.floor(total * 0.2));

  // Warmup tracks: lowest energy
  const warmup = sortedByEnergy.slice(0, warmupCount);
  // Cooldown tracks: next lowest energy (relaxed landing)
  const cooldown = sortedByEnergy.slice(warmupCount, warmupCount + cooldownCount);
  // Build and peak: highest energy
  const buildAndPeak = sortedByEnergy.slice(warmupCount + cooldownCount);

  // Order build up into peak crescendo
  buildAndPeak.sort((a, b) => a.acoustics.bpm - b.acoustics.bpm);

  const sequenced = [...warmup, ...buildAndPeak, ...cooldown.reverse()];

  return sequenced.map((item) => {
    item.track.bpm = item.acoustics.bpm;
    item.track.mood = item.acoustics.mood;
    item.track.energy = item.acoustics.energy;
    item.track.vibeTag = item.acoustics.vibeTag;
    return item.track;
  });
}

// ============================================================================
// 5. OPTIONAL LLM INTEGRATION (GEMINI / OPENAI)
// ============================================================================

interface LlmVibeResponse {
  title?: string;
  storyNotes?: string;
  seedQueries?: string[];
  suggestedEq?: string;
  suggestedFx?: StudioFXMode;
  visualizerStyle?: VisualizerStyle;
  accentColor?: string;
  energyLabel?: string;
}

async function tryQueryLlmEngine(prompt: string): Promise<LlmVibeResponse | null> {
  const settings = useSettingsStore.getState();
  const provider = settings.aiApiProvider || 'none';
  const apiKey = (settings.aiApiKey || '').trim();

  if (provider === 'none' || !apiKey) {
    return null;
  }

  const systemInstructions =
    'You are WaveCraft AI Smart DJ, an elite audio engineer and live soundstage curator. Given a user music vibe prompt, return pure JSON with keys: title (string), storyNotes (engaging 1-2 sentence DJ commentary about the sonic flow), seedQueries (array of 5-6 high-accuracy song/artist search queries), suggestedEq (one of: Flat, Acoustic, Bass Boost, Electronic, Hip-Hop, Classical, Vocal, Rock), suggestedFx (normal, 8d-orbit, or arena-live), visualizerStyle (nebula, starfield, particles, wave, bars, circular), accentColor (hex), energyLabel (e.g. "Peak Kinetic • 130 BPM"). Return ONLY raw JSON without markdown code fences.';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500); // 6.5s timeout for ultra fast fallback

    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemInstructions}\n\nUser Vibe Prompt: "${prompt}"` }]
            }
          ]
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) return null;
      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) return null;
      const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson) as LlmVibeResponse;
    }

    if (provider === 'openai') {
      const url = 'https://api.openai.com/v1/chat/completions';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemInstructions },
            { role: 'user', content: `User Vibe Prompt: "${prompt}"` }
          ],
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) return null;
      const data = await res.json();
      const rawText = data?.choices?.[0]?.message?.content;
      if (!rawText) return null;
      return JSON.parse(rawText) as LlmVibeResponse;
    }
  } catch (err) {
    // Silent graceful fallback to built-in semantic engine
    console.warn('[WaveCraft AI DJ] LLM provider query skipped/failed, using Built-in Semantic Engine:', err);
  }

  return null;
}

// ============================================================================
// 6. LIQUID-GRADIENT CANVAS COVER ART GENERATOR
// ============================================================================

/**
 * Creates a vibrant, studio-grade liquid gradient cover art image for the generated AI playlist.
 * Works seamlessly in browser (Canvas) and falls back safely to SVG Data URL in node/SSR environments.
 */
export function generateLiquidVibeCoverArt(
  title: string,
  accentColor = '#fa2d48',
  energyLabel = 'AI SMART DJ SET'
): string {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    // High-resolution SVG data URI fallback for non-browser/test runners
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>
        <radialGradient id="g1" cx="20%" cy="20%" r="80%">
          <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.9"/>
          <stop offset="60%" stop-color="#4f46e5" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#09090b" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <rect width="512" height="512" fill="url(#g1)"/>
      <text x="50" y="420" font-family="sans-serif" font-weight="900" font-size="28" fill="#ffffff">${title.slice(0, 22)}</text>
      <text x="50" y="455" font-family="sans-serif" font-weight="700" font-size="14" fill="#ffffff" opacity="0.7">${energyLabel}</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Dark sleek backdrop
    ctx.fillStyle = '#06060c';
    ctx.fillRect(0, 0, 600, 600);

    // Multi-point radial liquid aura orbs
    const grad1 = ctx.createRadialGradient(160, 150, 20, 200, 180, 380);
    grad1.addColorStop(0, accentColor);
    grad1.addColorStop(0.65, '#6366f1');
    grad1.addColorStop(1, 'transparent');
    ctx.fillStyle = grad1;
    ctx.fillRect(0, 0, 600, 600);

    const grad2 = ctx.createRadialGradient(450, 420, 30, 420, 390, 340);
    grad2.addColorStop(0, '#a855f7');
    grad2.addColorStop(0.7, '#ec4899');
    grad2.addColorStop(1, 'transparent');
    ctx.fillStyle = grad2;
    ctx.fillRect(0, 0, 600, 600);

    // Subtle vinyl groove rings
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    for (let r = 80; r < 280; r += 28) {
      ctx.beginPath();
      ctx.arc(300, 300, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Glass panel vignette at bottom
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(36, 430, 528, 134);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(36, 430, 528, 134);

    // Typography
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 24px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
    const displayTitle = title.length > 26 ? `${title.slice(0, 24)}...` : title;
    ctx.fillText(displayTitle, 60, 480);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = '700 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
    ctx.fillText(`✨ ${energyLabel.toUpperCase()} • WAVECRAFT STUDIO`, 60, 515);

    return canvas.toDataURL('image/jpeg', 0.92);
  } catch {
    return '';
  }
}

// ============================================================================
// 7. CORE AI DJ GENERATOR ENGINE
// ============================================================================

export interface GenerateAiDjMixOptions {
  prompt: string;
  energyCurve?: VibeEnergyCurve;
  autoTuneStudio?: boolean;
}

export async function generateAiDjMix({
  prompt,
  energyCurve = 'wave',
  autoTuneStudio = true
}: GenerateAiDjMixOptions): Promise<AiDjMix> {
  const cleanInput = (prompt || '').trim() || 'Midnight Cyber Highway';

  // 1. Parse prompt through rich Semantic Vibe Engine
  const semanticParsed = parseVibePrompt(cleanInput);

  // 2. Check for optional LLM reasoning integration (Gemini / OpenAI)
  const llmResult = await tryQueryLlmEngine(cleanInput);

  const providerUsed: 'semantic' | 'gemini' | 'openai' = llmResult
    ? (useSettingsStore.getState().aiApiProvider as 'gemini' | 'openai') || 'semantic'
    : 'semantic';

  const title =
    llmResult?.title ||
    `${semanticParsed.matchedVibe.name} • AI DJ Set`;

  const storyNotes =
    llmResult?.storyNotes ||
    `Curated by WaveCraft AI DJ for "${cleanInput}". Engineered with harmonic tempo sequencing, automatic ${semanticParsed.suggestedEq} EQ mastering, and 320kbps continuous playback.`;

  const eqPreset = llmResult?.suggestedEq || semanticParsed.suggestedEq;
  const fxMode = llmResult?.suggestedFx || semanticParsed.suggestedFx;
  const visualizerStyle = (llmResult?.visualizerStyle as VisualizerStyle) || semanticParsed.suggestedVisualizer;
  const accentColor = llmResult?.accentColor || semanticParsed.accentColor;
  const energyLabel = llmResult?.energyLabel || semanticParsed.energyLabel;

  const queries =
    llmResult?.seedQueries && llmResult.seedQueries.length >= 3
      ? llmResult.seedQueries
      : semanticParsed.generatedQueries;

  // 3. Auto-tune Studio FX, visualizer, & EQ if requested
  if (autoTuneStudio) {
    try {
      useSettingsStore.getState().setEqualizerPreset(eqPreset);
      useSettingsStore.getState().setVisualizerStyle(visualizerStyle);
      useSettingsStore.getState().setAccentColor(accentColor);
      if (fxMode && fxMode !== 'normal') {
        useStudioStore.getState().setFxMode(fxMode);
      }
      if (semanticParsed.suggestedSpeed && semanticParsed.suggestedSpeed !== 1.0) {
        usePlayerStore.getState().setPlaybackSpeed(semanticParsed.suggestedSpeed);
      }
    } catch {}
  }

  // 4. Query YouTube & iTunes search concurrently with progressive fallback
  const [ytResults, itunesResults] = await Promise.all([
    Promise.all(queries.map((q) => searchTracks(q).catch(() => [] as Track[]))),
    Promise.all(queries.map((q) => searchItunesSongs(q, 15).catch(() => [] as Track[])))
  ]);

  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  const candidateTracks: Track[] = [];

  const maxLen = Math.max(
    ...ytResults.map((r) => r.length),
    ...itunesResults.map((r) => r.length),
    0
  );

  for (let i = 0; i < maxLen; i++) {
    for (let qIdx = 0; qIdx < queries.length; qIdx++) {
      const ytTrack = ytResults[qIdx]?.[i];
      const itunesTrack = itunesResults[qIdx]?.[i];

      const queue = [ytTrack, itunesTrack].filter(Boolean) as Track[];
      for (const track of queue) {
        const fp = `${track.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16)}__${track.artist.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)}`;
        if (!seenIds.has(track.id) && !seenFingerprints.has(fp)) {
          seenIds.add(track.id);
          seenFingerprints.add(fp);
          candidateTracks.push(track);
        }
        if (candidateTracks.length >= 26) break;
      }
      if (candidateTracks.length >= 26) break;
    }
    if (candidateTracks.length >= 26) break;
  }

  // 5. Progressive Fallback Matching if fewer than 15 tracks
  if (candidateTracks.length < 15) {
    const fallbackQueries = [
      `${semanticParsed.matchedVibe.genre} greatest hits`,
      `${semanticParsed.matchedVibe.vibeTag} essential mix`,
      `${cleanInput} top trending songs`
    ];
    const [fbYt, fbItunes] = await Promise.all([
      Promise.all(fallbackQueries.map((q) => searchTracks(q).catch(() => [] as Track[]))),
      Promise.all(fallbackQueries.map((q) => searchItunesSongs(q, 15).catch(() => [] as Track[])))
    ]);

    for (let idx = 0; idx < fallbackQueries.length; idx++) {
      const combined = [...(fbYt[idx] || []), ...(fbItunes[idx] || [])];
      for (const track of combined) {
        const fp = `${track.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16)}__${track.artist.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)}`;
        if (!seenIds.has(track.id) && !seenFingerprints.has(fp)) {
          seenIds.add(track.id);
          seenFingerprints.add(fp);
          candidateTracks.push(track);
        }
        if (candidateTracks.length >= 22) break;
      }
      if (candidateTracks.length >= 22) break;
    }
  }

  // 5b. Offline / isolated seed tracks fallback to guarantee 15-25 tracks set
  if (candidateTracks.length < 15) {
    for (const sq of semanticParsed.matchedVibe.seedQueries) {
      const fallbackId = `ai_seed_${sq.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 24)}`;
      if (!seenIds.has(fallbackId)) {
        seenIds.add(fallbackId);
        const parts = sq.split(' ');
        const artist = parts.slice(0, 2).join(' ');
        const title = parts.slice(2).join(' ') || sq;
        candidateTracks.push({
          id: fallbackId,
          title: title || sq,
          artist: artist || 'WaveCraft Vibe',
          album: `${semanticParsed.matchedVibe.name} AI Edition`,
          duration: 210,
          thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
          thumbnailLarge: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
          quality: '320kbps Studio AAC'
        });
      }
      if (candidateTracks.length >= 20) break;
    }
  }

  // 6. Enrich tracks with acoustic metadata and sequence according to Energy Curve
  const sliced = candidateTracks.slice(0, 24);
  const orderedTracks = applyEnergyCurve(sliced, energyCurve);

  // 7. Auto-generate liquid gradient cover art
  const coverArt = generateLiquidVibeCoverArt(title, accentColor, energyLabel);

  return {
    title,
    subtitle: `${semanticParsed.matchedVibe.name} • ${orderedTracks.length} tracks`,
    prompt: cleanInput,
    storyNotes,
    energyCurve,
    eqPreset,
    fxMode,
    visualizerStyle,
    accentColor,
    energyLabel,
    queries,
    tracks: orderedTracks,
    coverArt,
    providerUsed,
    generatedAt: Date.now()
  };
}

// ============================================================================
// 8. SINGLE-TRACK QUICK SWAP / REGENERATE
// ============================================================================

/**
 * Regenerates a single track in the staged preview list with another vibe match,
 * maintaining harmonious energy flow and avoiding duplicates.
 */
export async function regenerateTrackInMix(
  currentTracks: Track[],
  replaceIndex: number,
  mix: AiDjMix
): Promise<Track | null> {
  if (replaceIndex < 0 || replaceIndex >= currentTracks.length) return null;

  const targetTrack = currentTracks[replaceIndex];
  const targetAcoustics = estimateTrackAcoustics(targetTrack);
  const existingIds = new Set(currentTracks.map((t) => t.id));

  // Synthesize targeted candidate query
  const swapQueries = [
    `${targetAcoustics.vibeTag} ${targetAcoustics.genre} hits`,
    `${mix.prompt} similar songs`,
    `${targetTrack.artist} greatest hits`
  ];

  for (const query of swapQueries) {
    try {
      const [ytCandidates, itunesCandidates] = await Promise.all([
        searchTracks(query).catch(() => [] as Track[]),
        searchItunesSongs(query, 10).catch(() => [] as Track[])
      ]);
      const candidates = [...ytCandidates, ...itunesCandidates];
      for (const cand of candidates) {
        if (!existingIds.has(cand.id)) {
          // Enrich candidate with realistic acoustic estimation matching context
          const acoustics = estimateTrackAcoustics(cand, {
            bpm: targetAcoustics.bpm,
            energy: targetAcoustics.energy,
            mood: targetAcoustics.mood,
            vibeTag: targetAcoustics.vibeTag,
            genre: targetAcoustics.genre
          });
          cand.bpm = acoustics.bpm;
          cand.energy = acoustics.energy;
          cand.mood = acoustics.mood;
          cand.vibeTag = acoustics.vibeTag;
          return cand;
        }
      }
    } catch {}
  }

  return null;
}

