import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RestaurantCatalog} from './catalog.mjs';

test('catalog shares concurrent loads, persists public objects and restores without a provider call',async()=> {
  const dir=await mkdtemp(join(tmpdir(),'mensa-catalog-'));const file=join(dir,'restaurants.json');
  try {
    let calls=0;const loader=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,10));return {elements:[{id:1,tags:{name:'Cafe'}}]};};
    const catalog=new RestaurantCatalog(loader,file,()=>100000);
    const results=await Promise.all([catalog.current(),catalog.current(),catalog.current()]);
    assert.equal(calls,1);assert.deepEqual(results[0],results[2]);
    const restored=new RestaurantCatalog(()=>{throw new Error('offline');},file,()=>100001);
    assert.deepEqual(await restored.current(),results[0]);
    assert.deepEqual(Object.keys(JSON.parse(await readFile(file,'utf8'))),['updatedAt','elements']);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('failed or empty refresh never overwrites the last catalog and stale data is not treated as current',async()=> {
  const dir=await mkdtemp(join(tmpdir(),'mensa-catalog-'));const file=join(dir,'restaurants.json');
  try {
    const old={updatedAt:1,elements:[{id:1}]};await writeFile(file,JSON.stringify(old));
    const catalog=new RestaurantCatalog(async()=>({elements:[]}),file,()=>86400002);
    await assert.rejects(catalog.current());assert.deepEqual(JSON.parse(await readFile(file,'utf8')),old);
    catalog.load=async()=>({elements:[{id:2}]});assert.equal((await catalog.current()).elements[0].id,2);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
