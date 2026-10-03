import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface GlassModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const MODAL_TRANSITION = {
  duration: 0.16,
  ease: [0.22, 1, 0.36, 1] as const
};

const GlassModal = ({ isOpen, onClose, title, children, size = 'md' }: GlassModalProps) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  let widthClass = 'w-full max-w-md';
  if (size === 'sm') widthClass = 'w-full max-w-sm';
  if (size === 'lg') widthClass = 'w-full max-w-xl';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9995] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={MODAL_TRANSITION}
            onClick={onClose}
            className="absolute inset-0 modal-backdrop-blur backdrop-blur-xl backdrop-saturate-150"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={MODAL_TRANSITION}
            onClick={(e) => e.stopPropagation()}
            className={`relative z-10 ${widthClass} max-h-[90vh] flex flex-col overflow-hidden p-6 sm:p-7 modal-glass-panel backdrop-blur-2xl backdrop-saturate-150`}
          >
            {title && (
              <div className="flex items-center justify-between gap-3 pb-3.5 mb-3.5 border-b border-white/12 flex-shrink-0">
                <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight truncate">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 p-0 rounded-full glass-button flex items-center justify-center text-white/70 hover:text-white cursor-pointer flex-shrink-0"
                  title="Close"
                >
                  ✕
                </button>
              </div>
            )}
            <div className="overflow-y-auto no-scrollbar pr-0.5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default GlassModal;
