import { PREFERENCES_KEY, readPreferences } from '../preferences/state.ts';

export const DISTANCE_PROMPT_SEEN_KEY = 'campuseats-distance-prompt-seen';

export function distancePromptSeen(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  try { return storage.getItem(DISTANCE_PROMPT_SEEN_KEY) === '1'; } catch { return false; }
}

export function markDistancePromptSeen(storage: Pick<Storage, 'setItem'> = localStorage): void {
  try { storage.setItem(DISTANCE_PROMPT_SEEN_KEY, '1'); } catch { /* Ask again next visit if storage is blocked. */ }
}

export function saveDistanceDefault(on: boolean, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): boolean {
  try {
    storage.setItem(PREFERENCES_KEY, JSON.stringify({ ...readPreferences(storage), distanceDefault: on }));
    return true;
  } catch { return false; }
}
