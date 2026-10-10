interface ImportMetaEnv {
  /** Base URL of the UniEats backend, e.g. http://localhost:8080. Empty: built-in sample data only. */
  readonly PUBLIC_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
