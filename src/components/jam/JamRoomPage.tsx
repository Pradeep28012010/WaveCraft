import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useJamStore, getJamInviteUrl } from '../../stores/jamStore';
import { usePlayerStore } from '../../stores/playerStore';
import { searchTracks } from '../../services/youtube';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';
import { useOverlayEscape } from '../ui/dialogStack';
import type { Track } from '../../types';

const QUICK_REACTIONS = ['🔥', '❤️', '🎧', '✨', '🚀'];

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function JamRoomPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const roomCode = useJamStore((s) => s.roomCode);
  const isHost = useJamStore((s) => s.isHost);
  const userName = useJamStore((s) => s.userName);
  const hostName = useJamStore((s) => s.hostName);
  const members = useJamStore((s) => s.members);
  const reactions = useJamStore((s) => s.reactions);
  const messages = useJamStore((s) => s.messages);
  const isJoining = useJamStore((s) => s.isJoining);
  const syncError = useJamStore((s) => s.syncError);
  const transportMode = useJamStore((s) => s.transportMode);

  const setUserName = useJamStore((s) => s.setUserName);
  const createRoom = useJamStore((s) => s.createRoom);
  const joinRoom = useJamStore((s) => s.joinRoom);
  const leaveRoom = useJamStore((s) => s.leaveRoom);
  const sendReaction = useJamStore((s) => s.sendReaction);
  const sendMessage = useJamStore((s) => s.sendMessage);
  const addTrackToJam = useJamStore((s) => s.addTrackToJam);
  const playTrackInJam = useJamStore((s) => s.playTrackInJam);
  const togglePlayInJam = useJamStore((s) => s.togglePlayInJam);
  const skipTrackInJam = useJamStore((s) => s.skipTrackInJam);
  const prevTrackInJam = useJamStore((s) => s.prevTrackInJam);
  const syncNow = useJamStore((s) => s.syncNow);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const queue = usePlayerStore((s) => s.queue);

  const [nameInput, setNameInput] = useState(userName);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [songQuery, setSongQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useOverlayEscape(isChatOpen, () => setIsChatOpen(false));

  // Auto-join from ?jam=CODE deep link
  useEffect(() => {
    const paramCode = searchParams.get('jam');
    if (paramCode && !roomCode) {
      setJoinCodeInput(paramCode.toUpperCase());
      joinRoom(paramCode);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, roomCode, joinRoom, setSearchParams]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isChatOpen && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isChatOpen]);

  const handleCopyInvite = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(getJamInviteUrl(roomCode));
      setCopiedInvite(true);
      triggerAndroidHaptic('light');
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedInvite(false), 2200);
    } catch {}
  };

  const handleSearchSongs = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = songQuery.trim();
    if (!q) return;
    setIsSearching(true);
    try {
      const results = await searchTracks(q);
      setSearchResults(results.slice(0, 8));
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = chatInput.trim();
    if (!clean) return;
    setChatInput('');
    await sendMessage(clean);
  };

  // ==================== LOBBY VIEW ====================
  if (!roomCode) {
    return (
      <div className="max-w-lg mx-auto pt-8 pb-32 px-2 text-white">
        <div className="rounded-3xl liquid-glass border border-white/10 p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="space-y-1.5 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-[11px] font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live Listening Party</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">WaveCraft Jam</h1>
            <p className="text-xs text-white/60">
              Listen together in real time. Host controls playback; everyone adds tracks and chats.
            </p>
          </div>

          {syncError && (
            <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-xs font-semibold text-rose-200 text-center">
              {syncError}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-white/50">
              Your Display Name
            </label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                setUserName(e.target.value);
              }}
              placeholder="Enter your name..."
              maxLength={24}
              className="w-full h-11 px-4 rounded-2xl glass-input text-sm text-white placeholder-white/35 focus:outline-none"
            />
          </div>

          <button
            type="button"
            disabled={isJoining}
            onClick={() => {
              triggerAndroidHaptic('medium');
              createRoom(nameInput);
            }}
            className="w-full h-11 rounded-full glass-button-primary text-sm font-extrabold text-white cursor-pointer shadow-lg hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {isJoining ? 'Starting Room...' : 'Create Jam Room'}
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">or join</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!joinCodeInput.trim()) return;
              triggerAndroidHaptic('medium');
              joinRoom(joinCodeInput, nameInput);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
              placeholder="WAVE-XXXX"
              className="flex-1 h-11 px-4 rounded-2xl glass-input text-sm font-mono uppercase text-white placeholder-white/35 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isJoining || !joinCodeInput.trim()}
              className="h-11 px-6 rounded-full glass-button text-sm font-bold text-white cursor-pointer disabled:opacity-40"
            >
              Join
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==================== ACTIVE SINGLE-COLUMN PARTY FEED ====================
  const progressPct =
    duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const transportLabel =
    transportMode === 'webrtc-p2p'
      ? 'WebRTC P2P'
      : transportMode === 'server-sse'
        ? 'Live SSE'
        : 'Live Relay';
  const recentReactions = reactions.slice(-5);

  return (
    <div className="max-w-3xl mx-auto pt-2 pb-36 space-y-5 text-white">
      {/* 1. Top Room Bar */}
      <div className="rounded-3xl liquid-glass border border-white/10 px-4 py-3 flex flex-wrap items-center justify-between gap-2.5 shadow-xl">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="px-3 py-1 rounded-full bg-white/10 font-mono text-xs font-black tracking-wider text-white">
            {roomCode}
          </span>
          <button
            type="button"
            onClick={handleCopyInvite}
            className="px-3 py-1 rounded-full glass-button text-[11px] font-bold text-white/85 hover:text-white cursor-pointer"
          >
            {copiedInvite ? '✓ Copied Link' : 'Share Invite'}
          </button>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {transportLabel} • {members.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              triggerAndroidHaptic('light');
              setIsChatOpen(true);
            }}
            className="px-3.5 py-1.5 rounded-full glass-button text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
          >
            <span>💬</span>
            <span>Chat</span>
            {messages.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-[var(--color-accent)] text-[10px] font-black">
                {messages.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              triggerAndroidHaptic('medium');
              leaveRoom();
            }}
            className="px-3.5 py-1.5 rounded-full bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 text-xs font-bold cursor-pointer transition-colors"
          >
            {isHost ? 'End Jam' : 'Leave'}
          </button>
        </div>
      </div>

      {/* 2. Now Playing Hero Card */}
      <div className="rounded-3xl liquid-glass border border-white/10 p-5 sm:p-6 shadow-2xl space-y-5 relative overflow-hidden">
        {/* Floating reaction bursts */}
        {recentReactions.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {recentReactions.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 text-[11px] font-semibold text-white/85"
              >
                <span>{r.emoji}</span>
                <span className="text-white/55">{r.sender}</span>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center gap-5">
          <img
            src={currentTrack?.thumbnailLarge || currentTrack?.thumbnail || DEFAULT_THUMBNAIL}
            alt={currentTrack?.title || 'No track playing'}
            className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl object-cover shadow-2xl border border-white/15 flex-shrink-0"
          />

          <div className="flex-1 min-w-0 w-full text-center sm:text-left space-y-3">
            <div>
              <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
                <span>{isHost ? '👑 You are Host DJ' : `🎧 Host: ${hostName || 'DJ'}`}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white truncate">
                {currentTrack?.title || 'Queue a track below to start the party'}
              </h2>
              <p className="text-xs sm:text-sm text-white/60 truncate mt-0.5">
                {currentTrack?.artist || 'Waiting for music...'}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1">
              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-white/45">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Playback Controls + Reactions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              {isHost ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={prevTrackInJam}
                    className="w-9 h-9 rounded-full glass-button flex items-center justify-center text-white cursor-pointer"
                    title="Previous track"
                  >
                    ⏮
                  </button>
                  <button
                    type="button"
                    onClick={togglePlayInJam}
                    className="h-9 px-5 rounded-full glass-button-primary text-xs font-extrabold text-white cursor-pointer shadow-lg"
                  >
                    {isPlaying ? '⏸ Pause' : '▶ Play'}
                  </button>
                  <button
                    type="button"
                    onClick={skipTrackInJam}
                    className="w-9 h-9 rounded-full glass-button flex items-center justify-center text-white cursor-pointer"
                    title="Next track"
                  >
                    ⏭
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    syncNow();
                  }}
                  className="h-9 px-4 rounded-full glass-button-primary text-xs font-bold text-white cursor-pointer"
                >
                  🔄 Resync to Host
                </button>
              )}

              <div className="flex items-center gap-1">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      sendReaction(emoji);
                    }}
                    className="w-8 h-8 rounded-full glass-button flex items-center justify-center text-sm hover:scale-110 active:scale-90 transition-transform cursor-pointer"
                    title={`Send ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Shared Queue + Inline Song Search */}
      <div className="rounded-3xl liquid-glass border border-white/10 p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-white">Shared Queue ({queue.length})</h3>
            <p className="text-[11px] text-white/50">
              Anyone in the room can search and add songs
            </p>
          </div>
        </div>

        <form onSubmit={handleSearchSongs} className="flex items-center gap-2">
          <input
            type="text"
            value={songQuery}
            onChange={(e) => setSongQuery(e.target.value)}
            placeholder="Search a song to add to Jam..."
            className="flex-1 h-10 px-4 rounded-full glass-input text-xs text-white placeholder-white/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isSearching || !songQuery.trim()}
            className="h-10 px-5 rounded-full glass-button-primary text-xs font-bold text-white cursor-pointer disabled:opacity-50"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </form>

        {/* Inline Search Results */}
        {searchResults.length > 0 && (
          <div className="rounded-2xl bg-white/[0.04] p-2 space-y-1 max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                Search Results
              </span>
              <button
                type="button"
                onClick={() => setSearchResults([])}
                className="text-[10px] font-bold text-white/50 hover:text-white cursor-pointer"
              >
                Clear
              </button>
            </div>
            {searchResults.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={t.thumbnail || DEFAULT_THUMBNAIL}
                    alt={t.title}
                    className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{t.title}</p>
                    <p className="text-[10px] text-white/55 truncate">{t.artist}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => addTrackToJam(t, false)}
                    className="px-2.5 py-1 rounded-full glass-button text-[10px] font-bold text-white cursor-pointer"
                  >
                    + Queue
                  </button>
                  {isHost && (
                    <button
                      type="button"
                      onClick={() => playTrackInJam(t)}
                      className="px-2.5 py-1 rounded-full glass-button-primary text-[10px] font-bold text-white cursor-pointer"
                    >
                      Play
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Current & Upcoming Queue List */}
        {queue.length === 0 ? (
          <p className="text-xs text-white/45 text-center py-6">
            The shared queue is empty. Search above to add the first track!
          </p>
        ) : (
          <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
            {queue.map((t, idx) => {
              const isActive = currentTrack?.id === t.id;
              return (
                <div
                  key={`${t.id}-${idx}`}
                  onClick={() => {
                    if (isHost) playTrackInJam(t);
                  }}
                  className={`flex items-center justify-between gap-3 p-2.5 rounded-2xl transition-colors ${
                    isActive
                      ? 'bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/30'
                      : 'bg-white/[0.03] hover:bg-white/[0.08]'
                  } ${isHost ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[11px] font-mono text-white/40 w-5 text-center">
                      {isActive ? '▶' : idx + 1}
                    </span>
                    <img
                      src={t.thumbnail || DEFAULT_THUMBNAIL}
                      alt={t.title}
                      className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <p className={`text-xs font-bold truncate ${isActive ? 'text-[var(--color-accent)]' : 'text-white'}`}>
                        {t.title}
                      </p>
                      <p className="text-[11px] text-white/55 truncate">{t.artist}</p>
                    </div>
                  </div>
                  {isActive && (
                    <span className="text-[10px] font-bold text-[var(--color-accent)] px-2 py-0.5 rounded-full bg-[var(--color-accent)]/15">
                      Playing
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Collapsible Live Chat & Members Drawer */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsChatOpen(false)}
            className="fixed inset-0 z-[9995] bg-black/70 backdrop-blur-sm flex justify-end"
          >
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm h-full modal-glass-panel backdrop-blur-2xl p-4 flex flex-col justify-between border-l border-white/15 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <h3 className="text-sm font-extrabold text-white">
                  Room Chat & Listeners ({members.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setIsChatOpen(false)}
                  className="w-8 h-8 rounded-full glass-button flex items-center justify-center text-xs text-white/70 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Members strip */}
              <div className="flex items-center gap-1.5 flex-wrap py-2.5 border-b border-white/10">
                {members.map((m) => (
                  <span
                    key={m.id}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                      m.isHost
                        ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30'
                        : 'bg-white/10 text-white/80'
                    }`}
                  >
                    {m.isHost ? '👑 ' : ''}{m.name}
                  </span>
                ))}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto py-3 space-y-2 pr-1">
                {messages.length === 0 ? (
                  <p className="text-xs text-white/45 text-center py-8">
                    No messages yet — say hi!
                  </p>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className="p-2.5 rounded-2xl bg-white/[0.06] space-y-0.5">
                      <span className="text-[10px] font-bold text-cyan-300">{msg.sender}</span>
                      <p className="text-xs text-white/90 break-words">{msg.text}</p>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Send form */}
              <form onSubmit={handleSendChat} className="flex items-center gap-2 pt-2 border-t border-white/10">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Send a message..."
                  className="flex-1 h-10 px-3.5 rounded-full glass-input text-xs text-white placeholder-white/40 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="h-10 px-4 rounded-full glass-button-primary text-xs font-bold text-white cursor-pointer disabled:opacity-40"
                >
                  Send
                </button>
              </form>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
