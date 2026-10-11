# WaveCraft System Architecture

WaveCraft is a high-fidelity, liquid-glass music streaming application engineered for Web (PWA), Desktop (Windows / Electron), and Mobile (Android / Capacitor).

```
┌────────────────────────────────────────────────────────────────────────┐
│                        User Interface Layer                            │
│  React 18 • Framer Motion 11 • Tailwind CSS v4 • Liquid Glass System   │
├───────────────────┬───────────────────────────────┬────────────────────┤
│   State Stores    │          Audio Engine         │   Offline Vault    │
│   (Zustand v4)    │      (Web Audio API DSP)      │ (IndexedDB Blobs)  │
│  • playerStore    │  • 10-Band BiquadFilter EQ    │ • idb-keyval       │
│  • libraryStore   │  • Binaural Spatial 3D Audio  │ • CacheStorage     │
│  • studioStore    │  • Master Limiter Headroom    │ • Quota Management │
│  • settingsStore  │  • Dual-Engine Failover       │                    │
├───────────────────┴───────────────────────────────┴────────────────────┤
│                    Streaming & Resolution Pipeline                     │
│  • streamResolver.ts (Direct 320kbps CDN resolution)                   │
│  • youtube.ts (Vocal-intent search ranking, fallback matching)         │
│  • imagePreloader.ts (Idle-scheduled cooperative concurrency queue)    │
├────────────────────────────────────────────────────────────────────────┤
│                 Serverless Gateway (/api/music)                        │
│  • Multi-Source Scrapers (YouTube, JioSaavn, iTunes, Spotify)          │
│  • In-Memory TTL Response Caching (LRU 250 entries)                    │
│  • Sliding-Window Rate Limiter (100 req/min per IP)                    │
│  • SSRF Domain Validation Guardrails                                   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Dual Audio Engine Architecture

Playback operates through a resilient dual-engine model in `src/components/player/YouTubeEmbed.tsx` and `src/services/audioEngine.ts`:

1. **Native HTML5 Audio + Web Audio DSP (Primary)**:
   - Plays direct high-bitrate audio streams (up to 320kbps) through standard `<audio>` elements.
   - Routes through a custom Web Audio graph:
     `AudioSourceNode` &rarr; `10-Band BiquadFilterNode Equalizer` &rarr; `Spatial Audio PannerNode (Binaural)` &rarr; `Master DynamicsCompressorNode (Limiter)` &rarr; `GainNode` &rarr; `Destination`.
   - Equipped with stalled connection detection (recovers from socket drops within 7s).

2. **YouTube IFrame Embed (Resilient Fallback)**:
   - When direct CDN streams expire or fail, playback automatically switches to the YouTube IFrame player with zero audio disruption.
   - YouTube video resolution is locked to `small` (144p) to maximize streaming bandwidth efficiency.

---

## 2. State Management

WaveCraft utilizes atomic [Zustand](https://github.com/pmndrs/zustand) stores with zero prop drilling:

- **`playerStore`**: Current track, playback queue, volume, play/pause state, progress scrubber time, and track transitions.
- **`libraryStore`**: User-curated playlists, liked tracks, play history, and recently played albums.
- **`studioStore`**: Active DSP mode (Concert, 8D Spatial, Vocal Boost, Bass Boost, Vinyl), spatial radar positioning, sleep timer, and Pomodoro mode.
- **`settingsStore`**: Equalizer presets, audio quality preference, crossfade duration, loudness normalization, and performance profiles (`ultra`, `balanced`, `performance`).

---

## 3. Offline Audio Vault

Tracks can be stored for 100% offline playback via `src/services/offlineVault.ts`:

- Audio binaries and high-res cover art are stored as `Blob` objects in a dedicated IndexedDB store (`wavecraft-audio-vault-blobs`) using `idb-keyval`.
- Redundant backup in `CacheStorage` (`wavecraft-offline-audio-vault-v1`).
- Storage quota is guarded before writes via `navigator.storage.estimate()` to prevent partial or corrupt downloads when disk space is constrained.

---

## 4. Serverless API Gateway (`/api/music`)

Located in `api/music.js`, this edge handler serves search, trending charts, new releases, lyrics, and stream resolution:

- **Rate Limiting**: Sliding-window limiter restricts abuse to 100 requests per minute per IP.
- **SSRF Guard**: Strict domain whitelist prevents unauthorized upstream proxy requests.
- **Caching**: 5-minute to 1-hour TTL caches with `stale-while-revalidate` headers.
- **Timeout Isolation**: All external HTTP requests utilize `AbortController` timeouts (4.5s max) to guarantee fast responses.

---

## 5. Automated Testing

Tests are executed with Node.js's native test runner (`node:test` + `node:assert`):

```bash
npm test
```

Covers:
- AI Smart DJ prompt parsing & energy curve sequencing (`test/aiDjEngine.test.js`)
- Spatial 3D acoustics & binaural panning boundaries (`test/spatialMath.test.js`)
- Audiophile 10-band EQ presets & loudness math (`test/audioEngine.test.js`)
- Vocal-intent search ranking & junk stream filtering (`test/searchRanking.test.js`)
- Search bar typing stability & debounce loop prevention (`test/searchBar.test.js`)
- Elastic snap slider physics & track swipe gestures (`test/uiGestures.test.js`)
