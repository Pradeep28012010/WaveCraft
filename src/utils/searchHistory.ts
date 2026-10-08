import { useState, useEffect } from 'react';

const SEARCH_HISTORY_KEY = 'wavecraft_search_history_v1';
const MAX_HISTORY = 15;

export function getSearchHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

export function saveSearchTerm(term: string): string[] {
  if (typeof window === 'undefined') return [];
  const clean = term.trim();
  if (!clean) return getSearchHistory();
  try {
    const current = getSearchHistory();
    const filtered = current.filter((item) => item.toLowerCase() !== clean.toLowerCase());
    const updated = [clean, ...filtered].slice(0, MAX_HISTORY);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('wavecraft_search_history_updated'));
    return updated;
  } catch {
    return [];
  }
}

export function removeSearchTerm(term: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const current = getSearchHistory();
    const updated = current.filter((item) => item.toLowerCase() !== term.trim().toLowerCase());
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('wavecraft_search_history_updated'));
    return updated;
  } catch {
    return [];
  }
}

export function clearSearchHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
    window.dispatchEvent(new CustomEvent('wavecraft_search_history_updated'));
  } catch {}
}

export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>(getSearchHistory);

  useEffect(() => {
    const handleUpdate = () => {
      setHistory(getSearchHistory());
    };
    window.addEventListener('wavecraft_search_history_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('wavecraft_search_history_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  return {
    history,
    saveSearchTerm,
    removeSearchTerm,
    clearSearchHistory
  };
}
