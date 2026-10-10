import { decodeRoute, type Point } from './geometry.ts';
import type * as Leaflet from 'leaflet';
export type MappableLeg = { provider?: { polyline?: string; segments?: {polyline: string; geometryKind: string}[] } };
export type MappablePlan = { baseline: MappableLeg; directRoutes?: MappableLeg[]; selectedOptionIndex?: number; options: { place: { name: string }; outbound: MappableLeg; onward: MappableLeg }[] };
export function selectedOption(plan: MappablePlan): number {
  const index = plan.selectedOptionIndex;
  return typeof index === 'number' && Number.isInteger(index) && index >= -1 && index < plan.options.length ? index : plan.options.length ? 0 : -1;
}
export class MealRouteMap {
  private L?: typeof Leaflet;
  private map?: Leaflet.Map;
  private markers: Leaflet.Marker[] = [];
  private lines: { line: Leaflet.Polyline; index: number; leg: number }[] = [];
  private plan?: MappablePlan;
  private selected = 0;
  private userLocation?: Point;
  private userMarker?: Leaflet.Marker;
  private message = document.querySelector<HTMLElement>('#route-map-status')!;
  private controls = document.querySelector<HTMLElement>('#route-map-options')!;
  private onSelect: (index: number) => void;
  constructor(onSelect: (index: number) => void) {this.onSelect=onSelect;}
  async start(loader: () => Promise<typeof Leaflet> = () => import('leaflet')) {
    try {
      this.L = await loader();
      this.map = this.L.map(document.querySelector<HTMLElement>('#route-map')!, {scrollWheelZoom:false}).setView([47.3769,8.5417],13);
      this.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> &middot; <a href="https://www.openstreetmap.org/fixthemap">Fix the map</a>'}).addTo(this.map)
        .on('tileerror', () => {this.message.textContent='Some map tiles could not load. Route directions remain available below.';});
      this.message.textContent='Click a route or numbered meal stop. Dashed transit lines show stop sequences, not exact tracks.';
      if (this.userLocation) this.locate(this.userLocation);
      if (this.plan) this.draw();
    } catch (error) {this.message.textContent=error instanceof Error ? error.message : 'Map unavailable.';}
  }
  locate(point: Point) {
    this.userLocation=point; if (!this.map) return;
    this.userMarker?.remove(); this.userMarker=this.marker(point,'You are here','You','#2563eb'); this.map.setView([point.lat,point.lng],15);
  }
  reset() {
    this.clearOverlays();this.plan=undefined;this.controls.replaceChildren();
    document.querySelector('#route-map-selection')!.textContent='Routes will appear here after planning.';
  }
  setPlan(plan: MappablePlan) {
    this.plan=plan;this.selected=selectedOption(plan);this.controls.replaceChildren();
    ['All options','Direct route',...plan.options.map((option,i) => `${i+1}. ${option.place.name}`)].forEach((label,offset) => {
      const index=offset-2,chip=document.createElement('button');chip.type='button';chip.textContent=label;chip.dataset.option=String(index);
      chip.addEventListener('click',() => {this.select(index);this.onSelect(index);});this.controls.append(chip);
    });
    if (this.map) this.draw();this.select(this.selected);
  }
  select(index: number) {
    this.selected=index;
    this.controls.querySelectorAll<HTMLButtonElement>('button').forEach(chip => chip.setAttribute('aria-pressed',String(Number(chip.dataset.option)===index)));
    document.querySelector('#route-map-selection')!.textContent=index===-2 ? 'All checked meal routes' : index===-1 ? 'Direct route without a meal stop' : this.plan?.options[index]?.place.name ?? 'Route';
    for (const {line,index:routeIndex,leg} of this.lines) {
      const active=index===-2 || index===routeIndex;
      line.setStyle({color:active ? (routeIndex<0 ? '#64748b' : leg===0 ? '#2563eb' : '#16804a') : '#94a3b8',opacity:active ? .95 : .45,weight:active ? 6 : 4});
      if (active) line.bringToFront();
    }
    if (this.map && this.L) {
      const bounds=this.L.latLngBounds([]);
      this.lines.filter(item => index===-2 || item.index===index).forEach(({line}) => bounds.extend(line.getBounds()));
      if (bounds.isValid()) this.map.fitBounds(bounds,{padding:[35,35],maxZoom:17});
    }
  }
  private clearOverlays() {
    this.lines.forEach(({line}) => line.remove());this.lines=[];this.markers.forEach(marker => marker.remove());this.markers=[];
  }
  private marker(position: Point,title: string,glyph: string,color: string) {
    const content=document.createElement('span');content.textContent=glyph;content.className='osm-route-pin';content.style.backgroundColor=color;
    return this.L!.marker([position.lat,position.lng],{title,icon:this.L!.divIcon({html:content,className:'osm-route-marker',iconSize:[32,32],iconAnchor:[16,16]})}).addTo(this.map!);
  }
  private draw() {
    if (!this.map || !this.plan || !this.L) return;this.clearOverlays();
    const addLine=(leg:MappableLeg,index:number,part:number) => {
      const segments=leg.provider?.segments ?? [{polyline:leg.provider?.polyline ?? '',geometryKind:'street_path'}];
      for (const segment of segments) {
        const path=decodeRoute(segment.polyline);if (path.length<2) continue;
        const line=this.L!.polyline(path.map(p => [p.lat,p.lng] as [number,number]),{dashArray:segment.geometryKind==='stop_sequence' ? '8 8' : undefined}).addTo(this.map!);
        line.on('click',() => {this.select(index);this.onSelect(index);});this.lines.push({line,index,leg:part});
      }
      return decodeRoute(leg.provider?.polyline);
    };
    const baseline=addLine(this.plan.baseline,-1,0);this.plan.directRoutes?.slice(1).forEach(leg => addLine(leg,-1,0));
    if (baseline.length) {this.markers.push(this.marker(baseline[0],'Starting point','A','#334155'));this.markers.push(this.marker(baseline.at(-1)!,'Destination','B','#334155'));}
    this.plan.options.forEach((option,index) => {
      const outbound=addLine(option.outbound,index,0),onward=addLine(option.onward,index,1),position=outbound.at(-1) ?? onward[0];if (!position) return;
      const marker=this.marker(position,`${index+1}. ${option.place.name}`,String(index+1),'#16804a');marker.on('click',() => {this.select(index);this.onSelect(index);});this.markers.push(marker);
    });this.select(this.selected);
  }
}
