import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openingWindows,encodePolyline,decodePolyline,transitLeg,cached,point,walkingLeg,locationQuery,selectLocation} from './provider.mjs';

test('campus alias resolves an address and unrelated or ambiguous location results are rejected',()=> {
  const lookup=locationQuery('ETH Zentrum');assert.equal(lookup.type,'address');
  const hit={name:'Zürich, Rämistrasse 101',coordinate:{x:47.375839,y:8.547595}};
  assert.equal(selectLocation(lookup.query,[hit]),hit);
  assert.throws(()=>selectLocation('ETH Zentrum',[{...hit,name:'Horw, Zentrum'}]));
  assert.throws(()=>selectLocation('Zürich',[{...hit,name:'Zürich HB'},{...hit,name:'Zürich Stadelhofen'}]));
  assert.equal(selectLocation('Zurich HB',[{...hit,name:'Zürich HB'}]).name,'Zürich HB');
  assert.equal(selectLocation('Zurich HB',[{...hit,name:'Zürich, Sihlpost/HB'},{...hit,name:'Zürich HB'}]).name,'Zürich HB');
});

test('walking alternatives retain provider path and rounded duration; malformed evidence is rejected', () => {
  const start=Date.parse('2026-10-12T09:00:00Z');
  const route={duration:60.4,distance:81.9,geometry:encodePolyline([[47.37,8.54],[47.371,8.541]]),legs:[]};
  const leg=walkingLeg(route,start);
  assert.equal(leg.arrival,'2026-10-12T09:01:01.000Z');assert.equal(leg.distanceMetres,82);
  assert.equal(leg.provider.polyline,route.geometry);assert.equal(leg.provider.mode,'WALK');
  assert.throws(()=>walkingLeg({...route,geometry:''},start));
  assert.throws(()=>walkingLeg({...route,duration:-1},start));
});

