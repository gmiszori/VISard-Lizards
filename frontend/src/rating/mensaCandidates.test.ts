import assert from 'node:assert/strict';
import test from 'node:test';
import { getRatingPrompt, type MensaChoice } from './getRatingPrompt.ts';
import { DEFAULT_MENSA_IDS, mensaCandidates } from './useRatingPrompt.ts';

const m = (mensaId: string, name = mensaId, hasMenu?: boolean): MensaChoice => (hasMenu === undefined ? { mensaId, name } : { mensaId, name, hasMenu });
const all = [m('archimedes', 'Archimedes'), m('polyterrasse', 'Mensa Polyterrasse'), m('uzh-untere-mensa', 'Untere Mensa'), m('uzh-lichthof', 'Lichthof', false), m('clausiusbar', 'Clausiusbar')];
const ids = (list: MensaChoice[]) => list.map(x => x.mensaId);

test('no favourites and no profile: previews Polyterrasse and UZH Untere Mensa (the reported bug)', () => {
  assert.deepEqual(ids(mensaCandidates(all, null, [])), ['polyterrasse', 'uzh-untere-mensa']);
  assert.deepEqual(DEFAULT_MENSA_IDS, ['polyterrasse', 'uzh-untere-mensa']);
});

test('the preview reaches the prompt, so the card is never an empty list', () => {
  const prompt = getRatingPrompt(new Date('2026-10-09T14:00:00+02:00'), mensaCandidates(all, null, []), { resolvedDates: [], dismissedDates: [], promptedDays: {} });
  assert.deepEqual(ids(prompt?.mensaChoices ?? []), ['polyterrasse', 'uzh-untere-mensa']);
});

test('favourites take priority over the preview', () => {
  assert.deepEqual(ids(mensaCandidates(all, null, ['clausiusbar'])), ['clausiusbar']);
});

test('profile ratings alone are used, best first, invalid scores ignored', () => {
  const profile = { mensaRatings: [{ mensaId: 'archimedes', rating: 5 }, { mensaId: 'clausiusbar', rating: 3 }, { mensaId: 'polyterrasse', rating: 0 }, { mensaId: 'uzh-untere-mensa', rating: 6 }] } as never;
  assert.deepEqual(ids(mensaCandidates(all, profile, [])), ['archimedes', 'clausiusbar']);
});

test('favourites first, then ratings, at most four, no duplicates', () => {
  const many = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => m(id));
  const profile = { mensaRatings: [{ mensaId: 'f', rating: 5 }, { mensaId: 'e', rating: 4 }, { mensaId: 'd', rating: 3 }] } as never;
  const result = mensaCandidates([...many, ...many], profile, ['a', 'a', 'b']);
  assert.deepEqual(ids(result), ['a', 'b', 'f', 'e']);
});

test('a default that is missing from the list is skipped; the next serving mensa fills in', () => {
  const noPoly = all.filter(x => x.mensaId !== 'polyterrasse');
  assert.deepEqual(ids(mensaCandidates(noPoly, null, [])), ['uzh-untere-mensa', 'archimedes']);
});

test('a default that serves no meals is replaced by the next mensa that does', () => {
  const closedPoly = all.map(x => (x.mensaId === 'polyterrasse' ? m('polyterrasse', 'Mensa Polyterrasse', false) : x));
  assert.deepEqual(ids(mensaCandidates(closedPoly, null, [])), ['uzh-untere-mensa', 'archimedes']);
});

test('neither default exists: the first two mensas that serve meals', () => {
  assert.deepEqual(ids(mensaCandidates([m('x', 'X', false), m('y'), m('z'), m('w')], null, [])), ['y', 'z']);
});

test('an empty or broken mensa list gives no suggestions or prompt', () => {
  assert.deepEqual(mensaCandidates([], null, []), []);
  assert.deepEqual(mensaCandidates(undefined as never, null, []), []);
  assert.deepEqual(mensaCandidates([null, 5, { mensaId: 3 }, { name: 'x' }] as never, null, []), []);
  const prompt = getRatingPrompt(new Date('2026-10-09T14:00:00+02:00'), [], { resolvedDates: [], dismissedDates: [], promptedDays: {} });
  assert.equal(prompt, null);
});

test('corrupted profile and favourites never throw', () => {
  for (const profile of [null, undefined, {}, { mensaRatings: null }, { mensaRatings: 'garbage' }, { mensaRatings: {} }, { mensaRatings: [null, 5, 'x', {}] }, { mensaRatings: [{ mensaId: 7, rating: 3 }] }] as never[]) {
    assert.deepEqual(ids(mensaCandidates(all, profile, [])), ['polyterrasse', 'uzh-untere-mensa']);
  }
  for (const favourites of [null, undefined, 'polyterrasse', {}, [1, null, {}], ['does-not-exist']] as never[]) {
    assert.deepEqual(ids(mensaCandidates(all, null, favourites)), ['polyterrasse', 'uzh-untere-mensa']);
  }
});

test('favourites that no longer exist fall back to the preview instead of an empty card', () => {
  assert.deepEqual(ids(mensaCandidates(all, null, ['closed-years-ago'])), ['polyterrasse', 'uzh-untere-mensa']);
});
