import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSearch, editDistance, type SearchText } from './dishSearch.ts';

// A small menu with real dish names: English and German mixed, compound words, all three diet labels.
const MENU: Array<SearchText & { name: string }> = [
  { name: 'Beef Coconut Curry', diet: 'meat', text: 'Mensa Polyterrasse Beef Coconut Curry Jasmine rice, Thai basil Classic Other International' },
  { name: 'Green Meatballs', diet: 'vegetarian', text: 'Mensa Polyterrasse Green Meatballs Spinach, potato, cheese Classic' },
  { name: 'Gnocchi with Caponata', diet: 'vegan', text: 'Mensa Polyterrasse Gnocchi with Caponata Eggplant, tomato Daily Special Italian Italy Italien italienische Küche' },
  { name: 'PASTA', diet: 'meat', text: 'Obere Mensa PASTA Penne mit Hackfleischsauce Classic' },
  { name: 'JEERA DAAL', diet: 'vegan', text: 'Obere Mensa JEERA DAAL Linsen · Spinat · Naan Brot · Granatapfelkerne · Menüsalat / Apfelmus Indian Indisch' },
  { name: 'Poulet Geschnetzeltes', diet: 'meat', text: 'Untere Mensa Poulet Geschnetzeltes Pouletbruststreifen, Champignonscremesuppe, Basmatireis, Kartoffelstampf Swiss Schweiz' },
  { name: 'Chicken with Lemon and Pepper', diet: 'meat', text: 'Archimedes Chicken with Lemon and Pepper Roasted potatoes Classic' },
  { name: 'Vegan Ground Meat with Horn-Shaped Pasta', diet: 'vegan', text: 'Alumni quattro Lounge Vegan Ground Meat with Horn-Shaped Pasta Elbow macaroni Classic' },
  { name: 'Schwammerl Schnittlauch |Rahmsauce', diet: 'vegetarian', text: 'food&lab Schwammerl Schnittlauch |Rahmsauce Semmelknödel, Beilagensalat Käse Classic' },
  { name: 'Teriyaki Wok Noodles', diet: 'vegetarian', text: 'Mendokoro Teriyaki Wok Noodles Pak choi, sprouts Japanese Japan Japanisch' },
  { name: 'Pizza Prosciutto Salami', diet: 'meat', text: 'Polysnack Pizza Prosciutto Salami Mozzarella Classic Italian' },
  { name: 'Crispy Cheeseburger', diet: 'vegan', text: 'Tannenbar Crispy Cheeseburger Vegan patty, fries American' },
  { name: 'Hot & Cold Buffet', diet: 'vegetarian', text: 'Mensa Polyterrasse Hot & Cold Buffet Salad, cheese, bread Side' },
  { name: 'Lebanese Badingal', diet: 'vegetarian', text: 'Archimedes Lebanese Badingal Chickpeas, eggplant, tahini Classic' },
];

/** The dishes (by name) a query finds on that menu. */
function find(query: string): string[] {
  const search = createSearch(query, MENU);
  return MENU.filter(dish => search.test(dish.text, dish.diet)).map(dish => dish.name);
}
const mode = (query: string) => { const s = createSearch(query, MENU); return { fuzzy: s.fuzzy, hasMatches: s.hasMatches }; };

test('an empty query or only filler words match everything', () => {
  assert.equal(find('').length, MENU.length);
  assert.equal(find('   ').length, MENU.length);
  assert.equal(find('with and mit').length, MENU.length);
  assert.equal(createSearch('', MENU).active, false);
});

test('plain words match names, ingredients and the canteen name, in any case', () => {
  assert.deepEqual(find('CURRY'), ['Beef Coconut Curry']);
  assert.deepEqual(find('pizza'), ['Pizza Prosciutto Salami']);
  assert.deepEqual(find('gnocchi'), ['Gnocchi with Caponata']);
  assert.ok(find('polyterrasse').includes('Beef Coconut Curry'));
  assert.deepEqual(find('eggplant').sort(), ['Gnocchi with Caponata', 'Lebanese Badingal']);
});

