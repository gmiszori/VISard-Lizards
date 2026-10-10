import type { Visit } from '../location/visits.ts';
import type { MensaChoice } from './getRatingPrompt.ts';

export function visitCandidates(mensas: readonly MensaChoice[], visits: readonly Visit[]): MensaChoice[] {
  const byId = new Map(mensas.map(mensa => [mensa.mensaId, mensa]));
  const seen = new Set<string>();
  return visits.flatMap(visit => {
    const mensa = byId.get(visit.mensaId);
    const key = `${visit.date}:${visit.mensaId}`;
    if (!mensa || seen.has(key)) return [];
    seen.add(key);
    return [{ ...mensa, date: visit.date }];
  });
}
