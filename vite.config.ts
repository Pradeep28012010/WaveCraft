import { defineConfig, type Connect, type ViteDevServer, type PreviewServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
// @ts-ignore
import musicApiHandler from './api/music.js';

function wavecraftApiPlugin() {
  const middleware = async (req: Connect.IncomingMessage, res: Connect.ServerResponse, next: Connect.NextFunction) => {
    if (req.url && req.url.startsWith('/api/music')) {
      const wrappedRes = Object.assign(res, {
        status(code: number) {
          res.statusCode = code;
          return this;
        },
        json(data: unknown) {
          if (!res.headersSent) res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
          return this;
        },
        send(data: unknown) {
          res.end(data as string | Buffer | undefined);
          return this;
        }
      });
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
    configureServer(server: ViteDevServer) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(middleware);
    }
  };
}

const isElectronBuild = process.env.ELECTRON_BUILD === 'true';

export default defineConfig({
  base: isElectronBuild ? './' : '/',
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
            if (id.includes('@capacitor')) return 'vendor-capacitor';
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
