import { useEffect, useRef, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  isOpen: boolean;
  onClose: () => void;
}

const ContextMenu = ({ items, position, isOpen, onClose }: ContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // Handle edge detection to prevent menu going off-screen
  let adjustedX = position.x;
  let adjustedY = position.y;

  if (menuRef.current && isOpen) {
    const rect = menuRef.current.getBoundingClientRect();
    const padding = 10;
    
    if (adjustedX + rect.width > window.innerWidth - padding) {
      adjustedX = window.innerWidth - rect.width - padding;
    }
    if (adjustedY + rect.height > window.innerHeight - padding) {
      adjustedY = window.innerHeight - rect.height - padding;
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          style={{ top: adjustedY, left: adjustedX }}
          className="fixed z-50 min-w-[200px] glass-heavy border border-white/10 rounded-lg shadow-xl overflow-hidden py-1"
        >
          {items.map((item, index) => {
            if (item.divider) {
              return <div key={`divider-${index}`} className="h-px bg-white/10 my-1 mx-2" />;
            }
            
            return (
              <button
                key={index}
                onClick={() => {
                  item.onClick();
                  onClose();
                }}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors hover:bg-white/10 ${
                  item.danger ? 'text-red-400 hover:text-red-300' : 'text-white'
                }`}
              >
                {item.icon && <span className="opacity-80 flex-shrink-0 w-4 h-4 flex justify-center items-center">{item.icon}</span>}
                {item.label}
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ContextMenu;
