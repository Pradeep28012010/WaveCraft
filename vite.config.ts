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
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-motion': ['framer-motion'],
          'vendor-storage': ['zustand', 'idb-keyval']
        }
      }
    }
  },
  server: {
    port: 3000,
  },
});
