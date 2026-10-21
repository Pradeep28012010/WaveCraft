import React, { memo } from 'react';
import type { MoodPlaylist } from '../../utils/constants';

export interface MoodCardProps {
  mood: MoodPlaylist;
  relativityScore: number;
  isTopRecommendation: boolean;
  contextBadge: string | null;
  personalizedQuery: string;
  personalizedArtist: string | null;
  isNowPlayingMatch: boolean;
  isMoodLoading: boolean;
  isMoodActive: boolean;
  isPlaying: boolean;
  onPlay: (mood: MoodPlaylist, query: string) => void;
  onQueue: (mood: MoodPlaylist, query: string, e: React.MouseEvent) => void;
  onShuffle: (mood: MoodPlaylist, query: string, e: React.MouseEvent) => void;
  isGrid?: boolean;
}

export const MoodCard = memo(function MoodCard({
  mood,
  isTopRecommendation,
  contextBadge,
  personalizedQuery,
  personalizedArtist,
  isNowPlayingMatch,
  isMoodLoading,
  isMoodActive,
  isPlaying,
  onPlay,
  onQueue,
  onShuffle,
  isGrid = false
}: MoodCardProps) {
  const isCurrentlyPlayingThisMood = isMoodActive && isPlaying;

  return (
    <div
      onClick={() => onPlay(mood, personalizedQuery)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPlay(mood, personalizedQuery);
        }
      }}
      className={`group relative rounded-3xl overflow-hidden p-5 transition-all duration-300 cursor-pointer select-none active:scale-[0.98] border backdrop-blur-2xl flex flex-col justify-between ${
        isGrid
          ? 'w-full min-h-[220px]'
          : 'min-w-[225px] max-w-[225px] sm:min-w-[250px] sm:max-w-[250px] flex-shrink-0 snap-start min-h-[220px]'
      } ${
        isTopRecommendation || isNowPlayingMatch
          ? 'border-white/35 shadow-[0_20px_48px_-12px_rgba(0,0,0,0.7)] hover:border-white/50'
          : 'border-white/15 hover:border-white/35 shadow-[0_12px_36px_-10px_rgba(0,0,0,0.5)]'
      }`}
      style={{
        background: mood.bgGradient,
        boxShadow: `0 16px 42px -10px ${mood.glowColor}38`
      }}
    >
      {/* Dynamic Ambient Lighting Bloom Mesh */}
      <div
        className="absolute -top-12 -right-12 w-40 h-40 rounded-full pointer-events-none opacity-40 group-hover:opacity-75 blur-3xl transition-opacity duration-700"
        style={{ background: mood.glowColor }}
      />
      <div
        className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full pointer-events-none opacity-20 group-hover:opacity-50 blur-2xl transition-opacity duration-700"
        style={{ background: mood.accentColor }}
      />

      {/* Top Specular Liquid Glass Edge Highlight */}
      <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/45 to-transparent pointer-events-none" />

      {/* Card Header: Icon Badge & Interactive Play/Pause Disc */}
      <div className="relative z-10">
        <div className="flex items-center justify-between">
          {/* Frosted VisionOS Squircle Icon Tile */}
          <div className="w-12 h-12 rounded-2xl bg-white/12 backdrop-blur-md border border-white/25 shadow-inner flex items-center justify-center text-2xl group-hover:scale-110 group-hover:-rotate-3 group-hover:bg-white/20 transition-all duration-300">
            <span className="drop-shadow-md select-none">{mood.emoji}</span>
          </div>

          {/* Glowing Liquid Glass Play/Pause Disc */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlay(mood, personalizedQuery);
            }}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl cursor-pointer active:scale-90 ${
              isCurrentlyPlayingThisMood
                ? 'bg-white text-black scale-105 shadow-[0_0_24px_rgba(255,255,255,0.7)]'
                : isMoodActive
                ? 'bg-white/90 text-black hover:scale-110 shadow-[0_0_20px_rgba(255,255,255,0.5)]'
                : 'glass-button-primary text-white hover:scale-110 group-hover:shadow-[0_0_22px_' +
                  mood.glowColor +
                  '90]'
            }`}
            title={isCurrentlyPlayingThisMood ? `Pause ${mood.name}` : `Play ${mood.name}`}
            aria-label={isCurrentlyPlayingThisMood ? `Pause ${mood.name}` : `Play ${mood.name}`}
          >
            {isMoodLoading ? (
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : isCurrentlyPlayingThisMood ? (
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 ml-0.5 fill-current" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        </div>

        {/* Relativity / Contextual Badge */}
        {contextBadge && (
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            <span
              className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full backdrop-blur-md border shadow-sm flex items-center gap-1.5 ${
                isTopRecommendation || isNowPlayingMatch
                  ? 'bg-white/25 border-white/45 text-white shadow-[0_0_14px_rgba(255,255,255,0.25)]'
                  : 'bg-white/10 border-white/20 text-white/80'
              }`}
            >
              {(isTopRecommendation || isNowPlayingMatch) && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              )}
              {contextBadge}
            </span>
          </div>
        )}

        {/* Acoustic Telemetry & Live Waveform Indicator */}
        <div className="mt-3 flex items-center justify-between text-[10.5px] font-semibold text-white/60 tracking-wider uppercase">
          <span className="flex items-center gap-1.5 truncate">
            <span>{mood.bpmRange}</span>
            <span className="text-white/25">•</span>
            <span>{mood.telemetryTag}</span>
          </span>

          {isCurrentlyPlayingThisMood && (
            <div
              className="flex items-end gap-0.5 h-3 px-1.5 py-0.5 rounded-full bg-white/15 border border-white/25"
              title="Playing Now"
            >
              <span className="w-0.5 h-full bg-white rounded-full animate-pulse" />
              <span className="w-0.5 h-2/3 bg-white rounded-full animate-pulse delay-75" />
              <span className="w-0.5 h-full bg-white rounded-full animate-pulse delay-150" />
            </div>
          )}
        </div>
      </div>

      {/* Card Body: Title, Subtitle & Personalization Seed */}
      <div className="relative z-10 mt-3">
        <h3 className="font-black text-base sm:text-lg text-white tracking-tight group-hover:text-white/95 transition-colors">
          {mood.name}
        </h3>
        <p className="text-xs text-white/70 mt-0.5 line-clamp-1 font-medium">
          {mood.sub}
        </p>

        {personalizedArtist && (
          <p className="text-[10.5px] text-white/60 mt-1 flex items-center gap-1 truncate font-medium">
            <span className="text-amber-300/80">✦</span>
            <span>Tuned to {personalizedArtist}</span>
          </p>
        )}

        {/* Quick Action Interactive Buttons (Queue, Shuffle) */}
        <div className="mt-3.5 pt-2.5 border-t border-white/10 flex items-center justify-between opacity-85 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-1.5">
            {/* Add Mix to Queue */}
            <button
              type="button"
              onClick={(e) => onQueue(mood, personalizedQuery, e)}
              className="h-7 px-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-[11px] font-semibold border border-white/15 backdrop-blur-md flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
              title={`Add ${mood.name} mix to Up Next Queue`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Queue</span>
            </button>

            {/* Shuffle Mix */}
            <button
              type="button"
              onClick={(e) => onShuffle(mood, personalizedQuery, e)}
              className="h-7 w-7 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white border border-white/15 backdrop-blur-md flex items-center justify-center transition-all active:scale-95 cursor-pointer"
              title={`Shuffle and play ${mood.name}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4h4l4 6 4-6h4M4 20h4l4-6 4 6h4"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
