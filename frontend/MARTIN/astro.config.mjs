import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Frontend only. Dev server binds to localhost (no --host flag anywhere).
export default defineConfig({
  integrations: [react()],
  devToolbar: { enabled: false },
  server: { host: 'localhost', port: 4321 },
});
