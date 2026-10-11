// @ts-check
import { existsSync } from 'node:fs';
import { defineConfig } from 'astro/config';

const localEnv = new URL('.env.local', import.meta.url);
if (existsSync(localEnv)) process.loadEnvFile(localEnv);

export default defineConfig({
  vite: {
    // @ts-ignore Some Astro versions omit the supported dev-server proxy option from their Vite type.
    server: { proxy: { '/api': process.env.DEV_API_PROXY_URL || 'http://localhost:8080' } },
  },
});
