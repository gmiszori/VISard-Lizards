import { MEALS } from './canteens';
import { foldPlain } from '../search/fold';

export const CUISINE_CATEGORIES = [
  'Swiss', 'Italian', 'Mexican', 'Chinese', 'Japanese', 'Korean', 'Indian', 'Thai', 'Vietnamese',
  'Middle Eastern', 'Mediterranean', 'French', 'German/Austrian', 'Spanish', 'American', 'Other / International',
] as const;

export type CuisineCategory = typeof CUISINE_CATEGORIES[number];

const RULES: Array<{ category: CuisineCategory; patterns: RegExp[] }> = [
  { category: 'Mexican', patterns: [/\b(mexican|mexikanisch|taco|tacos|burrito|burritos|enchilada|enchiladas|quesadilla|quesadillas|nachos|fajita|fajitas|guacamole|pico de gallo|chili con carne|chilli con carne|tortilla chips|tex mex)\b/] },
  { category: 'Japanese', patterns: [/\b(japanese|japanisch|sushi|maki|nigiri|ramen|udon|soba|tempura|teriyaki|yakitori|miso soup|tonkatsu|onigiri)\b/] },
  { category: 'Korean', patterns: [/\b(korean|koreanisch|kimchi|bulgogi|bibimbap|gochujang|tteokbokki|korean fried chicken|dakgangjeong)\b/] },
  { category: 'Chinese', patterns: [/\b(chinese|chinesisch|dim sum|wonton|wun tun|chow mein|fried rice|szechuan|sichuan|peking|kung pao|hoisin|char siu|bao bun|spring roll|sweet and sour)\b/] },
  { category: 'Vietnamese', patterns: [/\b(pho|banh mi|bun cha|goi cuon|vietnamese|vietnamesisch)\b/] },
  { category: 'Thai', patterns: [/\b(pad thai|tom kha|tom yum|thai|thailaendisch|thailand|green curry|red curry|massaman)\b/] },
  { category: 'Indian', patterns: [/\b(indian|indisch|tikka masala|tandoori|vindaloo|biryani|naan|dal|dhal|paneer|samosa|pakora|korma|madras|chutney|garam masala)\b/] },
  { category: 'Middle Eastern', patterns: [/\b(middle eastern|arabic|falafel|hummus|houmous|shawarma|shish kebab|kebab|kofta|tabbouleh|couscous|harissa|shakshuka|labneh|zaatar|za'atar|oriental)\b/] },
  { category: 'Italian', patterns: [/\b(pasta|risotto|pizza|lasagna|lasagne|gnocchi|ravioli|tortellini|pesto|carbonara|bolognese|parmigiana|osso buco|bruschetta|focaccia|polenta|italian|italienisch)\b/] },
  { category: 'Swiss', patterns: [/\b(rosti|rösti|alplermagronen|älplermagronen|zurcher geschnetzeltes|zuricher geschnetzeltes|geschnetzeltes|raclette|fondue|cervelat|birchermuesli|birchermüsli|papet vaudois|bundner|bündner|swiss|schweizerisch)\b/] },
  { category: 'German/Austrian', patterns: [/\b(schnitzel|wiener|spaetzle|spätzle|sauerkraut|currywurst|pretzel|brezel|apfelstrudel|kaiserschmarrn|goulash|gulasch|german|austrian|deutsch|osterreichisch)\b/] },
  { category: 'French', patterns: [/\b(french|franzosisch|quiche|ratatouille|croque monsieur|croque madame|coq au vin|bouillabaisse|creme brulee|creme caramel|crepe|crepes|gratin dauphinois)\b/] },
  { category: 'Spanish', patterns: [/\b(spanish|spanisch|paella|tapas|gazpacho|patatas bravas|chorizo|tortilla espanola)\b/] },
  { category: 'Mediterranean', patterns: [/\b(mediterranean|mediterran|greek|griechisch|moussaka|tzatziki|halloumi|feta|dolma|spanakopita)\b/] },
  { category: 'American', patterns: [/\b(burger|cheeseburger|hamburger|hot dog|pulled pork|barbecue|bbq|mac and cheese|buffalo wings|coleslaw|american|usa style)\b/] },
];

/** Assigns a primary cuisine from explicit dish names and ingredients; uncertain dishes stay International. */
export function classifyCuisine(title: string, components = ''): CuisineCategory {
  const text = foldPlain(`${title} ${components}`);
  return RULES.find(rule => rule.patterns.some(pattern => pattern.test(text)))?.category ?? 'Other / International';
}

const CUISINE_ALIASES: Record<CuisineCategory, string> = {
  Swiss: 'Swiss Suisse Schweiz Schweizerische Küche',
  Italian: 'Italian Italy Italien italienische Küche',
  Mexican: 'Mexican Mexico Mexikanisch Mexikanische Küche Mexican food',
  Chinese: 'Chinese China Chinesisch Chinesische Küche',
  Japanese: 'Japanese Japan Japanisch Japanische Küche',
  Korean: 'Korean Korea Koreanisch Koreanische Küche',
  Indian: 'Indian India Indisch Indische Küche',
  Thai: 'Thai Thailand Thailändisch Thailändische Küche',
  Vietnamese: 'Vietnamese Vietnam Vietnamesisch Vietnamesische Küche',
  'Middle Eastern': 'Middle Eastern Arabic Levantine Oriental Nahost Nahöstlich',
  Mediterranean: 'Mediterranean Mittelmeer Mediterran Greek Greek cuisine',
  French: 'French France Französisch Französische Küche',
  'German/Austrian': 'German German Austrian Austria Deutsch Österreichisch Deutsche Küche',
  Spanish: 'Spanish Spain Spanisch Spanische Küche',
  American: 'American USA United States Amerikanisch Amerikanische Küche',
  'Other / International': 'International Other',
};

export function cuisineSearchText(category: CuisineCategory): string {
  return `${category} ${CUISINE_ALIASES[category]}`;
}

/** A derived category for every dish in the bundled generated database. */
export const MEAL_CUISINE: ReadonlyMap<string, CuisineCategory> = new Map(
  MEALS.map(meal => [meal.id, classifyCuisine(meal.title, meal.components.join(' '))] as const),
);

export function cuisineForDish(id: string, title: string, components = ''): CuisineCategory {
  return MEAL_CUISINE.get(id) ?? classifyCuisine(title, components);
}
