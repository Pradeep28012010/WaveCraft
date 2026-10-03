import { motion, AnimatePresence } from 'framer-motion';
import { usePlayerStore } from '../../stores/playerStore';

interface QueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QueuePanel({ isOpen, onClose }: QueuePanelProps) {
  const { queue, currentTrack, removeFromQueue } = usePlayerStore();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/20"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-black/80 backdrop-blur-3xl border-l border-white/10 shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="text-xl font-bold text-white">Queue</h2>
              <button 
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-8">
              {/* Now Playing */}
              {currentTrack && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 mb-4 px-2 uppercase tracking-wider">Now Playing</h3>
                  <div className="flex items-center p-2 rounded-xl bg-white/10 border border-white/5">
                    <img src={currentTrack.thumbnail} alt={currentTrack.title} className="w-12 h-12 rounded-lg object-cover" />
                    <div className="ml-3 flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{currentTrack.title}</p>
                      <p className="text-xs text-gray-400 truncate">{currentTrack.artist}</p>
                    </div>
                    <div className="px-3">
                      <svg className="w-5 h-5 text-green-400" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                </div>
              )}

              {/* Next Up */}
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-4 px-2 uppercase tracking-wider">Next Up</h3>
                {queue.length === 0 ? (
                  <p className="text-sm text-gray-500 px-2">Queue is empty</p>
                ) : (
                  <div className="space-y-1">
                    {queue.map((track: any, index: number) => (
                      <div key={`${track.id}-${index}`} className="flex items-center p-2 rounded-xl hover:bg-white/5 transition-colors group">
                        <div className="w-6 h-6 flex items-center justify-center cursor-grab text-gray-500 hover:text-white mr-2">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/></svg>
                        </div>
                        <img src={track.thumbnail} alt={track.title} className="w-10 h-10 rounded-lg object-cover" />
                        <div className="ml-3 flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-200 truncate group-hover:text-white transition-colors">{track.title}</p>
                          <p className="text-xs text-gray-400 truncate">{track.artist}</p>
                        </div>
                        <button 
                          onClick={() => removeFromQueue(index)}
                          className="p-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
