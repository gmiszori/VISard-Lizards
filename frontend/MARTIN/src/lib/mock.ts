/**
 * Deterministic mock backend. Same output for the same date on every load.
 * Everything here is replaced by real HTTP calls in api.ts once
 * PUBLIC_API_URL is set; the shapes are defined in types.ts.
 *
 * Addresses and coordinates are best-effort and must be verified against the
 * official ETH / UZH sources before launch.
 */
import { levelFromPct } from './crowd';
import { dateOfWeekday, getNow, hhmmToMin, isoDate, parseISODate, weekdayOf, WEEKDAYS } from './time';
import type {
  CrowdInfo,
  CrowdLevel,
  CrowdReport,
  Meal,
  MealDetail,
  MealRating,
  MealReview,
  Mensa,
  MensaAspect,
  MensaRating,
  OpeningHours,
  PriceSet,
  RatingSummary,
  Service,
  ServiceHours,
  Weekday,
  DietTag,
  CampusId,
  Institution,
} from './types';

// ───────────────────────── seeded randomness ─────────────────────────

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], r: number): T {
  return arr[Math.min(arr.length - 1, Math.floor(r * arr.length))] as T;
}

function shuffle<T>(arr: readonly T[], r: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

// ───────────────────────── mensas ─────────────────────────

function hours(spec: {
  lunch?: [string, string];
  dinner?: [string, string];
  /** weekdays that get dinner, default none */
  dinnerDays?: Weekday[];
  sat?: [string, string];
}): OpeningHours {
  const wk: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
  const out = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] } as OpeningHours;
  for (const d of wk) {
    const list: ServiceHours[] = [];
    if (spec.lunch) list.push({ service: 'lunch', open: spec.lunch[0], close: spec.lunch[1] });
    if (spec.dinner && (spec.dinnerDays ?? wk).includes(d))
      list.push({ service: 'dinner', open: spec.dinner[0], close: spec.dinner[1] });
    out[d] = list;
  }
  if (spec.sat) out.sat = [{ service: 'lunch', open: spec.sat[0], close: spec.sat[1] }];
  return out;
}

const MON_THU: Weekday[] = ['mon', 'tue', 'wed', 'thu'];

interface MensaSeed {
  id: string;
  name: string;
  institution: Institution;
  campusId: CampusId;
  address: string;
  lat: number;
  lng: number;
  hours: OpeningHours;
  blurb: string;
  lines: string[];
  /** 0.4–1.0, how busy the place gets */
  popularity: number;
  /** false → "not enough reports yet" */
  crowdKnown: boolean;
  /** price multiplier */
  priceFactor: number;
  /** base rating, 1–5 */
  quality: number;
}

