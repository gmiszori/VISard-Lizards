import assert from 'node:assert/strict';
import test from 'node:test';
import type { CrowdSlot } from './prediction.ts';
import { quietestWindow, windowLabel } from './bestTime.ts';

const day = (from: string, pcts: Array<number | null>): CrowdSlot[] => {
  const start = Number(from.slice(0, 2)) * 60 + Number(from.slice(3));
  return pcts.map((occupancyPct, i) => ({ startMinute: start + i * 15, occupancyPct }));
};

test('best time: the quietest half hour of the lunch hours', () => {
  // 11:15 .. 14:00, rush at 12:00-12:45
  const slots = day('11:15', [30, 55, 85, 90, 80, 60, 45, 35, 25, 20, 15]);
  const best = quietestWindow(slots)!;
  assert.equal(windowLabel(best), '13:30–14:00');
  assert.equal(best.occupancyPct, 18, 'mean of 20 and 15, rounded');
});

test('best time: ties go to the earliest window', () => {
  const slots = day('11:00', [20, 20, 70, 70, 20, 20]);
  assert.equal(windowLabel(quietestWindow(slots)!), '11:00–11:30');
});

test('best time: a missing prediction is never treated as empty', () => {
  const slots = day('11:00', [60, null, 40, 45, 80, 90, 85, 75]);
  assert.equal(windowLabel(quietestWindow(slots)!), '11:30–12:00', 'a window touching the gap would look like 20% if the gap counted as 0');
  // a real prediction of 0 is a valid value
  assert.equal(windowLabel(quietestWindow(day('11:00', [60, 0, 5, 70, 80, 90, 85, 75]))!), '11:15–11:45');
});

test('best time: nothing to say when the day is about equally busy, or has no complete window', () => {
  assert.equal(quietestWindow(day('11:00', [50, 52, 55, 51, 53, 54])), null);
  assert.equal(quietestWindow(day('11:00', [20, null, 80, null, 20])), null);
  assert.equal(quietestWindow([]), null);
  assert.equal(quietestWindow(day('11:00', [30])), null);
});

test('best time: a mensa that only serves in the evening uses its own hours', () => {
  const slots = day('17:30', [20, 35, 60, 80, 70, 40, 25, 30]);
  assert.equal(windowLabel(quietestWindow(slots)!), '17:30–18:00');
});

test('best time: windows outside the lunch hours are ignored when lunch has predictions', () => {
  const slots = day('09:00', [5, 5, 5, 5, 5, 5, 5, 5, 70, 80, 85, 60, 40, 30, 90, 90]);
  const best = quietestWindow(slots)!;
  assert.ok(best.startMinute >= 11 * 60 && best.endMinute <= 14 * 60 + 30, windowLabel(best));
});

test('best time: never after the kitchen stops serving, even if the building and the prediction go on', () => {
  // prediction 11:15..19:30 style: quietest of all is 14:15-14:45, after lunch ended at 14:00
  const slots = day('11:15', [30, 55, 85, 90, 80, 60, 45, 35, 25, 20, 15, 5, 3, 4, 6, 40]);
  const lunch: Array<import('./bestTime.ts').ServingWindow> = [{ service: 'lunch', from: 11 * 60 + 15, to: 14 * 60 }];
  const best = quietestWindow(slots, lunch)!;
  assert.equal(windowLabel(best), '13:30–14:00');
  assert.ok(best.endMinute <= 14 * 60);
});

test('best time: lunch is preferred, the dinner window is used when there is no lunch, a closed day gives nothing', () => {
  // 11:15 .. 19:15; afternoon 14:00-17:15 is quiet, dinner 17:30-19:30 has a busy start and a quiet end
  const slots = day('11:15', [30, 55, 85, 90, 80, 60, 45, 35, 25, 20, 15, 5, 3, 4, 6, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 70, 80, 60, 30, 15, 10]);
  const both = [{ service: 'lunch' as const, from: 11 * 60 + 15, to: 14 * 60 }, { service: 'dinner' as const, from: 17 * 60 + 30, to: 19 * 60 + 30 }];
  assert.equal(windowLabel(quietestWindow(slots, both)!), '13:30–14:00');
  const dinnerOnly = [both[1]!];
  assert.ok(quietestWindow(slots, dinnerOnly)!.startMinute >= 17 * 60 + 30);
  assert.equal(quietestWindow(slots, []), null);
});
