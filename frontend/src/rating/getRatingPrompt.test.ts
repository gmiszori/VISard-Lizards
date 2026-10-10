import test from 'node:test';
import assert from 'node:assert/strict';
import { getRatingPrompt, type RatingPromptState } from './getRatingPrompt.ts';
const choices = [{ mensaId: 'archimedes', name: 'Archimedes' }];
const state = (): RatingPromptState => ({ resolvedDates: [], dismissedDates: [], promptedDays: {} });
const at = (time: string) => new Date(`2026-10-09T${time}:00+02:00`);
for (const [time, expected] of [['12:00', null], ['13:29', null], ['13:30', '2026-10-09'], ['20:59', '2026-10-09'], ['21:00', null]] as const) {
  test(`${time} Zurich -> ${expected ?? 'null'}`, () => assert.equal(getRatingPrompt(at(time), choices, state())?.date ?? null, expected));
}
test('10:59 next day -> yesterday', () => assert.equal(getRatingPrompt(new Date('2026-10-10T10:59:00+02:00'), choices, state())?.date, '2026-10-09'));
test('11:00 next day -> null', () => assert.equal(getRatingPrompt(new Date('2026-10-10T11:00:00+02:00'), choices, state()), null));
test('already resolved today or yesterday -> null', () => {
  const s = state(); s.resolvedDates.push('2026-10-09');
  assert.equal(getRatingPrompt(at('13:30'), choices, s), null);
  assert.equal(getRatingPrompt(new Date('2026-10-10T10:59:00+02:00'), choices, s), null);
});
test('dismissed dates never return', () => {
  const s = state(); s.dismissedDates.push('2026-10-09');
  assert.equal(getRatingPrompt(at('14:00'), choices, s), null);
  assert.equal(getRatingPrompt(new Date('2026-10-10T09:00:00+02:00'), choices, s), null);
});
test('two-day-old history -> null', () => assert.equal(getRatingPrompt(at('14:00'), [{ ...choices[0]!, date: '2026-10-07' }], state()), null));
test('only one distinct prompt per calendar day, including yesterday in the morning', () => {
  const s = state(); s.promptedDays['2026-10-09'] = '2026-10-08'; s.resolvedDates.push('2026-10-08');
  assert.equal(getRatingPrompt(at('14:00'), choices, s), null);
});
test('unresolved target can resume until resolved', () => {
  const s = state(); s.promptedDays['2026-10-09'] = '2026-10-09';
  assert.equal(getRatingPrompt(at('16:00'), choices, s)?.date, '2026-10-09');
});
test('deduplicates choices, excludes mismatched dates, max four', () => {
  const candidates = [choices[0]!, choices[0]!, { ...choices[0]!, mensaId: 'old', date: '2026-10-07' },
    ...[1, 2, 3, 4, 5].map(i => ({ mensaId: String(i), name: String(i) }))];
  assert.deepEqual(getRatingPrompt(at('14:00'), candidates, state())?.mensaChoices.map(m => m.mensaId), ['archimedes', '1', '2', '3']);
});
test('no verified visit means no rating question', () => assert.equal(getRatingPrompt(at('14:00'), [], state()), null));
test('uses Zurich rather than host timezone', () => assert.equal(getRatingPrompt(new Date('2026-10-09T11:30:00Z'), choices, state())?.date, '2026-10-09'));
test('calendar subtraction handles DST changes and month/year boundaries', () => {
  for (const [now, target] of [['2026-03-29T08:59:00Z', '2026-03-28'], ['2026-10-25T09:59:00Z', '2026-10-24'], ['2027-01-01T09:59:00Z', '2026-12-31']]) {
    assert.equal(getRatingPrompt(new Date(now!), choices, state())?.date, target);
  }
});
test('invalid clock -> null; inputs remain unchanged', () => {
  const s = state(); const snapshot = JSON.stringify(s);
  assert.equal(getRatingPrompt(new Date('invalid'), choices, s), null);
  getRatingPrompt(at('14:00'), choices, s);
  assert.equal(JSON.stringify(s), snapshot);
});
