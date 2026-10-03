import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useJamStore } from '../../stores/jamStore';
import { usePlayerStore } from '../../stores/playerStore';
import { searchTracks } from '../../services/youtube';
import type { Track } from '../../types';
import GlassCard from '../ui/GlassCard';
import TrackRow from '../ui/TrackRow';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';

const REACTION_EMOJIS = ['🔥', '💜', '🎧', '⚡', '🚀', '🥹', '🙌', '✨'];

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
    setUserName,
    createRoom,
    joinRoom,
    leaveRoom,
    sendReaction,
    addTrackToJam
  } = useJamStore();

  const { currentTrack, isPlaying, queue, togglePlay, nextTrack } = usePlayerStore();

  const [joinInput, setJoinInput] = useState(urlRoom);
  const [nameInput, setNameInput] = useState(userName);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [songQuery, setSongQuery] = useState('');
  const [songResults, setSongResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Auto-join if ?room=WAVE-XXXX is in the URL
  useEffect(() => {
    if (urlRoom && !roomCode) {
      joinRoom(urlRoom, nameInput);
    }
  }, [urlRoom]);

  const handleStartRoom = async () => {
    const code = await createRoom(nameInput);
    setSearchParams({ room: code });
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinInput.trim()) return;
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

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-8 pb-28 relative">
      {/* Floating Live Emoji Reactions Overlay */}
      <div className="fixed bottom-28 right-8 z-40 pointer-events-none flex flex-col-reverse items-end gap-2">
        <AnimatePresence>
          {reactions.slice(-6).map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 30, scale: 0.6 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -40, scale: 0.8 }}
              className="px-3.5 py-1.5 rounded-full liquid-glass border border-white/20 shadow-xl flex items-center gap-2 text-sm"
            >
              <span className="text-xl">{r.emoji}</span>
              <span className="text-xs font-bold text-white/80">{r.sender}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {!roomCode ? (
        /* LOBBY: CREATE OR JOIN A JAM ROOM */
        <div className="space-y-8">
          <div className="relative rounded-3xl overflow-hidden liquid-glass border border-white/15 p-8 sm:p-10 shadow-2xl">
            <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-emerald-500/20 blur-[100px] pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-[var(--color-accent)]/25 blur-[100px] pointer-events-none" />

            <div className="relative z-10 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-xs font-bold uppercase tracking-widest text-emerald-300 mb-4">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Real-Time Synced Listening Party
              </div>
              <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
                WaveCraft Live Jam Rooms
              </h1>
              <p className="text-sm sm:text-base text-white/65 mt-3">
                Host a live session or join a friend’s room code. Everyone hears the exact same song at the exact same timestamp, with a shared queue and live floating reactions.
              </p>

              {/* Display Name Input */}
              <div className="mt-6 max-w-sm">
                <label className="block text-xs font-bold uppercase tracking-wider text-white/55 mb-2">
                  Your DJ / Listener Name
                </label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => {
                    setNameInput(e.target.value);
                    setUserName(e.target.value);
                  }}
                  placeholder="Enter your display name..."
                  className="w-full h-11 px-4 rounded-xl bg-black/40 border border-white/20 text-sm text-white focus:outline-none focus:border-emerald-400"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Host a New Jam Card */}
            <GlassCard variant="liquid" padding="lg" className="flex flex-col justify-between border border-white/15">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-purple-600 flex items-center justify-center text-2xl shadow-lg mb-4">
                  🎧
                </div>
                <h2 className="text-2xl font-extrabold text-white">Start a Jam Session</h2>
                <p className="text-sm text-white/60 mt-2">
                  Generate an instant room code and invite link. Your playback, seeks, and queue will automatically sync to everyone who joins.
                </p>
              </div>

              <button
                onClick={handleStartRoom}
                className="mt-6 w-full h-13 rounded-2xl bg-gradient-to-r from-[var(--color-accent)] to-purple-600 text-white font-extrabold text-sm shadow-xl hover:brightness-110 transition-all cursor-pointer"
              >
                + Create Live Jam Room
              </button>
            </GlassCard>

            {/* Join Existing Jam Card */}
            <GlassCard variant="liquid" padding="lg" className="flex flex-col justify-between border border-white/15">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-2xl shadow-lg mb-4">
                  🔗
                </div>
                <h2 className="text-2xl font-extrabold text-white">Join a Friend’s Room</h2>
                <p className="text-sm text-white/60 mt-2">
                  Have a room code like <code className="text-emerald-300">WAVE-7X9K</code>? Enter it below to lock your audio player to the room’s live stream.
                </p>
              </div>

              <form onSubmit={handleJoinRoom} className="mt-6 flex gap-3">
                <input
                  type="text"
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                  placeholder="WAVE-XXXX"
                  className="flex-1 h-13 px-4 rounded-2xl bg-black/40 border border-white/20 text-white font-mono uppercase tracking-widest text-sm focus:outline-none focus:border-emerald-400"
                />
                <button
                  type="submit"
                  className="px-6 h-13 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-sm transition-colors cursor-pointer"
                >
                  Join Jam
                </button>
              </form>
            </GlassCard>
          </div>
        </div>
      ) : (
        /* ACTIVE LIVE JAM ROOM STUDIO */
        <div className="space-y-6">
          {/* Room Header Banner */}
          <GlassCard variant="liquid" padding="lg" className="border border-emerald-400/30">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div>
                <div className="flex flex-wrap items-center gap-2.5 mb-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-xs font-extrabold text-emerald-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    LIVE JAM • {roomCode}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-white/10 text-xs font-bold text-white/80">
                    {isHost ? '👑 You are Hosting' : `🎧 Synced to ${hostName}`}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-white/10 text-xs font-bold text-white/70">
                    👥 {Math.max(1, members.length)} Listening
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                  {isHost ? `${userName}’s Live Jam Room` : `${hostName}’s Listening Party`}
                </h1>
                <p className="text-xs text-white/55 mt-1">
                  Share the invite link or room code so friends can tune in from any browser or phone.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleCopyInvite}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs transition-all cursor-pointer shadow-lg"
                >
                  {copiedInvite ? '✓ Invite Link Copied!' : '🔗 Copy Invite Link'}
                </button>
                <button
                  onClick={handleLeave}
                  className="px-4 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-200 font-bold text-xs transition-all cursor-pointer"
                >
                  Leave Jam
                </button>
              </div>
            </div>

            {/* Live Now Playing Stage & Emoji Reaction Bar */}
            <div className="mt-6 pt-6 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-6">
              {currentTrack ? (
                <div className="flex items-center gap-4 min-w-0 w-full md:w-auto">
                  <img
                    src={currentTrack.thumbnailLarge || currentTrack.thumbnail || DEFAULT_THUMBNAIL}
                    alt={currentTrack.title}
                    className={`w-16 h-16 rounded-2xl object-cover shadow-lg border border-white/15 ${
                      isPlaying ? ' ring-2 ring-emerald-400' : ''
                    }`}
                  />
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                      {isPlaying ? 'Now Syncing Live' : 'Paused in Room'}
                    </span>
                    <h3 className="text-lg font-extrabold text-white truncate">
                      {currentTrack.title}
                    </h3>
                    <p className="text-xs text-white/60 truncate">{currentTrack.artist}</p>
                  </div>
                  {isHost && (
                    <div className="flex items-center gap-2 ml-2">
                      <button
                        onClick={togglePlay}
                        className="px-3.5 py-2 rounded-xl bg-white text-black font-bold text-xs cursor-pointer"
                      >
                        {isPlaying ? 'Pause' : 'Play'}
                      </button>
                      <button
                        onClick={nextTrack}
                        className="px-3 py-2 rounded-xl liquid-glass text-white font-bold text-xs cursor-pointer"
                      >
                        Skip ⏭
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-white/55">
                  No song playing yet — search below or pick any track to start the Jam!
                </div>
              )}

              {/* Live Emoji Reaction Bar */}
              <div className="flex items-center gap-2 p-2 rounded-2xl bg-black/40 border border-white/10">
                <span className="text-[11px] font-bold text-white/50 px-2 hidden sm:inline">
                  React:
                </span>
                {REACTION_EMOJIS.map((emoji) => (
                  <motion.button
                    key={emoji}
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.85 }}
                    onClick={() => sendReaction(emoji)}
                    className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center text-lg cursor-pointer"
                    title={`Send ${emoji} to room`}
                  >
                    {emoji}
                  </motion.button>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* Add Songs to Shared Jam Queue */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-4">
              <GlassCard variant="liquid" padding="md">
                <h3 className="text-base font-extrabold text-white mb-3">
                  Add Songs to Shared Queue
                </h3>
                <form onSubmit={handleSearchSongs} className="flex gap-2">
                  <input
                    type="text"
                    value={songQuery}
                    onChange={(e) => setSongQuery(e.target.value)}
                    placeholder="Search any song to drop into the Jam..."
                    className="flex-1 h-10 px-3.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-emerald-400"
                  />
                  <button
                    type="submit"
                    disabled={isSearching}
                    className="px-4 h-10 rounded-xl bg-white text-black font-bold text-xs cursor-pointer"
                  >
                    {isSearching ? '...' : 'Search'}
                  </button>
                </form>

                {songResults.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {songResults.map((track) => (
                      <div
                        key={track.id}
                        className="flex items-center justify-between gap-3 p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={track.thumbnail || DEFAULT_THUMBNAIL}
                            alt={track.title}
                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">{track.title}</p>
                            <p className="text-[11px] text-white/55 truncate">{track.artist}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => addTrackToJam(track)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/30 text-emerald-300 text-xs font-bold flex-shrink-0 cursor-pointer"
                        >
                          + Add
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>

              {/* Active Listeners Card */}
              <GlassCard variant="liquid" padding="md">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-white/60 mb-3">
                  Active Listeners in Room ({Math.max(1, members.length)})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(members.length > 0
                    ? members
                    : [{ id: 'self', name: userName, lastSeen: Date.now() }]
                  ).map((m) => (
                    <div
                      key={m.id}
                      className="px-3 py-1.5 rounded-full bg-white/[0.07] border border-white/10 flex items-center gap-2 text-xs font-semibold text-white"
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>{m.name}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>

            {/* Right: Shared Room Queue */}
            <div className="lg:col-span-7">
              <GlassCard variant="liquid" padding="md">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-extrabold text-white">
                    Shared Room Queue ({queue.length} tracks)
                  </h3>
                  <span className="text-xs text-white/45">Auto-syncs across all listeners</span>
                </div>
                {queue.length === 0 ? (
                  <p className="text-xs text-white/50 py-8 text-center">
                    Queue is empty. Search on the left to add tracks to the party!
                  </p>
                ) : (
                  <div className="space-y-1 max-h-[460px] overflow-y-auto pr-1">
                    {queue.map((t, idx) => (
                      <TrackRow key={`${t.id}-${idx}`} track={t} index={idx} tracks={queue} />
                    ))}
                  </div>
                )}
              </GlassCard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
