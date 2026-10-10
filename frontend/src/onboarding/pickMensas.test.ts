import test from 'node:test';
import assert from 'node:assert/strict';
import { pickMensas } from './pickMensas.ts';

const mensas = [
  { id: 'low', campusId: 'home', hasMenu: true }, { id: 'high', campusId: 'home', hasMenu: true },
  { id: 'secondary', campusId: 'other', hasMenu: true }, { id: 'extra', campusId: 'other', hasMenu: true },
  { id: 'closed', campusId: 'home', hasMenu: true, temporarilyClosed: true },
  { id: 'no-menu', campusId: 'home', hasMenu: false }, { id: 'away', campusId: 'away', hasMenu: true },
];
const campus = { campus: 'home', campusSecondary: ['other'] };
const counts = { low: 0, high: 99, secondary: 20, extra: 5 };
function seeded(seed: number) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }

test('n results, no duplicates, eligible campuses and availability only', () => {
  for (let seed = 0; seed < 100; seed++) {
    const result = pickMensas(mensas, counts, campus, seeded(seed));
    assert.equal(result.length, 3);
    assert.equal(new Set(result.map(m => m.id)).size, 3);
    assert.ok(result.every(m => ['low', 'high', 'secondary', 'extra'].includes(m.id)));
    assert.ok(result.some(m => m.campusId === 'home'));
  }
});
test('home guarantee even with extremely underweighted home', () => {
  assert.ok(pickMensas(mensas, { low: 1e9, high: 1e9 }, campus, () => 0.99, 1).every(m => m.campusId === 'home'));
});
test('fewer than n returns all eligible records; empty, zero, duplicate inputs and missing home', () => {
  assert.equal(pickMensas(mensas, counts, campus, seeded(1), 9).length, 4);
  assert.deepEqual(pickMensas([], counts, campus, seeded(1)), []);
  assert.deepEqual(pickMensas(mensas, counts, campus, seeded(1), 0), []);
  assert.equal(pickMensas([...mensas, mensas[0]!], counts, campus, seeded(1), 9).length, 4);
  assert.equal(pickMensas(mensas, counts, { campus: 'missing', campusSecondary: ['other'] }, seeded(1)).length, 2);
});
test('seeded draws are deterministic', () => {
  assert.deepEqual(pickMensas(mensas, counts, campus, seeded(42)), pickMensas(mensas, counts, campus, seeded(42)));
});
test('over 2000 seeded draws low-count home is clearly preferred', () => {
  const rng = seeded(91);
  const hits: Record<string, number> = { low: 0, high: 0 };
  for (let i = 0; i < 2000; i++) for (const m of pickMensas(mensas, counts, campus, rng, 1)) hits[m.id] = (hits[m.id] ?? 0) + 1;
  assert.ok(hits.low! > hits.high! * 10, JSON.stringify(hits));
});
