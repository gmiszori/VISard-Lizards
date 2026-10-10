import test from 'node:test';
import assert from 'node:assert/strict';
import { MENSAS, MEALS, CANTEENS, type Mensa } from './canteens.ts';
import { compareMealServiceAndKind, groupMenuByService, prepareMenu } from './menu-display.ts';

const meal = CANTEENS.find(c => c.menu.length)!.menu[0]!;
const mensa = { ...MENSAS[0]!, temporarilyClosed: false, closures: [], openingHours: {
  mon: [{ service: 'lunch' as const, open: '11:00', close: '14:00' },
    { service: 'dinner' as const, open: '17:30', close: '19:00' }],
  tue: [], wed: [], thu: [], fri: [], sat: [], sun: [],
} };

test('Monday preview uses Monday service hours, with lunch and dinner separated', () => {
  const menu = prepareMenu([{ ...meal, id: 'lunch', service: 'lunch' },
    { ...meal, id: 'dinner', service: 'dinner' }], mensa, '2026-10-12');
  assert.deepEqual(menu.map(m => m.servingWindows), [
    [{ open: '11:00', close: '14:00' }], [{ open: '17:30', close: '19:00' }],
  ]);
});

test('duplicate IDs render once while distinct offerings with the same name remain', () => {
  const lunch = { ...meal, id: 'lunch', service: 'lunch' as const };
  const dinner = { ...meal, id: 'dinner', service: 'dinner' as const };
  assert.deepEqual(prepareMenu([lunch, lunch, dinner, dinner], mensa, '2026-10-12').map(m => m.id), ['lunch', 'dinner']);
});

test('lunch and dinner remain separate even when the same dish is offered twice', () => {
  const dinner = { ...meal, id: 'dinner', service: 'dinner' as const };
  const lunch = { ...meal, id: 'lunch', service: 'lunch' as const };
  assert.deepEqual(groupMenuByService([dinner, lunch]).map(group => [group.service, group.items.map(item => item.id)]),
    [['lunch', ['lunch']], ['dinner', ['dinner']]]);
});

test('menu order keeps lunch before dinner and mains before sides within each service', () => {
  const offerings = [
    { id: 'dinner-side', classification: ['vegan', 'buffet', 'dinner'] },
    { id: 'lunch-side', classification: ['vegan', 'buffet', 'lunch'] },
    { id: 'dinner-main', classification: ['vegan', 'main', 'dinner'] },
    { id: 'lunch-main', classification: ['vegan', 'main', 'lunch'] },
  ];
  assert.deepEqual(offerings.sort(compareMealServiceAndKind).map(item => item.id),
    ['lunch-main', 'lunch-side', 'dinner-main', 'dinner-side']);
});

test('all published service windows are preserved without duplicate windows', () => {
  const hours = { ...mensa, openingHours: { ...mensa.openingHours, mon: [
    ...mensa.openingHours.mon, mensa.openingHours.mon[0]!, { service: 'lunch' as const, open: '14:30', close: '15:00' },
  ] } };
  assert.deepEqual(prepareMenu([{ ...meal, service: 'lunch' }], hours, '2026-10-12')[0]!.servingWindows,
    [{ open: '11:00', close: '14:00' }, { open: '14:30', close: '15:00' }]);
});

test('unknown hours, closed weekdays and closures never invent service times', () => {
  for (const [outlet, date] of [
    [undefined, '2026-10-12'], [mensa, '2026-10-13'],
    [{ ...mensa, temporarilyClosed: true }, '2026-10-12'],
    [{ ...mensa, closures: [{ from: '2026-10-12', to: '2026-10-12', note: 'Closed' }] }, '2026-10-12'],
  ] as Array<[Mensa | undefined, string]>) {
    assert.deepEqual(prepareMenu([{ ...meal, service: 'lunch' }], outlet, date)[0]!.servingWindows, []);
  }
});

test('bundled meals and displayed canteens have no duplicate IDs', () => {
  assert.equal(new Set(MENSAS.map(m => m.id)).size, MENSAS.length);
  assert.equal(new Set(MEALS.map(m => m.id)).size, MEALS.length);
  for (const canteen of CANTEENS) {
    assert.equal(new Set(canteen.menu.map(m => m.id)).size, canteen.menu.length, canteen.id);
  }
});
