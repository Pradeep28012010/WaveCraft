// @ts-ignore
import ColorThief from 'colorthief';
import type { AmbientPalette } from '../types';

interface ColorThiefInstance {
  getColor: (img: HTMLImageElement, quality?: number) => [number, number, number];
  getPalette: (img: HTMLImageElement, colorCount?: number, quality?: number) => [number, number, number][];
}

let thiefInstance: ColorThiefInstance | null = null;
function getThief(): ColorThiefInstance | null {
  if (typeof window === 'undefined') return null;
  if (!thiefInstance) {
    try {
      const Ctor = ColorThief as unknown as new () => ColorThiefInstance;
      thiefInstance = new Ctor();
    } catch {
      thiefInstance = null;
    }
  }
  return thiefInstance;
}

export const DEFAULT_AMBIENT_PALETTE: AmbientPalette = {
  primary: '#fa2d48',
  secondary: '#8b5cf6',
  tertiary: '#06b6d4',
  accent: '#ff4760',
  backgroundDark: '#07050d',
  gradientCss:
    'radial-gradient(circle at 18% 22%, rgba(250, 45, 72, 0.28) 0%, transparent 52%), radial-gradient(circle at 82% 28%, rgba(139, 92, 246, 0.26) 0%, transparent 55%), radial-gradient(circle at 50% 80%, rgba(6, 182, 212, 0.18) 0%, transparent 58%), #06060b',
  glowCss: '0 0 45px -5px rgba(250, 45, 72, 0.35)',
  isDynamic: false
};

const paletteCache = new Map<string, AmbientPalette>();

/**
 * Converts RGB tuple to Hex string.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

/**
 * Converts Hex string to RGB tuple.
 */
export function hexToRgb(hex: string): [number, number, number] {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return [250, 45, 72];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Converts RGB to HSL.
 * h: 0..360, s: 0..1, l: 0..1
 */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case red:
        h = (green - blue) / d + (green < blue ? 6 : 0);
        break;
      case green:
        h = (blue - red) / d + 2;
        break;
      case blue:
        h = (red - green) / d + 4;
        break;
    }
    h *= 60;
  }

  return [h, s, l];
}

/**
 * Converts HSL to RGB.
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const normH = ((h % 360) + 360) % 360;
  const normS = Math.max(0, Math.min(1, s));
  const normL = Math.max(0, Math.min(1, l));

  const c = (1 - Math.abs(2 * normL - 1)) * normS;
  const x = c * (1 - Math.abs(((normH / 60) % 2) - 1));
  const m = normL - c / 2;

  let r1 = 0, g1 = 0, b1 = 0;
  if (normH < 60) {
    r1 = c; g1 = x; b1 = 0;
  } else if (normH < 120) {
    r1 = x; g1 = c; b1 = 0;
  } else if (normH < 180) {
    r1 = 0; g1 = c; b1 = x;
  } else if (normH < 240) {
    r1 = 0; g1 = x; b1 = c;
  } else if (normH < 300) {
    r1 = x; g1 = 0; b1 = c;
  } else {
    r1 = c; g1 = 0; b1 = x;
  }

  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255)
  ];
}

/**
 * Converts HSL to Hex.
 */
export function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

/**
 * Elevates and normalizes raw album colors into luminous, radiant neon tones suitable for dark UI.
 */
export function boostColorVibrancy(
  r: number,
  g: number,
  b: number,
  targetL: number = 0.52
): string {
  const [h, s] = rgbToHsl(r, g, b);
  // Ensure high vibrancy without muddy grayscale or washed-out white
  const vibrantS = Math.max(0.68, Math.min(0.95, s * 1.35));
  return hslToHex(h, vibrantS, targetL);
}

/**
 * Generates an evocative multi-point ambient gradient string.
 */
export function generateGradientCss(
  primary: string,
  secondary: string,
  tertiary: string,
  intensity: 'subtle' | 'vibrant' | 'aurora' = 'vibrant'
): string {
  const [r1, g1, b1] = hexToRgb(primary);
  const [r2, g2, b2] = hexToRgb(secondary);
  const [r3, g3, b3] = hexToRgb(tertiary);

  let op1 = 0.28, op2 = 0.24, op3 = 0.18;
  if (intensity === 'subtle') {
    op1 = 0.16; op2 = 0.13; op3 = 0.10;
  } else if (intensity === 'aurora') {
    op1 = 0.38; op2 = 0.32; op3 = 0.25;
  }

  return `radial-gradient(circle at 18% 22%, rgba(${r1}, ${g1}, ${b1}, ${op1}) 0%, transparent 52%), radial-gradient(circle at 82% 28%, rgba(${r2}, ${g2}, ${b2}, ${op2}) 0%, transparent 56%), radial-gradient(circle at 50% 82%, rgba(${r3}, ${g3}, ${b3}, ${op3}) 0%, transparent 60%), #06060b`;
}

