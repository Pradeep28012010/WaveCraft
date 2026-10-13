/**
 * Audio Stream Resolution Engine.
 * Handles high-fidelity 320kbps JioSaavn CDN audio stream decryption,
 * Apple Music preview fallbacks, and YouTube adaptive audio stream extraction.
 */

import { fetchWithTimeout } from './cache.js';

// -------------------------------------------------------------
// Direct 320kbps Audio Stream Resolution via Saavn CDN (DES)
// -------------------------------------------------------------
const DES_PC1 = [57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4];
const DES_PC2 = [14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,41,52,31,37,47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32];
const DES_IP = [58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7];
const DES_FP = [40,8,48,16,56,24,64,32,39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25];
const DES_E = [32,1,2,3,4,5,4,5,6,7,8,9,8,9,10,11,12,13,12,13,14,15,16,17,16,17,18,19,20,21,20,21,22,23,24,25,24,25,26,27,28,29,28,29,30,31,32,1];
const DES_P = [16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25];
const DES_S = [
  [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
  [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
  [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
  [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
  [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
  [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
  [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
  [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11]
];
const DES_SHIFTS = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];

function desPermute(bits, table) { return table.map((i) => bits[i - 1]); }
function desBytesToBits(bytes) {
  const bits = [];
  for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  return bits;
}
function desBitsToBytes(bits) {
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    bytes.push(b);
  }
  return bytes;
}

const desKeyBits = desPermute(desBytesToBits([...'38346591'].map((c) => c.charCodeAt(0))), DES_PC1);
let desC = desKeyBits.slice(0, 28);
let desD = desKeyBits.slice(28);
const desSubKeys = DES_SHIFTS.map((s) => {
  desC = desC.slice(s).concat(desC.slice(0, s));
  desD = desD.slice(s).concat(desD.slice(0, s));
  return desPermute(desC.concat(desD), DES_PC2);
}).reverse();

export function decryptSaavnMediaUrl(enc) {
  if (!enc) return undefined;
  try {
    const raw = Buffer.from(enc, 'base64');
    const out = [];
    for (let off = 0; off < raw.length; off += 8) {
      const block = desPermute(desBytesToBits(raw.slice(off, off + 8)), DES_IP);
      let L = block.slice(0, 32);
      let R = block.slice(32);
      for (let round = 0; round < 16; round++) {
        const exp = desPermute(R, DES_E).map((b, idx) => b ^ desSubKeys[round][idx]);
        const sOut = [];
        for (let sb = 0; sb < 8; sb++) {
          const chunk = exp.slice(sb * 6, sb * 6 + 6);
          const row = (chunk[0] << 1) | chunk[5];
          const col = (chunk[1] << 3) | (chunk[2] << 2) | (chunk[3] << 1) | chunk[4];
          const val = DES_S[sb][row * 16 + col];
          sOut.push((val >> 3) & 1, (val >> 2) & 1, (val >> 1) & 1, val & 1);
        }
        const f = desPermute(sOut, DES_P);
        const nextR = L.map((b, idx) => b ^ f[idx]);
        L = R;
        R = nextR;
      }
      out.push(...desBitsToBytes(desPermute(R.concat(L), DES_FP)));
    }
    const pad = out[out.length - 1];
    const clean = pad >= 1 && pad <= 8 ? out.slice(0, out.length - pad) : out;
    const url = String.fromCharCode(...clean)
      .replace('_96.mp4', '_320.mp4')
      .replace('_160.mp4', '_320.mp4')
      .replace('http://', 'https://')
      .replace('web.saavncdn.com', 'aac.saavncdn.com')
      .replace('preview.saavncdn.com', 'aac.saavncdn.com');
    return url.startsWith('https://') ? url : undefined;
  } catch {
    return undefined;
  }
}

const LABEL_CHANNEL_REGEX =
  /(?:t-series|aditya|sony|zee|saregama|think|lahari|junglee|tips|yrf|mythri|hombale|vevo|speed|white\s*hill|records|films|movies|music|media|studios|entertainment|international|audio|series|channel|official|ap\s*international)/i;

export function isStrictSaavnMatch(
  targetTitle,
  targetArtist,
  candTitle,
  candSubtitle,
  rawTargetTitle
) {
  if (!candTitle || !targetTitle) return false;

  const BGM_REGEX =
    /\b(instrumental|karaoke|minus\s*one|backing\s*track|bgm)\b/i;

  const normTarget = (targetTitle || '').toLowerCase().trim();
  const normCand = (candTitle || '').toLowerCase().trim();
  const candFull = `${normCand} ${(candSubtitle || '').toLowerCase()}`.trim();

  // If user searched for a vocal track, reject candidate if candidate title is instrumental / BGM / karaoke
  const isTargetInst = BGM_REGEX.test(normTarget);
  const isCandInst = BGM_REGEX.test(normCand);
  if (!isTargetInst && isCandInst) {
    return false;
  }

  const cleanTarget = normTarget
    .replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanCand = normCand
    .replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanRawTarget = (rawTargetTitle || targetTitle || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const normVowels = (s) =>
    (s || '').replace(/aa+/g, 'a').replace(/ee+/g, 'i').replace(/oo+/g, 'u').replace(/ii+/g, 'i');

  // Validate artist if specified: prevent wrong song by different artist with identical title
  const isGenericPlaceholder =
    !targetArtist ||
    /^(wavecraft|youtube\s*music|various\s*artists|unknown\s*artist|official\s*audio|top\s*hits|music|artist)$/i.test(
      String(targetArtist).trim()
    );

  const isLabelOrChannel = Boolean(targetArtist && LABEL_CHANNEL_REGEX.test(targetArtist));

  let artistMatches = true;
  let artistMismatch = false;

  if (!isGenericPlaceholder && !isLabelOrChannel && typeof targetArtist === 'string' && targetArtist.trim().length > 1) {
    const cleanTargetArtist = targetArtist
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/(?:vevo|records|entertainment|music|official|channel|series|films)\b.*$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const artistTokens = cleanTargetArtist.split(/\s+/).filter((t) => t.length > 2);
    if (artistTokens.length > 0) {
      artistMatches = artistTokens.some((tok) => candFull.includes(tok));
      if (!artistMatches) {
        artistMismatch = true;
      }
    }
  }

  // Reject wrong artist if target had a specific distinct singer
  if (artistMismatch) {
    return false;
  }

  // Subtitle contains tokens of raw title (e.g. film name, composer, co-singer)
  const candSubTokens = (candSubtitle || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const subMatchesRawTitle = candSubTokens.some((tok) => cleanRawTarget.includes(tok));

  // 1. Exact or vowel-normalized title match
  if (cleanTarget === cleanCand || normVowels(cleanTarget) === normVowels(cleanCand)) {
    return true;
  }
  if (
    cleanCand.startsWith(cleanTarget) ||
    cleanTarget.startsWith(cleanCand) ||
    normVowels(cleanCand).startsWith(normVowels(cleanTarget)) ||
    normVowels(cleanTarget).startsWith(normVowels(cleanCand))
  ) {
    return true;
  }

  // 2. Token matching across candidate full text
  const targetTokens = cleanTarget.split(/\s+/).filter((t) => t.length > 1);
  const candTokens = cleanCand.split(/\s+/).filter((t) => t.length > 1);
  const candFullTokens = candFull.split(/\s+/).filter((t) => t.length > 1);

  if (targetTokens.length === 0) return false;

  const matchedCandTokens = targetTokens.filter((t) => candTokens.includes(t));
  const matchedFullTokens = targetTokens.filter((t) => candFullTokens.includes(t));

  const targetVowelTokens = targetTokens.map(normVowels);
  const candVowelTokens = candTokens.map(normVowels);
  const matchedVowelTokens = targetVowelTokens.filter((t) => candVowelTokens.includes(t));

  const ratioCand = matchedCandTokens.length / targetTokens.length;
  const ratioFull = matchedFullTokens.length / targetTokens.length;
  const ratioVowel = matchedVowelTokens.length / targetTokens.length;

  if (targetTokens.length === 1) {
    return (
      candTokens.includes(targetTokens[0]) ||
      candVowelTokens.includes(normVowels(targetTokens[0])) ||
      (subMatchesRawTitle && candFullTokens.includes(targetTokens[0]))
    );
  }

  return (
    ratioCand >= 0.6 ||
    (ratioVowel >= 0.5 && (artistMatches || subMatchesRawTitle)) ||
    (ratioFull >= 0.75 && (artistMatches || subMatchesRawTitle))
  );
}

export async function resolveDirectAudioStream(title, artist, clientIp = '103.212.156.1') {
  if (!title) return null;
  const raw = (title || '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();

  const pipeParts = raw.split('|').map((s) => s.trim()).filter(Boolean);
  const movieContext = pipeParts.length >= 2 ? pipeParts[1].replace(/[-–—].*$/, '').trim() : undefined;

  let cleanTitle = raw
    .replace(/\s*[\(\[](?:official\s*(?:music\s*)?video|official\s*audio|lyric\s*video|lyrical\s*video|lyrical\s*song|video\s*song|full\s*song|4k|8k|hd|audio\s*song|audio|visualizer|remastered|lyrics|prod\s*\..*?|dir\s*\..*?|second\s*single|first\s*single|third\s*single|promo|teaser|trailer|original\s*(?:motion\s*picture\s*)?soundtrack|soundtrack|ost|expanded(?:\s*edition)?|deluxe(?:\s*edition)?|special\s*edition|anniversary(?:\s*edition)?|score|bonus\s*track(?:s)?|from\s*["'].*?["'])[\)\]]\s*/gi, ' ')
    .replace(/\s+(?:full\s+video\s+song|full\s+video|video\s+song|lyrical\s+video|lyrical\s+song|lyrical|full\s+song|full\s+audio|8k\s+video|4k\s+video|hd\s+video|official\s+video|official\s+audio|second\s+single|first\s+single|promo\s+song|video)\b.*$/i, '')
    .replace(/\|\s*.*$/g, '')
    .replace(/[-–—]\s*(?:video|lyric|audio|full|song|original\s*(?:motion\s*picture\s*)?soundtrack|expanded\s*edition|deluxe\s*edition).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  let cleanArtist = (artist || '')
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/(?:vevo|records|entertainment|music|official|channel|series|films)\b.*$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const dashParts = cleanTitle.split(/\s*[-–—]\s*/).map((s) => s.trim()).filter(Boolean);
  let songName = cleanTitle;
  let detectedArtist = cleanArtist;
  if (dashParts.length >= 2) {
    songName = dashParts[1];
    detectedArtist = dashParts[0];
  }

  const querySet = new Set();
  if (detectedArtist && songName && !LABEL_CHANNEL_REGEX.test(detectedArtist)) {
    querySet.add(`${songName} ${detectedArtist}`.trim());
  }
  if (movieContext && songName) {
    querySet.add(`${songName} ${movieContext}`.trim());
  }
  if (cleanArtist && songName && cleanArtist !== detectedArtist && !LABEL_CHANNEL_REGEX.test(cleanArtist)) {
    querySet.add(`${songName} ${cleanArtist}`.trim());
  }
  if (songName) querySet.add(songName);
  if (cleanTitle) querySet.add(cleanTitle);
  if (cleanArtist && cleanTitle && !LABEL_CHANNEL_REGEX.test(cleanArtist)) {
    querySet.add(`${cleanTitle} ${cleanArtist}`.trim());
  }

  const candidateQueries = Array.from(querySet).filter((q) => q.length > 1);

  const ipHeader =
    clientIp && clientIp !== 'unknown' && !clientIp.startsWith('127.') && !clientIp.startsWith('192.168.') && !clientIp.startsWith('::1')
      ? clientIp
      : '103.212.156.1';

  // Pure YouTube streaming: all songs stream directly from YouTube
  return null;
}

export async function resolveYouTubeAudioStream(videoId) {
  if (!videoId) return null;
  try {
    const res = await fetchWithTimeout(
      'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'ANDROID',
              clientVersion: '19.09.37',
              hl: 'en',
              gl: 'US'
            }
          },
          videoId
        })
      },
      4500
    );
    if (!res.ok) return null;
    const data = await res.json();
    const formats = data?.streamingData?.adaptiveFormats || [];
    const audioFormats = formats.filter(
      (f) => f.mimeType && f.mimeType.startsWith('audio/') && f.url
    );
    if (audioFormats.length > 0) {
      audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      return {
        audioUrl: audioFormats[0].url,
        quality: `${Math.round((audioFormats[0].bitrate || 128000) / 1000)}kbps Audio`,
        title: data.videoDetails?.title || '',
        artist: data.videoDetails?.author || ''
      };
    }
  } catch {}
  return null;
}
