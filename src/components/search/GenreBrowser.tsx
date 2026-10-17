import { useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GENRE_LIST } from '../../utils/constants';

interface GenreBrowserProps {
  onSelectGenre?: (query: string) => void;
  title?: string;
  subtitle?: string;
  limit?: number;
}

function GenreBrowser({
  onSelectGenre,
  title = 'Browse Soundscapes & Genres',
  subtitle = 'Curated sonic worlds, regional powerhouses & acoustic frequencies',
  limit
}: GenreBrowserProps) {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState<'all' | 'regional' | 'global' | 'chill'>('all');

  const handleGenreClick = (query: string) => {
    if (onSelectGenre) {
      onSelectGenre(query);
    } else {
      navigate(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  const filteredList = GENRE_LIST.filter((genre) => {
    if (activeFilter === 'regional') {
      return ['bollywood', 'telugu', 'punjabi', 'tamil'].includes(genre.id);
    }
    if (activeFilter === 'chill') {
      return ['lofi', 'ambient', 'acoustic', 'rnb'].includes(genre.id);
    }
    if (activeFilter === 'global') {
      return ['pop', 'hiphop', 'electronic', 'rock', 'synthwave', 'phonk'].includes(genre.id);
    }
    return true;
  });

  const displayedList = limit ? filteredList.slice(0, limit) : filteredList;

  return (
    <section className="py-2 text-white">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
            <span className="text-[11px] font-black uppercase tracking-widest text-[var(--color-accent)]">
              Curated Stations
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">{title}</h2>
          <p className="text-white/60 text-xs sm:text-sm mt-1">{subtitle}</p>
        </div>

        {/* Filter Pills */}
        <div
          className="flex items-center gap-1.5 p-1 rounded-full bg-white/[0.05] border-0 backdrop-blur-xl self-start sm:self-auto overflow-x-auto overflow-y-hidden no-scrollbar max-w-full"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {(
            [
              { id: 'all', label: 'All (16)' },
              { id: 'regional', label: 'Desi & Cinema' },
              { id: 'global', label: 'Global Hits' },
              { id: 'chill', label: 'Chill & Ambient' }
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeFilter === tab.id
                  ? 'glass-button-primary text-white shadow-md'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of 16 High-Fidelity Editorial Station Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4.5">
        {displayedList.map((genre, idx) => (
          <motion.div
            key={genre.id || idx}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(0.24, idx * 0.025), duration: 0.25 }}
            onClick={() => handleGenreClick(genre.query || genre.name)}
            className={`group relative overflow-hidden rounded-2xl h-36 sm:h-40 p-4 sm:p-5 text-left border-0 liquid-glass shadow-xl cursor-pointer hover:scale-[1.025] hover:shadow-[0_20px_40px_rgba(0,0,0,0.65)]  active:scale-[0.97] transition-all duration-300 select-none ${genre.colorClass}`}
          >
            {/* Specular Edge & Gradient Sheen */}
            <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-80" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-white/10 opacity-90 transition-opacity group-hover:opacity-100" />

            {/* Floating 3D Emoji Badge */}
            <div className="absolute -bottom-2 -right-1 text-5xl sm:text-6xl opacity-75 group-hover:opacity-95 group-hover:scale-120 group-hover:-rotate-12 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all duration-300 pointer-events-none drop-shadow-[0_10px_24px_rgba(0,0,0,0.6)]">
              {genre.emoji}
            </div>

            {/* Card Content Structure */}
            <div className="relative z-10 flex flex-col justify-between h-full">
              {/* Header: Station Pill + Mini Play Button */}
              <div className="flex items-center justify-between gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-black/40 backdrop-blur-md border-0 text-[9px] font-black uppercase tracking-widest text-white/90 shadow-sm">
                  Station
                </span>
                <div className="w-8 h-8 rounded-full bg-white/25 backdrop-blur-md border-0 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-200 shadow-lg">
                  <svg className="w-3.5 h-3.5 ml-0.5 fill-current" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>

              {/* Title & Editorial Subtitle */}
              <div className="pr-4">
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight leading-snug drop-shadow-md group-hover:text-white transition-colors">
                  {genre.name}
                </h3>
                <p className="text-[11px] font-medium text-white/80 line-clamp-1 mt-0.5 drop-shadow">
                  {genre.sub || 'Curated Soundscape'}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

GenreBrowser.displayName = 'GenreBrowser';

export default memo(GenreBrowser);
