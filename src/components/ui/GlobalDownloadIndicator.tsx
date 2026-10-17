import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDownloadStore } from '../../stores/downloadStore';
import { isTrackOffline } from '../../services/offlineVault';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

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

  const isFinished = Boolean(activeJob && !activeJob.isDownloading);
  const isCancelled = Boolean(activeJob?.isCancelled);

  // Auto-close and dismiss indicator 2.5 seconds after download completes
  useEffect(() => {
    if (isFinished && !isCancelled) {
      const timer = setTimeout(() => {
        setExpanded(false);
        setDrawerOpen(false);
        dismissActiveJob();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [isFinished, isCancelled, dismissActiveJob, setDrawerOpen]);

  if (!activeJob) return null;

  const total = Math.max(1, activeJob.total);
  const completed = Math.min(total, activeJob.completed);
  const rawPercent = Math.round((completed / total) * 100);
  
  // When finished without cancellation, ensure 100% full completion
  const percent = isFinished && !isCancelled ? 100 : Math.min(99, rawPercent);

  // SVG circular ring geometry
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  // Offset reaches 0 at 100% or when finished
  const strokeDashoffset = isFinished && !isCancelled
    ? 0
    : Math.max(0, circumference - (percent / 100) * circumference);

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
            className="pointer-events-auto mb-3 w-[340px] sm:w-[380px] max-w-full rounded-3xl liquid-glass border border-white/10 p-4 shadow-[0_24px_64px_rgba(0,0,0,0.85),inset_0_1px_1px_rgba(255,255,255,0.15)] text-white overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 ${
                  isFinished ? 'glass-button-emerald text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.35)]' : 'bg-cyan-500/15 text-cyan-300'
                }`}>
                  {isFinished ? '✓' : '⚡'}
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-black truncate">{activeJob.name}</h4>
                  <p className="text-[10px] text-white/50">
                    {isFinished
                      ? `All ${completed} songs saved offline`
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
                    triggerAndroidHaptic('light');
                    setExpanded(false);
                    setDrawerOpen(false);
                  }}
                  className="w-7 h-7 rounded-full glass-button flex items-center justify-center text-white/70 hover:text-white text-xs cursor-pointer transition active:scale-95"
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
                        ? 'bg-cyan-500/20 border border-cyan-400/25 text-cyan-100 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                        : isSaved
                        ? 'bg-white/[0.04] text-white/80'
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
            <div className="pt-2 border-0 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerAndroidHaptic('light');
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
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        if (activeJob.isPaused) resumeBatchDownload();
                        else pauseBatchDownload();
                      }}
                      className="px-3 py-1 rounded-full glass-button text-[11px] font-bold text-white transition cursor-pointer active:scale-95"
                    >
                      {activeJob.isPaused ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        cancelBatchDownload();
                      }}
                      className="px-3 py-1 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[11px] font-bold transition cursor-pointer active:scale-95"
                    >
                      Cancel
                    </button>
                  </>
                )}
                {isFinished && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      dismissActiveJob();
                    }}
                    className="px-3 py-1 rounded-full glass-button text-[11px] font-bold text-white transition cursor-pointer active:scale-95"
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
        className="pointer-events-auto flex items-center gap-3 px-3.5 py-2.5 rounded-2xl liquid-glass border border-white/10 shadow-[0_16px_40px_rgba(0,0,0,0.65),0_0_20px_rgba(6,182,212,0.18),inset_0_1px_1px_rgba(255,255,255,0.2)] transition-all cursor-pointer group hover:bg-white/[0.12] active:scale-[0.98]"
        onClick={() => {
          triggerAndroidHaptic('light');
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
                triggerAndroidHaptic('light');
                dismissActiveJob();
              }}
              className="w-6 h-6 rounded-full glass-button flex items-center justify-center text-white/70 hover:text-white text-xs cursor-pointer transition active:scale-90"
              title="Dismiss"
            >
              ✕
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerAndroidHaptic('light');
                if (activeJob.isPaused) resumeBatchDownload();
                else pauseBatchDownload();
              }}
              className="w-6 h-6 rounded-full glass-button flex items-center justify-center text-white/80 hover:text-white text-[10px] cursor-pointer transition active:scale-90"
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
