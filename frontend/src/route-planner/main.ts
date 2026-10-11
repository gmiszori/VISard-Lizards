import { getPositionFix } from '../location/geolocation';
import { MealRouteMap, selectedOption } from './map';
import { attachLocationSuggestions } from './locations';
import { journeyTimeline, mealBreak, type JourneyLeg } from './journey';
import { attachCalendar } from './calendar';
import { attachMealRange } from './meal-range';
import { mealMenu } from './menus';
import { journeyTiming, type JourneyTiming } from './timing';

const form = document.querySelector<HTMLFormElement>('#route-form')!;
const input = (id: string) => document.querySelector<HTMLInputElement>(`#${id}`)!;
const originLocation = attachLocationSuggestions(input('origin'));
const destinationLocation = attachLocationSuggestions(input('destination'));
const status = document.querySelector<HTMLElement>('#planner-status')!;
const results = document.querySelector<HTMLElement>('#route-results')!;
const button = document.querySelector<HTMLButtonElement>('#plan-button')!;
const section = document.querySelector<HTMLElement>('.planner-results')!;
let menuLoaders:{load:()=>void}[]=[];
function selectCard(index: number) {
  if(index===-2) menuLoaders.forEach(menu=>menu.load());else if(index>=0) menuLoaders[index]?.load();
  results.querySelectorAll<HTMLElement>('.route-option').forEach((card, i) => {
    card.hidden=index!==-2 && i!==index;
    card.classList.toggle('is-selected', i === index);
    card.querySelector('button')?.setAttribute('aria-pressed', String(i === index));
  });
  results.querySelectorAll<HTMLElement>('[data-direct-index]').forEach(panel=>{
    panel.hidden=index!==-2 && Number(panel.dataset.directIndex)!==index;
  });
}
const modeButtons=[...document.querySelectorAll<HTMLButtonElement>('[data-mode]')];
modeButtons.forEach(button=>button.addEventListener('click',()=>button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed')!=='true'))));
const mealRange=attachMealRange();
const routeMap = new MealRouteMap(selectCard);
let originRevision = 0;
for (const event of ['input','change']) input('origin').addEventListener(event, () => {
  originRevision++; routeMap.clearLocation();
});
void routeMap.start();
const initialDeparture = new Date(Date.now() + 5 * 60_000);
if (initialDeparture.getHours() >= 14 || initialDeparture.getHours() < 8) {
  if (initialDeparture.getHours() >= 14) initialDeparture.setDate(initialDeparture.getDate() + 1);
  initialDeparture.setHours(11, 0, 0, 0);
}
const departureDate=attachCalendar('departure',initialDeparture);
const arrivalDate=attachCalendar('arrival',new Date(initialDeparture.getTime() + 3 * 60 * 60_000));
document.querySelector('#time-zone')!.textContent = `Input times use your device timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Results use Europe/Zurich.`;
fetch('/api/route-planner/status', { cache: 'no-store' }).then(async response => {
  if (!response.ok) throw new Error();
  const readiness = await response.json();
  document.querySelector('#planner-readiness')!.textContent = readiness.ready ? 'Routing MCP connected · Public transport + walking' : 'Routing MCP is unavailable. Start the route-planner service.';
  button.disabled = !readiness.ready;
}).catch(() => { document.querySelector('#planner-readiness')!.textContent = 'Could not reach the route planner backend.'; });
document.querySelector('#use-location')!.addEventListener('click', async () => {
  const requestedRevision = ++originRevision;
  status.textContent = 'Requesting your location…';
  try {
    const fix = await getPositionFix();
    if(originRevision !== requestedRevision) return;
    input('origin').value = `${fix.lat},${fix.lng}`; input('origin').dispatchEvent(new Event('input')); routeMap.locate(fix); status.textContent = 'Starting point set to your current location.';
  }
  catch { if(originRevision === requestedRevision) status.textContent = 'Location unavailable. Please enter your starting point instead.'; }
});
type Leg = JourneyLeg;
type Meal = { id: string; title: string; components: string[]; price?: { student?: number; staff?: number; external?: number } };
type Place = { id: string; name: string; kind: string; sourceUrl: string; websiteUrl?: string; menuNote: string; hoursNote?: string; meals: Meal[]; attributions?: { provider: string; providerUri: string }[] };
type Option = { place: Place; mealStart: string; mealEnd: string; arrival: string; spareMinutes: number; extraMinutes: number; additionalDistanceMetres?:number; distanceEstimated?:boolean; outbound: Leg; onward: Leg; timing?:JourneyTiming };
type Plan = { baseline: Leg; directRoutes?: Leg[]; selectedOptionIndex?: number; options: Option[]; checkedStops: number; mealMinutes: number; mealMaxMinutes?:number; warnings: string[] };
const time = (value: string) => `${new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich',day:'2-digit',month:'2-digit',year:'numeric' }).format(new Date(value))}, ${new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit'}).format(new Date(value))}`;
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '') { const el = document.createElement(tag); el.textContent = text; return el; }
function render(plan: Plan, explanation: string,planId?:string) {
  menuLoaders=[];
  results.replaceChildren(); results.append(element('p', explanation));
  results.append(element('p', `${plan.checkedStops} stops checked · Direct route arrival ${time(plan.baseline.arrival)} · ${plan.mealMinutes}${plan.mealMaxMinutes && plan.mealMaxMinutes!==plan.mealMinutes ? `–${plan.mealMaxMinutes}` : ''} minute meal range`));
  plan.options.forEach((option, index) => {
    const card = element('article'); card.className = 'route-option';
    const show = element('button', `Show option ${index + 1} on map`); show.type = 'button'; show.className = 'show-route';
    show.addEventListener('click', () => { routeMap.select(index); selectCard(index); document.querySelector('#route-map-panel')!.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    card.append(show);
    card.append(element('p', index === 0 ? 'Smallest detour' : 'Another option'), element('h3', option.place.name));
    if(option.additionalDistanceMetres!=null) card.append(element('p',`${option.additionalDistanceMetres<1000 ? `${option.additionalDistanceMetres} m` : `${(option.additionalDistanceMetres/1000).toFixed(1)} km`} additional distance${option.distanceEstimated ? ' · estimated from walking access' : ''}`));
    card.append(element('p', `Eat ${time(option.mealStart)}–${time(option.mealEnd)}. Arrive ${time(option.arrival)}, ${option.spareMinutes} minutes before your deadline.`));
    card.append(element('p', `${option.extraMinutes} extra minutes compared with the direct journey, including your meal and waiting.`));
    if(option.timing) card.append(journeyTiming(option.timing));
    const menu=mealMenu(option.place,planId,index);menuLoaders.push(menu);card.append(menu.panel);
    card.append(journeyTimeline('To your meal stop',option.outbound,input('origin').value,option.place.name),
      mealBreak(option.mealStart,option.mealEnd,option.place.name),
      journeyTimeline('To your destination',option.onward,option.place.name,input('destination').value));
    results.append(card);
  });
  (plan.directRoutes?.length ? plan.directRoutes : [plan.baseline]).forEach((leg,i)=>{
    const panel=journeyTimeline('Direct route to your destination',leg,input('origin').value,input('destination').value);
    if(leg.timing) panel.prepend(journeyTiming(leg.timing));
    panel.dataset.directIndex=String(i===0 ? -1 : -2-i);results.append(panel);
  });
  routeMap.setPlan(plan); selectCard(selectedOption(plan));
}
form.addEventListener('submit', async event => {
  event.preventDefault(); if (button.disabled) return;
  const modes=modeButtons.filter(button=>button.getAttribute('aria-pressed')==='true').map(button=>button.dataset.mode!);
  if(!modes.length) {status.textContent='Select Walk, Public transport, or both.';return;}
  const departure = departureDate(); const arrival = arrivalDate();
  if(!departure || !arrival) {status.textContent='Enter valid dates as DD.MM.YYYY and valid departure/arrival times.';return;}
  if (!(departure.getTime() < arrival.getTime())) { status.textContent = 'Arrival must be after departure.'; return; }
  const key = input('openai-key').value.trim();
  originRevision++; // A pending GPS lookup must not change this submitted journey.
  button.disabled = true; section.setAttribute('aria-busy', 'true'); results.replaceChildren(); routeMap.reset();
  const started = Date.now();
  const timer = window.setInterval(() => { status.textContent = `Planning with AI and MCP: checking restaurants, opening hours and travel legs… ${Math.floor((Date.now() - started) / 1000)}s`; }, 1000);
  status.textContent = 'Starting AI and MCP route planning…';
  try {
    const response = await fetch('/api/route-planner/plan', { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(300_000),
      headers: { 'Content-Type': 'application/json', 'X-OpenAI-Key': key }, body: JSON.stringify({ origin: originLocation.value(input('origin').value), destination: destinationLocation.value(input('destination').value), departureTime: departure.toISOString(), arrivalTime: arrival.toISOString(), ...mealRange(),modes }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.detail ?? 'Route planning failed. Check backend configuration.');
    render(data.plan, data.explanation,data.planId); status.textContent = `Finished in ${Math.round((Date.now() - started) / 1000)} seconds.`;
  } catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not plan the journey.'; }
  finally { clearInterval(timer); button.disabled = false; section.setAttribute('aria-busy', 'false'); }
});
