/**
 * High-performance, offline phonetic transliteration engine
 * Supports Indic scripts:
 * - Devanagari / Hindi, Marathi, Nepali [0x0900 - 0x097F]
 * - Bengali / Assamese [0x0980 - 0x09FF]
 * - Gurmukhi / Punjabi [0x0A00 - 0x0A7F]
 * - Gujarati [0x0A80 - 0x0AFF]
 * - Tamil [0x0B80 - 0x0BFF]
 * - Telugu [0x0C00 - 0x0C7F]
 * - Kannada [0x0C80 - 0x0CFF]
 * - Malayalam [0x0D00 - 0x0D7F]
 * Converts native script lyrics into smooth, readable Romanized Latin phonetics.
 */

// Devanagari Unicode mapping [0x0900 - 0x097F]
const DEVANAGARI_VOWELS: Record<string, string> = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri',
  'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'अं': 'am', 'अः': 'ah'
};

const DEVANAGARI_CONSONANTS: Record<string, string> = {
  'क': 'ka', 'ख': 'kha', 'ग': 'ga', 'घ': 'gha', 'ङ': 'nga',
  'च': 'cha', 'छ': 'chha', 'ज': 'ja', 'झ': 'jha', 'ञ': 'nya',
  'ट': 'ta', 'ठ': 'tha', 'ड': 'da', 'ढ': 'dha', 'ण': 'na',
  'त': 'ta', 'थ': 'tha', 'द': 'da', 'ध': 'dha', 'न': 'na',
  'प': 'pa', 'फ': 'pha', 'ब': 'ba', 'भ': 'bha', 'म': 'ma',
  'य': 'ya', 'र': 'ra', 'ल': 'la', 'व': 'va', 'श': 'sha',
  'ष': 'sha', 'स': 'sa', 'ह': 'ha', 'ळ': 'la', 'क्ष': 'ksha', 'ज्ञ': 'gya',
  // Precomposed Nukta consonants
  'क़': 'qa', 'ख़': 'kha', 'ग़': 'gha', 'ज़': 'za', 'ड़': 'da', 'ढ़': 'dha', 'फ़': 'fa', 'य़': 'ya'
};

const NUKTA_CONSONANT_MAP: Record<string, string> = {
  'क': 'qa', 'ख': 'kha', 'ग': 'gha', 'ज': 'za', 'ड': 'da', 'ढ': 'dha', 'फ': 'fa', 'य': 'ya',
  'श': 'sha', 'स': 'sa', 'ह': 'ha'
};

const DEVANAGARI_MATRAS: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ः': 'h'
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

// Malayalam Unicode mapping [0x0D00 - 0x0D7F]
const MALAYALAM_VOWELS: Record<string, string> = {
  'അ': 'a', 'ആ': 'aa', 'ഇ': 'i', 'ഈ': 'ee', 'ഉ': 'u', 'ഊ': 'oo', 'ഋ': 'ru',
  'എ': 'e', 'ഏ': 'ae', 'ഐ': 'ai', 'ഒ': 'o', 'ഓ': 'o', 'ഔ': 'au', 'അം': 'am'
};

const MALAYALAM_CONSONANTS: Record<string, string> = {
  'ക': 'ka', 'ഖ': 'kha', 'ഗ': 'ga', 'ഘ': 'gha', 'ങ': 'nga',
  'ച': 'cha', 'ഛ': 'chha', 'ജ': 'ja', 'ഝ': 'jha', 'ഞ': 'nya',
  'ട': 'ta', 'ഠ': 'tha', 'ഡ': 'da', 'ഢ': 'dha', 'ണ': 'na',
  'ത': 'tha', 'ഥ': 'thha', 'ദ': 'da', 'ധ': 'dha', 'ന': 'na',
  'പ': 'pa', 'ഫ': 'pha', 'ബ': 'ba', 'ഭ': 'bha', 'മ': 'ma',
  'യ': 'ya', 'ര': 'ra', 'ല': 'la', 'വ': 'va', 'ശ': 'sha',
  'ഷ': 'sha', 'സ': 'sa', 'ഹ': 'ha', 'ള': 'la', 'ഴ': 'zha', 'റ': 'ra',
  // Malayalam Chillus (pure consonants with no inherent 'a')
  'ൽ': 'l', 'ൾ': 'l', 'ൺ': 'n', 'ൻ': 'n', 'ർ': 'r', 'ൿ': 'k'
};