test('all words must match, in any order', () => {
  assert.deepEqual(find('polyterrasse pizza'), []);
  assert.deepEqual(find('polysnack pizza'), ['Pizza Prosciutto Salami']);
  assert.deepEqual(find('curry beef'), ['Beef Coconut Curry']);
  assert.deepEqual(find('coconut curry beef'), ['Beef Coconut Curry']);
});

test('umlauts and accents work with or without the dots, and "ae/oe/ue" spelling', () => {
  assert.ok(find('käse').includes('Schwammerl Schnittlauch |Rahmsauce'));
  assert.ok(find('kase').includes('Schwammerl Schnittlauch |Rahmsauce'));
  assert.ok(find('kaese').includes('Schwammerl Schnittlauch |Rahmsauce'));
  assert.ok(find('semmelknodel').includes('Schwammerl Schnittlauch |Rahmsauce'));
  assert.ok(find('semmelknoedel').includes('Schwammerl Schnittlauch |Rahmsauce'));
  assert.ok(find('menüsalat').includes('JEERA DAAL'));
});

test('words inside German compound words are found', () => {
  assert.ok(find('reis').includes('Poulet Geschnetzeltes')); // Basmatireis
  assert.ok(find('kartoffel').includes('Poulet Geschnetzeltes')); // Kartoffelstampf
  assert.ok(find('suppe').includes('Poulet Geschnetzeltes')); // Champignonscremesuppe
  assert.ok(find('hackfleisch').includes('PASTA'));
});

test('German and English words find each other', () => {
  const chicken = find('chicken');
  assert.ok(chicken.includes('Chicken with Lemon and Pepper'));
  assert.ok(chicken.includes('Poulet Geschnetzeltes'), 'poulet = chicken');
  assert.ok(find('poulet').includes('Chicken with Lemon and Pepper'));
  assert.ok(find('huhn').includes('Chicken with Lemon and Pepper'));
  assert.ok(find('cheese').includes('Schwammerl Schnittlauch |Rahmsauce'), 'käse = cheese');
  assert.ok(find('käse').includes('Green Meatballs'));
  assert.ok(find('potato').includes('Poulet Geschnetzeltes'), 'kartoffel = potato');
  assert.ok(find('kartoffeln').includes('Chicken with Lemon and Pepper'));
  assert.ok(find('lentils').includes('JEERA DAAL'), 'linsen = lentils');
  assert.ok(find('linsen').includes('JEERA DAAL'));
  assert.ok(find('apple').includes('JEERA DAAL'), 'apfelmus');
  assert.ok(find('salat').includes('Hot & Cold Buffet'));
  assert.ok(find('salad').includes('JEERA DAAL'), 'menüsalat');
  assert.ok(find('bread').includes('JEERA DAAL'), 'brot');
  assert.ok(find('spinach').includes('JEERA DAAL'), 'spinat');
});

test('a general word finds the specific ones, but not the other way round', () => {
  assert.ok(find('cheese').includes('Pizza Prosciutto Salami'), 'mozzarella is a cheese');
  assert.ok(!find('mozzarella').includes('Hot & Cold Buffet'), 'mozzarella must not find every cheese');
  assert.ok(find('noodles').includes('Teriyaki Wok Noodles'));
  assert.ok(find('noodles').includes('PASTA'), 'pasta/penne are noodles');
  assert.ok(find('nudeln').includes('Teriyaki Wok Noodles'));
  assert.ok(find('pasta').includes('Vegan Ground Meat with Horn-Shaped Pasta'));
  assert.ok(!find('pasta').includes('Gnocchi with Caponata'), 'gnocchi are not pasta');
  assert.ok(!find('gnocchi').includes('PASTA'));
});

test('plurals and singulars find each other', () => {
  assert.ok(find('noodle').includes('Teriyaki Wok Noodles'));
  assert.ok(find('meatball').includes('Green Meatballs'));
  assert.ok(find('meatballs').includes('Green Meatballs'));
  assert.ok(find('tomatoes').includes('Gnocchi with Caponata'));
  assert.ok(find('tomaten').includes('Gnocchi with Caponata'));
});

