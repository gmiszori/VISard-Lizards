import type { MealTag, PriceCategory } from './types';

/** Splits CHF 8.80 into the big and small parts of the menu-board price. */
export function splitPrice(n: number): { whole: string; cents: string } {
  const [w, c] = n.toFixed(2).split('.');
  return { whole: w ?? '0', cents: c ?? '00' };
}

export const PRICE_LABEL: Record<PriceCategory, string> = {
  student: 'Student',
  staff: 'Staff',
  external: 'External',
};

export const TAG_LABEL: Record<MealTag, string> = {
  tasty: 'Tasty',
  'big-portion': 'Big portion',
  'small-portion': 'Small portion',
  cold: 'Cold',
  'too-salty': 'Too salty',
  'worth-it': 'Worth it',
};

export const MEAL_TAGS = Object.keys(TAG_LABEL) as MealTag[];

export function avg1(n: number): string {
  return n.toFixed(1);
}

export function timeAgo(iso: string, now: Date): string {
  const mins = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
