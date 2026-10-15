/**
 * WaveCraft Synchronized & Plain Lyrics Resolution Service.
 * Queries multi-tier providers (LRCLIB exact match, fuzzy search, lyrics.ovh)
 * with fuzzy scoring and duration verification.
 */

import { fetchWithTimeout } from './cache.js';

const JUNK_SEGMENT_REGEX =
  /^(?:full\s+video\s+song|full\s+video|video\s+song|lyrical\s+video\s+song|lyrical\s+video|lyrical\s+song|lyrical|audio\s+song|full\s+song|full\s+audio|official\s+video|official\s+audio|official\s+music\s+video|title\s+track\s+(?:video\s+)?song|title\s+track|teaser|trailer|promo|glimpse|making|behind\s+the\s+scenes|4k|8k|hd|1080p|uhd|telugu|tamil|hindi|kannada|malayalam|bhojpuri|punjabi|english|remastered|status|shorts)$/i;

function isJunkSegment(segment) {
  if (!segment) return true;
  const s = segment.trim();
  if (s.length <= 1) return true;
  return JUNK_SEGMENT_REGEX.test(s);
}

function cleanSongTitlePart(str) {
  if (!str) return '';
  return str
    .replace(
      /\s*[\(\[](?:official\s*(?:music\s*)?video|official\s*audio|lyric\s*video|lyrical\s*(?:video\s*)?song|lyrical\s*video|video\s*song|full\s*(?:video\s*)?song|full\s*song|full\s*video|4k|8k|hd|audio\s*song|audio|visualizer|remastered|lyrics|prod\s*\..*?|dir\s*\..*?|with\s*lyrics|song)[\)\]]\s*/gi,
      ' '
    )
    .replace(
      /\s*(?:latest\s*(?:punjabi|hindi|telugu|tamil|bhojpuri|malayalam|kannada|english)?\s*songs?\s*(?:202\d)?|new\s*(?:hindi|punjabi|telugu|tamil|bhojpuri|malayalam|kannada|english)?\s*songs?\s*(?:202\d)?)\s*/gi,
      ' '
    )
    .replace(
      /^(?:full\s+video\s+song|full\s+video|video\s+song|lyrical\s+video\s+song|lyrical\s+video|lyrical\s+song|lyrical|full\s+song|official\s+music\s+video|official\s+video|official\s+audio|4k\s+video|8k\s+video|audio\s+song|audio)\s*[:\-–—]?\s*/i,
      ''
    )
    .replace(
      /\s*[-–—:|]?\s*(?:full\s+video\s+song|full\s+video|video\s+song|lyrical\s+video\s+song|lyrical\s+video|lyrical\s+song|lyrical|full\s+song|full\s+audio|8k\s+video|4k\s+video|hd\s+video|official\s+music\s+video|official\s+video|official\s+audio|audio\s+song|title\s+track\s+(?:video\s+)?song|title\s+track)\b.*$/i,
      ''
    )
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, '')
    .trim();
}

const KNOWN_COMPOSERS_REGEX =
  /\b(anirudh|devi\s*sri\s*prasad|dsp|thaman|rahman|a\.?r\.?\s*rahman|pritam|sachin-jigar|sachin\s*jigar|arijit|sid\s*sriram|karan\s*aujla|diljit|badshah|shreya|sunidhi|armaan\s*malik|darshan\s*raval|jubin|vishal|shekhar|amit\s*trivedi|santhosh\s*narayanan|sushin\s*shyam|hesham|harris\s*jayaraj|yuvan|g\.?v\.?\s*prakash|keeravaani|keeravani|ilaiyaraaja|chithra|spb|shankar\s*mahadevan|hariharan|udit\s*narayan|kumar\s*sanu|alka\s*yagnik|sonu\s*nigam|gv\s*prakash|honey\s*singh|mc\s*stan|raftaar|king|divine|sidhu\s*moose\s*wala|jasleen\s*royal|shilpa\s*rao|monali\s*thakur|neha\s*kakkar|tony\s*kakkar|mika\s*singh|guru\s*randhawa)\b/i;