/**
 * Procedurally synthesizes a harmonic palette from a base color or text query.
 */
export function synthesizeHarmonicPalette(baseHex: string): AmbientPalette {
  const [h, s] = rgbToHsl(...hexToRgb(baseHex));
  const primary = hslToHex(h, Math.max(0.75, s), 0.52);
  const secondary = hslToHex((h + 42) % 360, Math.max(0.7, s), 0.54);
  const tertiary = hslToHex((h + 195) % 360, Math.max(0.65, s), 0.48);
  const accent = hslToHex((h + 12) % 360, 0.92, 0.58);
  const backgroundDark = hslToHex(h, 0.35, 0.04);

  return {
    primary,
    secondary,
    tertiary,
    accent,
    backgroundDark,
    gradientCss: generateGradientCss(primary, secondary, tertiary, 'vibrant'),
    glowCss: `0 0 50px -5px ${primary}44`,
    isDynamic: true
  };
}

/**
 * Extracts a harmonic 4-color ambient palette from an image using ColorThief with downsampling and canvas fallbacks.
 */
export async function extractPaletteFromImage(
  imageUrl: string | undefined,
  fallbackAccent: string = '#fa2d48',
  intensity: 'subtle' | 'vibrant' | 'aurora' = 'vibrant'
): Promise<AmbientPalette> {
  if (!imageUrl) {
    return synthesizeHarmonicPalette(fallbackAccent);
  }

  if (paletteCache.has(imageUrl)) {
    const cached = paletteCache.get(imageUrl)!;
    return {
      ...cached,
      gradientCss: generateGradientCss(cached.primary, cached.secondary, cached.tertiary, intensity)
    };
  }

  return new Promise<AmbientPalette>((resolve) => {
    let resolved = false;
    const finish = (pal: AmbientPalette) => {
      if (resolved) return;
      resolved = true;
      paletteCache.set(imageUrl, pal);
      resolve(pal);
    };

    // Safety timeout in case image never loads or network hangs
    const timeoutTimer = setTimeout(() => {
      finish(synthesizeHarmonicPalette(fallbackAccent));
    }, 2500);

    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      clearTimeout(timeoutTimer);
      try {
        const thief = getThief();
        let rawPalette: [number, number, number][] | null = null;

        if (thief) {
          try {
            rawPalette = thief.getPalette(img, 8, 6);
          } catch {
            rawPalette = null;
          }
        }

        // Filter out dark mud (<20) and blinding white (>245)
        const validRgbs = (rawPalette || []).filter(([r, g, b]) => {
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          return lum > 25 && lum < 240;
        });

        if (validRgbs.length >= 2) {
          // Sort colors by vibrancy (saturation * non-extreme luminance)
          const scored = validRgbs.map(([r, g, b]) => {
            const [, s, l] = rgbToHsl(r, g, b);
            const score = s * (1 - Math.abs(l - 0.5) * 1.6);
            return { rgb: [r, g, b] as [number, number, number], score };
          });
          scored.sort((a, b) => b.score - a.score);

          const c1 = scored[0].rgb;
          const c2 = scored[1]?.rgb || c1;
          const c3 = scored[2]?.rgb || c2;

          const primary = boostColorVibrancy(c1[0], c1[1], c1[2], 0.52);
          const secondary = boostColorVibrancy(c2[0], c2[1], c2[2], 0.50);
          const tertiary = boostColorVibrancy(c3[0], c3[1], c3[2], 0.46);
          const accent = boostColorVibrancy(c1[0], c1[1], c1[2], 0.60);
          const [h1] = rgbToHsl(...c1);
          const backgroundDark = hslToHex(h1, 0.4, 0.04);

          finish({
            primary,
            secondary,
            tertiary,
            accent,
            backgroundDark,
            gradientCss: generateGradientCss(primary, secondary, tertiary, intensity),
            glowCss: `0 0 50px -5px ${primary}44`,
            isDynamic: true
          });
          return;
        }

        // If only 1 valid color exists or ColorThief was sparse, sample canvas center
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(img, 0, 0, 16, 16);
          const data = ctx.getImageData(0, 0, 16, 16).data;
          let r = 0, g = 0, b = 0, count = 0;
          for (let i = 0; i < data.length; i += 16) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
          }
          if (count > 0) {
            const avgHex = rgbToHex(r / count, g / count, b / count);
            finish(synthesizeHarmonicPalette(avgHex));
            return;
          }
        }
      } catch {
        // CORS tainted canvas fallback
      }

      finish(synthesizeHarmonicPalette(fallbackAccent));
    };

    img.onerror = () => {
      clearTimeout(timeoutTimer);
      finish(synthesizeHarmonicPalette(fallbackAccent));
    };

    img.src = imageUrl;
  });
}
