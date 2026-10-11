import test from 'node:test';
import assert from 'node:assert/strict';

test('Search Ranking & Stream Fixes Validation', async (t) => {
  const BGM_OR_INSTRUMENTAL_REGEX =
    /\b(bgm|background\s*(?:music|score)|theme\s*(?:music|video|song|track)?|instrumental|karaoke|backing\s*track|minus\s*one|no\s*vocals?|without\s*vocals?|off\s*vocal|vocal\s*cut|score|piano\s*(?:cover|version)|flute|guitar\s*(?:cover|version)|violin\s*(?:cover|version)|sax\s*(?:cover|version)|orchestral\s*version|ringtone|soundtrack\s*suite)\b/i;

  await t.test('Query Construction for Vocal Intent', () => {
    const buildYtQuery = (clean) => {
      const hasMusicIndicator =
        /\b(song|songs|remix|official|audio|music|album|track|lyric|lyrics|video|soundtrack|ost)\b/i.test(clean);
      return hasMusicIndicator ? clean : `${clean} song`;
    };

    assert.equal(buildYtQuery('KGF Chapter 2'), 'KGF Chapter 2 song');
    assert.equal(buildYtQuery('Devara Chuttamalle'), 'Devara Chuttamalle song');
    assert.equal(buildYtQuery('Pushpa 2 The Rule'), 'Pushpa 2 The Rule song');
    assert.equal(buildYtQuery('Shape of You official audio'), 'Shape of You official audio');
    assert.equal(buildYtQuery('Blinding Lights song'), 'Blinding Lights song');
  });

  await t.test('BGM / Instrumental Detection on Raw Titles', () => {
    const testCases = [
      { raw: 'K.G.F Chapter 2 | Monster BGM | Yash | Ravi Basrur', isInst: true },
      { raw: 'Animal - Ranvijay Entry BGM | Sandeep Reddy Vanga', isInst: true },
      { raw: 'Vikram Title Track | Background Score | Anirudh', isInst: true },
      { raw: 'Interstellar Main Theme Music (Original Score)', isInst: true },
      { raw: 'Devara - Chuttamalle Full Video Song | Jr NTR | Janhvi Kapoor', isInst: false },
      { raw: 'K.G.F Chapter 2 - Sulthan Lyrical Video | Yash | Ravi Basrur', isInst: false },
      { raw: 'Starboy (Official Audio) ft. Daft Punk', isInst: false }
    ];

    for (const tc of testCases) {
      assert.equal(
        BGM_OR_INSTRUMENTAL_REGEX.test(tc.raw),
        tc.isInst,
        `Expected ${tc.raw} to have isInst=${tc.isInst}`
      );
    }
  });

  await t.test('Vocal Tracks Rank Above BGM When User Does Not Request Instrumental', () => {
    const rawResults = [
      {
        title: 'KGF Chapter 2 Monster BGM',
        isInstrumental: true
      },
      {
        title: 'KGF Chapter 2 - Sulthan Song',
        isInstrumental: false
      },
      {
        title: 'KGF Chapter 2 - Toofan Song',
        isInstrumental: false
      },
      {
        title: 'KGF 2 Background Score Suite',
        isInstrumental: true
      }
    ];

    const wantsInstrumental = false;
    const sorted = [...rawResults].sort((a, b) => {
      if (!wantsInstrumental) {
        const aInst = Boolean(a.isInstrumental || BGM_OR_INSTRUMENTAL_REGEX.test(a.title));
        const bInst = Boolean(b.isInstrumental || BGM_OR_INSTRUMENTAL_REGEX.test(b.title));
        if (aInst && !bInst) return 1;
        if (!aInst && bInst) return -1;
      }
      return 0;
    });

    assert.equal(sorted[0].isInstrumental, false);
    assert.equal(sorted[1].isInstrumental, false);
    assert.equal(sorted[2].isInstrumental, true);
    assert.equal(sorted[3].isInstrumental, true);
  });

  await t.test('Preview URLs Excluded from Primary CDN Audio Streams', () => {
    const isValidCdnAudio = (url) => {
      if (!url) return false;
      if (url.includes('p.scdn.co')) return false; // 30s Spotify preview
      if (url.includes('itunes.apple.com') || url.includes('mzstatic.com')) return false; // 30s Apple preview
      return (
        url.startsWith('https://aac.saavncdn.com') ||
        url.startsWith('blob:') ||
        url.endsWith('.mp4') ||
        url.endsWith('.m4a')
      );
    };

    assert.equal(isValidCdnAudio('https://audio-ssl.itunes.apple.com/itunes-assets/preview.m4a'), false);
    assert.equal(isValidCdnAudio('https://p.scdn.co/mp3-preview/123456789'), false);
    assert.equal(isValidCdnAudio('https://aac.saavncdn.com/123/sample_320.mp4'), true);
    assert.equal(isValidCdnAudio('blob:http://localhost:5173/abc-123'), true);
  });

  await t.test('Junk Discard Regex Filters Karaoke Channels and Dance Clips', () => {
    const JUNK_DISCARD_REGEX =
      /\b(karaoke|minus\s*one|backing\s*track|no\s*vocals?|without\s*vocals?|vocal\s*cut|off\s*vocal|sing\s*along|maa\s*paata\s*mee\s*nota|dance\s*performance|dance\s*cover|choreography|choreographed|duet\s*dance|college\s*dance|stage\s*performance|drama\s*company|reactions?|review|tutorial|lesson|ringtone|whatsapp\s*status|shorts|sound\s*effect|sfx|status\s*video|tiktok\s*audio)\b/i;

    const testEntries = [
      { text: 'Raa Raa Naa Veera Song With Telugu Lyrics | Ganga | Maa Paata Mee Nota', author: 'Maa Paata Mee Nota', expectDiscard: true },
      { text: '"Raa Raa Naa Veera" Song Manikanta & Tejaswini Dance Performance', author: 'etvteluguindia', expectDiscard: true },
      { text: 'Raa Raa Naa Veera Song - Dance Performance By Cherry & Hemakshi', author: 'ETV Dance Studio', expectDiscard: true },
      { text: 'rara na veera duet dance @ iit roorkee #tarngini', author: 'Bheeshma Rangu', expectDiscard: true },
      { text: 'RAA RA NA VEERA DANCE COVER | Ganga', author: 'N Dance Studio', expectDiscard: true },
      { text: 'Raa Raa Naa Veera 4K 60FPS Full Video Song | Ganga Telugu', author: 'S P MUSIC', expectDiscard: false },
      { text: 'raa ra na veera (ganga)', author: 'moodycrunch0344', expectDiscard: false },
      { text: 'Vaaya En Veera - Video Song | Kanchana 2', author: 'Sun Music', expectDiscard: false }
    ];

    for (const te of testEntries) {
      const isDiscarded = JUNK_DISCARD_REGEX.test(te.text) || JUNK_DISCARD_REGEX.test(te.author);
      assert.equal(isDiscarded, te.expectDiscard, `Failed discard expectation for: ${te.text}`);
    }
  });

  await t.test('isStrictSaavnMatch Rejects False Matches and Non-Vocal Hijacking', () => {
    function isStrictSaavnMatch(targetTitle, targetArtist, candTitle, candSubtitle) {
      if (!candTitle || !targetTitle) return false;

      const BGM_REGEX =
        /\b(instrumental|karaoke|minus\s*one|backing\s*track|bgm|theme\s*(?:music|song|track)?|background\s*score|score|soundtrack)\b/i;

      const normTarget = (targetTitle || '').toLowerCase().trim();
      const normCand = (candTitle || '').toLowerCase().trim();
      const candFull = `${normCand} ${(candSubtitle || '').toLowerCase()}`.trim();

      const isTargetInst = BGM_REGEX.test(normTarget);
      const isCandInst = BGM_REGEX.test(candFull);
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

      if (cleanTarget === cleanCand) return true;
      if (cleanCand.startsWith(cleanTarget) || cleanTarget.startsWith(cleanCand)) return true;

      const targetTokens = cleanTarget.split(/\s+/).filter((t) => t.length > 1);
      const candTokens = cleanCand.split(/\s+/).filter((t) => t.length > 1);

      if (targetTokens.length === 0) return false;

      const matchedTokens = targetTokens.filter((t) => candTokens.includes(t));
      const ratio = matchedTokens.length / targetTokens.length;

      if (targetTokens.length === 1) {
        return candTokens.includes(targetTokens[0]);
      }

      return ratio >= 0.6;
    }

    // Rejection tests: False matches that previously hijacked playback
    assert.equal(isStrictSaavnMatch('Raa Raa Naa Veera', '', 'Ganga Mein Nahaya Na Karo', 'Khurshid Aalam'), false);
    assert.equal(isStrictSaavnMatch('Raa Raa Naa Veera', '', 'Veera Soora', 'Yuvan Shankar Raja'), false);
    assert.equal(isStrictSaavnMatch('Raa Raa Naa Veera', '', 'Reti Ra Ran Ma Chale', 'Sanatan Bhakti Ganga'), false);
    assert.equal(isStrictSaavnMatch('Vaaste', 'Dhvani', 'Vaaste (Instrumental)', 'T-Series'), false);

    // Acceptance tests: Genuine matches
    assert.equal(isStrictSaavnMatch('Kesariya', 'Arijit Singh', 'Kesariya', 'Pritam, Arijit Singh'), true);
    assert.equal(isStrictSaavnMatch('Shape of You', 'Ed Sheeran', 'Shape of You', 'Ed Sheeran'), true);
    assert.equal(isStrictSaavnMatch('Samajavaragamana', 'Sid Sriram', 'Samajavaragamana (From Ala Vaikunthapurramuloo)', 'Sid Sriram'), true);
    assert.equal(isStrictSaavnMatch('Interstellar Theme', 'Hans Zimmer', 'Interstellar Theme', 'Hans Zimmer'), true);
  });
});
