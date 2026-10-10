import assert from 'node:assert/strict';
import test from 'node:test';
import { distanceMeters, formatDistance, orderByDistance, walkingMinutes } from './distance.ts';

// ETH main building and ETH Hönggerberg HCI, real positions
const zentrum = { lat: 47.3763, lng: 8.5482 };
const hoengg = { lat: 47.4086, lng: 8.5068 };

test('distance: Zentrum to Hönggerberg is about 4.5 km', () => {
  const d = distanceMeters(zentrum, hoengg);
  assert.ok(d > 4300 && d < 4900, String(d));
});

test('distance: same point is 0, symmetric, invalid input is NaN', () => {
  assert.equal(distanceMeters(zentrum, zentrum), 0);
  assert.equal(distanceMeters(zentrum, hoengg), distanceMeters(hoengg, zentrum));
  for (const bad of [null, undefined, {}, { lat: 'x', lng: 1 }, { lat: NaN, lng: 1 }, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }]) {
    assert.ok(Number.isNaN(distanceMeters(zentrum, bad)), JSON.stringify(bad));
  }
});

test('walking: minutes include a detour, never 0, and nothing for far places', () => {
  assert.equal(walkingMinutes(0), 1);
  assert.equal(walkingMinutes(250), 4);
  assert.equal(walkingMinutes(1000), 16);
  assert.equal(walkingMinutes(3000), 47);
  assert.equal(walkingMinutes(3001), null);
  assert.equal(walkingMinutes(NaN), null);
});

test('distance text is short and rounded', () => {
  assert.equal(formatDistance(3), '10 m');
  assert.equal(formatDistance(247), '250 m');
  assert.equal(formatDistance(999), '1.0 km');
  assert.equal(formatDistance(1449), '1.4 km');
  assert.equal(formatDistance(12_400), '12 km');
  assert.equal(formatDistance(NaN), '');
});

test('ordering: nearest first, unknown positions last in their original order', () => {
  const places = [
    { id: 'far', position: hoengg },
    { id: 'nowhere-a', position: null },
    { id: 'near', position: { lat: 47.3770, lng: 8.5490 } },
    { id: 'nowhere-b', position: undefined },
  ];
  const ordered = orderByDistance(zentrum, places);
  assert.deepEqual(ordered.map(p => p.id), ['near', 'far', 'nowhere-a', 'nowhere-b']);
  assert.ok(ordered[0]!.meters < ordered[1]!.meters);
  assert.ok(Number.isNaN(ordered[2]!.meters));
});
