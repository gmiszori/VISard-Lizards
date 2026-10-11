export type JourneyStep = {
  mode: string; line?: string; direction?: string; from: string; to: string;
  departure: string; arrival: string; departurePlatform?: string; arrivalPlatform?: string; distanceMetres?: number;
};
export type JourneyLeg = {
  departure: string; arrival: string; distanceMetres: number; directions: string[]; mapsUrl: string;
  provider?: {mode?: string; warnings?: string[]; polyline?: string; itinerary?: JourneyStep[]};
};
const clock = (value: string) => new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const date = (value: string) => new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Zurich',day:'numeric',month:'short'}).format(new Date(value));
export const minutesBetween = (a: string,b: string) => Math.max(0,Math.ceil((Date.parse(b)-Date.parse(a))/60000));
function node<K extends keyof HTMLElementTagNameMap>(tag: K,text='',className='') {
  const el=document.createElement(tag);el.textContent=text;el.className=className;return el;
}
function stop(time: string,name: string,platform?: string) {
  const row=node('div','','journey-stop'),stamp=node('time',clock(time));stamp.dateTime=time;
  const place=node('div');place.append(node('strong',name));
  if(platform) place.append(node('span',`Platform ${platform}`,'journey-platform'));
  row.append(stamp,node('span','','journey-dot'),place);return row;
}
export function journeyTimeline(label: string,leg: JourneyLeg,from: string,to: string) {
  const panel=node('section','','journey-panel');panel.setAttribute('aria-label',label);
  const head=node('header','','journey-heading');head.append(node('h4',label),node('span',`${date(leg.departure)} · ${clock(leg.departure)}–${clock(leg.arrival)} · ${minutesBetween(leg.departure,leg.arrival)} min`));panel.append(head);
  const itinerary=leg.provider?.itinerary;
  const steps=itinerary?.length ? itinerary : [{mode:leg.provider?.mode || 'WALK',from,to,departure:leg.departure,arrival:leg.arrival,distanceMetres:leg.distanceMetres}];
  const timeline=node('div','','journey-timeline');let cursor=leg.departure;
  steps.forEach((step,index)=> {
    const wait=minutesBetween(cursor,step.departure);
    if(wait) timeline.append(node('div',`${index ? 'Transfer' : 'Wait before departure'} · ${wait} min`,'journey-wait'));
    const block=node('div','','journey-segment');
    block.append(stop(step.departure,index===0 && step.mode==='WALK' ? from : step.from || from,step.departurePlatform));
    const travel=node('div','',`journey-travel ${step.mode==='WALK' ? 'is-walk' : 'is-transit'}`);
    const mode=step.mode==='WALK' ? 'Walk' : step.mode==='TRAM' ? 'Tram' : step.mode==='BUS' ? 'Bus' : step.mode==='TRAIN' ? 'Train' : 'Public transport';
    const icon=node('span',step.mode==='WALK' ? '🚶' : step.mode==='BUS' ? '🚌' : step.mode==='TRAM' ? '🚋' : '🚆','journey-mode-icon');icon.setAttribute('aria-hidden','true');travel.append(icon);
    const info=node('div');info.append(node('span',step.line?.replace(/^(T|Tram)\s/i,'Tram ').replace(/^(B|Bus)\s/i,'Bus ') || mode,`journey-line ${step.mode==='WALK' ? 'walk-line' : ''}`),node('span',` ${minutesBetween(step.departure,step.arrival)} min`,'journey-duration'));
    if(step.direction) info.append(node('span',`Direction ${step.direction}`,'journey-direction'));
    if(step.mode==='WALK' && step.distanceMetres != null) info.append(node('span',`${step.distanceMetres} m on foot`,'journey-direction'));
    travel.append(info);block.append(travel,stop(step.arrival,index===steps.length-1 ? to : step.to || to,step.arrivalPlatform));timeline.append(block);cursor=step.arrival;
  });
  panel.append(timeline);
  return panel;
}
export function mealBreak(from: string,to: string,place: string) {
  const pause=node('div','','journey-meal-break');pause.append(node('strong',`Meal break · ${minutesBetween(from,to)} min`),node('span',`${clock(from)}–${clock(to)} · ${place}`));return pause;
}
