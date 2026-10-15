import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useFeedbackStore, type FeedbackType } from '../../stores/feedbackStore';
import { usePlayerStore } from '../../stores/playerStore';
import { getActiveEngine } from '../../services/audioEngine';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

const CATEGORIES: Record<FeedbackType, string[]> = {
  bug: [
    'Audio Playback / Stuttering',
    'Background Play (Screen Locked)',
    'UI Glitch / Layout Overlap',
    'Lyrics Display / WaveSync',
    'Search & Playlists',
    'Mobile APK / Android App',
    'Windows Desktop App (.exe)',
    'Crash or Performance'
  ],
  feature: [
    'New Audio FX / DSP Presets',
    '3D Visualizer Modes',
    'AI DJ / Playlist Generator',
    'UI Customization & Themes',
    'Social / Jam Rooms',
    'Lyrics & WaveCards',
    'Desktop / Mobile Shortcuts',
    'Other Feature Idea'
  ],
  general: [
    'Overall App Experience',
    'Sound Quality (320kbps)',
    'Design & Liquid Glass UI',
    'App Speed & Smoothness',
    'Other Thoughts'
  ]
};

export default function FeedbackModal() {
  const { isOpen, initialType, initialCategory, closeFeedback } = useFeedbackStore();
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  const [type, setType] = useState<FeedbackType>(initialType || 'bug');
  const [category, setCategory] = useState<string>('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number>(5);
  const [email, setEmail] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showDiagnosticsDetail, setShowDiagnosticsDetail] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setType(initialType || 'bug');
      setCategory(initialCategory || CATEGORIES[initialType || 'bug'][0]);
      setIsSuccess(false);
      setIsSubmitting(false);
    }
  }, [isOpen, initialType, initialCategory]);

  useEffect(() => {
    if (CATEGORIES[type] && !CATEGORIES[type].includes(category)) {
      setCategory(CATEGORIES[type][0]);
    }
  }, [type]);

  if (!isOpen) return null;

  // Diagnostics payload
  const diagnostics = {
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
    platform: typeof navigator !== 'undefined' ? (navigator as any).userAgentData?.platform || navigator.platform || 'Unknown' : 'Unknown',
    appVersion: 'v5.0.0',
    viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'Unknown',
    audioEngine: getActiveEngine(),
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    currentTrack: currentTrack ? `${currentTrack.title} — ${currentTrack.artist} (ID: ${currentTrack.id})` : 'None',
    url: typeof window !== 'undefined' ? window.location.href : ''
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() && !title.trim()) return;

    setIsSubmitting(true);
    triggerAndroidHaptic('medium');

    const payload = {
      type,
      category,
      title: title.trim() || `${type.toUpperCase()}: ${category}`,
      message: message.trim(),
      rating,
      email: email.trim(),
      diagnostics: includeDiagnostics ? diagnostics : {},
      submittedAt: new Date().toISOString()
    };

    try {
      // 1. Submit to API gateway
      const res = await fetch('/api/music?action=feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await res.json().catch(() => ({}));

      // 2. Persist locally to user's feedback vault
      try {
        const existing = JSON.parse(localStorage.getItem('wavecraft_user_feedback_v1') || '[]');
        existing.unshift(payload);
        localStorage.setItem('wavecraft_user_feedback_v1', JSON.stringify(existing.slice(0, 30)));
      } catch {}

      setIsSuccess(true);
      triggerAndroidHaptic('medium');
      setTimeout(() => {
        closeFeedback();
      }, 2400);
    } catch {
      // Offline fallback: save locally and acknowledge
      try {
        const existing = JSON.parse(localStorage.getItem('wavecraft_user_feedback_v1') || '[]');
        existing.unshift(payload);
        localStorage.setItem('wavecraft_user_feedback_v1', JSON.stringify(existing.slice(0, 30)));
      } catch {}

      setIsSuccess(true);
      setTimeout(() => {
        closeFeedback();
      }, 2400);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to construct pre-filled GitHub Issue URL
  const constructGitHubIssueUrl = () => {
    const issueTitle = encodeURIComponent(`[${type.toUpperCase()}] ${title.trim() || category}`);
    const issueBody = encodeURIComponent(
      `### Issue Type: ${type.toUpperCase()}\n` +
      `**Category**: ${category}\n\n` +
      `### Description\n${message.trim() || 'No description provided.'}\n\n` +
      (includeDiagnostics
        ? `### System Diagnostics\n` +
          `- **App Version**: ${diagnostics.appVersion}\n` +
          `- **Platform**: ${diagnostics.platform}\n` +
          `- **User Agent**: ${diagnostics.userAgent}\n` +
          `- **Viewport**: ${diagnostics.viewport}\n` +
          `- **Audio Engine**: ${diagnostics.audioEngine}\n` +
          `- **Current Song**: ${diagnostics.currentTrack}\n`
        : '')
    );
    return `https://github.com/Pradeep28012010/WaveCraft/issues/new?title=${issueTitle}&body=${issueBody}`;
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={closeFeedback}
        className="fixed inset-0 bg-black/80 backdrop-blur-xl"
      />

      {/* Modal Dialog */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 15 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="relative z-10 w-full max-w-xl rounded-3xl bg-[#090a12]/95 backdrop-blur-3xl border-0 shadow-[0_24px_70px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col my-auto max-h-[92vh]"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 pb-4 border-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-purple-600 flex items-center justify-center text-white text-lg shadow-md flex-shrink-0">
              {type === 'bug' ? '🐛' : type === 'feature' ? '💡' : '💬'}
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                {type === 'bug' ? 'Report a Bug' : type === 'feature' ? 'Suggest a Feature' : 'Feedback & Suggestions'}
              </h2>
              <p className="text-xs text-white/50">
                Help us make WaveCraft the best music platform in the world.
              </p>
            </div>
          </div>
          <button
            onClick={closeFeedback}
            className="w-8 h-8 rounded-full glass-button flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Success View */}
        {isSuccess ? (
          <div className="p-8 sm:p-12 text-center space-y-4 my-auto">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-0 text-emerald-400 mx-auto flex items-center justify-center text-3xl shadow-[0_0_30px_rgba(16,185,129,0.35)] animate-bounce">
              ✓
            </div>
            <h3 className="text-2xl font-black text-white">Thank You!</h3>
            <p className="text-sm text-white/70 max-w-md mx-auto leading-relaxed">
              Your feedback has been logged. Every suggestion and bug report directly drives future updates for WaveCraft!
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 overflow-y-auto no-scrollbar">
            {/* Feedback Type Tabs */}
            <div className="grid grid-cols-3 gap-2 p-1 rounded-2xl bg-white/[0.05] border-0">
              {[
                { id: 'bug' as FeedbackType, label: 'Report Bug', icon: '🐛' },
                { id: 'feature' as FeedbackType, label: 'Suggest Idea', icon: '💡' },
                { id: 'general' as FeedbackType, label: 'Feedback', icon: '⭐' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    triggerAndroidHaptic('light');
                    setType(tab.id);
                  }}
                  className={`py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    type === tab.id
                      ? 'bg-gradient-to-r from-[var(--color-accent)] to-purple-600 text-white shadow-[0_4px_16px_rgba(250,45,72,0.3)]'
                      : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span className="truncate">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Category Pill Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/70">Category</label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES[type].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      triggerAndroidHaptic('light');
                      setCategory(cat);
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      category === cat
                        ? 'bg-white/20 text-white border-0 shadow-sm'
                        : 'bg-white/[0.04] text-white/60 hover:text-white hover:bg-white/[0.08] border-0'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Star Rating for general feedback */}
            {type === 'general' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white/70">Your Rating</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className={`text-2xl transition-transform active:scale-125 cursor-pointer ${
                        star <= rating ? 'text-amber-400' : 'text-white/20'
                      }`}
                    >
                      ★
                    </button>
                  ))}
                  <span className="text-xs text-white/50 ml-2">
                    {rating === 5 ? 'Exceptional! 🌟' : rating === 4 ? 'Great 👍' : rating === 3 ? 'Good 🙂' : 'Needs work 🛠️'}
                  </span>
                </div>
              </div>
            )}

            {/* Title / Summary */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/70">
                {type === 'bug' ? 'Bug Summary' : type === 'feature' ? 'Feature Title' : 'Title'}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  type === 'bug'
                    ? 'e.g., Background playback stops when phone is locked'
                    : type === 'feature'
                    ? 'e.g., Add Spotify/Apple Music playlist sync'
                    : 'e.g., Love the 320kbps audio engine and liquid glass UI'
                }
                className="w-full h-11 rounded-xl bg-white/[0.06] border-0 px-3.5 text-xs text-white placeholder-white/35 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] focus:bg-white/[0.09] transition-all"
              />
            </div>

            {/* Detailed Description */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-white/70">
                  {type === 'bug' ? 'Steps to Reproduce & Details' : 'Description'}
                </label>
                <span className="text-[10px] text-white/40">{message.length}/1000</span>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
                rows={3}
                placeholder={
                  type === 'bug'
                    ? 'What happened? What were you doing when the bug occurred?'
                    : type === 'feature'
                    ? 'How should this feature work? Why would it be helpful?'
                    : 'Share any thoughts, ideas, or feedback...'
                }
                className="w-full rounded-xl bg-white/[0.06] border-0 p-3 text-xs text-white placeholder-white/35 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] focus:bg-white/[0.09] transition-all resize-none"
              />
            </div>

            {/* Email (Optional) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white/70">
                Your Email or Handle <span className="text-white/40 font-normal">(Optional, if you want a reply)</span>
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com or @username"
                className="w-full h-10 rounded-xl bg-white/[0.06] border-0 px-3.5 text-xs text-white placeholder-white/35 focus:outline-none focus:ring-1 focus:ring-white/30 transition-all"
              />
            </div>

            {/* Diagnostics Auto-Attach Box */}
            <div className="rounded-xl bg-white/[0.03] border-0 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-white/80 font-medium">
                  <input
                    type="checkbox"
                    checked={includeDiagnostics}
                    onChange={(e) => setIncludeDiagnostics(e.target.checked)}
                    className="w-4 h-4 rounded accent-[var(--color-accent)] cursor-pointer"
                  />
                  <span>Attach system diagnostics ({diagnostics.platform}, {diagnostics.appVersion})</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowDiagnosticsDetail(!showDiagnosticsDetail)}
                  className="text-[11px] text-white/45 hover:text-white transition-colors cursor-pointer"
                >
                  {showDiagnosticsDetail ? 'Hide Info' : 'View Info'}
                </button>
              </div>

              {showDiagnosticsDetail && includeDiagnostics && (
                <div className="text-[10px] font-mono text-white/50 bg-black/40 p-2.5 rounded-lg border-0 space-y-0.5 max-h-28 overflow-y-auto">
                  <p>• Platform: {diagnostics.platform}</p>
                  <p>• Version: {diagnostics.appVersion}</p>
                  <p>• Resolution: {diagnostics.viewport}</p>
                  <p>• Audio Engine: {diagnostics.audioEngine}</p>
                  <p>• Current Track: {diagnostics.currentTrack}</p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-1">
              <button
                type="submit"
                disabled={isSubmitting || (!message.trim() && !title.trim())}
                className="w-full h-12 rounded-2xl glass-button-primary text-white font-black text-sm flex items-center justify-center gap-2 shadow-[0_8px_24px_rgba(250,45,72,0.35)] active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isSubmitting ? (
                  <span>Sending...</span>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>Submit {type === 'bug' ? 'Bug Report' : type === 'feature' ? 'Suggestion' : 'Feedback'}</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-2">
                <a
                  href={constructGitHubIssueUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 h-9 rounded-xl glass-button text-white/70 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Open as GitHub Issue with diagnostics pre-filled"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  <span>Open GitHub Issue</span>
                </a>

                <a
                  href={`mailto:feedback@wavecraft.app?subject=${encodeURIComponent(`[WaveCraft Feedback] ${type}: ${title || category}`)}&body=${encodeURIComponent(`${message}\n\n${includeDiagnostics ? JSON.stringify(diagnostics, null, 2) : ''}`)}`}
                  className="h-9 px-3 rounded-xl glass-button text-white/70 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Send via Email"
                >
                  <span>✉️ Email</span>
                </a>
              </div>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