const SEEDS: MensaSeed[] = [
  {
    id: 'polyterrasse',
    name: 'Polyterrasse',
    institution: 'ETH',
    campusId: 'eth-zentrum',
    address: 'Universitätstrasse 6, 8092 Zürich',
    lat: 47.3769,
    lng: 8.548,
    hours: hours({ lunch: ['11:00', '14:00'], dinner: ['17:30', '19:30'], dinnerDays: MON_THU }),
    blurb: 'Big terrace above the city, five counters every day.',
    lines: ['Street', 'Garden', 'Home', 'Local', 'Vegan'],
    popularity: 1,
    crowdKnown: true,
    priceFactor: 1,
    quality: 3.9,
  },
  {
    id: 'clausiusbar',
    name: 'Clausiusbar',
    institution: 'ETH',
    campusId: 'eth-zentrum',
    address: 'Clausiusstrasse 49, 8092 Zürich',
    lat: 47.3784,
    lng: 8.5466,
    hours: hours({ lunch: ['11:15', '14:00'] }),
    blurb: 'Quick counter in the chemistry building.',
    lines: ['Street', 'Garden', 'Vegan'],
    popularity: 0.7,
    crowdKnown: true,
    priceFactor: 0.95,
    quality: 3.6,
  },
  {
    id: 'archimedes',
    name: 'Archimedes',
    institution: 'ETH',
    campusId: 'eth-zentrum',
    address: 'Stampfenbachstrasse 8, 8092 Zürich',
    lat: 47.377,
    lng: 8.5499,
    hours: hours({ lunch: ['11:15', '14:00'], dinner: ['17:30', '19:30'] }),
    blurb: 'Home cooking and pasta, open for dinner every weekday.',
    lines: ['Home', 'Garden', 'Pasta', 'Vegan'],
    popularity: 0.75,
    crowdKnown: true,
    priceFactor: 1,
    quality: 3.7,
  },
  {
    id: 'fusion-meal',
    name: 'FUSION meal',
    institution: 'ETH',
    campusId: 'eth-zentrum',
    address: 'Leonhardstrasse 34, 8092 Zürich',
    lat: 47.3759,
    lng: 8.5472,
    hours: hours({ lunch: ['11:15', '14:00'], dinner: ['17:30', '20:00'], dinnerDays: MON_THU }),
    blurb: 'Street food counter with a vegan-first menu.',
    lines: ['Street', 'Vegan', 'Garden', 'Pasta'],
    popularity: 0.85,
    crowdKnown: true,
    priceFactor: 1.05,
    quality: 4.1,
  },
  {
    id: 'alumni-quattro',
    name: 'Alumni quattro Lounge',
    institution: 'ETH',
    campusId: 'eth-zentrum',
    address: 'Gloriastrasse 35, 8092 Zürich',
    lat: 47.3766,
    lng: 8.5491,
    hours: hours({ lunch: ['11:30', '14:00'] }),
    blurb: 'Table service feel, grill and seasonal dishes.',
    lines: ['Grill', 'Home', 'Garden'],
    popularity: 0.55,
    crowdKnown: true,
    priceFactor: 1.25,
    quality: 4.2,
  },
  {
    id: 'dozentenfoyer',
    name: 'Dozentenfoyer',
    institution: 'ETH',
    campusId: 'eth-zentrum',
    address: 'Rämistrasse 101, 8092 Zürich',
    lat: 47.3764,
    lng: 8.5479,
    hours: hours({ lunch: ['11:30', '13:45'] }),
    blurb: 'Calm room in the main building, a short seasonal menu.',
    lines: ['Grill', 'Home', 'Local'],
    popularity: 0.5,
    crowdKnown: false,
    priceFactor: 1.3,
    quality: 4.0,
  },
  {
    id: 'food-and-lab',
    name: 'food&lab',
    institution: 'ETH',
    campusId: 'eth-hoenggerberg',
    address: 'Vladimir-Prelog-Weg 1–5/10, 8093 Zürich',
    lat: 47.4087,
    lng: 8.5075,
    hours: hours({ lunch: ['11:00', '14:00'], dinner: ['17:30', '19:30'] }),
    blurb: 'Plant-forward kitchen on the Hönggerberg.',
    lines: ['Vegan', 'Garden', 'Street'],
    popularity: 0.8,
    crowdKnown: true,
    priceFactor: 1,
    quality: 4.3,
  },
  {
    id: 'hoenggerberg-food-market',
    name: 'ETH Hönggerberg Food Market',
    institution: 'ETH',
    campusId: 'eth-hoenggerberg',
    address: 'Wolfgang-Pauli-Strasse 27, 8093 Zürich',
    lat: 47.408,
    lng: 8.5095,
    hours: hours({ lunch: ['11:00', '14:00'], sat: ['11:00', '14:00'] }),
    blurb: 'The big one. Five stations, open on Saturdays.',
    lines: ['Street', 'Pasta', 'Garden', 'Vegan', 'Home'],
    popularity: 1,
    crowdKnown: true,
    priceFactor: 1,
    quality: 3.5,
  },
  {
    id: 'uzh-untere-mensa',
    name: 'Untere Mensa',
    institution: 'UZH',
    campusId: 'uzh-zentrum',
    address: 'Rämistrasse 71, 8006 Zürich',
    lat: 47.3744,
    lng: 8.5483,
    hours: hours({ lunch: ['11:15', '14:00'], dinner: ['17:30', '19:30'], dinnerDays: MON_THU, sat: ['11:30', '13:30'] }),
    blurb: 'The classic UZH hall under the main building.',
    lines: ['Home', 'Garden', 'Local', 'Vegan'],
    popularity: 0.95,
    crowdKnown: true,
    priceFactor: 0.95,
    quality: 3.6,
  },
  {
    id: 'uzh-obere-mensa',
    name: 'Obere Mensa',
    institution: 'UZH',
    campusId: 'uzh-zentrum',
    address: 'Künstlergasse 10, 8001 Zürich',
    lat: 47.3753,
    lng: 8.5461,
    hours: hours({ lunch: ['11:15', '14:00'], dinner: ['17:30', '19:30'] }),
    blurb: 'Five counters with a view over the old town roofs.',
    lines: ['Street', 'Home', 'Garden', 'Vegan', 'Local'],
    popularity: 0.9,
    crowdKnown: true,
    priceFactor: 0.97,
    quality: 3.8,
  },
  {
    id: 'uzh-lichthof',
    name: 'Lichthof',
    institution: 'UZH',
    campusId: 'uzh-zentrum',
    address: 'Rämistrasse 71, Lichthof, 8006 Zürich',
    lat: 47.3745,
    lng: 8.5487,
    hours: hours({ lunch: ['11:30', '14:00'] }),
    blurb: 'Light lunches under the glass roof.',
    lines: ['Garden', 'Vegan', 'Pasta'],
    popularity: 0.6,
    crowdKnown: true,
    priceFactor: 0.95,
    quality: 3.4,
  },
  {
    id: 'uzh-irchel',
    name: 'Irchel Mensa',
    institution: 'UZH',
    campusId: 'uzh-irchel',
    address: 'Winterthurerstrasse 190, 8057 Zürich',
    lat: 47.3969,
    lng: 8.5494,
    hours: hours({ lunch: ['11:15', '14:00'], dinner: ['17:30', '19:30'], dinnerDays: MON_THU }),
    blurb: 'Big hall next to the Irchel park pond.',
    lines: ['Home', 'Street', 'Garden', 'Vegan', 'Pasta'],
    popularity: 0.9,
    crowdKnown: true,
    priceFactor: 0.95,
    quality: 3.7,
  },
  {
    id: 'raemi-59',
    name: 'Rämi 59',
    institution: 'UZH',
    campusId: 'uzh-zentrum',
    address: 'Rämistrasse 59, 8001 Zürich',
    lat: 47.3759,
    lng: 8.5487,
    hours: hours({ lunch: ['11:30', '14:00'] }),
    blurb: 'Small restaurant, grill and local cooking.',
    lines: ['Local', 'Garden', 'Grill'],
    popularity: 0.45,
    crowdKnown: false,
    priceFactor: 1.15,
    quality: 4.0,
  },
];

