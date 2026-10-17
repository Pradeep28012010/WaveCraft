import { useEffect } from 'react';
import { create } from 'zustand';

export type DevicePreset = 'phone' | 'laptop';

interface DevicePresetStore {
  preset: DevicePreset;
  isMobileDrawerOpen: boolean;
  isSidebarCollapsed: boolean;
  setPreset: (preset: DevicePreset) => void;
  setMobileDrawerOpen: (open: boolean) => void;
  toggleMobileDrawer: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
}

/**
 * Intelligently detects whether the current device is a Phone ('phone' UI preset)
 * or a Laptop/Desktop ('laptop' UI preset) using viewport dimensions, coarse touch
 * pointer media queries, and mobile User-Agent signals.
 */
export function detectDevicePreset(): DevicePreset {
  if (typeof window === 'undefined') return 'laptop';

  const width = window.innerWidth;
  const height = window.innerHeight;
  const shortestSide = Math.min(width, height);

  const isCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const isMobileUA = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent || ''
  );

  // Phone if viewport width < 768px, or touch phone in landscape/portrait
  if (width < 768 || (isCoarsePointer && shortestSide < 560) || (isMobileUA && width < 900)) {
    return 'phone';
  }

  return 'laptop';
}

function getInitialSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('wavecraft_sidebar_collapsed') === 'true';
}

export const useDevicePresetStore = create<DevicePresetStore>((set) => ({
  preset: detectDevicePreset(),
  isMobileDrawerOpen: false,
  isSidebarCollapsed: getInitialSidebarCollapsed(),
  setPreset: (preset) =>
    set((state) => ({
      preset,
      isMobileDrawerOpen: preset === 'laptop' ? false : state.isMobileDrawerOpen
    })),
  setMobileDrawerOpen: (open) => set({ isMobileDrawerOpen: open }),
  toggleMobileDrawer: () => set((state) => ({ isMobileDrawerOpen: !state.isMobileDrawerOpen })),
  setSidebarCollapsed: (collapsed) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('wavecraft_sidebar_collapsed', String(collapsed));
    }
    set({ isSidebarCollapsed: collapsed });
  },
  toggleSidebarCollapsed: () =>
    set((state) => {
      const next = !state.isSidebarCollapsed;
      if (typeof window !== 'undefined') {
        localStorage.setItem('wavecraft_sidebar_collapsed', String(next));
      }
      return { isSidebarCollapsed: next };
    })
}));

/**
 * Hook that subscribes to the active UI preset ('phone' | 'laptop') and keeps it
 * synchronized across window resizes and orientation changes.
 */
export function useDevicePreset() {
  const preset = useDevicePresetStore((s) => s.preset);
  const isMobileDrawerOpen = useDevicePresetStore((s) => s.isMobileDrawerOpen);
  const isSidebarCollapsed = useDevicePresetStore((s) => s.isSidebarCollapsed);
  const setPreset = useDevicePresetStore((s) => s.setPreset);
  const setMobileDrawerOpen = useDevicePresetStore((s) => s.setMobileDrawerOpen);
  const toggleMobileDrawer = useDevicePresetStore((s) => s.toggleMobileDrawer);
  const setSidebarCollapsed = useDevicePresetStore((s) => s.setSidebarCollapsed);
  const toggleSidebarCollapsed = useDevicePresetStore((s) => s.toggleSidebarCollapsed);

  useEffect(() => {
    const syncPreset = () => {
      const next = detectDevicePreset();
      if (useDevicePresetStore.getState().preset !== next) {
        setPreset(next);
      }
      document.documentElement.dataset.devicePreset = next;
    };

    syncPreset();
    window.addEventListener('resize', syncPreset, { passive: true });
    window.addEventListener('orientationchange', syncPreset, { passive: true });
    return () => {
      window.removeEventListener('resize', syncPreset);
      window.removeEventListener('orientationchange', syncPreset);
    };
  }, [setPreset]);

  return {
    preset,
    isPhone: preset === 'phone',
    isLaptop: preset === 'laptop',
    isMobileDrawerOpen,
    setMobileDrawerOpen,
    toggleMobileDrawer,
    isSidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebarCollapsed
  };
}
