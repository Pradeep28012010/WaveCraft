import { useState, useEffect, useRef } from 'react';
import { usePlayerStore } from '../stores/playerStore';

export function useSleepTimer() {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(false);
  const intervalRef = useRef<number>();
  const pause = usePlayerStore(state => state.pause);

  const setTimer = (minutes: number) => {
    setTimeRemaining(minutes * 60);
    setIsActive(true);
  };

  const cancelTimer = () => {
    setTimeRemaining(null);
    setIsActive(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  useEffect(() => {
    if (isActive && timeRemaining !== null && timeRemaining > 0) {
      intervalRef.current = window.setInterval(() => {
        setTimeRemaining(prev => {
          if (prev === null || prev <= 1) {
            pause();
            cancelTimer();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, timeRemaining, pause]);

  return { timeRemaining, isActive, setTimer, cancelTimer };
}
