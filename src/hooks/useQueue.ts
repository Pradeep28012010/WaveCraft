import { usePlayerStore } from '../stores/playerStore';

export function useQueue() {
  const queue = usePlayerStore(state => state.queue);
  const queueIndex = usePlayerStore(state => state.queueIndex);
  const originalQueue = usePlayerStore(state => state.originalQueue);
  
  const addToQueue = usePlayerStore(state => state.addToQueue);
  const addNext = usePlayerStore(state => state.addNext);
  const removeFromQueue = usePlayerStore(state => state.removeFromQueue);
  const reorderQueue = usePlayerStore(state => state.reorderQueue);
  const clearQueue = usePlayerStore(state => state.clearQueue);

  return {
    queue,
    queueIndex,
    originalQueue,
    addToQueue,
    addNext,
    removeFromQueue,
    reorderQueue,
    clearQueue
  };
}
