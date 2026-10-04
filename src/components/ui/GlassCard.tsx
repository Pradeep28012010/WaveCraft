import { motion, HTMLMotionProps } from 'framer-motion';
import { forwardRef, ReactNode } from 'react';

interface GlassCardProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode;
  variant?: 'default' | 'heavy' | 'light' | 'liquid';
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
}

const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ children, variant = 'default', hover = false, padding = 'md', className = '', ...props }, ref) => {
    
    let variantClass = 'glass';
    if (variant === 'heavy') variantClass = 'glass-heavy';
    if (variant === 'light') variantClass = 'glass-light';
    if (variant === 'liquid') variantClass = 'liquid-glass';

    let paddingClass = 'p-6'; // md
    if (padding === 'none') paddingClass = 'p-0';
    if (padding === 'sm') paddingClass = 'p-4';
    if (padding === 'lg') paddingClass = 'p-8';

    const hoverProps = hover
      ? {
          whileHover: { y: -5, scale: 1.02 },
          whileTap: { scale: 0.98 },
          transition: { type: 'spring', stiffness: 380, damping: 24, mass: 0.6 }
        }
      : {};

    return (
      <motion.div
        ref={ref}
        style={{ willChange: hover ? 'transform' : 'auto', ...(props.style || {}) }}
        className={`${variantClass} rounded-[var(--radius-lg)] ${paddingClass} ${className}`}
        {...hoverProps}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

GlassCard.displayName = 'GlassCard';

export default GlassCard;
