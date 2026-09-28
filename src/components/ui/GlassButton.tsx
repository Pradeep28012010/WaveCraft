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
  let baseClass = 'inline-flex items-center justify-center font-medium transition-colors outline-none';
  let variantClass = '';
  let sizeClass = '';

  if (variant === 'default') {
    variantClass = 'glass-button';
  } else if (variant === 'primary') {
    variantClass = 'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white border border-transparent shadow-lg glow-accent rounded-[var(--radius-md)]';
  } else if (variant === 'ghost') {
    variantClass = 'bg-transparent hover:bg-white/10 text-white rounded-[var(--radius-md)]';
  } else if (variant === 'icon') {
    variantClass = 'glass-button rounded-full p-2';
  }

  if (variant !== 'icon') {
    if (size === 'sm') sizeClass = 'px-3 py-1.5 text-sm';
    if (size === 'md') sizeClass = 'px-4 py-2 text-base';
    if (size === 'lg') sizeClass = 'px-6 py-3 text-lg';
  } else {
    if (size === 'sm') sizeClass = 'w-8 h-8';
    if (size === 'md') sizeClass = 'w-10 h-10';
    if (size === 'lg') sizeClass = 'w-12 h-12';
  }

  if (active && variant !== 'primary') {
    variantClass += ' ring-2 ring-[var(--color-accent)] glow-accent bg-white/10';
  }

  if (disabled) {
    variantClass += ' opacity-50 cursor-not-allowed pointer-events-none';
  }

  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.95 }}
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
