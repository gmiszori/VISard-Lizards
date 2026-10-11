import test from 'node:test';
import assert from 'node:assert/strict';
import { dishName, formatMenuDay } from './presentation.ts';

test('dish display names use uppercase and clean scraped separators', () => {
  assert.equal(dishName(' Schwammerl Schnittlauch |Rahmsauce '), 'SCHWAMMERL SCHNITTLAUCH RAHMSAUCE');
  assert.equal(dishName('Jeera daal'), 'JEERA DAAL');
  assert.equal(dishName('Käsespätzli'), 'KÄSESPÄTZLI');
});

test('menu dates use day before month in both languages', () => {
  assert.equal(formatMenuDay('2026-10-12'), 'Mon 12 Oct');
  assert.match(formatMenuDay('2026-10-12', 'de'), /^Mo\.? 12\.? Okt\.?$/);
});
