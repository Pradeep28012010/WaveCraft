import { useState, useEffect, useRef } from 'react';
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  useSpring,
  useMotionValueEvent,
  useInView,
  animate,
} from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import ParticleCanvas from './ParticleCanvas';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Data
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const NOISE_BG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

const EASE_OUT_EXPO: [number, number, number, number] = [0.22, 1, 0.36, 1];

const FEATURES = [
  {
    badge: '320kbps FLAC',
    title: 'Studio Master Quality',
    desc: 'Every track streams in full 320kbps — bit-perfect, full dynamic range, zero compression artifacts. Hear the music exactly as it was mastered in the studio.',
    highlight: 'Zero-loss playback · Full headroom',
    accent: '#fa2d48',
  },
  {
    badge: '360° HRTF',
    title: '3D Spatial Audio',
    desc: 'True binaural 360° HRTF rendering places every instrument in physical 3D space around your head. Feel the concert stage revolving around you.',
    highlight: 'Hardware-accelerated spatial DSP',
    accent: '#818cf8',
  },
  {
    badge: '7 GPU Styles',
    title: 'Real-time Visualizers',
    desc: 'From deep-space nebulae to particle starfields — seven GPU-accelerated visual engines that breathe with your music at native refresh rates.',
    highlight: 'Canvas + WebGL at 120fps',
    accent: '#0ea5e9',
  },
  {
    badge: 'Pro-Grade DSP',
    title: 'Studio FX Suite',
    desc: '10-band parametric EQ, convolution reverb, nightcore pitch, slowed+reverb, ambient soundscapes — a full mastering chain running entirely in your browser.',
    highlight: 'Web Audio biquad cascade',
    accent: '#f59e0b',
  },
];

const SHOWCASE = [
  { icon: '✨', title: 'AI Vibe DJ', desc: 'Describe your mood and let AI curate the perfect radio mix in real-time.', gradient: 'from-rose-500/20 to-pink-500/20' },
  { icon: '🎸', title: 'Live Jam Rooms', desc: 'Listen together in sync — chat, react, and share the moment live.', gradient: 'from-emerald-500/20 to-teal-500/20' },
  { icon: '🎛️', title: 'DJ Console', desc: 'Dual-deck turntable with crossfader, BPM sync, loop pads & live mixing.', gradient: 'from-purple-500/20 to-indigo-500/20' },
  { icon: '🌌', title: 'Sonic Galaxy', desc: 'A 3D interactive star-map where every star is a song. Explore your taste.', gradient: 'from-cyan-500/20 to-blue-500/20' },
  { icon: '🎤', title: 'Synced Lyrics', desc: 'Time-synced karaoke-style lyrics that scroll with every beat of the music.', gradient: 'from-amber-500/20 to-orange-500/20' },
  { icon: '🎴', title: 'Wave Cards', desc: 'Generate and share stunning aesthetic cards of your now-playing tracks.', gradient: 'from-fuchsia-500/20 to-purple-500/20' },
];

const STATS: { value: number; suffix: string; label: string }[] = [
  { value: 320, suffix: 'kbps', label: 'Studio Quality' },
  { value: 7, suffix: '', label: 'Visualizer Styles' },
  { value: 10, suffix: '-Band', label: 'Parametric EQ' },
  { value: 360, suffix: '°', label: 'Spatial Audio' },
];

const GRID_FEATURES = [
  { icon: '📡', title: 'Offline Vault', desc: 'Cache tracks in IndexedDB for instant offline playback with zero latency.' },
  { icon: '⚡', title: 'Smart Queue', desc: 'Drag-reorder queue with add-next, crossfade transitions, and repeat modes.' },
  { icon: '⌨️', title: 'Command Palette', desc: 'Ctrl+K power search — find any track, artist, playlist, or action instantly.' },
  { icon: '🌙', title: 'Focus Timer', desc: 'Built-in Pomodoro & sleep timer with generative ambient soundscapes.' },
  { icon: '📱', title: 'Install Anywhere', desc: 'Progressive Web App — install on desktop, tablet, or phone with one click.' },
  { icon: '🔗', title: 'Share Wave Cards', desc: 'Generate and share beautiful visual music cards across your socials.' },
];

