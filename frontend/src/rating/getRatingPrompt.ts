import { minutesOfDay, zurichParts } from '../time/clock.ts';

/** How the app knows the user ate at a mensa: located there, reported its crowd, or a guess to ask about. */
export type RatingSource = 'location' | 'crowd' | 'guess';
/**
 * hasMenu is false for mensas that serve no meals (closed for renovation, bars); undefined counts as true.
 * Visited mensas carry the visit date and, if known, readyAt (epoch ms) when the meal is probably eaten.
 * Undated choices are guesses (favourites, profile) for users without location.
 */
export interface MensaChoice { mensaId: string; name: string; date?: string; hasMenu?: boolean; readyAt?: number; source?: RatingSource; service?: 'lunch' | 'dinner' }
export interface RatingPromptState {
  resolvedDates: string[];
  dismissedDates: string[];
  /** The target already presented on each Zurich calendar day. */
  promptedDays: Record<string, string>;
  /** "Nowhere" on a guess question: no guess questions up to and including this date. */
  quietUntil?: string;
}
/** visit: the user was at these mensas; guess: "Where did you eat today?" with suggestions. */
export interface RatingPrompt { date: string; mensaChoices: MensaChoice[]; kind: 'visit' | 'guess' }

const EVENING_END_MIN = 23 * 60;
const GUESS_FROM_MIN = 14 * 60;
const GUESS_UNTIL_MIN = 16 * 60;
const VISIT_WINDOW_MS = 2 * 60 * 60 * 1000;
const MAX_VISITED = 4;
const MAX_GUESSES = 3;

export function zurichTime(now: Date) {
  const { date, time } = zurichParts(now);
  return { date, minutes: minutesOfDay(time) };
}
function unique(choices: readonly MensaChoice[]): MensaChoice[] {
  const seen = new Set<string>();
  return choices.filter(m => !seen.has(m.mensaId) && Boolean(seen.add(m.mensaId)));
}

/**
 * The rating question to show now, or null. All calendar and window decisions use Zurich, independent of the
 * device timezone.
 * - Visits of today count only from the estimated meal completion until two hours later.
 * - Without a visit, guesses are allowed from 14:00 to 16:00 on the same day only.
 */
export function getRatingPrompt(now: Date, candidates: readonly MensaChoice[], state: RatingPromptState): RatingPrompt | null {
  if (!Number.isFinite(now.getTime())) return null;
  const { date: today, minutes } = zurichTime(now);
  if (minutes >= EVENING_END_MIN) return null;
  if (state.resolvedDates.includes(today) || state.dismissedDates.includes(today)) return null;
  if (state.promptedDays[today] && state.promptedDays[today] !== today) return null;
  const visited = unique(candidates.filter(m => m.date === today && Number.isFinite(m.readyAt) &&
    m.readyAt! <= now.getTime() && now.getTime() - m.readyAt! <= VISIT_WINDOW_MS));
  if (visited.length) return { date: today, mensaChoices: visited.slice(0, MAX_VISITED), kind: 'visit' };
  if (minutes < GUESS_FROM_MIN || minutes >= GUESS_UNTIL_MIN) return null;
  if (state.quietUntil && today <= state.quietUntil) return null;
  // A visit today that is not yet eaten or already too old must not turn into a guess.
  if (candidates.some(m => m.date === today)) return null;
  const guesses = unique(candidates.filter(m => !m.date)).slice(0, MAX_GUESSES);
  return guesses.length ? { date: today, mensaChoices: guesses.map(m => ({ ...m, source: 'guess' as const })), kind: 'guess' } : null;
}
