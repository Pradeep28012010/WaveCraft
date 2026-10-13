import { useState } from 'react';
import { motion } from 'framer-motion';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export default function DownloadPage() {
  const { isInstalled, canInstall, triggerInstall } = usePWAInstall();
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const apkDirectUrl = '/WaveCraft.apk';
  const apkGithubUrl = 'https://github.com/Pradeep28012010/WaveCraft/releases/latest/download/WaveCraft.apk';
  const exeGithubUrl = 'https://github.com/Pradeep28012010/WaveCraft/releases/latest/download/WaveCraft-Pro-Setup.exe';
  const releasesPageUrl = 'https://github.com/Pradeep28012010/WaveCraft/releases';

  const fullApkUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/WaveCraft.apk`
    : 'https://wavecraft-alpha.vercel.app/WaveCraft.apk';

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(fullApkUrl)}`;

  const copyToClipboard = (url: string, key: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopiedLink(key);
        setTimeout(() => setCopiedLink(null), 2500);
      });
    }
  };

  return (
    <div className="min-h-full py-8 px-4 sm:px-8 lg:px-12 max-w-6xl mx-auto space-y-12">
      {/* Hero Header */}
      <div className="text-center space-y-4 pt-4">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full liquid-glass border border-white/20 text-xs font-black tracking-wider uppercase text-white shadow-[0_0_20px_rgba(250,45,72,0.3)]"
        >
          <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
          <span>WaveCraft Pro v5.0 Official Releases</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="text-3xl sm:text-5xl font-black tracking-tight text-white"
        >
          Studio Sound on Every Device
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-sm sm:text-base text-white/60 max-w-2xl mx-auto"
        >
          Get the native apps for Windows and Android with background playback, offline caching, and 320kbps audiophile acoustics — or install directly from your browser.
        </motion.p>
      </div>

      {/* Main Download Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
        {/* Android Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="relative rounded-3xl p-6 sm:p-8 bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-2xl border border-white/15 shadow-[0_16px_48px_rgba(0,0,0,0.5)] flex flex-col justify-between overflow-hidden group hover:border-emerald-500/40 transition-all"
        >
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/25 transition-all" />

          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0 shadow-[0_8px_20px_rgba(16,185,129,0.25)]">
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-1.0001s.4482-.9993.9993-.9993c.551 0 .9993.4478.9993.9993s-.4483 1.0001-.9993 1.0001m-11.046 0c-.5511 0-.9993-.4486-.9993-1.0001s.4482-.9993.9993-.9993c.5511 0 .9993.4478.9993.9993s-.4482 1.0001-.9993 1.0001m11.4045-6.02l1.996-3.4572c.119-.2061.048-.4707-.1581-.5898-.2061-.119-.4707-.048-.5898.1581l-2.0226 3.5034C15.6022 8.3592 13.8568 8 12 8s-3.6022.3592-5.107 1.036l-2.0226-3.5034c-.1191-.2061-.3837-.2771-.5898-.1581-.2061.1191-.2771.3837-.1581.5898l1.996 3.4572C2.6889 11.2867.3432 15.1543 0 19.882h24c-.3432-4.7277-2.6889-8.5953-6.1185-10.5606" />
                </svg>
              </div>
              <div className="text-right">
                <span className="inline-block px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-black uppercase tracking-wider">
                  Android APK
                </span>
                <p className="text-white/40 text-xs mt-1">~5.0 MB • Android 8.0+</p>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-black text-white">WaveCraft for Android</h2>
              <p className="text-sm text-white/70 mt-2 leading-relaxed">
                Full native background audio engine, zero-stutter screen-off playback, system lock-screen media controls, and instant offline music downloads.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <a
                href={apkDirectUrl}
                download="WaveCraft.apk"
                className="w-full h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-sm flex items-center justify-center gap-2.5 transition-all shadow-[0_8px_24px_rgba(16,185,129,0.35)] active:scale-[0.98] cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Download APK (Direct Fast Link)</span>
              </a>

              <div className="flex items-center gap-2">
                <a
                  href={apkGithubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 h-10 rounded-xl glass-button text-white/80 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  <span>GitHub Mirror</span>
                </a>

                <button
                  onClick={() => copyToClipboard(fullApkUrl, 'apk')}
                  className="h-10 px-3.5 rounded-xl glass-button text-white/80 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Copy direct APK link to share with friends"
                >
                  <span>{copiedLink === 'apk' ? '✓ Copied' : '🔗 Copy Link'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="mt-6 pt-6 border-t border-white/10 flex items-center gap-4">
            <div className="w-20 h-20 bg-white rounded-xl p-1.5 flex-shrink-0 shadow-lg">
              <img
                src={qrCodeUrl}
                alt="Scan to Download WaveCraft APK"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="text-xs text-white/60 space-y-1">
              <p className="font-bold text-white/90">Scan with phone camera</p>
              <p>Point your Android phone camera at this QR code to download the APK directly to your phone.</p>
            </div>
          </div>
        </motion.div>

        {/* Windows Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative rounded-3xl p-6 sm:p-8 bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-2xl border border-white/15 shadow-[0_16px_48px_rgba(0,0,0,0.5)] flex flex-col justify-between overflow-hidden group hover:border-blue-500/40 transition-all"
        >
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/15 rounded-full blur-3xl pointer-events-none group-hover:bg-blue-500/25 transition-all" />

          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 flex-shrink-0 shadow-[0_8px_20px_rgba(59,130,246,0.25)]">
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.551H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-13.051-1.802" />
                </svg>
              </div>
              <div className="text-right">
                <span className="inline-block px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[11px] font-black uppercase tracking-wider">
                  Windows 10 / 11
                </span>
                <p className="text-white/40 text-xs mt-1">~126 MB • 64-bit EXE</p>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-black text-white">WaveCraft Pro for Windows</h2>
              <p className="text-sm text-white/70 mt-2 leading-relaxed">
                Dedicated desktop audio player with hardware media keys, system tray minimization, custom audio equalizer DSP, and lossless offline library storage.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <a
                href={exeGithubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-12 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white font-extrabold text-sm flex items-center justify-center gap-2.5 transition-all shadow-[0_8px_24px_rgba(59,130,246,0.35)] active:scale-[0.98] cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Download Windows Installer (.exe)</span>
              </a>

              <div className="flex items-center gap-2">
                <a
                  href={releasesPageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 h-10 rounded-xl glass-button text-white/80 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  <span>All Releases & Changelog</span>
                </a>

                <button
                  onClick={() => copyToClipboard(exeGithubUrl, 'exe')}
                  className="h-10 px-3.5 rounded-xl glass-button text-white/80 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Copy direct EXE download link"
                >
                  <span>{copiedLink === 'exe' ? '✓ Copied' : '🔗 Copy Link'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Windows SmartScreen Note */}
          <div className="mt-6 pt-6 border-t border-white/10 flex items-start gap-3 text-xs text-white/50">
            <span className="text-amber-400 text-sm">💡</span>
            <p>
              <strong className="text-white/80">Windows SmartScreen Note:</strong> If Windows shows "Windows protected your PC", click <span className="text-white underline font-semibold">More info</span> &rarr; <span className="text-white underline font-semibold">Run anyway</span>.
            </p>
          </div>
        </motion.div>
      </div>

      {/* Web PWA Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-3xl p-6 sm:p-8 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-transparent backdrop-blur-2xl border border-white/15 flex flex-col sm:flex-row items-center justify-between gap-6"
      >
        <div className="space-y-2 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[10px] font-black uppercase tracking-wider">
            Browser App (PWA)
          </div>
          <h3 className="text-xl font-black text-white">Prefer not to download files?</h3>
          <p className="text-xs sm:text-sm text-white/60 max-w-xl">
            Install WaveCraft as an instant Progressive Web App directly from Chrome, Edge, Safari, macOS, or iOS without downloading installers.
          </p>
        </div>

        <div className="flex-shrink-0">
          {canInstall ? (
            <button
              onClick={triggerInstall}
              className="px-6 h-12 rounded-2xl glass-button-primary text-white font-black text-sm flex items-center gap-2 shadow-[0_8px_24px_rgba(250,45,72,0.35)] active:scale-95 cursor-pointer"
            >
              <span>📲 Install PWA Now</span>
            </button>
          ) : isInstalled ? (
            <div className="px-5 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white/80 text-xs font-bold flex items-center gap-2">
              <span>✓ App Already Installed</span>
            </div>
          ) : (
            <div className="text-xs text-white/60 text-center sm:text-right">
              <p className="font-semibold text-white">Install via Browser Menu</p>
              <p>Tap <strong className="text-white">Share / Menu</strong> &rarr; <strong className="text-white">Add to Home Screen</strong></p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Installation Instructions FAQ */}
      <div className="space-y-6 pt-6">
        <h3 className="text-xl font-black text-white text-center">Frequently Asked Questions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
            <h4 className="font-bold text-white text-sm">How to install the Android APK?</h4>
            <p className="text-white/60 leading-relaxed">
              1. Tap "Download APK".<br />
              2. When Android asks "File might be harmful", tap <strong>Download anyway</strong>.<br />
              3. Open the file and tap <strong>Install</strong>. If prompted, enable "Allow from this source".
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
            <h4 className="font-bold text-white text-sm">How to install on Windows?</h4>
            <p className="text-white/60 leading-relaxed">
              1. Download <code>WaveCraft-Pro-Setup.exe</code>.<br />
              2. Run the installer. A liquid-glass setup window will open.<br />
              3. Click <strong>Install</strong> to launch WaveCraft Pro with desktop hardware media keys.
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
            <h4 className="font-bold text-white text-sm">Is it completely free?</h4>
            <p className="text-white/60 leading-relaxed">
              Yes, 100% free with no subscriptions. All music streams at up to 320kbps with full 10-band equalizer and spatial audio controls.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
