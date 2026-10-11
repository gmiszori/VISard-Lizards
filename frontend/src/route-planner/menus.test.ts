import {test} from 'node:test';
import assert from 'node:assert/strict';
import {uniqueMeals,menuLink} from './menus.ts';
test('menu dishes omit placeholders and duplicates while preserving distinct offers',()=>{
  assert.deepEqual(uniqueMeals([{name:'novalue'},{name:'Pasta',description:'Tomato'},{name:'pasta',description:'Tomato'},{name:'Pasta',description:'Pesto'}]),[{name:'Pasta',description:'Tomato'},{name:'Pasta',description:'Pesto'}]);
  assert.equal(menuLink('javascript:alert(1)'),null);assert.equal(menuLink('/relative'),null);
  assert.equal(menuLink('https://example.org/menu.pdf'),'https://example.org/menu.pdf');
});
