/**
 * Connection to the UniEats backend (backend/, Spring Boot). Used at build/render time by the pages
 * (src/data/app-data.ts) and in the browser (meal ratings, crowd chart).
 *
 * PUBLIC_API_URL (see .env.example) overrides the backend's base URL. Browser requests default to
 * the page's origin; build-time requests use http://localhost:8080.
 * Set it to an empty value to run without a backend on the built-in sample data.
 * Endpoints are documented in backend/API.md and in the backend's Swagger UI (/swagger-ui.html).
 */

const DEFAULT_API_URL = 'http://localhost:8080';

/** Base URL without trailing slash; '' means "no backend". Outside Vite (node tests) there is no backend. */
export function resolveApiUrl(configured: string | undefined, pageOrigin?: string): string {
  return (configured ?? pageOrigin ?? DEFAULT_API_URL).trim().replace(/\/+$/, '');
}

export const API_URL: string = (() => {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  if (!env) return '';
  if (typeof window === 'undefined') {
    // Static pages in the Docker image are rendered after the backend starts. This
    // server-only URL must never be baked into browser requests; Caddy proxies /api.
    const serverUrl = typeof process === 'undefined' ? undefined : process.env.SERVER_API_URL;
    return resolveApiUrl(serverUrl ?? env.PUBLIC_API_URL);
  }
  return resolveApiUrl(env.PUBLIC_API_URL, window.location.origin);
})();

