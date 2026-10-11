import test from 'node:test';
import assert from 'node:assert/strict';
import {mealPlace,mealPlacesQuery} from './meal-places.mjs';
test('short breaks include kiosks, groceries, bakeries and kebab takeaway but exclude seated restaurants',()=> {
  for(const tags of [{name:'kkiosk',shop:'kiosk'},{name:'Coop',shop:'supermarket'},{name:'Migrolino',shop:'convenience'},
    {name:'Bakery',shop:'bakery'},{name:'Döner',amenity:'fast_food',cuisine:'kebab'},{name:'Takeaway',amenity:'restaurant',takeaway:'yes'}]) {
    assert.equal(mealPlace(tags,true).quickMeal,true);
  }
  assert.equal(mealPlace({name:'Sit down',amenity:'restaurant'},true),null);
  assert.equal(mealPlace({name:'Clothes',shop:'clothes'},true),null);
  assert.equal(mealPlace({name:'Coop',shop:'supermarket'},false),null);
  assert.equal(mealPlace({name:'Restaurant',amenity:'restaurant'},false).venueType,'restaurant');
  assert.match(mealPlacesQuery,/fast_food/);assert.match(mealPlacesQuery,/supermarket/);assert.match(mealPlacesQuery,/opening_hours/);
});
