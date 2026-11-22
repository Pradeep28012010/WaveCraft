import { useEffect, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import type { ScrollMotionMode, ScrollMotionIntensity } from '../types';

interface IntensityFactors {
  maxSkew: number;
  skewFactor: number;
  maxBlur: number;
  blurFactor: number;
  maxGlassBlur: number;
  glassBlurFactor: number;
  maxGlassSat: number;
  glassSatFactor: number;
  maxScale: number;
  scaleFactor: number;
}

const INTENSITY_CONFIGS: Record<ScrollMotionIntensity, IntensityFactors> = {
  subtle: {
    maxSkew: 0.35,
    skewFactor: 0.05,
    maxBlur: 1.2,
    blurFactor: 0.15,
    maxGlassBlur: 8,
    glassBlurFactor: 0.6,
    maxGlassSat: 25,
    glassSatFactor: 2.0,
    maxScale: 1.004,
    scaleFactor: 0.0003
  },
  balanced: {
    maxSkew: 0.65,
    skewFactor: 0.09,
    maxBlur: 2.2,
    blurFactor: 0.25,
    maxGlassBlur: 14,
    glassBlurFactor: 1.0,
    maxGlassSat: 45,
    glassSatFactor: 3.5,
    maxScale: 1.008,
    scaleFactor: 0.0006
  },
  intense: {
    maxSkew: 1.0,
    skewFactor: 0.14,
    maxBlur: 3.5,
    blurFactor: 0.38,
    maxGlassBlur: 22,
    glassBlurFactor: 1.6,
    maxGlassSat: 70,
    glassSatFactor: 5.5,
    maxScale: 1.014,
    scaleFactor: 0.0010
  }
};

const clamp = (min: number, val: number, max: number): number =>
  Math.max(min, Math.min(max, val));

/**
 * High-performance 120fps Scroll Velocity & Motion Blur Engine.
 * Dynamically computes momentum skew, directional velocity blur, and glass pulse
 * without triggering React re-renders on scroll frames.
 */
export function useScrollMotionDynamics(containerRef: React.RefObject<HTMLElement | null>) {
  const scrollMotionMode = useSettingsStore((s) => s.scrollMotionMode ?? 'all');
  const scrollMotionIntensity = useSettingsStore((s) => s.scrollMotionIntensity ?? 'balanced');

  const modeRef = useRef<ScrollMotionMode>(scrollMotionMode);
  modeRef.current = scrollMotionMode;

  const intensityRef = useRef<ScrollMotionIntensity>(scrollMotionIntensity);
  intensityRef.current = scrollMotionIntensity;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof window === 'undefined') return;

    // Accessibility check: instantly honor prefers-reduced-motion
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotionQuery.matches || modeRef.current === 'off') {
      cleanupVars(el);
      return;
    }

    let lastScrollTop = el.scrollTop;
    let lastTime = performance.now();
    let currentVelocity = 0;
    let targetVelocity = 0;
    let rafId: number | null = null;
    let isScrolling = false;

    function cleanupVars(targetEl?: HTMLElement | null) {
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty('--scroll-skew', '0deg');
      rootStyle.setProperty('--scroll-blur', '0px');
      rootStyle.setProperty('--scroll-glass-blur', '0px');
      rootStyle.setProperty('--scroll-glass-sat', '0%');
      rootStyle.setProperty('--scroll-scale-y', '1');
      document.documentElement.removeAttribute('data-scrolling');
      if (targetEl) {
        targetEl.removeAttribute('data-scrolling');
      }
    }

    function tick() {
      // Damped spring momentum interpolation
      currentVelocity += (targetVelocity - currentVelocity) * 0.26;
      targetVelocity *= 0.84;

      const mode = modeRef.current;
      const intensity = intensityRef.current;
      const cfg = INTENSITY_CONFIGS[intensity] || INTENSITY_CONFIGS.balanced;

      const hasSkew = mode === 'momentum' || mode === 'all';
      const hasBlur = mode === 'cinematic' || mode === 'artwork' || mode === 'all';
      const hasGlass = mode === 'glass' || mode === 'all';

      const skewDeg = hasSkew
        ? clamp(-cfg.maxSkew, currentVelocity * cfg.skewFactor, cfg.maxSkew)
        : 0;

      const blurPx = hasBlur
        ? clamp(0, Math.abs(currentVelocity) * cfg.blurFactor, cfg.maxBlur)
        : 0;

      const glassBlurPx = hasGlass
        ? clamp(0, Math.abs(currentVelocity) * cfg.glassBlurFactor, cfg.maxGlassBlur)
        : 0;

      const glassSatPct = hasGlass
        ? clamp(0, Math.abs(currentVelocity) * cfg.glassSatFactor, cfg.maxGlassSat)
        : 0;

      const scaleY = hasSkew
        ? 1 + clamp(0, Math.abs(currentVelocity) * cfg.scaleFactor, cfg.maxScale - 1)
        : 1;

      const rootStyle = document.documentElement.style;
      rootStyle.setProperty('--scroll-skew', `${skewDeg.toFixed(3)}deg`);
      rootStyle.setProperty('--scroll-blur', `${blurPx.toFixed(2)}px`);
      rootStyle.setProperty('--scroll-glass-blur', `${glassBlurPx.toFixed(1)}px`);
      rootStyle.setProperty('--scroll-glass-sat', `${glassSatPct.toFixed(1)}%`);
      rootStyle.setProperty('--scroll-scale-y', `${scaleY.toFixed(4)}`);

      // Idle cutoff: settle to absolute rest and sleep rAF
      if (Math.abs(currentVelocity) < 0.006 && Math.abs(targetVelocity) < 0.006) {
        cleanupVars(el);
        isScrolling = false;
        rafId = null;
        return;
      }

      rafId = requestAnimationFrame(tick);
    }

    function onScroll() {
      if (modeRef.current === 'off' || !el) return;

      const now = performance.now();
      const currentScrollTop = el.scrollTop;
      const deltaTime = Math.max(8, now - lastTime);
      const deltaY = currentScrollTop - lastScrollTop;

      lastScrollTop = currentScrollTop;
      lastTime = now;

      // Filter out spurious jumps (e.g. initial mount or anchor jump)
      if (deltaTime > 160) {
        return;
      }

      // Compute instantaneous velocity (px/ms) safely clamped
      const v = clamp(-16, deltaY / deltaTime, 16);
      targetVelocity = targetVelocity * 0.35 + v * 0.65;

      if (!isScrolling) {
        isScrolling = true;
        document.documentElement.setAttribute('data-scrolling', 'true');
        el.setAttribute('data-scrolling', 'true');
        if (rafId === null) {
          rafId = requestAnimationFrame(tick);
        }
      }
    }

    el.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      el.removeEventListener('scroll', onScroll);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      cleanupVars(el);
    };
  }, [containerRef, scrollMotionMode, scrollMotionIntensity]);
}
