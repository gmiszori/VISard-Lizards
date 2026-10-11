import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
test('disabled travel modes never call their route provider; changing selection does not reuse another mode',async()=>{
  let foot=0,transit=0;
  const server=createServer((req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url.startsWith('/route/')) {foot++;res.end(JSON.stringify({code:'Ok',routes:[{duration:120,distance:100,geometry:'_p~iF~ps|U_ulLnnqC_mqNvxq`@',legs:[]}]}));}
    else {transit++;res.end(JSON.stringify({connections:[]}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const endpoint='http://127.0.0.1:'+server.address().port;
    process.env.OSM_FOOT_URL=endpoint;process.env.SWISS_TRANSPORT_URL=endpoint;
    const {options}=await import('./provider.mjs?travel-modes');
    const trip={origin:'47.37,8.54',destination:'47.38,8.55',departureTime:'2026-10-12T09:00:00Z'};
    const walk=await options({...trip,modes:['WALK']});assert.ok(walk.routes.every(r=>r.provider.mode==='WALK'));assert.equal(foot,1);assert.equal(transit,0);
    await assert.rejects(options({...trip,modes:['TRANSIT']}));assert.equal(foot,1);assert.equal(transit,1,'public transport still queried after a previous walk-only request');
    await options({...trip,modes:['WALK','TRANSIT']});assert.equal(transit,1,'valid provider cache reused');assert.equal(foot,1);
    await assert.rejects(options({...trip,modes:[]}));await assert.rejects(options({...trip,modes:['DRIVE']}));
    assert.equal(foot+transit,2,'invalid selections do not contact providers');
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
