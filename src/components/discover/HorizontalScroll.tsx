import React, { useRef, memo } from 'react';
import { useDevicePreset } from '../../hooks/useDevicePreset';

interface HorizontalScrollProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  actionButton?: React.ReactNode;
}

export const HorizontalScroll = memo(({
  children,
  title,
  subtitle,
  actionButton
}: HorizontalScrollProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { isPhone } = useDevicePreset();

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { current } = scrollRef;
      const scrollAmount = current.clientWidth * 0.75;
      current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <section
      className="mb-8 sm:mb-12"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 340px' }}
    >
      <div className="flex items-center justify-between mb-2 px-1">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-white/50 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {actionButton}
          {!isPhone && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => scroll('left')}
                className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white/80 hover:text-white cursor-pointer active:scale-90 transition-transform"
                title="Scroll left"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => scroll('right')}
                className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white/80 hover:text-white cursor-pointer active:scale-90 transition-transform"
                title="Scroll right"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-3.5 sm:gap-5 overflow-x-auto overflow-y-hidden overscroll-y-auto no-scrollbar scroll-smooth snap-x snap-mandatory pt-3 pb-8 -mb-3 px-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {children}
      </div>
    </section>
  );
});

HorizontalScroll.displayName = 'HorizontalScroll';
export default HorizontalScroll;
