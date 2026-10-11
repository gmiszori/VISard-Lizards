import {test} from 'node:test';
import assert from 'node:assert/strict';
import {routeJob} from './jobs.ts';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('polls short requests without resending the OpenAI key or repeating submission',async()=>{
  const id='12345678-1234-1234-1234-123456789abc';const calls:{url:string;init?:RequestInit}[]=[];
  const replies=[json({jobId:id},202),json({status:'running'}),json({status:'completed',result:{planId:'verified'}})];
  const request=async(url:RequestInfo|URL,init?:RequestInit)=>{calls.push({url:String(url),init});return replies.shift()!;};
  const result=await routeJob('/api/route-planner/plan/jobs',{method:'POST',headers:{'X-OpenAI-Key':'test-key'}},1000,request,async()=>{});
  assert.deepEqual(result,{planId:'verified'});assert.equal(calls.length,3);
  assert.equal(calls[1].url,`/api/route-planner/jobs/${id}`);
  assert.equal(calls[1].init?.method,'GET');assert.equal(calls[1].init?.headers,undefined);
});
test('returns useful provider failure and expired job messages',async()=>{
  for(const reply of [json({status:'failed',detail:'Location is ambiguous.'}),json({detail:'Request expired.'},410)]) {
    const replies=[json({jobId:'12345678-1234-1234-1234-123456789abc'},202),reply];
    await assert.rejects(routeJob('/start',{method:'POST'},1000,async()=>replies.shift()!,async()=>{}),/ambiguous|expired/);
  }
});
test('gateway HTML does not surface as a JSON parsing error',async()=>{
  await assert.rejects(routeJob('/start',{method:'POST'},1000,async()=>new Response('<h1>Gateway timeout</h1>',{status:504})),/gateway timed out/);
});
