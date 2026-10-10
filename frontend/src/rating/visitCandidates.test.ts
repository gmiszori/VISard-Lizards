import assert from 'node:assert/strict';
import test from 'node:test';
import { getRatingPrompt } from './getRatingPrompt.ts';
import { visitCandidates } from './visitCandidates.ts';

const mensas = [
  { mensaId: 'polyterrasse', name: 'Polyterrasse' },
  { mensaId: 'archimedes', name: 'Archimedes' },
];
const state = { resolvedDates: [], dismissedDates: [], promptedDays: {} };
const afternoon = new Date('2026-10-09T14:00:00+02:00');

test('rating question offers only the mensa visited on the target day', () => {
  const candidates = visitCandidates(mensas, [
    { mensaId: 'polyterrasse', date: '2026-10-09', service: 'lunch' },
    { mensaId: 'polyterrasse', date: '2026-10-09', service: 'dinner' },
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
