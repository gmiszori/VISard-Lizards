// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  vite: {
    // @ts-expect-error Astro's Vite type omits the supported dev-server proxy option here.
    server: { proxy: { '/api': 'http://localhost:8080' } },
  },
});