const TECH_BADGES = [
  '320kbps Studio', '3D Spatial Audio', '10-Band EQ', 'Zero Ads Forever',
  'PWA Ready', 'Synced Lyrics', 'AI Vibe DJ', 'Live Jam Rooms',
  'Nightcore & Reverb', 'Canvas Visualizers', 'Offline Vault', 'Open Source',
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Animated Counter
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function AnimatedCounter({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 2.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.floor(v)),
    });
    return () => controls.stop();
  }, [inView, value]);

  return (
    <span ref={ref} className="tabular-nums">
      {display}
      {suffix}
    </span>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Preloader
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function Preloader({ onComplete }: { onComplete: () => void }) {
  const [percent, setPercent] = useState(0);
  const [visible, setVisible] = useState(true);
  const cbRef = useRef(onComplete);
  cbRef.current = onComplete;

  useEffect(() => {
    const controls = animate(0, 100, {
      duration: 2.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setPercent(Math.floor(v)),
      onComplete: () => {
        setTimeout(() => {
          setVisible(false);
          setTimeout(() => cbRef.current(), 100);
        }, 400);
      },
    });
    return () => controls.stop();
  }, []);

  const bars = [
    { x: 25, y1: 35, y2: 65 },
    { x: 37.5, y1: 25, y2: 75 },
    { x: 50, y1: 18, y2: 82 },
    { x: 62.5, y1: 25, y2: 75 },
    { x: 75, y1: 35, y2: 65 },
  ];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          exit={{
            clipPath: 'inset(0 0 100% 0)',
            transition: { duration: 0.85, ease: [0.76, 0, 0.24, 1] },
          }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#050508]"
        >
          <svg className="w-20 h-20" viewBox="0 0 100 100" fill="none">
            <motion.rect
              x="5" y="5" width="90" height="90" rx="22"
              stroke="url(#pl-g)" strokeWidth="2"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.2, ease: 'easeInOut' }}
            />
            {bars.map((b, i) => (
              <motion.line
                key={i}
                x1={b.x} y1={b.y1} x2={b.x} y2={b.y2}
                stroke="url(#pl-g)" strokeWidth="6" strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.35 + i * 0.1 }}
              />
            ))}
            <defs>
              <linearGradient id="pl-g" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fa2d48" />
                <stop offset="100%" stopColor="#7c3aed" />
              </linearGradient>
            </defs>
          </svg>

          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="mt-6 text-base font-bold tracking-[0.25em] uppercase text-white/80"
          >
            WaveCraft
          </motion.p>

          <div className="mt-3 font-mono text-2xl font-light text-[#fa2d48] tabular-nums">
            {percent}%
          </div>

          <div className="mt-5 h-[2px] w-48 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full bg-gradient-to-r from-[#fa2d48] to-[#7c3aed]"
              style={{ width: `${percent}%` }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Navbar
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function LandingNav({ show }: { show: boolean }) {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <motion.nav
      initial={{ y: -30, opacity: 0 }}
      animate={show ? { y: 0, opacity: 1 } : undefined}
      transition={{ delay: 0.1, duration: 0.6, ease: EASE_OUT_EXPO }}
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 lg:px-12 py-4 transition-all duration-500 ${
        scrolled
          ? 'bg-[#050508]/80 backdrop-blur-2xl border-b border-white/[0.06] shadow-xl shadow-black/20'
          : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <svg className="w-8 h-8 flex-shrink-0" viewBox="0 0 100 100" fill="none">
          <rect x="5" y="5" width="90" height="90" rx="22" fill="url(#nav-g)" />
          <path
            d="M25 35v30M37.5 25v50M50 18v64M62.5 25v50M75 35v30"
            stroke="white" strokeWidth="6" strokeLinecap="round"
          />
          <defs>
            <linearGradient id="nav-g" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fa2d48" />
              <stop offset="100%" stopColor="#7c3aed" />
            </linearGradient>
          </defs>
        </svg>
        <span className="text-lg font-extrabold tracking-tight text-white hidden sm:inline">
          WaveCraft
        </span>
      </div>

      <button
        onClick={() => navigate('/')}
        className="px-5 py-2.5 rounded-full bg-[#fa2d48] text-white text-sm font-bold hover:bg-[#e11d48] hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#fa2d48]/25 cursor-pointer"
      >
        Launch App
      </button>
    </motion.nav>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Hero Section
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const HERO_WORDS = ['Where', 'Sound', 'Becomes', 'Art.'];
const EQ_HEIGHTS = [0.28, 0.65, 0.95, 0.72, 0.45, 0.88, 0.35, 0.78, 0.55, 0.92, 0.42, 0.68];

function HeroSection({ loaded }: { loaded: boolean }) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, -200]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.65], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.65], [1, 0.95]);

  return (
    <section
      ref={ref}
      className="relative h-screen min-h-[700px] flex items-center justify-center overflow-hidden"
    >
      {/* Aurora Gradient Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ x: [0, 40, -30, 0], y: [0, -60, 30, 0], scale: [1, 1.15, 0.9, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-[15%] left-[10%] w-[500px] h-[500px] rounded-full bg-[#fa2d48]/20 blur-[120px] will-change-transform"
        />
        <motion.div
          animate={{ x: [0, -50, 40, 0], y: [0, 40, -40, 0], scale: [1, 0.9, 1.2, 1] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-[15%] right-[5%] w-[550px] h-[550px] rounded-full bg-[#7c3aed]/[0.18] blur-[140px] will-change-transform"
        />
        <motion.div
          animate={{ x: [0, 30, -40, 0], y: [0, 50, -30, 0], scale: [0.9, 1.1, 1, 0.9] }}
          transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-[15%] left-[25%] w-[450px] h-[450px] rounded-full bg-[#0ea5e9]/15 blur-[130px] will-change-transform"
        />
      </div>

      {/* Particle Canvas */}
      <ParticleCanvas />

      {/* Noise Overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: NOISE_BG }}
      />

      {/* Content */}
      <motion.div
        style={{ y: heroY, opacity: heroOpacity, scale: heroScale }}
        className="relative z-10 text-center px-6 max-w-5xl mx-auto"
      >
        {/* Badge */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={loaded ? { y: 0, opacity: 1 } : undefined}
          transition={{ delay: 0.15, duration: 0.6, ease: EASE_OUT_EXPO }}
          className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white/[0.07] border border-white/[0.12] backdrop-blur-xl mb-8"
        >
          <span className="w-2 h-2 rounded-full bg-[#fa2d48] animate-pulse" />
          <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-white/70">
            Liquid Glass Audio Engine
          </span>
        </motion.div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-7xl lg:text-[5.5rem] font-extrabold tracking-tight leading-[0.95] mb-7">
          {HERO_WORDS.map((word, i) => (
            <motion.span
              key={word}
              initial={{ y: 70, opacity: 0, rotateX: -20 }}
              animate={loaded ? { y: 0, opacity: 1, rotateX: 0 } : undefined}
              transition={{ delay: 0.25 + i * 0.12, duration: 0.8, ease: EASE_OUT_EXPO }}
              className={`inline-block mr-3 sm:mr-5 ${
                word === 'Sound' || word === 'Art.'
                  ? 'bg-gradient-to-r from-[#fa2d48] to-[#7c3aed] bg-clip-text text-transparent'
                  : 'text-white'
              }`}
            >
              {word}
            </motion.span>
          ))}
        </h1>

        {/* Subtitle */}
        <motion.p
          initial={{ y: 24, opacity: 0 }}
          animate={loaded ? { y: 0, opacity: 1 } : undefined}
          transition={{ delay: 0.8, duration: 0.7, ease: EASE_OUT_EXPO }}
          className="text-base sm:text-lg lg:text-xl text-white/45 max-w-2xl mx-auto leading-relaxed mb-10"
        >
          Stream in 320kbps studio quality with 3D spatial audio, real-time visualizers,
          a 10-band equalizer, synced lyrics, and zero ads — all in your browser.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={loaded ? { y: 0, opacity: 1 } : undefined}
          transition={{ delay: 1.0, duration: 0.6, ease: EASE_OUT_EXPO }}
          className="flex flex-wrap items-center justify-center gap-4"
        >
          <button
            onClick={() => navigate('/')}
            className="group relative px-8 py-3.5 rounded-full bg-[#fa2d48] text-white font-bold text-sm overflow-hidden shadow-[0_8px_32px_rgba(250,45,72,0.4)] hover:shadow-[0_14px_44px_rgba(250,45,72,0.55)] hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer"
          >
            <span className="relative z-10 flex items-center gap-2.5">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Launch WaveCraft
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-[#fa2d48] to-[#e11d48] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </button>

          <button
            onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            className="px-7 py-3.5 rounded-full border border-white/15 bg-white/[0.06] backdrop-blur-xl text-white font-semibold text-sm hover:bg-white/[0.12] hover:border-white/25 transition-all duration-300 cursor-pointer"
          >
            Explore Features
          </button>
        </motion.div>

        {/* Floating Equalizer Bars */}
        {loaded && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.3, duration: 0.8 }}
            className="flex items-end justify-center gap-[5px] mt-16 h-8"
          >
            {EQ_HEIGHTS.map((h, i) => (
              <motion.div
                key={i}
                animate={{ scaleY: [h, h * 0.25, h, h * 0.55, h] }}
                transition={{
                  duration: 1.2 + i * 0.08,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: i * 0.05,
                }}
                className="w-[3px] rounded-full origin-bottom bg-gradient-to-t from-[#fa2d48]/50 to-[#7c3aed]/50"
                style={{ height: 32 }}
              />
            ))}
          </motion.div>
        )}
      </motion.div>

      {/* Scroll Indicator */}
      {loaded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        >
          <span className="text-[10px] font-semibold tracking-[0.3em] uppercase text-white/25">
            Scroll
          </span>
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            className="w-5 h-8 rounded-full border border-white/20 flex items-start justify-center pt-1.5"
          >
            <div className="w-1 h-1.5 rounded-full bg-white/50" />
          </motion.div>
        </motion.div>
      )}
    </section>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Tech Badge Marquee
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function TechBadges() {
  const doubled = [...TECH_BADGES, ...TECH_BADGES];
  return (
    <section className="py-10 overflow-hidden border-y border-white/[0.05]">
      <div className="landing-marquee flex">
        {doubled.map((badge, i) => (
          <div
            key={i}
            className="flex-shrink-0 px-5 py-2 mx-3 rounded-full border border-white/[0.08] bg-white/[0.03] text-[11px] text-white/50 font-semibold tracking-[0.15em] uppercase whitespace-nowrap"
          >
            {badge}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Feature Scrollytelling
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function FeatureShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  const sp = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    setActiveStep(Math.min(FEATURES.length - 1, Math.max(0, Math.floor(v * FEATURES.length))));
  });

  // Step text transforms (hardcoded for hook rules compliance)
  const o0 = useTransform(sp, [0.0, 0.04, 0.20, 0.25], [0, 1, 1, 0]);
  const y0 = useTransform(sp, [0.0, 0.04, 0.20, 0.25], [50, 0, 0, -50]);

  const o1 = useTransform(sp, [0.25, 0.29, 0.45, 0.50], [0, 1, 1, 0]);
  const y1 = useTransform(sp, [0.25, 0.29, 0.45, 0.50], [50, 0, 0, -50]);

  const o2 = useTransform(sp, [0.50, 0.54, 0.70, 0.75], [0, 1, 1, 0]);
  const y2 = useTransform(sp, [0.50, 0.54, 0.70, 0.75], [50, 0, 0, -50]);

  const o3 = useTransform(sp, [0.75, 0.79, 1.0], [0, 1, 1]);
  const y3 = useTransform(sp, [0.75, 0.79, 1.0], [50, 0, 0]);

  const stepStyles = [
    { opacity: o0, y: y0 },
    { opacity: o1, y: y1 },
    { opacity: o2, y: y2 },
    { opacity: o3, y: y3 },
  ];

  // Holographic visual transforms
  const ring1Rot = useTransform(sp, [0, 1], [0, 360]);
  const ring2Rot = useTransform(sp, [0, 1], [0, -280]);
  const ring3Rot = useTransform(sp, [0, 1], [0, 540]);
  const orbScale = useTransform(sp, [0, 0.5, 1], [0.85, 1.12, 1]);

  const activeColor = FEATURES[activeStep]?.accent || '#fa2d48';

  return (
    <section id="features" ref={containerRef} className="relative h-[400vh]">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden px-6 lg:px-16">
        <div className="grid w-full max-w-7xl mx-auto grid-cols-1 lg:grid-cols-2 items-center gap-12 lg:gap-20">
          {/* Text Column */}
          <div className="relative h-[320px] w-full">
            {FEATURES.map((feat, idx) => (
              <motion.div
                key={idx}
                style={stepStyles[idx]}
                className="absolute inset-0 flex flex-col justify-center"
              >
                <div className="mb-4 inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 backdrop-blur-md">
                  <span
                    className="h-1.5 w-1.5 rounded-full animate-pulse"
                    style={{ backgroundColor: feat.accent }}
                  />
                  <span className="text-[11px] font-bold tracking-[0.15em] uppercase" style={{ color: feat.accent }}>
                    {feat.badge}
                  </span>
                </div>

                <h3 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
                  {feat.title}
                </h3>

                <p className="mt-4 text-sm sm:text-base leading-relaxed text-white/45 max-w-lg">
                  {feat.desc}
                </p>

                <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-white/60">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {feat.highlight}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Holographic Audio Orb */}
          <div className="relative hidden lg:flex items-center justify-center">
            <div className="relative w-80 h-80">
              {/* Ambient glow */}
              <motion.div
                className="absolute inset-0 rounded-full blur-[70px] transition-colors duration-700 will-change-transform"
                style={{ scale: orbScale, background: `radial-gradient(circle, ${activeColor}30 0%, transparent 70%)` }}
              />

              {/* Ring 1 */}
              <motion.div
                style={{ rotate: ring1Rot }}
                className="absolute inset-2 rounded-full border border-white/[0.08]"
              >
                <div
                  className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full shadow-lg transition-colors duration-700"
                  style={{ backgroundColor: activeColor, boxShadow: `0 0 12px ${activeColor}80` }}
                />
              </motion.div>

              {/* Ring 2 */}
              <motion.div
                style={{ rotate: ring2Rot }}
                className="absolute inset-10 rounded-full border border-dashed border-white/[0.06]"
              >
                <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white/30" />
              </motion.div>

              {/* Ring 3 */}
              <motion.div
                style={{ rotate: ring3Rot }}
                className="absolute inset-[4.5rem] rounded-full border border-white/[0.05]"
              >
                <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white/20" />
              </motion.div>

              {/* Center Glass Panel */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-28 h-28 rounded-3xl liquid-glass border border-white/15 flex flex-col items-center justify-center shadow-2xl shadow-black/40 gap-2">
                  <div
                    className="w-8 h-8 rounded-full transition-colors duration-700"
                    style={{
                      backgroundColor: `${activeColor}30`,
                      boxShadow: `0 0 24px ${activeColor}40, inset 0 0 8px ${activeColor}20`,
                    }}
                  />
                  <span
                    className="text-[9px] font-bold tracking-wider uppercase transition-colors duration-700"
                    style={{ color: activeColor }}
                  >
                    {FEATURES[activeStep]?.badge}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bullets */}
        <div className="absolute right-6 lg:right-10 top-1/2 -translate-y-1/2 flex flex-col gap-3">
          {FEATURES.map((_, i) => (
            <div
              key={i}
              className="transition-all duration-300 rounded-full"
              style={{
                width: activeStep === i ? 32 : 10,
                height: 10,
                backgroundColor: activeStep === i ? activeColor : 'rgba(255,255,255,0.15)',
                boxShadow: activeStep === i ? `0 0 12px ${activeColor}60` : 'none',
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   App Showcase — Horizontal Scroller
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function AppShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });
  const smooth = useSpring(scrollYProgress, { stiffness: 80, damping: 25, restDelta: 0.001 });
  const x = useTransform(smooth, [0, 1], ['5%', '-55%']);

  return (
    <section ref={containerRef} className="relative h-[300vh]">
      <div className="sticky top-0 h-screen flex items-center overflow-hidden">
        {/* Header */}
        <div className="absolute top-16 left-8 lg:left-16 z-10">
          <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-white/60">
            Explore
          </span>
          <h2 className="text-3xl lg:text-4xl font-extrabold text-white mt-1 tracking-tight">
            Built for Every Vibe
          </h2>
        </div>

        {/* Cards */}
        <motion.div style={{ x }} className="flex gap-6 pl-8 lg:pl-16 pt-24">
          {SHOWCASE.map((item, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -10, scale: 1.02, transition: { duration: 0.25, ease: EASE_OUT_EXPO } }}
              className={`relative h-[420px] w-[300px] lg:w-[340px] shrink-0 rounded-3xl border border-white/[0.08] bg-gradient-to-br ${item.gradient} backdrop-blur-xl flex flex-col justify-end p-8 overflow-hidden shadow-2xl shadow-black/30 cursor-pointer group`}
            >
              {/* Top decorative line */}
              <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

              <span className="text-5xl mb-5 group-hover:scale-110 group-hover:-rotate-6 transition-all duration-300 inline-block">
                {item.icon}
              </span>
              <h3 className="text-xl font-bold text-white">{item.title}</h3>
              <p className="text-sm text-white/50 mt-2 leading-relaxed">{item.desc}</p>

              {/* Hover glow */}
              <div className="absolute inset-0 rounded-3xl border border-white/0 group-hover:border-white/15 transition-all duration-500 pointer-events-none" />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Stats Section
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function StatsSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section ref={ref} className="py-24 lg:py-32 px-6 lg:px-16">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={inView ? { y: 0, opacity: 1 } : undefined}
          transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
          className="text-center mb-16"
        >
          <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-[#fa2d48]">
            By the Numbers
          </span>
          <h2 className="text-3xl lg:text-4xl font-extrabold text-white mt-2 tracking-tight">
            Engineered for Fidelity
          </h2>
        </motion.div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {STATS.map((stat, i) => (
            <motion.div
              key={i}
              initial={{ y: 40, opacity: 0 }}
              animate={inView ? { y: 0, opacity: 1 } : undefined}
              transition={{ delay: 0.1 + i * 0.1, duration: 0.6, ease: EASE_OUT_EXPO }}
              className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 lg:p-8 text-center overflow-hidden group hover:border-white/15 transition-colors duration-300"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
              <div className="text-4xl lg:text-5xl font-extrabold text-white mb-2">
                <AnimatedCounter value={stat.value} suffix={stat.suffix} />
              </div>
              <div className="text-xs font-semibold tracking-wider uppercase text-white/40">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Feature Grid
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function FeatureGrid() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section ref={ref} className="py-20 lg:py-28 px-6 lg:px-16">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={inView ? { y: 0, opacity: 1 } : undefined}
          transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
          className="text-center mb-14"
        >
          <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-[#818cf8]">
            Everything Built In
          </span>
          <h2 className="text-3xl lg:text-4xl font-extrabold text-white mt-2 tracking-tight">
            Every Feature You Need
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
          {GRID_FEATURES.map((feat, i) => (
            <motion.div
              key={i}
              initial={{ y: 30, opacity: 0 }}
              animate={inView ? { y: 0, opacity: 1 } : undefined}
              transition={{ delay: 0.05 + i * 0.08, duration: 0.6, ease: EASE_OUT_EXPO }}
              whileHover={{ y: -4, scale: 1.01, transition: { duration: 0.2 } }}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 lg:p-7 cursor-pointer group hover:border-white/15 hover:bg-white/[0.04] transition-all duration-300"
            >
              <span className="text-3xl block mb-4 group-hover:scale-110 transition-transform duration-300">
                {feat.icon}
              </span>
              <h3 className="text-base font-bold text-white mb-1.5">{feat.title}</h3>
              <p className="text-sm text-white/40 leading-relaxed">{feat.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Footer CTA
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function FooterCTA() {
  const navigate = useNavigate();
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section ref={ref} className="relative py-28 lg:py-36 px-6 overflow-hidden">
      {/* Background aurora */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-full bg-[#fa2d48]/15 blur-[150px]" />
        <div className="absolute top-1/2 left-1/3 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-[#7c3aed]/12 blur-[130px]" />
      </div>

      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={inView ? { y: 0, opacity: 1 } : undefined}
        transition={{ duration: 0.8, ease: EASE_OUT_EXPO }}
        className="relative z-10 max-w-3xl mx-auto text-center"
      >
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight mb-5">
          Ready to Experience Sound
          <br />
          <span className="bg-gradient-to-r from-[#fa2d48] to-[#7c3aed] bg-clip-text text-transparent">
            Like Never Before?
          </span>
        </h2>
        <p className="text-base text-white/40 max-w-lg mx-auto mb-10">
          No sign-up. No downloads. No ads. Just pure, studio-grade audio in your browser — forever free.
        </p>

        <button
          onClick={() => navigate('/')}
          className="group relative px-10 py-4 rounded-full bg-[#fa2d48] text-white font-bold text-base overflow-hidden shadow-[0_12px_40px_rgba(250,45,72,0.4)] hover:shadow-[0_16px_52px_rgba(250,45,72,0.55)] hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer"
        >
          <span className="relative z-10 flex items-center gap-3">
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            Enter WaveCraft
          </span>
          <div className="absolute inset-0 bg-gradient-to-r from-[#fa2d48] to-[#e11d48] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </button>
      </motion.div>

      {/* Bottom bar */}
      <div className="relative z-10 mt-20 pt-8 border-t border-white/[0.06] max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/30">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5" viewBox="0 0 100 100" fill="none">
            <rect x="5" y="5" width="90" height="90" rx="22" fill="url(#ft-g)" />
            <path d="M25 35v30M37.5 25v50M50 18v64M62.5 25v50M75 35v30" stroke="white" strokeWidth="6" strokeLinecap="round" />
            <defs>
              <linearGradient id="ft-g" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fa2d48" />
                <stop offset="100%" stopColor="#7c3aed" />
              </linearGradient>
            </defs>
          </svg>
          <span className="font-semibold text-white/50">WaveCraft</span>
        </div>
        <span>Crafted with precision. Open Source. Zero ads, forever.</span>
      </div>
    </section>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Landing Page — Main Export
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export default function LandingPage() {
  const [loaded, setLoaded] = useState(false);

  // Override global overflow to enable native window scroll (html/body have overflow:hidden by default)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    html.style.overflow = 'auto';
    html.style.height = 'auto';
    html.style.scrollBehavior = 'smooth';
    body.style.overflow = 'auto';
    body.style.height = 'auto';
    if (root) {
      root.style.overflow = 'visible';
      root.style.height = 'auto';
    }

    // Scroll to top on mount
    window.scrollTo(0, 0);

    return () => {
      html.style.overflow = '';
      html.style.height = '';
      html.style.scrollBehavior = '';
      body.style.overflow = '';
      body.style.height = '';
      if (root) {
        root.style.overflow = '';
        root.style.height = '';
      }
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-[#050508] text-white selection:bg-[#fa2d48]/30">
      {/* Preloader */}
      <Preloader onComplete={() => setLoaded(true)} />

      {/* Fixed Navbar */}
      <LandingNav show={loaded} />

      {/* Main Content Sections */}
      <HeroSection loaded={loaded} />
      <TechBadges />
      <FeatureShowcase />
      <AppShowcase />
      <StatsSection />
      <FeatureGrid />
      <FooterCTA />
    </div>
  );
}
