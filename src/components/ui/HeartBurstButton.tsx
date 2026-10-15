import { useState, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

interface HeartBurstButtonProps {
  isLiked: boolean;
  onToggle: (e: React.MouseEvent) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  title?: string;
  ariaLabel?: string;
}

const PARTICLE_ANGLES = [0, 60, 120, 180, 240, 300];

export const HeartBurstButton = memo(({
  isLiked,
  onToggle,
  size = 'md',
  className = '',
  title,
  ariaLabel
}: HeartBurstButtonProps) => {
  const [showBurst, setShowBurst] = useState(false);
  const prevLikedRef = useRef(isLiked);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // If transitioning from unliked -> liked, trigger particle explosion
    if (!prevLikedRef.current && isLiked) {
      setShowBurst(true);
      if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
      burstTimerRef.current = setTimeout(() => {
        setShowBurst(false);
      }, 700);
    }
    prevLikedRef.current = isLiked;
  }, [isLiked]);

  useEffect(() => {
    return () => {
      if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    };
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerAndroidHaptic('medium');
    onToggle(e);
  };

  const dimensions = {
    sm: { button: 'w-8 h-8', icon: 'w-4 h-4', distance: 16 },
    md: { button: 'w-10 h-10', icon: 'w-5 h-5', distance: 20 },
    lg: { button: 'w-12 h-12', icon: 'w-6 h-6', distance: 26 }
  }[size];

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Particle Burst Explosion */}
      <AnimatePresence>
        {showBurst && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
            {PARTICLE_ANGLES.map((angle, idx) => {
              const rad = (angle * Math.PI) / 180;
              const x = Math.cos(rad) * dimensions.distance;
              const y = Math.sin(rad) * dimensions.distance;

              return (
                <motion.span
                  key={idx}
                  initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                  animate={{
                    x,
                    y,
                    scale: [0, 1.2, 0.4],
                    opacity: [1, 0.9, 0]
                  }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: 0.55,
                    ease: [0.16, 1, 0.3, 1],
                    delay: idx * 0.015
                  }}
                  className="absolute w-1.5 h-1.5 rounded-full shadow-[0_0_8px_var(--color-accent)]"
                  style={{
                    backgroundColor: idx % 2 === 0 ? 'var(--color-accent)' : '#ff4d6d'
                  }}
                />
              );
            })}
          </div>
        )}
      </AnimatePresence>

      {/* Main Interactive Button with Spring Physics */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.76 }}
        onClick={handleClick}
        title={title || (isLiked ? 'Unlike' : 'Like')}
        aria-label={ariaLabel || (isLiked ? 'Unlike' : 'Like')}
        className={`relative flex items-center justify-center rounded-full transition-colors cursor-pointer select-none ${dimensions.button} ${
          isLiked
            ? 'glass-button-primary text-[var(--color-accent)]'
            : 'glass-button text-white/65 hover:text-white'
        } ${className}`}
      >
        <motion.div
          animate={
            isLiked
              ? { scale: [0.8, 1.25, 1], rotate: [0, -10, 8, 0] }
              : { scale: [1.1, 0.9, 1] }
          }
          transition={{ duration: 0.42, ease: [0.175, 0.885, 0.32, 1.275] }}
          className="flex items-center justify-center"
        >
          <svg
            className={`${dimensions.icon} block`}
            viewBox="0 0 24 24"
            fill={isLiked ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </motion.div>
      </motion.button>
    </div>
  );
});

HeartBurstButton.displayName = 'HeartBurstButton';
export default HeartBurstButton;
