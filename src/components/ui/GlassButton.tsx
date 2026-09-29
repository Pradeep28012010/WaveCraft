import { motion, HTMLMotionProps } from 'framer-motion';
import { ReactNode } from 'react';

interface GlassButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
}

const GlassButton = ({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  active = false,
  disabled = false,
  className = '',
  title,
  ...props
}: GlassButtonProps) => {
  const baseClass =
    'inline-flex items-center justify-center gap-2 font-semibold transition-[background-color,border-color,box-shadow,color] duration-200 outline-none select-none cursor-pointer';
  let variantClass = '';
  let sizeClass = '';

  if (variant === 'default') {
    variantClass = 'glass-button rounded-full';
  } else if (variant === 'primary') {
    variantClass =
      'bg-gradient-to-r from-[var(--color-accent)] to-rose-500 hover:brightness-110 text-white border border-white/20 shadow-[0_8px_24px_rgba(250,45,72,0.35)] rounded-full';
  } else if (variant === 'ghost') {
    variantClass =
      'bg-transparent hover:bg-white/10 text-white/80 hover:text-white border border-transparent hover:border-white/15 rounded-full';
  } else if (variant === 'icon') {
    variantClass = 'glass-button rounded-full p-2';
  }

  if (variant !== 'icon') {
    if (size === 'sm') sizeClass = 'px-4 py-1.5 text-xs sm:text-sm';
    if (size === 'md') sizeClass = 'px-5 py-2.5 text-sm';
    if (size === 'lg') sizeClass = 'px-6 py-3 text-base';
  } else {
    if (size === 'sm') sizeClass = 'w-8 h-8';
    if (size === 'md') sizeClass = 'w-10 h-10';
    if (size === 'lg') sizeClass = 'w-12 h-12';
  }

  if (active && variant !== 'primary') {
    variantClass += ' ring-2 ring-[var(--color-accent)] glow-accent bg-white/15 border-white/30';
  }

  if (disabled) {
    variantClass += ' opacity-50 cursor-not-allowed pointer-events-none';
  }

  return (
    <motion.button
      whileHover={disabled ? undefined : { y: -1.5, scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 420, damping: 24, mass: 0.6 }}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClass} ${variantClass} ${sizeClass} ${className}`}
      title={title}
      {...props}
    >
      {children}
    </motion.button>
  );
};

export default GlassButton;
