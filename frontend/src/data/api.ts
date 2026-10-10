/**
 * Connection to the CampusEats backend (backend/, Spring Boot). Used at build/render time by the pages
 * (src/data/app-data.ts) and in the browser (meal ratings, crowd chart).
 *
 * PUBLIC_API_URL (see .env.example) sets the backend's base URL; it defaults to http://localhost:8080.
 * Set it to an empty value to run without a backend on the built-in sample data.
 * Endpoints are documented in backend/API.md and in the backend's Swagger UI (/swagger-ui.html).
 */

const DEFAULT_API_URL = 'http://localhost:8080';

/** Base URL without trailing slash; '' means "no backend". Outside Vite (node tests) there is no backend. */
export const API_URL: string = (() => {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  if (!env) return '';
  return (env.PUBLIC_API_URL ?? DEFAULT_API_URL).trim().replace(/\/+$/, '');
})();

/** An HTTP error from the backend, with its problem-detail message (backend/API.md, "Errors"). */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body: unknown, baseUrl: string, timeoutMs: number): Promise<T> {
  if (!baseUrl) throw new ApiError(0, 'No backend configured (PUBLIC_API_URL is empty).');
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try { detail = ((await response.json()) as { detail?: string }).detail ?? detail; } catch { /* not a problem detail */ }
    throw new ApiError(response.status, detail);
  }
  return response.json() as Promise<T>;
}

export const apiGet = <T>(path: string, baseUrl = API_URL, timeoutMs = 5000) =>
  request<T>('GET', path, undefined, baseUrl, timeoutMs);
export const apiPost = <T>(path: string, body: unknown, baseUrl = API_URL, timeoutMs = 8000) =>
  request<T>('POST', path, body, baseUrl, timeoutMs);

// ───────── Backend response shapes (subset the frontend uses) ─────────

export interface BackendMeal {
  id: string;
  name: string;
  prices: { student: number | null; staff: number | null; external: number | null };
  description: string | null;
  /** Canonical allergen ids, e.g. "gluten", "milk". */
  allergens: string[];
  /** [diet, kind, service]: vegan|vegetarian|meat|fish, main|buffet|dessert|drink, lunch|dinner */
  classification: [string, string, string];
}

/** GET /api/meals?date= and GET /api/meals/{id} */
export interface BackendMealDetail {
  mensaId: string;
  date: string;
  meal: BackendMeal;
  avgRating: number | null;
}

/** GET /api/mensas */
export interface BackendMensa {
  id: string;
  title: string;
  /** Campus display name: Zentrum, Hönggerberg or Irchel. */
  campus: string;
  /** WGS84, accurate to the building; null when unknown. */
  coordinates: { lat: number; lng: number } | null;
  avgRating: number | null;
}

/** GET /api/meta */
export interface BackendMeta {
  today: string;
  menuDate: string;
}

/** GET /api/mensas/{id}/crowd */
export interface BackendCrowd {
  histogram: {
    mensaId: string;
    sufficient: boolean;
    sampleSize: number;
    intervalMinutes: number;
    timeZone: string;
    byWeekday?: Record<string, Record<string, number | null>>;
  };
}

/** POST /api/meals/{id}/ratings response */
export interface BackendMealRating {
  mealId: string;
  mensaId: string;
  mealDate: string;
  userId: string;
  stars: number;
  ratedAt: string;
}
