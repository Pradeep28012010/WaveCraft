import { useEffect, useRef, useCallback, memo } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  color: string;
  pulsePhase: number;
}

const COLORS = ['#fa2d48', '#7c3aed', '#818cf8', '#0ea5e9', '#f472b6', '#a78bfa'];
const CONNECTION_DIST = 140;

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef(0);
  const visibleRef = useRef(true);
  const timeRef = useRef(0);

  const performanceProfile = useSettingsStore((s) => s.performanceProfile ?? 'ultra');
  const particleCount =
    performanceProfile === 'ultra' ? 120 : performanceProfile === 'performance' ? 32 : 80;

  const initParticles = useCallback((w: number, h: number) => {
    particlesRef.current = Array.from({ length: particleCount }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      z: Math.random() * 0.5 + 0.5,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      size: Math.random() * 2.5 + 0.8,
      opacity: Math.random() * 0.4 + 0.25,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      pulsePhase: Math.random() * Math.PI * 2,
    }));
  }, [particleCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const parent = canvas.parentElement;
      w = parent?.clientWidth || window.innerWidth;
      h = parent?.clientHeight || window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (particlesRef.current.length === 0) initParticles(w, h);
    };

    const handleMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const handleMouseLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };
    const handleVisibility = () => {
      visibleRef.current = !document.hidden;
    };

    resize();
    window.addEventListener('resize', resize);
    canvas.addEventListener('mousemove', handleMouse);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('visibilitychange', handleVisibility);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (!visibleRef.current) return;

      timeRef.current += 0.016;
      const t = timeRef.current;
      ctx.clearRect(0, 0, w, h);

      const particles = particlesRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Mouse repulsion
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 130 && dist > 0) {
          const force = ((130 - dist) / 130) * 0.6;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }

        // Subtle drift
        p.vx += Math.sin(t * 0.3 + p.pulsePhase) * 0.003;
        p.vy += Math.cos(t * 0.2 + p.pulsePhase) * 0.003;

        // Damping
        p.vx *= 0.985;
        p.vy *= 0.985;

        // Move
        p.x += p.vx * p.z;
        p.y += p.vy * p.z;

        // Wrap edges
        if (p.x < -30) p.x = w + 30;
        if (p.x > w + 30) p.x = -30;
        if (p.y < -30) p.y = h + 30;
        if (p.y > h + 30) p.y = -30;

        // Pulsing opacity
        const pulse = Math.sin(t * 1.5 + p.pulsePhase) * 0.15;
        const alpha = (p.opacity + pulse) * p.z;

        // Draw glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.z * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha * 0.12;
        ctx.fill();

        // Draw core
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.z, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.fill();
      }

      // Connections
      ctx.globalAlpha = 1;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const ddx = a.x - b.x;
          const ddy = a.y - b.y;
          const d = Math.sqrt(ddx * ddx + ddy * ddy);
          if (d < CONNECTION_DIST) {
            const lineAlpha = 0.06 * (1 - d / CONNECTION_DIST) * Math.min(a.z, b.z);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(255,255,255,${lineAlpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouse);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [initParticles]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ opacity: 0.6 }}
    />
  );
}

const MemoizedParticleCanvas = memo(ParticleCanvas);
export default MemoizedParticleCanvas;