/** An HTTP error from the backend, with its problem-detail message (backend/API.md, "Errors"). */
export class ApiError extends Error {
  readonly status: number;
  readonly retryAfterMs?: number;
  constructor(status: number, detail: string, retryAfterMs?: number) {
    super(detail);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Retry-After is a non-negative number of seconds or an HTTP date (RFC 9110, section 10.2.3). */
export function retryAfterMs(header: string | null, now = Date.now()): number | undefined {
  const value = header?.trim();
  if (!value) return undefined;
  if (/^\d+$/.test(value)) {
    const delay = Number(value) * 1000;
    return Number.isSafeInteger(delay) ? delay : undefined;
  }
  if (!/^[A-Za-z]/.test(value) || !/GMT$/.test(value)) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : undefined;
}

async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body: unknown, baseUrl: string, timeoutMs: number): Promise<T> {
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
    throw new ApiError(response.status, detail, retryAfterMs(response.headers.get('Retry-After')));
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const apiGet = <T>(path: string, baseUrl = API_URL, timeoutMs = 5000) =>
  request<T>('GET', path, undefined, baseUrl, timeoutMs);
export const apiPost = <T>(path: string, body: unknown, baseUrl = API_URL, timeoutMs = 8000) =>
  request<T>('POST', path, body, baseUrl, timeoutMs);
export const apiPut = <T>(path: string, body: unknown, baseUrl = API_URL, timeoutMs = 8000) =>
  request<T>('PUT', path, body, baseUrl, timeoutMs);
export const apiDelete = (path: string, body: unknown, baseUrl = API_URL, timeoutMs = 8000) =>
  request<void>('DELETE', path, body, baseUrl, timeoutMs);

// ───────── Backend response shapes (subset the frontend uses) ─────────

export interface BackendMeal {
  id: string;
  name: string;
  prices: { student: number | null; staff: number | null; external: number | null };
  components?: string[];
  description: string | null;
  /** Canonical allergen ids, e.g. "gluten", "milk". */
  allergens: string[];
  /** Possible cross-contact, kept separate from ingredients. */
  traceAllergens?: string[];
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
  location: string;
  /** Campus display name: Zentrum, Hönggerberg or Irchel. */
  campus: string;
  openingHours: Record<string, Array<{ from: string; to: string }>> | null;
  /** WGS84, accurate to the building; null when unknown. */
  coordinates: { lat: number; lng: number } | null;
  avgRating: number | null;
}

export const getMensas = (baseUrl = API_URL, timeoutMs = 10000): Promise<BackendMensa[]> =>
  apiGet<BackendMensa[]>('/api/mensas', baseUrl, timeoutMs);

/** GET /api/meta */
export interface BackendMeta {
  today: string;
  menuDate: string;
  /** Last day with meals, if the backend says. */
  dataTo?: string;
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
  /** location, crowd or guess; null if the request had none. */
  source?: string | null;
}

/** Structured database query extracted from natural language via OpenAI */
export interface StructuredMealQuery {
  originalQuery: string;
  maxPrice: number | null;
  minPrice: number | null;
  diet: string | null;
  searchTerms: string[];
  excludeAllergens: string[];
  campus: string | null;
  prioritizePrice: boolean;
  prioritizeDistance: boolean;
  prioritizeRating: boolean;
  prioritizeEco: boolean;
  explanation: string | null;
}

export interface StructuredMealResult {
  mensaId: string;
  mensaName: string;
  campus: string;
  distanceM: number | null;
  date: string;
  meal: BackendMeal;
  avgRating: number | null;
  tagCounts: Record<string, number>;
  score: number;
  price: number | null;
  matchReason: string | null;
}

export interface StructuredMealSearchResponse {
  structuredQuery: StructuredMealQuery;
  totalMatches: number;
  results: StructuredMealResult[];
  userLat: number | null;
  userLng: number | null;
}

/** Extract structured query using OpenAI from natural language */
export const extractStructuredQuery = (query: string, baseUrl = API_URL, timeoutMs = 15000): Promise<StructuredMealQuery> =>
  apiPost<StructuredMealQuery>('/api/search/extract-query', { query }, baseUrl, timeoutMs);

/** Execute structured search against backend meals database */
export const searchStructuredMeals = (
  params: {
    query?: string;
    userLat?: number | null;
    userLng?: number | null;
    date?: string;
    campus?: string | null;
    priceCategory?: 'STUDENT' | 'STAFF' | 'EXTERNAL';
    structuredQuery?: StructuredMealQuery | null;
  },
  baseUrl = API_URL,
  timeoutMs = 15000
): Promise<StructuredMealSearchResponse> =>
  apiPost<StructuredMealSearchResponse>('/api/meals/search-structured', params, baseUrl, timeoutMs);

export interface HybridSearchCriteria {
  semanticQuery: string | null;
  isLocationScoped: boolean;
  hardFilters: {
    id: string | null;
    date: string | null;
    mensaId: string | null;
    campusId: string | null;
    dietTag: string | null;
    kind: string | null;
    service: string | null;
    priceStudent: { gte: number | null; lte: number | null; gt: number | null; lt: number | null } | null;
    priceStaff: { gte: number | null; lte: number | null; gt: number | null; lt: number | null } | null;
    priceExternal: { gte: number | null; lte: number | null; gt: number | null; lt: number | null } | null;
    excludeAllergens: string[];
  };
  sortBy: 'RELEVANCE' | 'PRICE_ASC' | 'PRICE_DESC' | 'DISTANCE_ASC';
}

export interface HybridMealSearchResponse {
  criteria: HybridSearchCriteria;
  totalMatches: number;
  results: Array<{
    mensaId: string;
    mensaName: string;
    date: string;
    meal: BackendMeal;
    similarity: number | null;
    distanceM: number | null;
  }>;
}

export interface RealtimeVoiceSession {
  clientSecret: string;
  expiresAt: number;
  instructions: string;
}

export const createRealtimeVoiceSession = (params: {
  activeMensaId: string | null;
  activeCampusId: string | null;
  priceCategory: 'STUDENT' | 'STAFF' | 'EXTERNAL';
  appLanguage: 'en' | 'de';
  /** The app's Zurich local time ("YYYY-MM-DDTHH:mm"), simulated in dev mode. */
  now?: string | null;
}, baseUrl = API_URL): Promise<RealtimeVoiceSession> =>
  apiPost<RealtimeVoiceSession>('/api/voice/realtime-session', params, baseUrl, 15000);

export const searchHybridMeals = (
  params: {
    query: string;
    mensaId?: string | null;
    campusId?: string | null;
    campusIds?: string[] | null;
    date?: string | null;
    /** The app's Zurich date that "today" and "tomorrow" resolve against, simulated in dev mode. */
    today?: string | null;
    priceCategory?: 'STUDENT' | 'STAFF' | 'EXTERNAL';
    appLanguage?: 'en' | 'de';
    userLat?: number | null;
    userLng?: number | null;
    limit?: number;
    criteria?: HybridSearchCriteria;
  },
  baseUrl = API_URL,
  timeoutMs = 20000
): Promise<HybridMealSearchResponse> =>
  apiPost<HybridMealSearchResponse>('/api/meals/hybrid-search', params, baseUrl, timeoutMs);