const SEED_BY_ID = new Map(SEEDS.map((s) => [s.id, s]));

// ───────────────────────── ratings ─────────────────────────

const sumOf = (a: number[]) => a.reduce((s, x) => s + x, 0);

function averageOf(d: number[]): number {
  const n = sumOf(d);
  if (!n) return 0;
  return Math.round((d.reduce((s, c, i) => s + c * (i + 1), 0) / n) * 100) / 100;
}

function summaryFrom(avg: number, count: number): RatingSummary {
  if (count <= 0) return { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] };
  const w = [1, 2, 3, 4, 5].map((k) => Math.exp(-((k - avg) ** 2) / (2 * 0.85 ** 2)));
  const total = sumOf(w);
  const d = w.map((x) => Math.floor((count * x) / total));
  const top = w.indexOf(Math.max(...w));
  d[top] = (d[top] ?? 0) + (count - sumOf(d));
  return {
    average: averageOf(d),
    count,
    distribution: d as RatingSummary['distribution'],
  };
}

function withExtraRating(base: RatingSummary, stars: number): RatingSummary {
  const d = [...base.distribution] as RatingSummary['distribution'];
  d[stars - 1] = (d[stars - 1] ?? 0) + 1;
  return { ...base, average: averageOf(d), count: base.count + 1, distribution: d };
}

// ───────────────────────── mock "database" overlay ─────────────────────────
// Submissions land in localStorage so they survive page navigation, which is
// what a real backend would give us. Cleared by "Reset all local data".

interface MockDB {
  crowd: CrowdReport[];
  meals: Record<string, MealRating>;
  mensas: Record<string, MensaRating>;
}

const DB_KEY = 'tablett:mockdb';

function readDB(): MockDB {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return { crowd: [], meals: {}, mensas: {}, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { crowd: [], meals: {}, mensas: {} };
}

function writeDB(db: MockDB) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* ignore */
  }
}

// ───────────────────────── dishes ─────────────────────────

interface Dish {
  line: string;
  title: string;
  sides: string[];
  diet: DietTag;
  ing: string[];
  protein: number;
  kcal: number;
  allergens: string[];
  origin?: string;
  /** student price in CHF before the mensa factor */
  base: number;
  desc: string;
  /** 1–5 */
  quality: number;
}

const CH_MEAT = 'Fleisch aus der Schweiz';
const CH_CHICKEN = 'Poulet aus der Schweiz';
const CH_PORK = 'Schweinefleisch aus der Schweiz';

