import { useEffect } from 'react';
import { useLibraryStore } from '../stores/libraryStore';

export function useLibrary() {
  const libraryStore = useLibraryStore();

  useEffect(() => {
    libraryStore.loadFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return libraryStore;
}
