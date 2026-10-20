import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { triggerAndroidHaptic } from '../../services/nativeAndroid';

export interface GlassSelectOption<T = string | number> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface GlassSelectProps<T = string | number> {
  value: T;
  options: GlassSelectOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  size?: 'sm' | 'md' | 'lg';
  prefix?: React.ReactNode;
  align?: 'left' | 'right' | 'auto';
  placeholder?: string;
  disabled?: boolean;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  openUpward: boolean;
}

const SIZE_CONFIG = {
  sm: {
    btn: 'px-3 py-1.5 rounded-xl text-xs gap-1.5 font-semibold',
    icon: 'w-3.5 h-3.5',
    item: 'px-3 py-2 rounded-xl text-xs',
    itemHeight: 34,
    minMenuWidth: 145
  },
  md: {
    btn: 'px-3.5 py-2 rounded-xl text-xs sm:text-sm gap-2.5 font-semibold',
    icon: 'w-4 h-4',
    item: 'px-3.5 py-2.5 rounded-xl text-xs sm:text-sm',
    itemHeight: 40,
    minMenuWidth: 175
  },
  lg: {
    btn: 'px-4 py-2.5 rounded-2xl text-sm gap-3 font-bold',
    icon: 'w-4.5 h-4.5',
    item: 'px-4 py-3 rounded-xl text-sm',
    itemHeight: 44,
    minMenuWidth: 200
  }
};

export default function GlassSelect<T extends string | number = string>({
  value,
  options,
  onChange,
  className = '',
  buttonClassName,
  menuClassName = '',
  size = 'md',
  prefix,
  align = 'auto',
  placeholder,
  disabled = false
}: GlassSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<MenuPosition>({ top: 0, left: 0, width: 175, openUpward: false });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentSize = SIZE_CONFIG[size] || SIZE_CONFIG.md;
  const selectedOption = options.find((o) => String(o.value) === String(value)) || options[0];

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = Math.max(rect.width, currentSize.minMenuWidth);
    const estimatedMenuHeight = Math.min(options.length * currentSize.itemHeight + 16, 290);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < estimatedMenuHeight + 20 && rect.top > estimatedMenuHeight;

    let left: number;
    if (align === 'left') {
      left = Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12));
    } else if (align === 'right') {
      left = Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12));
    } else {
      // Auto: if left overflow, align to right edge; otherwise align to left edge
      if (rect.left + menuWidth > window.innerWidth - 12) {
        left = Math.max(12, rect.right - menuWidth);
      } else {
        left = Math.max(12, rect.left);
      }
    }

    const top = openUpward ? rect.top - 6 : rect.bottom + 6;

    setPos({
      top,
      left,
      width: menuWidth,
      openUpward
    });
  }, [options.length, currentSize.minMenuWidth, currentSize.itemHeight, align]);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, updatePosition]);

  return (
    <div className={`relative inline-block text-left select-none max-w-full ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          triggerAndroidHaptic('light');
          setIsOpen((prev) => !prev);
        }}
        className={
          buttonClassName ||
          `flex items-center justify-between ${currentSize.btn} rounded-xl liquid-glass border-0 text-white transition-all cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed`
        }
      >
        <div className="flex items-center gap-1.5 truncate">
          {prefix && <span className="flex-shrink-0 text-white/50">{prefix}</span>}
          {selectedOption?.icon && (
            <span className="flex-shrink-0 text-white/70">{selectedOption.icon}</span>
          )}
          <span className="truncate">{selectedOption?.label || placeholder || String(value)}</span>
        </div>
        <svg
          className={`${currentSize.icon} text-white/60 transition-transform duration-200 flex-shrink-0 ${
            isOpen ? 'rotate-180 text-white' : ''
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: pos.openUpward ? 6 : -6, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: pos.openUpward ? 6 : -6, scale: 0.95 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  position: 'fixed',
                  top: pos.openUpward ? undefined : pos.top,
                  bottom: pos.openUpward ? window.innerHeight - pos.top : undefined,
                  left: pos.left,
                  width: pos.width,
                  zIndex: 99999
                }}
                className={`rounded-2xl liquid-glass bg-[#0c0e1a]/95 backdrop-blur-3xl shadow-[0_24px_70px_rgba(0,0,0,0.95)] border-0 ring-1 ring-white/15 p-1.5 max-h-72 overflow-y-auto no-scrollbar space-y-0.5 ${menuClassName}`}
              >
                {options.map((opt) => {
                  const active = String(opt.value) === String(value);
                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => {
                        triggerAndroidHaptic('light');
                        onChange(opt.value);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between ${currentSize.item} transition-colors cursor-pointer select-none ${
                        active
                          ? 'bg-[var(--color-accent)] text-white font-bold shadow-md'
                          : 'text-white/80 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {opt.icon && <span className="flex-shrink-0 text-xs">{opt.icon}</span>}
                        <span className="truncate">{opt.label}</span>
                      </div>
                      {active && (
                        <svg
                          className="w-3.5 h-3.5 flex-shrink-0 ml-1.5 text-white"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.6"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
