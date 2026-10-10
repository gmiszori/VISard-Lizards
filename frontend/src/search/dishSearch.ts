/**
 * Search for the overview ("Search canteens or dishes"). Pure functions, no DOM.
 *
 * What it understands:
 *  - several words: every word has to match (in any order), "chicken curry" or "polyterrasse pizza"
 *  - umlauts and accents either way ("käse", "kase", "kaese"), compound words ("reis" finds "Basmatireis")
 *  - German <-> English: "chicken" also finds "Poulet", "kartoffel" also finds "potato" and "Pommes" (SYNONYMS)
 *  - plurals: "noodles" -> "noodle", "kartoffeln" -> "kartoffel"
 *  - diet words: "vegan", "vegetarian"/"vegetarisch" (vegan dishes are vegetarian too), "meat"/"fleisch" match the
 *    dish's diet label, not just a name that happens to contain the word
 *  - typos, but only when nothing matches exactly (so a good result is never mixed with look-alikes):
 *    1 wrong/missing/extra/swapped letter in words of 4-5 letters, 2 in longer words
 */
import { foldExpanded, foldPlain } from './fold.ts';

export type DietLabel = 'vegan' | 'vegetarian' | 'meat';

interface Group {
  /** Words that mean the same; searching for one finds all of them. A leading "=" means: whole word only. */
  terms: string[];
  /** More specific words ("cheese" finds "mozzarella"), but not the other way round. */
  also?: string[];
}