test('Zurich hours preserve split shifts, date closures, unknown state and DST', () => {
  const p=[47.37,8.54];
  assert.deepEqual(openingWindows('Mo-Fr 11:00-14:00,18:00-22:00','2026-10-12',p),[
    {open:'2026-10-12T09:00:00.000Z',close:'2026-10-12T12:00:00.000Z'},
    {open:'2026-10-12T16:00:00.000Z',close:'2026-10-12T20:00:00.000Z'}]);
  assert.deepEqual(openingWindows('Mo-Fr 11:00-14:00; Oct 12 off','2026-10-12',p),[]);
  assert.deepEqual(openingWindows('unknown','2026-10-12',p),[]);
  assert.deepEqual(openingWindows('Mo 11:00-14:00','2026-10-26',p),[{open:'2026-10-26T10:00:00.000Z',close:'2026-10-26T13:00:00.000Z'}]);
});
test('provider geometry round trips without invented vertices', () => {
  const points=[[47.3782,8.5402],[47.3763,8.5477],[-12,-79]];
  assert.deepEqual(decodePolyline(encodePolyline(points)),points);
  assert.throws(()=>decodePolyline('??~'));
  assert.throws(()=>point([Infinity,8]));
});
test('transit preserves schedules and labels stop geometry; impossible walking transfers rejected', async () => {
  const stop=(name,time,type) => ({station:{name,coordinate:{x:47.37,y:8.54}},[type]:time});
  const departure=stop('A','2026-10-12T09:00:00Z','departure'),arrival=stop('B','2026-10-12T09:10:00Z','arrival');
  departure.platform='5';departure.prognosis={platform:'6'};arrival.platform='9';
  const connection={from:departure,to:arrival,sections:[{departure,arrival,journey:{category:'Tram',number:'6',passList:[]}}]};
  const leg=await transitLeg(connection,Date.parse('2026-10-12T08:59:00Z'),undefined,async()=>null);
  assert.equal(leg.provider.itinerary[0].mode,'TRAM');
  assert.equal(leg.provider.itinerary[0].from,'A');
  assert.equal(leg.provider.itinerary[0].departurePlatform,'6','updated platform takes precedence over planned platform');
  assert.equal(leg.provider.itinerary[0].arrivalPlatform,'9');
  assert.equal(leg.provider.itinerary[0].arrival,'2026-10-12T09:10:00.000Z');
  assert.equal(leg.provider.segments[0].geometryKind,'stop_sequence');assert.equal(leg.provider.distanceScope,'walking_only');
  assert.equal(await transitLeg(connection,Date.parse('2026-10-12T09:01:00Z')),null);
  connection.sections[0]={departure,arrival,walk:{duration:600}};
  const finalWalk=await transitLeg(connection,Date.parse('2026-10-12T08:59:00Z'),async()=>({duration:601.1,distance:900,geometry:'_p~iF~ps|U'}));
  assert.equal(finalWalk.arrival,'2026-10-12T09:10:02.000Z');
});
test('cache reuses data and does not cache failed requests', async () => {
  let calls=0;const action=async()=>++calls;
  assert.equal(await cached('test',10000,action),1);assert.equal(await cached('test',10000,action),1);
  await assert.rejects(cached('failed',10000,async()=>{throw new Error('offline');}));
  assert.equal(await cached('failed',10000,action),2);
});
test('transit display clips whole-service pass lists to the boarded section and preserves matched geometry',async()=> {
  const stop=(name,time,type,lat=47.37)=>({station:{name,coordinate:{x:lat,y:8.54}},[type]:time});
  const departure=stop('A','2026-10-12T09:00:00Z','departure'),arrival=stop('B','2026-10-12T09:10:00Z','arrival');
  const connection={from:departure,to:arrival,sections:[{departure,arrival,journey:{category:'IC',number:'3',passList:[
    stop('Before boarding','2026-10-12T08:00:00Z','departure',48),departure,arrival,
    stop('After alighting','2026-10-12T10:00:00Z','arrival',49)]}}]};
  const geometry=encodePolyline([[47.37,8.54],[47.371,8.541],[47.37,8.54]]);
  const leg=await transitLeg(connection,Date.parse('2026-10-12T08:59:00Z'),undefined,async(journey,stops)=> {
    assert.equal(journey.number,'3');assert.ok(stops.every(p=>p[0]===47.37));
    return {polyline:geometry,geometryKind:'osm_transit_path',sourceUrl:'https://www.openstreetmap.org/relation/123'};
  });
  assert.equal(leg.provider.segments[0].polyline,geometry);
  assert.equal(leg.provider.segments[0].geometryKind,'osm_transit_path');
  assert.equal(leg.arrival,'2026-10-12T09:10:00.000Z');
});

test('walking transfers use waiting time before the next vehicle but reject missed boarding',async()=> {
  const stop=(name,time,type)=>({station:{name,coordinate:{x:47.37,y:8.54}},[type]:time});
  const departure=stop('HB','2026-10-12T10:00:00Z','departure'),walkEnd=stop('Sihlquai','2026-10-12T10:04:00Z','arrival');
  const board=stop('Sihlquai','2026-10-12T10:09:00Z','departure'),arrival=stop('Hönggerberg','2026-10-12T10:30:00Z','arrival');
  const connection={from:departure,to:arrival,sections:[{departure,arrival:walkEnd,walk:{duration:240}},
    {departure:board,arrival,journey:{category:'T',number:'50',passList:[]}}]};
  const walking=duration=>async()=>({duration,distance:400,geometry:encodePolyline([[47.37,8.54],[47.371,8.541]])});
  const leg=await transitLeg(connection,Date.parse(departure.departure),walking(267),async()=>null);
  assert.equal(leg.provider.itinerary[0].mode,'WALK');
  assert.equal(leg.provider.itinerary[0].arrival,'2026-10-12T10:04:27.000Z');
  assert.equal(leg.provider.itinerary[1].mode,'TRAM');
  assert.equal(leg.provider.itinerary[1].departure,'2026-10-12T10:09:00.000Z');
  assert.equal(leg.arrival,arrival.arrival.replace('Z','.000Z'));
  assert.equal(await transitLeg(connection,Date.parse(departure.departure),walking(541),async()=>null),null);
});
