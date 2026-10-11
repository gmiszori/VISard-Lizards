import test from 'node:test';
import assert from 'node:assert/strict';
import { dishName, formatMenuDay } from './presentation.ts';

test('dish display names use uppercase and clean scraped separators', () => {
  assert.equal(dishName(' Schwammerl Schnittlauch |Rahmsauce ', 'upper'), 'SCHWAMMERL SCHNITTLAUCH RAHMSAUCE');
  assert.equal(dishName('Jeera daal', 'upper'), 'JEERA DAAL');
  assert.equal(dishName('Käsespätzli', 'upper'), 'KÄSESPÄTZLI');
});

test('menu dates use day before month in both languages', () => {
  assert.equal(formatMenuDay('2026-10-12'), 'Mon 12 Oct');
  assert.match(formatMenuDay('2026-10-12', 'de'), /^Mo\.? 12\.? Okt\.?$/);
});

test('meal capitalization handles uppercase source names, accents and punctuation', () => {
  const name = '  KÄSESPÄTZLI | MIT CHEF’S-SAUCE  ';
  assert.equal(dishName(name), 'Käsespätzli Mit Chef’s-Sauce');
  assert.equal(dishName(name, 'title'), 'Käsespätzli Mit Chef’s-Sauce');
  assert.equal(dishName(name, 'sentence'), 'Käsespätzli mit chef’s-sauce');
  assert.equal(dishName(name, 'lower'), 'käsespätzli mit chef’s-sauce');
  assert.equal(dishName('«CURRY» WITH RICE', 'sentence'), '«Curry» with rice');
  for (const mode of ['upper', 'title', 'sentence', 'lower'] as const) {
    assert.equal(dishName('', mode), '');
    assert.equal(dishName(dishName(name, mode), mode), dishName(name, mode));
  }
});
