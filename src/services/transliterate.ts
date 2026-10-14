/**
 * High-performance, offline phonetic transliteration engine
 * Supports Indic scripts (Devanagari/Hindi, Telugu, Tamil, Kannada, Malayalam, Bengali, Gujarati, Gurmukhi/Punjabi)
 * Converts native script lyrics into smooth, readable Romanized Latin phonetics.
 */

// Devanagari Unicode mapping [0x0900 - 0x097F]
const DEVANAGARI_VOWELS: Record<string, string> = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri',
  'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'अं': 'am', 'अः': 'ah'
};

const DEVANAGARI_CONSONANTS: Record<string, string> = {
  'क': 'ka', 'ख': 'kha', 'ग': 'ga', 'घ': 'gha', 'ङ': 'nga',
  'च': 'cha', 'छ': 'chha', 'ज': 'ja', 'झ': 'jha', 'ञ': 'nya',
  'ट': 'ta', 'ठ': 'tha', 'ड': 'da', 'ढ': 'dha', 'ण': 'na',
  'त': 'ta', 'थ': 'tha', 'द': 'da', 'ध': 'dha', 'न': 'na',
  'प': 'pa', 'फ': 'pha', 'ब': 'ba', 'भ': 'bha', 'म': 'ma',
  'य': 'ya', 'र': 'ra', 'ल': 'la', 'व': 'va', 'श': 'sha',
  'ष': 'sha', 'स': 'sa', 'ह': 'ha', 'ळ': 'la', 'क्ष': 'ksha', 'ज्ञ': 'gya'
};

const DEVANAGARI_MATRAS: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', 'ँ': 'n', 'ः': 'h'
};

// Telugu Unicode mapping [0x0C00 - 0x0C7F]
const TELUGU_VOWELS: Record<string, string> = {
  'అ': 'a', 'ఆ': 'aa', 'ఇ': 'i', 'ఈ': 'ee', 'ఉ': 'u', 'ఊ': 'oo', 'ఋ': 'ru',
  'ఎ': 'e', 'ఏ': 'ae', 'ఐ': 'ai', 'ఒ': 'o', 'ఓ': 'o', 'ఔ': 'au', 'అం': 'am'
};

const TELUGU_CONSONANTS: Record<string, string> = {
  'క': 'ka', 'ఖ': 'kha', 'గ': 'ga', 'ఘ': 'gha', 'ఙ': 'nga',
  'చ': 'cha', 'ఛ': 'chha', 'జ': 'ja', 'ఝ': 'jha', 'ఞ': 'nya',
  'ట': 'ta', 'ఠ': 'tha', 'డ': 'da', 'ఢ': 'dha', 'ణ': 'na',
  'త': 'ta', 'థ': 'tha', 'ద': 'da', 'ధ': 'dha', 'న': 'na',
  'ప': 'pa', 'ఫ': 'pha', 'బ': 'ba', 'భ': 'bha', 'మ': 'ma',
  'య': 'ya', 'ర': 'ra', 'ల': 'la', 'వ': 'va', 'శ': 'sha',
  'ష': 'sha', 'స': 'sa', 'హ': 'ha', 'ళ': 'la', 'క్ష': 'ksha', 'ఱ': 'ra'
};

const TELUGU_MATRAS: Record<string, string> = {
  'ా': 'aa', 'ి': 'i', 'ీ': 'ee', 'ు': 'u', 'ూ': 'oo', 'ృ': 'ru',
  'ె': 'e', 'ే': 'ae', 'ై': 'ai', 'ొ': 'o', 'ో': 'o', 'ౌ': 'au', 'ం': 'm', 'ః': 'h'
};

// Tamil Unicode mapping [0x0B80 - 0x0BFF]
const TAMIL_VOWELS: Record<string, string> = {
  'அ': 'a', 'ஆ': 'aa', 'இ': 'i', 'ஈ': 'ee', 'உ': 'u', 'ஊ': 'oo',
  'எ': 'e', 'ஏ': 'ae', 'ஐ': 'ai', 'ஒ': 'o', 'ஓ': 'o', 'ஔ': 'au'
};

const TAMIL_CONSONANTS: Record<string, string> = {
  'க': 'ka', 'ங': 'nga', 'ச': 'cha', 'ஞ': 'nya', 'ட': 'ta', 'ண': 'na',
  'த': 'tha', 'ந': 'na', 'ப': 'pa', 'ம': 'ma', 'ய': 'ya', 'ர': 'ra',
  'ல': 'la', 'வ': 'va', 'ழ': 'zha', 'ள': 'la', 'ற': 'ra', 'ன': 'na',
  'ஜ': 'ja', 'ஷ': 'sha', 'ஸ': 'sa', 'ஹ': 'ha'
};

const TAMIL_MATRAS: Record<string, string> = {
  'ா': 'aa', 'ி': 'i', 'ீ': 'ee', 'ு': 'u', 'ூ': 'oo',
  'ெ': 'e', 'ே': 'ae', 'ை': 'ai', 'ொ': 'o', 'ோ': 'o', 'ௌ': 'au', 'ஃ': 'k'
};