const DISHES: Dish[] = [
  // Street
  { line: 'Street', title: 'Pollo frito', sides: ['Pommes Frites', 'Sriracha Mayonnaise'], diet: 'meat', ing: ['chicken', 'fries', 'sauce'], protein: 34, kcal: 820, allergens: ['Gluten', 'Eggs', 'Mustard'], origin: CH_CHICKEN, base: 8.8, desc: 'Buttermilk-marinated chicken, fried in a spiced crust until crisp.', quality: 4.2 },
  { line: 'Street', title: 'Chicken Burger', sides: ['Coleslaw', 'Kartoffelwedges'], diet: 'meat', ing: ['chicken', 'bread', 'salad', 'potato'], protein: 32, kcal: 890, allergens: ['Gluten', 'Eggs', 'Milk', 'Sesame'], origin: CH_CHICKEN, base: 8.9, desc: 'Crispy chicken fillet in a brioche bun with house sauce.', quality: 3.8 },
  { line: 'Street', title: 'Falafel Wrap', sides: ['Hummus', 'Tomatensalat'], diet: 'vegan', ing: ['falafel', 'bread', 'tomato', 'salad'], protein: 21, kcal: 710, allergens: ['Gluten', 'Sesame'], base: 7.4, desc: 'Chickpea falafel, pickled red cabbage and tahini in a warm flatbread.', quality: 4.0 },
  { line: 'Street', title: 'Currywurst', sides: ['Pommes Frites'], diet: 'meat', ing: ['sausage', 'fries', 'sauce'], protein: 24, kcal: 880, allergens: ['Mustard', 'Celery'], origin: CH_PORK, base: 8.2, desc: 'Grilled pork sausage under a smoky curry-tomato sauce.', quality: 3.3 },
  { line: 'Street', title: 'Halloumi Burger', sides: ['Süsskartoffel-Pommes', 'Chili-Mayo'], diet: 'vegetarian', ing: ['cheese', 'bread', 'fries', 'salad'], protein: 29, kcal: 860, allergens: ['Gluten', 'Milk', 'Eggs'], base: 8.5, desc: 'Grilled halloumi, roasted pepper and rocket in a sesame bun.', quality: 4.1 },
  { line: 'Street', title: 'Fish & Chips', sides: ['Remoulade', 'Erbsenpüree'], diet: 'fish', ing: ['fish', 'fries', 'greens', 'sauce'], protein: 31, kcal: 840, allergens: ['Fish', 'Gluten', 'Eggs', 'Mustard'], origin: 'Fisch aus Wildfang, Nordostatlantik', base: 9.6, desc: 'Beer-battered pollock with chunky chips and mushy peas.', quality: 3.9 },
  // Garden
  { line: 'Garden', title: 'Gemüse-Curry', sides: ['Basmatireis', 'Mango-Chutney'], diet: 'vegan', ing: ['curry', 'rice', 'carrot', 'greens'], protein: 14, kcal: 640, allergens: ['Celery'], base: 6.8, desc: 'Seasonal vegetables simmered in coconut milk and mild curry.', quality: 3.7 },
  { line: 'Garden', title: 'Spinat-Ricotta-Cannelloni', sides: ['Tomatensauce', 'Blattsalat'], diet: 'vegetarian', ing: ['pasta', 'cheese', 'tomato', 'salad'], protein: 25, kcal: 780, allergens: ['Gluten', 'Milk', 'Eggs'], base: 7.6, desc: 'Baked pasta tubes filled with spinach and ricotta, finished with Parmesan.', quality: 3.9 },
  { line: 'Garden', title: 'Linsen-Dal', sides: ['Naan', 'Joghurt-Dip'], diet: 'vegetarian', ing: ['lentils', 'bread', 'rice'], protein: 22, kcal: 690, allergens: ['Gluten', 'Milk'], base: 6.9, desc: 'Red lentils with ginger, turmeric and tomato, scooped up with warm naan.', quality: 3.8 },
  { line: 'Garden', title: 'Gnocchi alla Sorrentina', sides: ['Mozzarella', 'Basilikum'], diet: 'vegetarian', ing: ['dumpling', 'tomato', 'cheese'], protein: 20, kcal: 740, allergens: ['Gluten', 'Milk', 'Eggs'], base: 7.3, desc: 'Potato gnocchi baked in tomato sauce under melted mozzarella.', quality: 4.0 },
  { line: 'Garden', title: 'Kürbis-Risotto', sides: ['Salbei', 'Parmesan'], diet: 'vegetarian', ing: ['rice', 'carrot', 'cheese'], protein: 17, kcal: 720, allergens: ['Milk', 'Celery'], base: 7.2, desc: 'Creamy risotto with roasted pumpkin and crisp sage.', quality: 3.9 },
  { line: 'Garden', title: 'Asia-Gemüsepfanne', sides: ['Gebratener Reis', 'Sojasprossen'], diet: 'vegan', ing: ['greens', 'rice', 'carrot', 'sauce'], protein: 15, kcal: 610, allergens: ['Soy', 'Sesame', 'Gluten'], base: 6.7, desc: 'Wok-fried vegetables in a ginger and soy glaze.', quality: 3.5 },
  // Vegan
  { line: 'Vegan', title: 'Tofu Teriyaki', sides: ['Jasminreis', 'Pak Choi'], diet: 'vegan', ing: ['tofu', 'rice', 'greens', 'sauce'], protein: 27, kcal: 680, allergens: ['Soy', 'Sesame', 'Gluten'], base: 7.5, desc: 'Pan-seared tofu glazed with sweet soy and sesame.', quality: 4.0 },
  { line: 'Vegan', title: 'Chili sin Carne', sides: ['Reis', 'Guacamole'], diet: 'vegan', ing: ['lentils', 'rice', 'tomato', 'greens'], protein: 23, kcal: 710, allergens: [], base: 6.9, desc: 'Kidney beans, corn and peppers in a smoky tomato chilli.', quality: 3.8 },
  { line: 'Vegan', title: 'Kichererbsen-Tajine', sides: ['Couscous', 'Karotten'], diet: 'vegan', ing: ['curry', 'rice', 'carrot'], protein: 19, kcal: 660, allergens: ['Gluten'], base: 6.9, desc: 'Chickpeas and apricots slow-cooked with cumin and cinnamon.', quality: 3.6 },
  { line: 'Vegan', title: 'Linsenbolognese', sides: ['Vollkornspaghetti'], diet: 'vegan', ing: ['lentils', 'pasta', 'tomato'], protein: 28, kcal: 750, allergens: ['Gluten', 'Celery'], base: 6.8, desc: 'Brown lentils in a slow-cooked tomato and carrot ragù.', quality: 3.9 },
  { line: 'Vegan', title: 'Buddha Bowl', sides: ['Süsskartoffel', 'Edamame', 'Tahini-Dressing'], diet: 'vegan', ing: ['potato', 'greens', 'carrot', 'tofu'], protein: 24, kcal: 620, allergens: ['Soy', 'Sesame'], base: 8.2, desc: 'Roasted sweet potato, marinated tofu, edamame and crunchy greens.', quality: 4.2 },
  { line: 'Vegan', title: 'Seitan-Geschnetzeltes', sides: ['Rösti', 'Hafer-Rahmsauce'], diet: 'vegan', ing: ['tofu', 'potato', 'sauce', 'mushroom'], protein: 36, kcal: 830, allergens: ['Gluten', 'Oats'], base: 8.4, desc: 'Zurich-style strips of seitan with mushrooms and a creamy oat sauce.', quality: 3.7 },
  // Home
  { line: 'Home', title: 'Schweinsgeschnetzeltes an Rahmsauce', sides: ['Spätzli', 'Buntes Gemüse'], diet: 'meat', ing: ['steak', 'sauce', 'dumpling', 'carrot'], protein: 38, kcal: 870, allergens: ['Gluten', 'Milk', 'Eggs', 'Celery'], origin: CH_PORK, base: 9.2, desc: 'Sliced pork in a mustard cream sauce with buttered Spätzli.', quality: 3.8 },
  { line: 'Home', title: 'Rindsgulasch', sides: ['Polenta', 'Rotkraut'], diet: 'meat', ing: ['steak', 'sauce', 'potato', 'salad'], protein: 35, kcal: 800, allergens: ['Celery'], origin: CH_MEAT, base: 9.4, desc: 'Paprika beef stew, braised for three hours.', quality: 3.9 },
  { line: 'Home', title: 'Hackbraten', sides: ['Kartoffelstock', 'Jus', 'Erbsli und Rüebli'], diet: 'meat', ing: ['cutlet', 'potato', 'carrot', 'greens'], protein: 30, kcal: 910, allergens: ['Gluten', 'Eggs', 'Milk', 'Celery'], origin: CH_MEAT, base: 8.6, desc: 'Oven-baked meatloaf with mashed potato and peas and carrots.', quality: 3.4 },
  { line: 'Home', title: 'Paniertes Schweinsschnitzel', sides: ['Pommes Frites', 'Zitrone', 'Preiselbeeren'], diet: 'meat', ing: ['cutlet', 'fries', 'salad'], protein: 36, kcal: 940, allergens: ['Gluten', 'Eggs'], origin: CH_PORK, base: 9.6, desc: 'Golden breaded pork schnitzel, served with lemon and cranberries.', quality: 4.0 },
  { line: 'Home', title: 'Älplermagronen', sides: ['Apfelmus', 'Röstzwiebeln'], diet: 'vegetarian', ing: ['pasta', 'potato', 'cheese'], protein: 22, kcal: 850, allergens: ['Gluten', 'Milk'], base: 7.4, desc: 'Alpine macaroni with potatoes, cheese and cream, topped with fried onions.', quality: 4.1 },
  { line: 'Home', title: 'Kartoffel-Lauch-Gratin', sides: ['Saisonsalat'], diet: 'vegetarian', ing: ['potato', 'cheese', 'salad'], protein: 16, kcal: 700, allergens: ['Milk'], base: 7.0, desc: 'Layered potatoes and leek baked with cream and Gruyère.', quality: 3.6 },
  { line: 'Home', title: 'Lachsfilet', sides: ['Dillsauce', 'Salzkartoffeln', 'Broccoli'], diet: 'fish', ing: ['fish', 'potato', 'greens', 'sauce'], protein: 33, kcal: 760, allergens: ['Fish', 'Milk'], origin: 'Lachs aus Zucht, Norwegen (ASC)', base: 11.2, desc: 'Oven-baked salmon fillet with a light dill sauce.', quality: 4.1 },
  // Local
  { line: 'Local', title: 'Zürcher Geschnetzeltes', sides: ['Rösti', 'Saisongemüse'], diet: 'meat', ing: ['steak', 'sauce', 'potato', 'mushroom'], protein: 37, kcal: 920, allergens: ['Milk', 'Celery'], origin: 'Kalbfleisch aus der Schweiz', base: 10.8, desc: 'Veal strips in a white wine and mushroom cream sauce.', quality: 4.2 },
  { line: 'Local', title: 'Cordon bleu', sides: ['Pommes Frites', 'Gemüse'], diet: 'meat', ing: ['cutlet', 'fries', 'greens'], protein: 39, kcal: 990, allergens: ['Gluten', 'Eggs', 'Milk'], origin: CH_PORK, base: 10.2, desc: 'Breaded pork stuffed with ham and Swiss cheese.', quality: 4.0 },
  { line: 'Local', title: 'Bratwurst', sides: ['Zwiebelsauce', 'Rösti', 'Bohnen'], diet: 'meat', ing: ['sausage', 'potato', 'sauce', 'greens'], protein: 27, kcal: 880, allergens: ['Gluten', 'Celery', 'Mustard'], origin: CH_MEAT, base: 8.9, desc: 'Grilled veal bratwurst with onion gravy.', quality: 3.9 },
  { line: 'Local', title: 'Rösti', sides: ['Spiegelei', 'Bergkäse', 'Saisonsalat'], diet: 'vegetarian', ing: ['potato', 'egg', 'cheese', 'salad'], protein: 21, kcal: 790, allergens: ['Eggs', 'Milk'], base: 7.8, desc: 'Crisp potato rösti, a fried egg and melted mountain cheese.', quality: 4.1 },
  { line: 'Local', title: 'Capuns', sides: ['Bergkäse', 'Salatteller'], diet: 'vegetarian', ing: ['greens', 'cheese', 'dumpling'], protein: 18, kcal: 730, allergens: ['Gluten', 'Milk', 'Eggs'], base: 7.9, desc: 'Swiss chard parcels filled with Spätzli dough, baked with cheese.', quality: 3.6 },
  { line: 'Local', title: 'Chäschüechli', sides: ['Saisonsalat'], diet: 'vegetarian', ing: ['cheese', 'bread', 'salad'], protein: 19, kcal: 760, allergens: ['Gluten', 'Milk', 'Eggs'], base: 7.1, desc: 'Cheese tart with a buttery crust and a crisp side salad.', quality: 3.5 },
  // Pasta
  { line: 'Pasta', title: "Penne all'arrabbiata", sides: ['Basilikum', 'Olivenöl'], diet: 'vegan', ing: ['pasta', 'tomato'], protein: 16, kcal: 680, allergens: ['Gluten'], base: 6.5, desc: 'Penne in a fiery tomato and garlic sauce.', quality: 3.4 },
  { line: 'Pasta', title: 'Tagliatelle al salmone', sides: ['Zitrone', 'Rucola'], diet: 'fish', ing: ['pasta', 'fish', 'greens'], protein: 30, kcal: 810, allergens: ['Gluten', 'Fish', 'Milk', 'Eggs'], origin: 'Lachs aus Zucht, Norwegen (ASC)', base: 9.2, desc: 'Fresh ribbon pasta with smoked salmon in a lemon cream.', quality: 3.8 },
  { line: 'Pasta', title: 'Spaghetti Carbonara', sides: ['Pecorino'], diet: 'meat', ing: ['pasta', 'egg', 'cheese'], protein: 28, kcal: 860, allergens: ['Gluten', 'Eggs', 'Milk'], origin: CH_PORK, base: 8.3, desc: 'Spaghetti with egg yolk, pecorino and crisp smoked pork.', quality: 3.9 },
  { line: 'Pasta', title: 'Pizokel', sides: ['Spinat', 'Bergkäse'], diet: 'vegetarian', ing: ['dumpling', 'greens', 'cheese'], protein: 21, kcal: 780, allergens: ['Gluten', 'Eggs', 'Milk'], base: 7.6, desc: 'Buckwheat dumplings from Graubünden tossed with spinach and cheese.', quality: 3.6 },
  // Grill
  { line: 'Grill', title: 'Rindsentrecôte', sides: ['Café-de-Paris-Butter', 'Pommes Frites', 'Grillgemüse'], diet: 'meat', ing: ['steak', 'fries', 'greens', 'carrot'], protein: 46, kcal: 1010, allergens: ['Milk', 'Mustard'], origin: CH_MEAT, base: 14.8, desc: 'Grilled beef entrecôte, medium, with herb butter.', quality: 4.4 },
  { line: 'Grill', title: 'Grillpoulet', sides: ['Kräuterbutter', 'Reis', 'Gemüse'], diet: 'meat', ing: ['chicken', 'rice', 'carrot', 'greens'], protein: 41, kcal: 790, allergens: ['Milk'], origin: CH_CHICKEN, base: 10.6, desc: 'Half a roast chicken with lemon and thyme.', quality: 4.0 },
  { line: 'Grill', title: 'Gegrillter Halloumi', sides: ['Couscous', 'Tomaten-Salsa'], diet: 'vegetarian', ing: ['cheese', 'rice', 'tomato', 'greens'], protein: 26, kcal: 740, allergens: ['Gluten', 'Milk'], base: 9.3, desc: 'Charred halloumi on herb couscous with a fresh tomato salsa.', quality: 4.0 },
  { line: 'Grill', title: 'Eglifilet', sides: ['Zitronenbutter', 'Reis', 'Gemüse'], diet: 'fish', ing: ['fish', 'rice', 'carrot', 'greens'], protein: 34, kcal: 720, allergens: ['Fish', 'Milk'], origin: 'Egli aus dem Zürichsee', base: 13.6, desc: 'Pan-fried perch fillets with lemon butter.', quality: 4.3 },
];

