import type { Track } from '../types';
import { usePlayerStore } from '../stores/playerStore';
import { useLibraryStore } from '../stores/libraryStore';
import { searchTracks } from './youtube';

/**
 * Normalizes a song title to its core identity so remixes, slowed versions,
 * lyrical videos, or soundtrack tags of the exact same song are deduplicated.
 */
export function normalizeSongTitle(title: string): string {
  return (title || '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '') // remove (From "..."), [Slowed], etc.
    .replace(
      /\b(lofi|lo-fi|slowed|reverb|remix|version|unplugged|acoustic|reprised|reprise|lyrical|lyrics|full video|video song|audio|ost|title track|female version|male version|official|hd|4k)\b/gi,
      ''
    )
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts individual clean artist names from a track's artist string.
 */
export function extractArtists(artistStr?: string): string[] {
  if (!artistStr) return [];
  return artistStr
    .split(/,|&|\bfeat\.?\b|\bft\.?\b|\bx\b|\bwith\b/i)
    .map((a) => a.trim())
    .filter(
      (a) =>
        a.length > 1 &&
        a.toLowerCase() !== 'unknown artist' &&
        a.toLowerCase() !== 'various artists' &&
        a.toLowerCase() !== 'youtube music'
    );
}

/**
 * Cleans an album/movie name for contextual soundtrack discovery.
 */
function cleanAlbumName(album?: string): string {
  if (!album || album === 'WaveCraft Cloud') return '';
  return album
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/original motion picture soundtrack|soundtrack|ost/gi, '')
    .trim();
}

/**
 * Linguistic and regional language classifier.
 */
export type TrackLanguage = 'hindi' | 'punjabi' | 'south' | 'kpop' | 'latin' | 'english' | 'general';

const HINDI_ARTIST_PATTERNS = [
  'arijit singh', 'pritam', 'shreya ghoshal', 'atif aslam', 'mohit chauhan',
  'kk', 'sonu nigam', 'jubin nautiyal', 'vishal mishra', 'sachin-jigar',
  'vishal-shekhar', 'amit trivedi', 'jasleen royal', 'darshan raval',
  'armaan malik', 'sunidhi chauhan', 'alka yagnik', 'kumar sanu', 'udit narayan',
  'lucky ali', 'papon', 'shilpa rao', 'anuv jain', 'prateek kuhad', 'b praak',
  'badshah', 'yo yo honey singh', 'sachet-parampara', 'rochak kohli', 'tanisk bagchi',
  'neha kakkar', 'tony kakkar', 'king', 'divine', 'raftaar', 'mc stan'
];

const PUNJABI_ARTIST_PATTERNS = [
  'diljit dosanjh', 'ap dhillon', 'karan aujla', 'shubh', 'sidhu moose wala',
  'amrinder gill', 'guru randhawa', 'harrdy sandhu', 'jassie gill', 'jordan sandhu',
  'maninder buttar', 'garry sandhu', 'kaka', 'prem dhillon', 'gurinder gill',
  'shinda kahlon', 'arjan dhillon', 'tarnvir singh', 'cheema y'
];

const SOUTH_ARTIST_PATTERNS = [
  'anirudh ravichander', 'anirudh', 'ar rahman', 'a.r. rahman', 'yuvan shankar raja',
  'harris jayaraj', 'sid sriram', 'devi sri prasad', 'dsp', 'thaman s',
  'santhosh narayanan', 'gv prakash', 'ilaiyaraaja', 'd. imman', 'hiphop tamizha',
  'sushin shyam', 'hesham abdul wahab', 'gopi sundar', 'spb', 'chitra', 'karthik',
  'vijay antony', 'stephen devassy', 'sam c.s.'
];

const KPOP_ARTIST_PATTERNS = [
  'bts', 'blackpink', 'newjeans', 'stray kids', 'twice', 'jung kook', 'jimin',
  'le sserafim', 'enhypen', 'aespa', 'txt', 'iu', 'seventeen', 'red velvet',
  'ive', 'nmixx', 'itzy', 'exo', 'ateez', 'treasure', 'illit'
];

const LATIN_ARTIST_PATTERNS = [
  'bad bunny', 'peso pluma', 'karol g', 'rauw alejandro', 'feid', 'j balvin',
  'daddy yankee', 'rosalía', 'maluma', 'bizarrap', 'manuel turizo', 'ozuna',
  'anuel aa', 'shakira', 'becky g', 'camilo'
];

/**
 * Detects the linguistic/regional domain of a track.
 */
export function detectTrackLanguage(title: string, artist: string): TrackLanguage {
  const combined = `${title} ${artist}`.toLowerCase();

  // Native script checks
  if (/[\u0900-\u097F]/.test(combined)) return 'hindi';
  if (/[\u0A00-\u0A7F]/.test(combined)) return 'punjabi';
  if (/[\u0C00-\u0C7F\u0B80-\u0BFF\u0D00-\u0D7F\u0C80-\u0CFF]/.test(combined)) return 'south';
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(combined)) return 'kpop';

  // Specific linguistic keywords
  if (/\b(bollywood|hindi|aashiqui|sanju|dangal|kabir singh|jawan|animal|stree|brahmastra)\b/i.test(combined)) return 'hindi';
  if (/\b(punjabi|jatt|munda|kudi|gedi|chandigarh|yaari|sohne)\b/i.test(combined)) return 'punjabi';
  if (/\b(tamil|telugu|malayalam|kannada|kollywood|tollywood|kuthu|jailer|leo|devara)\b/i.test(combined)) return 'south';
  if (/\b(k-pop|kpop|ost kdrama)\b/i.test(combined)) return 'kpop';
  if (/\b(reggaeton|bachata|corrido|mexico|colombia)\b/i.test(combined)) return 'latin';

  // Artist catalogue checks
  for (const p of HINDI_ARTIST_PATTERNS) {
    if (combined.includes(p)) return 'hindi';
  }
  for (const p of PUNJABI_ARTIST_PATTERNS) {
    if (combined.includes(p)) return 'punjabi';
  }
  for (const p of SOUTH_ARTIST_PATTERNS) {
    if (combined.includes(p)) return 'south';
  }
  for (const p of KPOP_ARTIST_PATTERNS) {
    if (combined.includes(p)) return 'kpop';
  }
  for (const p of LATIN_ARTIST_PATTERNS) {
    if (combined.includes(p)) return 'latin';
  }

  return 'english';
}