const SYNONYMS: Group[] = [
  { terms: ['chicken', 'poulet', 'huhn', 'hühnchen', 'hähnchen', 'hendl', 'geflügel'] },
  { terms: ['beef', 'rind', 'rindfleisch', 'ochse'] },
  { terms: ['pork', 'schwein', 'schweins', 'schweinefleisch'], also: ['bacon', 'speck', 'schinken', '=ham', 'prosciutto'] },
  { terms: ['=ham', 'schinken', 'prosciutto', 'serrano'] },
  { terms: ['veal', 'kalb', 'kalbs', 'kalbfleisch'] },
  { terms: ['lamb', 'lamm'] },
  { terms: ['turkey', 'pute', 'puten', 'truthahn'] },
  { terms: ['duck', 'ente', 'enten'] },
  { terms: ['venison', 'wild', 'reh', 'hirsch'] },
  { terms: ['fish', 'fisch', 'seafood', 'meeresfrüchte'], also: ['salmon', 'lachs', 'tuna', 'thon', 'thunfisch', 'tunfisch', 'mahi', 'trout', 'forelle', 'cod', 'kabeljau', 'shrimp', 'prawn', 'crevetten', 'garnelen'] },
  { terms: ['salmon', 'lachs'] },
  { terms: ['tuna', 'thon', 'thunfisch', 'tunfisch'] },
  { terms: ['shrimp', 'shrimps', 'prawn', 'prawns', 'crevette', 'crevetten', 'garnele', 'garnelen'] },
  { terms: ['sausage', 'wurst', 'würstchen', 'bratwurst', 'cervelat', 'wienerli'] },
  { terms: ['meatball', 'meatballs', 'fleischbällchen', 'hackbällchen', 'frikadelle', 'fleischkügeli', 'köfte', 'kofta'] },
  { terms: ['mince', 'minced', 'ground', 'hackfleisch', 'hack', 'hackbraten'] },
  { terms: ['egg', 'eggs', 'eier', '=ei', 'spiegelei', 'rührei'] },
  { terms: ['cheese', 'käse', 'chäs', 'fromage'], also: ['mozzarella', 'parmesan', 'grana', 'ricotta', 'cheddar', 'feta', 'halloumi', 'raclette', 'gruyère', 'emmentaler', 'appenzeller', 'mascarpone', 'gorgonzola', 'pecorino', 'burrata', 'camembert', '=brie'] },
  { terms: ['potato', 'potatoes', 'kartoffel', 'kartoffeln', 'erdapfel'], also: ['pommes', 'frites', 'fries', 'rösti', 'stampf', 'gschwellti', 'wedges', 'kroketten'] },
  { terms: ['fries', 'pommes', 'frites'] },
  { terms: ['rice', 'reis'], also: ['basmati', 'jasmin', 'jasmine', 'risotto', 'pilaf', 'paella', 'biryani', 'bibimbap'] },
  { terms: ['noodle', 'noodles', 'nudel', 'nudeln'], also: ['ramen', 'udon', 'soba', 'bami', 'spaghetti', 'pasta', 'penne', 'fusilli', 'linguine', 'macaroni'] },
  { terms: ['pasta', 'teigwaren'], also: ['spaghetti', 'penne', 'fusilli', 'linguine', 'macaroni', 'makkaroni', 'cannelloni', 'ravioli', 'tortellini', 'cappelletti', 'lasagne', 'lasagna', 'nudeln', 'hörnli', 'spätzli', 'tagliatelle', 'farfalle'] },
  { terms: ['salad', 'salads', 'salat', 'salate'] },
  { terms: ['soup', 'suppe', 'suppen', 'bouillon', 'brühe'] },
  { terms: ['stew', 'eintopf', 'ragout', 'ragoût'] },
  { terms: ['vegetable', 'vegetables', 'gemüse'] },
  { terms: ['mushroom', 'mushrooms', 'pilz', 'pilze', 'champignon', 'champignons', 'schwammerl', 'steinpilz', 'pfifferling', 'pfifferlinge', 'chanterelle', 'chanterelles'] },
  { terms: ['tomato', 'tomatoes', 'tomate', 'tomaten'] },
  { terms: ['spinach', 'spinat'] },
  { terms: ['carrot', 'carrots', 'karotte', 'karotten', 'rüebli', 'möhre', 'möhren'] },
  { terms: ['onion', 'onions', 'zwiebel', 'zwiebeln'] },
  { terms: ['garlic', 'knoblauch'] },
  { terms: ['paprika', 'peperoni', 'peperone'] },
  { terms: ['pepper', 'peppers', 'pfeffer'] },
  { terms: ['lemon', 'zitrone', 'zitronen'] },
  { terms: ['lime', 'limette', 'limetten'] },
  { terms: ['apple', 'apfel', 'äpfel'], also: ['apfelmus', 'applesauce'] },
  { terms: ['bean', 'beans', 'bohne', 'bohnen'], also: ['edamame'] },
  { terms: ['lentil', 'lentils', 'linse', 'linsen', '=dal', 'daal'] },
  { terms: ['chickpea', 'chickpeas', 'kichererbse', 'kichererbsen'], also: ['hummus', 'falafel'] },
  { terms: ['peas', 'erbse', 'erbsen', '=pea'] },
  { terms: ['tofu'], also: ['seitan', 'tempeh'] },
  { terms: ['coconut', 'kokos', 'kokosnuss'] },
  { terms: ['nuts', 'nuss', 'nüsse', '=nut'], also: ['cashew', 'cashews', 'almond', 'mandel', 'mandeln', 'hazelnut', 'haselnuss', 'walnut', 'walnuss', 'pistachio', 'peanut', 'peanuts', 'erdnuss'] },
  { terms: ['peanut', 'peanuts', 'erdnuss', 'erdnüsse'] },
  { terms: ['bread', 'brot', 'brötchen', 'semmel', 'baguette', 'toast'], also: ['naan', 'focaccia', 'ciabatta'] },
  { terms: ['cream', 'rahm', 'sahne', 'creme'] },
  { terms: ['milk', 'milch'] },
  { terms: ['yogurt', 'yoghurt', 'joghurt', 'quark'] },
  { terms: ['sauce', 'sauces', 'sosse', 'soße'] },
  { terms: ['curry'], also: ['masala', 'tikka', 'korma', 'vindaloo', 'madras', 'tandoori'] },
  { terms: ['burger', 'cheeseburger', 'hamburger'] },
  { terms: ['dessert', 'desserts', 'nachtisch', 'nachspeise'], also: ['kuchen', 'cake', 'tiramisu', 'mousse', 'pudding', 'crumble', 'brownie', 'glace', 'cheesecake', 'torte', '=eis', '=ice'] },
  { terms: ['sweet', 'süss', 'süß'] },
  { terms: ['spicy', 'scharf', 'pikant'] },
  { terms: ['fried', 'gebraten', 'gebratene', 'gebratener', 'gebratenen', 'frittiert'] },
  { terms: ['crispy', 'knusprig', 'crunchy', 'knackig'] },
  { terms: ['breaded', 'paniert', 'paniertes', 'panierte'], also: ['schnitzel', 'nuggets', 'cordon'] },
  { terms: ['grilled', 'gegrillt', 'gegrillte', 'grill', 'bbq', 'barbecue'] },
  { terms: ['baked', 'gebacken', 'überbacken', 'gratin', 'gratiniert'] },
  { terms: ['cabbage', 'kabis', 'kohl', 'weisskohl', 'rotkohl', 'wirz', 'wirsing'], also: ['coleslaw', 'slaw', 'sauerkraut'] },
  { terms: ['cucumber', 'cucumbers', 'gurke', 'gurken'] },
  { terms: ['pumpkin', 'kürbis'] },
  { terms: ['zucchini', 'zucchetti', 'courgette', 'courgettes'] },
  { terms: ['corn', 'mais'] },
  { terms: ['eggplant', 'aubergine', 'auberginen', 'melanzane'] },
  { terms: ['cauliflower', 'blumenkohl', 'karfiol'] },
  { terms: ['broccoli', 'brokkoli'] },
  { terms: ['celery', 'sellerie'] },
  { terms: ['herb', 'herbs', 'kraut', 'kräuter'] },
  { terms: ['parsley', 'petersilie'] },
  { terms: ['cilantro', 'coriander', 'koriander'] },
  { terms: ['basil', 'basilikum'] },
  { terms: ['mint', 'minze'] },
  { terms: ['ginger', 'ingwer'] },
  { terms: ['chives', 'schnittlauch'] },
  { terms: ['olive', 'olives', 'oliven'] },
  { terms: ['chocolate', 'schokolade', 'schoggi'] },
  { terms: ['honey', 'honig'] },
  { terms: ['fruit', 'fruits', 'frucht', 'früchte', 'obst'] },
  { terms: ['drink', 'drinks', 'beverage', 'getränk', 'lemonade', 'limonade'] },
  { terms: ['sushi', 'maki', 'nigiri'] },
  { terms: ['daily', 'tages', 'tagesmenü', 'tagesgericht', 'special', 'spezial'] },
  { terms: ['classic', 'klassiker', 'klassisch'] },
  { terms: ['side', 'beilage', 'beilagen'] },
];

