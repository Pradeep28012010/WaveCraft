import React, { useEffect, useRef, useState, useMemo } from 'react';
import './GradualBlur.css';

export interface GradualBlurProps {
  position?: 'top' | 'bottom' | 'left' | 'right';
  strength?: number;
  height?: string;
  width?: string;
  divCount?: number;
  exponential?: boolean;
  curve?: 'linear' | 'bezier' | 'ease-in' | 'ease-out' | 'ease-in-out';
  opacity?: number;
  animated?: boolean | 'scroll';
  duration?: string;
  easing?: string;
  hoverIntensity?: number;
  target?: 'parent' | 'page';
  preset?:
    | 'top'
    | 'bottom'
    | 'left'
    | 'right'
    | 'subtle'
    | 'intense'
    | 'smooth'
    | 'sharp'
    | 'header'
    | 'footer'
    | 'sidebar'
    | 'page-header'
    | 'page-footer';
  responsive?: boolean;
  zIndex?: number;
  onAnimationComplete?: () => void;
  className?: string;
  style?: React.CSSProperties;
  [key: string]: unknown;
}

const DEFAULT_CONFIG: GradualBlurProps = {
  position: 'bottom',
  strength: 2,
  height: '6rem',
  divCount: 5,
  exponential: false,
  zIndex: 20,
  animated: false,
  duration: '0.3s',
  easing: 'ease-out',
  opacity: 1,
  curve: 'linear',
  responsive: false,
  target: 'parent',
  className: '',
  style: {}
};

const PRESETS: Record<string, Partial<GradualBlurProps>> = {
  top: { position: 'top', height: '6rem' },
  bottom: { position: 'bottom', height: '6rem' },
  left: { position: 'left', height: '6rem' },
  right: { position: 'right', height: '6rem' },
  subtle: { height: '4rem', strength: 1, opacity: 0.8, divCount: 3 },
  intense: { height: '10rem', strength: 4, divCount: 8, exponential: true },
  smooth: { height: '8rem', curve: 'bezier', divCount: 10 },
  sharp: { height: '5rem', curve: 'linear', divCount: 4 },
  header: { position: 'top', height: '8rem', curve: 'ease-out' },
  footer: { position: 'bottom', height: '8rem', curve: 'ease-out' },
  sidebar: { position: 'left', height: '6rem', strength: 2.5 },
  'page-header': { position: 'top', height: '10rem', target: 'page', strength: 3 },
  'page-footer': { position: 'bottom', height: '10rem', target: 'page', strength: 3 }
};

const CURVE_FUNCTIONS: Record<string, (p: number) => number> = {
  linear: (p: number) => p,
  bezier: (p: number) => p * p * (3 - 2 * p),
  'ease-in': (p: number) => p * p,
  'ease-out': (p: number) => 1 - Math.pow(1 - p, 2),
  'ease-in-out': (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)
};

const mergeConfigs = (...configs: Array<Partial<GradualBlurProps>>): GradualBlurProps =>
  configs.reduce((acc, c) => ({ ...acc, ...c }), {}) as GradualBlurProps;

const getGradientDirection = (position?: string): string =>
  ({
    top: 'to top',
    bottom: 'to bottom',
    left: 'to left',
    right: 'to right'
  })[position || 'bottom'] || 'to bottom';

const debounce = <T extends (...args: unknown[]) => void>(fn: T, wait: number) => {
  let t: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...a: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...a), wait);
  };
  wrapped.cancel = () => {
    if (t) {
      clearTimeout(t);
      t = undefined;
    }
  };
  return wrapped;
};

