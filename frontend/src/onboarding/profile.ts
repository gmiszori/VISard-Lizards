import type { CampusId } from '../data/canteens';

export type MensaRating = 1 | 2 | 3 | 4 | 5;

export interface Profile {
  v: 1;
  lang: 'de' | 'en';
  campus: CampusId;
  campusSecondary: CampusId[];
  diet: 'omnivore' | 'flexitarian' | 'pescetarian' | 'vegetarian' | 'vegan' | 'carnivore';
  hard: ('no_pork' | 'halal' | 'kosher' | 'lactose_free' | 'gluten_free' | 'nut_free')[];
  soft: string[];
  dislikes: string[];
  priority: ('taste' | 'price' | 'speed' | 'health')[];
  priceTier: 'student' | 'worker' | 'external';
  maxPrice: number | null;
  priceMode: 'soft' | 'hard';
  lunchTime: string | null;
  notifyDaily: boolean;
  mensaRatings: { mensaId: string; rating: MensaRating }[];
}
export const DIETS: Profile['diet'][] = ['omnivore', 'vegan', 'vegetarian', 'carnivore'];
export const HARD: Profile['hard'] = ['no_pork', 'halal', 'kosher', 'lactose_free', 'gluten_free', 'nut_free'];
export const PRIORITIES: Profile['priority'] = ['taste', 'price', 'speed', 'health'];
export const TIERS: Profile['priceTier'][] = ['student', 'worker', 'external'];

export function defaults(campus: CampusId, lang: Profile['lang'] = 'en'): Profile {
  return { v: 1, lang, campus, campusSecondary: [], diet: 'omnivore', hard: [], soft: [], dislikes: [],
    priority: [...PRIORITIES], priceTier: 'student', maxPrice: null, priceMode: 'soft',
    lunchTime: null, notifyDaily: false, mensaRatings: [] };
}

