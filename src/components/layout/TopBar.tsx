import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { searchSuggestions } from '../../services/youtube';
import SleepTimer from '../settings/SleepTimer';

export default function TopBar() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') || '';
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSleepTimerOpen, setIsSleepTimerOpen] = useState(false);
  const debounceTimer = useRef<any>(null);

  useEffect(() => {
    setSearchQuery(urlQuery);
  }, [urlQuery]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(async () => {
      if (val.trim().length > 0) {
        navigate(`/search?q=${encodeURIComponent(val.trim())}`);
        const sugs = await searchSuggestions(val.trim());
        setSuggestions(sugs.slice(0, 5));
      } else {
        setSuggestions([]);
      }
    }, 180);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      setShowSuggestions(false);
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleClear = () => {
    setSearchQuery('');
    setSuggestions([]);
    navigate('/search');
  };

  return (
    <>
      <header className="h-20 flex items-center justify-between px-6 lg:px-8 sticky top-0 z-40 bg-black/25 backdrop-blur-2xl border-b border-white/[0.08]">
        {/* Navigation Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate(-1)}
            title="Back"
            className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white/80 hover:text-white"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            onClick={() => navigate(1)}
            title="Forward"
            className="w-9 h-9 flex items-center justify-center rounded-full glass-button text-white/80 hover:text-white"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Liquid Glass Search Pill */}
        <div className="flex-1 max-w-xl mx-6 relative">
          <div className="relative flex items-center">
            <div className="absolute left-4 pointer-events-none text-white/45">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
              placeholder="Search songs, artists, albums, or moods..."
              className="w-full liquid-glass rounded-full py-2.5 pl-11 pr-10 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/30 transition-all duration-300"
            />
            {searchQuery && (
              <button
                onClick={handleClear}
                className="absolute right-3.5 p-1 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          {/* Search Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-13 glass-heavy rounded-2xl p-2 shadow-2xl border border-white/15 z-50">
              {suggestions.map((sug, i) => (
                <button
                  key={i}
                  onMouseDown={() => {
                    const clean = sug.split(' - ')[0];
                    setSearchQuery(clean);
                    navigate(`/search?q=${encodeURIComponent(clean)}`);
                    setShowSuggestions(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <svg className="w-3.5 h-3.5 text-white/40 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <span className="truncate">{sug}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSleepTimerOpen(true)}
            title="Sleep Timer"
            className="w-9 h-9 rounded-full glass-button flex items-center justify-center text-white/75 hover:text-white"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs font-medium text-white/80">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
            <span>Studio 320k</span>
          </div>
        </div>
      </header>

      <SleepTimer isOpen={isSleepTimerOpen} onClose={() => setIsSleepTimerOpen(false)} />
    </>
  );
}
