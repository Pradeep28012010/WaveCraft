import { memo, useMemo, useState, useEffect, useRef } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { getPreciseAudioTime } from '../../services/audioEngine';
import { computeWordTimings, type WordTiming } from '../../services/transliterate';
import type { LyricLine } from '../../types';

export { computeWordTimings, type WordTiming };

interface SyllableGlowLineProps {
  line: LyricLine;
  nextLineTime: number;
  userOffset: number;
  isCurrent: boolean;
  onSelectWord?: (time: number) => void;
  className?: string;
  fontSizeClass?: string;
}

/**
 * Isolated active karaoke syllable line powered by continuous sub-frame
 * 60/120 FPS requestAnimationFrame audio clock interpolation.
 */
const ActiveSyllableLine = memo(
  ({
    line,
    nextLineTime,
    userOffset,
    onSelectWord,
    className = '',
    fontSizeClass = 'text-lg sm:text-2xl md:text-[26px]'
  }: SyllableGlowLineProps) => {
    const isPlaying = usePlayerStore((s) => s.isPlaying);
    const playbackSpeed = usePlayerStore((s) => s.playbackSpeed) || 1.0;

    const [audioClock, setAudioClock] = useState(() => getPreciseAudioTime());
    const clockRef = useRef({
      audioTime: getPreciseAudioTime(),
      wallTime: performance.now()
    });

    useEffect(() => {
      let animId: number;
      const initialAudio = getPreciseAudioTime();
      clockRef.current = {
        audioTime: initialAudio,
        wallTime: performance.now()
      };
      setAudioClock(initialAudio);

      const tick = (now: number) => {
        const rawAudio = getPreciseAudioTime();
        const prev = clockRef.current;

        // If audio engine hopped forward/backward by > 120ms (seek or boundary), re-anchor
        if (Math.abs(rawAudio - prev.audioTime) > 0.12 || rawAudio < prev.audioTime - 0.05) {
          prev.audioTime = rawAudio;
          prev.wallTime = now;
        }

        if (isPlaying) {
          const dtSec = (now - prev.wallTime) / 1000;
          const continuousTime = prev.audioTime + dtSec * playbackSpeed;
          setAudioClock(continuousTime);
          animId = requestAnimationFrame(tick);
        } else {
          setAudioClock(rawAudio);
        }
      };

      if (isPlaying) {
        animId = requestAnimationFrame(tick);
      }

      // Explicit store subscriber to snap immediately on manual timeline scrub/seek
      const unsub = usePlayerStore.subscribe((state, prevState) => {
        if (Math.abs(state.currentTime - prevState.currentTime) > 0.3) {
          const seekPos = state.currentTime;
          clockRef.current = {
            audioTime: seekPos,
            wallTime: performance.now()
          };
          setAudioClock(seekPos);
        }
      });

      return () => {
        if (animId) cancelAnimationFrame(animId);
        unsub();
      };
    }, [isPlaying, playbackSpeed]);

    const syncTime = audioClock + userOffset + 0.12;
    const duration = Math.max(1.2, nextLineTime - line.time);
    const lineProgress = Math.min(1, Math.max(0, (syncTime - line.time) / duration));

    const wordTimings = useMemo(
      () => computeWordTimings(line.text, line.time, nextLineTime),
      [line.text, line.time, nextLineTime]
    );

    return (
      <span
        className={`inline-flex flex-wrap items-baseline gap-x-[0.3em] font-extrabold leading-snug tracking-tight ${fontSizeClass} ${className}`}
      >
        {wordTimings.map((item, idx) => {
          const isPast = lineProgress >= item.endRatio;
          const isUpcoming = lineProgress <= item.startRatio;
          const isActive = !isPast && !isUpcoming;

          let wordPct = 0;
          if (isActive) {
            const range = item.endRatio - item.startRatio;
            wordPct = Math.min(100, Math.max(0, ((lineProgress - item.startRatio) / range) * 100));
          }

          // Soft feathered gradient stops for liquid fluid sweeping
          const lead = wordPct.toFixed(1);
          const mid = Math.min(100, wordPct + 12).toFixed(1);
          const trail = Math.min(100, wordPct + 24).toFixed(1);

          return (
            <span
              key={`${item.word}-${idx}`}
              onClick={(e) => {
                if (onSelectWord) {
                  e.stopPropagation();
                  onSelectWord(item.startTime);
                }
              }}
              title={`Jump to "${item.word}"`}
              className={`inline-block origin-bottom select-text cursor-pointer transition-transform duration-150 ease-out ${
                isActive ? 'scale-[1.045] -translate-y-[0.5px]' : 'scale-100 translate-y-0'
              }`}
              style={
                isPast
                  ? {
                      color: '#ffffff',
                      textShadow: '0 0 16px rgba(255, 255, 255, 0.65)'
                    }
                  : isUpcoming
                  ? {
                      color: 'rgba(255, 255, 255, 0.38)'
                    }
                  : {
                      backgroundImage: `linear-gradient(90deg, #ffffff 0%, #ffffff ${lead}%, rgba(255, 255, 255, 0.88) ${mid}%, rgba(255, 255, 255, 0.38) ${trail}%, rgba(255, 255, 255, 0.38) 100%)`,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      filter: 'drop-shadow(0 0 18px rgba(255, 255, 255, 0.85)) drop-shadow(0 0 32px rgba(255, 255, 255, 0.45))'
                    }
              }
            >
              {item.word}
            </span>
          );
        })}
      </span>
    );
  }
);
ActiveSyllableLine.displayName = 'ActiveSyllableLine';

/**
 * Universal SyllableGlowLine
 * Subscribes to sub-frame continuous clock ONLY when `isCurrent` is true.
 * For non-current lines, renders static text with ZERO per-frame overhead.
 */
export const SyllableGlowLine = memo(
  ({
    line,
    nextLineTime,
    userOffset,
    isCurrent,
    onSelectWord,
    className = '',
    fontSizeClass = 'text-lg sm:text-2xl md:text-[26px]'
  }: SyllableGlowLineProps) => {
    if (isCurrent) {
      return (
        <ActiveSyllableLine
          line={line}
          nextLineTime={nextLineTime}
          userOffset={userOffset}
          isCurrent={true}
          onSelectWord={onSelectWord}
          className={className}
          fontSizeClass={fontSizeClass}
        />
      );
    }

    return (
      <span
        className={`font-extrabold leading-snug tracking-tight text-white/90 select-text ${fontSizeClass} ${className}`}
      >
        {line.text}
      </span>
    );
  }
);
SyllableGlowLine.displayName = 'SyllableGlowLine';