const useResponsiveDimension = (
  responsive?: boolean,
  config?: GradualBlurProps,
  key?: 'height' | 'width'
): string | undefined => {
  const [value, setValue] = useState(config ? (config[key as keyof GradualBlurProps] as string | undefined) : undefined);
  const configRef = useRef(config);
  configRef.current = config;

  const baseVal = config && key ? (config[key as keyof GradualBlurProps] as string | undefined) : undefined;
  const mobileVal = config?.mobileHeight ?? config?.mobileWidth;
  const tabletVal = config?.tabletHeight ?? config?.tabletWidth;
  const desktopVal = config?.desktopHeight ?? config?.desktopWidth;

  useEffect(() => {
    if (!responsive || !configRef.current || !key) return;
    const calc = () => {
      const cfg = configRef.current;
      if (!cfg) return;
      const w = window.innerWidth;
      let v = cfg[key as keyof GradualBlurProps] as string | undefined;
      const capKey = key.charAt(0).toUpperCase() + key.slice(1);
      const mobileKey = `mobile${capKey}` as keyof GradualBlurProps;
      const tabletKey = `tablet${capKey}` as keyof GradualBlurProps;
      const desktopKey = `desktop${capKey}` as keyof GradualBlurProps;

      if (w <= 480 && cfg[mobileKey]) {
        v = cfg[mobileKey] as string;
      } else if (w <= 768 && cfg[tabletKey]) {
        v = cfg[tabletKey] as string;
      } else if (w <= 1024 && cfg[desktopKey]) {
        v = cfg[desktopKey] as string;
      }
      setValue(v);
    };
    const debounced = debounce(calc, 100);
    calc();
    window.addEventListener('resize', debounced);
    return () => {
      debounced.cancel();
      window.removeEventListener('resize', debounced);
    };
  }, [responsive, key, baseVal, mobileVal, tabletVal, desktopVal]);

  return responsive ? value : baseVal;
};

const useIntersectionObserver = (ref: React.RefObject<HTMLDivElement | null>, shouldObserve = false) => {
  const [isVisible, setIsVisible] = useState(!shouldObserve);

  useEffect(() => {
    if (!shouldObserve || !ref.current) return;

    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), { threshold: 0.1 });

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, shouldObserve]);

  return isVisible;
};

