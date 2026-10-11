/// <reference types="google.maps" />
import { decodeRoute, type Point } from './geometry.ts';
export type MappableLeg = { provider?: { mode?: string; polyline?: string; segments?: {polyline: string; geometryKind: string}[] } };
export type MappablePlan = { baseline: MappableLeg; directRoutes?: MappableLeg[]; selectedOptionIndex?: number; options: { place: { name: string }; outbound: MappableLeg; onward: MappableLeg }[] };
export function selectedOption(plan: MappablePlan): number {
  const index = plan.selectedOptionIndex;
  return typeof index === 'number' && Number.isInteger(index) && index >= -1 && index < plan.options.length
    ? index : plan.options.length ? 0 : -1;
}
declare global { interface Window { initMealRouteMap?: () => void; gm_authFailure?: () => void } }

export class MealRouteMap {
  private map?: google.maps.Map;
  private markers: {marker: google.maps.marker.AdvancedMarkerElement; index: number | null}[] = [];
  private lines: { line: google.maps.Polyline; index: number; leg: number; dashed: boolean }[] = [];
  private plan?: MappablePlan;
  private selected = 0;
  private userLocation?: Point;
  private userMarker?: google.maps.marker.AdvancedMarkerElement;
  private message = document.querySelector<HTMLElement>('#route-map-status')!;
  private controls = document.querySelector<HTMLElement>('#route-map-options')!;
  private onSelect: (index: number) => void;
  constructor(onSelect: (index: number) => void) { this.onSelect = onSelect; }
  async start() {
    try {
      const response = await fetch('/api/route-planner/map-config', { cache: 'no-store' });
      if (!response.ok) throw new Error('Map configuration unavailable.');
      const config = await response.json();
      if (!config.browserKey) throw new Error('Map not configured: add GOOGLE_MAPS_BROWSER_KEY with Maps JavaScript API enabled. Route planning still works below.');
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('Google map load timed out. Check your connection.')), 20_000);
        window.gm_authFailure = () => { clearTimeout(timer); this.message.textContent = 'Google rejected the map key. Check Maps JavaScript API, billing and website restrictions.'; reject(new Error(this.message.textContent)); };
        window.initMealRouteMap = () => { clearTimeout(timer); resolve(); };
        const script = document.createElement('script');
        const query = new URLSearchParams({ key: config.browserKey, v: 'weekly', loading: 'async', libraries: 'maps,marker', callback: 'initMealRouteMap' });
        script.src = `https://maps.googleapis.com/maps/api/js?${query}`;
        script.async = true; script.onerror = () => { clearTimeout(timer); reject(new Error('Could not load Google Maps.')); };
        document.head.append(script);
      });
      this.map = new google.maps.Map(document.querySelector<HTMLElement>('#route-map')!, {
        center: { lat: 47.3769, lng: 8.5417 }, zoom: 13, mapId: config.mapId || 'DEMO_MAP_ID',
        mapTypeControl: false, streetViewControl: false, fullscreenControl: true, gestureHandling: 'cooperative',
      });
      this.message.textContent = 'Dashed lines: public transport. Solid lines: walking. Transit paths are approximate; see journey details for unmatched sections.';
      if (this.userLocation) this.locate(this.userLocation);
      if (this.plan) this.draw();
    } catch (error) { this.message.textContent = error instanceof Error ? error.message : 'Map unavailable. Route planning still works below.'; }
  }
  locate(point: Point) {
    this.userLocation = point;
    if (!this.map) return;
    if (this.userMarker) this.userMarker.map = null;
    this.userMarker = this.marker(point, 'You are here', 'You', '#2563eb');
    this.map.panTo(point); this.map.setZoom(15);
  }
  clearLocation() {
    this.userLocation = undefined;
    if (this.userMarker) this.userMarker.map = null;
    this.userMarker = undefined;
  }
  reset() {
    this.clearOverlays(); this.plan = undefined; this.controls.replaceChildren();
    document.querySelector('#route-map-selection')!.textContent = 'Routes will appear here after planning.';
  }
  setPlan(plan: MappablePlan) {
    this.plan = plan; this.selected = selectedOption(plan);
    this.controls.replaceChildren();
    const labels = ['All options', 'Direct route', ...plan.options.map((option, i) => `${i + 1}. ${option.place.name}`)];
    labels.forEach((label, offset) => {
      const index = offset - 2; const chip = document.createElement('button');
      chip.type = 'button'; chip.textContent = label; chip.dataset.option = String(index);
      chip.addEventListener('click', () => { this.select(index); this.onSelect(index); });
      this.controls.append(chip);
    });
    plan.directRoutes?.slice(1).forEach((leg,i) => {
      const chip=document.createElement('button'),index=-3-i;chip.type='button';chip.dataset.option=String(index);
      chip.textContent=`Direct alternative ${i+2} · ${leg.provider?.mode ?? 'route'}`;
      chip.addEventListener('click',()=>{this.select(index);this.onSelect(index);});this.controls.append(chip);
    });
    if (this.map) this.draw();
    this.select(this.selected);
  }
  select(index: number) {
    this.selected = index;
    if(this.plan) {
      const legs=index===-2 ? [this.plan.baseline,...(this.plan.directRoutes?.slice(1)||[]),...this.plan.options.flatMap(o=>[o.outbound,o.onward])]
        : index===-1 ? [this.plan.baseline] : index<-2 ? [this.plan.directRoutes?.[-index-2]].filter(Boolean)
        : this.plan.options[index] ? [this.plan.options[index].outbound,this.plan.options[index].onward] : [];
      const segments=legs.flatMap(leg=>leg?.provider?.segments || []);
      this.message.textContent='Dashed: public transport. Solid: walking.'
        +(segments.some(s=>s.geometryKind==='stop_sequence') ? ' Some transit paths are unavailable and omitted from the map; the timetable still shows these connections.' : '')
        +(segments.some(s=>s.geometryKind==='osm_rail_corridor') ? ' Train paths are approximate OSM rail corridors, not confirmed tracks for this service.' : '');
    }
    this.controls.querySelectorAll<HTMLButtonElement>('button').forEach(chip => chip.setAttribute('aria-pressed', String(Number(chip.dataset.option) === index)));
    const title = index === -2 ? 'All checked meal-route options' : index === -1 ? 'Direct route without a meal stop' : index < -2 ? 'Direct alternative without a meal stop' : this.plan?.options[index]?.place.name;
    document.querySelector('#route-map-selection')!.textContent = title ?? 'Route';
    for (const { line, index: routeIndex, leg, dashed } of this.lines) {
      const active = index === -2 || index === routeIndex;
      line.setMap(active ? this.map! : null);
      const color = active ? (routeIndex < 0 ? '#64748b' : leg === 0 ? '#2563eb' : '#16804a') : '#94a3b8';
      line.setOptions({ strokeColor: color,
        strokeOpacity: dashed ? 0 : active ? .95 : .45, strokeWeight: active ? 6 : 4, zIndex: active ? 10 : 1,
        icons: dashed ? [{icon: {path: 'M 0,-1 0,1', strokeColor: color, strokeOpacity: active ? .95 : .45, scale: 4}, offset: '0', repeat: '16px'}] : [] });
    }
    for(const {marker,index:routeIndex} of this.markers) marker.map = routeIndex === null || index === -2 || index === routeIndex ? this.map : null;
    if (this.map) {
      const bounds = new google.maps.LatLngBounds();
      this.lines.filter(item => index === -2 || item.index === index).forEach(({ line }) => line.getPath().forEach(point => bounds.extend(point)));
      if (!bounds.isEmpty()) this.map.fitBounds(bounds, 45);
    }
  }
  private clearOverlays() {
    this.lines.forEach(({ line }) => { google.maps.event.clearInstanceListeners(line); line.setMap(null); }); this.lines = [];
    this.markers.forEach(({marker}) => { google.maps.event.clearInstanceListeners(marker); marker.map = null; }); this.markers = [];
  }
  private marker(position: Point, title: string, glyph: string, color: string) {
    const pin = new google.maps.marker.PinElement({ background: color, borderColor: '#fff', glyphColor: '#fff', glyphText: glyph });
    const marker = new google.maps.marker.AdvancedMarkerElement({ map: this.map, position, title });
    marker.append(pin); return marker;
  }
  private draw() {
    if (!this.map || !this.plan) return;
    this.clearOverlays();
    const addLine = (leg: MappableLeg, index: number, part: number) => {
      const segments = leg.provider?.segments ?? [{polyline: leg.provider?.polyline ?? '', geometryKind: leg.provider?.mode==='TRANSIT' ? 'stop_sequence' : 'street_path'}];
      for (const segment of segments) {
        // Stop coordinates are not a track/road shape. Never draw straight chords as transit paths.
        if(segment.geometryKind==='stop_sequence') continue;
        const path = decodeRoute(segment.polyline); if (path.length < 2) continue;
        const line = new google.maps.Polyline({ map: this.map, path, clickable: true });
        line.addListener('click', () => { this.select(index); this.onSelect(index); });
        this.lines.push({line, index, leg: part, dashed: ['stop_sequence','osm_transit_path','osm_rail_corridor','ojp_transit_path'].includes(segment.geometryKind)});
      }
      return decodeRoute(leg.provider?.polyline);
    };
    const baseline = addLine(this.plan.baseline, -1, 0);
    this.plan.directRoutes?.slice(1).forEach((leg,i) => addLine(leg, -3-i, 0));
    if (baseline.length) {
      this.markers.push({marker:this.marker(baseline[0], 'Starting point', 'A', '#334155'),index:null});
      this.markers.push({marker:this.marker(baseline[baseline.length - 1], 'Destination', 'B', '#334155'),index:null});
    }
    this.plan.options.forEach((option, index) => {
      const outbound = addLine(option.outbound, index, 0); const onward = addLine(option.onward, index, 1);
      const position = outbound.at(-1) ?? onward[0]; if (!position) return;
      const marker = this.marker(position, `${index + 1}. ${option.place.name}`, String(index + 1), '#16804a');
      marker.gmpClickable = true;
      marker.addEventListener('gmp-click', () => { this.select(index); this.onSelect(index); }); this.markers.push({marker,index});
    });
    this.select(this.selected);
  }
}
