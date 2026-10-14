import { memo, useMemo } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
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
 * Isolated active karaoke syllable line subscribing to `currentTime`
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
    const currentTime = usePlayerStore((s) => s.currentTime);
    const syncTime = currentTime + userOffset + 0.25;
    const duration = Math.max(1.2, nextLineTime - line.time);
    const lineProgress = Math.min(1, Math.max(0, (syncTime - line.time) / duration));

    const wordTimings = useMemo(
      () => computeWordTimings(line.text, line.time, nextLineTime),
      [line.text, line.time, nextLineTime]
    );

    return (
      <span
        className={`inline-flex flex-wrap items-baseline gap-x-[0.28em] font-extrabold leading-snug tracking-tight ${fontSizeClass} ${className}`}
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
              className={`inline-block transition-transform duration-100 origin-bottom select-text cursor-pointer ${
                isActive ? 'scale-[1.04]' : 'scale-100'
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
                      backgroundImage: `linear-gradient(90deg, #ffffff 0%, #ffffff ${wordPct.toFixed(
                        1
                      )}%, rgba(255, 255, 255, 0.35) ${wordPct.toFixed(1)}%, rgba(255, 255, 255, 0.35) 100%)`,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      filter: 'drop-shadow(0 0 14px rgba(255, 255, 255, 0.8))'
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
 * Subscribes to `currentTime` ONLY when `isCurrent` is true.
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
