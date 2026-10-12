import { lazy, type ComponentType } from 'react';

/**
 * Enhanced React.lazy wrapper with exponential retry and network failure recovery.
 * Absorbs transient connection glitches or chunk version mismatch during deployments.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await componentImport();
    } catch (firstErr) {
      // First attempt an immediate retry with brief delay to absorb transient packet drops
      try {
        await new Promise((res) => setTimeout(res, 300));
        return await componentImport();
      } catch (secondErr) {
        console.warn('Chunk loading failed after retry, evaluating page recovery:', secondErr);
        if (typeof window !== 'undefined') {
          const lastReload = Number(
            window.sessionStorage?.getItem('wavecraft_last_chunk_reload') || 0
          );
          const now = Date.now();
          // Allow at most 1 reload per 15 seconds to prevent reload loops during offline/bad connections
          if (now - lastReload > 15_000) {
            try {
              window.sessionStorage?.setItem('wavecraft_last_chunk_reload', String(now));
            } catch {}
            window.location.reload();
            return { default: (() => null) as unknown as T };
          }
        }
        throw secondErr;
      }
    }
  });
}
