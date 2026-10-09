/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Base URL of the REST backend. Unset = use src/lib/mock.ts. */
  readonly PUBLIC_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
