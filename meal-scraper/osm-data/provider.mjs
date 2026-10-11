import * as OSM from 'osm-api';
import OpeningHours from 'opening_hours';
import {RestaurantCatalog} from './catalog.mjs';
import {transitGeometryQuery, matchTransitGeometry} from './transit-geometry.mjs';
import {tripRequest, journeyProjection} from './ojp.mjs';

process.env.TZ = 'Europe/Zurich';
const agent = 'UniEatsMealRoutes/1.0 (https://github.com/gmiszori/VISard-Lizards)';
OSM.configure({userAgent: agent});
const foot = process.env.OSM_FOOT_URL || 'https://routing.openstreetmap.de/routed-foot';
const transport = process.env.SWISS_TRANSPORT_URL || 'https://transport.opendata.ch/v1';
const transitGeometryUrl=process.env.OSM_TRANSIT_GEOMETRY_URL || 'https://overpass.osm.ch/api/interpreter';
const ojpUrl=process.env.OJP_API_URL || 'https://api.opentransportdata.swiss/ojp20';
const ojpKey=process.env.OJP_API_KEY || '';
const overpass = process.env.OSM_OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const cache = new Map();
const lastCall = new Map();
const cooldown = new Map();
const pending = new Map();
const canonical = new Map();
let canonicalCooldown=0;
const shapeCooldown=new Map();
let queue = Promise.resolve();

