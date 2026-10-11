import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clampMealRange} from './meal-range.ts';
test('meal duration handles stay within 5–120 minutes and cannot cross',()=>{
  assert.deepEqual(clampMealRange(45,60,'min'),{mealMinutes:45,mealMaxMinutes:60});
  assert.deepEqual(clampMealRange(90,60,'min'),{mealMinutes:60,mealMaxMinutes:60});
  assert.deepEqual(clampMealRange(45,30,'max'),{mealMinutes:45,mealMaxMinutes:45});
  assert.deepEqual(clampMealRange(0,150,'max'),{mealMinutes:5,mealMaxMinutes:120});
});
