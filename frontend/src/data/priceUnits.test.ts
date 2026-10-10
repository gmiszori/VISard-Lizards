import assert from 'node:assert/strict';
import test from 'node:test';
import type { DisplayMenuItem } from './menu-display.ts';
import { mensasSoldByWeight, withPriceUnits } from './priceUnits.ts';

const meal = (mensaId: string, kind: string, priceUnit: string) => ({ mensaId, kind, priceUnit });
const item = (id: string, category: DisplayMenuItem['category']): DisplayMenuItem => ({
  id, name: id, description: '', priceStudent: 3.2, priceWorker: 3.2, priceExternal: 3.2, dietary: 'meat', category,
});

test('by weight: a mensa counts only when every buffet dish is priced per 100 g', () => {
  const set = mensasSoldByWeight([
    meal('dozentenfoyer', 'buffet', '100 g'), meal('dozentenfoyer', 'buffet', '100 g'),
    meal('polyterrasse', 'buffet', 'serving'),
    meal('mixed', 'buffet', '100 g'), meal('mixed', 'buffet', 'serving'),
    meal('fusion-meal', 'buffet', '100g'), meal('fusion-meal', 'main', 'serving'),
    meal('nobuffet', 'main', 'serving'),
  ]);
  assert.deepEqual([...set].sort(), ['dozentenfoyer', 'fusion-meal']);
});

test('by weight: only the sides of those mensas get the unit', () => {
  const menu = [item('main', 'Classic'), item('buffet', 'Side')];
  const marked = withPriceUnits(menu, 'dozentenfoyer', new Set(['dozentenfoyer']));
  assert.equal(marked.find(i => i.id === 'buffet')!.priceUnit, '100 g');
  assert.equal(marked.find(i => i.id === 'main')!.priceUnit, undefined, 'a main dish is a plate, not by weight');
  assert.equal(menu[1]!.priceUnit, undefined, 'the input is not changed');
  assert.equal(withPriceUnits(menu, 'polyterrasse', new Set(['dozentenfoyer'])), menu, 'other mensas keep their menu');
});
