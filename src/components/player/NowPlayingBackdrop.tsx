import { memo } from 'react';
import { DEFAULT_THUMBNAIL } from '../../utils/constants';

export interface NowPlayingBackdropProps {
  palette: {
    primary: string;
    secondary: string;
    tertiary: string;
    accent?: string;
  };
  artSrc: string;
  isPlaying: boolean;
  zenMode: boolean;
}

export const NowPlayingBackdrop = memo(({
  palette,
  artSrc,
  isPlaying,
  zenMode
}: NowPlayingBackdropProps) => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden bg-[#06060b]">
      {/* 1. Left Side Gradient Mesh Wing (Deep Moody Accent Flow) */}
      <div
        className="absolute -top-24 -left-24 sm:-left-36 w-[60vw] min-w-[380px] h-[55rem] rounded-full blur-[110px] sm:blur-[150px] pointer-events-none transition-all duration-1000 will-change-transform"
        style={{
          background: `radial-gradient(ellipse at 35% 30%, ${palette.primary}45 0%, ${palette.accent || palette.primary}30 45%, transparent 75%)`,
          opacity: zenMode ? 0.18 : isPlaying ? 0.34 : 0.22
        }}
      />

      {/* 2. Right Side Gradient Mesh Wing (Deep Harmonic Secondary & Tertiary Depth) */}
      <div
        className="absolute -top-24 -right-24 sm:-right-36 w-[60vw] min-w-[380px] h-[55rem] rounded-full blur-[110px] sm:blur-[150px] pointer-events-none transition-all duration-1000 will-change-transform"
        style={{
          background: `radial-gradient(ellipse at 65% 30%, ${palette.secondary}45 0%, ${palette.tertiary || palette.secondary}30 45%, transparent 75%)`,
          opacity: zenMode ? 0.16 : isPlaying ? 0.32 : 0.20
        }}
      />

      {/* 3. Center Harmonizing Aurora Mesh (Subtle Deep Dark Bridge) */}
      <div
        className="absolute -top-24 left-1/2 -translate-x-1/2 w-[80vw] min-w-[540px] h-[50rem] rounded-full blur-[120px] sm:blur-[160px] pointer-events-none transition-all duration-1000 will-change-transform"
        style={{
          background: `radial-gradient(ellipse 110% 70% at 50% 30%, ${palette.primary}40 0%, ${palette.secondary}28 45%, ${palette.tertiary}18 70%, transparent 100%)`,
          opacity: zenMode ? 0.15 : isPlaying ? 0.30 : 0.18
        }}
      />

      {/* 4. Deep Foundation Floor Glow (Bottom Atmosphere) */}
      <div
        className="absolute -bottom-28 left-[25%] w-[56rem] h-[56rem] rounded-full blur-[130px] pointer-events-none transition-all duration-1000"
        style={{
          background: `radial-gradient(circle, ${palette.tertiary} 0%, transparent 62%)`,
          opacity: zenMode ? 0.08 : 0.14
        }}
      />

      {/* 5. Panoramic Upper Horizon Ambient Light Bar (Gentle Luminous Wash) */}
      <div
        className="absolute -top-12 inset-x-0 h-52 blur-[90px] pointer-events-none transition-all duration-1000 will-change-transform"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${palette.primary}30 20%, ${palette.accent || palette.primary}25 40%, ${palette.secondary}30 60%, ${palette.tertiary || palette.secondary}25 80%, transparent 100%)`,
          opacity: zenMode ? 0.20 : isPlaying ? 0.35 : 0.22
        }}
      />

      {/* 6. Center Stage Ambient Core Spotlight (Restrained Deep Tone Behind Platter/Artwork) */}
      <div
        className="absolute top-[38%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[72vw] min-w-[420px] max-w-[850px] h-[36rem] rounded-full blur-[110px] sm:blur-[150px] pointer-events-none transition-all duration-1000 will-change-transform"
        style={{
          background: `radial-gradient(ellipse 100% 85% at 50% 50%, ${palette.primary}38 0%, ${palette.secondary}25 38%, ${palette.tertiary}12 68%, transparent 100%)`,
          opacity: zenMode ? 0.14 : isPlaying ? 0.32 : 0.18
        }}
      />

      {/* Diffused Art Layer */}
      <img
        src={artSrc}
        alt=""
        onError={(e) => {
          (e.target as HTMLImageElement).src = DEFAULT_THUMBNAIL;
        }}
        className={`w-full h-full object-cover blur-3xl scale-150 transition-opacity duration-700 brightness-75 ${
          zenMode ? 'opacity-8' : 'opacity-12'
        }`}
      />

      {/* Deep Dark Obsidian Vignette */}
      <div
        className="absolute inset-0 transition-colors duration-1000 pointer-events-none"
        style={{
          background: `linear-gradient(to bottom, rgba(6,6,11,0.60) 0%, rgba(6,6,11,0.40) 35%, rgba(6,6,11,0.85) 75%, #06060b 100%)`
        }}
      />
    </div>
  );
});

NowPlayingBackdrop.displayName = 'NowPlayingBackdrop';
export default NowPlayingBackdrop;
