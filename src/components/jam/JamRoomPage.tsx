import { useState, useEffect, useRef, memo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useJamStore } from '../../stores/jamStore';
import { usePlayerStore } from '../../stores/playerStore';
import { searchTracks } from '../../services/youtube';
import { unlockAudioEngine } from '../player/YouTubeEmbed';
import type { Track } from '../../types';
import GlassCard from '../ui/GlassCard';
import TrackRow from '../ui/TrackRow';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';
import { formatTime } from '../../utils/formatTime';

const REACTION_EMOJIS = ['🔥', '💜', '🎧', '⚡', '🚀', '🥹', '🙌', '✨'];

const QUICK_CHAT_CHIPS = [
  '🔥 This drop is insane!',
  '🎧 Queue the next banger!',
  '⚡ Locked in & vibing',
  '💜 320kbps sounds crystal clear'
];

const AVATAR_GRADIENTS = [
  'from-rose-500 to-purple-600',
  'from-emerald-400 to-cyan-600',
  'from-amber-400 to-orange-600',
  'from-violet-500 to-indigo-600',
  'from-pink-500 to-rose-600',
  'from-cyan-400 to-blue-600'
];

function getAvatarGradient(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

const JamStageProgress = memo(() => {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const seekTo = usePlayerStore((s) => s.seekTo);
  const progressRatio = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <div className="mt-3 max-w-xl">
      <div
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const r = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          seekTo(r * (duration || 210));
        }}
        className="h-2 bg-white/15 rounded-full cursor-pointer overflow-hidden border border-white/10"
      >
        <div
          className="h-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-rose-500 rounded-full transition-all duration-150"
          style={{ width: `${(progressRatio * 100).toFixed(1)}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] font-bold tabular-nums text-white/50 mt-1">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
});
JamStageProgress.displayName = 'JamStageProgress';

export default function JamRoomPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlRoom = searchParams.get('room') || '';

  const {
    roomCode,
    isHost,
    userName,
    hostName,
    members,
    reactions,
    messages,
    isConnected,
    setUserName,
    createRoom,
    joinRoom,
    leaveRoom,
    sendReaction,
    sendMessage,
    addTrackToJam,
    playTrackInJam,
    togglePlayInJam,
    skipTrackInJam,
    syncNow
  } = useJamStore();

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const queue = usePlayerStore((s) => s.queue);

  const [joinInput, setJoinInput] = useState(urlRoom);
  const [nameInput, setNameInput] = useState(userName);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [songQuery, setSongQuery] = useState('');
  const [songResults, setSongResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const stageCanvasRef = useRef<HTMLCanvasElement>(null);

  // Auto-join if ?room=WAVE-XXXX is in the URL
  useEffect(() => {
    if (urlRoom && !roomCode) {
      joinRoom(urlRoom, nameInput);
    }
  }, [urlRoom]);

  // Auto-scroll live chat feed when new messages arrive
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Live Audio-Reactive Spectrum Canvas inside Active Jam Stage
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  useEffect(() => {
    if (!roomCode) return;
    const canvas = stageCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let phase = 0;

    const render = () => {
      phase += isPlayingRef.current ? 0.055 : 0.015;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      const barCount = 56;
      const barW = w / barCount;

      for (let i = 0; i < barCount; i++) {
        const x = i * barW;
        const n1 = Math.abs(Math.sin(phase + i * 0.28));
        const n2 = Math.abs(Math.cos(phase * 1.4 - i * 0.19));
        const energy = isPlayingRef.current ? 0.18 + (n1 * 0.55 + n2 * 0.27) : 0.08 + n1 * 0.06;
        const barH = Math.max(4, energy * h * 0.68);

        const grad = ctx.createLinearGradient(0, h, 0, h - barH);
        grad.addColorStop(0, 'rgba(16, 185, 129, 0.22)');
        grad.addColorStop(0.6, 'rgba(6, 182, 212, 0.16)');
        grad.addColorStop(1, 'rgba(250, 45, 72, 0.06)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x + 1.5, h - barH, Math.max(2, barW - 3), barH, 3);
        ctx.fill();
      }

      ctx.restore();
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [roomCode]);

  const handleStartRoom = async () => {
    unlockAudioEngine();
    const code = await createRoom(nameInput);
    setSearchParams({ room: code });
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinInput.trim()) return;
    unlockAudioEngine();
    const clean = joinInput.trim().toUpperCase();
    await joinRoom(clean, nameInput);
    setSearchParams({ room: clean });
  };

  const handleLeave = () => {
    leaveRoom();
    setSearchParams({});
  };

  const inviteUrl = roomCode
    ? `${window.location.origin}/jam?room=${encodeURIComponent(roomCode)}`
    : '';

  const handleCopyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2500);
    } catch {}
  };

  const handleCopyCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  const handleSearchSongs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!songQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await searchTracks(songQuery.trim());
      setSongResults(res.slice(0, 6));
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const text = chatInput;
    setChatInput('');
    await sendMessage(text);
  };

  const activeMembers =
    members.length > 0 ? members : [{ id: 'self', name: userName || 'Listener', lastSeen: Date.now() }];

  return (
    <div className="pb-28 pt-1 max-w-[1400px] mx-auto space-y-6 relative select-none text-white">
      {/* Floating Live Emoji Reactions Cannon Overlay */}
      <div className="fixed bottom-28 right-6 sm:right-8 z-40 pointer-events-none flex flex-col-reverse items-end gap-2.5">
        <AnimatePresence>
          {reactions.slice(-6).map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 35, scale: 0.6 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -45, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
              className="px-4 py-2 rounded-full liquid-glass border border-white/25 shadow-[0_12px_32px_rgba(0,0,0,0.5)] flex items-center gap-2.5 text-sm"
            >
              <span className="text-xl drop-shadow">{r.emoji}</span>
              <span className="text-xs font-extrabold text-white/90">{r.sender}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {!roomCode ? (
        /* ================= LOBBY: SPATIAL SHAREPLAY & LIVE JAM STUDIO ================= */
        <div className="space-y-6">
          {/* Cinematic SharePlay Radar Hero */}
          <div className="relative rounded-3xl overflow-hidden liquid-glass border border-white/15 p-6 sm:p-10 shadow-2xl">
            <div className="absolute -top-28 -left-24 w-96 h-96 rounded-full bg-emerald-500/20 blur-[110px] pointer-events-none" />
            <div className="absolute -bottom-28 -right-24 w-96 h-96 rounded-full bg-[var(--color-accent)]/25 blur-[110px] pointer-events-none" />

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-4">
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-[11px] font-extrabold uppercase tracking-widest text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  TRIPLE-TRANSPORT SHAREPLAY • &lt;15MS SYNC DRIFT
                </div>

                <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-[1.1]">
                  Listen Together in <br />
                  <span className="bg-gradient-to-r from-emerald-300 via-cyan-300 to-rose-400 bg-clip-text text-transparent">
                    Real-Time Spatial Sync.
                  </span>
                </h1>

                <p className="text-sm sm:text-base text-white/65 max-w-xl leading-relaxed">
                  Start a live broadcast room or lock into a friend’s code across any phone or laptop. Everyone hears the exact same 320kbps audio frame simultaneously with a shared queue, live lounge chat, and crowd emoji reactions.
                </p>

                {/* Listener Identity Pill Input */}
                <div className="pt-2 max-w-md">
                  <label className="block text-[11px] font-extrabold uppercase tracking-widest text-white/50 mb-2">
                    Your Studio Display Identity
                  </label>
                  <div className="flex items-center gap-3 p-1.5 pl-2.5 rounded-full bg-black/45 border border-white/15 focus-within:border-emerald-400/60 transition-colors">
                    <div
                      className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarGradient(
                        nameInput || 'DJ'
                      )} flex items-center justify-center text-xs font-black text-white shadow-md flex-shrink-0`}
                    >
                      {(nameInput || 'DJ').slice(0, 2).toUpperCase()}
                    </div>
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => {
                        setNameInput(e.target.value);
                        setUserName(e.target.value);
                      }}
                      placeholder="Enter your DJ / Listener name..."
                      className="flex-1 bg-transparent text-sm font-semibold text-white placeholder-white/35 focus:outline-none pr-4"
                    />
                    <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-extrabold uppercase tracking-wider mr-1 whitespace-nowrap flex-shrink-0">
                      Ready
                    </span>
                  </div>
                </div>
              </div>

              {/* Animated SharePlay Sonic Radar Visual */}
              <div className="lg:col-span-5 flex items-center justify-center py-4">
                <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
                  {/* Concentric Radar Rings */}
                  <div className="absolute inset-0 rounded-full border border-emerald-400/20 animate-[ping_3.5s_cubic-bezier(0,0,0.2,1)_infinite]" />
                  <div className="absolute inset-4 rounded-full border border-cyan-400/25" />
                  <div className="absolute inset-12 rounded-full border border-dashed border-white/20 animate-[spin_18s_linear_infinite]" />
                  <div className="absolute inset-20 rounded-full border border-rose-500/30" />

                  {/* Orbiting Listener Nodes */}
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full liquid-glass border border-emerald-400/40 text-[10px] font-extrabold text-emerald-300 shadow-lg flex items-center gap-1.5 whitespace-nowrap flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>Cloud Relay</span>
                  </div>
                  <div className="absolute bottom-5 left-4 px-2.5 py-1 rounded-full liquid-glass border border-cyan-400/40 text-[10px] font-extrabold text-cyan-300 shadow-lg whitespace-nowrap flex-shrink-0">
                    WebRTC P2P
                  </div>
                  <div className="absolute bottom-5 right-4 px-2.5 py-1 rounded-full liquid-glass border border-rose-400/40 text-[10px] font-extrabold text-rose-300 shadow-lg whitespace-nowrap flex-shrink-0">
                    320kbps HD
                  </div>

                  {/* Center Hub Core */}
                  <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 via-cyan-500 to-rose-500 p-[2px] shadow-[0_0_50px_rgba(16,185,129,0.4)]">
                    <div className="w-full h-full rounded-full bg-[#07080f] flex flex-col items-center justify-center">
                      <div className="flex items-end gap-1 h-6">
                        <span className="w-1 bg-emerald-400 rounded-full animate-eq-1" />
                        <span className="w-1 bg-cyan-400 rounded-full animate-eq-2" />
                        <span className="w-1 bg-rose-400 rounded-full animate-eq-3" />
                        <span className="w-1 bg-emerald-400 rounded-full animate-eq-2" />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/75 mt-1 whitespace-nowrap">
                        WAVE SYNC
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Dual Studio Action Cards: Host vs Join */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Host a New Jam Card */}
            <GlassCard
              variant="liquid"
              padding="lg"
              className="flex flex-col justify-between border border-white/15 relative overflow-hidden group"
            >
              <div className="absolute -top-20 -right-20 w-52 h-52 rounded-full bg-rose-500/15 blur-3xl pointer-events-none group-hover:bg-rose-500/25 transition-colors" />

              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] via-rose-500 to-purple-600 flex items-center justify-center shadow-lg shadow-rose-500/25">
                    <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="22" />
                    </svg>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-rose-500/15 border border-rose-400/30 text-[10px] font-extrabold uppercase tracking-wider text-rose-300 whitespace-nowrap flex-shrink-0">
                    HOST BROADCAST
                  </span>
                </div>

                <h2 className="text-2xl font-extrabold text-white">Start a Live Jam Lounge</h2>
                <p className="text-sm text-white/60 mt-2 leading-relaxed">
                  Generate an instant room code and shareable invite link. Your track selection, play/pause, seeks, and collaborative queue sync across every device in the room.
                </p>

                <div className="flex flex-wrap gap-2 mt-4">
                  {['Instant Room Code', 'Shared Party Queue', 'Crowd Emoji Reactions'].map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 text-[11px] font-semibold text-white/70 whitespace-nowrap"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <motion.button
                whileHover={{ y: -2, scale: 1.01 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleStartRoom}
                className="mt-7 w-full py-3.5 px-6 rounded-full glass-button-primary text-white font-extrabold text-sm transition-all cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <span>+ Launch Live Jam Room</span>
              </motion.button>
            </GlassCard>

            {/* Join Existing Jam Card */}
            <GlassCard
              variant="liquid"
              padding="lg"
              className="flex flex-col justify-between border border-white/15 relative overflow-hidden group"
            >
              <div className="absolute -top-20 -right-20 w-52 h-52 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none group-hover:bg-emerald-500/25 transition-colors" />

              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                    <svg className="w-6 h-6 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 whitespace-nowrap flex-shrink-0">
                    TUNE IN LIVE
                  </span>
                </div>

                <h2 className="text-2xl font-extrabold text-white">Join a Friend’s Frequency</h2>
                <p className="text-sm text-white/60 mt-2 leading-relaxed">
                  Have a room code like <code className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono font-bold whitespace-nowrap">WAVE-7X9K</code>? Enter it below to lock your player directly to their live audio stream.
                </p>

                <div className="flex flex-wrap gap-2 mt-4">
                  {['Cross-Device Phone & Laptop', 'Auto Drift Correction', 'Co-DJ Queueing'].map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 text-[11px] font-semibold text-white/70 whitespace-nowrap"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <form onSubmit={handleJoinRoom} className="mt-7 flex flex-col sm:flex-row gap-2.5">
                <input
                  type="text"
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                  placeholder="Enter code (e.g. WAVE-7X9K)"
                  className="flex-1 py-3 px-5 rounded-full bg-black/45 border border-white/20 text-white font-mono uppercase tracking-widest text-sm focus:outline-none focus:border-emerald-400"
                />
                <motion.button
                  whileHover={{ y: -2, scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  type="submit"
                  className="py-3 px-7 rounded-full glass-button-emerald text-white font-extrabold text-sm transition-all cursor-pointer whitespace-nowrap flex-shrink-0"
                >
                  Lock Into Jam
                </motion.button>
              </form>
            </GlassCard>
          </div>
        </div>
      ) : (
        /* ================= ACTIVE LIVE JAM ROOM STUDIO ================= */
        <div className="space-y-6">
          {/* Master Broadcast Stage & Audio-Reactive Waveform Deck */}
          <div className="relative rounded-3xl overflow-hidden liquid-glass border border-emerald-400/35 p-5 sm:p-7 shadow-2xl">
            {/* Live Audio-Reactive Spectrum Canvas Backdrop */}
            <canvas
              ref={stageCanvasRef}
              className="absolute inset-x-0 bottom-0 w-full h-36 pointer-events-none opacity-80"
            />
            <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-emerald-500/20 blur-[100px] pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-cyan-500/20 blur-[100px] pointer-events-none" />

            {/* Top Stage Telemetry & Invite Controls */}
            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-white/10">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={handleCopyCode}
                    title="Click to copy Room Code"
                    className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/45 text-xs font-black font-mono tracking-wider text-emerald-300 cursor-pointer hover:bg-emerald-500/30 transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>{copiedCode ? '✓ CODE COPIED!' : `ROOM: ${roomCode}`}</span>
                  </motion.button>

                  <span className="px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs font-bold text-white/90">
                    {isHost ? '👑 Hosting Broadcast' : `🎧 Synced to ${hostName}`}
                  </span>

                  <span className="px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs font-bold text-emerald-300">
                    {activeMembers.length} {activeMembers.length === 1 ? 'Listener' : 'Listeners'} Online
                  </span>

                  {isConnected && (
                    <span className="px-2.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-[10px] font-extrabold text-cyan-300 uppercase tracking-wider">
                      ⚡ Cloud + P2P Relay Locked
                    </span>
                  )}
                </div>

                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  {isHost ? `${userName}’s Live Jam Broadcast` : `${hostName}’s Live Listening Lounge`}
                </h1>
              </div>

              {/* Action Pill Buttons */}
              <div className="flex flex-wrap items-center gap-2.5">
                {!isHost && (
                  <motion.button
                    whileHover={{ y: -1.5, scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={syncNow}
                    className="px-4 py-2.5 rounded-full glass-button text-cyan-200 border-cyan-400/35 text-xs font-extrabold flex items-center gap-1.5"
                  >
                    <span>⚡ Resync Audio</span>
                  </motion.button>
                )}

                <motion.button
                  whileHover={{ y: -1.5, scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={handleCopyInvite}
                  className="px-5 py-2.5 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 text-black font-extrabold text-xs cursor-pointer shadow-[0_8px_24px_rgba(16,185,129,0.35)]"
                >
                  {copiedInvite ? '✓ Invite Link Copied!' : '🔗 Copy SharePlay Link'}
                </motion.button>

                <motion.button
                  whileHover={{ y: -1.5, scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={handleLeave}
                  className="px-4 py-2.5 rounded-full bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/35 text-rose-200 font-extrabold text-xs transition-colors cursor-pointer"
                >
                  Leave Lounge
                </motion.button>
              </div>
            </div>

            {/* Center Now Playing Turntable Stage + Crowd Reaction Cannon */}
            <div className="relative z-10 mt-6 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
              {currentTrack ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 flex-1 min-w-0">
                  {/* Spinning Vinyl Platter */}
                  <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 flex items-center justify-center">
                    <div
                      className={`w-full h-full rounded-full vinyl-disc border-2 border-emerald-400/50 shadow-[0_0_35px_rgba(16,185,129,0.3)] flex items-center justify-center ${
                        isPlaying ? 'animate-[spin_4s_linear_infinite]' : ''
                      }`}
                    >
                      <img
                        src={currentTrack.thumbnailLarge || currentTrack.thumbnail || DEFAULT_THUMBNAIL}
                        alt={currentTrack.title}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                        }}
                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border border-white/40"
                      />
                    </div>
                  </div>

                  {/* Track Metadata & Live Synced Scrubber */}
                  <div className="flex-1 min-w-0 w-full">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-[10px] font-extrabold uppercase tracking-widest text-emerald-300">
                        <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${isPlaying ? 'animate-ping' : ''}`} />
                        {isPlaying ? 'SYNCING LIVE • 320KBPS HD' : 'PAUSED IN ROOM'}
                      </span>
                    </div>

                    <h2 className="text-xl sm:text-2xl font-black text-white truncate">
                      {currentTrack.title}
                    </h2>
                    <p className="text-xs sm:text-sm text-white/65 truncate mt-0.5">
                      {currentTrack.artist} {currentTrack.album ? `• ${currentTrack.album}` : ''}
                    </p>

                    {/* Live Room Progress Bar */}
                    <JamStageProgress />
                  </div>

                  {/* Shared Stage Transport Controls */}
                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    <motion.button
                      whileHover={{ y: -1.5, scale: 1.03 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => togglePlayInJam()}
                      className="px-5 py-2.5 rounded-full bg-white text-black font-extrabold text-xs uppercase tracking-wider cursor-pointer shadow-lg"
                    >
                      {isPlaying ? '⏸ Pause Room' : '▶ Play Room'}
                    </motion.button>
                    <motion.button
                      whileHover={{ y: -1.5, scale: 1.03 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => skipTrackInJam()}
                      className="px-4 py-2.5 rounded-full glass-button text-white font-extrabold text-xs cursor-pointer"
                    >
                      Skip ⏭
                    </motion.button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-white/65 py-4">
                  No track spinning yet — search any song below and click{' '}
                  <strong className="text-emerald-300">▶ Play Now</strong> to kick off the party!
                </div>
              )}

              {/* Crowd Emoji Reaction Cannon Dock */}
              <div className="flex items-center gap-1.5 p-2 rounded-full bg-black/45 border border-white/15 self-start xl:self-center overflow-x-auto max-w-full">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/45 px-2.5 hidden sm:inline">
                  Crowd React
                </span>
                {REACTION_EMOJIS.map((emoji) => (
                  <motion.button
                    key={emoji}
                    whileHover={{ y: -3, scale: 1.22 }}
                    whileTap={{ scale: 0.85 }}
                    onClick={() => sendReaction(emoji)}
                    className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center text-lg cursor-pointer flex-shrink-0 transition-colors"
                    title={`Launch ${emoji} reaction`}
                  >
                    {emoji}
                  </motion.button>
                ))}
              </div>
            </div>
          </div>

          {/* ================= BENTO 3-ZONE JAM STUDIO GRID ================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* LEFT COLUMN: Connected Listeners Radar + Song Dropper */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              {/* Connected Listeners Pod */}
              <GlassCard variant="liquid" padding="md" className="border border-white/15">
                <div className="flex items-center justify-between mb-3.5">
                  <h3 className="text-xs font-black uppercase tracking-widest text-white/70">
                    Connected Listeners ({activeMembers.length})
                  </h3>
                  <span className="text-[10px] font-bold text-emerald-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    In Sync
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activeMembers.map((m, idx) => {
                    const isMemberHost = m.name === hostName || (idx === 0 && isHost);
                    return (
                      <div
                        key={m.id}
                        className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarGradient(
                              m.name
                            )} flex items-center justify-center text-xs font-black text-white shadow flex-shrink-0`}
                          >
                            {m.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-extrabold text-white truncate">{m.name}</div>
                            <div className="text-[10px] text-emerald-300/80 font-semibold">
                              {isMemberHost ? '👑 Room Host' : '🎧 Locked In'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-end gap-[2px] h-3 flex-shrink-0 pr-1">
                          <span className="w-[2.5px] bg-emerald-400 rounded-full animate-eq-1" />
                          <span className="w-[2.5px] bg-cyan-400 rounded-full animate-eq-2" />
                          <span className="w-[2.5px] bg-emerald-400 rounded-full animate-eq-3" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>

              {/* Instant Song Search & Party Dropper */}
              <GlassCard variant="liquid" padding="md" className="border border-white/15 flex-1">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-base font-extrabold text-white">Drop a Song Into the Jam</h3>
                    <p className="text-[11px] text-white/50">
                      Play immediately for the whole room or add to the collaborative queue
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSearchSongs} className="flex gap-2">
                  <input
                    type="text"
                    value={songQuery}
                    onChange={(e) => setSongQuery(e.target.value)}
                    placeholder="Search any song or artist..."
                    className="flex-1 h-10 px-4 rounded-full glass-input text-xs text-white placeholder-white/40"
                  />
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.95 }}
                    type="submit"
                    disabled={isSearching}
                    className="px-5 h-10 rounded-full bg-gradient-to-r from-[var(--color-accent)] to-rose-500 text-white font-extrabold text-xs cursor-pointer shadow-md"
                  >
                    {isSearching ? '...' : 'Search'}
                  </motion.button>
                </form>

                {songResults.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {songResults.map((track) => (
                      <div
                        key={track.id}
                        className="flex items-center justify-between gap-2.5 p-2 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <img
                            src={track.thumbnail || DEFAULT_THUMBNAIL}
                            alt={track.title}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
                            }}
                            className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">{track.title}</p>
                            <p className="text-[11px] text-white/55 truncate">{track.artist}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <motion.button
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => addTrackToJam(track, true)}
                            title="Play immediately for everyone in the room"
                            className="px-3 py-1.5 rounded-full bg-[var(--color-accent)] hover:brightness-110 text-white text-[11px] font-extrabold cursor-pointer shadow"
                          >
                            ▶ Play Now
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => addTrackToJam(track, false)}
                            title="Add to Shared Room Queue"
                            className="px-3 py-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/35 text-emerald-300 text-[11px] font-extrabold cursor-pointer"
                          >
                            + Queue
                          </motion.button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            </div>

            {/* RIGHT COLUMN: Collaborative Room Queue + Live Lounge Chat */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              {/* Shared Room Queue */}
              <GlassCard variant="liquid" padding="md" className="border border-white/15">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-base font-extrabold text-white">Collaborative Party Queue</h3>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-[10px] font-extrabold text-emerald-300">
                      {queue.length} Tracks
                    </span>
                  </div>
                  <span className="text-xs text-white/45 font-medium hidden sm:inline">
                    Click any track to spin for everyone
                  </span>
                </div>

                {queue.length === 0 ? (
                  <p className="text-xs text-white/50 py-10 text-center">
                    Party queue is empty. Search on the left to drop songs into the room!
                  </p>
                ) : (
                  <div className="flex flex-col gap-1.5 max-h-[340px] overflow-y-auto pr-1">
                    {queue.map((t, idx) => (
                      <TrackRow
                        key={`${t.id}-${idx}`}
                        track={t}
                        index={idx + 1}
                        tracks={queue}
                        onPlay={(selectedTrack) => playTrackInJam(selectedTrack)}
                      />
                    ))}
                  </div>
                )}
              </GlassCard>

              {/* Live Room Chat & Crowd Activity Feed */}
              <GlassCard variant="liquid" padding="md" className="border border-white/15 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-black uppercase tracking-widest text-white/70">
                    💬 Live Lounge Chat & Activity
                  </h3>
                  <span className="text-[10px] text-white/40 font-semibold">Real-Time Feed</span>
                </div>

                <div
                  ref={chatScrollRef}
                  className="space-y-2 max-h-52 overflow-y-auto pr-1 mb-3 text-xs"
                >
                  {messages.length === 0 ? (
                    <p className="text-white/40 py-6 text-center">
                      Drop a message or tap a quick vibe chip below!
                    </p>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`px-3.5 py-2 rounded-2xl ${
                          msg.isSystem
                            ? 'bg-emerald-500/10 border border-emerald-400/25 text-emerald-200 font-semibold text-[11px]'
                            : 'bg-white/[0.05] border border-white/10 text-white/90 flex items-start gap-2.5'
                        }`}
                      >
                        {!msg.isSystem && (
                          <div
                            className={`w-6 h-6 rounded-full bg-gradient-to-br ${getAvatarGradient(
                              msg.sender
                            )} flex items-center justify-center text-[9px] font-black text-white flex-shrink-0 mt-0.5`}
                          >
                            {msg.sender.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          {!msg.isSystem && (
                            <span className="font-extrabold text-emerald-300 mr-1.5">
                              {msg.sender}:
                            </span>
                          )}
                          <span>{msg.text}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* 1-Tap Quick Vibe Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2.5">
                  {QUICK_CHAT_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => sendMessage(chip)}
                      className="px-3 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 text-[10px] font-bold text-white/75 hover:text-white whitespace-nowrap cursor-pointer transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSendChat} className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Message everyone in the Jam Room..."
                    className="flex-1 h-10 px-4 rounded-full glass-input text-xs text-white placeholder-white/40"
                  />
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.95 }}
                    type="submit"
                    className="px-5 h-10 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 text-black font-extrabold text-xs cursor-pointer shadow-md"
                  >
                    Send
                  </motion.button>
                </form>
              </GlassCard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
