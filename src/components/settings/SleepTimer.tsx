import { useState } from 'react';
import GlassModal from '../ui/GlassModal';
import GlassButton from '../ui/GlassButton';
import { useSleepTimer } from '../../hooks/useSleepTimer';
import { formatTime } from '../../utils/formatTime';

interface SleepTimerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SleepTimer({ isOpen, onClose }: SleepTimerProps) {
  const { isActive, timeRemaining, startTimer, stopTimer, setEndAtTrack } = useSleepTimer();
  const [customMinutes, setCustomMinutes] = useState('60');

  const presets = [
    { label: '15m', value: 15 },
    { label: '30m', value: 30 },
    { label: '45m', value: 45 },
    { label: '1h', value: 60 },
    { label: '2h', value: 120 },
  ];

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Sleep Timer">
      <div className="flex flex-col gap-6 pt-2">
        {isActive ? (
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="w-32 h-32 rounded-full border-4 border-white/20 flex items-center justify-center relative">
              <svg className="absolute inset-0 w-full h-full -rotate-90 text-white" viewBox="0 0 100 100">
                <circle
                  cx="50" cy="50" r="46"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeDasharray={`${(timeRemaining / (parseInt(customMinutes) * 60)) * 289} 289`}
                  className="transition-all duration-1000 ease-linear"
                />
              </svg>
              <span className="text-3xl font-bold text-white font-mono">
                {formatTime(timeRemaining)}
              </span>
            </div>
            <p className="text-white/60">Music will stop in {Math.ceil(timeRemaining / 60)} minutes</p>
            <GlassButton 
              onClick={stopTimer}
              className="mt-4 bg-red-500/20 text-red-400 hover:bg-red-500/30 px-8"
            >
              Cancel Timer
            </GlassButton>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-2">
              {presets.map(preset => (
                <GlassButton
                  key={preset.value}
                  onClick={() => {
                    startTimer(preset.value);
                    setCustomMinutes(preset.value.toString());
                  }}
                  className="py-3 px-0 flex items-center justify-center text-sm font-medium hover:bg-white/20"
                >
                  {preset.label}
                </GlassButton>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <span className="text-white/70 text-sm whitespace-nowrap">Custom:</span>
              <div className="flex-1 flex items-center bg-white/10 rounded-xl px-4 py-2 border border-white/10">
                <input
                  type="number"
                  min="1"
                  max="480"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  className="bg-transparent w-full outline-none text-white font-medium"
                />
                <span className="text-white/50 text-sm">min</span>
              </div>
              <GlassButton 
                onClick={() => startTimer(parseInt(customMinutes) || 60)}
                className="bg-white/20 hover:bg-white/30 text-white px-6"
              >
                Start
              </GlassButton>
            </div>

            <div className="w-full h-px bg-white/10 my-2" />

            <GlassButton
              onClick={() => {
                setEndAtTrack(true);
                onClose();
              }}
              className="w-full py-4 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <span>Stop at end of track</span>
            </GlassButton>
          </>
        )}
      </div>
    </GlassModal>
  );
}