test('plural handling never turns a word into another word', () => {
  assert.ok(!find('chicken').includes('Lebanese Badingal'), 'chicken is not chick(peas)');
  assert.ok(find('chickpeas').includes('Lebanese Badingal'));
  assert.ok(find('chickpea').includes('Lebanese Badingal'));
  assert.deepEqual(find('burgers'), ['Crispy Cheeseburger']);
  assert.ok(find('kichererbsen').includes('Lebanese Badingal'), 'german plural, via the word list');
});

test('typed beginnings of words work while typing', () => {
  assert.ok(find('chick').includes('Chicken with Lemon and Pepper'));
  assert.ok(find('chick').includes('Poulet Geschnetzeltes'), 'a beginning still reaches the German word');
  assert.deepEqual(find('piz'), ['Pizza Prosciutto Salami']);
  assert.ok(find('kartof').includes('Poulet Geschnetzeltes'));
});

test('diet words match the diet label, not just the name', () => {
  const vegan = find('vegan');
  assert.deepEqual(vegan.sort(), ['Crispy Cheeseburger', 'Gnocchi with Caponata', 'JEERA DAAL', 'Vegan Ground Meat with Horn-Shaped Pasta'].sort());
  const vegetarian = find('vegetarian');
  assert.ok(vegetarian.includes('Green Meatballs'));
  assert.ok(vegetarian.includes('Gnocchi with Caponata'), 'vegan dishes are vegetarian too');
  assert.ok(!vegetarian.includes('Beef Coconut Curry'));
  assert.deepEqual(find('vegetarisch').sort(), vegetarian.sort());
  assert.deepEqual(find('veggie').sort(), vegetarian.sort());
  assert.deepEqual(find('pflanzlich').sort(), vegan.sort());
  const meat = find('meat');
  assert.deepEqual(meat.sort(), ['Beef Coconut Curry', 'Chicken with Lemon and Pepper', 'PASTA', 'Pizza Prosciutto Salami', 'Poulet Geschnetzeltes'].sort());
  assert.ok(!meat.includes('Vegan Ground Meat with Horn-Shaped Pasta'), 'a vegan "meat" dish is not a meat dish');
  assert.deepEqual(find('fleisch').sort(), meat.sort());
});

test('a diet word can be combined with other words', () => {
  assert.deepEqual(find('vegan pasta'), ['Vegan Ground Meat with Horn-Shaped Pasta']);
  assert.deepEqual(find('vegan curry'), []);
  assert.ok(find('vegetarisch käse').includes('Green Meatballs'));
  assert.deepEqual(find('meat curry'), ['Beef Coconut Curry']);
});

test('the first letters of a diet word match the label or a name', () => {
  assert.ok(find('vega').includes('Gnocchi with Caponata'));
  assert.ok(find('vege').includes('Green Meatballs'));
  assert.ok(!find('vegetable').includes('Beef Coconut Curry'), 'a whole non-diet word is not turned into a diet word');
});

test('typos: one wrong, missing, extra or swapped letter', () => {
  assert.ok(find('gnochi').includes('Gnocchi with Caponata'), 'missing letter');
  assert.ok(find('gnoccho').includes('Gnocchi with Caponata'), 'wrong letter');
  assert.ok(find('gnocchhi').includes('Gnocchi with Caponata'), 'extra letter');
  assert.ok(find('pzza').includes('Pizza Prosciutto Salami'));
  assert.ok(find('pizxa').includes('Pizza Prosciutto Salami'));
  assert.ok(find('chiken').includes('Chicken with Lemon and Pepper'));
  assert.ok(find('chiken').includes('Poulet Geschnetzeltes'), 'a misspelt synonym still reaches the other language');
  assert.ok(find('currry').includes('Beef Coconut Curry'));
  assert.ok(find('pasat').includes('PASTA'), 'swapped letters');
});

test('typos: two wrong letters in a longer word', () => {
  assert.ok(find('capnata').includes('Gnocchi with Caponata'));
  assert.ok(find('teriayki').includes('Teriyaki Wok Noodles'));
  assert.ok(find('semmelknodl').includes('Schwammerl Schnittlauch |Rahmsauce'));
  assert.ok(find('kartofel').includes('Poulet Geschnetzeltes'), 'typo in the beginning of a long German word');
  assert.ok(find('champignonscrmesupe').includes('Poulet Geschnetzeltes'));
});

