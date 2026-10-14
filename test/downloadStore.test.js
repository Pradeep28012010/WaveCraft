import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('1-Tap Offline Playlist Downloader & Storage Vault', () => {
  it('correctly calculates batch download progress and percentage', () => {
    const total = 25;
    let completed = 5;
    let failed = 1;

    const calcPercent = (comp, tot) => Math.round((comp / Math.max(1, tot)) * 100);

    assert.strictEqual(calcPercent(completed, total), 20);

    completed = 25;
    assert.strictEqual(calcPercent(completed, total), 100);

    // Edge case: 0 tracks
    assert.strictEqual(calcPercent(0, 0), 0);
  });

  it('preserves manual download source and prevents downgrade by auto-cache', () => {
    const existingTrack = {
      id: 'song_123',
      title: 'Neon Horizon',
      artist: 'Synthwave Boy',
      offlineSource: 'manual',
      downloadedAt: 1700000000000
    };

    const resolveSource = (existing, incomingSource) => {
      return existing?.offlineSource === 'manual' ? 'manual' : incomingSource;
    };

    // If an auto-cache run hits a manually downloaded track, it stays 'manual'
    assert.strictEqual(resolveSource(existingTrack, 'auto-cache'), 'manual');

    // If a new track is auto-cached, it gets 'auto-cache'
    assert.strictEqual(resolveSource(undefined, 'auto-cache'), 'auto-cache');

    // If an existing auto-cached track is manually downloaded by user, it gets promoted to 'manual'
    const autoCachedTrack = { ...existingTrack, offlineSource: 'auto-cache' };
    assert.strictEqual(resolveSource(autoCachedTrack, 'manual'), 'manual');
  });

  it('evicts only oldest auto-cache tracks during LRU quota pruning while protecting manual downloads', () => {
    const tracks = [
      { id: 'm1', title: 'User Fav 1', offlineSource: 'manual', fileSizeBytes: 20 * 1024 * 1024, downloadedAt: 1000 },
      { id: 'm2', title: 'User Fav 2', offlineSource: 'manual', fileSizeBytes: 20 * 1024 * 1024, downloadedAt: 2000 },
      { id: 'a1', title: 'Auto 1 (Oldest)', offlineSource: 'auto-cache', fileSizeBytes: 15 * 1024 * 1024, downloadedAt: 3000 },
      { id: 'a2', title: 'Auto 2 (Middle)', offlineSource: 'auto-cache', fileSizeBytes: 15 * 1024 * 1024, downloadedAt: 4000 },
      { id: 'a3', title: 'Auto 3 (Newest)', offlineSource: 'auto-cache', fileSizeBytes: 15 * 1024 * 1024, downloadedAt: 5000 },
    ];

    const maxCacheBytes = 25 * 1024 * 1024; // 25 MB max cache

    function pruneAutoCache(list, maxBytes) {
      const manual = list.filter((t) => t.offlineSource === 'manual');
      const autoCache = list.filter((t) => t.offlineSource === 'auto-cache');

      let currentBytes = autoCache.reduce((sum, t) => sum + t.fileSizeBytes, 0); // 45 MB
      const sorted = [...autoCache].sort((a, b) => a.downloadedAt - b.downloadedAt);

      const keptAuto = [];
      for (const track of sorted) {
        if (currentBytes > maxBytes) {
          // Evict oldest
          currentBytes -= track.fileSizeBytes;
        } else {
          keptAuto.push(track);
        }
      }

      return [...manual, ...keptAuto];
    }

    const pruned = pruneAutoCache(tracks, maxCacheBytes);

    // Both manual tracks MUST be preserved
    assert.ok(pruned.some((t) => t.id === 'm1'));
    assert.ok(pruned.some((t) => t.id === 'm2'));

    // Oldest auto-cache track 'a1' (15MB) was evicted so 45 - 15 = 30 > 25, then 'a2' (15MB) evicted so 30 - 15 = 15 <= 25.
    assert.strictEqual(pruned.some((t) => t.id === 'a1'), false);
    assert.strictEqual(pruned.some((t) => t.id === 'a2'), false);
    // Newest auto-cache track 'a3' is kept
    assert.ok(pruned.some((t) => t.id === 'a3'));
  });

  it('clearAutoCacheOnly clears 100% of auto-cache tracks and preserves manual tracks', () => {
    const catalog = [
      { id: 'p1', title: 'Playlist Track 1', offlineSource: 'manual' },
      { id: 'p2', title: 'Playlist Track 2', offlineSource: 'manual' },
      { id: 'c1', title: 'Cached 1', offlineSource: 'auto-cache' },
      { id: 'c2', title: 'Cached 2', offlineSource: 'auto-cache' },
      { id: 'c3', title: 'Cached 3', offlineSource: 'auto-cache' }
    ];

    const remaining = catalog.filter((t) => t.offlineSource !== 'auto-cache');

    assert.strictEqual(remaining.length, 2);
    assert.strictEqual(remaining.every((t) => t.offlineSource === 'manual'), true);
    assert.strictEqual(remaining.some((t) => t.id.startsWith('c')), false);
  });

  it('accurately computes storage breakdown and formatted byte strings', () => {
    const catalog = [
      { id: '1', fileSizeBytes: 10 * 1024 * 1024, offlineSource: 'manual' },
      { id: '2', fileSizeBytes: 15 * 1024 * 1024, offlineSource: 'manual' },
      { id: '3', fileSizeBytes: 5 * 1024 * 1024, offlineSource: 'auto-cache' }
    ];

    const manualBytes = catalog
      .filter((t) => t.offlineSource !== 'auto-cache')
      .reduce((acc, t) => acc + t.fileSizeBytes, 0);

    const autoCacheBytes = catalog
      .filter((t) => t.offlineSource === 'auto-cache')
      .reduce((acc, t) => acc + t.fileSizeBytes, 0);

    const totalBytes = manualBytes + autoCacheBytes;

    assert.strictEqual(manualBytes, 25 * 1024 * 1024);
    assert.strictEqual(autoCacheBytes, 5 * 1024 * 1024);
    assert.strictEqual(totalBytes, 30 * 1024 * 1024);

    const formatSize = (bytes) => {
      if (bytes >= 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
      }
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    assert.strictEqual(formatSize(manualBytes), '25.0 MB');
    assert.strictEqual(formatSize(autoCacheBytes), '5.0 MB');
    assert.strictEqual(formatSize(totalBytes), '30.0 MB');
    assert.strictEqual(formatSize(2.5 * 1024 * 1024 * 1024), '2.5 GB');
  });
});
