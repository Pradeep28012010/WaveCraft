import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GENRE_LIST } from '../../utils/constants';

export default function GenreBrowser() {
  const navigate = useNavigate();

  const handleGenreClick = (query: string) => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <section className="py-4 text-white">
      <div className="mb-5">
        <h2 className="text-2xl font-bold tracking-tight">Browse by Genre</h2>
        <p className="text-white/55 text-xs mt-0.5">Explore curated soundscapes and regional charts</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {GENRE_LIST.map((genre, idx) => (
          <motion.button
            key={genre.id || idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04 }}
            onClick={() => handleGenreClick(genre.query || genre.name)}
            className={`relative overflow-hidden rounded-2xl h-32 p-5 text-left group transition-all hover:scale-[1.02] active:scale-95 border border-white/15 shadow-xl cursor-pointer ${genre.colorClass}`}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-white/10 opacity-80" />
            <div className="absolute -bottom-3 -right-2 text-5xl opacity-75 group-hover:scale-115 group-hover:-rotate-12 transition-transform duration-300 select-none">
              {genre.emoji}
            </div>
            <div className="relative z-10 flex flex-col justify-between h-full">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                Station
              </span>
              <h3 className="text-lg font-extrabold text-white drop-shadow-sm">
                {genre.name}
              </h3>
            </div>
          </motion.button>
        ))}
      </div>
    </section>
  );
}
