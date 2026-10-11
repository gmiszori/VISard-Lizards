import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatDate,parseDateTime} from './calendar.ts';
test('Swiss display dates preserve local day and time without US date parsing',()=>{
  const date=parseDateTime('12.10.2026','11:07')!;
  assert.equal(formatDate(date),'12.10.2026');
  assert.equal(date.getMonth(),9);assert.equal(date.getDate(),12);assert.equal(date.getHours(),11);
  assert.equal(formatDate(parseDateTime('29.02.2028')!),'29.02.2028');
});
test('impossible dates and times do not silently roll into a different journey',()=>{
  for(const value of ['31.02.2026','29.02.2026','12.13.2026','00.10.2026','2026-10-12','1.10.2026']) assert.equal(parseDateTime(value),null);
  assert.equal(parseDateTime('12.10.2026','24:00'),null);
  assert.equal(parseDateTime('12.10.2026','11:60'),null);
});
