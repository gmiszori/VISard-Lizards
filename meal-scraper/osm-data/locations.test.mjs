import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {locationSuggestions} from './provider.mjs';

test('suggestions omit refinements and invalid coordinates, deduplicate and bound results', () => {
  const hit={name:'Zürich HB',type:'station',coordinate:{x:47.378,y:8.54}};
  assert.deepEqual(locationSuggestions([hit,hit,{...hit,coordinate:{x:47.379,y:8.541}},{...hit,type:'refine'},{...hit,coordinate:{x:100,y:8}}, {name:'unknown'}]),
    [{label:'Zürich HB',latitude:47.378,longitude:8.54,kind:'station'}]);
  assert.equal(locationSuggestions(Array.from({length:12},(_,i)=>({...hit,name:`Stop ${i}`}))).length,8);
});

test('suggestion requests use campus alias and cache provider results',async()=> {
  let calls=0;
  const server=createServer((req,res)=> {
    calls++;const url=new URL(req.url,'http://localhost');
    assert.equal(url.searchParams.get('query'),'Rämistrasse 101, Zürich');
    assert.equal(url.searchParams.get('type'),'address');
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({stations:[{name:'Zürich, Rämistrasse 101',coordinate:{x:47.376,y:8.548}}]}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    process.env.SWISS_TRANSPORT_URL=`http://127.0.0.1:${server.address().port}`;
    const {suggestLocations}=await import('./provider.mjs?suggestion-test');
    assert.deepEqual(await suggestLocations({query:'et'}),{locations:[]});
    const result=await suggestLocations({query:'ETH Zentrum'});
    assert.equal(result.locations[0].latitude,47.376);
    assert.deepEqual(await suggestLocations({query:'ETH Zentrum'}),result);assert.equal(calls,1);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
