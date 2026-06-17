import { defineConfig } from 'vite';
import { existsSync, cpSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/',
  server: {
    allowedHosts: ['lipsync-app.szymon-ai.cc', '.szymon-ai.cc'],
  },
  build: {
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  plugins: [
    {
      name: 'ground-truth',
      // In dev mode, Vite follows the symlink at public/ground-truth -> ../ground-truth
      // During build, ensure ground-truth is copied to dist/ (belt-and-suspenders)
      closeBundle() {
        const src = resolve(__dirname, 'ground-truth');
        const dest = resolve(__dirname, 'dist', 'ground-truth');
        if (existsSync(src)) {
          if (existsSync(dest)) rmSync(dest, { recursive: true });
          cpSync(src, dest, { recursive: true });
        }
      },
    },
  ],
});
