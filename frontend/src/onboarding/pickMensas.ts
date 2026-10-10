import { canShowCanteen } from '../preferences/canteenVisibility.ts';

export interface PickableMensa { id: string; campusId: string; hasMenu?: boolean; temporarilyClosed?: boolean }
export interface CampusSelection { campus: string; campusSecondary: readonly string[] }

export function eligibleRatingMensas<T extends PickableMensa>(mensas: readonly T[], profile: CampusSelection & { priceTier: string }): T[] {
  const allowed = new Set([profile.campus, ...profile.campusSecondary]);
  return mensas.filter(m => m.hasMenu === true && !m.temporarilyClosed && allowed.has(m.campusId) &&
    canShowCanteen(m.id, profile.priceTier));
}

/** Callers with minimal {id, campusId} records prefilter availability. Full records
 * are also accepted, and unavailable records are rejected here defensively. */
export function pickMensas<T extends PickableMensa>(mensas: readonly T[], ratingCounts: Record<string, number>,
  campus: CampusSelection, rng: () => number, n = 3): T[] {
  const allowed = new Set([campus.campus, ...campus.campusSecondary]);
  const pool = [...new Map(mensas.filter(m => allowed.has(m.campusId) && m.hasMenu !== false && !m.temporarilyClosed)
    .map(m => [m.id, m])).values()];
  const result: T[] = [];
  const count = Math.max(0, Math.floor(n));
  const weight = (m: T) => (m.campusId === campus.campus ? 2 : 1) / (Math.max(0, ratingCounts[m.id] ?? 0) + 1);
  const take = (candidates: T[]) => {
    let ticket = Math.min(1 - Number.EPSILON, Math.max(0, rng())) * candidates.reduce((sum, m) => sum + weight(m), 0);
    const chosen = candidates.find(m => (ticket -= weight(m)) < 0) ?? candidates[candidates.length - 1]!;
    result.push(chosen);
    pool.splice(pool.findIndex(m => m.id === chosen.id), 1);
  };
  const home = pool.filter(m => m.campusId === campus.campus);
  if (count && home.length) take(home);
  while (result.length < count && pool.length) take(pool);
  // Shuffle display order too, so the guaranteed home choice is not always first.
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.min(1 - Number.EPSILON, Math.max(0, rng())) * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
