import { type ReactNode } from 'react';

interface ScrollAreaProps {
  children: ReactNode;
  className?: string;
}

const ScrollArea = ({ children, className = '' }: ScrollAreaProps) => {
  return (
    <div className={`relative overflow-hidden h-full ${className}`}>
      {/* Top fade gradient */}
      <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-[var(--color-surface)] to-transparent z-10 pointer-events-none opacity-80" />
      
      <div className="overflow-y-auto h-full w-full custom-scrollbar pb-10">
        {children}
      </div>
      
      {/* Bottom fade gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[var(--color-surface)] to-transparent z-10 pointer-events-none opacity-80" />
    </div>
  );
};

export default ScrollArea;
