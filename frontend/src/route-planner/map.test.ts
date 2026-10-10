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
    style = {}; map: unknown;
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
    addTo(map: unknown) { this.options.map=map; return this; }
    on(event: string, handler: () => void) { this.events[event]=handler; return this; }
    remove() {this.options.map=null;}
    bringToFront() {}
    setStyle(options: Record<string, unknown>) {this.setOptions(options);}
    getBounds() {return this.options.path;}
    setOptions(options: Record<string, unknown>) { Object.assign(this.options, options); }
    setMap(map: unknown) { this.options.map = map; }
    getPath() { return this.options.path as unknown[]; }
    addListener(event: string, handler: () => void) { this.events[event] = handler; }
  }
  class Marker extends Node {
    constructor(options: { map: unknown }) { super(); this.map = options.map; markers.push(this); }
    addTo(map: unknown) {this.map=map;return this;}
    on(event: string,handler: () => void) {this.events[event]=handler;return this;}
    remove() {this.map=null;}
  }
  class Bounds {
    points: unknown[] = [];
    extend(point: unknown) { this.points.push(...point as unknown[]); }
    isValid() { return !!this.points.length; }
  }
  const globals = globalThis as unknown as Record<string, unknown>;
  const saved = new Map(['document'].map(name => [name, globals[name]]));
  globals.document = {querySelector:(id: string) => nodes.get(id),createElement:() => new Node()};
  const leaflet = {
    map: () => ({setView(){return this;},fitBounds(bounds:Bounds){fitted=bounds.points;}}),
    tileLayer: () => ({addTo(){return this;},on(){return this;}}),
    polyline: (path:unknown[],options:Record<string,unknown>) => new Line({...options,path}),
    marker: () => new Marker({map:undefined}),divIcon: () => ({}),latLngBounds: () => new Bounds(),
  };
  try {
    const selected: number[] = []; const map = new MealRouteMap(index => selected.push(index)); await map.start(async () => leaflet as never);
    const leg = { provider: { polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@', segments:[{polyline:'_p~iF~ps|U_ulLnnqC_mqNvxq`@',geometryKind:'stop_sequence'}] } };
    map.setPlan({ baseline: leg, options: [
      { place: { name: 'Lunch A' }, outbound: leg, onward: leg },
      { place: { name: 'Lunch B' }, outbound: leg, onward: leg },
    ] });
    assert.equal(lines[0].options.dashArray,'8 8'); assert.equal(lines.length, 5); assert.equal(markers.length, 4);
    assert.equal(fitted.length, 6, 'fit both legs of the initially selected meal route');
    const chips = nodes.get('#route-map-options')!.children;
    chips[3].events.click();
    assert.deepEqual(selected, [1]); assert.equal(chips[3].attributes['aria-pressed'], 'true');
    assert.equal(lines[3].options.color, '#2563eb'); assert.equal(lines[4].options.color, '#16804a');
    assert.equal(lines[1].options.color, '#94a3b8');
    markers[2].events.click(); assert.deepEqual(selected, [1, 0]);
    chips[0].events.click(); assert.equal(fitted.length, 15, 'all options include the direct journey');
    map.reset(); assert.ok(lines.every(line => line.options.map === null)); assert.ok(markers.every(marker => marker.map === null));
    assert.equal(nodes.get('#route-map-options')!.children.length, 0);
  } finally { for (const [name, value] of saved) { if (value === undefined) delete globals[name]; else globals[name] = value; } }
});