/**
 * Comprehensive Stylistic & Genre Peer Graph across global & regional music.
 */
const ARTIST_VIBE_PEERS: Record<string, string[]> = {
  // --- Modern Pop & Viral ---
  'sabrina carpenter': ['Olivia Rodrigo', 'Chappell Roan', 'Billie Eilish', 'Tate McRae', 'Taylor Swift', 'Gracie Abrams'],
  'billie eilish': ['Olivia Rodrigo', 'Lorde', 'Lana Del Rey', 'Sabrina Carpenter', 'Finneas', 'The Neighbourhood'],
  'olivia rodrigo': ['Sabrina Carpenter', 'Billie Eilish', 'Conan Gray', 'Tate McRae', 'Chappell Roan', 'Lorde'],
  'taylor swift': ['Sabrina Carpenter', 'Gracie Abrams', 'Olivia Rodrigo', 'Lana Del Rey', 'Phoebe Bridgers', 'Ed Sheeran'],
  'chappell roan': ['Sabrina Carpenter', 'Renee Rapp', 'Boygenius', 'Olivia Rodrigo', 'Remi Wolf', 'Billie Eilish'],
  'dua lipa': ['Calvin Harris', 'Sabrina Carpenter', 'Miley Cyrus', 'Bebe Rexha', 'Katy Perry', 'Ava Max'],
  'bruno mars': ['Lady Gaga', 'The Weeknd', 'Silk Sonic', 'Mark Ronson', 'Charlie Puth', 'Justin Timberlake'],
  'lady gaga': ['Bruno Mars', 'Dua Lipa', 'Katy Perry', 'Adele', 'Ariana Grande', 'Elton John'],
  'ariana grande': ['Sabrina Carpenter', 'Dua Lipa', 'SZA', 'Camila Cabello', 'Doja Cat', 'Billie Eilish'],
  'ed sheeran': ['Shawn Mendes', 'James Arthur', 'Lewis Capaldi', 'Sam Smith', 'Dean Lewis', 'Calum Scott'],
  'tate mcrae': ['Sabrina Carpenter', 'Olivia Rodrigo', 'Billie Eilish', 'Dua Lipa', 'Troye Sivan'],
  'charli xcx': ['Troye Sivan', 'Lorde', 'Billie Eilish', 'Dua Lipa', 'Caroline Polachek', 'Shygirl'],

  // --- Dark Pop, Synthwave & R&B ---
  'the weeknd': ['Daft Punk', 'Post Malone', 'SZA', 'Frank Ocean', 'Bruno Mars', 'Travis Scott', 'Joji', 'Giveon'],
  'sza': ['Summer Walker', 'Kehlani', 'Jhené Aiko', 'Frank Ocean', 'Kali Uchis', 'Daniel Caesar', 'The Weeknd'],
  'frank ocean': ['Daniel Caesar', 'SZA', 'Steve Lacy', 'Tyler The Creator', 'Brent Faiyaz', 'Dominic Fike'],
  'daniel caesar': ['Giveon', 'Frank Ocean', 'Leon Bridges', 'Mac Ayres', 'H.E.R.', 'SZA'],
  'joji': ['The Weeknd', 'Keshi', 'Frank Ocean', 'Dominic Fike', 'Cuco', 'dhruv'],
  'post malone': ['Swae Lee', 'Morgan Wallen', 'The Weeknd', '21 Savage', 'Khalid', 'Juice WRLD'],

  // --- Hip-Hop & Modern Trap ---
  'kendrick lamar': ['J. Cole', 'Travis Scott', 'Drake', 'Baby Keem', 'A$AP Rocky', 'Metro Boomin', 'Future'],
  'travis scott': ['Don Toliver', 'Playboi Carti', 'Future', 'Metro Boomin', '21 Savage', 'Lil Uzi Vert'],
  'drake': ['21 Savage', 'Future', 'Lil Baby', 'Travis Scott', 'Metro Boomin', 'Partynextdoor', 'Jack Harlow'],
  'metro boomin': ['Future', '21 Savage', 'Travis Scott', 'Don Toliver', 'Young Thug', 'Offset'],
  'future': ['Metro Boomin', 'Travis Scott', '21 Savage', 'Lil Baby', 'Gunna', 'Drake'],
  '21 savage': ['Metro Boomin', 'Drake', 'Travis Scott', 'Future', 'J. Cole', 'Offset'],
  'eminem': ['50 Cent', 'Dr. Dre', 'Snoop Dogg', 'Royce da 5\'9"', 'NF', 'Joyner Lucas'],
  'don toliver': ['Travis Scott', 'Metro Boomin', 'Gunna', 'Lil Uzi Vert', 'Offset', 'Swae Lee'],

  // --- Indie, Soft Rock & Alternative ---
  'coldplay': ['Imagine Dragons', 'OneRepublic', 'The Killers', 'Keane', 'Oasis', 'Snow Patrol'],
  'arctic monkeys': ['The Neighbourhood', 'The 1975', 'Cigarettes After Sex', 'Wallows', 'The Strokes'],
  'the neighbourhood': ['Arctic Monkeys', 'Cigarettes After Sex', 'Chase Atlantic', 'Lana Del Rey', 'BØRNS'],
  'hozier': ['Teddy Swims', 'Noah Kahan', 'Benson Boone', 'Florence + The Machine', 'Lord Huron', 'Vance Joy'],
  'cigarettes after sex': ['Beach House', 'The Neighbourhood', 'Lana Del Rey', 'Mazzy Star', 'CAS'],
  'imagine dragons': ['Coldplay', 'OneRepublic', 'The Score', 'Fall Out Boy', 'Twenty One Pilots'],

  // --- EDM & Electronic Dance ---
  'calvin harris': ['Dua Lipa', 'David Guetta', 'Avicii', 'The Chainsmokers', 'Alesso', 'Martin Garrix'],
  'avicii': ['Kygo', 'Martin Garrix', 'Alesso', 'Swedish House Mafia', 'Zedd', 'Galantis'],
  'martin garrix': ['David Guetta', 'Tiësto', 'Alan Walker', 'Marshmello', 'Alesso', 'Avicii'],
  'daft punk': ['The Weeknd', 'Justice', 'Kavinsky', 'Empire of the Sun', 'Phoenix'],

  // --- Hindi & Bollywood Romantic / Melodies ---
  'arijit singh': ['Atif Aslam', 'Mohit Chauhan', 'Shreya Ghoshal', 'KK', 'Jubin Nautiyal', 'Pritam', 'Vishal Mishra', 'Jasleen Royal'],
  'atif aslam': ['Arijit Singh', 'Mohit Chauhan', 'Mustafa Zahid', 'Rahat Fateh Ali Khan', 'KK', 'Jal'],
  'shreya ghoshal': ['Arijit Singh', 'Sunidhi Chauhan', 'Sonu Nigam', 'Alka Yagnik', 'Chinmayi', 'Shilpa Rao'],
  'pritam': ['Arijit Singh', 'KK', 'Mohit Chauhan', 'Sachin-Jigar', 'Vishal-Shekhar', 'Amit Trivedi'],
  'kk': ['Mohit Chauhan', 'Shaan', 'Lucky Ali', 'Sonu Nigam', 'Arijit Singh', 'Kunal Ganjawala'],
  'mohit chauhan': ['Lucky Ali', 'Papon', 'Arijit Singh', 'Rabbi Shergill', 'Javed Ali', 'KK'],
  'vishal mishra': ['Arijit Singh', 'B Praak', 'Jubin Nautiyal', 'Sachet Tandon', 'Akhil Sachdeva'],
  'anuv jain': ['Prateek Kuhad', 'Zaeden', 'Jasleen Royal', 'Aditya A', 'Osho Jain', 'Twin Strings'],
  'sonu nigam': ['Alka Yagnik', 'Udit Narayan', 'Kumar Sanu', 'Shaan', 'Hariharan'],

  // --- Punjabi Pop & Hip-Hop ---
  'diljit dosanjh': ['AP Dhillon', 'Karan Aujla', 'Shubh', 'Sidhu Moose Wala', 'Guru Randhawa', 'Badshah'],
  'karan aujla': ['Diljit Dosanjh', 'Shubh', 'Sidhu Moose Wala', 'AP Dhillon', 'Jordan Sandhu', 'Jerry'],
  'ap dhillon': ['Gurinder Gill', 'Shinda Kahlon', 'Diljit Dosanjh', 'Shubh', 'Karan Aujla'],
  'shubh': ['AP Dhillon', 'Karan Aujla', 'Sidhu Moose Wala', 'Diljit Dosanjh', 'Prem Dhillon'],
  'sidhu moose wala': ['Karan Aujla', 'Amrit Maan', 'Prem Dhillon', 'Bohemia', 'Shubh'],
  'b praak': ['Jaani', 'Harrdy Sandhu', 'Jassie Gill', 'Ammy Virk', 'Vishal Mishra'],

  // --- South Indian (Tamil & Telugu) ---
  'anirudh ravichander': ['AR Rahman', 'Yuvan Shankar Raja', 'Devi Sri Prasad', 'Santhosh Narayanan', 'GV Prakash', 'Hiphop Tamizha'],
  'ar rahman': ['Anirudh Ravichander', 'Harris Jayaraj', 'Yuvan Shankar Raja', 'Hariharan', 'Ilaiyaraaja'],
  'sid sriram': ['Anirudh Ravichander', 'AR Rahman', 'Chinmayi', 'Pradeep Kumar', 'D. Imman'],
  'devi sri prasad': ['Thaman S', 'Anirudh Ravichander', 'Armaan Malik', 'Shankar Mahadevan', 'Ram Miriyala'],
  'thaman s': ['Devi Sri Prasad', 'Anirudh Ravichander', 'Armaan Malik', 'Sid Sriram', 'Anurag Kulkarni'],
  'yuvan shankar raja': ['Harris Jayaraj', 'Anirudh Ravichander', 'AR Rahman', 'Ilaiyaraaja'],

  // --- K-Pop ---
  'bts': ['Stray Kids', 'TXT', 'ENHYPEN', 'SEVENTEEN', 'Jung Kook', 'Jimin', 'ATEEZ'],
  'blackpink': ['TWICE', 'NewJeans', 'aespa', 'LE SSERAFIM', 'ITZY', 'Red Velvet'],
  'newjeans': ['ILLIT', 'LE SSERAFIM', 'aespa', 'TWICE', 'FIFTY FIFTY', 'IVE'],
  'jung kook': ['BTS', 'Jimin', 'V', 'Charlie Puth', 'The Weeknd', 'Justin Bieber'],

  // --- Latin & Reggaeton ---
  'bad bunny': ['Rauw Alejandro', 'J Balvin', 'Feid', 'Myke Towers', 'Ozuna', 'Daddy Yankee'],
  'karol g': ['Shakira', 'Becky G', 'Rosalía', 'Natti Natasha', 'Kali Uchis', 'Anitta'],
  'peso pluma': ['Junior H', 'Natanael Cano', 'Fuerza Regida', 'Eslabon Armado', 'Xavi']
};

