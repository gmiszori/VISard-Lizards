import {test} from 'node:test';
import assert from 'node:assert/strict';
import {timingMinutes} from './timing.ts';
test('journey time accounts for travel meal and waiting without rounding gaps',()=>{
  assert.deepEqual(timingMinutes({totalSeconds:6000,travelSeconds:1200,mealSeconds:3600,waitingSeconds:1200,spareSeconds:4800}),{total:100,travel:20,meal:60,waiting:20,spare:80});
  const values=timingMinutes({totalSeconds:1001,travelSeconds:681,mealSeconds:300,waitingSeconds:20,spareSeconds:59});
  assert.equal(values.total,values.travel+values.meal+values.waiting);assert.equal(values.spare,0);
});
