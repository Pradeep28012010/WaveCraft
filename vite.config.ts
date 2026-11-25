import { defineConfig, type Connect, type ViteDevServer, type PreviewServer } from 'vite';
import type { ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import musicApiHandler, { type ApiResponse } from './api/music.js';

function wavecraftApiPlugin() {
  const middleware = async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const pathname = req.url?.split('?')[0];
    if (pathname === '/api/music' || pathname === '/api/music/') {
      const wrappedRes: ApiResponse = Object.assign(res, {
        status(code: number) {
          res.statusCode = code;
          return wrappedRes;
        },
        json(data: unknown) {
          if (!res.headersSent) res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
          return wrappedRes;
        },
        send(data: unknown) {
          if (typeof data === 'object' && data !== null && !(data instanceof Uint8Array)) {
            if (!res.headersSent) res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
            return wrappedRes;
          }
          res.end(data as string | Uint8Array | undefined);
          return wrappedRes;
        }
      });
      try {
        await musicApiHandler(req, wrappedRes);
      } catch (e) {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: String(e) }));
        } else if (!res.writableEnded) {
          res.end();
        }
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
          const normId = id.replace(/\\/g, '/');
          if (normId.includes('/node_modules/')) {
            if (normId.includes('/node_modules/@capacitor/')) return 'vendor-capacitor';
            if (normId.includes('/node_modules/framer-motion/')) return 'vendor-motion';
            if (
              normId.includes('/node_modules/zustand/') ||
              normId.includes('/node_modules/idb-keyval/')
            ) {
              return 'vendor-storage';
            }
            if (normId.includes('/node_modules/colorthief/')) return 'vendor-color';
            if (
              normId.includes('/node_modules/react/') ||
              normId.includes('/node_modules/react-dom/') ||
              normId.includes('/node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }
          }
          if (
            normId.includes('/components/player/StudioFXModal') ||
            normId.includes('/components/layout/CommandPalette')
          ) {
            return 'studio-workstation';
          }
          if (
            normId.includes('/components/player/NowPlaying') ||
            normId.includes('/components/player/QueuePanel') ||
            normId.includes('/components/lyrics/LyricsView') ||
            normId.includes('/components/visualizer/Visualizer')
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
