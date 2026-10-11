export type LocationSuggestion = {label: string; latitude: number; longitude: number; kind: string};

/** Keep the visible name, but use the exact selected coordinates until the field is edited. */
export class SelectedLocation {
  private selection?: LocationSuggestion;
  select(location: LocationSuggestion) { this.selection = location; }
  clear() { this.selection = undefined; }
  value(text: string) {
    return this.selection?.label === text ? `${this.selection.latitude},${this.selection.longitude}` : text.trim();
  }
}

export function attachLocationSuggestions(field: HTMLInputElement) {
  const selection = new SelectedLocation();
  const list = document.querySelector<HTMLElement>(`#${field.id}-suggestions`)!;
  const note = document.querySelector<HTMLElement>(`#${field.id}-location-status`)!;
  const cache = new Map<string, LocationSuggestion[]>();
  let timer: ReturnType<typeof setTimeout>, request: AbortController | undefined;
  let version = 0, active = -1, items: LocationSuggestion[] = [];
  const close = () => { list.hidden = true; field.setAttribute('aria-expanded', 'false'); field.removeAttribute('aria-activedescendant'); active = -1; };
  const choose = (item: LocationSuggestion) => {
    ++version; clearTimeout(timer); request?.abort(); selection.select(item); field.value = item.label;
    note.textContent = `Selected: ${item.label}`; close();
  };
  const highlight = () => {
    Array.from(list.children).forEach((child,i) => child.setAttribute('aria-selected', String(i === active)));
    if(active >= 0) field.setAttribute('aria-activedescendant', `${field.id}-suggestion-${active}`);
  };
  const show = (locations: LocationSuggestion[]) => {
    items = locations; active = -1; list.replaceChildren(); field.removeAttribute('aria-activedescendant');
    locations.forEach((item,i) => {
      const option = document.createElement('button'); option.type = 'button'; option.tabIndex = -1;
      option.id = `${field.id}-suggestion-${i}`; option.setAttribute('role','option'); option.setAttribute('aria-selected','false');
      option.textContent = `${item.label} · ${item.kind}`;
      option.addEventListener('pointerdown',event => event.preventDefault());
      option.addEventListener('click',() => choose(item)); list.append(option);
    });
    list.hidden = !locations.length; field.setAttribute('aria-expanded', String(!!locations.length));
    note.textContent = locations.length ? 'Choose a matching place, or keep typing a full address.' : 'No matches. Try a full street address or latitude,longitude.';
  };
  field.addEventListener('input', () => {
    selection.clear(); close(); clearTimeout(timer); request?.abort(); const current = ++version;
    const query = field.value.trim(); note.textContent = '';
    if(query.length < 3 || /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(query)) return;
    timer = setTimeout(async () => {
      note.textContent = 'Looking for matching places…';
      try {
        let locations = cache.get(query);
        if(!locations) {
          request = new AbortController();
          const response = await fetch(`/api/route-planner/locations?query=${encodeURIComponent(query)}`, {signal:request.signal,cache:'no-store'});
          if(!response.ok) throw new Error();
          locations = (await response.json()).locations;
          if(!Array.isArray(locations)) throw new Error();
          if(cache.size >= 20) cache.delete(cache.keys().next().value!);
          cache.set(query,locations!);
        }
        if(version === current && document.activeElement === field) show(locations!);
      } catch {
        if(version === current) {close(); note.textContent = 'Suggestions unavailable. You can still enter a full address or coordinates.';}
      }
    }, 500);
  });
  field.addEventListener('keydown', event => {
    if(event.key === 'Escape') {++version; clearTimeout(timer); request?.abort(); close(); return;}
    if(list.hidden || !items.length) return;
    if(event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); active = (active + (event.key === 'ArrowDown' ? 1 : active < 0 ? 0 : -1) + items.length) % items.length; highlight();
    } else if(event.key === 'Enter' && active >= 0) {event.preventDefault(); choose(items[active]);}
  });
  field.addEventListener('blur', () => {++version; clearTimeout(timer); request?.abort(); close();});
  return selection;
}
