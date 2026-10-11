import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function SetupPage() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Initializing Web Audio DSP Engine...');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const steps = [
      { at: 20, text: 'Calibrating 10-Band Equalizer Presets...' },
      { at: 50, text: 'Activating 3D Spatial Audio & Binaural Engine...' },
      { at: 75, text: 'Configuring Start Menu & Desktop Shortcuts...' },
      { at: 92, text: 'Optimizing IndexedDB Offline Audio Vault...' },
      { at: 100, text: 'WaveCraft Studio Engine Ready!' }
    ];

    let current = 0;
    const interval = setInterval(() => {
      current += Math.floor(Math.random() * 8) + 6;
      if (current >= 100) {
        current = 100;
        clearInterval(interval);
        setProgress(100);
        setStatusText('WaveCraft Studio Engine Ready!');
        setIsReady(true);
      } else {
        setProgress(current);
        const matchingStep = steps.find((s) => current <= s.at);
        if (matchingStep) {
          setStatusText(matchingStep.text);
        }
      }
    }, 120);

    return () => clearInterval(interval);
  }, []);

  const handleLaunch = () => {
    if (window.electronAPI?.finishSetup) {
      window.electronAPI.finishSetup();
    }
    navigate('/');
  };

  return (
    <div className="fixed inset-0 bg-[#06060b] flex items-center justify-center p-4 select-none overflow-hidden">
      {/* Ambient Aurora Glow */}
      <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full bg-rose-600/25 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full bg-indigo-600/30 blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-purple-600/15 blur-3xl pointer-events-none" />

      {/* Floating Liquid Glass Setup Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-[420px] rounded-3xl p-7 liquid-glass border border-white/20 shadow-2xl relative z-10 flex flex-col items-center text-center"
      >
        {/* Top Window Control Buttons */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          {window.electronAPI && (
            <>
              <button
                type="button"
                onClick={() => window.electronAPI?.minimize()}
                className="w-3 h-3 rounded-full bg-amber-500/80 hover:bg-amber-400 transition cursor-pointer"
                title="Minimize"
              />
              <button
                type="button"
                onClick={() => window.electronAPI?.close()}
                className="w-3 h-3 rounded-full bg-rose-500/80 hover:bg-rose-400 transition cursor-pointer"
                title="Close"
              />
            </>
          )}
        </div>

        {/* Glowing Logo Header */}
        <div className="relative w-20 h-20 mb-4 flex items-center justify-center">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#fa2d48] to-[#7c3aed] blur-lg opacity-75 animate-pulse" />
          <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-[#fa2d48] to-[#7c3aed] border border-white/25 flex items-center justify-center shadow-lg">
            <div className="flex items-end gap-1.5 h-7">
              <span className="w-1 bg-white rounded-full animate-[pulse_1.2s_ease-in-out_infinite_0.1s] h-4" />
              <span className="w-1 bg-white rounded-full animate-[pulse_1.2s_ease-in-out_infinite_0.3s] h-6" />
              <span className="w-1 bg-white rounded-full animate-[pulse_1.2s_ease-in-out_infinite_0.5s] h-7" />
              <span className="w-1 bg-white rounded-full animate-[pulse_1.2s_ease-in-out_infinite_0.2s] h-5" />
              <span className="w-1 bg-white rounded-full animate-[pulse_1.2s_ease-in-out_infinite_0.4s] h-4" />
            </div>
          </div>
        </div>

        <h1 className="text-xl font-black tracking-tight text-white mb-1">WaveCraft Studio Pro</h1>
        <p className="text-xs text-white/60 mb-5">Liquid Glass Audio Workstation • 320kbps HD</p>

        {/* 4 Feature Badges */}
        <div className="grid grid-cols-2 gap-2 w-full mb-6 text-left">
          <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
            <div className="text-[11px] font-extrabold text-rose-400 mb-0.5">✨ AI Vibe DJ</div>
            <div className="text-[10px] text-white/50 leading-tight">Prompt-driven mix flow</div>
          </div>
          <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
            <div className="text-[11px] font-extrabold text-cyan-400 mb-0.5">🎧 3D Spatial Audio</div>
            <div className="text-[10px] text-white/50 leading-tight">360° binaural immersion</div>
          </div>
          <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
            <div className="text-[11px] font-extrabold text-purple-400 mb-0.5">⚡ 10-Band EQ</div>
            <div className="text-[10px] text-white/50 leading-tight">Studio frequency DSP</div>
          </div>
          <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
            <div className="text-[11px] font-extrabold text-emerald-400 mb-0.5">📥 Offline Vault</div>
            <div className="text-[10px] text-white/50 leading-tight">Zero-latency playback</div>
          </div>
        </div>

        {/* Setup Progress */}
        <div className="w-full space-y-2 mb-5">
          <div className="flex justify-between items-center text-xs font-bold">
            <span className="text-white/80 truncate text-left">{statusText}</span>
            <span className="text-cyan-300 tabular-nums ml-2">{progress}%</span>
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-400 rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Action Button */}
        {isReady ? (
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleLaunch}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#fa2d48] to-[#7c3aed] text-white font-black text-xs tracking-wider uppercase shadow-lg shadow-rose-500/30 hover:opacity-95 active:scale-[0.98] transition cursor-pointer flex items-center justify-center gap-2"
          >
            <span>Launch WaveCraft Studio</span>
            <span>→</span>
          </motion.button>
        ) : (
          <div className="text-[11px] text-white/40 font-medium py-2">
            Preparing your studio environment...
          </div>
        )}
      </motion.div>
    </div>
  );
}
