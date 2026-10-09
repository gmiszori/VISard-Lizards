/**
 * THE API CONTRACT.
 *
 * Every shape the UI consumes lives here. The mock layer (mock.ts) and any
 * future REST backend must both produce exactly these shapes. Fields marked
 * optional (`?`) are things a scraper of the ETH/UZH menu pages may NOT be able
 * to provide; the UI renders gracefully without them.
 *
 * Conventions
 *  - Dates are local calendar dates `YYYY-MM-DD` (Europe/Zurich).
 *  - Timestamps are ISO-8601 strings with offset, e.g. `2026-10-09T12:14:00+02:00`.
 *  - Clock times are `HH:MM` 24h strings in Europe/Zurich.
 *  - Prices are CHF, two decimals, as numbers.
 */

// ───────────────────────── Basics ─────────────────────────

/** Monday-first weekday key. */
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** Which meal service a dish belongs to. */
export type Service = 'lunch' | 'dinner';

/** Dietary classification of a dish. Exactly one per meal. */
export type DietTag = 'vegan' | 'vegetarian' | 'meat' | 'fish';

/** Which price tier the user pays. */
export type PriceCategory = 'student' | 'staff' | 'external';

export type Institution = 'ETH' | 'UZH';

export type CampusId = 'eth-zentrum' | 'eth-hoenggerberg' | 'uzh-zentrum' | 'uzh-irchel' | 'uzh-oerlikon';

export interface LatLng {
  lat: number;
  lng: number;
}

// ───────────────────────── Campus & Mensa ─────────────────────────

export interface Campus {
  id: CampusId;
  /** Display name, e.g. "ETH Zentrum". */
  name: string;
  institution: Institution;
  /** Rough centre of the campus, used for distance and "nearest campus". */
  coordinates: LatLng;
}

/** One service window on one weekday. */
export interface ServiceHours {
  service: Service;
  /** `HH:MM` */
  open: string;
  /** `HH:MM` */
  close: string;
}

/** Opening hours per weekday. An empty array means closed that day. */
export type OpeningHours = Record<Weekday, ServiceHours[]>;

/** Aggregate of user ratings. Always present; `count` can be 0. */
export interface RatingSummary {
  /** Mean of 1–5 stars, 0 when count is 0. */
  average: number;
  count: number;
  /** Number of ratings for 1, 2, 3, 4, 5 stars (index 0 = one star). */
  distribution: [number, number, number, number, number];
  /** Mensa ratings only: mean 1–5 per optional aspect. */
  aspects?: Partial<Record<MensaAspect, number>>;
}

export interface Mensa {
  id: string;
  name: string;
  institution: Institution;
  campusId: CampusId;
  /** Street address, one line. */
  address: string;
  coordinates: LatLng;
  hours: OpeningHours;
  /** Short one-line character of the place, e.g. "Terrace views, big daily choice". */
  blurb?: string;
  rating: RatingSummary;
}

// ───────────────────────── Meals ─────────────────────────

export interface PriceSet {
  student: number;
  staff: number;
  external: number;
}

/**
 * Nutrition of a dish. A scraper usually cannot supply this, so the whole
 * object and each field are optional. The UI hides what is missing and
 * excludes such meals when a nutrition filter is active.
 */
export interface MealNutrition {
  /** Protein in grams per portion. OPTIONAL – scraper may not provide. */
  proteinG?: number;
  /** Energy in kcal per portion. OPTIONAL – scraper may not provide. */
  kcal?: number;
  carbsG?: number;
  fatG?: number;
}

export interface Meal {
  /** Stable id, used in the URL: /meal/<id>. */
  id: string;
  mensaId: string;
  /** Local date this dish is served, `YYYY-MM-DD`. */
  date: string;
  service: Service;
  /** Counter / line name as printed on the menu board: "Street", "Garden", "Home", "Local", "Vegan"… */
  line: string;
  /** Main dish title, e.g. "Pollo frito". */
  title: string;
  /** Side dishes in order, e.g. ["Pommes Frites", "Sriracha Mayonnaise"]. */
  sides: string[];
  /** One or two sentences. Optional – menus often have none. */
  description?: string;
  dietTag: DietTag;
  /** Ingredient keywords; drive the generated plate illustration when no photo exists. */
  ingredients: string[];
  price: PriceSet;
  /** Allergen names in English, e.g. ["Gluten", "Milk"]. Empty = none declared. */
  allergens: string[];
  /** Origin statement for meat/fish, e.g. "Fleisch aus der Schweiz". OPTIONAL. */
  origin?: string;
  /** OPTIONAL – scraper may not provide. */
  nutrition?: MealNutrition;
  /** OPTIONAL – scraper may not provide. UI falls back to a generated plate. */
  imageUrl?: string;
  rating: RatingSummary;
}

/** `getMeal` returns the meal plus its text reviews. */
export interface MealDetail extends Meal {
  reviews: MealReview[];
}

export interface MealReview {
  id: string;
  mealId: string;
  stars: 1 | 2 | 3 | 4 | 5;
  text: string;
  /** Free-form anonymous label such as "ETH student". */
  author?: string;
  /** `YYYY-MM-DD` */
  date: string;
}

// ───────────────────────── Crowd ─────────────────────────

/** 1 Empty · 2 Quiet · 3 Some queue · 4 Busy · 5 Packed */
export type CrowdLevel = 1 | 2 | 3 | 4 | 5;

/**
 * "Popular times": typical crowd per weekday and hour, 0–100.
 * Index = hour of day (0–23). Hours when the mensa is closed are 0.
 */
export interface CrowdHistogram {
  mensaId: string;
  /** False when too few reports exist; then `byWeekday` is omitted. */
  sufficient: boolean;
  /** How many reports the histogram is based on. */
  sampleSize: number;
  byWeekday?: Record<Weekday, number[]>;
}

/** A user-submitted "how full is it right now" report. */
export interface CrowdReport {
  mensaId: string;
  level: CrowdLevel;
  timestamp: string;
}

/** What `getCrowd` returns: typical pattern + the recent live reports. */
export interface CrowdInfo {
  histogram: CrowdHistogram;
  /** Reports from roughly the last 30 minutes, newest first. */
  live: CrowdReport[];
}

// ───────────────────────── Ratings (user submissions) ─────────────────────────

export type MealTag = 'tasty' | 'big-portion' | 'small-portion' | 'cold' | 'too-salty' | 'worth-it';

export interface MealRating {
  mealId: string;
  mensaId: string;
  stars: 1 | 2 | 3 | 4 | 5;
  tags: MealTag[];
  timestamp: string;
  /** Client-side label for the history list only; the backend may ignore it. */
  mealTitle?: string;
}

export type MensaAspect = 'food' | 'queue' | 'seating' | 'value';

export interface MensaRating {
  mensaId: string;
  stars: 1 | 2 | 3 | 4 | 5;
  /** Optional 1–5 per aspect. */
  aspects: Partial<Record<MensaAspect, number>>;
  timestamp: string;
}

// ───────────────────────── Client-only shapes ─────────────────────────

export interface LastEaten {
  mealId: string;
  mensaId: string;
  date: string;
  /** Denormalised so the check-in sheet can show it without a request. */
  title?: string;
}
