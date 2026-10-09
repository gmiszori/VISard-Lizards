import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Frontend only. Dev server binds to localhost (no --host flag anywhere).
// BASE_PATH is set for sub-path hosting, e.g. BASE_PATH=/tablett-mensa on GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  integrations: [react()],
  devToolbar: { enabled: false },
  server: { host: 'localhost', port: 4321 },
});
