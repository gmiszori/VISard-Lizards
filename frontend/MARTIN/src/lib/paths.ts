/**
 * Prefixes internal links with the deploy base path (e.g. "/tablett-mensa" on
 * GitHub Pages, "" when served from the domain root).
 * Set the base at build time with BASE_PATH, see astro.config.mjs.
 */
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export const href = (path: string): string => `${base}${path}`;
