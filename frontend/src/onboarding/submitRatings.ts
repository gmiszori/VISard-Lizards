import { API_URL, apiPost } from '../data/api.ts';
import type { Profile } from './profile.ts';

const KEY = 'campuseats-submitted-mensa-ratings';
const session = new Map<string, number>();

export async function submitMensaRatings(ratings: Profile['mensaRatings'], storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
  apiUrl = API_URL): Promise<void> {
  if (!apiUrl) return;
  let saved: Record<string, number> = {};
  try {
    const value: unknown = JSON.parse(storage.getItem(KEY) ?? '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) saved = value as Record<string, number>;
  } catch { /* in-memory tracking still avoids duplicates within this visit */ }
  for (const { mensaId, rating } of ratings) {
    if (saved[mensaId] === rating || session.get(mensaId) === rating) continue;
    await apiPost(`/api/mensas/${encodeURIComponent(mensaId)}/ratings`, { stars: rating }, apiUrl);
    session.set(mensaId, rating);
    saved[mensaId] = rating;
    try { storage.setItem(KEY, JSON.stringify(saved)); } catch { /* accepted server ratings remain successful */ }
  }
  if (typeof document !== 'undefined') document.dispatchEvent(new Event('campuseats:feedback-changed'));
}
