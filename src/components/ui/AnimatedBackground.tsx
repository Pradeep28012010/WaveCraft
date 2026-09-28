import { useEffect, useRef, memo } from 'react';

interface AnimatedBackgroundProps {
  colors?: string[];
}

const AnimatedBackground = memo(
  ({ colors = ['#fa2d48', '#7c3aed', '#0ea5e9'] }: AnimatedBackgroundProps) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (containerRef.current && colors.length > 0) {
        containerRef.current.style.setProperty('--gradient-color-1', colors[0 % colors.length]);
        containerRef.current.style.setProperty('--gradient-color-2', colors[1 % colors.length]);
        containerRef.current.style.setProperty('--gradient-color-3', colors[2 % colors.length]);
      }
    }, [colors]);

    return (
      <div
        ref={containerRef}
        className="animated-gradient-bg pointer-events-none select-none overflow-hidden"
        style={{ contain: 'strict' }}
      >
        {/* GPU-composited radial gradient orbs (zero Gaussian blur shader cost for locked 120fps) */}
        <div
          className="absolute top-[8%] left-[18%] w-[36rem] h-[36rem] rounded-full animate-float opacity-25 will-change-transform"
          style={{
            background:
              'radial-gradient(circle, var(--gradient-color-1, #fa2d48) 0%, transparent 68%)',
            transform: 'translate3d(0,0,0)'
          }}
        />
        <div
          className="absolute top-[45%] left-[58%] w-[42rem] h-[42rem] rounded-full animate-float opacity-20 will-change-transform"
          style={{
            background:
              'radial-gradient(circle, var(--gradient-color-2, #7c3aed) 0%, transparent 68%)',
            animationDelay: '-2.5s',
            transform: 'translate3d(0,0,0)'
          }}
        />
        <div
          className="absolute top-[25%] left-[72%] w-[34rem] h-[34rem] rounded-full animate-float opacity-20 will-change-transform"
          style={{
            background:
              'radial-gradient(circle, var(--gradient-color-3, #0ea5e9) 0%, transparent 68%)',
            animationDelay: '-4.5s',
            transform: 'translate3d(0,0,0)'
          }}
        />
      </div>
    );
  }
);

AnimatedBackground.displayName = 'AnimatedBackground';

export default AnimatedBackground;