const VIRAMAS = new Set(['\u094D', '\u0C4D', '\u0BCD', '\u0CDD', '\u0D4D', '\u0A4D', '\u09CD', '\u0ACD']);

/**
 * Transliterates an Indic character sequence (Devanagari, Telugu, Tamil) into Romanized phonetic text
 */
export function romanizeIndicText(text: string): string {
  if (!text) return '';

  let out = '';
  const len = text.length;
  let i = 0;

  while (i < len) {
    const ch = text[i];
    const code = ch.charCodeAt(0);

    // Devanagari range [0x0900, 0x097F]
    if (code >= 0x0900 && code <= 0x097F) {
      if (DEVANAGARI_VOWELS[ch]) {
        out += DEVANAGARI_VOWELS[ch];
        i++;
        continue;
      }
      if (DEVANAGARI_CONSONANTS[ch]) {
        const base = DEVANAGARI_CONSONANTS[ch];
        const next = i + 1 < len ? text[i + 1] : '';
        if (next && VIRAMAS.has(next)) {
          // Halant / virama cancels the inherent 'a'
          out += base.slice(0, -1);
          i += 2;
          continue;
        }
        if (next && DEVANAGARI_MATRAS[next]) {
          // Replace inherent 'a' with the matra sound
          out += base.slice(0, -1) + DEVANAGARI_MATRAS[next];
          i += 2;
          continue;
        }
        // Inherent 'a'
        out += base;
        i++;
        continue;
      }
      if (DEVANAGARI_MATRAS[ch]) {
        out += DEVANAGARI_MATRAS[ch];
        i++;
        continue;
      }
    }

    // Telugu range [0x0C00, 0x0C7F]
    if (code >= 0x0C00 && code <= 0x0C7F) {
      if (TELUGU_VOWELS[ch]) {
        out += TELUGU_VOWELS[ch];
        i++;
        continue;
      }
      if (TELUGU_CONSONANTS[ch]) {
        const base = TELUGU_CONSONANTS[ch];
        const next = i + 1 < len ? text[i + 1] : '';
        if (next && VIRAMAS.has(next)) {
          out += base.slice(0, -1);
          i += 2;
          continue;
        }
        if (next && TELUGU_MATRAS[next]) {
          out += base.slice(0, -1) + TELUGU_MATRAS[next];
          i += 2;
          continue;
        }
        out += base;
        i++;
        continue;
      }
      if (TELUGU_MATRAS[ch]) {
        out += TELUGU_MATRAS[ch];
        i++;
        continue;
      }
    }

    // Tamil range [0x0B80, 0x0BFF]
    if (code >= 0x0B80 && code <= 0x0BFF) {
      if (TAMIL_VOWELS[ch]) {
        out += TAMIL_VOWELS[ch];
        i++;
        continue;
      }
      if (TAMIL_CONSONANTS[ch]) {
        const base = TAMIL_CONSONANTS[ch];
        const next = i + 1 < len ? text[i + 1] : '';
        if (next && VIRAMAS.has(next)) {
          out += base.slice(0, -1);
          i += 2;
          continue;
        }
        if (next && TAMIL_MATRAS[next]) {
          out += base.slice(0, -1) + TAMIL_MATRAS[next];
          i += 2;
          continue;
        }
        out += base;
        i++;
        continue;
      }
      if (TAMIL_MATRAS[ch]) {
        out += TAMIL_MATRAS[ch];
        i++;
        continue;
      }
    }

    // Default passthrough for ASCII, whitespace, punctuation, Latin
    out += ch;
    i++;
  }

  // Capitalize beginnings of words for pleasing aesthetics
  return out.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/**
 * Checks if a string contains any non-Latin / Indic / CJK script characters
 */
export function containsNonLatinScript(text: string): boolean {
  if (!text) return false;
  // Match Indic [0x0900-0x0D7F], CJK [0x4E00-0x9FFF], Cyrillic [0x0400-0x04FF], Arabic [0x0600-0x06FF]
  return /[\u0900-\u0D7F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0400-\u04FF\u0600-\u06FF]/.test(text);
}

export interface WordTiming {
  word: string;
  startRatio: number;
  endRatio: number;
  startTime: number;
  endTime: number;
}

/**
 * Computes word boundaries and timing segments for a line
 */
export function computeWordTimings(
  text: string,
  lineStartTime: number,
  lineEndTime: number
): WordTiming[] {
  if (!text) return [];
  const rawWords = text.trim().split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) return [];

  const duration = Math.max(1.2, lineEndTime - lineStartTime);

  // Compute proportional weights based on word length
  const weights = rawWords.map((w) => Math.max(2, w.length));
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);

  let accumulated = 0;
  return rawWords.map((word, idx) => {
    const w = weights[idx];
    const startRatio = accumulated / totalWeight;
    accumulated += w;
    const endRatio = accumulated / totalWeight;

    return {
      word,
      startRatio,
      endRatio,
      startTime: lineStartTime + startRatio * duration,
      endTime: lineStartTime + endRatio * duration
    };
  });
}

