import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchTransitGeometry, transitReference, transitGeometryQuery} from './transit-geometry.mjs';
const relation=(paths)=>({id:123,members:paths.map(path=>({type:'way',geometry:path.map(([lat,lon])=>({lat,lon}))}))});
test('service reference separates numbered trains, trams and buses',()=> {
  assert.deepEqual(transitReference({category:'IC',number:'3'}),{mode:'train',ref:'IC3'});
  assert.deepEqual(transitReference({category:'Tram',number:'8'}),{mode:'tram',ref:'8'});
  assert.deepEqual(transitReference({category:'Bus',number:'80'}),{mode:'bus',ref:'80'});
  assert.deepEqual(transitReference({category:'B',number:'E'}),{mode:'bus',ref:'E'});
  assert.equal(transitReference({category:'IC',number:'3";out;'}),null);
});
test('matched geometry follows actual bent ways, reverses members and trims to board/alight',()=> {
  const a=[47.37,8.5],bend=[47.375,8.505],b=[47.38,8.51],end=[47.39,8.52];
  const data=relation([[a,bend],[b,bend],[b,end]]);
  const match=matchTransitGeometry([data],[a,b],'train');
  assert.ok(match); assert.deepEqual(match.path,[a,bend,b]);
  assert.deepEqual(matchTransitGeometry([data],[b,a],'train').path,[b,bend,a]);
  assert.equal(match.relationId,123);
});
test('missing ways, far away stops and out-of-order stop sequences never create a straight bridge',()=> {
  const a=[47.37,8.5],b=[47.38,8.51],c=[47.39,8.52];
  assert.equal(matchTransitGeometry([relation([[a,b],[c,[47.4,8.53]]])],[a,[47.4,8.53]],'bus'),null);
  assert.equal(matchTransitGeometry([relation([[a,b,c]])],[[48,8],b],'train'),null);
  assert.equal(matchTransitGeometry([relation([[a,b,c]])],[a,c,b],'train'),null);
});

test('train trip numbers use station corridors while service line references remain exact',()=> {
  const stops=[[47.547413,7.58956],[47.378176,8.540212]];
  const corridor=transitGeometryQuery({category:'EC',number:'000151'},stops);
  assert.equal(corridor.kind,'osm_rail_corridor');assert.match(corridor.query,/relation.board/);
  assert.equal(transitGeometryQuery({category:'IC',number:'3'},stops).kind,'osm_transit_path');
  assert.equal(transitGeometryQuery({category:'EC',number:'1;out'},stops),null);
});

test('a nearby parallel corridor outside the mode tolerance is not treated as the service path',()=> {
  const a=[47.37,8.5],b=[47.38,8.51];
  const shifted=relation([[[47.3708,8.5],[47.3808,8.51]]]);
  assert.equal(matchTransitGeometry([shifted],[a,b],'tram'),null);
  const rail=relation([[[47.372,8.5],[47.382,8.51]]]);
  assert.equal(matchTransitGeometry([rail],[a,b],'train'),null);
});
