export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type CrowdWeekday = typeof WEEKDAYS[number];

/** Backend handoff: occupancy is 0–100, null means no prediction (never 0). */
export interface CrowdPrediction {
  mensaId: string;
  intervalMinutes: 15;
  timeZone: 'Europe/Zurich';
  source: 'preview' | 'backend';
  byWeekday: Partial<Record<CrowdWeekday, Record<string, number | null>>>;
}

export interface CrowdSlot { startMinute: number; occupancyPct: number | null }
export const formatTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Preserve missing quarter-hours as gaps and reject values outside the contract. */
export function slotsForDay(prediction: CrowdPrediction, day: CrowdWeekday): CrowdSlot[] {
  const entries = Object.entries(prediction.byWeekday[day] ?? {})
    .filter(([time]) => /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(time))
    .map(([time, value]) => ({
      startMinute: Number(time.slice(0, 2)) * 60 + Number(time.slice(3)),
      occupancyPct: typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value) : null,
    })).sort((a, b) => a.startMinute - b.startMinute);
  if (!entries.length) return [];
  const values = new Map(entries.map(slot => [slot.startMinute, slot.occupancyPct]));
  const slots: CrowdSlot[] = [];
  for (let minute = entries[0]!.startMinute; minute <= entries.at(-1)!.startMinute; minute += 15) {
    slots.push({ startMinute: minute, occupancyPct: values.get(minute) ?? null });
  }
  return slots;
}
