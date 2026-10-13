import { useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUpdateStore } from '../../stores/updateStore';
import { isAndroidNative } from '../../services/nativeAndroid';

export default memo(function UpdateModal() {
  const {
    isModalOpen,
    closeModal,
    status,
    currentVersion,
    latestVersionInfo,
    downloadProgress,
    errorMessage,
    startInstallUpdate,
    retryPendingInstall,
    openPermissionSettings,
    checkForUpdates
  } = useUpdateStore();

  const isNative = isAndroidNative();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen && status !== 'downloading') {
        closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, closeModal, status]);

  if (!isModalOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (status !== 'downloading') closeModal();
          }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="relative w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl bg-[#090a12]/95 border border-white/20 shadow-[0_32px_96px_rgba(0,0,0,0.9)] overflow-hidden z-10"
        >
          {/* Top specular glow header */}
          <div className="relative px-6 pt-6 pb-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[var(--color-accent)] to-purple-600 flex items-center justify-center shadow-lg shadow-[var(--color-accent)]/20">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white">WaveCraft Updates</h2>
                <p className="text-xs text-white/50">
                  {isNative ? 'Native Android Zero-Headache Installer' : 'Web & PWA Platform'}
                </p>
              </div>
            </div>

            {status !== 'downloading' && (
              <button
                type="button"
                onClick={closeModal}
                className="w-8 h-8 rounded-full glass-button flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                ✕
              </button>
            )}
          </div>

          {/* Modal Body */}
          <div className="p-6 space-y-5 overflow-y-auto max-h-[60vh]">
            {/* Status: Checking */}
            {status === 'checking' && (
              <div className="py-8 flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-10 h-10 border-3 border-[var(--color-accent)]/30 border-t-[var(--color-accent)] rounded-full animate-spin" />
                <p className="text-sm font-semibold text-white/80">Checking for latest WaveCraft release...</p>
              </div>
            )}

            {/* Status: Up to date */}
            {status === 'up-to-date' && (
              <div className="py-6 flex flex-col items-center justify-center gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 text-2xl shadow-[0_0_24px_rgba(52,211,153,0.3)]">
                  ✓
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">You're completely up to date!</h3>
                  <p className="text-xs text-white/55 mt-1">
                    WaveCraft Pro v{currentVersion} is running the latest features and acoustic optimizations.
                  </p>
                </div>
              </div>
            )}

            {/* Status: Available */}
            {status === 'available' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-gradient-to-r from-[var(--color-accent)]/15 to-purple-600/15 border border-[var(--color-accent)]/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-accent)]">
                      New Release Ready
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-mono text-white/80">
                      v{latestVersionInfo?.version || '5.0.0'}
                    </span>
                  </div>
                  <h3 className="text-sm font-extrabold text-white mt-1.5">
                    {latestVersionInfo?.title || 'WaveCraft Pro Update'}
                  </h3>
                  <p className="text-xs text-white/60 mt-0.5">
                    Current: v{currentVersion} &rarr; New: v{latestVersionInfo?.version || '5.0.0'}
                  </p>
                </div>

                {latestVersionInfo?.releaseNotes && latestVersionInfo.releaseNotes.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-white/70">What's New:</span>
                    <div className="space-y-1.5 p-3 rounded-2xl bg-white/[0.04] border border-white/10 text-xs text-white/80">
                      {latestVersionInfo.releaseNotes.map((note, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span className="text-[var(--color-accent)] font-bold">•</span>
                          <span className="leading-relaxed">{note}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Status: Downloading */}
            {status === 'downloading' && (
              <div className="py-6 space-y-4 text-center">
                <div className="flex items-center justify-between text-xs font-bold text-white/80 px-1">
                  <span>Downloading WaveCraft APK...</span>
                  <span className="tabular-nums font-mono text-[var(--color-accent)]">{downloadProgress}%</span>
                </div>

                {/* Progress Track */}
                <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden p-0.5 border border-white/15">
                  <motion.div
                    className="h-full bg-gradient-to-r from-[var(--color-accent)] via-purple-500 to-emerald-400 rounded-full shadow-[0_0_12px_rgba(250,45,72,0.6)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${downloadProgress}%` }}
                    transition={{ ease: 'easeOut', duration: 0.2 }}
                  />
                </div>

                <p className="text-[11px] text-white/50 leading-relaxed">
                  Streaming directly to phone memory. Android package installer will trigger automatically on completion — zero file manager searching required.
                </p>
              </div>
            )}

            {/* Status: Installing */}
            {status === 'installing' && (
              <div className="py-6 flex flex-col items-center justify-center gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/40 flex items-center justify-center text-[var(--color-accent)] text-2xl animate-pulse">
                  ⚡
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Launching Android Package Installer...</h3>
                  <p className="text-xs text-white/60 mt-1">
                    Tap "Update" on your Android system prompt to complete the installation.
                  </p>
                </div>
              </div>
            )}

            {/* Status: Permission Needed */}
            {status === 'permission_needed' && (
              <div className="space-y-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
                  <span>⚠️ Android Permission Needed</span>
                </div>
                <p className="text-xs text-white/80 leading-relaxed">
                  Android requires a 1-time permission toggle to allow WaveCraft to install downloaded updates seamlessly.
                </p>
                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="button"
                    onClick={openPermissionSettings}
                    className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-extrabold text-xs shadow-lg transition-transform active:scale-95 cursor-pointer"
                  >
                    1. Tap to Enable "Allow from this source"
                  </button>
                  <button
                    type="button"
                    onClick={retryPendingInstall}
                    className="w-full py-2 px-4 rounded-xl glass-button text-white font-bold text-xs hover:bg-white/15 transition-transform active:scale-95 cursor-pointer"
                  >
                    2. Then Tap Here to Install
                  </button>
                </div>
              </div>
            )}

            {/* Status: Error */}
            {status === 'error' && (
              <div className="space-y-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-center">
                <span className="text-2xl">⚠️</span>
                <h4 className="text-sm font-bold text-rose-300">Update Check Failed</h4>
                <p className="text-xs text-white/70">{errorMessage || 'Unable to download or check update.'}</p>
                <button
                  type="button"
                  onClick={() => checkForUpdates(true)}
                  className="mt-2 py-1.5 px-4 rounded-xl glass-button text-xs font-bold text-white cursor-pointer"
                >
                  Retry Check
                </button>
              </div>
            )}
          </div>

          {/* Modal Footer Controls */}
          <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-end gap-3">
            {status === 'available' && (
              <>
                <button
                  type="button"
                  onClick={closeModal}
                  className="py-2.5 px-4 rounded-xl glass-button text-xs font-bold text-white/70 hover:text-white cursor-pointer"
                >
                  Later
                </button>
                <button
                  type="button"
                  onClick={startInstallUpdate}
                  className="py-2.5 px-5 rounded-xl glass-button-primary text-xs font-extrabold text-white flex items-center gap-2 shadow-[0_0_20px_rgba(250,45,72,0.4)] cursor-pointer active:scale-95 transition-transform"
                >
                  <span>⚡ Install Update Now</span>
                </button>
              </>
            )}

            {(status === 'up-to-date' || status === 'error') && (
              <button
                type="button"
                onClick={closeModal}
                className="py-2 px-5 rounded-xl glass-button text-xs font-bold text-white cursor-pointer"
              >
                Done
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
});
