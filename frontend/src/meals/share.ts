export interface ShareInput {
  dish: string;
  /** "CHF 8.50" as shown for the chosen price category, or '' when no price is published. */
  price: string;
  mensa: string;
  /** "Lunch · 11:15–14:00" as shown on the dish. */
  when: string;
  url: string;
}

/** One line a friend can read in a chat: "Cod Fillet · CHF 12.50 · Mensa Polyterrasse · Lunch 11:15–14:00". */
export function shareText({ dish, price, mensa, when }: ShareInput): string {
  return [dish, price, mensa, when.replace(/\s*·\s*/, ' ')].map(part => part.trim()).filter(Boolean).join(' · ');
}

/** Link to the dish on its canteen page; the page scrolls to it and highlights it. */
export function dishUrl(page: string, mealId: string): string {
  const base = page.split('#')[0]!;
  return `${base}#${encodeURIComponent(mealId)}`;
}

/** The meal id from a URL hash, or null. Ids come from the backend, so only a plain id shape is accepted. */
export function mealIdFromHash(hash: string): string | null {
  let id: string;
  try { id = decodeURIComponent(hash.replace(/^#/, '')); } catch { return null; }
  return /^[\w.-]{1,120}$/.test(id) ? id : null;
}
