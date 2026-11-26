import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StarNode3D } from './galaxyTypes';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

interface GalaxyTooltipProps {
  selectedStar: StarNode3D | null;
  isCurrentTrackPlaying: boolean;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
  onPlay: (star: StarNode3D) => void;
  onOpenPoster: () => void;
  onClose: () => void;
}

export default function GalaxyTooltip({
  selectedStar,
  isCurrentTrackPlaying,
  tooltipRef,
  onPlay,
  onOpenPoster,
  onClose
}: GalaxyTooltipProps) {
  return (
    <AnimatePresence>
      {selectedStar && (
        <div
          ref={tooltipRef}
          className="pointer-events-auto absolute top-0 left-0 z-30 will-change-transform"
          style={{ transform: 'translate3d(-9999px, -9999px, 0)' }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="w-64 rounded-2xl modal-glass-panel backdrop-blur-2xl backdrop-saturate-150 p-3 border border-white/15 shadow-[0_18px_48px_rgba(0,0,0,0.75)] space-y-2.5"
          >
            <div className="flex items-center gap-2.5">
              <img
                src={selectedStar.track.thumbnail || DEFAULT_THUMBNAIL}
                alt={selectedStar.track.title}
                className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border border-white/10"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-extrabold text-white truncate leading-tight">
                  {selectedStar.track.title}
                </p>
                <p className="text-[11px] text-white/60 truncate mt-0.5">
                  {selectedStar.track.artist}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-6 h-6 rounded-full flex items-center justify-center text-white/45 hover:text-white hover:bg-white/10 text-xs cursor-pointer flex-shrink-0"
                aria-label="Close star tooltip"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  triggerAndroidHaptic('medium');
                  onPlay(selectedStar);
                }}
                className="flex-1 h-8 px-3 rounded-full glass-button-primary text-[11px] font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer hover:brightness-110 active:scale-95 transition-all"
              >
                <span>{isCurrentTrackPlaying ? '⏸' : '▶'}</span>
                <span>{isCurrentTrackPlaying ? 'Pause' : 'Play'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerAndroidHaptic('light');
                  onOpenPoster();
                }}
                className="h-8 px-3 rounded-full glass-button text-[11px] font-bold text-white/85 hover:text-white flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition-all"
                title="Generate Story Poster"
              >
                <span>📸</span>
                <span>Open Poster</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