const MALAYALAM_MATRAS: Record<string, string> = {
  'ാ': 'aa', 'ി': 'i', 'ീ': 'ee', 'ു': 'u', 'ൂ': 'oo', 'ൃ': 'ru',
  'െ': 'e', 'േ': 'ae', 'ൈ': 'ai', 'ൊ': 'o', 'ോ': 'o', 'ൌ': 'au', 'ൗ': 'au',
  'ം': 'm', 'ഃ': 'h'
};

// Kannada Unicode mapping [0x0C80 - 0x0CFF]
const KANNADA_VOWELS: Record<string, string> = {
  'ಅ': 'a', 'ಆ': 'aa', 'ಇ': 'i', 'ಈ': 'ee', 'ಉ': 'u', 'ಊ': 'oo', 'ಋ': 'ru',
  'ಎ': 'e', 'ಏ': 'ae', 'ಐ': 'ai', 'ಒ': 'o', 'ಓ': 'o', 'ಔ': 'au', 'ಅಂ': 'am'
};

const KANNADA_CONSONANTS: Record<string, string> = {
  'ಕ': 'ka', 'ಖ': 'kha', 'ಗ': 'ga', 'ಘ': 'gha', 'ಙ': 'nga',
  'ಚ': 'cha', 'ಛ': 'chha', 'ಜ': 'ja', 'ಝ': 'jha', 'ಞ': 'nya',
  'ಟ': 'ta', 'ಠ': 'tha', 'ಡ': 'da', 'ಢ': 'dha', 'ಣ': 'na',
  'ತ': 'ta', 'ಥ': 'tha', 'ದ': 'da', 'ಧ': 'dha', 'ನ': 'na',
  'ಪ': 'pa', 'ಫ': 'pha', 'ಬ': 'ba', 'ಭ': 'bha', 'ಮ': 'ma',
  'ಯ': 'ya', 'ರ': 'ra', 'ಲ': 'la', 'ವ': 'va', 'ಶ': 'sha',
  'ಷ': 'sha', 'ಸ': 'sa', 'ಹ': 'ha', 'ಳ': 'la', 'ಱ': 'ra'
};

const KANNADA_MATRAS: Record<string, string> = {
  'ಾ': 'aa', 'ಿ': 'i', 'ೀ': 'ee', 'ು': 'u', 'ೂ': 'oo', 'ೃ': 'ru',
  'ೆ': 'e', 'ೇ': 'ae', 'ೈ': 'ai', 'ೊ': 'o', 'ೋ': 'o', 'ೌ': 'au', 'ಂ': 'm', 'ಃ': 'h'
};

// Bengali Unicode mapping [0x0980 - 0x09FF]
const BENGALI_VOWELS: Record<string, string> = {
  'অ': 'o', 'আ': 'aa', 'ই': 'i', 'ঈ': 'ee', 'উ': 'u', 'ঊ': 'oo', 'ঋ': 'ri',
  'এ': 'e', 'ঐ': 'oi', 'ও': 'o', 'ঔ': 'ou'
};

const BENGALI_CONSONANTS: Record<string, string> = {
  'ক': 'ko', 'খ': 'kho', 'গ': 'go', 'ঘ': 'gho', 'ঙ': 'ngo',
  'চ': 'cho', 'ছ': 'chho', 'জ': 'jo', 'ঝ': 'jho', 'ঞ': 'nyo',
  'ট': 'to', 'ঠ': 'tho', 'ড': 'do', 'ঢ': 'dho', 'ণ': 'no',
  'ত': 'to', 'থ': 'tho', 'দ': 'do', 'ধ': 'dho', 'ন': 'no',
  'প': 'po', 'ফ': 'pho', 'ব': 'bo', 'ভ': 'bho', 'ম': 'mo',
  'য': 'jo', 'র': 'ro', 'ল': 'lo', 'শ': 'sho', 'ষ': 'sho',
  'স': 'so', 'হ': 'ho', 'ড়': 'ro', 'ঢ়': 'rho', 'য়': 'yo', 'ৎ': 't'
};