const STUDIO_LABEL_DISCARD_REGEX =
  /\b(sun\s*pictures|lyca\s*productions|sithara\s*entertainments|mythri\s*movie\s*makers|t-series|sony\s*music|aditya\s*music|zee\s*music|lahari|saregama|think\s*music|tips|yrf|hombale|pen\s*movies|geetha\s*arts|dvo|shree\s*music|times\s*music|vevo|official|channel|records|films|movies)\b/i;

export function parseTrackMetadata(rawTitle, rawArtist) {
  let title = (rawTitle || '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

  let channelAuthor = (rawArtist || '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/ - Topic$/i, '')
    .replace(/\s*-\s*Official.*$/i, '')
    .trim();

  const isLabelChannel =
    /^(?:t-series|aditya\s*music|sony\s*music|zee\s*music|saregama|think\s*music|lahari\s*music|junglee\s*music|tips\s*official|yrf|mythri|hombale|speed\s*records|white\s*hill|wavecraft|unknown\s*artist|official\s*channel|records|films|movies|music\s*company)\b/i.test(
      channelAuthor
    );

  const rawPipes = title.split('|').map((p) => p.trim()).filter(Boolean);
  const pipeParts = rawPipes.filter((p) => !isJunkSegment(cleanSongTitlePart(p)));

  let cleanTitle = '';
  let cleanArtist = '';
  let cleanAlbum = '';

  if (pipeParts.length >= 2) {
    cleanTitle = cleanSongTitlePart(pipeParts[0]);

    const dashInTitle = cleanTitle.split(/\s+[-–—]\s+/);
    if (dashInTitle.length === 2) {
      if (isJunkSegment(dashInTitle[1])) {
        cleanTitle = cleanSongTitlePart(dashInTitle[0]);
      } else if (isJunkSegment(dashInTitle[0])) {
        cleanTitle = cleanSongTitlePart(dashInTitle[1]);
      }
    }

    if (isLabelChannel) {
      cleanAlbum = pipeParts[1].replace(/\s*[-–—]\s*(?:movie|film|album)\b/i, '').trim();

      if (pipeParts.length >= 3) {
        const potentialArtists = pipeParts
          .slice(2)
          .map((p) => p.replace(/\s*[\(\[].*?[\)\]]/g, '').trim())
          .filter((p) => p && !STUDIO_LABEL_DISCARD_REGEX.test(p) && !isJunkSegment(p));

        if (potentialArtists.length > 0) {
          const composerIndex = potentialArtists.findIndex((p) => KNOWN_COMPOSERS_REGEX.test(p));
          if (composerIndex !== -1) {
            const composer = potentialArtists[composerIndex];
            const others = potentialArtists.filter((_, idx) => idx !== composerIndex);
            cleanArtist = others.length > 0 ? `${composer}, ${others[0]}` : composer;
          } else {
            cleanArtist = potentialArtists[potentialArtists.length - 1];
          }
        }
      }

      if (!cleanArtist) {
        cleanArtist =
          channelAuthor.replace(/\b(Music|Records|Films|Entertainment|South|India|Company|Media)\b/gi, '').trim() ||
          channelAuthor;
      }
    } else {
      if (
        pipeParts[1].toLowerCase().includes(channelAuthor.toLowerCase()) ||
        channelAuthor.toLowerCase().includes(pipeParts[1].toLowerCase())
      ) {
        cleanArtist = pipeParts[1];
      } else {
        cleanAlbum = pipeParts[1];
        cleanArtist = channelAuthor;
      }
    }
  } else {
    const rawCleaned = cleanSongTitlePart(title);
    const dashParts = rawCleaned.split(/\s+[-–—]\s+/);

    if (dashParts.length >= 2) {
      const part0 = dashParts[0].trim();
      const part1 = dashParts.slice(1).join(' - ').trim();

      if (isJunkSegment(part1)) {
        cleanTitle = cleanSongTitlePart(part0);
        cleanArtist = channelAuthor;
      } else if (isJunkSegment(part0)) {
        cleanTitle = cleanSongTitlePart(part1);
        cleanArtist = channelAuthor;
      } else if (isLabelChannel) {
        cleanAlbum = part0;
        cleanTitle = cleanSongTitlePart(part1);
        cleanArtist =
          channelAuthor.replace(/\b(Music|Records|Films|Entertainment|South|India|Company|Media)\b/gi, '').trim() ||
          channelAuthor;
      } else {
        cleanArtist = part0;
        cleanTitle = cleanSongTitlePart(part1);
      }
    } else {
      cleanTitle = rawCleaned || title;
      cleanArtist = channelAuthor;
    }
  }

  if (isJunkSegment(cleanTitle) || !cleanTitle) {
    cleanTitle = cleanSongTitlePart(rawPipes[0] || title) || title;
  }
  if (!cleanArtist || isJunkSegment(cleanArtist)) {
    cleanArtist = channelAuthor || 'YouTube Music';
  }

  cleanTitle = cleanTitle
    .replace(/\s*[\(\[](?:from\s+.*?|feat\..*?|ft\..*?)[\)\]]/gi, '')
    .replace(/\s*[-–—]\s*(?:from|feat|ft|telugu|hindi|tamil|malayalam|kannada)\b.*$/i, '')
    .replace(/\s+feat\..*$/i, '')
    .replace(/\s+ft\..*$/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();

  const primaryArtist = cleanArtist
    .split(/[,&/]|(?:\s+feat\.?\s+)|\s+ft\.?\s+/i)[0]
    .trim();

  return { cleanTitle: cleanTitle || title, cleanArtist: cleanArtist || 'YouTube Music', primaryArtist, cleanAlbum };
}

export function normalizeForMatch(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function calculateMatchScore(queryTitle, queryArtist, candidateTitle, candidateArtist, candidateDuration = 0, targetDuration = 0) {
  const normQTitle = normalizeForMatch(queryTitle);
  const normCTitle = normalizeForMatch(candidateTitle);
  const normQArtist = normalizeForMatch(queryArtist);
  const normCArtist = normalizeForMatch(candidateArtist);

  if (!normQTitle || !normCTitle) return 0;

  // Title match scoring
  let titleScore = 0;
  if (normQTitle === normCTitle) {
    titleScore = 1.0;
  } else if (normCTitle.startsWith(normQTitle) || normQTitle.startsWith(normCTitle)) {
    titleScore = 0.88;
  } else {
    const qTokens = normQTitle.split(' ').filter((t) => t.length > 1);
    const cTokens = new Set(normCTitle.split(' ').filter((t) => t.length > 1));
    const matched = qTokens.filter((t) => cTokens.has(t));
    if (qTokens.length > 0 && matched.length === qTokens.length) {
      titleScore = 0.82;
    } else if (qTokens.length > 0 && matched.length / qTokens.length >= 0.7) {
      titleScore = 0.65;
    } else {
      return 0; // Strict rejection on title mismatch
    }
  }

  // Artist match scoring
  let artistScore = 0;
  if (!normQArtist) {
    artistScore = titleScore === 1.0 ? 0.6 : 0;
  } else if (normCArtist === normQArtist) {
    artistScore = 1.0;
  } else if (normCArtist.includes(normQArtist) || normQArtist.includes(normCArtist)) {
    artistScore = 0.92;
  } else {
    const qArtistTokens = normQArtist.split(' ').filter((t) => t.length > 2);
    const cArtistTokens = new Set(normCArtist.split(' ').filter((t) => t.length > 2));
    const matchedArtists = qArtistTokens.filter((t) => cArtistTokens.has(t));
    if (qArtistTokens.length > 0 && matchedArtists.length >= Math.min(2, qArtistTokens.length)) {
      artistScore = 0.82;
    } else {
      return 0; // Strict rejection on artist mismatch
    }
  }

  // Duration verification
  let durationBonus = 0;
  if (candidateDuration && targetDuration && targetDuration > 30) {
    const diff = Math.abs(candidateDuration - targetDuration);
    if (diff <= 5) durationBonus = 0.2;
    else if (diff <= 15) durationBonus = 0.1;
    else if (diff > 45) return 0;
  }

  return titleScore * 0.6 + artistScore * 0.4 + durationBonus;
}

export async function fetchMultiSourceLyrics(rawTitle, rawArtist, duration = 0) {
  const { cleanTitle, cleanArtist, primaryArtist } = parseTrackMetadata(rawTitle, rawArtist);
  if (!cleanTitle) return { synced: false, lyrics: null, source: null };

  const LRCLIB_HEADERS = {
    'User-Agent': 'WaveCraft-Player/2.4.0 (https://github.com/Pradeep28012010/WaveCraft)'
  };

  // 1. Try LRCLIB exact match (/api/get)
  if (primaryArtist && cleanTitle) {
    try {
      const getParams = new URLSearchParams({
        track_name: cleanTitle,
        artist_name: primaryArtist
      });
      if (duration && duration > 30) {
        getParams.set('duration', Math.round(duration).toString());
      }
      const r1 = await fetchWithTimeout(
        `https://lrclib.net/api/get?${getParams.toString()}`,
        { headers: LRCLIB_HEADERS },
        3000
      );
      if (r1.ok) {
        const item = await r1.json();
        const raw = item?.syncedLyrics || item?.plainLyrics;
        if (raw) {
          return {
            synced: Boolean(item.syncedLyrics),
            lyrics: raw,
            source: item.syncedLyrics ? 'WaveSync • Time-Synced' : 'WaveSync Lyrics',
            verified: true
          };
        }
      }
    } catch {}
  }

  // 2. Try LRCLIB targeted search (/api/search?track_name=...&artist_name=...)
  try {
    const searchUrl = primaryArtist
      ? `https://lrclib.net/api/search?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(primaryArtist)}`
      : `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`;

    const r2 = await fetchWithTimeout(searchUrl, { headers: LRCLIB_HEADERS }, 3200);
    if (r2.ok) {
      const list = await r2.json();
      if (Array.isArray(list) && list.length > 0) {
        const scored = list
          .map((item) => ({
            item,
            score: calculateMatchScore(
              cleanTitle,
              primaryArtist || cleanArtist,
              item.trackName,
              item.artistName,
              item.duration,
              duration
            )
          }))
          .filter((c) => c.score >= 0.65)
          .sort((a, b) => {
            if (Boolean(b.item.syncedLyrics) !== Boolean(a.item.syncedLyrics)) {
              return b.item.syncedLyrics ? 1 : -1;
            }
            return b.score - a.score;
          });

        if (scored.length > 0) {
          const best = scored[0].item;
          const raw = best.syncedLyrics || best.plainLyrics;
          if (raw) {
            return {
              synced: Boolean(best.syncedLyrics),
              lyrics: raw,
              source: best.syncedLyrics ? 'WaveSync • Time-Synced' : 'WaveSync Lyrics',
              verified: true
            };
          }
        }
      }
    }
  } catch {}

  // 2b. Try LRCLIB general fuzzy search (/api/search?q=...)
  try {
    const query = primaryArtist ? `${cleanTitle} ${primaryArtist}` : cleanTitle;
    const r2b = await fetchWithTimeout(
      `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
      { headers: LRCLIB_HEADERS },
      3200
    );
    if (r2b.ok) {
      const list = await r2b.json();
      if (Array.isArray(list) && list.length > 0) {
        // Find best match with synced lyrics
        const withLyrics = list.filter((item) => item.syncedLyrics || item.plainLyrics);
        if (withLyrics.length > 0) {
          const syncedFirst = withLyrics.sort((a, b) => (b.syncedLyrics ? 1 : 0) - (a.syncedLyrics ? 1 : 0));
          const best = syncedFirst[0];
          return {
            synced: Boolean(best.syncedLyrics),
            lyrics: best.syncedLyrics || best.plainLyrics,
            source: best.syncedLyrics ? 'WaveSync • Time-Synced' : 'WaveSync Lyrics',
            verified: true
          };
        }
      }
    }
  } catch {}

  // 3. Try plain lyrics lookup (lyrics.ovh) with primaryArtist and cleanTitle
  if (primaryArtist && cleanTitle) {
    try {
      const ovhRes = await fetchWithTimeout(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(primaryArtist)}/${encodeURIComponent(cleanTitle)}`,
        {},
        2500
      );
      if (ovhRes.ok) {
        const ovhData = await ovhRes.json();
        if (ovhData?.lyrics && ovhData.lyrics.trim().length > 40) {
          return {
            synced: false,
            lyrics: ovhData.lyrics.trim(),
            source: 'Studio Lyrics',
            verified: true
          };
        }
      }
    } catch {}
  }

  return { synced: false, lyrics: null, source: null };
}
