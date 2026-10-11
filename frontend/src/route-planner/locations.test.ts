import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SelectedLocation} from './locations.ts';

test('selected place submits coordinates; editing must not reuse the previous place', () => {
  const location = new SelectedLocation();
  assert.equal(location.value(' Zürich HB '),'Zürich HB');
  location.select({label:'Zürich HB',latitude:47.378,longitude:8.54,kind:'station'});
  assert.equal(location.value('Zürich HB'),'47.378,8.54');
  assert.equal(location.value('Basel SBB'),'Basel SBB');
  location.clear();
  assert.equal(location.value('Zürich HB'),'Zürich HB');
});
