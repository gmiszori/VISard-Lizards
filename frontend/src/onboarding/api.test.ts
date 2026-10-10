import assert from 'node:assert/strict';
import test from 'node:test';
import { writeProfile } from './api.ts';
import { defaults } from './profile.ts';

const profile = { ...defaults('zentrum', 'de'), campusSecondary: ['irchel' as const], diet: 'vegetarian' as const, priceTier: 'worker' as const };

/** A storage that throws when a given key is written (full or blocked). */
function store(initial: Record<string, string> = {}, failOn: string[] = []) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    removeItem: (k: string) => { data.delete(k); },
    setItem: (k: string, v: string) => { if (failOn.includes(k)) throw new DOMException('full', 'QuotaExceededError'); data.set(k, v); },
  };
}
const OLD = { 'campuseats-profile': '{"old":"profile"}', 'campuseats-preferences': '{"compact":true,"vegan":false}', 'campuseats-language': 'en' };

test('F29: a successful save writes profile, merged preferences and language', () => {
  const s = store({ 'campuseats-preferences': '{"compact":true,"openOnly":true}' });
  writeProfile(profile, s, ['Schnitzel']);
  const saved = JSON.parse(s.data.get('campuseats-profile')!);
  assert.equal(saved.diet, 'vegetarian');
  assert.deepEqual(saved.starredMeals, ['Schnitzel']);
  const prefs = JSON.parse(s.data.get('campuseats-preferences')!);
  assert.equal(prefs.compact, true, 'legacy preferences survive until normalized on read');
  assert.equal(prefs.openOnly, true);
  assert.equal(prefs.priceTier, 'worker');
  assert.deepEqual(prefs.locations, ['zentrum', 'irchel']);
  assert.deepEqual([prefs.vegan, prefs.vegetarian, prefs.meat], [true, true, false]);
  assert.equal(s.data.get('campuseats-language'), 'de');
});

test('system theme is saved as a preference, not a resolved color', () => {
  const s = store();
  writeProfile({ ...profile, theme: 'system' }, s, []);
  assert.equal(s.data.get('campuseats-theme'), 'system');
  assert.equal(JSON.parse(s.data.get('campuseats-profile')!).theme, 'system');
});

test('F29: a failure on the second write puts the first one back', () => {
  const s = store(OLD, ['campuseats-preferences']);
  assert.throws(() => writeProfile(profile, s, []), /full/);
  assert.deepEqual(Object.fromEntries(s.data), OLD);
});

test('F29: a failure on the last write puts the first two back', () => {
  const s = store(OLD, ['campuseats-language']);
  assert.throws(() => writeProfile(profile, s, []), /full/);
  assert.deepEqual(Object.fromEntries(s.data), OLD);
});

test('F29: a failure on the first write changes nothing', () => {
  const s = store(OLD, ['campuseats-profile']);
  assert.throws(() => writeProfile(profile, s, []));
  assert.deepEqual(Object.fromEntries(s.data), OLD);
});

test('F29: keys that did not exist before are removed again, not left as empty values', () => {
  const s = store({}, ['campuseats-language']);
  assert.throws(() => writeProfile(profile, s, []));
  assert.equal(s.data.size, 0);
});

test('F29: corrupt stored preferences are replaced, not a reason to fail', () => {
  for (const bad of ['{bad json', '[]', '"x"', 'null', '5']) {
    const s = store({ 'campuseats-preferences': bad });
    writeProfile(profile, s, []);
    assert.deepEqual(JSON.parse(s.data.get('campuseats-preferences')!).locations, ['zentrum', 'irchel'], bad);
  }
});

test('F29: a storage that cannot even be read still gets a save attempt and fails cleanly', () => {
  const blocked = { getItem() { throw new DOMException('denied', 'SecurityError'); }, setItem() { throw new DOMException('denied', 'SecurityError'); }, removeItem() { throw new DOMException('denied', 'SecurityError'); } };
  assert.throws(() => writeProfile(profile, blocked, []), /denied/);
});
