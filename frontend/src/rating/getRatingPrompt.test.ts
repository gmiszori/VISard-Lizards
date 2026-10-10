import test from 'node:test';
import assert from 'node:assert/strict';
import { getRatingPrompt, type MensaChoice, type RatingPromptState } from './getRatingPrompt.ts';
const state = (): RatingPromptState => ({ resolvedDates: [], dismissedDates: [], promptedDays: {} });
const at = (time: string, date = '2026-10-09') => new Date(`${date}T${time}:00+02:00`);
/** A visit on 2026-10-09 whose meal is eaten at readyTime. */
const visit = (readyTime = '12:40', mensaId = 'archimedes'): MensaChoice =>
  ({ mensaId, name: mensaId, date: '2026-10-09', readyAt: at(readyTime).getTime(), source: 'location' });
const guess = (mensaId: string): MensaChoice => ({ mensaId, name: mensaId });

for (const [time, expected] of [['12:39', null], ['12:40', '2026-10-09'], ['18:00', '2026-10-09'], ['22:59', '2026-10-09'], ['23:00', null]] as const) {
  test(`visit ready 12:40, ${time} Zurich -> ${expected ?? 'null'}`, () =>
    assert.equal(getRatingPrompt(at(time), [visit()], state())?.date ?? null, expected));
}
test('visits without an arrival time count as eaten', () =>
  assert.equal(getRatingPrompt(at('11:00'), [{ mensaId: 'a', name: 'A', date: '2026-10-09' }], state())?.kind, 'visit'));
test('10:59 next day -> yesterday, whatever readyAt', () =>
  assert.equal(getRatingPrompt(at('10:59', '2026-10-10'), [visit('22:00')], state())?.date, '2026-10-09'));
test('11:00 next day -> nothing about yesterday', () => assert.equal(getRatingPrompt(at('11:00', '2026-10-10'), [visit()], state()), null));
test('already resolved today or yesterday -> null', () => {
  const s = state(); s.resolvedDates.push('2026-10-09');
  assert.equal(getRatingPrompt(at('13:30'), [visit()], s), null);
  assert.equal(getRatingPrompt(at('10:59', '2026-10-10'), [visit()], s), null);
});
test('dismissed dates never return', () => {
  const s = state(); s.dismissedDates.push('2026-10-09');
  assert.equal(getRatingPrompt(at('14:00'), [visit()], s), null);
  assert.equal(getRatingPrompt(at('09:00', '2026-10-10'), [visit()], s), null);
});
test('two-day-old visit -> null', () => assert.equal(getRatingPrompt(at('14:00'), [{ ...visit(), date: '2026-10-07' }], state()), null));
test('only one distinct prompt per calendar day, including yesterday in the morning', () => {
  const s = state(); s.promptedDays['2026-10-09'] = '2026-10-08'; s.resolvedDates.push('2026-10-08');
  assert.equal(getRatingPrompt(at('14:00'), [visit()], s), null);
});
test('unresolved target can resume until resolved', () => {
  const s = state(); s.promptedDays['2026-10-09'] = '2026-10-09';
  assert.equal(getRatingPrompt(at('16:00'), [visit()], s)?.date, '2026-10-09');
});
test('visited mensas: deduplicated, only the target date, max four, before guesses', () => {
  const candidates = [visit(), visit(), { ...visit(), mensaId: 'old', date: '2026-10-07' },
    ...['1', '2', '3', '4', '5'].map(id => visit('12:00', id)), guess('fav')];
  const prompt = getRatingPrompt(at('14:00'), candidates, state());
  assert.equal(prompt?.kind, 'visit');
  assert.deepEqual(prompt?.mensaChoices.map(m => m.mensaId), ['archimedes', '1', '2', '3']);
});
test('guesses: from 14:00, max three, marked as guesses', () => {
  const guesses = ['a', 'b', 'c', 'd'].map(guess);
  assert.equal(getRatingPrompt(at('13:59'), guesses, state()), null);
  const prompt = getRatingPrompt(at('14:00'), guesses, state());
  assert.equal(prompt?.kind, 'guess');
  assert.deepEqual(prompt?.mensaChoices.map(m => [m.mensaId, m.source]), [['a', 'guess'], ['b', 'guess'], ['c', 'guess']]);
  assert.equal(getRatingPrompt(at('09:00', '2026-10-10'), guesses, state()), null, 'no guesses about yesterday');
});
test('no guess while a visit of today is not eaten yet', () =>
  assert.equal(getRatingPrompt(at('14:00'), [visit('14:30'), guess('a')], state()), null));
test('"nowhere" keeps guess questions away until quietUntil, visits still ask', () => {
  const s = state(); s.quietUntil = '2026-10-12';
  assert.equal(getRatingPrompt(at('15:00'), [guess('a')], s), null);
  assert.equal(getRatingPrompt(at('15:00'), [visit(), guess('a')], s)?.kind, 'visit');
  assert.equal(getRatingPrompt(at('15:00', '2026-10-13'), [guess('a')], s)?.kind, 'guess');
});
test('no candidates means no rating question', () => assert.equal(getRatingPrompt(at('14:00'), [], state()), null));
test('uses Zurich rather than host timezone', () => assert.equal(getRatingPrompt(new Date('2026-10-09T11:30:00Z'), [visit()], state())?.date, '2026-10-09'));
test('calendar subtraction handles DST changes and month/year boundaries', () => {
  for (const [now, target] of [['2026-03-29T08:59:00Z', '2026-03-28'], ['2026-10-25T09:59:00Z', '2026-10-24'], ['2027-01-01T09:59:00Z', '2026-12-31']]) {
    assert.equal(getRatingPrompt(new Date(now!), [{ mensaId: 'a', name: 'A', date: target! }], state())?.date, target);
  }
});
test('invalid clock -> null; inputs remain unchanged', () => {
  const s = state(); const snapshot = JSON.stringify(s);
  assert.equal(getRatingPrompt(new Date('invalid'), [visit()], s), null);
  getRatingPrompt(at('14:00'), [visit(), guess('a')], s);
  assert.equal(JSON.stringify(s), snapshot);
});
