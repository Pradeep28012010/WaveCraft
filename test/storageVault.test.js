import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

function transpileTsFile(relPath) {
  const fullPath = path.resolve(process.cwd(), relPath);
  const raw = fs.readFileSync(fullPath, 'utf8');
  return ts.transpileModule(raw, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
}

const origGlobals = {
  window: globalThis.window,
  document: globalThis.document,
  navigator: globalThis.navigator,
  caches: globalThis.caches
};

const idbStore = new Map();
const lsStore = new Map();
let cacheSnapshot = null;
const windowListeners = new Map();

const localStorageMock = {
  getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
  setItem: (k, v) => lsStore.set(k, String(v)),
  removeItem: (k) => lsStore.delete(k),
  clear: () => lsStore.clear()
};

const cachesMock = {
  open: async () => ({
    put: async (_req, res) => {
      cacheSnapshot = await res.json();
    },
    match: async () => {
      if (!cacheSnapshot) return undefined;
      return new Response(JSON.stringify(cacheSnapshot), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  })
};

globalThis.window = {
  localStorage: localStorageMock,
  caches: cachesMock,
  addEventListener: (ev, fn) => {
    if (!windowListeners.has(ev)) windowListeners.set(ev, new Set());
    windowListeners.get(ev).add(fn);
  },
  removeEventListener: (ev, fn) => windowListeners.get(ev)?.delete(fn)
};
globalThis.document = {
  visibilityState: 'visible',
  addEventListener: () => {}
};
globalThis.caches = cachesMock;

const storageModule = { exports: {} };
const storageRequire = (id) => {
  if (id === 'idb-keyval') {
    return {
      get: async (k) => (idbStore.has(k) ? idbStore.get(k) : undefined),
      set: async (k, v) => {
        idbStore.set(k, v);
      },
      del: async (k) => {
        idbStore.delete(k);
      },
      keys: async () => Array.from(idbStore.keys())
    };
  }
  throw new Error(`Unexpected require in storageVault test: ${id}`);
};

new Function('require', 'exports', 'module', transpileTsFile('src/services/storage.ts'))(
  storageRequire,
  storageModule.exports,
  storageModule
);

const {
  KEYS,
  loadLikedSongs,
  loadPlaylists,
  loadPlayHistory,
  saveGalaxyPrefs,
  loadGalaxyPrefs
} = storageModule.exports;

const sampleTrack = {
  id: 'yt_abc',
  title: 'Midnight Drift',
  artist: 'WaveCraft',
  album: 'Vault',
  duration: 195,
  thumbnail: '',
  thumbnailLarge: ''
};

describe('Real Storage Vault Empty-Array Preservation & Prefs Merging (src/services/storage.ts)', () => {
  beforeEach(() => {
    idbStore.clear();
    lsStore.clear();
    cacheSnapshot = null;
  });

  after(() => {
    for (const fn of windowListeners.get('beforeunload') || []) {
      fn();
    }
    if (origGlobals.window === undefined) delete globalThis.window;
    else globalThis.window = origGlobals.window;
    if (origGlobals.document === undefined) delete globalThis.document;
    else globalThis.document = origGlobals.document;
    if (origGlobals.caches === undefined) delete globalThis.caches;
    else globalThis.caches = origGlobals.caches;
  });

  it('preserves explicit empty arrays in IDB and prevents stale resurrection from localStorage or CacheStorage', async () => {
    // User cleared liked songs, playlists, and playHistory ([]) while backup tiers still hold stale items
    idbStore.set(KEYS.LIKED_SONGS, []);
    idbStore.set(KEYS.PLAYLISTS, []);
    idbStore.set(KEYS.PLAY_HISTORY, []);

    lsStore.set(KEYS.LIKED_SONGS, JSON.stringify([sampleTrack]));
    lsStore.set(KEYS.PLAYLISTS, JSON.stringify([{ id: 'pl_1', name: 'Old', tracks: [sampleTrack], createdAt: 1, updatedAt: 1, description: '' }]));
    lsStore.set(KEYS.PLAY_HISTORY, JSON.stringify([{ trackId: 'yt_abc', playedAt: 1000, duration: 195 }]));

    cacheSnapshot = {
      likedSongs: [sampleTrack],
      playlists: [{ id: 'pl_1', name: 'Old', tracks: [sampleTrack], createdAt: 1, updatedAt: 1, description: '' }],
      playHistory: [{ trackId: 'yt_abc', playedAt: 1000, duration: 195 }]
    };

    const liked = await loadLikedSongs();
    const playlists = await loadPlaylists();
    const history = await loadPlayHistory();

    assert.deepEqual(liked, [], 'Explicit empty likedSongs [] must not resurrect from backup tiers');
    assert.deepEqual(playlists, [], 'Explicit empty playlists [] must not resurrect from backup tiers');
    assert.deepEqual(history, [], 'Explicit empty playHistory [] must not resurrect from backup tiers');
  });

  it('still self-heals from localStorage/CacheStorage when IDB entry is genuinely missing (undefined)', async () => {
    // IDB entry is absent (browser storage wipe) -> recover from secondary tier
    cacheSnapshot = { likedSongs: [sampleTrack] };
    const recovered = await loadLikedSongs();
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].id, 'yt_abc');
  });

  it('merges partial saveGalaxyPrefs updates cleanly into IDB without dropping prior fields', async () => {
    await saveGalaxyPrefs({ zoom: 1.75, showCoordinateGrid: true });
    await saveGalaxyPrefs({ layout: 'spiral' });

    const loaded = await loadGalaxyPrefs();
    assert.equal(loaded.layout, 'spiral');
    assert.equal(loaded.zoom, 1.75);
    assert.equal(loaded.showCoordinateGrid, true);
  });
});
