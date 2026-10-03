import { useEffect, useRef } from 'react';

interface AnimatedBackgroundProps {
  colors?: string[];
}

const AnimatedBackground = ({ colors = ['#1a0533', '#0a1628', '#0f172a'] }: AnimatedBackgroundProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && colors.length > 0) {
      containerRef.current.style.setProperty('--gradient-color-1', colors[0 % colors.length]);
      containerRef.current.style.setProperty('--gradient-color-2', colors[1 % colors.length]);
      containerRef.current.style.setProperty('--gradient-color-3', colors[2 % colors.length]);
    }
  }, [colors]);

  return (
    <div ref={containerRef} className="animated-gradient-bg">
      {/* Floating orbs */}
      <div 
        className="absolute top-[20%] left-[30%] w-64 h-64 rounded-full mix-blend-screen filter blur-[100px] animate-float opacity-30"
        style={{ background: 'var(--gradient-color-1, #7c3aed)', animationDelay: '0s' }}
      />
      <div 
        className="absolute top-[60%] left-[70%] w-80 h-80 rounded-full mix-blend-screen filter blur-[120px] animate-float opacity-20"
        style={{ background: 'var(--gradient-color-2, #3b82f6)', animationDelay: '-2s' }}
      />
      <div 
        className="absolute top-[40%] left-[80%] w-72 h-72 rounded-full mix-blend-screen filter blur-[100px] animate-float opacity-25"
        style={{ background: 'var(--gradient-color-3, #ec4899)', animationDelay: '-4s' }}
      />
    </div>
  );
};

export default AnimatedBackground;
