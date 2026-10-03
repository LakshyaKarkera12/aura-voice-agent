// Vite configuration.
// By default Vite builds only index.html. We have TWO pages, so we list both
// as "inputs". Then `npm run build` outputs dist/index.html AND dist/app.html.
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // The ElevenLabs SDK chunk is ~575 kB, above Vite's 500 kB warning.
    // It's loaded lazily (dynamic import in voice.js) only when the user
    // clicks Start call, so it doesn't slow the first page load.
    chunkSizeWarningLimit: 650,
    // Vite 8 uses Rolldown as its bundler; `rolldownOptions` replaces the
    // older `rollupOptions` name (which still works but is deprecated).
    rolldownOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'), // Sign up / Log in
        app: resolve(import.meta.dirname, 'app.html'),     // Call page (protected)
      },
    },
  },
});
