import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Pre-bundle heavy deps so dev server starts faster
    include: ['tone'],
    // Magenta loads TF.js which has complex internals — let Vite auto-handle
    exclude: ['@magenta/music'],
  },
  build: {
    outDir: 'dist',
    // Raise chunk warning limit for TF.js / Magenta bundles
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'tone': ['tone'],
        },
      },
    },
  },
});
