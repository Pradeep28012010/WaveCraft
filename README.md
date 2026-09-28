<div align="center">

# 🌊 WaveCraft — Spatial Glass Audio Player

**Next-generation 320kbps HD music streaming web application with a Spatial Liquid Glass UI, 10-band Web Audio DSP Equalizer, time-synced karaoke lyrics, gapless track preloading, and universal playlist importing.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-wavecraft--alpha.vercel.app-fa2d48?style=for-the-badge&logo=vercel&logoColor=white)](https://wavecraft-alpha.vercel.app)
[![React 18](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.0-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-10b981?style=for-the-badge)](./LICENSE)

<br />

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FPradeep28012010%2FWaveCraft)

</div>

---

## ✨ Why WaveCraft?

- **🎧 320kbps Studio HD Audio Engine** — Full-length, ad-free audio streaming powered by a dual-source HTML5 `<audio>` + fallback streaming engine.
- **⚡ Gapless Preloader & Smooth Crossfade** — Automatically pre-buffers the next track in your queue ahead of time so transitions never break your flow state.
- **🎛️ Live 10-Band Web Audio Equalizer** — Real `BiquadFilterNode` DSP chain (`32Hz` to `16kHz`) with interactive vertical sliders and studio presets (*Flat, Bass Boost, Treble Boost, Vocal, Rock, Electronic, Late Night*).
- **🎤 WaveSync Time-Synced Lyrics** — Real-time auto-scrolling karaoke lyrics with tap-to-seek on any lyric line.
- **📥 Universal Playlist Importer** — Import public playlists via URL or paste any song list (`Song - Artist`) to automatically match tracks in 320kbps HD.
- **🌈 Spatial Liquid Glass UI & Reactive Visualizers** — Dynamic ambient color extraction from album artwork, portaled glass dropdowns, and 4 real-time canvas visualizer modes (*Liquid Blob, Spectrum Bars, Harmonic Wave, Radial Halo*).
- **💾 Offline-First Local Library** — Liked songs, custom playlists, play history, and listening analytics persisted locally in IndexedDB (`idb-keyval`) with 1-click JSON backup & restore.

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend Framework** | React 18, TypeScript, Vite |
| **Styling & Motion** | Tailwind CSS v4, Framer Motion, Spatial Liquid Glass CSS |
| **Audio & DSP** | Web Audio API (`AudioContext`, 10-band `BiquadFilterNode`, `AnalyserNode`), Media Session API |
| **State & Persistence** | Zustand, IndexedDB (`idb-keyval`) |
| **Serverless API** | Vercel / Netlify Serverless Functions (`/api/music`) with TTL Edge Caching |

---

## 🚀 Quick Start (Local Development)

```bash
# 1. Clone the repository
git clone https://github.com/Pradeep28012010/WaveCraft.git
cd WaveCraft

# 2. Install dependencies
npm install

# 3. Start the development server at http://localhost:3000
npm run dev

# 4. Build for production
npm run build
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `Space` | Play / Pause |
| `→` / `←` | Seek Forward / Backward 10s |
| `↑` / `↓` | Volume Up / Down |
| `N` / `P` | Next / Previous Track |
| `S` | Toggle Shuffle |
| `R` | Cycle Repeat Mode |
| `L` | Like / Save Current Track |
| `M` | Mute / Unmute |

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! If you enjoy **WaveCraft**, please consider giving the repository a ⭐ **Star** on GitHub.

---

## ⚖️ Disclaimer

WaveCraft is an independent, non-commercial, educational personal web audio player interface. It does not host any copyrighted audio files; all media streams, metadata, and artwork are indexed dynamically from publicly accessible endpoints and remain the property of their respective copyright holders.
