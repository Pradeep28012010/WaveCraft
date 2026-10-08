import { useState, useEffect, useMemo } from 'react';
import {
  extractPaletteFromImage,
  synthesizeHarmonicPalette,
  DEFAULT_AMBIENT_PALETTE
} from '../services/colorEngine';
import { useSettingsStore } from '../stores/settingsStore';
import type { AmbientPalette } from '../types';

export interface UseColorExtractResult {
  palette: AmbientPalette;
  colors: string[];
  dominantColor: string;
  gradient: string;
  glowCss: string;
  isDynamic: boolean;
}

export function useColorExtract(imageUrl: string | undefined): UseColorExtractResult {
  const dynamicEnabled = useSettingsStore((s) => s.dynamicAmbientGlow ?? true);
  const intensity = useSettingsStore((s) => s.ambientGlowIntensity ?? 'vibrant');
  const userAccent = useSettingsStore((s) => s.accentColor || '#fa2d48');

  const [palette, setPalette] = useState<AmbientPalette>(() => {
    if (!dynamicEnabled) {
      return synthesizeHarmonicPalette(userAccent);
    }
    return DEFAULT_AMBIENT_PALETTE;
  });

  useEffect(() => {
    if (!dynamicEnabled) {
      setPalette(synthesizeHarmonicPalette(userAccent));
      return;
    }

    if (!imageUrl) {
      setPalette(synthesizeHarmonicPalette(userAccent));
      return;
    }

    let isMounted = true;
    extractPaletteFromImage(imageUrl, userAccent, intensity).then((extracted) => {
      if (isMounted) {
        setPalette(extracted);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [imageUrl, dynamicEnabled, intensity, userAccent]);

  return useMemo(
    () => ({
      palette,
      colors: [palette.primary, palette.secondary, palette.tertiary],
      dominantColor: palette.primary,
      gradient: palette.gradientCss,
      glowCss: palette.glowCss,
      isDynamic: palette.isDynamic
    }),
    [palette]
  );
}
