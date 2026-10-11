import { foldExpanded, foldPlain } from './fold.ts';

type Diet = 'vegan' | 'vegetarian' | 'meat';

// Only equivalent food words belong here. Related dishes and substitute ingredients
// should not turn a precise search into an unrelated result.
const TRANSLATIONS = [
  ['chicken', 'poulet', 'huhn', 'huehnchen', 'hähnchen'],
  ['beef', 'rind', 'rindfleisch'],
  ['pork', 'schwein', 'schweinefleisch'],
  ['fish', 'fisch'],
  ['salmon', 'lachs'],
  ['cheese', 'käse', 'kaese'],
  ['potato', 'potatoes', 'kartoffel', 'kartoffeln'],
  ['rice', 'reis'],
  ['noodle', 'noodles', 'nudel', 'nudeln'],
  ['lentil', 'lentils', 'linse', 'linsen'],
  ['mushroom', 'mushrooms', 'pilz', 'pilze'],
  ['tomato', 'tomatoes', 'tomate', 'tomaten'],
  ['onion', 'onions', 'zwiebel', 'zwiebeln'],
  ['eggplant', 'aubergine', 'auberginen'],
  ['zucchini', 'zucchetti', 'courgette'],
  ['bread', 'brot'],
  ['soup', 'suppe'],
  ['salad', 'salat'],
] as const;

const DIET_WORDS: Record<Diet, readonly string[]> = {
  vegan: ['vegan', 'vegane', 'veganes', 'veganer', 'pflanzlich', 'plantbased'],
  vegetarian: ['vegetarian', 'vegetarisch', 'vegetarische', 'vegetarisches', 'veggie', 'vegi', 'fleischlos'],
  meat: ['meat', 'fleisch'],
};

const FILLER = new Set(['with', 'and', 'the', 'mit', 'und', 'oder', 'or']);
const wordsOf = (text: string, fold: (value: string) => string): string[] =>
  fold(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

function wordMatches(word: string, term: string): boolean {
  return word.startsWith(term) || (term.length >= 4 && word.endsWith(term));
}

function variantsFor(token: string): string[] {
  const plain = foldPlain(token);
  const expanded = foldExpanded(token);
  const group = TRANSLATIONS.find(terms => terms.some(term => {
    const folded = foldPlain(term);
    return folded === plain || (plain.length >= 4 && folded.startsWith(plain));
  }));
  const singular = plain.length >= 5 && plain.endsWith('s') && !plain.endsWith('ss') ? plain.slice(0, -1) : plain;
  return group ? [...group] : [plain, expanded, singular];
}

function dietFor(token: string): Diet | undefined {
  const word = foldPlain(token);
  for (const diet of Object.keys(DIET_WORDS) as Diet[]) {
    if (DIET_WORDS[diet].some(label => label === word || (word.length >= 4 && label.startsWith(word)))) return diet;
  }
  return undefined;
}

export interface Search {
  active: boolean;
  test(text: string, diet?: string): boolean;
}

/** Match every meaningful query word against one dish or canteen, without a second asynchronous result set. */
export function createSearch(query: string): Search {
  const tokens = query.split(/[^\p{L}\p{N}]+/u).filter(word => word && !FILLER.has(foldPlain(word)));
  if (tokens.length === 0) return { active: false, test: () => true };
  const terms = tokens.map(token => ({ diet: dietFor(token), variants: variantsFor(token) }));
  return {
    active: true,
    test(text, diet) {
      const plain = wordsOf(text, foldPlain);
      const expanded = wordsOf(text, foldExpanded);
      return terms.every(term => {
        if (term.diet) return term.diet === 'vegetarian'
          ? diet === 'vegetarian' || diet === 'vegan'
          : diet === term.diet;
        return term.variants.some(variant => {
          const normal = foldPlain(variant);
          const umlaut = foldExpanded(variant);
          return plain.some(word => wordMatches(word, normal)) || expanded.some(word => wordMatches(word, umlaut));
        });
      });
    },
  };
}
