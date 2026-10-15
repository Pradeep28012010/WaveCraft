<div align="center">

# 🌊 WaveCraft — Spatial Glass Music Studio & Audiophile Player

**Next-generation 320kbps HD music streaming platform engineered with Web Audio DSP, Interactive 10-Band Spline EQ, Analog Vacuum Tube Visualizer, AI Vibe DJ, Syllable-Synced Live Lyrics, 1-Tap Offline Storage Vault, Real-time Jam Rooms, and Native Android & Windows Desktop builds.**

<br />

[![Live Demo](https://img.shields.io/badge/Live_Demo-wavecraft--alpha.vercel.app-fa2d48?style=for-the-badge&logo=vercel&logoColor=white)](https://wavecraft-alpha.vercel.app)
[![Version](https://img.shields.io/badge/Version-v2.4.0-3b82f6?style=for-the-badge)](https://github.com/Pradeep28012010/WaveCraft/releases)
[![Tests Passing](https://img.shields.io/badge/Tests-130%2F130%20Pass-10b981?style=for-the-badge&logo=node.js&logoColor=white)](https://github.com/Pradeep28012010/WaveCraft)
[![TypeScript 5.5](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React 18.3](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.0-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Android APK](https://img.shields.io/badge/Android-APK_Download-3DDC84?style=for-the-badge&logo=android&logoColor=white)](https://wavecraft-alpha.vercel.app/WaveCraft.apk)
[![License: MIT](https://img.shields.io/badge/License-MIT-a855f7?style=for-the-badge)](./LICENSE)

<br />

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FPradeep28012010%2FWaveCraft)

</div>

---

## ⚡ What is WaveCraft?

**WaveCraft** is an all-in-one, spatial glass music streaming platform and audiophile workstation. It bridges high-bitrate streaming with real-time Web Audio DSP hardware emulation, offline storage capabilities, AI-curated vibe sets, and native cross-platform support across **Web (PWA)**, **Android (Capacitor)**, and **Windows (Electron)**.

---

## ✨ Flagship Capabilities

### 🎛️ Interactive 10-Band Spline EQ & Analog Vacuum Tube Visualizer
- **Draggable Spline EQ**: Real-time Catmull-Rom cubic Bezier frequency response curve with 10 interactive nodes (`32Hz` to `16kHz`) and `[-12dB, +12dB]` precision gain control.
- **Analog Triode Vacuum Tubes**: Dual glowing 12AX7 thermionic tube visualizers with audio-reactive heater glow, cathode glow, and dynamic grid luminescence driven by live Web Audio FFT energy.
- **7 Audiophile Presets**: *Acoustic, Bass Booster, Electronic, Hip-Hop, Classical, Vocal Booster, and Flat (True Bypass)*.
- **Spatial Acoustic Presets**: *Concert Hall, Cathedral, Room, and Binaural 8D Spatial Immersion*.

### 🖼️ Floating Picture-in-Picture (PiP) & Fluid Drawer
- **Always-on-Top Floating PiP Window**: Multi-task across tabs or desktop applications with a floating window displaying real-time audio waveforms, syllable-synced lyrics, and playback controls.
- **Fluid Drawer Physics**: Seamless mini-player to fullscreen drawer expansion with native spring physics and drag-to-dismiss gestures.

### 🎤 WaveSync Syllable-Level Live Lyrics & Phonetic Transliteration
- **Syllable Glow Sweep**: Word-by-word and syllable-level karaoke sweep animation with smooth timing physics.
- **Phonetic Script Transliteration**: Automatic detection for South Asian and regional scripts (Telugu, Devanagari / Hindi, Tamil, etc.) with Romanized phonetic transliteration for sing-along accessibility.
- **Live English Translation**: 1-click toggle between native script, phonetic Romanized text, and English lyrical translation.

### 📦 1-Tap Offline Playlist Downloader & Storage Vault
- **Encrypted Offline Storage**: Complete audio binaries and high-res album artwork stored directly in IndexedDB (`idb-keyval`).
- **1-Tap Batch Download Drawer**: Download entire playlists with a single tap, complete with live progress percentages, byte counters, and resilient background queues.
- **Smart Auto-Cache & LRU Quota Manager**: Automatically caches played songs while intelligently protecting manually downloaded tracks from LRU eviction.
- **Pure Offline Mode**: Zero-data mode switch that isolates the interface to locally cached music for flights and offline travel.

### ✨ AI Smart DJ & Hybrid Vibe Studio (`/vibe`)
- **Natural Language Vibe Generator**: Free-form prompt parsing (e.g., *"late night lo-fi coding in Kyoto"*, *"energetic gym phonk"*, *"rainy coffee shop acoustic"*).
- **Energy Flow Curves**: Shape the trajectory of your playlist (*Wave Flow* for gentle warm-up & peak, *Peak Energy* for sustained high BPM, *Deep Steady* for hypnotic focus).
- **Interactive Staged Preview**: Swap individual tracks, inspect acoustic metadata tags (mood, tempo, energy), and save directly to your library with auto-generated liquid canvas cover art.

### 🔄 Universal Playlist Importer with Live Sync
- **Multi-Format Resolution**: Paste Spotify, Apple Music, or YouTube playlist URLs or raw tracklists.
- **Multi-Tier Fallback Query Engine**: Automatically resolves tracks against high-bitrate streaming sources with 400 req/min rate-limit budgeting.
- **Live Sync**: Keeps external playlists synchronized automatically in the background, adding new songs as they are released.

### 🎧 Real-Time Live Jam Rooms (`/jam`)
- **Shared Listening Rooms**: Host real-time listening parties with 6-character room codes (`WAVE-XXXX`) or 1-click invite links.
- **Synchronized Playback**: Sub-second sync for play/pause, scrub positions, shared queue modifications, and floating live emoji reactions (`🔥 💜 🎧 ⚡`).

### 💿 Spinning 12" Vinyl Turntable & 7 Fullscreen 3D Visualizers
- **Realistic Turntable Deck**: 12" vinyl platter with variable RPM spin physics, realistic grooves, and an animated studio tonearm.
- **7 Real-Time 3D Zen Visualizers**: *3D Cosmic Nebula, 3D Starfield Warp, Bioluminescent Orbs, Radial Halo, Liquid Blob, Studio Bars, and Harmonic Wave*.

### 📸 Shareable Lyric "WaveCards"
- **Studio Lyric Cards**: Generate high-res `1080×1350` Instagram / WhatsApp Story cards featuring album artwork, active lyrics, studio waveforms, and deep-links (`?play=...`).

### 🎯 Multi-Lingual & South Indian Music Intelligence
- **Precision Metadata Extraction**: Multi-tier vocal intent search ranking prioritizing clean studio tracks over karaoke, remixes, and dance clips.
- **Indian Music Parser**: Intelligent separation of song title, movie/album name, music director, and playback singers from complex YouTube/JioSaavn titles.

---

## 🛠️ System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        User Interface Layer                            │
│  React 18 • Framer Motion 11 • Tailwind CSS v4 • Liquid Glass System   │
├───────────────────┬───────────────────────────────┬────────────────────┤
│   State Stores    │          Audio Engine         │   Offline Vault    │
│   (Zustand v4)    │      (Web Audio API DSP)      │ (IndexedDB Blobs)  │
│  • playerStore    │  • 10-Band Spline EQ          │ • idb-keyval       │
│  • libraryStore   │  • Triode Tube Emulation      │ • LRU Quota Prune  │
│  • studioStore    │  • Binaural Spatial 3D Audio  │ • Batch Downloader │
│  • settingsStore  │  • Master Limiter Headroom    │ • Pure Offline Mod │
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

## 📱 Cross-Platform Distribution

WaveCraft runs natively across desktop and mobile form factors:

| Platform | Distribution Channel | Technology | Status |
| :--- | :--- | :--- | :--- |
| **Web & PWA** | [wavecraft-alpha.vercel.app](https://wavecraft-alpha.vercel.app) | React 18, Vite, Service Worker | **Production Live** |
| **Android** | [Direct APK Download](https://wavecraft-alpha.vercel.app/WaveCraft.apk) | Capacitor 8, Hardware Haptics | **v2.4.0 Built** |
| **Windows** | Native Setup (`WaveCraft-Pro-Setup.exe`) | Electron 44, NSIS Installer | **v2.4.0 Built** |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ (Node 20 recommended)
- npm or yarn

### 1. Clone & Install
```bash
git clone https://github.com/Pradeep28012010/WaveCraft.git
cd WaveCraft
npm install
```

### 2. Development Server
```bash
npm run dev
# Opens development server at http://localhost:3000
```

### 3. Production Web Build
```bash
npm run build
```

### 4. Run Automated Test Suite
```bash
npm test
# Runs all 130 tests across 37 test suites
```

### 5. Typecheck Codebase
```bash
npm run typecheck
```

### 6. Android Build (Capacitor)
```bash
# Sync web bundle to Android project
npx cap sync android

# Compile Android Debug APK
cd android && gradlew.bat assembleDebug
```

### 7. Windows Desktop Build (Electron)
```bash
npm run build:win
# Compiles Windows NSIS installer
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `Space` | Play / Pause |
| `→` / `←` | Seek Forward / Backward 10s |
| `↑` / `↓` | Volume Up / Down (5%) |
| `N` / `P` | Next / Previous Track |
| `S` | Toggle Shuffle |
| `R` | Cycle Repeat Mode (Off &rarr; All &rarr; One) |
| `L` | Like / Save Track to Library |
| `M` | Mute / Unmute Audio |
| `E` | Open 10-Band Spline EQ & Studio FX |
| `T` | Toggle Syllable Live Lyrics |
| `Ctrl + K` / `Cmd + K` | Summon Command Palette / Instant Search |
| `Esc` | Close Active Modal / Drawer / Fullscreen |

---

## 🧪 Automated Test Suite (130/130 Passing)

WaveCraft enforces zero-regression quality through 130 comprehensive tests:

- **Audio DSP & Spline EQ**: Catmull-Rom Bezier math, 10-band normalized coordinate mapping, audiophile preset neutrality, and master compression limiter headroom.
- **Syllable Live Lyrics**: Syllable glow sweep timing, multi-word weighted duration distribution, and non-Latin script detection & transliteration (Telugu, Devanagari).
- **Offline Storage Vault**: Batch download percentages, manual download preservation against LRU eviction, and formatted storage calculations.
- **Search Intent & Ranking**: Vocal track ranking above BGM, preview URL exclusion from primary streams, and JioSaavn strict match score validation.
- **Fast-Typing & Debounce Guard**: High-speed typing feedback-loop prevention, trailing whitespace preservation, and immediate Enter-key flushing.
- **UI Physics & Gestures**: Elastic snap slider bounds resistance, and multi-action swipe gestures.

---

## 🤝 Contributing

Contributions are warmly welcomed!
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

If you love WaveCraft, don't forget to **⭐ Star** the repository!

---

## ⚖️ License & Disclaimer

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for more information.

*Disclaimer: WaveCraft is an independent, non-commercial, educational personal web audio player interface. It does not host copyrighted audio files; all media streams, metadata, and artwork are indexed dynamically from publicly accessible endpoints and remain the property of their respective copyright holders.*
