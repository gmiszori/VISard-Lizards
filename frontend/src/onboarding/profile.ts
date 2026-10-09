import type { CampusId } from '../data/canteens';

export interface Profile {
  v: 1;
  lang: 'de' | 'en';
  campus: CampusId;
  campusSecondary: CampusId[];
  diet: 'omnivore' | 'flexitarian' | 'pescetarian' | 'vegetarian' | 'vegan';
  hard: ('no_pork' | 'halal' | 'kosher' | 'lactose_free' | 'gluten_free' | 'nut_free')[];
  soft: string[];
  dislikes: string[];
  priority: ('taste' | 'price' | 'speed' | 'health')[];
  priceTier: 'student' | 'worker' | 'external';
  maxPrice: number | null;
  priceMode: 'soft' | 'hard';
  lunchTime: string | null;
  notifyDaily: boolean;
  mensaRatings: { mensaId: string; rating: 1 | 2 | 3 }[];
}

export const DIETS: Profile['diet'][] = ['omnivore', 'flexitarian', 'pescetarian', 'vegetarian', 'vegan'];
export const HARD: Profile['hard'] = ['no_pork', 'halal', 'kosher', 'lactose_free', 'gluten_free', 'nut_free'];
export const PRIORITIES: Profile['priority'] = ['taste', 'price', 'speed', 'health'];
export const TIERS: Profile['priceTier'][] = ['student', 'worker', 'external'];
export const SOFT = ['spicy', 'high_protein', 'healthy', 'comfort_food'];
// TODO(data): cuisines have no structured field; retain choices for future data.
export const CUISINES = ['asian', 'italian', 'swiss', 'indian', 'mediterranean', 'mexican'];

export function defaults(campus: CampusId, lang: Profile['lang'] = 'en'): Profile {
  return { v: 1, lang, campus, campusSecondary: [], diet: 'omnivore', hard: [], soft: [], dislikes: [],
    priority: [...PRIORITIES], priceTier: 'student', maxPrice: null, priceMode: 'soft',
    lunchTime: null, notifyDaily: false, mensaRatings: [] };
}

export function normaliseDislikes(values: string[]): string[] {
  return [...new Map(values.map(value => value.trim()).filter(Boolean)
    .map(value => [value.toLocaleLowerCase(), value])).values()].slice(0, 10);
}
