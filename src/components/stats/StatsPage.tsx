import { useState } from 'react';
import { motion } from 'framer-motion';
import { useLibraryStore } from '../../stores/libraryStore';
import { usePlayerStore } from '../../stores/playerStore';
import { useStudioStore } from '../../stores/studioStore';
import { formatListeningTime } from '../../utils/formatTime';
import { searchTracks } from '../../services/youtube';
import { unlockAudioEngine } from '../player/YouTubeEmbed';
import GlassCard from '../ui/GlassCard';

export default function StatsPage() {
  const { playHistory = [], recentlyPlayed = [], likedSongs = [], playlists = [] } = useLibraryStore();
  const playTrack = usePlayerStore((s) => s.playTrack);
  const fxMode = useStudioStore((s) => s.fxMode);
  const completedSessions = useStudioStore((s) => s.completedSessions);
  const [isExportingPoster, setIsExportingPoster] = useState(false);

  const totalListens = Math.max(playHistory.length, recentlyPlayed.length);
  const normalizeSec = (d?: number) => {
    if (!d || isNaN(d) || d <= 0) return 210;
    // If duration was accidentally stored in milliseconds, convert to seconds
    return d > 3600 ? Math.round(d / 1000) : d;
  };
  const totalSeconds =
    playHistory.length > 0
      ? playHistory.reduce((acc, p) => acc + normalizeSec(p.duration), 0)
      : recentlyPlayed.reduce((acc, r: any) => acc + normalizeSec(r?.track?.duration || r?.duration), 0);
  const totalMinutes = totalListens > 0 ? Math.max(1, Math.round(totalSeconds / 60)) : 0;

  const artistList = [
    ...playHistory.map((p) => p.artist).filter(Boolean),
    ...recentlyPlayed.map((t: any) => t?.track?.artist || t?.artist).filter(Boolean)
  ];
  const uniqueArtists = new Set(artistList).size;

  // Compute Top Tracks from playHistory + fallback to recentlyPlayed
  const trackCounts: Record<string, { title: string; artist: string; count: number }> = {};
  if (playHistory.length > 0) {
    for (const p of playHistory) {
      if (!p.title) continue;
      const key = `${p.title}|${p.artist || 'Artist'}`;
      if (!trackCounts[key]) {
        trackCounts[key] = { title: p.title, artist: p.artist || 'Artist', count: 0 };
      }
      trackCounts[key].count += 1;
    }
  } else {
    for (const item of recentlyPlayed as any[]) {
      const t = item?.track || item;
      if (!t?.title) continue;
      const key = `${t.title}|${t.artist}`;
      if (!trackCounts[key]) {
        trackCounts[key] = { title: t.title, artist: t.artist, count: 1 };
      }
    }
  }

  const topTracks = Object.values(trackCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Compute Top Artists
  const artistCounts: Record<string, number> = {};
  for (const a of artistList) {
    if (!a) continue;
    artistCounts[a] = (artistCounts[a] || 0) + 1;
  }
  const topArtists = Object.entries(artistCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([artist, count]) => ({ artist, count }));

  // Determine Dynamic Listener Aura Personality
  const auraProfile =
    totalListens >= 15
      ? {
          title: 'Sonic Horizon Architect',
          subtitle: 'High-frequency curator with a taste for immersive studio soundstages',
          colors: ['#fa2d48', '#7c3aed', '#0ea5e9']
        }
      : likedSongs.length >= 3
      ? {
          title: 'Velvet Vault Collector',
          subtitle: 'Selective audiophile building a timeless personal rotation',
          colors: ['#ec4899', '#8b5cf6', '#14b8a6']
        }
      : {
          title: 'Midnight Studio Explorer',
          subtitle: 'Discovering 320kbps high-definition soundscapes and fresh vibes',
          colors: ['#fa2d48', '#6366f1', '#10b981']
        };

  // Unlockable Listener Badges
  const badges = [
    {
      id: 'audiophile',
      icon: '🎧',
      name: '320k Studio Purist',
      desc: 'Streamed in bit-accurate 320kbps Studio AAC',
      unlocked: totalListens >= 1
    },
    {
      id: 'dsp-alchemist',
      icon: '🎛️',
      name: 'DSP Alchemist',
      desc: 'Transformed tracks with Slowed + Reverb, 8D Orbit, or Nightcore',
      unlocked: fxMode !== 'normal' || totalListens >= 3
    },
    {
      id: 'curator',
      icon: '💎',
      name: 'Vault Curator',
      desc: 'Saved favorite tracks to Liked Songs or custom playlists',
      unlocked: likedSongs.length >= 1 || playlists.length >= 1
    },
    {
      id: 'rhythm-explorer',
      icon: '🔥',
      name: 'Rhythm Explorer',
      desc: 'Streamed 5+ tracks on WaveCraft',
      unlocked: totalListens >= 5
    },
    {
      id: 'crate-digger',
      icon: '🌌',
      name: 'Crate Digger',
      desc: 'Explored 3+ distinct musical artists',
      unlocked: uniqueArtists >= 3
    },
    {
      id: 'deep-focus',
      icon: '⏱️',
      name: 'Deep Focus Master',
      desc: 'Completed a Focus Pomodoro or 20+ mins of listening',
      unlocked: completedSessions >= 1 || totalMinutes >= 20
    }
  ];

  const unlockedCount = badges.filter((b) => b.unlocked).length;

  // Generate & Download High-Res 1080x1350 "WaveCraft Wrapped" Listener Passport PNG
  const handleDownloadWrappedPoster = () => {
    setIsExportingPoster(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1350;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Deep Obsidian & Aura Gradient Background
      const bg = ctx.createLinearGradient(0, 0, 1080, 1350);
      bg.addColorStop(0, '#07070d');
      bg.addColorStop(0.5, '#130d26');
      bg.addColorStop(1, '#06060b');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1080, 1350);

      // Glowing Aura Orbs
      const orb1 = ctx.createRadialGradient(240, 260, 20, 240, 260, 460);
      orb1.addColorStop(0, 'rgba(250, 45, 72, 0.48)');
      orb1.addColorStop(1, 'rgba(250, 45, 72, 0)');
      ctx.fillStyle = orb1;
      ctx.fillRect(0, 0, 1080, 1350);

      const orb2 = ctx.createRadialGradient(860, 960, 20, 860, 960, 520);
      orb2.addColorStop(0, 'rgba(124, 58, 237, 0.45)');
      orb2.addColorStop(1, 'rgba(124, 58, 237, 0)');
      ctx.fillStyle = orb2;
      ctx.fillRect(0, 0, 1080, 1350);

      // 2. Outer Frosted Card Border
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 3;
      ctx.strokeRect(64, 64, 952, 1222);

      // 3. Brand Header
      ctx.fillStyle = '#fa2d48';
      ctx.font = '800 24px Inter, sans-serif';
      ctx.fillText('WAVECRAFT • LISTENER AURA PASSPORT', 110, 135);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 64px Inter, sans-serif';
      ctx.fillText(auraProfile.title, 110, 220);

      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.font = '500 26px Inter, sans-serif';
      ctx.fillText(auraProfile.subtitle, 110, 268);

      // 4. Stats Row Boxes
      const statBoxes = [
        { label: 'MINUTES STREAMED', value: `${Math.max(totalMinutes, 4)}` },
        { label: 'TRACKS PLAYED', value: `${Math.max(totalListens, 1)}` },
        { label: 'ARTISTS EXPLORED', value: `${Math.max(uniqueArtists, 1)}` },
        { label: 'BADGES UNLOCKED', value: `${unlockedCount}/${badges.length}` }
      ];

      statBoxes.forEach((box, idx) => {
        const x = 110 + idx * 218;
        const y = 325;
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(x, y, 200, 135);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, 200, 135);

        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '700 16px Inter, sans-serif';
        ctx.fillText(box.label, x + 20, y + 42);

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 46px Inter, sans-serif';
        ctx.fillText(box.value, x + 20, y + 105);
      });

      // 5. Top Tracks Section
      ctx.fillStyle = '#fa2d48';
      ctx.font = '800 22px Inter, sans-serif';
      ctx.fillText('TOP ROTATION TRACKS', 110, 535);

      const displayTracks =
        topTracks.length > 0
          ? topTracks.slice(0, 4)
          : [
              { title: 'Alone, Pt. II', artist: 'Alan Walker, Ava Max', count: 3 },
              { title: 'Blinding Lights', artist: 'The Weeknd', count: 2 },
              { title: 'Starboy', artist: 'The Weeknd, Daft Punk', count: 2 }
            ];

      displayTracks.forEach((t, i) => {
        const y = 570 + i * 110;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(110, y, 860, 92);

        ctx.fillStyle = '#fa2d48';
        ctx.font = '900 34px Inter, sans-serif';
        ctx.fillText(`0${i + 1}`, 135, y + 58);

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 30px Inter, sans-serif';
        ctx.fillText(t.title.slice(0, 36), 205, y + 44);

        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '600 22px Inter, sans-serif';
        ctx.fillText((t.artist || 'Studio Artist').slice(0, 42), 205, y + 76);
      });

      // 6. Top Artist & Footer Stamp
      const topArtistName = topArtists[0]?.artist || displayTracks[0]?.artist || 'WaveCraft Studio';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '700 20px Inter, sans-serif';
      ctx.fillText(' #1 TOP ARTIST IN ROTATION', 110, 1075);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 48px Inter, sans-serif';
      ctx.fillText(topArtistName.slice(0, 28), 110, 1135);

      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '600 20px Inter, sans-serif';
      ctx.fillText('wavecraft-alpha.vercel.app • 320kbps Spatial Audio Engine', 110, 1235);

      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'wavecraft-wrapped-passport.png';
      a.click();
    } finally {
      setIsExportingPoster(false);
    }
  };

  const handlePlayTopTrack = async (title: string, artist: string) => {
    unlockAudioEngine();
    try {
      const found = await searchTracks(`${title} ${artist}`);
      if (found.length > 0) {
        playTrack(found[0], found, 0);
      }
    } catch {}
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-2 md:p-6 flex flex-col gap-8 pb-32 text-white">
      {/* WaveCraft Wrapped / Listener Aura Passport Hero */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl liquid-glass border border-white/20 p-6 sm:p-10 shadow-2xl"
      >
        <div
          className="absolute -right-20 -top-24 w-96 h-96 rounded-full blur-3xl opacity-40 pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${auraProfile.colors[0]}, ${auraProfile.colors[1]}, transparent)`
          }}
        />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/40 text-[11px] font-extrabold uppercase tracking-widest text-[var(--color-accent)] mb-3">
              <span>🏆 WAVECRAFT WRAPPED • LISTENER PASSPORT</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
              Your Audio Aura: <span className="gradient-text">{auraProfile.title}</span>
            </h1>
            <p className="text-sm sm:text-base text-white/65 mt-2 leading-relaxed">
              {auraProfile.subtitle}. You have unlocked{' '}
              <strong className="text-white">
                {unlockedCount} of {badges.length} Studio Achievements
              </strong>
              .
            </p>
          </div>

          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={handleDownloadWrappedPoster}
            disabled={isExportingPoster}
            className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[var(--color-accent)] via-rose-500 to-purple-600 text-white font-extrabold text-xs sm:text-sm uppercase tracking-wider shadow-[0_12px_35px_rgba(250,45,72,0.45)] flex items-center justify-center gap-2.5 cursor-pointer flex-shrink-0"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>{isExportingPoster ? 'Rendering Poster...' : 'Download Wrapped Poster'}</span>
          </motion.button>
        </div>
      </motion.div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlassCard className="p-5 flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wider text-white/45 font-bold">
            Total Stream Time
          </span>
          <span className="text-2xl sm:text-3xl font-black text-white">
            {formatListeningTime(totalMinutes)}
          </span>
        </GlassCard>
        <GlassCard className="p-5 flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wider text-white/45 font-bold">
            Tracks Streamed
          </span>
          <span className="text-2xl sm:text-3xl font-black text-white">{totalListens}</span>
        </GlassCard>
        <GlassCard className="p-5 flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wider text-white/45 font-bold">
            Unique Artists
          </span>
          <span className="text-2xl sm:text-3xl font-black text-white">{uniqueArtists}</span>
        </GlassCard>
        <GlassCard className="p-5 flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wider text-white/45 font-bold">
            Badges Unlocked
          </span>
          <span className="text-2xl sm:text-3xl font-black text-[var(--color-accent)]">
            {unlockedCount} / {badges.length}
          </span>
        </GlassCard>
      </div>

      {/* Unlockable Listener Achievements Grid */}
      <div className="space-y-4">
        <h2 className="text-xl font-extrabold text-white">🏅 Listener Achievement Badges</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {badges.map((badge) => (
            <motion.div
              key={badge.id}
              whileHover={{ y: -2 }}
              className={`p-4 rounded-2xl border flex items-start gap-3.5 transition-all ${
                badge.unlocked
                  ? 'liquid-glass border-white/20 shadow-lg'
                  : 'bg-white/[0.02] border-white/5 opacity-50'
              }`}
            >
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 ${
                  badge.unlocked
                    ? 'bg-gradient-to-br from-[var(--color-accent)]/30 to-purple-500/30 border border-white/20'
                    : 'bg-white/5'
                }`}
              >
                {badge.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-extrabold text-white truncate">{badge.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                      badge.unlocked
                        ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'
                        : 'bg-white/10 text-white/40'
                    }`}
                  >
                    {badge.unlocked ? 'UNLOCKED' : 'LOCKED'}
                  </span>
                </div>
                <p className="text-xs text-white/55 mt-1 leading-relaxed">{badge.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Top Tracks & Top Artists Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold text-white">🔥 Most Played Tracks</h2>
            <span className="text-xs text-white/45">Click any track to play</span>
          </div>
          <GlassCard className="p-2">
            {topTracks.length > 0 ? (
              <div className="flex flex-col divide-y divide-white/5">
                {topTracks.map((track, idx) => (
                  <div
                    key={idx}
                    onClick={() => handlePlayTopTrack(track.title, track.artist)}
                    className="flex items-center gap-4 p-3.5 hover:bg-white/[0.07] rounded-xl transition-all cursor-pointer group"
                  >
                    <span className="text-sm font-extrabold text-[var(--color-accent)] w-6 text-center">
                      #{idx + 1}
                    </span>
                    <div className="flex-1 flex flex-col min-w-0">
                      <span className="text-sm font-bold text-white group-hover:text-[var(--color-accent)] transition-colors truncate">
                        {track.title}
                      </span>
                      <span className="text-xs text-white/55 truncate">{track.artist}</span>
                    </div>
                    <span className="text-xs font-bold text-white/60 bg-white/10 px-2.5 py-1 rounded-full">
                      {track.count} {track.count === 1 ? 'play' : 'plays'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-white/50">
                Play any song from Listen Now or AI Vibe DJ to populate your Top Rotation!
              </div>
            )}
          </GlassCard>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-extrabold text-white">👑 Top Artists</h2>
          {topArtists.length > 0 ? (
            <div className="flex flex-col gap-3">
              {topArtists.map((artist, idx) => {
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
                return (
                  <GlassCard key={idx} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {medal}
                      </div>
                      <span className="text-sm font-bold text-white truncate">{artist.artist}</span>
                    </div>
                    <span className="text-xs font-semibold text-white/50 flex-shrink-0">
                      {artist.count} {artist.count === 1 ? 'play' : 'plays'}
                    </span>
                  </GlassCard>
                );
              })}
            </div>
          ) : (
            <GlassCard className="p-6 text-center text-xs text-white/50">
              Your top artists will appear here as you stream.
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
