import { describe, it } from 'node:test';
import assert from 'node:assert';
import { importExternalPlaylist } from '../api/lib/playlists.js';
import { checkRateLimit } from '../api/lib/cache.js';

describe('Playlist Importer & Multi-Format Resolution', () => {
  it('identifies Spotify user playlist URLs correctly', async () => {
    const urls = [
      'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
      'https://open.spotify.com/user/spotify_user_123/playlist/37i9dQZF1DXcBWIGoYBM5M',
      'https://open.spotify.com/intl-en/playlist/37i9dQZF1DXcBWIGoYBM5M?si=123456789',
      'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M'
    ];

    for (const url of urls) {
      const typeMatch =
        url.match(/spotify\.com\/(?:intl-[a-zA-Z-]+\/)?(?:user\/[^/]+\/)?(playlist|album|track)\/([a-zA-Z0-9]+)/i) ||
        url.match(/spotify:(playlist|album|track):([a-zA-Z0-9]+)/i);
      assert.ok(typeMatch, `Failed to match Spotify URL: ${url}`);
      assert.strictEqual(typeMatch[1], 'playlist');
      assert.strictEqual(typeMatch[2], '37i9dQZF1DXcBWIGoYBM5M');
    }
  });

  it('identifies YouTube Mix playlist IDs and extracts videoId fallback', () => {
    const mixUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ';
    const listMatch = mixUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
    assert.ok(listMatch);
    assert.strictEqual(listMatch[1], 'RDdQw4w9WgXcQ');
    assert.ok(listMatch[1].startsWith('RD'));

    const vMatch = mixUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/i);
    assert.strictEqual(vMatch?.[1], 'dQw4w9WgXcQ');

    const bareMixList = 'RDdQw4w9WgXcQ';
    const extractedVideoId = bareMixList.slice(2, 13);
    assert.strictEqual(extractedVideoId, 'dQw4w9WgXcQ');
  });

  it('normalizes browseId for YouTube Music albums and playlists without duplicate VL', () => {
    const rawListId = 'PL3-sRm8xAzY9gpXTMGVHJWy_FMD67NBed';
    const browseId1 = rawListId.startsWith('VL') ? rawListId : `VL${rawListId}`;
    assert.strictEqual(browseId1, 'VLPL3-sRm8xAzY9gpXTMGVHJWy_FMD67NBed');

    const alreadyVl = 'VLOLAK5uy_m1WZWUtrntyrrtCUSATYfs84K3ZnZl9P0';
    const browseId2 = alreadyVl.startsWith('VL') ? alreadyVl : `VL${alreadyVl}`;
    assert.strictEqual(browseId2, 'VLOLAK5uy_m1WZWUtrntyrrtCUSATYfs84K3ZnZl9P0');
  });

  it('rate limit budget allows high-volume track queries up to 400 requests/min', () => {
    const testIp = 'test-playlist-import-ip-1';
    let allowedCount = 0;
    for (let i = 0; i < 400; i++) {
      if (checkRateLimit(testIp)) {
        allowedCount++;
      }
    }
    assert.strictEqual(allowedCount, 400, 'Should allow 400 requests within the window');
    // 401st request should be throttled
    const throttled = checkRateLimit(testIp);
    assert.strictEqual(throttled, false, 'Should throttle 401st request');
  });

  it('rejects invalid playlist URLs gracefully without throwing uncaught exceptions', async () => {
    const res = await importExternalPlaylist('https://invalid-nonexistent-music-link.com/playlist/xyz');
    assert.ok(res.error, 'Should return error property for unsupported link');
  });
});
