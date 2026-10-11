import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';

test('matrix batches candidate legs, preserves unreachable values and reuses the result',async()=> {
  let calls=0;
  const server=createServer((req,res)=> {
    calls++;const url=new URL(req.url,'http://localhost');
    assert.equal(url.searchParams.get('sources'),'0;1;2');assert.equal(url.searchParams.get('destinations'),'1;2;3');
    assert.equal(url.searchParams.get('annotations'),'duration,distance');
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({code:'Ok',durations:[[10,20,30],[0,40,50],[60,0,null]],distances:[[100,200,300],[0,400,500],[600,0,null]]}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    process.env.OSM_FOOT_URL='http://127.0.0.1:'+server.address().port;
    const {walkingCosts}=await import('./provider.mjs?matrix-test');
    const input={origin:[47.37,8.54],destination:[47.38,8.55],stops:[[47.371,8.541],[47.372,8.542]]};
    assert.deepEqual(await walkingCosts(input),{costs:[60,null],distances:[300,null]});
    assert.deepEqual(await walkingCosts(input),{costs:[60,null],distances:[300,null]});assert.equal(calls,1);
  } finally { server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
});

test('provider 429 activates Retry-After cooldown instead of hammering it',async()=> {
  let calls=0;const server=createServer((req,res)=>{calls++;res.writeHead(429,{'Retry-After':'60'});res.end('{}');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    process.env.OSM_FOOT_URL='http://127.0.0.1:'+server.address().port;
    const {walkingCosts}=await import('./provider.mjs?cooldown-test');
    const input={origin:[47.37,8.54],destination:[47.38,8.55],stops:[[47.371,8.541]]};
    await assert.rejects(walkingCosts(input),error=>error.code==='route_provider_busy');
    await assert.rejects(walkingCosts(input),error=>error.code==='route_provider_busy' && error.message.includes('cooling down'));
    assert.equal(calls,1);
  } finally { server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
});
