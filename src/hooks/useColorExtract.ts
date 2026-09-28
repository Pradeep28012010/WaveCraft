import { useState, useEffect } from 'react';

interface ExtractedPalette {
  colors: string[];
  dominantColor: string;
  gradient: string;
}

const DEFAULT_PALETTE: ExtractedPalette = {
  colors: ['#1a1a2e', '#16213e', '#0f3460'],
  dominantColor: '#1a1a2e',
  gradient: 'linear-gradient(to bottom, #1a1a2e, #16213e)'
};

const paletteCache = new Map<string, ExtractedPalette>();

export function useColorExtract(imageUrl: string | undefined) {
  const [palette, setPalette] = useState<ExtractedPalette>(() =>
    imageUrl && paletteCache.has(imageUrl) ? paletteCache.get(imageUrl)! : DEFAULT_PALETTE
  );

  useEffect(() => {
    if (!imageUrl) return;
    if (paletteCache.has(imageUrl)) {
      setPalette(paletteCache.get(imageUrl)!);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      if (cancelled) return;
      // Downsample to 16x16 (256 pixels instead of 250,000 pixels — 976x faster!)
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, 16, 16);
      try {
        const imageData = ctx.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < imageData.length; i += 16) {
          r += imageData[i];
          g += imageData[i + 1];
          b += imageData[i + 2];
          count++;
        }
        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);

        const domHex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        const result: ExtractedPalette = {
          dominantColor: domHex,
          colors: [domHex, '#16213e', '#0f3460'],
          gradient: `linear-gradient(to bottom, ${domHex}88, #16213e)`
        };
        paletteCache.set(imageUrl, result);
        if (!cancelled) setPalette(result);
      } catch {
        // Ignore CORS-tainted canvas fallback
      }
    };
    img.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return palette;
}
