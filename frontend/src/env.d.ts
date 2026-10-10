interface ImportMetaEnv {
  /** Base URL of the UniEats backend, e.g. http://localhost:8080. Empty: built-in sample data only. */
  readonly PUBLIC_API_URL?: string;
  /** Server-only backend URL used when the Docker frontend renders its static pages at startup. */
  readonly SERVER_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