/** Words that carry no meaning in a search ("pasta with cheese und nüsse" -> pasta cheese nüsse). */
const FILLER = new Set(['with', 'and', 'the', 'mit', 'und', 'oder', 'or', 'of', 'an', 'dish', 'dishes', 'gericht', 'gerichte', 'meal', 'meals', 'menu', 'menus', 'food', 'essen']);

/** Words that mean a diet label. Full words match the label itself; shorter beginnings ("vega") match label or name. */
const DIET_WORDS: Record<DietLabel, string[]> = {
  vegan: ['vegan', 'vegane', 'veganes', 'veganer', 'pflanzlich', 'pflanzenbasiert', 'plantbased'],
  vegetarian: ['vegetarian', 'vegetarisch', 'vegetarische', 'vegetarisches', 'vegetarier', 'veggie', 'veggy', 'vegi', 'fleischlos', 'meatfree'],
  meat: ['meat', 'fleisch', 'fleischgericht', 'carnivore', 'carnivor', 'fleischesser'],
};

function dietMatches(want: DietLabel, have: string | undefined): boolean {
  if (!have) return false;
  return want === 'vegetarian' ? have === 'vegetarian' || have === 'vegan' : have === want;
}

// ---------------------------------------------------------------------------------------------------------------
// Preparing text and words

interface Prepared { plain: string; expanded: string; wordsPlain: string[]; wordsExpanded: string[] }

const squash = (text: string) => text.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const cache = new Map<string, Prepared>();

function prepare(text: string): Prepared {
  let found = cache.get(text);
  if (!found) {
    const plain = squash(foldPlain(text));
    const expanded = squash(foldExpanded(text));
    found = { plain, expanded, wordsPlain: plain.split(' '), wordsExpanded: expanded.split(' ') };
    if (cache.size > 5000) cache.clear();
    cache.set(text, found);
  }
  return found;
}

interface Form { plain: string; expanded: string; whole: boolean; startOnly?: boolean }

const formOf = (term: string): Form => {
  const whole = term.startsWith('=');
  const word = whole ? term.slice(1) : term;
  return { plain: squash(foldPlain(word)), expanded: squash(foldExpanded(word)), whole };
};

interface Entry { forms: Form[]; keys: Form[] }
const entries: Entry[] = SYNONYMS.map(group => ({
  keys: group.terms.map(formOf),
  forms: [...group.terms, ...(group.also ?? [])].map(formOf),
}));
const keyIndex = new Map<string, number[]>();
entries.forEach((entry, index) => entry.keys.forEach(key => {
  for (const variant of new Set([key.plain, key.expanded])) keyIndex.set(variant, [...(keyIndex.get(variant) ?? []), index]);
}));