// Application-wide serialization, 1 request/second per provider, bounded memory.
export async function cached(key, ttl, action) {
  const entry = cache.get(key);
  if (entry && entry.until > Date.now()) return entry.value;
  if(pending.has(key)) return pending.get(key);
  const work=(async()=> {
    const value=await action();
    if(cache.size>=200) cache.delete(cache.keys().next().value);
    cache.set(key,{value,until:Date.now()+ttl});return value;
  })().finally(()=>pending.delete(key));
  pending.set(key,work);return work;
}
async function paced(url, action) {
  const run = queue.catch(() => {}).then(async () => {
    const host = new URL(url).host;
    if((cooldown.get(host)||0)>Date.now()) throw Object.assign(new Error(`Routing provider ${host} is cooling down after HTTP 429.`),{code:'route_provider_busy'});
    const wait = (lastCall.get(host) || 0) + (new URL(url).hostname==='osrm-foot' ? 0 : 1050) - Date.now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    lastCall.set(host, Date.now());
    return action();
  });
  queue = run.catch(() => {});
  return run;
}
async function request(url, init = {}, timeoutMs = 15000, format='json') {
  return paced(url, async () => {
    const res = await fetch(url, {...init, headers: {'User-Agent': agent, ...init.headers}, signal: AbortSignal.timeout(timeoutMs)});
    if(res.status===429) {
      const retry=res.headers.get('retry-after');
      const delay=retry && /^\d+$/.test(retry) ? Number(retry)*1000 : Date.parse(retry)-Date.now();
      cooldown.set(new URL(url).host,Date.now()+Math.max(5000,Math.min(Number.isFinite(delay) ? delay : 30000,3600000)));
    }
    if (!res.ok) throw Object.assign(new Error(`Routing provider ${new URL(url).host} failed (HTTP ${res.status}).`), {code: res.status === 429 ? 'route_provider_busy' : 'route_provider_failed'});
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > 4_000_000) throw new Error('Route data response is too large.');
    const text=new TextDecoder().decode(bytes);
    return format==='xml' ? text : JSON.parse(text);
  });
}
export function point(value) {
  const pair = typeof value === 'string' ? value.split(',').map(Number) : value;
  if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isFinite) || Math.abs(pair[0]) > 90 || Math.abs(pair[1]) > 180) throw new Error('Invalid coordinates.');
  return pair;
}
const query = values => new URLSearchParams(values).toString();
export function locationQuery(value) {
  const campus=value.trim().toLowerCase().replace(/[.,]/g,'').replace(/\s+/g,' ');
  if(['eth zentrum','eth zurich zentrum','eth zürich zentrum','eth hauptgebäude'].includes(campus))
    return {query:'Rämistrasse 101, Zürich',type:'address'};
  return {query:value,type:/\d/.test(value) ? 'address' : 'all'};
}
const locationWords=value=>value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/\bhb\b/g,'hauptbahnhof').match(/[a-z0-9]+/g)||[];
export function selectLocation(value,stations) {
  const wanted=locationWords(value).filter(word=>!['switzerland','schweiz'].includes(word));
  let matches=(stations||[]).filter(s=>s.type!=='refine' && Number.isFinite(s.coordinate?.x) && Number.isFinite(s.coordinate?.y)
    && wanted.every(word=>locationWords(s.name||'').includes(word)));
  const exact=matches.filter(s=>locationWords(s.name||'').length===wanted.length);
  if(exact.length) matches=exact;
  if(!matches.length) throw Object.assign(new Error('Location could not be matched reliably. Enter a full address or coordinates.'),{code:'invalid_location'});
  if(new Set(matches.map(s=>locationWords(s.name).join(' '))).size>1)
    throw Object.assign(new Error('Location is ambiguous. Enter a full address or coordinates.'),{code:'invalid_location'});
  return matches[0];
}
async function locate(value) {
  if (/^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/.test(value)) return point(value);
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error('Invalid location.');
  return cached(`location:${value}`, 86400000, async () => {
    const lookup=locationQuery(value);
    const data = await request(`${transport}/locations?${query(lookup)}`);
    const hit=selectLocation(lookup.query,data.stations);
    return Object.assign(point([hit.coordinate.x, hit.coordinate.y]), {label:hit.name});
  });
}
export function locationSuggestions(stations) {
  const unique = new Map();
  for (const hit of stations || []) {
    if (hit.type === 'refine' || typeof hit.name !== 'string' || !hit.name.trim()) continue;
    const lat = hit.coordinate?.x, lng = hit.coordinate?.y;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const key = hit.name.trim().toLowerCase();
    if (!unique.has(key)) unique.set(key, {label: hit.name, latitude: lat, longitude: lng, kind: hit.type || (hit.id ? 'station' : 'place')});
  }
  return [...unique.values()].slice(0, 8);
}
export async function suggestLocations(input) {
  const value = input.query;
  if (typeof value !== 'string' || value.length > 200) throw new Error('Invalid location query.');
  if (value.trim().length < 3) return {locations: []};
  const lookup = locationQuery(value.trim());
  return cached(`suggest:${lookup.query}:${lookup.type}`, 86400000, async () => {
    const data = await request(`${transport}/locations?${query(lookup)}`);
    return {locations: locationSuggestions(data.stations)};
  });
}
export function encodePolyline(points) {
  let lat = 0, lng = 0, out = '';
  const encode = delta => { let v = delta < 0 ? ~(delta << 1) : delta << 1; let s = ''; while (v >= 32) { s += String.fromCharCode((32 | (v & 31)) + 63); v >>>= 5; } return s + String.fromCharCode(v + 63); };
  for (const p of points) { const a = Math.round(p[0] * 1e5), b = Math.round(p[1] * 1e5); out += encode(a - lat) + encode(b - lng); lat = a; lng = b; }
  return out;
}
export function decodePolyline(value) {
  const points = []; let i = 0, lat = 0, lng = 0;
  const delta = () => { let result = 0, shift = 0, part; do { if (i >= value.length || shift >= 32) throw new Error('Invalid route geometry.'); part = value.charCodeAt(i++) - 63; result |= (part & 31) << shift; shift += 5; } while (part >= 32); return result & 1 ? ~(result >>> 1) : result >>> 1; };
  while (i < value.length) { lat += delta(); lng += delta(); points.push(point([lat / 1e5, lng / 1e5])); }
  return points;
}
async function walkingRoutes(a, b) {
  return cached(`walk:${a}:${b}`, 86400000, async () => {
    const data = await request(`${foot}/route/v1/foot/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&steps=true&geometries=polyline&alternatives=true&radiuses=100;100`);
    if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No walking route was returned.');
    return data.routes.slice(0,3).sort((a,b) => a.duration-b.duration);
  });
}
async function walk(a,b) { return (await walkingRoutes(a,b))[0]; }
export function walkingLeg(route,start) {
  if (!Number.isFinite(route.duration) || route.duration < 0 || !Number.isFinite(route.distance) || route.distance < 0 || !decodePolyline(route.geometry || '').length)
    throw new Error('Invalid walking route evidence.');
  return {departure: iso(start),arrival: iso(start+Math.ceil(route.duration)*1000),distanceMetres:Math.round(route.distance),
    directions:(route.legs || []).flatMap(leg => (leg.steps || []).map(step => `${step.maneuver.type}${step.maneuver.modifier ? ' '+step.maneuver.modifier : ''}${step.name ? ': '+step.name : ''} (${Math.round(step.distance)} m)`)),
    provider:{mode:'WALK',polyline:route.geometry,geometryKind:'street_path',warnings:[]}};
}
const stamp = value => { const time = Date.parse(value); if (!Number.isFinite(time)) throw new Error('Invalid journey time.'); return time; };
const stopPoint = stop => point([stop.station?.coordinate?.x, stop.station?.coordinate?.y]);
const timeOf = (stop, type) => stamp(stop.prognosis?.[type] || stop[type]);
const iso = time => new Date(time).toISOString();
const clock = time => new Date(time).toLocaleTimeString('en-GB', {timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit'});
const local = time => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(time)).split(' ');

export async function transitShape(journey,stops,section) {
  if(ojpKey && section && !['T','TRAM','B','BUS','NFB','BN'].includes(String(journey.category).toUpperCase())) {
    const key=`ojp-shape:${section.departure.station.id}:${section.arrival.station.id}:${section.departure.departure}:${section.arrival.arrival}:${journey.category}:${journey.number}`;
    try {
      const projection=await cached(key,86400000,async()=>{
        if((shapeCooldown.get(key)||0)>Date.now()) throw new Error('OJP lookup is cooling down.');
        const response=await request(ojpUrl,{method:'POST',headers:{'Content-Type':'application/xml',Authorization:`Bearer ${ojpKey}`},body:tripRequest(section)},8000,'xml');
        const result=journeyProjection(response,section);
        if(!result) throw new Error('No matching OJP journey projection.');
        return result;
      });
      if(projection) return {polyline:encodePolyline(projection.path),geometryKind:'ojp_transit_path',
        journeyRef:projection.journeyRef,operatingDay:projection.operatingDay,
        sourceUrl:'https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/'};
    } catch {
      if((shapeCooldown.get(key)||0)<=Date.now()) {
        if(shapeCooldown.size>=200) shapeCooldown.delete(shapeCooldown.keys().next().value);
        shapeCooldown.set(key,Date.now()+300000);
        console.warn('OJP journey geometry unavailable; using labelled OSM fallback.');
      }
    }
  }
  const service=transitGeometryQuery(journey,stops);if(!service) return null;
  try {
    // Sanitized service references or published station bounds; never device coordinates.
    const data=await cached(`transit-shape:${service.key}`,86400000,()=>{
      if((shapeCooldown.get(service.key)||0)>Date.now()) throw new Error('Transit geometry lookup is cooling down.');
      return request(transitGeometryUrl,{method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:query({data:service.query})},8000);});
    const match=matchTransitGeometry(data.elements,stops,service.mode,service.kind==='osm_rail_corridor');
    return match ? {polyline:encodePolyline(match.path),geometryKind:service.kind,sourceUrl:`https://www.openstreetmap.org/relation/${match.relationId}`} : null;
  } catch {
    if((shapeCooldown.get(service.key)||0)<=Date.now()) {
      if(shapeCooldown.size>=200) shapeCooldown.delete(shapeCooldown.keys().next().value);
      shapeCooldown.set(service.key,Date.now()+300000);
    }
    return null;
  }
}
// Timetables determine times; matched OSM service paths improve the display only.
export async function transitLeg(connection, earliest, walking = walk, shape = transitShape) {
  const start = timeOf(connection.from, 'departure'), end = timeOf(connection.to, 'arrival');
  if (start < earliest || end < start) return null;
  const paths = [], directions = [], itinerary = []; let cursor = earliest, distance = 0;
  for (const section of connection.sections || []) {
    const a = stopPoint(section.departure), b = stopPoint(section.arrival);
    const depart = timeOf(section.departure, 'departure'), arrive = timeOf(section.arrival, 'arrival');
    if (arrive < depart) return null;
    if (section.journey) {
      if(depart < cursor) return null;
      const stops = [a, ...(section.journey.passList || []).flatMap(s => {
        try {
          const at=Date.parse(s.departure || s.arrival);
          return Number.isFinite(at) && at>=depart && at<=arrive ? [stopPoint(s)] : [];
        } catch { return []; }
      }), b];
      paths.push(await shape(section.journey,stops,section) || {polyline: encodePolyline(stops), geometryKind: 'stop_sequence'});
      const category=String(section.journey.category||'').toUpperCase();
      itinerary.push({mode: ['T','TRAM'].includes(category) ? 'TRAM' : ['B','BUS','NFB','BN'].includes(category) ? 'BUS' : 'TRAIN',
        line: `${section.journey.category || ''} ${String(section.journey.number || section.journey.name || '').replace(/^0+(?=\d)/,'')}`.trim(),
        direction: section.journey.to || '', from: section.departure.station.name, to: section.arrival.station.name,
        departure: iso(depart), arrival: iso(arrive),
        departurePlatform: section.departure.prognosis?.platform || section.departure.platform || '',
        arrivalPlatform: section.arrival.prognosis?.platform || section.arrival.platform || ''});
      directions.push(`${clock(depart)}: ${section.journey.category || ''} ${section.journey.number || section.journey.name || ''} from ${section.departure.station.name} to ${section.arrival.station.name} (${clock(arrive)})`);
    } else if (section.walk) {
      const route = await walking(a, b);
      // Use the full wait before the next vehicle, rather than only the timetable walking estimate.
      // The next journey rejects a missed boarding; the final walk may extend the arrival.
      const walkStart=Math.max(depart,cursor);
      cursor=walkStart+Math.ceil(route.duration)*1000;
      if(route.duration>0) itinerary.push({mode:'WALK', from:section.departure.station.name,to:section.arrival.station.name,
        departure:iso(walkStart),arrival:iso(cursor),distanceMetres:Math.round(route.distance)});
      distance += Math.round(route.distance);
      paths.push({polyline: route.geometry, geometryKind: 'street_path'});
      directions.push(`${clock(depart)}: Walk to ${section.arrival.station.name} (${Math.ceil(route.duration / 60)} min)`);
    } else return null;
    if(section.journey) cursor = arrive;
  }
  if (!paths.length) return null;
  const geometry = paths.flatMap(p => decodePolyline(p.polyline));
  return {departure: iso(start), arrival: iso(Math.max(end,cursor)), distanceMetres: distance, directions,
    provider: {mode: 'TRANSIT', itinerary, polyline: encodePolyline(geometry), segments: paths, geometryKind: 'mixed', distanceScope:'walking_only',
      warnings: [...(paths.some(p=>p.geometryKind==='stop_sequence') ? ['Some transit paths could not be matched and are omitted from the map; their timetable connections remain available.'] : []),
        ...(paths.some(p=>p.geometryKind==='osm_transit_path') ? ['Transit paths follow matched OpenStreetMap service ways; diversions and platform tracks may differ.'] : []),
        ...(paths.some(p=>p.geometryKind==='osm_rail_corridor') ? ['Rail geometry follows an inferred OSM corridor through the published stations; the exact train track is not confirmed.'] : []),
        'Transit distance is not supplied.']}};
}
export async function options(input) {
  const modes=input.modes ?? ['WALK','TRANSIT'];
  if(!Array.isArray(modes) || !modes.length || modes.length>2 || modes.some(mode=>!['WALK','TRANSIT'].includes(mode))) throw new Error('Select walking or public transport.');
  const a = await locate(input.origin), b = await locate(input.destination), start = stamp(input.departureTime);
  let providerFailure;
  const results = [], warnings = [`Locations resolved as: ${a.label || a.join(',')} → ${b.label || b.join(',')}. Check these match your intended trip.`];
  if(modes.includes('WALK')) try {
    for (const route of await walkingRoutes(a,b)) results.push(walkingLeg(route,start));
  } catch(error) { providerFailure=error;warnings.push('Walking routing is unavailable for this leg.'); }
  if(modes.includes('TRANSIT')) try {
    const [date, time] = local(start);
    const data = await cached(`transit:${a}:${b}:${date}:${time}`, 30000, () => request(`${transport}/connections?${query({from:a.join(','),to:b.join(','),date,time,limit:'2'})}`));
    if(!data.connections?.length) warnings.push('No public transport connections were returned for this leg.');
    for (const connection of data.connections || []) {
      try { const leg = await transitLeg(connection, start); if (leg) results.push(leg); else warnings.push('A transit connection was excluded because its walking transfer would miss a departure.'); } catch { warnings.push('A transit connection could not be verified.'); }
    }
  } catch(error) { providerFailure=error;warnings.push('Swiss public transport routing is unavailable for this leg.'); }
  if (!results.length) throw providerFailure || new Error('No walking or public transport route could be verified.');
  results.forEach(leg => { leg.provider.warnings.push(...warnings); leg.provider.originCoordinates=a.join(','); leg.provider.destinationCoordinates=b.join(','); });
  return {routes:results.sort((a,b) => stamp(a.arrival) - stamp(b.arrival))};
}
export function openingWindows(expression, date, coordinates) {
  if (!expression || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  try {
    const [year, month, day] = date.split('-').map(Number);
    const from = new Date(year, month - 1, day), to = new Date(year, month - 1, day + 1);
    const hours = new OpeningHours(expression, {lat:coordinates[0],lon:coordinates[1],address:{country_code:'ch',state:'Zürich'}});
    return hours.getOpenIntervals(from, to).filter(interval => !interval[2]).map(([open,close]) => ({open:open.toISOString(),close:close.toISOString()}));
  } catch { return []; }
}
const restaurantCatalog=new RestaurantCatalog(()=>request(overpass,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:query({data:'[out:json][timeout:12];nwr[amenity~"^(restaurant|cafe)$"][name][opening_hours](47.1,8.2,47.7,8.9);out center;'})}),process.env.OSM_CATALOG_FILE);
export async function refreshRestaurants() { return restaurantCatalog.current(); }
export async function nearby(input) {
  const p = point([input.latitude,input.longitude]);
  if (p[0] < 47.1 || p[0] > 47.7 || p[1] < 8.2 || p[1] > 8.9) return {places:[]};
  const data=await restaurantCatalog.current();
  const distance=hit=>Math.hypot((Number(hit.lat ?? hit.center?.lat)-p[0])*111320,(Number(hit.lon ?? hit.center?.lon)-p[1])*111320*Math.cos(p[0]*Math.PI/180));
  const hits = data.elements.filter(hit => ['node','way','relation'].includes(hit.type) && distance(hit)<=1500)
    .sort((a,b) => distance(a)-distance(b)).slice(0,12);
  const features = [];
  // Use the requested osm-api-js library for current canonical object tags, read-only.
  for (const type of ['node','way','relation']) {
    const typed=hits.filter(h=>h.type===type);
    const ids=typed.filter(h=>(canonical.get(`${type}:${h.id}`)?.until||0)<=Date.now()).map(h=>h.id);
    if(ids.length && canonicalCooldown<=Date.now()) try {
      const loaded=await paced('https://api.openstreetmap.org',()=>OSM.getFeatures(type,ids,{signal:AbortSignal.timeout(15000)}));
      for(const feature of loaded) {
        if(canonical.size>=2000) canonical.delete(canonical.keys().next().value);
        canonical.set(`${feature.type}:${feature.id}`,{value:feature,until:Date.now()+86400000});
      }
    } catch { canonicalCooldown=Date.now()+60000; }
    for(const hit of typed) {
      const entry=canonical.get(`${type}:${hit.id}`);if(entry && entry.until>Date.now()) features.push(entry.value);
    }
  }
  return {places: hits.flatMap(hit => {
    const feature = features.find(f => f.type === hit.type && f.id === hit.id);
    const tags = feature ? feature.tags : hit.tags;
    if (!tags || !['restaurant','cafe'].includes(tags.amenity) || !tags.name) return [];
    const location = point([hit.lat ?? hit.center?.lat,hit.lon ?? hit.center?.lon]);
    const windows = openingWindows(tags.opening_hours, input.date, location);
    return [{id:`osm:${hit.type}:${hit.id}`,name:tags.name,sourceUrl:`https://www.openstreetmap.org/${hit.type}/${hit.id}`,
      websiteUrl:tags.website || tags['contact:website'] || '',location:{latitude:location[0],longitude:location[1]},windows,
      hoursNote:`OpenStreetMap opening_hours: ${tags.opening_hours || 'unknown'}; regional snapshot ${new Date(data.updatedAt).toISOString()}; kitchen hours and special closures not confirmed`,attributions:[]}];
  })};
}

// Walking costs rank candidates; they never exclude potentially feasible transit journeys.
export async function walkingCosts(input) {
  const origin=point(input.origin),destination=point(input.destination);
  if(!Array.isArray(input.stops) || input.stops.length>64) throw new Error('Invalid matrix size.');
  const stops=input.stops.map(point);if(!stops.length) return {costs:[]};
  const points=[origin,...stops,destination];
  const coordinates=points.map(p=>`${p[1]},${p[0]}`).join(';');
  const sources=points.slice(0,-1).map((_,i)=>i).join(';');
  const destinations=points.slice(1).map((_,i)=>i+1).join(';');
  const data=await cached(`matrix:${coordinates}`,86400000,()=>request(`${foot}/table/v1/foot/${coordinates}?${query({sources,destinations,annotations:'duration'})}`));
  if(data.code!=='Ok' || !Array.isArray(data.durations)) throw new Error('Walking matrix unavailable.');
  return {costs:stops.map((_,i)=> {
    const outbound=data.durations[0]?.[i],onward=data.durations[i+1]?.[stops.length];
    return Number.isFinite(outbound) && Number.isFinite(onward) ? outbound+onward : null;
  })};
}
