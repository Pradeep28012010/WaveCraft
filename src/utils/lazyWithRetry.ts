import { lazy, type ComponentType } from 'react';

/**
 * Enhanced React.lazy wrapper with exponential retry and network failure recovery.
 * Absorbs transient connection glitches or chunk version mismatch during deployments.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    const getRefreshed = () => {
      try {
        return window.sessionStorage?.getItem('wavecraft_chunk_retry_refreshed') === 'true';
      } catch {
        return false;
      }
    };
    const setRefreshed = (val: boolean) => {
      try {
        window.sessionStorage?.setItem('wavecraft_chunk_retry_refreshed', String(val));
      } catch {}
    };

    try {
      const component = await componentImport();
      setRefreshed(false);
      return component;
    } catch (firstErr) {
      // First attempt an immediate retry with brief delay to absorb transient packet drops
      try {
        await new Promise((res) => setTimeout(res, 250));
        const component = await componentImport();
        setRefreshed(false);
        return component;
      } catch (secondErr) {
        console.warn('Chunk loading failed after retry, evaluating page recovery:', secondErr);
        if (typeof window !== 'undefined' && !getRefreshed()) {
          setRefreshed(true);
          window.location.reload();
          return { default: (() => null) as unknown as T };
        }
        throw secondErr;
      }
    }
  });
}