// ---------------------------------------------------------------------------------------------------------------
// Typos

/** Edit distance counting a swapped neighbour pair as one edit (optimal string alignment); gives up above `limit`. */
export function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) { rows.push(new Array(b.length + 1).fill(0)); rows[i]![0] = i; }
  for (let j = 0; j <= b.length; j++) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, rows[i - 2]![j - 2]! + 1);
      rows[i]![j] = value;
      best = Math.min(best, value);
    }
    if (best > limit) return limit + 1;
  }
  return rows[a.length]![b.length]!;
}

/** How many wrong letters a word of this length may have: none for 1-3 letters, 1 for 4-5, 2 from 6. */
const allowedTypos = (length: number) => (length <= 3 ? 0 : length <= 5 ? 1 : 2);

/** Close enough to `word` or to the beginning of it (the search runs while typing, and German words are long). */
function nearWord(token: string, word: string): boolean {
  const limit = allowedTypos(token.length);
  if (limit === 0) return false;
  // Mid-length words rarely have the first letter wrong, so "burger" does not become "butter".
  if (token.length <= 7 && token[0] !== word[0]) return false;
  if (editDistance(token, word, limit) <= limit) return true;
  if (word.length <= token.length + limit) return false;
  for (let length = token.length - 1; length <= token.length + 1; length++) {
    if (length > 0 && editDistance(token, word.slice(0, length), limit) <= limit) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------
// Words of the query

interface Token {
  plain: string;
  expanded: string;
  forms: Form[];
  diet?: { label: DietLabel; partial: boolean };
}

/** Possible singular forms of a word, for looking it up in SYNONYMS ("kartoffeln" -> "kartoffel", "noodles" -> "noodle"). */
function stemsOf(plain: string): string[] {
  const stems: string[] = [];
  for (const ending of ['en', 'es', 'er', 's', 'n', 'e']) {
    if (plain.endsWith(ending) && plain.length - ending.length >= 4) stems.push(plain.slice(0, -ending.length));
  }
  return stems;
}

/** "burgers" -> "burger", "tomatoes" -> "tomato". Only these English endings are also searched for as text: stripping more
 *  would turn "chicken" into "chick" and find chickpeas. */
function pluralStem(plain: string): string | undefined {
  if (plain.length >= 5 && plain.endsWith('es') && /(?:o|s|x|ch|sh)es$/.test(plain)) return plain.slice(0, -2);
  if (plain.length >= 5 && plain.endsWith('s') && !plain.endsWith('ss')) return plain.slice(0, -1);
  return undefined;
}

/** The query word itself plus everything that means the same (and, when asked, words that are a typo away from a known word). */
function expand(plain: string, expanded: string, fuzzy: boolean): Form[] {
  const forms = new Map<string, Form>();
  const add = (form: Form) => forms.set(`${form.plain}|${form.expanded}|${form.whole}`, form);
  const addGroups = (groups: Iterable<number>) => { for (const index of groups) entries[index]!.forms.forEach(add); };
  const lookup = (variants: string[]) => new Set(variants.flatMap(variant => keyIndex.get(variant) ?? []));

  // A word that is only listed as a whole word ("ham") must not also match the end of other words ("Graham").
  const wholeOnly = entries.some(entry => entry.keys.some(key => key.whole && (key.plain === plain || key.expanded === expanded)));
  add({ plain, expanded, whole: false, startOnly: wholeOnly });
  const groups = lookup([plain, expanded]);
  if (plain.length >= 4) {
    entries.forEach((entry, index) => {
      if (entry.keys.some(key => key.plain.length > plain.length && (key.plain.startsWith(plain) || key.expanded.startsWith(expanded)))) groups.add(index);
      else if (fuzzy && entry.keys.some(key => key.plain.length >= 4 && nearWord(plain, key.plain))) groups.add(index);
    });
  }
  // Singular forms: found in SYNONYMS by exact word only (never by beginning, "chick" is not "chicken").
  const stems = stemsOf(plain);
  const expandedStems = stemsOf(expanded);
  stems.forEach((stem, i) => lookup([stem, expandedStems[i] ?? stem]).forEach(index => groups.add(index)));
  const plural = pluralStem(plain);
  if (plural) add({ plain: plural, expanded: pluralStem(expanded) ?? plural, whole: false });
  addGroups(groups);
  return [...forms.values()];
}

function dietOf(plain: string, fuzzy: boolean): Token['diet'] {
  const labels = Object.keys(DIET_WORDS) as DietLabel[];
  // An exact word wins over a beginning: "fleisch" is meat even though it starts "fleischlos" (meat-free).
  for (const label of labels) if (DIET_WORDS[label].includes(plain)) return { label, partial: false };
  if (plain.length >= 4) {
    for (const label of labels) if (DIET_WORDS[label].some(word => plain.length < word.length && word.startsWith(plain))) return { label, partial: true };
  }
  if (fuzzy && plain.length >= 4) {
    // The closest whole diet word wins ("meet" is "meat", not the beginning of "meatfree").
    const limit = allowedTypos(plain.length);
    let best: { label: DietLabel; distance: number } | undefined;
    for (const label of labels) {
      for (const word of DIET_WORDS[label]) {
        if (plain.length <= 7 && plain[0] !== word[0]) continue;
        const distance = editDistance(plain, word, limit);
        if (distance <= limit && (!best || distance < best.distance)) best = { label, distance };
      }
    }
    if (best) return { label: best.label, partial: false };
  }
  return undefined;
}

function tokenize(query: string, fuzzy: boolean): Token[] {
  const tokens: Token[] = [];
  for (const raw of query.split(/[^\p{L}\p{N}]+/u)) {
    const plain = foldPlain(raw);
    if (!plain || FILLER.has(plain) || (plain.length === 1 && !/\d/.test(plain))) continue;
    const expanded = foldExpanded(raw);
    tokens.push({ plain, expanded, forms: expand(plain, expanded, fuzzy), diet: dietOf(plain, fuzzy) });
  }
  return tokens;
}

// ---------------------------------------------------------------------------------------------------------------
// Matching

function contains(text: string, words: string[], term: string, whole: boolean, startOnly = false): boolean {
  if (!term) return false;
  if (whole) return words.includes(term);
  if (startOnly) return words.some(word => word.startsWith(term));
  // Short terms only at the start or end of a word, so "reis" finds "Basmatireis" but "ham" does not find "Graham".
  if (term.length <= 4) return words.some(word => word.startsWith(term) || word.endsWith(term));
  return text.includes(term);
}

function matchesForms(forms: Form[], text: Prepared): boolean {
  return forms.some(form => contains(text.plain, text.wordsPlain, form.plain, form.whole, form.startOnly) || contains(text.expanded, text.wordsExpanded, form.expanded, form.whole, form.startOnly));
}

function matchesToken(token: Token, text: Prepared, diet: string | undefined, fuzzy: boolean): boolean {
  if (token.diet) {
    const fits = dietMatches(token.diet.label, diet);
    if (!token.diet.partial) return fits;
    if (fits) return true;
  }
  if (matchesForms(token.forms, text)) return true;
  if (!fuzzy || token.plain.length < 4) return false;
  return [...text.wordsPlain, ...text.wordsExpanded].some(word => nearWord(token.plain, word) || nearWord(token.expanded, word));
}

export interface SearchText { text: string; diet?: string }

export interface Search {
  /** false when the query has no searchable word (empty, only filler): everything matches. */
  active: boolean;
  /** true when nothing matched exactly and the matches are look-alikes for a misspelt word. */
  fuzzy: boolean;
  /** true when at least one of the texts it was built from matches. */
  hasMatches: boolean;
  test(text: string, diet?: string): boolean;
}

/**
 * Builds the matcher for one query. `corpus` is everything that can be searched on the page (dishes with their
 * canteen name, canteen names); it decides whether the exact search finds something or the typo search is used.
 */
export function createSearch(query: string, corpus: readonly SearchText[]): Search {
  const exactTokens = tokenize(query, false);
  if (exactTokens.length === 0) return { active: false, fuzzy: false, hasMatches: true, test: () => true };
  const exact = (text: string, diet?: string) => exactTokens.every(token => matchesToken(token, prepare(text), diet, false));
  if (corpus.some(entry => exact(entry.text, entry.diet))) return { active: true, fuzzy: false, hasMatches: true, test: exact };

  const fuzzyTokens = tokenize(query, true);
  const fuzzy = (text: string, diet?: string) => fuzzyTokens.every(token => matchesToken(token, prepare(text), diet, true));
  if (corpus.some(entry => fuzzy(entry.text, entry.diet))) return { active: true, fuzzy: true, hasMatches: true, test: fuzzy };
  return { active: true, fuzzy: false, hasMatches: false, test: exact };
}
