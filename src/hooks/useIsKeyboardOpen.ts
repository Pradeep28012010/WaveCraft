import { useState, useEffect } from 'react';

/**
 * Hook to detect if the mobile virtual keyboard is currently visible.
 * Uses both visualViewport resize detection (Chrome, Safari, WebView)
 * and focusin/focusout listeners on interactive input elements.
 */
export function useIsKeyboardOpen(): boolean {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        setIsKeyboardOpen(true);
      }
    };

    const handleFocusOut = () => {
      setTimeout(() => {
        const active = document.activeElement as HTMLElement | null;
        if (
          !active ||
          (active.tagName !== 'INPUT' &&
            active.tagName !== 'TEXTAREA' &&
            !active.isContentEditable)
        ) {
          setIsKeyboardOpen(false);
        }
      }, 80);
    };

    const handleVisualViewportResize = () => {
      if (window.visualViewport) {
        // When keyboard opens, visualViewport shrinks significantly compared to innerHeight
        const heightDiff = window.innerHeight - window.visualViewport.height;
        if (heightDiff > 140) {
          setIsKeyboardOpen(true);
        } else if (heightDiff < 60) {
          const active = document.activeElement as HTMLElement | null;
          if (
            !active ||
            (active.tagName !== 'INPUT' &&
              active.tagName !== 'TEXTAREA' &&
              !active.isContentEditable)
          ) {
            setIsKeyboardOpen(false);
          }
        }
      }
    };

    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportResize);
    }

    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportResize);
      }
    };
  }, []);

  return isKeyboardOpen;
}

export default useIsKeyboardOpen;
