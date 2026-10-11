import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MealRouteMap, selectedOption } from './map.ts';

test('only an existing verified option can be highlighted by AI selection', () => {
  const leg = {}; const options = [{ place: {name: 'A'}, outbound: leg, onward: leg }, { place: {name: 'B'}, outbound: leg, onward: leg }];
  assert.equal(selectedOption({baseline: leg, options, selectedOptionIndex: 1}), 1);
  assert.equal(selectedOption({baseline: leg, options, selectedOptionIndex: -1}), -1);
  assert.equal(selectedOption({baseline: leg, options, selectedOptionIndex: 99}), 0);
  assert.equal(selectedOption({baseline: leg, options: [], selectedOptionIndex: 0}), -1);
});

test('route controls and meal markers select both legs; replanning removes old overlays', async () => {
  class Node {
    textContent = ''; dataset: Record<string, string> = {}; children: Node[] = [];
    attributes: Record<string, string> = {}; events: Record<string, () => void> = {};
    map: unknown; gmpClickable = false;
    append(...nodes: Node[]) { this.children.push(...nodes); }
    replaceChildren() { this.children = []; }
    querySelectorAll() { return this.children; }
    setAttribute(key: string, value: string) { this.attributes[key] = value; }
    addEventListener(event: string, handler: () => void) { this.events[event] = handler; }
  }
  const nodes = new Map(['#route-map-status', '#route-map-options', '#route-map-selection', '#route-map'].map(id => [id, new Node()]));
  const lines: Line[] = []; const markers: Marker[] = []; let fitted: unknown[] = [];
  class Line {
    options: Record<string, unknown>; events: Record<string, () => void> = {};
    constructor(options: Record<string, unknown>) { this.options = options; lines.push(this); }
    setOptions(options: Record<string, unknown>) { Object.assign(this.options, options); }
    setMap(map: unknown) { this.options.map = map; }
    getPath() { return this.options.path as unknown[]; }
    addListener(event: string, handler: () => void) { this.events[event] = handler; }
  }
  class Marker extends Node {
    constructor(options: { map: unknown }) { super(); this.map = options.map; markers.push(this); }
  }
  class Bounds {
    points: unknown[] = [];
    extend(point: unknown) { this.points.push(point); }
    isEmpty() { return !this.points.length; }
  }
  const globals = globalThis as unknown as Record<string, unknown>;
  const saved = new Map(['window', 'document', 'google', 'fetch'].map(name => [name, globals[name]]));
  const win = { setTimeout, initMealRouteMap: undefined as (() => void) | undefined };
  globals.window = win;
  globals.document = { querySelector: (id: string) => nodes.get(id), createElement: () => new Node(), head: { append: () => win.initMealRouteMap?.() } };
  globals.fetch = async () => ({ ok: true, json: async () => ({ browserKey: 'test-public-key' }) });
  globals.google = { maps: {
    Map: class { fitBounds(bounds: Bounds) { fitted = bounds.points; } panTo() {} setZoom() {} },
    Polyline: Line, LatLngBounds: Bounds, event: { clearInstanceListeners() {} },
    marker: { AdvancedMarkerElement: Marker, PinElement: Node },
  } };
  try {
    const selected: number[] = []; const map = new MealRouteMap(index => selected.push(index)); await map.start();
    const leg = { provider: { polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@', segments: [{polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@', geometryKind: 'osm_rail_corridor'}, {polyline:'_p~iF~ps|U_ulLnnqC_mqNvxq`@',geometryKind:'stop_sequence'}] } };
    const walking={provider:{...leg.provider,segments:[{...leg.provider.segments[0],geometryKind:'street_path'}]}};
    map.setPlan({ baseline: leg, options: [
      { place: { name: 'Lunch A' }, outbound: leg, onward: walking },
      { place: { name: 'Lunch B' }, outbound: leg, onward: walking },
    ] });
    assert.equal(lines[0].options.strokeOpacity, 0); assert.ok((lines[0].options.icons as unknown[]).length); assert.equal(lines[2].options.strokeOpacity,.95); assert.deepEqual(lines[2].options.icons,[]); assert.equal(lines.length, 5,'unmatched stop-to-stop chords must not be drawn over streets or tracks'); assert.equal(markers.length, 4);
    assert.equal(fitted.length, 6, 'fit both legs of the initially selected meal route');
    assert.equal(lines[0].options.map,null,'direct route is hidden when a meal route is selected');
    assert.equal(lines[3].options.map,null,'other meal routes cannot look like extra waypoints');
    const chips = nodes.get('#route-map-options')!.children;
    chips[3].events.click();
    assert.deepEqual(selected, [1]); assert.equal(chips[3].attributes['aria-pressed'], 'true');
    assert.equal(lines[3].options.strokeColor, '#2563eb'); assert.equal(lines[4].options.strokeColor, '#16804a');
    assert.equal(lines[1].options.strokeColor, '#94a3b8');
    assert.equal(lines[1].options.map,null);
    markers[2].events['gmp-click'](); assert.deepEqual(selected, [1, 0]); assert.equal(markers[2].gmpClickable, true);
    chips[0].events.click(); assert.equal(fitted.length, 15, 'all options include the direct journey');
    assert.ok(lines.every(line=>line.options.map!==null));
    chips[1].events.click(); assert.equal(fitted.length,3,'direct route contains no meal detour');
    assert.ok(lines.slice(1).every(line=>line.options.map===null));
    map.locate({lat:47.3,lng:8.5}); const locationMarker=markers.at(-1)!;
    map.clearLocation();assert.equal(locationMarker.map,null,'manual start removes the old device-location marker');
    map.reset(); assert.ok(lines.every(line => line.options.map === null)); assert.ok(markers.every(marker => marker.map === null));
    assert.equal(nodes.get('#route-map-options')!.children.length, 0);
  } finally { for (const [name, value] of saved) { if (value === undefined) delete globals[name]; else globals[name] = value; } }
});