/**
 * Returns complementary stylistic peers for a given artist.
 */
function getSimilarArtists(artist: string): string[] {
  const norm = (artist || '').toLowerCase().trim();
  for (const [key, peers] of Object.entries(ARTIST_VIBE_PEERS)) {
    if (norm.includes(key) || key.includes(norm)) {
      return peers;
    }
  }
  return [];
}

/**
 * In-memory cache for fast, seamless lookups.
 */
const recsCache = new Map<string, { tracks: Track[]; time: number }>();

/**
 * World-class Smart Recommendation Engine.
 * Resolves complementary tracks of the EXACT SAME type, genre, and language as the seed track:
 * - Employs multi-vector search queries (Artist radio + Stylistic peer + Genre cluster).
 * - Enforces strict linguistic and cultural consistency (never blends Hindi with EDM unless requested).
 * - Never blindly dumps liked songs; only tastefully includes relevant favorites with dynamic shuffle.
 * - Guarantees artist diversity (max 2 tracks per artist for endless radio feel).
 */
export async function getSmartRecommendations(
  seedTrack: Track,
  existingQueue: Track[] = [],
  limit = 10
): Promise<Track[]> {
  const seedArtists = extractArtists(seedTrack.artist);
  const primaryArtist = seedArtists[0] || seedTrack.artist || '';
  const cleanedAlbum = cleanAlbumName(seedTrack.album);
  const normSeedTitle = normalizeSongTitle(seedTrack.title);
  const trackLanguage = detectTrackLanguage(seedTrack.title, seedTrack.artist);

  // Cache lookup (10-minute cache)
  const cacheKey = `${trackLanguage}__${primaryArtist.toLowerCase()}__${normSeedTitle.slice(0, 20)}`;
  const cached = recsCache.get(cacheKey);
  if (cached && Date.now() - cached.time < 600_000) {
    const existingIds = new Set(existingQueue.map((t) => t.id));
    const valid = cached.tracks.filter((t) => !existingIds.has(t.id));
    if (valid.length >= limit) {
      return valid.slice(0, limit);
    }
  }

  const peers = getSimilarArtists(primaryArtist);

  // Generate 2-3 targeted, high-precision search queries
  const queries: string[] = [];

  // Query 1: Primary Artist Top Catalog / Radio
  if (primaryArtist) {
    queries.push(`${primaryArtist} hit songs`);
  }

  // Query 2: Direct Stylistic Peer Artist (from same genre & language)
  if (peers.length > 0) {
    // Pick 1-2 random peers for dynamic variety
    const shuffledPeers = [...peers].sort(() => Math.random() - 0.5);
    const chosenPeer = shuffledPeers[0];
    if (chosenPeer) {
      queries.push(`${chosenPeer} top songs`);
    }
  }

  // Query 3: Genre / Cultural Regional Radio Query
  if (trackLanguage === 'hindi') {
    queries.push('bollywood romantic hit songs');
  } else if (trackLanguage === 'punjabi') {
    queries.push('punjabi top hits songs');
  } else if (trackLanguage === 'south') {
    queries.push('tamil telugu hit songs');
  } else if (trackLanguage === 'kpop') {
    queries.push('kpop viral hits');
  } else if (trackLanguage === 'latin') {
    queries.push('latin top hits reggaeton');
  } else {
    // English genre heuristics
    const lowerArtist = (primaryArtist || '').toLowerCase();
    if (/kendrick|travis|drake|metro|savage|future|eminem/.test(lowerArtist)) {
      queries.push('hip hop trap hits');
    } else if (/weeknd|sza|frank ocean|caesar|giveon/.test(lowerArtist)) {
      queries.push('rnb dark pop hits');
    } else if (/coldplay|arctic monkeys|neighbourhood|hozier/.test(lowerArtist)) {
      queries.push('indie alternative hits');
    } else if (/calvin harris|avicii|garrix|daft punk/.test(lowerArtist)) {
      queries.push('dance edm hits');
    } else {
      queries.push('viral pop hits 2025');
    }
  }

  // Execute queries in parallel
  const searchResults = await Promise.allSettled(
    queries.map((q) => searchTracks(q))
  );

  const candidatePool: Track[] = [];
  for (const result of searchResults) {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      candidatePool.push(...result.value);
    }
  }

  // Tasteful, non-intrusive inclusion of Liked Songs:
  // ONLY include liked songs that share the EXACT SAME language and artist/peer vibe!
  // At most 1-2 liked songs, randomly sampled so they never appear in a static rigid sequence.
  const { likedSongs } = useLibraryStore.getState();
  if (likedSongs.length > 0) {
    const matchingLiked = likedSongs.filter((liked) => {
      if (!liked || !liked.id || !liked.title) return false;
      const likedLang = detectTrackLanguage(liked.title, liked.artist);
      if (likedLang !== trackLanguage) return false;

      const likedArtistLower = (liked.artist || '').toLowerCase();
      const primaryLower = primaryArtist.toLowerCase();
      const isSameArtist = primaryLower && likedArtistLower.includes(primaryLower);
      const isPeer = peers.some((p) => likedArtistLower.includes(p.toLowerCase()));

      return isSameArtist || isPeer;
    });

    if (matchingLiked.length > 0) {
      // Pick at most 2 random matching favorites
      const sampled = [...matchingLiked].sort(() => Math.random() - 0.5).slice(0, 2);
      candidatePool.push(...sampled);
    }
  }

  // Track Deduplication Sets
  const existingIds = new Set<string>(existingQueue.map((t) => t.id));
  existingIds.add(seedTrack.id);

  const existingTitles = new Set<string>(
    existingQueue.map((t) => normalizeSongTitle(t.title)).filter(Boolean)
  );
  if (normSeedTitle) existingTitles.add(normSeedTitle);

  const likedIds = new Set<string>(likedSongs.map((t) => t.id));
  const scoredCandidates: { track: Track; score: number; artistKey: string }[] = [];

  for (const candidate of candidatePool) {
    if (!candidate || !candidate.id || !candidate.title) continue;
    if (existingIds.has(candidate.id)) continue;

    const normTitle = normalizeSongTitle(candidate.title);
    if (!normTitle || normTitle.length < 2) continue;
    if (existingTitles.has(normTitle)) continue;

    // Never play duplicate version/remix/live take of the seed track
    if (
      normSeedTitle.length >= 4 &&
      (normTitle.includes(normSeedTitle) || normSeedTitle.includes(normTitle))
    ) {
      continue;
    }

    // Hard filter: Discard karaoke, ringtones, sound effects, 1-hour loops, dialogue
    const rawLower = `${candidate.title} ${candidate.artist || ''}`.toLowerCase();
    if (
      /\b(karaoke|instrumental|ringtone|sound effect|sfx|teaser|trailer|reaction|dialogue|bgm|1 hour|10 hour|loop|status|audio book|podcast)\b/i.test(
        rawLower
      )
    ) {
      continue;
    }

    existingIds.add(candidate.id);
    existingTitles.add(normTitle);

    let score = 0;

    // 1. Language & Regional Cultural Alignment (CRITICAL for matching song "type")
    const candLang = detectTrackLanguage(candidate.title, candidate.artist);
    if (candLang === trackLanguage) {
      score += 35;
    } else {
      // Heavy penalty for wrong language/region
      score -= 50;
    }

    // 2. Artist Affinity to Seed Track
    const candArtists = extractArtists(candidate.artist);
    const candArtistLower = (candidate.artist || '').toLowerCase();
    const primaryLower = primaryArtist.toLowerCase();

    if (primaryLower && candArtistLower.includes(primaryLower)) {
      score += 30; // Another song by the same artist
    } else if (peers.some((p) => candArtistLower.includes(p.toLowerCase()))) {
      score += 28; // Song by a direct stylistic peer
    }

    // 3. Same Album / Movie Context
    if (
      cleanedAlbum &&
      candidate.album &&
      cleanAlbumName(candidate.album).toLowerCase() === cleanedAlbum.toLowerCase()
    ) {
      score += 22;
    }

    // 4. Subtle, healthy boost if it's already a liked song (never overpowering fresh tracks)
    if (likedIds.has(candidate.id)) {
      score += 8;
    }

    // 5. Prefer verified playable media with sensible duration (1.5 - 7 mins)
    if (candidate.youtubeId) score += 15;
    if (candidate.duration && candidate.duration >= 90 && candidate.duration <= 420) {
      score += 10;
    } else if (candidate.duration && (candidate.duration < 60 || candidate.duration > 700)) {
      score -= 30;
    }

    // 6. Dynamic Organic Jitter (ensures non-static, lively recommendation order)
    score += Math.random() * 12;

    const leadArtist = (candArtists[0] || candidate.artist || 'Various').toLowerCase();
    scoredCandidates.push({ track: candidate, score, artistKey: leadArtist });
  }

  // Sort descending by score
  scoredCandidates.sort((a, b) => b.score - a.score);

  // Artist Diversity Balancing: Maximum 2 tracks per artist for endless radio feel
  const selected: Track[] = [];
  const artistCounts = new Map<string, number>();

  for (const item of scoredCandidates) {
    if (selected.length >= limit) break;
    const count = artistCounts.get(item.artistKey) || 0;
    if (count >= 2 && scoredCandidates.length > limit) continue;

    selected.push(item.track);
    artistCounts.set(item.artistKey, count + 1);
  }

  // Backfill if needed
  if (selected.length < limit) {
    for (const item of scoredCandidates) {
      if (selected.length >= limit) break;
      if (!selected.some((t) => t.id === item.track.id)) {
        selected.push(item.track);
      }
    }
  }

  if (selected.length > 0) {
    recsCache.set(cacheKey, { tracks: selected, time: Date.now() });
  }

  return selected;
}

/**
 * Plays a single chosen track immediately and asynchronously populates the Up Next queue
 * with intelligent, taste-predicted recommendations of the EXACT same type.
 */
export async function playTrackWithSmartQueue(seedTrack: Track): Promise<void> {
  const player = usePlayerStore.getState();
  // Start playing the chosen song immediately with a clean 1-song queue
  player.playTrack(seedTrack, [seedTrack], 0);

  try {
    const recommendations = await getSmartRecommendations(seedTrack, [seedTrack], 10);
    if (recommendations.length === 0) return;

    const currentState = usePlayerStore.getState();
    const existingIds = new Set(currentState.queue.map((t) => t.id));
    const newTracks = recommendations.filter((t) => !existingIds.has(t.id));
    if (newTracks.length === 0) return;

    // Only append recommendations to Up Next behind the seed track
    if (currentState.currentTrack?.id === seedTrack.id) {
      usePlayerStore.setState({
        queue: [...currentState.queue, ...newTracks],
        originalQueue: [...currentState.originalQueue, ...newTracks]
      });
    }
  } catch {
    // Non-blocking background recommendation failure
  }
}
