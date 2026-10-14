import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTrackMetadata } from '../api/lib/lyrics.js';

test('Metadata Parsing & South Indian Track Extraction', async (t) => {
  await t.test('Sony Music South: Dheema parsing separates title, album, and composer correctly', () => {
    const meta = parseTrackMetadata(
      'Dheema - Video Song | Love Insurance Kompany | Pradeep Ranganathan | Anirudh Ravichander',
      'Sony Music South'
    );

    assert.equal(meta.cleanTitle, 'Dheema', 'Title must be Dheema and never Video Song');
    assert.equal(meta.cleanAlbum, 'Love Insurance Kompany', 'Album must be the movie name Love Insurance Kompany');
    assert.match(meta.cleanArtist, /Anirudh Ravichander/, 'Artist must contain composer Anirudh Ravichander');
    assert.notEqual(meta.cleanArtist, 'Love Insurance Kompany', 'Artist must not be the movie name');
    assert.notEqual(meta.cleanAlbum, 'WaveCraft Cloud', 'Album must never be placeholder WaveCraft Cloud');
  });

  await t.test('T-Series: Pushpa Pushpa parsing separates title, album, and composer correctly', () => {
    const meta = parseTrackMetadata(
      'Pushpa Pushpa - Lyrical | Pushpa 2 The Rule | Allu Arjun | Devi Sri Prasad',
      'T-Series'
    );

    assert.equal(meta.cleanTitle, 'Pushpa Pushpa', 'Title must be clean song name');
    assert.equal(meta.cleanAlbum, 'Pushpa 2 The Rule', 'Album must be movie title');
    assert.match(meta.cleanArtist, /Devi Sri Prasad/, 'Artist must contain composer Devi Sri Prasad');
  });

  await t.test('Aditya Music: Kurchi Madathapetti Full Video Song parsing', () => {
    const meta = parseTrackMetadata(
      'Kurchi Madathapetti Full Video Song | Guntur Kaaram | Mahesh Babu | Thaman S',
      'Aditya Music'
    );

    assert.equal(meta.cleanTitle, 'Kurchi Madathapetti', 'Title must be stripped of Full Video Song');
    assert.equal(meta.cleanAlbum, 'Guntur Kaaram', 'Album must be Guntur Kaaram');
    assert.match(meta.cleanArtist, /Thaman S/, 'Artist must contain composer Thaman S');
  });

  await t.test('Western track format: Artist - Title', () => {
    const meta = parseTrackMetadata(
      'The Weeknd - Blinding Lights (Official Video)',
      'The Weeknd'
    );

    assert.equal(meta.cleanTitle, 'Blinding Lights');
    assert.equal(meta.cleanArtist, 'The Weeknd');
    assert.equal(meta.cleanAlbum, '', 'No dummy WaveCraft Cloud album for Western tracks');
  });

  await t.test('Single dash Indian title: Title - Video Song does not make Video Song the title', () => {
    const meta = parseTrackMetadata(
      'Dheema - Video Song',
      'Sony Music South'
    );

    assert.equal(meta.cleanTitle, 'Dheema');
    assert.notEqual(meta.cleanTitle, 'Video Song');
  });
});
