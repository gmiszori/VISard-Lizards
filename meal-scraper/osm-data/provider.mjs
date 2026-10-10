import * as OSM from 'osm-api';
import OpeningHours from 'opening_hours';

process.env.TZ = 'Europe/Zurich';
const agent = 'UniEatsMealRoutes/1.0 (https://github.com/gmiszori/VISard-Lizards)';
OSM.configure({userAgent: agent});
const foot = process.env.OSM_FOOT_URL || 'https://routing.openstreetmap.de/routed-foot';
const transport = process.env.SWISS_TRANSPORT_URL || 'https://transport.opendata.ch/v1';
const overpass = process.env.OSM_OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const cache = new Map();
const lastCall = new Map();
let queue = Promise.resolve();

// Application-wide serialization, 1 request/second per provider, bounded memory.
export async function cached(key, ttl, action) {
  const entry = cache.get(key);
  if (entry && entry.until > Date.now()) return entry.value;
  const value = await action();
  if (cache.size >= 200) cache.delete(cache.keys().next().value);
  cache.set(key, {value, until: Date.now() + ttl});
  return value;
}
async function paced(url, action) {
  const run = queue.catch(() => {}).then(async () => {
    const host = new URL(url).host;
    const wait = (lastCall.get(host) || 0) + 1050 - Date.now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    lastCall.set(host, Date.now());
    return action();
  });
  queue = run.catch(() => {});
  return run;
}
async function request(url, init = {}) {
  return paced(url, async () => {
    const res = await fetch(url, {...init, headers: {'User-Agent': agent, ...init.headers}, signal: AbortSignal.timeout(15000)});
    if (!res.ok) throw Object.assign(new Error(`Route data service failed (HTTP ${res.status}).`), {code: res.status === 429 ? 'route_provider_busy' : 'route_provider_failed'});
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > 4_000_000) throw new Error('Route data response is too large.');
    return JSON.parse(new TextDecoder().decode(bytes));
  });
}
export function point(value) {
  const pair = typeof value === 'string' ? value.split(',').map(Number) : value;
  if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isFinite) || Math.abs(pair[0]) > 90 || Math.abs(pair[1]) > 180) throw new Error('Invalid coordinates.');
  return pair;
}
const query = values => new URLSearchParams(values).toString();
async function locate(value) {
  if (/^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/.test(value)) return point(value);
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error('Invalid location.');
  return cached(`location:${value}`, 86400000, async () => {
    const data = await request(`${transport}/locations?${query({query: value, type: /\d/.test(value) ? 'address' : 'all'})}`);
    const hit = data.stations?.find(s => s.type !== 'refine' && Number.isFinite(s.coordinate?.x) && Number.isFinite(s.coordinate?.y));
    if (!hit) throw new Error('Location was not found. Enter a more specific address or coordinates.');
    return Object.assign(point([hit.coordinate.x, hit.coordinate.y]), {label:hit.name});
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

// Timetable supplies stop coordinates, not track geometry. Preserve that distinction.
export async function transitLeg(connection, earliest, walking = walk) {
  const start = timeOf(connection.from, 'departure'), end = timeOf(connection.to, 'arrival');
  if (start < earliest || end < start) return null;
  const paths = [], directions = []; let cursor = earliest, distance = 0;
  for (const section of connection.sections || []) {
    const a = stopPoint(section.departure), b = stopPoint(section.arrival);
    const depart = timeOf(section.departure, 'departure'), arrive = timeOf(section.arrival, 'arrival');
    if (depart < cursor || arrive < depart) return null;
    if (section.journey) {
      const stops = [a, ...(section.journey.passList || []).flatMap(s => { try { return [stopPoint(s)]; } catch { return []; } }), b];
      paths.push({polyline: encodePolyline(stops), geometryKind: 'stop_sequence'});
      directions.push(`${clock(depart)}: ${section.journey.category || ''} ${section.journey.number || section.journey.name || ''} from ${section.departure.station.name} to ${section.arrival.station.name} (${clock(arrive)})`);
    } else if (section.walk) {
      const route = await walking(a, b);
      // Reject transfers that do not leave enough time for the actual OSM foot route.
      if (depart + route.duration * 1000 > arrive + 1000) return null;
      distance += Math.round(route.distance);
      paths.push({polyline: route.geometry, geometryKind: 'street_path'});
      directions.push(`${clock(depart)}: Walk to ${section.arrival.station.name} (${Math.ceil(route.duration / 60)} min)`);
    } else return null;
    cursor = arrive;
  }
  if (!paths.length || cursor > end) return null;
  const geometry = paths.flatMap(p => decodePolyline(p.polyline));
  return {departure: iso(start), arrival: iso(end), distanceMetres: distance, directions,
    provider: {mode: 'TRANSIT', polyline: encodePolyline(geometry), segments: paths, geometryKind: 'mixed', distanceScope:'walking_only',
      warnings: ['Dashed transit segments connect published stops; they are not exact track geometry. Transit distance is not supplied.']}};
}
export async function options(input) {
  const a = await locate(input.origin), b = await locate(input.destination), start = stamp(input.departureTime);
  const results = [], warnings = [`Locations resolved as: ${a.label || a.join(',')} → ${b.label || b.join(',')}. Check these match your intended trip.`];
  try {
    for (const route of await walkingRoutes(a,b)) results.push(walkingLeg(route,start));
  } catch { warnings.push('Walking routing is unavailable for this leg.'); }
  try {
    const [date, time] = local(start);
    const data = await cached(`transit:${a}:${b}:${date}:${time}`, 30000, () => request(`${transport}/connections?${query({from:a.join(','),to:b.join(','),date,time,limit:'2'})}`));
    for (const connection of data.connections || []) {
      try { const leg = await transitLeg(connection, start); if (leg) results.push(leg); } catch { warnings.push('A transit connection could not be verified.'); }
    }
  } catch { warnings.push('Swiss public transport routing is unavailable for this leg.'); }
  if (!results.length) throw new Error('No walking or public transport route could be verified.');
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
export async function nearby(input) {
  const p = point([input.latitude,input.longitude]);
  if (p[0] < 47.1 || p[0] > 47.7 || p[1] < 8.2 || p[1] > 8.9) return {places:[]};
  const data = await cached(`nearby:${p.map(n=>n.toFixed(4))}`, 300000, () => request(overpass, {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},body:query({data:`[out:json][timeout:12];nwr[amenity~"^(restaurant|cafe)$"][name][opening_hours](around:800,${p[0]},${p[1]});out center;`})}));
  const distance = hit => (Number(hit.lat ?? hit.center?.lat)-p[0])**2 + ((Number(hit.lon ?? hit.center?.lon)-p[1])*Math.cos(p[0]*Math.PI/180))**2;
  const hits = (data.elements || []).filter(hit => ['node','way','relation'].includes(hit.type) && Number.isFinite(distance(hit)))
    .sort((a,b) => distance(a)-distance(b)).slice(0,12);
  const features = [];
  // Use the requested osm-api-js library for current canonical object tags, read-only.
  for (const type of ['node','way','relation']) {
    const ids = hits.filter(h => h.type === type).map(h => h.id);
    if (ids.length) features.push(...await cached(`features:${type}:${ids.join(',')}`, 3600000,
      () => paced('https://api.openstreetmap.org', () => OSM.getFeatures(type, ids, {signal:AbortSignal.timeout(15000)}))));
  }
  return {places: hits.flatMap(hit => {
    const feature = features.find(f => f.type === hit.type && f.id === hit.id);
    const tags = feature?.tags;
    if (!tags || !['restaurant','cafe'].includes(tags.amenity) || !tags.name) return [];
    const location = point([hit.lat ?? hit.center?.lat,hit.lon ?? hit.center?.lon]);
    const windows = openingWindows(tags.opening_hours, input.date, location);
    return [{id:`osm:${hit.type}:${hit.id}`,name:tags.name,sourceUrl:`https://www.openstreetmap.org/${hit.type}/${hit.id}`,
      websiteUrl:tags.website || tags['contact:website'] || '',location:{latitude:location[0],longitude:location[1]},windows,
      hoursNote:`OpenStreetMap opening_hours: ${tags.opening_hours || 'unknown'}; special closures not confirmed`,attributions:[]}];
  })};
}
