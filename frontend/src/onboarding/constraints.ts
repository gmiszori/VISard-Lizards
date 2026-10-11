import type { Meal } from '../data/canteens';
import type { Profile } from './profile.ts';

export type ConstraintMeal = Pick<Meal, 'dietTag' | 'allergens' | 'originDetail' | 'components'> & { title?: string; titleDe?: string | null };
const pork = /\b(?:pork|schwein\w*|speck\w*|bacon|ham|schinken\w*|salami|chorizo|\w*wurst)\b/i;

/**
 * The allergen list of the menu data is often incomplete (a dish can name walnuts in its description and list no nuts
 * under "Contains"). So an exclusion also reads the dish name and description. The word lists lean towards excluding
 * too much, never too little: a dish dropped by mistake costs a click, one kept by mistake can hurt someone.
 */
const notAnAllergen = /muskat\w*|nutmeg|kokosnuss|coconut|(?:erdnuss|peanut|mandel|almond|cashew|kokos|coconut|hafer|oat|soja|soy|reis|rice|nuss|kakao|cocoa)\s?-?(?:butter|milch|milk|drink|sahne|cream)/gi;
const nutWords = /nuss|nüss|\bnuts?\b|walnu|hazelnu|haselnu|mandel|almond|cashew|pistaz|pistachio|pecan|macadamia|pinienkern|pine ?nut|erdnuss|peanut|nougat|marzipan|krokant|praline|pralin/i;
const milkWords = /milch|milk|käse|kaese|cheese|rahm|sahne|cream|butter|joghurt|yogh?urt|quark|mozzarella|parmesan|gruy|raclette|feta|ricotta|mascarpone|molke|whey|béchamel|bechamel|fondue|halloumi|gorgonzola|emmental|tzatziki|crème|creme|schmand|buttermilch|glace|\beis\b|ice cream/i;
const glutenWords = /weizen|wheat|gluten|dinkel|spelt|roggen|\brye\b|gerste|barley|\bbrot\b|bread|brötchen|toast|nudel|noodle|pasta|spaghetti|penne|tagliatelle|gnocchi|couscous|bulgur|semmel|paniert|panier|schnitzel|burger|pizza|\bwrap\b|tortilla|baguette|knödel|spätzle|teigwaren|lasagn|ravioli|tortellini|udon|ramen|seitan|panko|crouton|focaccia|ciabatta|naan|pita|mehl|flour|teig|gebäck|kuchen/i;
const glutenFree = /reisnudel|rice noodle|glasnudel|glass noodle|buchweizen|buckwheat/gi;

function mentions(meal: ConstraintMeal, words: RegExp, ignore: RegExp[] = []): boolean {
  let text = [meal.title, meal.titleDe, ...meal.components].filter(Boolean).join(' · ');
  for (const pattern of [notAnAllergen, ...ignore]) text = text.replace(pattern, ' ');
  return words.test(text);
}

export function matchesConstraints(meal: ConstraintMeal, profile: Pick<Profile, 'diet' | 'hard'>): boolean {
  if (profile.diet === 'vegan' && meal.dietTag !== 'vegan') return false;
  if (profile.diet === 'vegetarian' && !['vegan', 'vegetarian'].includes(meal.dietTag)) return false;
  if (profile.diet === 'pescetarian' && meal.dietTag === 'meat') return false;
  if (profile.diet === 'carnivore' && meal.dietTag !== 'meat' && meal.dietTag !== 'fish') return false;
  return profile.hard.every(constraint => {
    switch (constraint) {
      case 'no_pork': return !meal.originDetail?.meat.some(origin => origin.type.toLowerCase() === 'pork')
        && !meal.components.some(component => pork.test(component));
      case 'lactose_free': return !meal.allergens.includes('milk') && !mentions(meal, milkWords);
      case 'gluten_free': return !meal.allergens.includes('gluten') && !mentions(meal, glutenWords, [glutenFree]);
      case 'nut_free': return !meal.allergens.some(allergen => allergen === 'nuts' || allergen === 'peanuts') && !mentions(meal, nutWords);
      // Constraints removed from the app (halal, kosher: not determinable from the menu data) never exclude a dish.
      default: return true;
    }
  });
}
