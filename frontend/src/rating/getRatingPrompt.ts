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

/** Before 11:00 the question is about yesterday, from then until 23:00 about today. */
const MORNING_END_MIN = 11 * 60;
const EVENING_END_MIN = 23 * 60;
/** Guess questions only after lunch. */
const GUESS_FROM_MIN = 14 * 60;
const MAX_VISITED = 4;
const MAX_GUESSES = 3;

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
export function zurichTime(now: Date) {
  const parts = Object.fromEntries(formatter.formatToParts(now).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
function previousDate(date: string): string {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

function unique(choices: readonly MensaChoice[]): MensaChoice[] {
  const seen = new Set<string>();
  return choices.filter(m => !seen.has(m.mensaId) && Boolean(seen.add(m.mensaId)));
}

/**
 * The rating question to show now, or null. All calendar and window decisions use Zurich, independent of the
 * device timezone.
 * - Visits (location or crowd report) of today count once the meal is probably eaten (readyAt <= now), until
 *   23:00; before 11:00 the visits of yesterday are asked about.
 * - Without any visit today, undated guesses give "Where did you eat today?" from 14:00, unless the user
 *   answered "nowhere" recently (quietUntil).
 */
export function getRatingPrompt(now: Date, candidates: readonly MensaChoice[], state: RatingPromptState): RatingPrompt | null {
  if (!Number.isFinite(now.getTime())) return null;
  const { date: today, minutes } = zurichTime(now);
  if (minutes >= EVENING_END_MIN) return null;
  const date = minutes < MORNING_END_MIN ? previousDate(today) : today;
  if (state.resolvedDates.includes(date) || state.dismissedDates.includes(date)) return null;
  if (state.promptedDays[today] && state.promptedDays[today] !== date) return null;
  const visited = unique(candidates.filter(m => m.date === date && (date !== today || (m.readyAt ?? 0) <= now.getTime())));
  if (visited.length) return { date, mensaChoices: visited.slice(0, MAX_VISITED), kind: 'visit' };
  if (date !== today || minutes < GUESS_FROM_MIN || (state.quietUntil && today <= state.quietUntil)) return null;
  // A visit today whose meal is not eaten yet: wait for it instead of guessing.
  if (candidates.some(m => m.date === today)) return null;
  const guesses = unique(candidates.filter(m => !m.date)).slice(0, MAX_GUESSES);
  return guesses.length ? { date, mensaChoices: guesses.map(m => ({ ...m, source: 'guess' as const })), kind: 'guess' } : null;
}
