import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

export interface GlassSelectOption {
  value: string;
  label: string;
}

interface GlassSelectProps {
  value: string;
  options: GlassSelectOption[];
  onChange: (value: string) => void;
  className?: string;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  openUpward: boolean;
}

export default function GlassSelect({
  value,
  options,
  onChange,
  className = ''
}: GlassSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<MenuPosition>({ top: 0, left: 0, width: 192, openUpward: false });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value) || options[0];

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = Math.max(rect.width, 196);
    const estimatedMenuHeight = Math.min(options.length * 40 + 16, 280);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < estimatedMenuHeight + 24 && rect.top > estimatedMenuHeight;

    const left = Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12));
    const top = openUpward ? rect.top - 8 : rect.bottom + 8;

    setPos({
      top,
      left,
      width: menuWidth,
      openUpward
    });
  }, [options.length]);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
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
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, updatePosition]);

  return (
    <div className={`relative inline-block text-left select-none ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center justify-between gap-3 px-4 py-2 rounded-full liquid-glass text-xs sm:text-sm font-semibold text-white hover:border-white/35 transition-all cursor-pointer min-w-[155px]"
      >
        <span className="truncate">{selectedOption?.label || value}</span>
        <svg
          className={`w-4 h-4 text-white/65 transition-transform duration-200 flex-shrink-0 ${
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
                initial={{ opacity: 0, y: pos.openUpward ? 6 : -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: pos.openUpward ? 6 : -6, scale: 0.96 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                style={{
                  position: 'fixed',
                  top: pos.openUpward ? undefined : pos.top,
                  bottom: pos.openUpward ? window.innerHeight - pos.top : undefined,
                  left: pos.left,
                  width: pos.width,
                  zIndex: 9999
                }}
                className="rounded-2xl glass-heavy p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.92)] border border-white/25 max-h-72 overflow-y-auto no-scrollbar"
              >
                {options.map((opt) => {
                  const active = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        onChange(opt.value);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                        active
                          ? 'bg-[var(--color-accent)] text-white font-bold shadow-md'
                          : 'text-white/85 hover:text-white hover:bg-white/12'
                      }`}
                    >
                      <span className="truncate">{opt.label}</span>
                      {active && (
                        <svg
                          className="w-4 h-4 flex-shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
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
