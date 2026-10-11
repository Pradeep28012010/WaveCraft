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
});
