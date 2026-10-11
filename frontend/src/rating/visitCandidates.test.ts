import assert from 'node:assert/strict';
import test from 'node:test';
import { getRatingPrompt } from './getRatingPrompt.ts';
import { visitCandidates } from './visitCandidates.ts';
import { STATE_KEY, useRatingPrompt } from './useRatingPrompt.ts';

const mensas = [
  { mensaId: 'polyterrasse', name: 'Polyterrasse' },
  { mensaId: 'archimedes', name: 'Archimedes' },
];
const state = { resolvedDates: [], dismissedDates: [], promptedDays: {} };
const afternoon = new Date('2026-10-09T14:00:00+02:00');

test('rating question offers only the mensa visited on the target day', () => {
  const candidates = visitCandidates(mensas, [
    { mensaId: 'polyterrasse', date: '2026-10-09', service: 'lunch', at: new Date('2026-10-09T12:10:00+02:00').getTime() },
    { mensaId: 'polyterrasse', date: '2026-10-09', service: 'dinner', at: new Date('2026-10-09T18:30:00+02:00').getTime() },
    { mensaId: 'archimedes', date: '2026-10-08', service: 'lunch' },
  ]);
  assert.deepEqual(getRatingPrompt(afternoon, candidates, state)?.mensaChoices.map(m => m.mensaId), ['polyterrasse']);
});

test('unknown mensas and visits on other days cannot trigger a question', () => {
  const candidates = visitCandidates(mensas, [
    { mensaId: 'unknown', date: '2026-10-09', service: 'lunch' },
    { mensaId: 'archimedes', date: '2026-10-08', service: 'lunch' },
  ]);
  assert.equal(getRatingPrompt(afternoon, candidates, state), null);
});

test('candidates carry readyAt and source; lunch and dinner on one day give the earlier one', () => {
  const lunch = Date.parse('2026-10-09T12:10:00+02:00');
  const dinner = Date.parse('2026-10-09T18:30:00+02:00');
  const candidates = visitCandidates(mensas, [
    { mensaId: 'polyterrasse', date: '2026-10-09', service: 'dinner', at: dinner, waitMin: 0, source: 'location' },
    { mensaId: 'polyterrasse', date: '2026-10-09', service: 'lunch', at: lunch, waitMin: 10, source: 'crowd' },
    { mensaId: 'archimedes', date: '2026-10-08', service: 'lunch' },
  ]);
  assert.deepEqual(candidates, [
    { mensaId: 'polyterrasse', name: 'Polyterrasse', date: '2026-10-09', readyAt: lunch + 30 * 60_000, source: 'crowd', service: 'lunch' },
    { mensaId: 'archimedes', name: 'Archimedes', date: '2026-10-08', source: 'location', service: 'lunch' },
  ]);
  // Reported from the queue at 12:10 with level 4: asked from 12:40 on.
  assert.equal(getRatingPrompt(new Date('2026-10-09T12:39:00+02:00'), candidates, state), null);
  assert.equal(getRatingPrompt(new Date('2026-10-09T12:40:00+02:00'), candidates, state)?.kind, 'visit');
});

test('"nowhere" on a guess question pauses guesses for three more days', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } } as Storage;
  const now = new Date('2026-10-09T15:00:00+02:00');
  const store = useRatingPrompt(() => now, [{ mensaId: 'polyterrasse', name: 'Polyterrasse' }], storage);
  assert.equal(store.current()?.kind, 'guess');
  store.resolve('2026-10-09', true, 3);
  assert.equal(JSON.parse(data.get(STATE_KEY)!).quietUntil, '2026-10-12');
});
