import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDownloadStore } from '../../stores/downloadStore';
import { isTrackOffline } from '../../services/offlineVault';

export default function GlobalDownloadIndicator() {
  const navigate = useNavigate();
  const {
    activeJob,
    isDrawerOpen,
    pauseBatchDownload,
    resumeBatchDownload,
    cancelBatchDownload,
    dismissActiveJob,
    toggleDrawer,
    setDrawerOpen
  } = useDownloadStore();

  const [expanded, setExpanded] = useState(false);

  if (!activeJob) return null;

  const total = Math.max(1, activeJob.total);
  const completed = Math.min(total, activeJob.completed);
  const percent = Math.round((completed / total) * 100);
  const isFinished = !activeJob.isDownloading;

  // SVG circular ring geometry
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="fixed bottom-24 sm:bottom-28 right-3 sm:right-6 z-40 flex flex-col items-end pointer-events-none select-none max-w-[calc(100vw-24px)]">
      {/* Expanded Details Drawer */}
      <AnimatePresence>
        {(isDrawerOpen || expanded) && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto mb-3 w-[340px] sm:w-[380px] max-w-full rounded-3xl bg-[#0b0c16]/95 border border-white/15 p-4 shadow-2xl backdrop-blur-2xl text-white overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-300 text-sm font-black flex-shrink-0">
                  {isFinished ? '✓' : '⚡'}
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-black truncate">{activeJob.name}</h4>
                  <p className="text-[10px] text-white/50">
                    {isFinished
                      ? `Downloaded ${completed} of ${total} tracks`
                      : activeJob.isPaused
                      ? 'Download paused'
                      : `Downloading (${percent}%) • ${total - completed} left`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(false);
                    setDrawerOpen(false);
                  }}
                  className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/60 hover:text-white text-xs cursor-pointer transition"
                  title="Collapse"
                >
                  ⌄
                </button>
              </div>
            </div>

            {/* Track Queue Peek List */}
            <div className="my-3 max-h-56 overflow-y-auto no-scrollbar space-y-1.5 pr-1">
              {activeJob.tracks.map((t, idx) => {
                const isSaved = isTrackOffline(t.id);
                const isCurrent = activeJob.currentTrackTitle === t.title && activeJob.isDownloading;

                return (
                  <div
                    key={t.id || idx}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-xs transition ${
                      isCurrent
                        ? 'bg-cyan-500/15 border border-cyan-400/30 text-cyan-200'
                        : isSaved
                        ? 'bg-white/[0.03] text-white/70'
                        : 'text-white/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-4 text-[10px] text-white/30 font-mono text-center flex-shrink-0">
                        {idx + 1}
                      </span>
                      <span className="truncate font-medium">{t.title}</span>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0 text-[10px]">
                      {isCurrent ? (
                        <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                      ) : isSaved ? (
                        <span className="text-emerald-400 font-bold">✓ Ready</span>
                      ) : (
                        <span className="text-white/30">Queued</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions */}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  setDrawerOpen(false);
                  navigate('/downloads');
                }}
                className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 transition cursor-pointer flex items-center gap-1"
              >
                <span>Offline Vault →</span>
              </button>

              <div className="flex items-center gap-2">
                {!isFinished && (
                  <>
                    <button
                      type="button"
                      onClick={activeJob.isPaused ? resumeBatchDownload : pauseBatchDownload}
                      className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[11px] font-bold text-white transition cursor-pointer"
                    >
                      {activeJob.isPaused ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelBatchDownload}
                      className="px-2.5 py-1 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[11px] font-bold transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </>
                )}
                {isFinished && (
                  <button
                    type="button"
                    onClick={dismissActiveJob}
                    className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[11px] font-bold text-white transition cursor-pointer"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Mini Pill */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.9 }}
        className="pointer-events-auto flex items-center gap-3 px-3 py-2 rounded-2xl bg-[#0e0f1a]/90 hover:bg-[#121422]/95 border border-cyan-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_16px_rgba(6,182,212,0.15)] backdrop-blur-xl transition-all cursor-pointer group"
        onClick={() => {
          setExpanded((prev) => !prev);
          toggleDrawer();
        }}
      >
        {/* SVG Circular Progress Ring */}
        <div className="relative w-9 h-9 flex items-center justify-center flex-shrink-0">
          <svg className="w-9 h-9 -rotate-90 transform" viewBox="0 0 38 38">
            <circle
              cx="19"
              cy="19"
              r={radius}
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="3.2"
              fill="transparent"
            />
            <circle
              cx="19"
              cy="19"
              r={radius}
              stroke={isFinished ? '#10b981' : activeJob.isPaused ? '#f59e0b' : '#06b6d4'}
              strokeWidth="3.2"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-300 ease-out"
            />
          </svg>

          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white font-mono">
            {isFinished ? '✓' : `${percent}%`}
          </span>
        </div>

        {/* Text Details */}
        <div className="flex flex-col min-w-0 pr-1 max-w-[170px] sm:max-w-[220px]">
          <span className="text-xs font-black text-white truncate leading-tight">
            {isFinished
              ? 'Download Complete'
              : activeJob.isPaused
              ? 'Download Paused'
              : `Downloading ${activeJob.name}`}
          </span>
          <span className="text-[10px] text-white/60 truncate mt-0.5">
            {isFinished
              ? `${completed} songs ready offline`
              : activeJob.currentTrackTitle
              ? activeJob.currentTrackTitle
              : `${completed}/${total} completed`}
          </span>
        </div>

        {/* Action Button inside Pill */}
        <div className="flex items-center gap-1.5 ml-1">
          {isFinished ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismissActiveJob();
              }}
              className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white text-xs cursor-pointer transition"
              title="Dismiss"
            >
              ✕
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (activeJob.isPaused) resumeBatchDownload();
                else pauseBatchDownload();
              }}
              className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white text-[10px] cursor-pointer transition"
              title={activeJob.isPaused ? 'Resume' : 'Pause'}
            >
              {activeJob.isPaused ? '▶' : '⏸'}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
