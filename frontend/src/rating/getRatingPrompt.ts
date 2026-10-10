/** hasMenu is false for mensas that serve no meals (closed for renovation, bars); undefined counts as true. */
export interface MensaChoice { mensaId: string; name: string; date?: string; hasMenu?: boolean }
export interface RatingPromptState {
  resolvedDates: string[];
  dismissedDates: string[];
  /** The target already presented on each Zurich calendar day. */
  promptedDays: Record<string, string>;
}
export interface RatingPrompt { date: string; mensaChoices: MensaChoice[] }

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

/** All calendar and window decisions use Zurich, independent of the device timezone. */
export function getRatingPrompt(now: Date, lastEatenCandidates: readonly MensaChoice[], state: RatingPromptState): RatingPrompt | null {
  if (!Number.isFinite(now.getTime())) return null;
  const { date: today, minutes } = zurichTime(now);
  const date = minutes < 660 ? previousDate(today) : minutes >= 810 && minutes < 1260 ? today : null;
  if (!date || state.resolvedDates.includes(date) || state.dismissedDates.includes(date)) return null;
  if (state.promptedDays[today] && state.promptedDays[today] !== date) return null;
  const seen = new Set<string>();
  const mensaChoices = lastEatenCandidates.filter(m => {
    if ((m.date && m.date !== date) || seen.has(m.mensaId)) return false;
    seen.add(m.mensaId);
    return true;
  }).slice(0, 4);
  // A location-based prompt needs a visit for the target meal date.
  if (!mensaChoices.length) return null;
  return { date, mensaChoices };
}
