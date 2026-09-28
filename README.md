<div align="center">

# 🌊 WaveCraft — Spatial Glass Music Studio

**Next-generation 320kbps HD music streaming studio with AI Vibe DJ, Live Synced Jam Rooms, 3D Audio Visualizers & Vinyl Turntable Deck, Shareable Lyric WaveCards, 10-Band Web Audio DSP Equalizer, and Installable PWA support.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-wavecraft--alpha.vercel.app-fa2d48?style=for-the-badge&logo=vercel&logoColor=white)](https://wavecraft-alpha.vercel.app)
[![React 18](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.0-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-10b981?style=for-the-badge)](./LICENSE)

<br />

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FPradeep28012010%2FWaveCraft)

</div>

---

## ✨ Flagship Features

- **✨ AI Vibe DJ (`/vibe`)** — Type any natural-language mood, scenario, or artist fusion (e.g., *"2AM coding in Tokyo rain"*, *"Telugu mass gym PR"*, *"90s AR Rahman nostalgia"*). WaveCraft generates a continuous 320kbps flow and automatically tunes your **10-Band Equalizer**, **3D Visualizer**, and **Ambient Glow** to match the vibe.
- **🎧 Live Jam Rooms (`/jam`)** — Host a real-time listening party with a 6-character room code (`WAVE-XXXX`) or share a 1-click invite link. Playback, seeks, shared queue additions, and floating live emoji reactions (`🔥 💜 🎧 ⚡`) stay synchronized across listeners.
- **💿 Spinning Vinyl Turntable & 3D Zen Visualizers** — Switch between Album Cover and a realistic **Spinning 12" Vinyl Turntable Deck** with an animated studio tonearm, or enter **Fullscreen 3D Zen Mode** with 7 real-time Web Audio FFT visualizers (*3D Cosmic Nebula, 3D Starfield Warp, Bioluminescent Orbs, Radial Halo, Liquid Blob, Studio Bars, Harmonic Wave*).
- **🖼️ Shareable Lyric "WaveCards"** — Export high-resolution `1080×1350` Instagram/WhatsApp Story cards featuring album artwork, custom or tapped song lyrics, studio waveform graphics, and direct deep-links (`?play=...`).
- **📲 Installable Desktop & Mobile App (PWA) + Hardware Media Keys** — Install WaveCraft as a standalone native-feel app with full OS Lock Screen controls, multi-size artwork, and AirPods / Bluetooth / Keyboard media key support.
- **🎛️ Live 10-Band Web Audio Equalizer & Gapless Preloader** — Real `BiquadFilterNode` DSP chain (`32Hz` to `16kHz`) with interactive vertical sliders, pre-buffered next-track loading, and smooth crossfade.
- **🎤 WaveSync Time-Synced Lyrics & Universal Playlist Importer** — Real-time auto-scrolling karaoke lyrics with tap-to-seek, plus 1-click playlist importing via URL or song list.

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend Framework** | React 18, TypeScript, Vite |
| **Styling & Motion** | Tailwind CSS v4, Framer Motion, Spatial Liquid Glass CSS |
| **Audio & DSP** | Web Audio API (`AudioContext`, 10-band `BiquadFilterNode`, `AnalyserNode` FFT), Media Session API |
| **State & Sync** | Zustand, IndexedDB (`idb-keyval`), BroadcastChannel + Edge Room Sync |
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
