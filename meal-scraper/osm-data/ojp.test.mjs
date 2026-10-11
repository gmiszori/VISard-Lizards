import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tripRequest,journeyProjection} from './ojp.mjs';
const response=readFileSync(new URL('./fixtures/ojp-ec151.xml',import.meta.url),'utf8');
test('ETH Link lettered bus gets its actual OJP path, never a tram or a different departure',()=>{
  const bus=readFileSync(new URL('./fixtures/ojp-bus-e.xml',import.meta.url),'utf8');
  const input=JSON.parse(readFileSync(new URL('./fixtures/eth-link-section.json',import.meta.url),'utf8'));
  assert.ok(journeyProjection(bus,input)?.path.length>20);
  assert.equal(journeyProjection(bus,{...input,journey:{...input.journey,category:'T'}}),null);
  assert.equal(journeyProjection(bus,{...input,journey:{...input.journey,number:'F'}}),null);
  assert.equal(journeyProjection(bus,{...input,departure:{...input.departure,departure:'2026-10-12T11:35:00+02:00'}}),null);
});
const section={journey:{category:'EC',number:'000151'},
  departure:{departure:'2026-10-12T11:07:00+02:00',station:{id:'8500010',name:'Basel SBB',coordinate:{x:47.547413,y:7.58956}}},
  arrival:{arrival:'2026-10-12T12:00:00+02:00',station:{id:'8503000',name:'Zürich HB',coordinate:{x:47.378176,y:8.540212}}}};
test('OJP request asks for service track projection with UTC time and escaped names',()=>{
  const input=structuredClone(section);input.departure.station.name='Basel & <SBB>';
  const request=tripRequest(input);
  assert.match(request,/2026-10-12T09:07:00.000Z/);
  assert.match(request,/Basel &amp; &lt;SBB&gt;/);
  assert.match(request,/<IncludeLegProjection>true/);
  input.departure.station.id='untrusted</StopPointRef>';
  assert.throws(()=>tripRequest(input));
});
test('matching EC 151 returns service-specific track coordinates, including prefixed XML',()=>{
  const result=journeyProjection(response,section);
  assert.equal(result.journeyRef,'ch:1:sjyid:100001:151-001');
  assert.equal(result.operatingDay,'2026-10-12');
  assert.ok(result.path.length>50);
  const prefixed=response.replace(/<(\/?)([A-Za-z][\w]*)(?=[ >])/g,'<$1ojp:$2').replace('<ojp:OJP>','<ojp:OJP xmlns:ojp="http://www.vdv.de/ojp">');
  assert.deepEqual(journeyProjection(prefixed,section),result);
});
test('same-minute alternative train, wrong stops or different date cannot supply geometry',()=>{
  for(const mutate of [s=>s.journey.number='000153',s=>s.departure.station.name='Basel Bad Bf',
    s=>s.arrival.arrival='2026-10-12T12:01:00+02:00',s=>s.departure.departure='2026-10-13T11:07:00+02:00']) {
    const input=structuredClone(section);mutate(input);assert.equal(journeyProjection(response,input),null);
  }
});
test('malformed XML, entities, invalid coordinates and disconnected projections are rejected',()=>{
  assert.throws(()=>journeyProjection('<OJP>',section));
  assert.throws(()=>journeyProjection('<!DOCTYPE OJP [<!ENTITY x "value">]>'+response,section));
  assert.equal(journeyProjection(response.replace('<Latitude>47.54693</Latitude>','<Latitude>100</Latitude>'),section),null);
  assert.equal(journeyProjection(response.replace('<Latitude>47.54693</Latitude>','<Latitude>46.0</Latitude>'),section),null);
  assert.equal(journeyProjection(response.replace(/<LegTrack>.*<\/LegTrack>/s,''),section),null);
});