const BENGALI_MATRAS: Record<string, string> = {
  'া': 'aa', 'ি': 'i', 'ী': 'ee', 'ু': 'u', 'ূ': 'oo', 'ৃ': 'ri',
  'ে': 'e', 'ৈ': 'oi', 'ো': 'o', 'ৌ': 'ou', 'ং': 'ng', 'ঃ': 'h', 'ঁ': 'n'
};

// Gurmukhi / Punjabi Unicode mapping [0x0A00 - 0x0A7F]
const GURMUKHI_VOWELS: Record<string, string> = {
  'ਅ': 'a', 'ਆ': 'aa', 'ਇ': 'i', 'ਈ': 'ee', 'ਉ': 'u', 'ਊ': 'oo',
  'ਏ': 'e', 'ਐ': 'ai', 'ਓ': 'o', 'ਔ': 'au'
};

const GURMUKHI_CONSONANTS: Record<string, string> = {
  'ਕ': 'ka', 'ਖ': 'kha', 'ਗ': 'ga', 'ਘ': 'gha', 'ਙ': 'nga',
  'ਚ': 'cha', 'ਛ': 'chha', 'ਜ': 'ja', 'ਝ': 'jha', 'ਞ': 'nya',
  'ਟ': 'ta', 'ਠ': 'tha', 'ਡ': 'da', 'ਢ': 'dha', 'ਣ': 'na',
  'ਤ': 'ta', 'ਥ': 'tha', 'ਦ': 'da', 'ਧ': 'dha', 'ਨ': 'na',
  'ਪ': 'pa', 'ਫ': 'pha', 'ਬ': 'ba', 'ਭ': 'bha', 'ਮ': 'ma',
  'ਯ': 'ya', 'ਰ': 'ra', 'ਲ': 'la', 'ਵ': 'va', 'ੜ': 'ra',
  'ਸ': 'sa', 'ਹ': 'ha', 'ਖ਼': 'kha', 'ਗ਼': 'ga', 'ਜ਼': 'za', 'ਫ਼': 'fa'
};

const GURMUKHI_MATRAS: Record<string, string> = {
  'ਾ': 'aa', 'ਿ': 'i', 'ੀ': 'ee', 'ੁ': 'u', 'ੂ': 'oo',
  'ੇ': 'e', 'ੈ': 'ai', 'ੋ': 'o', 'ੌ': 'au', 'ਂ': 'n', 'ੰ': 'n', 'ੱ': ''
};

// Gujarati Unicode mapping [0x0A80 - 0x0AFF]
const GUJARATI_VOWELS: Record<string, string> = {
  'અ': 'a', 'આ': 'aa', 'ઇ': 'i', 'ઈ': 'ee', 'ઉ': 'u', 'ઊ': 'oo', 'ઋ': 'ru',
  'એ': 'e', 'ઐ': 'ai', 'ઓ': 'o', 'ઔ': 'au'
};

const GUJARATI_CONSONANTS: Record<string, string> = {
  'ક': 'ka', 'ખ': 'kha', 'ગ': 'ga', 'ઘ': 'gha', 'ઙ': 'nga',
  'ચ': 'cha', 'છ': 'chha', 'જ': 'ja', 'ઝ': 'jha', 'ઞ': 'nya',
  'ટ': 'ta', 'ઠ': 'tha', 'ડ': 'da', 'ઢ': 'dha', 'ણ': 'na',
  'ત': 'ta', 'થ': 'tha', 'દ': 'da', 'ધ': 'dha', 'ન': 'na',
  'પ': 'pa', 'ફ': 'pha', 'બ': 'ba', 'ભ': 'bha', 'મ': 'ma',
  'ય': 'ya', 'ર': 'ra', 'લ': 'la', 'વ': 'va', 'શ': 'sha',
  'ષ': 'sha', 'સ': 'sa', 'હ': 'ha', 'ળ': 'la'
};

const GUJARATI_MATRAS: Record<string, string> = {
  'ા': 'aa', 'િ': 'i', 'ી': 'ee', 'ુ': 'u', 'ૂ': 'oo', 'ૃ': 'ru',
  'ે': 'e', 'ૈ': 'ai', 'ો': 'o', 'ૌ': 'au', 'ં': 'm', 'ઃ': 'h'
};

