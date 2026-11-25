import { useEffect, useRef, type RefObject } from 'react';

interface OverlayEntry {
  onEscape: () => void;
}

const overlayStack: OverlayEntry[] = [];
const focusTrapStack: Array<RefObject<HTMLElement | null>> = [];
let escapeListenerAttached = false;

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])'
].join(', ');

function ensureEscapeListener() {
  if (escapeListenerAttached || typeof document === 'undefined') return;
  escapeListenerAttached = true;

  document.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || overlayStack.length === 0) return;
      const top = overlayStack[overlayStack.length - 1];
      if (!top) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      top.onEscape();
    },
    true
  );
}

/**
 * Registers an open overlay (modal, menu, drawer, dropdown, palette) onto a LIFO
 * Escape stack so pressing Escape closes only the topmost active layer.
 */
export function useOverlayEscape(isOpen: boolean, onEscape: () => void): void {
  const callbackRef = useRef(onEscape);
  callbackRef.current = onEscape;

  useEffect(() => {
    if (!isOpen) return;
    ensureEscapeListener();
    const entry: OverlayEntry = {
      onEscape: () => callbackRef.current()
    };
    overlayStack.push(entry);
    return () => {
      const idx = overlayStack.lastIndexOf(entry);
      if (idx !== -1) {
        overlayStack.splice(idx, 1);
      }
    };
  }, [isOpen]);
}

function getVisibleFocusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') {
      return false;
    }
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    return el.getClientRects().length > 0;
  });
}

/**
 * Traps Tab/Shift+Tab focus inside containerRef while open (respecting topmost stacked dialog),
 * moves initial focus on open, and restores focus to the prior element on close.
 */
export function useFocusTrap(
  isOpen: boolean,
  containerRef: RefObject<HTMLElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    focusTrapStack.push(containerRef);

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (focusTrapStack[focusTrapStack.length - 1] !== containerRef) return;
      const container = containerRef.current;
      if (!container) return;

      const focusables = getVisibleFocusables(container);
      if (focusables.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!active || !container.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }

      if (e.shiftKey) {
        if (active === first || active === container) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleTab);

    const focusTimer = setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const preferred = initialFocusRef?.current;
      if (preferred && container.contains(preferred)) {
        preferred.focus();
        return;
      }
      const focusables = getVisibleFocusables(container);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        container.focus();
      }
    }, 30);

    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleTab);
      const idx = focusTrapStack.lastIndexOf(containerRef);
      if (idx !== -1) {
        focusTrapStack.splice(idx, 1);
      }
      if (previouslyFocused && typeof previouslyFocused.focus === 'function' && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [isOpen, containerRef, initialFocusRef]);
}