const DISHES_BY_LINE = new Map<string, Dish[]>();
for (const d of DISHES) DISHES_BY_LINE.set(d.line, [...(DISHES_BY_LINE.get(d.line) ?? []), d]);

const round5 = (x: number) => Math.round(x * 20) / 20;

function pricesFor(base: number, factor: number): PriceSet {
  const student = round5(base * factor);
  return { student, staff: round5(student * 1.32), external: round5(student * 1.72) };
}

// ───────────────────────── meal generation ─────────────────────────

function mealId(mensaId: string, day: Weekday, service: Service, n: number) {
  return `${mensaId}.${day}.${service}.${n}`;
}

export function parseMealId(id: string): { mensaId: string; day: Weekday; service: Service; n: number } | null {
  const [mensaId, day, service, n] = id.split('.');
  if (!mensaId || !day || !service || n === undefined) return null;
  if (!WEEKDAYS.includes(day as Weekday) || (service !== 'lunch' && service !== 'dinner')) return null;
  return { mensaId, day: day as Weekday, service, n: Number(n) };
}

function buildMeal(seed: MensaSeed, dish: Dish, date: string, day: Weekday, service: Service, n: number): Meal {
  const id = mealId(seed.id, day, service, n);
  const r = rng(`meal|${id}|${date}`);
  const jitter = (v: number) => Math.round(v * (0.94 + r() * 0.12));

  // ~80% of meals carry nutrition, the rest do not on purpose (scraper reality).
  const roll = hash(`nutri|${id}|${date}`) % 100;
  const protein = jitter(dish.protein);
  const kcal = Math.round(jitter(dish.kcal) / 10) * 10;
  const nutrition =
    roll < 78
      ? { proteinG: protein, kcal, carbsG: Math.round((kcal * 0.42) / 4), fatG: Math.round((kcal * 0.34) / 9) }
      : roll < 82
        ? { kcal }
        : undefined;

  const counts = [0, 0, 3, 5, 9, 14, 22, 36, 58, 91];
  const count = pick(counts, r());
  const avg = Math.min(4.9, Math.max(2.2, dish.quality + (r() - 0.5) * 0.7));

  return {
    id,
    mensaId: seed.id,
    date,
    service,
    line: dish.line,
    title: dish.title,
    sides: dish.sides,
    description: dish.desc,
    dietTag: dish.diet,
    ingredients: dish.ing,
    price: pricesFor(dish.base, seed.priceFactor),
    allergens: dish.allergens,
    origin: dish.origin,
    nutrition,
    rating: summaryFrom(avg, count),
  };
}

