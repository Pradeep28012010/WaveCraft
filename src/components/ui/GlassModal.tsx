import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, ReactNode } from 'react';
import GlassCard from './GlassCard';

interface GlassModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const GlassModal = ({ isOpen, onClose, title, children, size = 'md' }: GlassModalProps) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  let widthClass = 'w-full max-w-md';
  if (size === 'sm') widthClass = 'w-full max-w-sm';
  if (size === 'lg') widthClass = 'w-full max-w-2xl';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`relative z-10 ${widthClass}`}
          >
            <GlassCard variant="heavy" padding="lg" className="w-full">
              {title && (
                <div className="mb-4 text-xl font-semibold text-white">
                  {title}
                </div>
              )}
              {children}
            </GlassCard>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default GlassModal;
