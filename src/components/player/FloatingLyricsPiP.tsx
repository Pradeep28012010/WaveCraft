import { useState, useEffect, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { usePipStore, type ScriptPreference } from '../../stores/pipStore';
import { getLyricsData, getSavedLyricsOffset, saveLyricsOffset, type LyricsResult } from '../../services/lyrics';
import { romanizeIndicText, containsNonLatinScript } from '../../services/transliterate';
import { SyllableGlowLine } from '../lyrics/SyllableGlowLine';
import { formatTime } from '../../utils/formatTime';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';

interface FloatingLyricsPiPProps {
  inDocumentPiP?: boolean;
  onClose?: () => void;
  onExpandPlayer?: () => void;
}

export const FloatingLyricsPiP = memo(({ inDocumentPiP = false, onClose, onExpandPlayer }: FloatingLyricsPiPProps) => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const seekTo = usePlayerStore((s) => s.seekTo);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const isShuffled = usePlayerStore((s) => s.isShuffled);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);
  const isLiked = useLibraryStore((s) => (currentTrack ? s.isLiked(currentTrack.id) : false));
  const toggleLike = useLibraryStore((s) => s.toggleLike);

  const activeTab = usePipStore((s) => s.activeTab);
  const setActiveTab = usePipStore((s) => s.setActiveTab);
  const isSyllableSweep = usePipStore((s) => s.isSyllableSweep);
  const toggleSyllableSweep = usePipStore((s) => s.toggleSyllableSweep);
  const scriptPreference = usePipStore((s) => s.scriptPreference);
  const setScriptPreference = usePipStore((s) => s.setScriptPreference);
  const closePiP = usePipStore((s) => s.closePiP);

  const [lyricsResult, setLyricsResult] = useState<LyricsResult | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [userOffset, setUserOffset] = useState(0);
  const [showTools, setShowTools] = useState(false);

  const artist = currentTrack?.artist || '';
  const title = currentTrack?.title || '';
  const activeDuration = duration || currentTrack?.duration || 210;

  // Sync user offset
  useEffect(() => {
    if (artist && title) {
      setUserOffset(getSavedLyricsOffset(artist, title));
    }
  }, [artist, title]);

  // Fetch lyrics
  useEffect(() => {
    let mounted = true;
    if (!artist || !title) {
      setLyricsResult(null);
      return;
    }

    setLyricsLoading(true);
    getLyricsData(artist, title, activeDuration)
      .then((data) => {
        if (mounted) setLyricsResult(data);
      })
      .catch(() => {
        if (mounted) setLyricsResult(null);
      })
      .finally(() => {
        if (mounted) setLyricsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [artist, title, activeDuration]);

  // Handle script / transliteration transformation
  const displayLines = useMemo(() => {
    const raw = lyricsResult?.lines || [];
    if (raw.length === 0) return [];

    return raw.map((line) => {
      let text = line.text;
      if (scriptPreference === 'romanized' && containsNonLatinScript(text)) {
        text = romanizeIndicText(text);
      }
      return {
        ...line,
        text
      };
    });
  }, [lyricsResult, scriptPreference]);

  // Active line index calculation
  const activeIndex = useMemo(() => {
    if (displayLines.length === 0) return -1;
    const syncTime = currentTime + userOffset + 0.25;
    let idx = -1;
    for (let i = 0; i < displayLines.length; i++) {
      if (displayLines[i].time >= 0 && syncTime >= displayLines[i].time) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [displayLines, currentTime, userOffset]);

  const activeLine = activeIndex >= 0 ? displayLines[activeIndex] : null;
  const prevLine = activeIndex > 0 ? displayLines[activeIndex - 1] : null;
  const nextLine = activeIndex >= 0 && activeIndex + 1 < displayLines.length ? displayLines[activeIndex + 1] : null;
  const nextNextLine = activeIndex >= 0 && activeIndex + 2 < displayLines.length ? displayLines[activeIndex + 2] : null;

  const nextLineTime = useMemo(() => {
    if (!activeLine) return 0;
    if (activeIndex + 1 < displayLines.length) {
      return displayLines[activeIndex + 1].time;
    }
    return activeLine.time + 4.5;
  }, [activeLine, activeIndex, displayLines]);

  const handleAdjustOffset = (delta: number) => {
    const next = Math.round((userOffset + delta) * 10) / 10;
    const clamped = Math.max(-30, Math.min(30, next));
    setUserOffset(clamped);
    saveLyricsOffset(artist, title, clamped);
  };

  const handleCycleScript = () => {
    const sequence: ScriptPreference[] = ['auto', 'romanized', 'native'];
    const next = sequence[(sequence.indexOf(scriptPreference) + 1) % sequence.length];
    setScriptPreference(next);
  };

  const handleClose = () => {
    if (onClose) onClose();
    else closePiP();
  };

  const progressPct = Math.min(100, Math.max(0, (currentTime / (activeDuration || 1)) * 100));

  // Outer container styling: full window if Document PiP, floating card if in-app
  const containerClasses = inDocumentPiP
    ? 'w-full h-full min-h-[460px] flex flex-col bg-[#06060c] text-white select-none overflow-hidden font-sans'
    : 'fixed z-[99999] bottom-24 right-4 sm:right-6 w-[340px] sm:w-[380px] h-[480px] max-h-[85vh] rounded-3xl liquid-glass border border-white/20 shadow-[0_24px_64px_rgba(0,0,0,0.85)] flex flex-col select-none overflow-hidden text-white backdrop-blur-2xl';

  const wrapperProps = inDocumentPiP
    ? {}
    : {
        drag: true,
        dragMomentum: false,
        dragConstraints: { left: -window.innerWidth + 360, right: 0, top: -window.innerHeight + 500, bottom: 0 },
        initial: { opacity: 0, scale: 0.92, y: 20 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.92, y: 20 },
        transition: { type: 'spring', stiffness: 350, damping: 30 }
      };

  const MotionDiv = inDocumentPiP ? 'div' : motion.div;

  if (!currentTrack) {
    return (
      <div className={containerClasses}>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-white/50">
          <span className="text-3xl mb-2">🎵</span>
          <p className="text-sm font-semibold">No track currently playing</p>
          <button
            onClick={handleClose}
            className="mt-4 px-3 py-1 rounded-full glass-button text-xs text-white/80"
          >
            Close PiP
          </button>
        </div>
      </div>
    );
  }

  return (
    // @ts-ignore
    <MotionDiv {...wrapperProps} className={containerClasses}>
      {/* Dynamic Ambient Glow Layer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-35 z-0">
        <div
          className="absolute -top-1/4 -right-1/4 w-72 h-72 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--color-accent, #f43f5e) 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-1/4 -left-1/4 w-72 h-72 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }}
        />
      </div>

      {/* PiP Header Bar */}
      <div className="relative z-10 px-3.5 py-2.5 flex items-center justify-between border-b border-white/10 bg-white/[0.04] backdrop-blur-xl flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0 pr-2">
          {/* Animated Equalizer Waves */}
          <div className="flex items-end gap-0.5 h-3.5 w-3.5 flex-shrink-0">
            <span className={`w-1 rounded-full bg-[var(--color-accent,#f43f5e)] ${isPlaying ? 'animate-pulse h-3' : 'h-1.5'}`} />
            <span className={`w-1 rounded-full bg-[var(--color-accent,#f43f5e)] ${isPlaying ? 'animate-pulse h-2 [animation-delay:150ms]' : 'h-2'}`} />
            <span className={`w-1 rounded-full bg-[var(--color-accent,#f43f5e)] ${isPlaying ? 'animate-pulse h-3.5 [animation-delay:300ms]' : 'h-1'}`} />
          </div>

          <div className="min-w-0">
            <h4 className="text-xs font-black text-white truncate leading-tight">
              {currentTrack.title}
            </h4>
            <p className="text-[10px] text-white/60 truncate leading-tight">
              {currentTrack.artist}
            </p>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Mode Pill: Lyrics vs Player Deck */}
          <div className="flex items-center p-0.5 rounded-full bg-white/10 border border-white/10 text-[10px] font-bold">
            <button
              onClick={() => setActiveTab('lyrics')}
              className={`px-2 py-0.5 rounded-full transition-all cursor-pointer ${
                activeTab === 'lyrics' ? 'glass-button-primary text-white shadow-sm' : 'text-white/60 hover:text-white'
              }`}
            >
              Lyrics
            </button>
            <button
              onClick={() => setActiveTab('player')}
              className={`px-2 py-0.5 rounded-full transition-all cursor-pointer ${
                activeTab === 'player' ? 'glass-button-primary text-white shadow-sm' : 'text-white/60 hover:text-white'
              }`}
            >
              Deck
            </button>
          </div>

          {/* Quick Script Toggle */}
          <button
            onClick={handleCycleScript}
            title={`Script: ${scriptPreference.toUpperCase()} (Click to toggle Romanized / Native)`}
            className={`px-2 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer ${
              scriptPreference === 'romanized'
                ? 'glass-button-primary text-white'
                : scriptPreference === 'native'
                ? 'glass-button-emerald text-emerald-200'
                : 'glass-button text-white/70'
            }`}
          >
            {scriptPreference === 'romanized' ? '🔤 Rom' : scriptPreference === 'native' ? '🌐 Nat' : 'Auto'}
          </button>

          {/* Karaoke Syllable Sweep Toggle */}
          <button
            onClick={toggleSyllableSweep}
            title={isSyllableSweep ? 'Karaoke Syllable Glow: ON' : 'Line Highlight Only'}
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all cursor-pointer ${
              isSyllableSweep ? 'glass-button-primary text-white shadow-sm' : 'glass-button text-white/50'
            }`}
          >
            ✨
          </button>

          {/* Tools Toggle (Offset adjustment) */}
          <button
            onClick={() => setShowTools(!showTools)}
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all cursor-pointer ${
              showTools || userOffset !== 0 ? 'glass-button-amber text-amber-200' : 'glass-button text-white/60'
            }`}
            title="Timing Calibration"
          >
            ⏱️
          </button>

          {/* Expand to Full Player (if in-app) */}
          {onExpandPlayer && (
            <button
              onClick={onExpandPlayer}
              className="w-7 h-7 rounded-full flex items-center justify-center glass-button text-white/75 hover:text-white transition-all cursor-pointer"
              title="Expand Fullscreen"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          )}

          {/* Close PiP */}
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-full flex items-center justify-center glass-button hover:bg-rose-500/30 text-white/80 hover:text-white transition-all cursor-pointer text-xs"
            title="Close Picture-in-Picture"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Timing Calibration Drawer */}
      <AnimatePresence>
        {showTools && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-black/70 border-b border-white/10 px-3.5 py-2 flex items-center justify-between text-xs flex-shrink-0 z-20"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold text-white/50">Offset:</span>
              <span className={`font-mono text-[11px] font-bold px-1.5 py-0.2 rounded ${userOffset !== 0 ? 'text-amber-300 bg-amber-500/20' : 'text-white/70'}`}>
                {userOffset > 0 ? `+${userOffset.toFixed(1)}s` : `${userOffset.toFixed(1)}s`}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleAdjustOffset(-0.5)}
                className="px-2 py-0.5 rounded glass-button text-[10px] font-bold text-white/80"
              >
                -0.5s
              </button>
              <button
                onClick={() => {
                  setUserOffset(0);
                  saveLyricsOffset(artist, title, 0);
                }}
                className="px-2 py-0.5 rounded glass-button text-[10px] font-bold text-white/60"
              >
                Reset
              </button>
              <button
                onClick={() => handleAdjustOffset(0.5)}
                className="px-2 py-0.5 rounded glass-button text-[10px] font-bold text-white/80"
              >
                +0.5s
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main PiP Content Area */}
      <div className="relative z-10 flex-1 flex flex-col justify-center items-center px-4 py-3 overflow-hidden text-center">
        {activeTab === 'lyrics' ? (
          lyricsLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 text-white/50">
              <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              <span className="text-xs font-semibold">Loading live lyrics...</span>
            </div>
          ) : displayLines.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 text-white/50">
              <span className="text-2xl">🎙️</span>
              <p className="text-xs font-medium">Instrumental or lyrics unavailable</p>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center justify-center space-y-3.5 my-auto">
              {/* Previous Line */}
              {prevLine && (
                <p
                  onClick={() => seekTo(prevLine.time)}
                  className="text-xs sm:text-sm font-semibold text-white/30 truncate max-w-full cursor-pointer hover:text-white/60 transition-colors"
                >
                  {prevLine.text}
                </p>
              )}

              {/* ACTIVE LINE WITH APPLE MUSIC SYLLABLE GLOW SWEEP */}
              {activeLine ? (
                <div className="w-full px-2 py-2 rounded-2xl bg-white/[0.06] border border-white/10 shadow-lg cursor-pointer">
                  {isSyllableSweep ? (
                    <SyllableGlowLine
                      line={activeLine}
                      nextLineTime={nextLineTime}
                      userOffset={userOffset}
                      isCurrent={true}
                      onSelectWord={(t) => seekTo(t)}
                      fontSizeClass="text-lg sm:text-2xl"
                      className="justify-center text-center"
                    />
                  ) : (
                    <p className="text-lg sm:text-2xl font-black text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.7)] leading-snug">
                      {activeLine.text}
                    </p>
                  )}
                </div>
              ) : (
                <div className="py-2 text-sm text-white/40 italic">
                  ♪ Musical Intro ♪
                </div>
              )}

              {/* Next Line (Anticipation) */}
              {nextLine && (
                <p
                  onClick={() => seekTo(nextLine.time)}
                  className="text-sm sm:text-base font-bold text-white/65 truncate max-w-full cursor-pointer hover:text-white/90 transition-colors"
                >
                  {nextLine.text}
                </p>
              )}

              {/* Next Next Line */}
              {nextNextLine && (
                <p
                  onClick={() => seekTo(nextNextLine.time)}
                  className="text-xs sm:text-sm font-medium text-white/25 truncate max-w-full cursor-pointer hover:text-white/50 transition-colors"
                >
                  {nextNextLine.text}
                </p>
              )}
            </div>
          )
        ) : (
          /* DECK / ALBUM ART VIEW */
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-2xl overflow-hidden border border-white/20 shadow-2xl group">
              <img
                src={currentTrack.thumbnail || DEFAULT_THUMBNAIL}
                alt={currentTrack.title}
                className={`w-full h-full object-cover transition-transform duration-700 ${isPlaying ? 'scale-105' : 'scale-100'}`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
            </div>

            <div className="text-center max-w-[260px]">
              <h3 className="text-sm font-extrabold text-white truncate">{currentTrack.title}</h3>
              <p className="text-xs text-white/60 truncate mt-0.5">{currentTrack.artist}</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer Scrubber & Transport Controls */}
      <div className="relative z-10 px-4 pt-2 pb-3 border-t border-white/10 bg-white/[0.04] backdrop-blur-xl flex-shrink-0">
        {/* Scrubber Bar */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-mono text-white/50 tabular-nums w-8 text-right">
            {formatTime(currentTime)}
          </span>
          <div
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              seekTo(ratio * activeDuration);
            }}
            className="flex-1 h-1.5 hover:h-2 bg-white/15 rounded-full cursor-pointer relative overflow-hidden transition-all group"
          >
            <div
              className="h-full bg-gradient-to-r from-[var(--color-accent,#f43f5e)] via-rose-400 to-white rounded-full group-hover:brightness-110"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-white/50 tabular-nums w-8">
            -{formatTime(Math.max(0, activeDuration - currentTime))}
          </span>
        </div>

        {/* Transport Buttons */}
        <div className="flex items-center justify-between gap-1">
          <button
            onClick={toggleShuffle}
            title="Shuffle"
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              isShuffled ? 'glass-button-primary text-white' : 'glass-button text-white/60'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={prevTrack}
              title="Previous"
              className="w-8 h-8 rounded-full glass-button text-white/80 hover:text-white flex items-center justify-center transition-all cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            <button
              onClick={togglePlay}
              title={isPlaying ? 'Pause' : 'Play'}
              className="w-10 h-10 rounded-full glass-button-primary text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform cursor-pointer"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : isPlaying ? (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg className="w-4 h-4 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <button
              onClick={nextTrack}
              title="Next"
              className="w-8 h-8 rounded-full glass-button text-white/80 hover:text-white flex items-center justify-center transition-all cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={cycleRepeat}
              title={`Repeat: ${repeatMode}`}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                repeatMode !== 'off' ? 'glass-button-primary text-white' : 'glass-button text-white/60'
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </button>

            <button
              onClick={() => toggleLike(currentTrack)}
              title={isLiked ? 'Unlike' : 'Like'}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                isLiked ? 'glass-button-primary text-white' : 'glass-button text-white/60'
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </MotionDiv>
  );
});

FloatingLyricsPiP.displayName = 'FloatingLyricsPiP';