function GradualBlur(props: GradualBlurProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const {
    position,
    strength,
    height,
    width,
    divCount,
    exponential,
    zIndex,
    animated,
    duration,
    easing,
    opacity,
    curve,
    responsive,
    mobileHeight,
    tabletHeight,
    desktopHeight,
    mobileWidth,
    tabletWidth,
    desktopWidth,
    hoverIntensity,
    target,
    preset,
    className,
    style
  } = props;

  const config = useMemo<GradualBlurProps>(() => {
    const presetConfig = preset && PRESETS[preset] ? PRESETS[preset] : {};
    return mergeConfigs(DEFAULT_CONFIG, presetConfig, {
      position,
      strength,
      height,
      width,
      divCount,
      exponential,
      zIndex,
      animated,
      duration,
      easing,
      opacity,
      curve,
      responsive,
      mobileHeight,
      tabletHeight,
      desktopHeight,
      mobileWidth,
      tabletWidth,
      desktopWidth,
      hoverIntensity,
      target,
      preset,
      className,
      style
    });
  }, [
    position,
    strength,
    height,
    width,
    divCount,
    exponential,
    zIndex,
    animated,
    duration,
    easing,
    opacity,
    curve,
    responsive,
    mobileHeight,
    tabletHeight,
    desktopHeight,
    mobileWidth,
    tabletWidth,
    desktopWidth,
    hoverIntensity,
    target,
    preset,
    className,
    style
  ]);

  const responsiveHeight = useResponsiveDimension(config.responsive, config, 'height');
  const responsiveWidth = useResponsiveDimension(config.responsive, config, 'width');

  const isVisible = useIntersectionObserver(containerRef, config.animated === 'scroll');

  const blurDivs = useMemo(() => {
    const divs = [];
    const divCount = config.divCount || 5;
    const increment = 100 / divCount;
    const currentStrength =
      isHovered && config.hoverIntensity
        ? (config.strength || 2) * config.hoverIntensity
        : config.strength || 2;

    const curveFunc = CURVE_FUNCTIONS[config.curve || 'linear'] || CURVE_FUNCTIONS.linear;

    for (let i = 1; i <= divCount; i++) {
      let progress = i / divCount;
      progress = curveFunc(progress);

      let blurValue: number;
      if (config.exponential) {
        blurValue = Math.pow(2, progress * 4) * 0.0625 * currentStrength;
      } else {
        blurValue = 0.0625 * (progress * divCount + 1) * currentStrength;
      }

      const p1 = Math.round((increment * i - increment) * 10) / 10;
      const p2 = Math.round(increment * i * 10) / 10;
      const p3 = Math.round((increment * i + increment) * 10) / 10;
      const p4 = Math.round((increment * i + increment * 2) * 10) / 10;

      let gradient = `transparent ${p1}%, black ${p2}%`;
      if (p3 <= 100) gradient += `, black ${p3}%`;
      if (p4 <= 100) gradient += `, transparent ${p4}%`;

      const direction = getGradientDirection(config.position);

      const divStyle: React.CSSProperties = {
        position: 'absolute',
        inset: '0',
        maskImage: `linear-gradient(${direction}, ${gradient})`,
        WebkitMaskImage: `linear-gradient(${direction}, ${gradient})`,
        backdropFilter: `blur(${blurValue.toFixed(3)}rem)`,
        WebkitBackdropFilter: `blur(${blurValue.toFixed(3)}rem)`,
        opacity: config.opacity,
        transition:
          config.animated && config.animated !== 'scroll'
            ? `backdrop-filter ${config.duration} ${config.easing}`
            : undefined
      };

      divs.push(<div key={i} style={divStyle} />);
    }

    return divs;
  }, [config, isHovered]);

  const containerStyle = useMemo<React.CSSProperties>(() => {
    const position = config.position || 'bottom';
    const isVertical = ['top', 'bottom'].includes(position);
    const isHorizontal = ['left', 'right'].includes(position);
    const isPageTarget = config.target === 'page';

    const baseStyle: React.CSSProperties = {
      position: isPageTarget ? 'fixed' : 'absolute',
      pointerEvents:
        config.className?.includes('pointer-events-none')
          ? 'none'
          : config.hoverIntensity
            ? 'auto'
            : 'none',
      opacity: isVisible ? 1 : 0,
      transition: config.animated ? `opacity ${config.duration} ${config.easing}` : undefined,
      zIndex: isPageTarget ? (config.zIndex || 20) + 100 : config.zIndex || 20,
      ...config.style
    };

    if (isVertical) {
      baseStyle.height = responsiveHeight || '6rem';
      baseStyle.width = responsiveWidth || '100%';
      baseStyle[position as 'top' | 'bottom'] = 0;
      baseStyle.left = 0;
      baseStyle.right = 0;
    } else if (isHorizontal) {
      baseStyle.width = responsiveWidth || responsiveHeight || '6rem';
      baseStyle.height = '100%';
      baseStyle[position as 'left' | 'right'] = 0;
      baseStyle.top = 0;
      baseStyle.bottom = 0;
    }

    return baseStyle;
  }, [config, responsiveHeight, responsiveWidth, isVisible]);

  const { hoverIntensity, animated, onAnimationComplete, duration } = config;

  useEffect(() => {
    if (isVisible && animated === 'scroll' && onAnimationComplete) {
      const ms = parseFloat(duration || '0.3') * 1000;
      const t = setTimeout(() => onAnimationComplete(), ms);
      return () => clearTimeout(t);
    }
  }, [isVisible, animated, onAnimationComplete, duration]);

  return (
    <div
      ref={containerRef}
      className={`gradual-blur ${config.target === 'page' ? 'gradual-blur-page' : 'gradual-blur-parent'} ${config.className || ''}`}
      style={containerStyle}
      onMouseEnter={hoverIntensity ? () => setIsHovered(true) : undefined}
      onMouseLeave={hoverIntensity ? () => setIsHovered(false) : undefined}
    >
      <div
        className="gradual-blur-inner"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%'
        }}
      >
        {blurDivs}
      </div>
    </div>
  );
}

const GradualBlurMemo = React.memo(GradualBlur);
(GradualBlurMemo as unknown as { PRESETS: typeof PRESETS }).PRESETS = PRESETS;
(GradualBlurMemo as unknown as { CURVE_FUNCTIONS: typeof CURVE_FUNCTIONS }).CURVE_FUNCTIONS = CURVE_FUNCTIONS;
export default GradualBlurMemo;
