import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useOfflineVault, getOfflineStorageEstimate } from '../../services/offlineVault';
import { usePlayerStore } from '../../stores/playerStore';
import GlassCard from '../ui/GlassCard';
import GlassButton from '../ui/GlassButton';
import TrackRow from '../ui/TrackRow';
import { formatTime } from '../../utils/formatTime';

export default function DownloadsPage() {
  const navigate = useNavigate();
  const { offlineTracks, clearAllOfflineTracks } = useOfflineVault();
  const playTrack = usePlayerStore((s) => s.playTrack);
  const setQueue = usePlayerStore((s) => s.setQueue);

  const [searchQuery, setSearchQuery] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{
    formattedUsed: string;
    quotaFormatted: string;
  }>({
    formattedUsed: 'Calculating...',
    quotaFormatted: 'Unlimited'
  });

  useEffect(() => {
    getOfflineStorageEstimate().then((info) => {
      setStorageInfo({
        formattedUsed: info.formattedUsed,
        quotaFormatted: info.quotaFormatted
      });
    });
  }, [offlineTracks.length]);

  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return offlineTracks;
    const q = searchQuery.toLowerCase().trim();
    return offlineTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        (t.album && t.album.toLowerCase().includes(q))
    );
  }, [offlineTracks, searchQuery]);

  const totalDuration = useMemo(() => {
    return offlineTracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  }, [offlineTracks]);

  const handlePlayAll = (shuffle = false) => {
    if (offlineTracks.length === 0) return;
    let list = [...offlineTracks];
    if (shuffle) {
      list = list.sort(() => Math.random() - 0.5);
    }
    setQueue(list);
    playTrack(list[0], list, 0);
  };

  const handleConfirmClear = async () => {
    setIsClearing(true);
    await clearAllOfflineTracks();
    setIsClearing(false);
    setShowClearConfirm(false);
  };

  return (
    <div className="pb-24 pt-2 text-white min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Offline Music Vault</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[11px] font-black text-emerald-300 uppercase tracking-wider">
              100% Offline
            </span>
          </div>
          <p className="text-xs text-white/50 mt-1.5">
            Full 320kbps audio cached directly on your device. Zero internet, 0ms buffer delay.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <GlassButton size="sm" onClick={() => navigate('/library')}>
            ← Library
          </GlassButton>
          {offlineTracks.length > 0 && (
            <>
              <GlassButton
                variant="primary"
                size="sm"
                onClick={() => handlePlayAll(false)}
                className="gap-2"
              >
                <span>▶ Play All</span>
              </GlassButton>
              <GlassButton size="sm" onClick={() => handlePlayAll(true)}>
                🔀 Shuffle
              </GlassButton>
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="px-3 py-1.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold transition cursor-pointer"
                title="Free up device storage"
              >
                Purge Storage
              </button>
            </>
          )}
        </div>
      </div>

      {/* Storage & Stats Dashboard Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <GlassCard variant="liquid" padding="md" className="border border-emerald-500/20">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-xl">
              ⚡
            </div>
            <div>
              <p className="text-xs text-white/50 font-medium">Downloaded Songs</p>
              <p className="text-xl font-black text-white">{offlineTracks.length} Tracks</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard variant="liquid" padding="md" className="border border-cyan-500/20">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-xl">
              💾
            </div>
            <div>
              <p className="text-xs text-white/50 font-medium">Device Storage Used</p>
              <p className="text-xl font-black text-white">{storageInfo.formattedUsed}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard variant="liquid" padding="md" className="border border-purple-500/20">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-xl">
              ⏱
            </div>
            <div>
              <p className="text-xs text-white/50 font-medium">Total Offline Audio</p>
              <p className="text-xl font-black text-white">{formatTime(totalDuration)}</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Search / Filter Bar */}
      {offlineTracks.length > 0 && (
        <div className="relative mb-6">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter downloaded tracks by title, artist, or album..."
            className="w-full px-4 py-3 pl-11 rounded-2xl bg-white/[0.05] border border-white/10 text-white placeholder-white/40 text-sm outline-none focus:border-emerald-500/50 transition backdrop-blur-xl"
          />
          <svg
            className="w-5 h-5 absolute left-3.5 top-3.5 text-white/40 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-3.5 text-white/40 hover:text-white text-xs cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Main Track List or Empty State */}
      {offlineTracks.length === 0 ? (
        <GlassCard variant="liquid" padding="lg" className="text-center py-16 border border-white/10">
          <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5 text-4xl shadow-xl">
            ⚡
          </div>
          <h2 className="text-2xl font-black text-white mb-2">No Offline Tracks Yet</h2>
          <p className="text-sm text-white/60 max-w-md mx-auto mb-6 leading-relaxed">
            Download your favorite tracks or entire playlists to keep the music playing even when you have no cellular signal, Wi-Fi, or are on a flight.
          </p>
          <div className="flex justify-center gap-3">
            <GlassButton variant="primary" onClick={() => navigate('/')}>
              Explore Music
            </GlassButton>
            <GlassButton onClick={() => navigate('/library')}>
              Go to Playlists
            </GlassButton>
          </div>
        </GlassCard>
      ) : filteredTracks.length === 0 ? (
        <div className="text-center py-12 text-white/50 text-sm">
          No downloaded tracks match &ldquo;{searchQuery}&rdquo;.
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredTracks.map((track, idx) => (
            <TrackRow
              key={track.id}
              track={track}
              tracks={filteredTracks}
              index={idx + 1}
            />
          ))}
        </div>
      )}

      {/* Clear Storage Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="max-w-md w-full p-6 rounded-3xl bg-[#0b0b14] border border-white/15 text-white shadow-2xl space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-xl mx-auto">
                🗑
              </div>
              <h3 className="text-lg font-extrabold text-center">Purge Offline Audio Vault?</h3>
              <p className="text-xs text-white/60 text-center leading-relaxed">
                This will delete all {offlineTracks.length} downloaded audio files from your device storage. Your liked songs and custom playlists will NOT be deleted.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  disabled={isClearing}
                  className="flex-1 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClear}
                  disabled={isClearing}
                  className="flex-1 py-2.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer disabled:opacity-60"
                >
                  {isClearing ? 'Purging...' : 'Delete All Audio'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
