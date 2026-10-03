import { useState, useEffect } from 'react';
import type { Track } from '../types';
import * as storage from '../services/storage';

const searchTracksMock = async (query: string): Promise<Track[]> => {
  return []; // Mock for now until real API is wired
};

export function useSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  useEffect(() => {
    const loadHistory = async () => {
      // Need a custom generic function in storage or we mock it
      // For now we'll pretend getSearchHistory exists
      try {
        const history = await storage.getSearchHistory?.() || [];
        setSearchHistory(history);
      } catch (e) {}
    };
    loadHistory();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timeoutId = setTimeout(async () => {
      try {
        const data = await searchTracksMock(query);
        setResults(data);
      } catch (e) {
        console.error('Search failed', e);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const addToHistory = (term: string) => {
    const newHistory = [term, ...searchHistory.filter(h => h !== term)].slice(0, 10);
    setSearchHistory(newHistory);
    try {
      storage.saveSearchHistory?.(newHistory);
    } catch (e) {}
  };

  const clearHistory = () => {
    setSearchHistory([]);
    try {
      storage.saveSearchHistory?.([]);
    } catch (e) {}
  };

  return {
    query,
    setQuery,
    results,
    isSearching,
    searchHistory,
    addToHistory,
    clearHistory
  };
}
