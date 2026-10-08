import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
// @ts-ignore
import musicApiHandler from './api/music.js';

function wavecraftApiPlugin() {
  const middleware = async (req: any, res: any, next: any) => {
    if (req.url && req.url.startsWith('/api/music')) {
      const wrappedRes = {
        statusCode: 200,
        setHeader: (k: string, v: string) => res.setHeader(k, v),
        status(code: number) {
          this.statusCode = code;
          res.statusCode = code;
          return this;
        },
        json(data: any) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
          return this;
        },
        end(body?: any) {
          res.end(body);
          return this;
        }
      };
      try {
        await musicApiHandler(req, wrappedRes);
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(e) }));
      }
      return;
    }
    next();
  };

  return {
    name: 'wavecraft-api',
    configureServer(server: any) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(middleware);
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    wavecraftApiPlugin()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'esnext',
    cssMinify: true,
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('zustand') || id.includes('idb-keyval')) return 'vendor-storage';
            if (id.includes('colorthief')) return 'vendor-color';
            if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
          }
          if (
            id.includes('/components/player/StudioFXModal') ||
            id.includes('/components/layout/CommandPalette')
          ) {
            return 'studio-workstation';
          }
          if (
            id.includes('/components/player/NowPlaying') ||
            id.includes('/components/player/QueuePanel') ||
            id.includes('/components/player/WaveCardModal') ||
            id.includes('/components/lyrics/LyricsView') ||
            id.includes('/components/visualizer/Visualizer')
          ) {
            return 'player-fullscreen';
          }
        }
      }
    }
  },
  server: {
    port: 3000,
  },
});
