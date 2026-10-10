import { getPositionFix } from '../location/geolocation';
import { MealRouteMap } from './map';

const form = document.querySelector<HTMLFormElement>('#route-form')!;
const input = (id: string) => document.querySelector<HTMLInputElement>(`#${id}`)!;
const status = document.querySelector<HTMLElement>('#planner-status')!;
const results = document.querySelector<HTMLElement>('#route-results')!;
const button = document.querySelector<HTMLButtonElement>('#plan-button')!;
const section = document.querySelector<HTMLElement>('.planner-results')!;
function selectCard(index: number) {
  results.querySelectorAll<HTMLElement>('.route-option').forEach((card, i) => {
    card.classList.toggle('is-selected', i === index);
    card.querySelector('button')?.setAttribute('aria-pressed', String(i === index));
  });
}
const routeMap = new MealRouteMap(selectCard);
void routeMap.start();
const localTime = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const initialDeparture = new Date(Date.now() + 5 * 60_000);
if (initialDeparture.getHours() >= 14 || initialDeparture.getHours() < 8) {
  if (initialDeparture.getHours() >= 14) initialDeparture.setDate(initialDeparture.getDate() + 1);
  initialDeparture.setHours(11, 0, 0, 0);
}
input('departure').value = localTime(initialDeparture);
input('arrival').value = localTime(new Date(initialDeparture.getTime() + 3 * 60 * 60_000));
document.querySelector('#time-zone')!.textContent = `Input times use your device timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Results use Europe/Zurich.`;
fetch('/api/route-planner/status', { cache: 'no-store' }).then(async response => {
  if (!response.ok) throw new Error();
  const readiness = await response.json();
  document.querySelector('#planner-readiness')!.textContent = readiness.ready ? 'Routing MCP connected · Public transport + walking' : 'Routing MCP is unavailable. Start the route-planner service.';
  button.disabled = !readiness.ready;
}).catch(() => { document.querySelector('#planner-readiness')!.textContent = 'Could not reach the route planner backend.'; });
document.querySelector('#use-location')!.addEventListener('click', async () => {
  status.textContent = 'Requesting your location…';
  try { const fix = await getPositionFix(); input('origin').value = `${fix.lat},${fix.lng}`; routeMap.locate(fix); status.textContent = 'Starting point set to your current location.'; }
  catch { status.textContent = 'Location unavailable. Please enter your starting point instead.'; }
});
type Leg = { departure: string; arrival: string; distanceMetres: number; directions: string[]; mapsUrl: string; provider?: { warnings?: string[]; polyline?: string } };
type Meal = { id: string; title: string; components: string[]; price?: { student?: number; staff?: number; external?: number } };
type Place = { id: string; name: string; kind: string; sourceUrl: string; websiteUrl?: string; menuNote: string; hoursNote?: string; meals: Meal[]; attributions?: { provider: string; providerUri: string }[] };
type Option = { place: Place; mealStart: string; mealEnd: string; arrival: string; spareMinutes: number; extraMinutes: number; outbound: Leg; onward: Leg };
type Plan = { baseline: Leg; options: Option[]; checkedStops: number; mealMinutes: number; warnings: string[] };
const time = (value: string) => new Intl.DateTimeFormat(undefined, { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(new Date(value));
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '') { const el = document.createElement(tag); el.textContent = text; return el; }
function link(label: string, url: string) {
  const anchor = element('a', label);
  try { const parsed = new URL(url); if (parsed.protocol !== 'https:') return element('span', label); anchor.href = parsed.href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
  catch { return element('span', label); }
  return anchor;
}
function legDetails(label: string, leg: Leg) {
  const details = element('details'); details.append(element('summary', `${label}: ${time(leg.departure)} → ${time(leg.arrival)}`));
  const list = element('ol'); leg.directions.forEach(step => list.append(element('li', step))); details.append(list);
  for (const warning of leg.provider?.warnings ?? []) details.append(element('p', warning));
  details.append(link('Open this leg in Google Maps ↗', leg.mapsUrl)); return details;
}
function render(plan: Plan, explanation: string) {
  results.replaceChildren(); results.append(element('p', explanation));
  results.append(element('p', `${plan.checkedStops} stops checked · Direct route arrival ${time(plan.baseline.arrival)} · ${plan.mealMinutes}-minute meal break`));
  plan.options.forEach((option, index) => {
    const card = element('article'); card.className = 'route-option';
    const show = element('button', `Show option ${index + 1} on map`); show.type = 'button'; show.className = 'show-route';
    show.addEventListener('click', () => { routeMap.select(index); selectCard(index); document.querySelector('#route-map-panel')!.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    card.append(show);
    card.append(element('p', index === 0 ? 'Earliest verified arrival' : 'Another option'), element('h3', option.place.name));
    card.append(element('p', `Eat ${time(option.mealStart)}–${time(option.mealEnd)}. Arrive ${time(option.arrival)}, ${option.spareMinutes} minutes before your deadline.`));
    card.append(element('p', `${option.extraMinutes} extra minutes compared with the direct journey, including your meal and waiting.`));
    option.place.meals.forEach(meal => {
      const prices = Object.entries(meal.price ?? {}).filter(([, price]) => price != null).map(([group, price]) => `${group}: CHF ${price}`).join(' · ');
      card.append(element('p', `${meal.title}${meal.components.length ? ' — ' + meal.components.join(', ') : ''}${prices ? ' · ' + prices : ''}`));
    });
    card.append(element('p', option.place.menuNote));
    if (option.place.hoursNote) card.append(element('p', option.place.hoursNote));
    if (option.place.sourceUrl) card.append(link('Source ↗', option.place.sourceUrl));
    if (option.place.websiteUrl) card.append(element('span', ' · '), link('Restaurant website ↗', option.place.websiteUrl));
    for (const attribution of option.place.attributions ?? []) card.append(element('p', attribution.provider), link('Data source', attribution.providerUri));
    card.append(legDetails('To your meal stop', option.outbound), legDetails('To your destination', option.onward)); results.append(card);
  });
  const warnings = element('ul'); plan.warnings.forEach(warning => warnings.append(element('li', warning))); results.append(warnings);
  results.append(element('p', 'Route and restaurant information: Google Maps. Cafeteria menus: UniEats database.'));
  const raw = element('details'); raw.append(element('summary', 'View MCP tool result'), element('pre', JSON.stringify(plan, null, 2))); results.append(raw);
  routeMap.setPlan(plan); selectCard(plan.options.length ? 0 : -1);
}
form.addEventListener('submit', async event => {
  event.preventDefault(); if (button.disabled) return;
  const departure = new Date(input('departure').value); const arrival = new Date(input('arrival').value);
  if (!(departure.getTime() < arrival.getTime())) { status.textContent = 'Arrival must be after departure.'; return; }
  const key = input('openai-key').value.trim(); input('openai-key').value = '';
  button.disabled = true; section.setAttribute('aria-busy', 'true'); results.replaceChildren(); routeMap.reset();
  const started = Date.now();
  const timer = window.setInterval(() => { status.textContent = `Planning with AI and MCP: checking restaurants, opening hours and travel legs… ${Math.floor((Date.now() - started) / 1000)}s`; }, 1000);
  status.textContent = 'Starting AI and MCP route planning…';
  try {
    const response = await fetch('/api/route-planner/plan', { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(300_000),
      headers: { 'Content-Type': 'application/json', 'X-OpenAI-Key': key }, body: JSON.stringify({ origin: input('origin').value.trim(), destination: input('destination').value.trim(), departureTime: departure.toISOString(), arrivalTime: arrival.toISOString(), mealMinutes: Number(input('meal-minutes').value) }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.detail ?? 'Route planning failed. Check backend configuration.');
    render(data.plan, data.explanation); status.textContent = `Finished in ${Math.round((Date.now() - started) / 1000)} seconds.`;
  } catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not plan the journey.'; }
  finally { clearInterval(timer); button.disabled = false; section.setAttribute('aria-busy', 'false'); }
});
