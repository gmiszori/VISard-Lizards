import { readyAt, type Visit } from '../location/visits.ts';
import type { MensaChoice } from './getRatingPrompt.ts';

/**
 * The visited mensas as dated rating candidates, with when the meal is probably eaten (readyAt) and how the
 * visit is known (source). Lunch and dinner at the same mensa on one day give one candidate, the earlier one.
 */
export function visitCandidates(mensas: readonly MensaChoice[], visits: readonly Visit[]): MensaChoice[] {
  const byId = new Map(mensas.map(mensa => [mensa.mensaId, mensa]));
  const candidates = new Map<string, MensaChoice>();
  for (const visit of visits) {
    const mensa = byId.get(visit.mensaId);
    if (!mensa) continue;
    const ready = readyAt(visit);
    const choice: MensaChoice = { ...mensa, date: visit.date, ...(ready === null ? {} : { readyAt: ready }), source: visit.source ?? 'location' };
    const key = `${visit.date}:${visit.mensaId}`;
    const before = candidates.get(key);
    if (!before || (choice.readyAt ?? 0) < (before.readyAt ?? 0)) candidates.set(key, choice);
  }
  return [...candidates.values()];
}