function mealsFor(seed: MensaSeed, dateISO: string, service: Service): Meal[] {
  const day = weekdayOf(parseISODate(dateISO));
  if (!seed.hours[day].some((h) => h.service === service)) return [];
  const r = rng(`menu|${seed.id}|${dateISO}|${service}`);
  const want = service === 'lunch' ? Math.min(5, Math.max(3, seed.lines.length)) : Math.min(3, seed.lines.length);
  const lines = shuffle(seed.lines, r);
  const chosen: Dish[] = [];
  for (let i = 0; i < want; i++) {
    const line = lines[i % lines.length] as string;
    const pool = (DISHES_BY_LINE.get(line) ?? []).filter((d) => !chosen.includes(d));
    if (pool.length) chosen.push(pick(pool, r()));
  }
  // Always keep at least one vegetarian-friendly option on the board.
  if (!chosen.some((d) => d.diet === 'vegan' || d.diet === 'vegetarian') && chosen.length) {
    const veg = DISHES.filter((d) => seed.lines.includes(d.line) && d.diet !== 'meat' && d.diet !== 'fish');
    if (veg.length) chosen[chosen.length - 1] = pick(veg, r());
  }
  const order = ['Street', 'Garden', 'Home', 'Local', 'Pasta', 'Grill', 'Vegan'];
  chosen.sort((a, b) => order.indexOf(a.line) - order.indexOf(b.line));
  return chosen.map((d, n) => buildMeal(seed, d, dateISO, day, service, n));
}

