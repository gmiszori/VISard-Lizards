/**
 * The only module the UI talks to for data.
 *
 * - PUBLIC_API_URL set   → real REST calls (endpoints documented per function).
 * - PUBLIC_API_URL unset → the deterministic mock from mock.ts, after a short
 *   artificial delay so loading states are visible.
 *
 * To plug in the backend, set the env var; no component changes are needed.
 */
import {
  mockCrowd,
  mockMeal,
  mockMenu,
  mockMensas,
  mockSubmitCrowdReport,
  mockSubmitMealRating,
  mockSubmitMensaRating,
} from './mock';
import { dev } from './store';
import { getNow } from './time';
import type {
  CrowdInfo,
  CrowdLevel,
  CrowdReport,
  Meal,
  MealDetail,
  MealRating,
  MealTag,
  Mensa,
  MensaAspect,
  MensaRating,
} from './types';

const BASE = (import.meta.env.PUBLIC_API_URL ?? '').replace(/\/$/, '');
export const USING_MOCK = BASE === '';

const MOCK_DELAY_MS = 380;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new ApiError(`Request failed (${res.status})`, res.status);
  return (await res.json()) as T;
}

/** Runs a mock call after a delay, honouring the developer panel's "fail every call" switch. */
async function mock<T>(fn: () => T): Promise<T> {
  await wait(MOCK_DELAY_MS);
  if (dev.get().apiFail) throw new ApiError('Simulated API failure (developer panel)', 503);
  return fn();
}

/** GET /mensas */
export function getMensas(): Promise<Mensa[]> {
  return USING_MOCK ? mock(mockMensas) : http<Mensa[]>('/mensas');
}

/** GET /mensas/:mensaId/menu?date=YYYY-MM-DD → both services of that day. */
export function getMenu(mensaId: string, date: string): Promise<Meal[]> {
  return USING_MOCK
    ? mock(() => mockMenu(mensaId, date))
    : http<Meal[]>(`/mensas/${encodeURIComponent(mensaId)}/menu?date=${date}`);
}

/** GET /meals/:mealId */
export function getMeal(mealId: string): Promise<MealDetail> {
  return USING_MOCK ? mock(() => mockMeal(mealId)) : http<MealDetail>(`/meals/${encodeURIComponent(mealId)}`);
}

/** GET /mensas/:mensaId/crowd → typical pattern + reports of the last ~30 min. */
export function getCrowd(mensaId: string): Promise<CrowdInfo> {
  return USING_MOCK ? mock(() => mockCrowd(mensaId)) : http<CrowdInfo>(`/mensas/${encodeURIComponent(mensaId)}/crowd`);
}

/**
 * POST /mensas/:mensaId/crowd-reports  body: { level }
 * The real server stamps the time itself; the mock uses the app clock so the
 * simulated time from the developer panel works.
 */
export function submitCrowdReport(mensaId: string, level: CrowdLevel): Promise<CrowdReport> {
  const report: CrowdReport = { mensaId, level, timestamp: getNow().toISOString() };
  if (USING_MOCK) {
    return mock(() => {
      mockSubmitCrowdReport(report);
      return report;
    });
  }
  return http<CrowdReport>(`/mensas/${encodeURIComponent(mensaId)}/crowd-reports`, {
    method: 'POST',
    body: JSON.stringify({ level }),
  });
}

/** POST /meals/:mealId/ratings  body: { stars, tags } */
export function submitMealRating(input: {
  mealId: string;
  mensaId: string;
  stars: MealRating['stars'];
  tags: MealTag[];
  mealTitle?: string;
}): Promise<MealRating> {
  const rating: MealRating = { ...input, timestamp: getNow().toISOString() };
  if (USING_MOCK) {
    return mock(() => {
      mockSubmitMealRating(rating);
      return rating;
    });
  }
  return http<MealRating>(`/meals/${encodeURIComponent(input.mealId)}/ratings`, {
    method: 'POST',
    body: JSON.stringify({ stars: input.stars, tags: input.tags }),
  });
}

/** POST /mensas/:mensaId/ratings  body: { stars, aspects } */
export function submitMensaRating(input: {
  mensaId: string;
  stars: MensaRating['stars'];
  aspects: Partial<Record<MensaAspect, number>>;
}): Promise<MensaRating> {
  const rating: MensaRating = { ...input, timestamp: getNow().toISOString() };
  if (USING_MOCK) {
    return mock(() => {
      mockSubmitMensaRating(rating);
      return rating;
    });
  }
  return http<MensaRating>(`/mensas/${encodeURIComponent(input.mensaId)}/ratings`, {
    method: 'POST',
    body: JSON.stringify({ stars: input.stars, aspects: input.aspects }),
  });
}
