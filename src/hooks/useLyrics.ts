import { useState, useEffect } from 'react';

const fetchLyricsMock = async (artist: string, title: string): Promise<string | null> => {
  return "Lyrics not found (mock implementation).";
};

export function useLyrics(artist?: string, title?: string) {
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!artist || !title) {
      setLyrics(null);
      return;
    }

    const loadLyrics = async () => {
      setIsLoading(true);
      try {
        const res = await fetchLyricsMock(artist, title);
        setLyrics(res);
      } catch (e) {
        setLyrics(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadLyrics();
  }, [artist, title]);

  return { lyrics, isLoading };
}