// ───────────────────────── reviews ─────────────────────────

const REVIEWS: Array<[number, string]> = [
  [5, 'Crispy outside, juicy inside. Worth the queue.'],
  [5, 'Best thing on the board this week, honestly.'],
  [4, 'Solid portion, well seasoned. Would eat again.'],
  [4, 'Good value for the price, finished everything.'],
  [4, 'Tasty, though the sides were a bit plain.'],
  [3, 'Fine for a Tuesday. Nothing special.'],
  [3, 'Decent, but the sauce was thin.'],
  [3, 'Okay. Portion could be bigger for the price.'],
  [2, 'Arrived lukewarm and a bit dry.'],
  [2, 'Too salty for me, left half of it.'],
  [5, 'Surprisingly good! Vegetables still had bite.'],
  [4, 'Filling enough to skip dinner. Happy with it.'],
  [1, 'Cold in the middle, would not order again.'],
  [4, 'Nice flavours, a little heavy before a lecture.'],
  [5, 'Exactly what I needed after the exam.'],
  [3, 'Queue was longer than the dish deserved.'],
];
const AUTHORS = ['ETH student', 'UZH student', 'PhD student', 'Staff', 'Visiting researcher', 'Master student'];

function reviewsFor(meal: Meal): MealReview[] {
  if (meal.rating.count < 5) return [];
  const r = rng(`reviews|${meal.id}`);
  const n = 3 + Math.floor(r() * 4);
  const out: MealReview[] = [];
  const pool = shuffle(REVIEWS, r);
  const base = parseISODate(meal.date);
  for (let i = 0; i < Math.min(n, pool.length); i++) {
    const [stars, text] = pool[i] as [number, string];
    const d = new Date(base);
    d.setDate(d.getDate() - Math.floor(r() * 12));
    out.push({
      id: `${meal.id}.r${i}`,
      mealId: meal.id,
      stars: stars as MealReview['stars'],
      text,
      author: pick(AUTHORS, r()),
      date: isoDate(d),
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ───────────────────────── crowd ─────────────────────────

function openHour(m: MensaSeed, day: Weekday, h: number): boolean {
  return m.hours[day].some((s) => h * 60 + 60 > hhmmToMin(s.open) && h * 60 < hhmmToMin(s.close));
}

const DAY_FACTOR: Record<Weekday, number> = { mon: 0.95, tue: 1, wed: 1, thu: 0.93, fri: 0.72, sat: 0.4, sun: 0 };

/** Lunch rush peaking 12:00–12:30, softer dinner bump around 18:15. */
function crowdPct(m: MensaSeed, day: Weekday, h: number): number {
  if (!openHour(m, day, h)) return 0;
  const t = h + 0.5;
  const lunch = Math.exp(-(((t - 12.25) / (t < 12.25 ? 0.9 : 1.1)) ** 2));
  const hasDinner = m.hours[day].some((s) => s.service === 'dinner');
  const dinner = hasDinner ? 0.5 * Math.exp(-(((t - 18.4) / 0.75) ** 2)) : 0;
  const noise = (rng(`crowd|${m.id}|${day}|${h}`)() - 0.5) * 10;
  const v = 100 * m.popularity * DAY_FACTOR[day] * (lunch + dinner) + noise;
  return Math.max(openHour(m, day, h) ? 4 : 0, Math.min(100, Math.round(v)));
}

function histogramFor(m: MensaSeed) {
  if (!m.crowdKnown) return { mensaId: m.id, sufficient: false, sampleSize: 6 + (hash(m.id) % 9) };
  const byWeekday = {} as Record<Weekday, number[]>;
  for (const d of WEEKDAYS) byWeekday[d] = Array.from({ length: 24 }, (_, h) => crowdPct(m, d, h));
  return { mensaId: m.id, sufficient: true, sampleSize: 300 + (hash(m.id) % 700), byWeekday };
}

// ───────────────────────── public (sync) mock API ─────────────────────────

function mensaRating(seed: MensaSeed): RatingSummary {
  const r = rng(`mensa-rating|${seed.id}`);
  const count = 140 + Math.floor(r() * 900);
  const s = summaryFrom(seed.quality, count);
  const aspect = () => Math.round(Math.min(5, Math.max(2.4, seed.quality + (r() - 0.5) * 1.2)) * 10) / 10;
  const aspects: Partial<Record<MensaAspect, number>> = { food: aspect(), queue: aspect() - 0.3, seating: aspect(), value: aspect() };
  aspects.queue = Math.round((aspects.queue ?? 3) * 10) / 10;
  return { ...s, aspects };
}

function toMensa(seed: MensaSeed): Mensa {
  let rating = mensaRating(seed);
  const mine = readDB().mensas[seed.id];
  if (mine) rating = { ...withExtraRating(rating, mine.stars), aspects: rating.aspects };
  return {
    id: seed.id,
    name: seed.name,
    institution: seed.institution,
    campusId: seed.campusId,
    address: seed.address,
    coordinates: { lat: seed.lat, lng: seed.lng },
    hours: seed.hours,
    blurb: seed.blurb,
    rating,
  };
}

function overlayMealRating(meal: Meal): Meal {
  const mine = readDB().meals[meal.id];
  return mine ? { ...meal, rating: withExtraRating(meal.rating, mine.stars) } : meal;
}

export function mockMensas(): Mensa[] {
  return SEEDS.map(toMensa);
}

export function mockMenu(mensaId: string, dateISO: string): Meal[] {
  const seed = SEED_BY_ID.get(mensaId);
  if (!seed) throw new Error(`Unknown mensa "${mensaId}"`);
  return [...mealsFor(seed, dateISO, 'lunch'), ...mealsFor(seed, dateISO, 'dinner')].map(overlayMealRating);
}

export function mockMeal(id: string): MealDetail {
  const p = parseMealId(id);
  const seed = p && SEED_BY_ID.get(p.mensaId);
  if (!p || !seed) throw new Error(`Unknown meal "${id}"`);
  const date = isoDate(dateOfWeekday(getNow(), p.day));
  const meal = mealsFor(seed, date, p.service)[p.n];
  if (!meal) throw new Error(`Unknown meal "${id}"`);
  const full = overlayMealRating(meal);
  return { ...full, reviews: reviewsFor(meal) };
}

/** All meal ids across the week. Used by getStaticPaths for /meal/[id]. */
export function allMealIds(): string[] {
  const ids: string[] = [];
  for (const s of SEEDS)
    for (const day of WEEKDAYS)
      for (const service of ['lunch', 'dinner'] as Service[])
        if (s.hours[day].some((h) => h.service === service))
          for (let n = 0; n < 5; n++) ids.push(mealId(s.id, day, service, n));
  return ids;
}

export function allMensaIds(): string[] {
  return SEEDS.map((s) => s.id);
}

export function mockCrowd(mensaId: string): CrowdInfo {
  const seed = SEED_BY_ID.get(mensaId);
  if (!seed) throw new Error(`Unknown mensa "${mensaId}"`);
  const histogram = histogramFor(seed);
  const now = getNow();
  const live: CrowdReport[] = [];

  // Seeded "other students" reports, only where we know the pattern and it is open.
  if (histogram.sufficient && histogram.byWeekday && openHour(seed, weekdayOf(now), now.getHours())) {
    const pct = histogram.byWeekday[weekdayOf(now)][now.getHours()] ?? 0;
    const base = levelFromPct(pct);
    const r = rng(`live|${mensaId}|${isoDate(now)}|${now.getHours()}`);
    for (const minutesAgo of [5, 13, 21]) {
      if (r() < 0.25) continue;
      const level = Math.min(5, Math.max(1, base + (r() < 0.3 ? -1 : r() < 0.6 ? 0 : 1))) as CrowdLevel;
      live.push({ mensaId, level, timestamp: new Date(now.getTime() - minutesAgo * 60000).toISOString() });
    }
  }

  const mine = readDB().crowd.filter((c) => c.mensaId === mensaId);
  const cutoff = now.getTime() - 30 * 60000;
  const merged = [...mine, ...live]
    .filter((c) => new Date(c.timestamp).getTime() >= cutoff)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return { histogram, live: merged };
}

export function mockSubmitCrowdReport(report: CrowdReport): void {
  const db = readDB();
  db.crowd = [report, ...db.crowd].slice(0, 200);
  writeDB(db);
}

export function mockSubmitMealRating(rating: MealRating): void {
  const db = readDB();
  db.meals[rating.mealId] = rating;
  writeDB(db);
}

export function mockSubmitMensaRating(rating: MensaRating): void {
  const db = readDB();
  db.mensas[rating.mensaId] = rating;
  writeDB(db);
}
