// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  vite: {
    // @ts-ignore Some Astro versions omit the supported dev-server proxy option from their Vite type.
    server: { proxy: { '/api': 'http://localhost:8080' } },
  },
});
