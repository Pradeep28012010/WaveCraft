import { useStudioStore } from '../stores/studioStore';

export function useSleepTimer() {
  const isActive = useStudioStore((s) => s.sleepActive);
  const timeRemaining = useStudioStore((s) => s.sleepSeconds);
  const endAtTrack = useStudioStore((s) => s.sleepEndAtTrack);
  const startTimer = useStudioStore((s) => s.startSleepTimer);
  const stopTimer = useStudioStore((s) => s.stopSleepTimer);
  const setEndAtTrack = useStudioStore((s) => s.setSleepEndAtTrack);

  return {
    isActive,
    timeRemaining,
    endAtTrack,
    startTimer,
    stopTimer,
    setEndAtTrack,
    setTimer: startTimer,
    cancelTimer: stopTimer
  };
}