test('typos in diet words', () => {
  assert.deepEqual(find('vegen').sort(), find('vegan').sort());
  assert.deepEqual(find('vegitarian').sort(), find('vegetarian').sort());
  assert.deepEqual(find('vegetarich').sort(), find('vegetarisch').sort());
  assert.deepEqual(find('meet').sort(), find('meat').sort(), 'meet -> meat (the label, not dishes named "meat")');
  assert.deepEqual(find('vgn'), [], 'three letters: no guessing');
});

test('typo search is used only when nothing matches exactly', () => {
  assert.deepEqual(mode('burger'), { fuzzy: false, hasMatches: true });
  assert.ok(!find('burger').includes('Green Meatballs'));
  assert.deepEqual(mode('gnochi'), { fuzzy: true, hasMatches: true });
  assert.deepEqual(mode('gnocchi'), { fuzzy: false, hasMatches: true });
  // a one-letter difference to a real word is no match while the real word exists
  const butter: Array<SearchText> = [{ text: 'Butter Chicken' }, { text: 'Cheeseburger' }];
  const search = createSearch('burger', butter);
  assert.equal(search.fuzzy, false);
  assert.equal(search.test('Butter Chicken'), false);
  assert.equal(search.test('Cheeseburger'), true);
});

test('words that match nothing, even with typos, report no matches', () => {
  assert.deepEqual(mode('xylophone'), { fuzzy: false, hasMatches: false });
  assert.deepEqual(find('xylophone'), []);
  assert.deepEqual(find('qqq'), []);
});

test('short words get no typo guessing, and risky short words match whole words only', () => {
  const dishes: SearchText[] = [{ text: 'Graham cracker' }, { text: 'Ham sandwich' }, { text: 'Hamburger' }, { text: 'Spiegelei mit Reis' }, { text: 'Preis' }];
  const ham = createSearch('ham', dishes);
  assert.equal(ham.test('Ham sandwich'), true);
  assert.equal(ham.test('Graham cracker'), false);
  assert.equal(ham.test('Hamburger'), true, 'a typed beginning still matches');
  const ei = createSearch('egg', dishes);
  assert.equal(ei.test('Spiegelei mit Reis'), true, 'egg = ei in a compound');
});

test('the very first letters of a short query only match the beginning or end of words', () => {
  const dishes: SearchText[] = [{ text: 'Basmatireis' }, { text: 'Preis' }, { text: 'Rice bowl' }];
  const search = createSearch('rice', dishes);
  assert.equal(search.test('Basmatireis'), true);
  assert.equal(search.test('Rice bowl'), true);
});

test('canteen names alone can match (a canteen without dishes)', () => {
  const corpus: SearchText[] = [{ text: 'Irchel Bar' }, { text: 'Mensa Polyterrasse Pizza' }];
  const search = createSearch('irchel', corpus);
  assert.equal(search.test('Irchel Bar'), true);
  assert.equal(search.test('Mensa Polyterrasse Pizza'), false);
});

test('a diet word never matches a text without a diet (canteen name only)', () => {
  const search = createSearch('vegan', [{ text: 'Mensa X Vegan Lounge', diet: 'vegan' }, { text: 'Vegan Lounge' }]);
  assert.equal(search.test('Mensa X Vegan Lounge', 'vegan'), true);
  assert.equal(search.test('Vegan Lounge'), false, 'the name of a canteen is not a vegan dish');
});

test('punctuation, extra spaces and symbols in the query are ignored', () => {
  assert.deepEqual(find('  chicken,   curry!! '), []);
  assert.deepEqual(find('beef, coconut-curry'), ['Beef Coconut Curry']);
  assert.deepEqual(find('hot & cold'), ['Hot & Cold Buffet']);
  assert.ok(find('horn-shaped').includes('Vegan Ground Meat with Horn-Shaped Pasta'));
});

test('editDistance counts a swapped pair as one edit and stops early', () => {
  assert.equal(editDistance('pasta', 'pasat', 2), 1);
  assert.equal(editDistance('gnochi', 'gnocchi', 2), 1);
  assert.equal(editDistance('burger', 'butter', 2), 2);
  assert.equal(editDistance('abc', 'xyzxyz', 2), 3, 'gives up above the limit');
});
