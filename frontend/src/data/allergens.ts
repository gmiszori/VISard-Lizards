/** Provider names and ids share one vocabulary for exclusions and diet checks. */
const aliases: Record<string, string> = {
  milk: 'milk', milch: 'milk', lactose: 'milk', laktose: 'milk',
  gluten: 'gluten', cerealscontaininggluten: 'gluten', 'glutenhaltiges getreide': 'gluten',
  wheat: 'gluten', weizen: 'gluten', spelt: 'gluten', dinkel: 'gluten', rye: 'gluten', roggen: 'gluten', barley: 'gluten', gerste: 'gluten', oats: 'gluten', hafer: 'gluten',
  nuts: 'nuts', schalenfruchte: 'nuts', schalenobst: 'nuts', nusse: 'nuts', almond: 'nuts', mandel: 'nuts', hazelnut: 'nuts', haselnuss: 'nuts', walnut: 'nuts', walnuss: 'nuts', cashew: 'nuts', pistachio: 'nuts', pistazie: 'nuts', pecan: 'nuts', brazilnut: 'nuts', macadamia: 'nuts',
  peanuts: 'peanuts', peanut: 'peanuts', erdnuss: 'peanuts', erdnusse: 'peanuts',
  eggs: 'eggs', egg: 'eggs', ei: 'eggs', eier: 'eggs',
  fish: 'fish', fisch: 'fish', fische: 'fish',
  crustaceans: 'crustaceans', crustacean: 'crustaceans', krebstiere: 'crustaceans',
  molluscs: 'molluscs', mollusks: 'molluscs', weichtiere: 'molluscs',
  soy: 'soy', soya: 'soy', soybeans: 'soy', soja: 'soy', sojabohne: 'soy', sojabohnen: 'soy',
  celery: 'celery', sellerie: 'celery', mustard: 'mustard', senf: 'mustard', sesame: 'sesame', sesam: 'sesame',
  sulphites: 'sulphites', sulfites: 'sulphites', sulfite: 'sulphites', lupin: 'lupin', lupins: 'lupin', lupinen: 'lupin',
};
export function normalizeAllergens(values: readonly string[]): string[] {
  return [...new Set(values.map(value => {
    const key = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return aliases[key] ?? key;
  }))];
}

/** Traces are deliberately excluded: cross-contact does not contradict a recipe's diet label. */
export function hasDietConflict(diet: string, allergens: readonly string[]): boolean {
  const ids = normalizeAllergens(allergens);
  return (diet === 'vegan' && ids.some(id => ['milk', 'eggs', 'fish', 'crustaceans', 'molluscs'].includes(id)))
    || (diet === 'vegetarian' && ids.some(id => ['fish', 'crustaceans', 'molluscs'].includes(id)));
}