const VIRAMAS = new Set([
  '\u094D', // Devanagari
  '\u09CD', // Bengali
  '\u0A4D', // Gurmukhi
  '\u0ACD', // Gujarati
  '\u0BCD', // Tamil
  '\u0C4D', // Telugu
  '\u0CCD', // Kannada
  '\u0D4D'  // Malayalam
]);

/**
 * Transliterates an Indic character sequence (Devanagari, Telugu, Tamil, Malayalam, Kannada, Bengali, Punjabi) into Romanized phonetic text
 */
export function romanizeIndicText(text: string): string {
  if (!text) return '';

  // Clean orphan combining nukta or dotted circle artifacts first
  const cleanText = text.replace(/◌़/g, '').replace(/◌/g, '');

  let out = '';
  const len = cleanText.length;
  let i = 0;

  while (i < len) {
    let ch = cleanText[i];
    const code = ch.charCodeAt(0);

    // Devanagari range [0x0900, 0x097F]
    if (code >= 0x0900 && code <= 0x097F) {
      let next = i + 1 < len ? cleanText[i + 1] : '';

      // Check nukta combining mark '\u093C'
      let isNukta = false;
      if (next === '\u093C') {
        if (NUKTA_CONSONANT_MAP[ch]) {
          ch = NUKTA_CONSONANT_MAP[ch];
          isNukta = true;
        }
        i++; // Consume nukta
        next = i + 1 < len ? cleanText[i + 1] : '';
      }

      if (DEVANAGARI_VOWELS[ch]) {
        out += DEVANAGARI_VOWELS[ch];
        i++;
        continue;
      }

      const base = isNukta ? ch : DEVANAGARI_CONSONANTS[ch];
      if (base) {
        if (next && VIRAMAS.has(next)) {
          out += base.slice(0, -1);
          i += 2;
          continue;
        }

        // Matra
        if (next && DEVANAGARI_MATRAS[next]) {
          const matra = DEVANAGARI_MATRAS[next];
          const afterMatra = i + 2 < len ? cleanText[i + 2] : '';
          if (afterMatra === 'ं' || afterMatra === 'ँ') {
            out += base.slice(0, -1) + matra + 'n';
            i += 3;
            continue;
          }
          out += base.slice(0, -1) + matra;
          i += 2;
          continue;
        }

        // Anusvara on bare consonant (e.g. रंग -> Rang)
        if (next === 'ं' || next === 'ँ') {
          out += base.slice(0, -1) + 'an';
          i += 2;
          continue;
        }

        // Schwa deletion on bare consonant at end of word:
        // A word ends if next is whitespace, punctuation, newline, or end of string
        const isEnd = !next || /[\s,.\-!?"'()[\]{}|]/.test(next);
        const isSingleLetterWord =
          isEnd && (i === 0 || /[\s,.\-!?"'()[\]{}|]/.test(cleanText[i - 1]));
        if (isEnd && !isSingleLetterWord) {
          out += base.slice(0, -1);
        } else {
          out += base;
        }
        i++;
        continue;
      }

      if (DEVANAGARI_MATRAS[ch]) {
        out += DEVANAGARI_MATRAS[ch];
        i++;
        continue;
      }

      // Ignore stray nukta or virama
      if (ch === '\u093C' || ch === '\u094D') {
        i++;
        continue;
      }
    }

    // Malayalam range [0x0D00, 0x0D7F]
    if (code >= 0x0D00 && code <= 0x0D7F) {
      if (MALAYALAM_VOWELS[ch]) {
        out += MALAYALAM_VOWELS[ch];
        i++;
        continue;
      }
      if (MALAYALAM_CONSONANTS[ch]) {
        const base = MALAYALAM_CONSONANTS[ch];
        // Chillu consonants don't have an inherent 'a'
        if (['ൽ', 'ൾ', 'ൺ', 'ൻ', 'ർ', 'ൿ'].includes(ch)) {
          out += base;
          i++;
          continue;
        }
        const next = i + 1 < len ? text[i + 1] : '';
        if (next && VIRAMAS.has(next)) {
          out += base.slice(0, -1);
          i += 2;
          continue;
        }
        if (next && MALAYALAM_MATRAS[next]) {
          out += base.slice(0, -1) + MALAYALAM_MATRAS[next];
          i += 2;
          continue;
        }
        out += base;
        i++;
        continue;
      }
      if (MALAYALAM_MATRAS[ch]) {
        out += MALAYALAM_MATRAS[ch];
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

    // Kannada range [0x0C80, 0x0CFF]
    if (code >= 0x0C80 && code <= 0x0CFF) {
      if (KANNADA_VOWELS[ch]) {
        out += KANNADA_VOWELS[ch];
        i++;
        continue;
      }
      if (KANNADA_CONSONANTS[ch]) {
        const base = KANNADA_CONSONANTS[ch];
        const next = i + 1 < len ? text[i + 1] : '';
        if (next && VIRAMAS.has(next)) {
          out += base.slice(0, -1);
          i += 2;
          continue;
        }
        if (next && KANNADA_MATRAS[next]) {
          out += base.slice(0, -1) + KANNADA_MATRAS[next];
          i += 2;
          continue;
        }
        out += base;
        i++;
        continue;
      }
      if (KANNADA_MATRAS[ch]) {
        out += KANNADA_MATRAS[ch];
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

    // Bengali range [0x0980, 0x09FF]
    if (code >= 0x0980 && code <= 0x09FF) {
      if (BENGALI_VOWELS[ch]) {
        out += BENGALI_VOWELS[ch];
        i++;
        continue;
      }
      if (BENGALI_CONSONANTS[ch]) {
        const base = BENGALI_CONSONANTS[ch];
        const next = i + 1 < len ? text[i + 1] : '';
        if (next && VIRAMAS.has(next)) {
          out += base.slice(0, -1);
          i += 2;
          continue;
        }
        if (next && BENGALI_MATRAS[next]) {
          out += base.slice(0, -1) + BENGALI_MATRAS[next];
          i += 2;
          continue;
        }
        out += base;
        i++;
        continue;
      }
      if (BENGALI_MATRAS[ch]) {
        out += BENGALI_MATRAS[ch];
        i++;
        continue;
      }
    }

    // Gurmukhi / Punjabi range [0x0A00, 0x0A7F]
    if (code >= 0x0A00 && code <= 0x0A7F) {
      if (GURMUKHI_VOWELS[ch]) {
        out += GURMUKHI_VOWELS[ch];
        i++;
        continue;
      }
      if (GURMUKHI_CONSONANTS[ch]) {
        const base = GURMUKHI_CONSONANTS[ch];
        const next = i + 1 < len ? text[i + 1] : '';
        if (next && VIRAMAS.has(next)) {
          out += base.slice(0, -1);
          i += 2;
          continue;
        }
        if (next && GURMUKHI_MATRAS[next]) {
          out += base.slice(0, -1) + GURMUKHI_MATRAS[next];
          i += 2;
          continue;
        }
        out += base;
        i++;
        continue;
      }
      if (GURMUKHI_MATRAS[ch]) {
        out += GURMUKHI_MATRAS[ch];
        i++;
        continue;
      }
    }

    // Gujarati range [0x0A80, 0x0AFF]
    if (code >= 0x0A80 && code <= 0x0AFF) {
      if (GUJARATI_VOWELS[ch]) {
        out += GUJARATI_VOWELS[ch];
        i++;
        continue;
      }
      if (GUJARATI_CONSONANTS[ch]) {
        const base = GUJARATI_CONSONANTS[ch];
        const next = i + 1 < len ? text[i + 1] : '';
        if (next && VIRAMAS.has(next)) {
          out += base.slice(0, -1);
          i += 2;
          continue;
        }
        if (next && GUJARATI_MATRAS[next]) {
          out += base.slice(0, -1) + GUJARATI_MATRAS[next];
          i += 2;
          continue;
        }
        out += base;
        i++;
        continue;
      }
      if (GUJARATI_MATRAS[ch]) {
        out += GUJARATI_MATRAS[ch];
        i++;
        continue;
      }
    }

    // Default passthrough for ASCII, whitespace, punctuation, Latin (exclude stray combining marks)
    if (
      ch !== '\u093C' &&
      ch !== '\u094D' &&
      ch !== '\u25CC' &&
      ch !== '\u09BC' &&
      ch !== '\u0A3C' &&
      ch !== '\u0ABC'
    ) {
      out += ch;
    }
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
