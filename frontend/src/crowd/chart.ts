import { formatTime, slotsForDay, WEEKDAYS, type CrowdPrediction, type CrowdSlot, type CrowdWeekday } from './prediction';
import { mountBudgetSlider } from '../onboarding/budgetSlider';

const copy = {
  en: { eyebrow: 'PLAN YOUR LUNCH', title: 'Predicted crowd', minutes: 'min', subtitle: 'Typical occupancy, every 15 minutes.', day: 'Day', quiet: 'Quiet', moderate: 'Moderate', busy: 'Busy', now: 'Now', explore: 'Slide to explore the day', empty: 'No prediction available for this day.', missing: 'No prediction for this interval', preview: 'Preview data · Illustrative occupancy, not a live forecast.', backend: 'Estimated occupancy · 15-minute intervals · Zürich time.', chart: 'Predicted occupancy by time', occupancy: 'predicted occupancy' },
  de: { eyebrow: 'PLANE DEIN MITTAGESSEN', title: 'Erwartete Auslastung', minutes: 'Min.', subtitle: 'Typische Auslastung im 15-Minuten-Takt.', day: 'Tag', quiet: 'Ruhig', moderate: 'Mäßig besucht', busy: 'Voll', now: 'Jetzt', explore: 'Schieben, um den Tag zu erkunden', empty: 'Für diesen Tag ist keine Prognose verfügbar.', missing: 'Keine Prognose für dieses Intervall', preview: 'Vorschaudaten · Beispielhafte Auslastung, keine Live-Prognose.', backend: 'Geschätzte Auslastung · 15-Minuten-Takt · Zürcher Zeit.', chart: 'Erwartete Auslastung nach Uhrzeit', occupancy: 'erwartete Auslastung' },
};
type Key = keyof typeof copy.en;
const language = () => document.documentElement.lang === 'de' ? 'de' : 'en';
const t = (key: Key) => copy[language()][key];
const svgNS = 'http://www.w3.org/2000/svg';
function nowInZurich() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return { day: part('weekday').toLowerCase() as CrowdWeekday, minute: Number(part('hour')) * 60 + Number(part('minute')) };
}
const weekdayName = (day: CrowdWeekday) => new Intl.DateTimeFormat(language(), { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 5 + WEEKDAYS.indexOf(day))));

document.querySelectorAll<HTMLElement>('[data-crowd-chart]').forEach(mountChart);

function mountChart(root: HTMLElement) {
  let prediction: CrowdPrediction;
  try { prediction = JSON.parse(root.querySelector('[data-crowd-data]')!.textContent!) as CrowdPrediction; }
  catch { return; }
  const daySelect = root.querySelector<HTMLSelectElement>('[data-crowd-day]')!;
  const slider = root.querySelector<HTMLInputElement>('[data-crowd-slider]')!;
  const bars = root.querySelector<SVGGElement>('[data-crowd-bars]')!;
  const svg = root.querySelector<SVGSVGElement>('[data-crowd-svg]')!;
  let day = nowInZurich().day;
  if (!slotsForDay(prediction, day).length) day = WEEKDAYS.find(d => slotsForDay(prediction, d).length) ?? day;
  let slots: CrowdSlot[] = [];
  let selected = 0;

  function showSelected() {
    const slot = slots[selected];
    if (!slot) return;
    const time = `${formatTime(slot.startMinute)}–${formatTime(slot.startMinute + 15)}`;
    const level = slot.occupancyPct === null ? 'missing' : slot.occupancyPct < 40 ? 'quiet' : slot.occupancyPct < 70 ? 'moderate' : 'busy';
    root.querySelector('[data-crowd-selected-time]')!.textContent = time;
    root.querySelector('[data-crowd-selected-level]')!.textContent = t(level);
    root.querySelector('[data-crowd-selected-value]')!.textContent = slot.occupancyPct === null ? '—' : `${slot.occupancyPct}%`;
    slider.setAttribute('aria-valuetext', `${time}: ${slot.occupancyPct === null ? t('missing') : `${slot.occupancyPct}% ${t('occupancy')}`}`);
    bars.querySelectorAll<SVGRectElement>('[data-slot]').forEach(bar => bar.dataset.selected = String(Number(bar.dataset.slot) === selected));
  }

  function updateNow() {
    const now = nowInZurich();
    const first = slots[0]?.startMinute;
    const last = slots.at(-1)?.startMinute;
    const currentSlot = slots.find(slot => now.minute >= slot.startMinute && now.minute < slot.startMinute + 15);
    const visible = now.day === day && first !== undefined && last !== undefined && currentSlot?.occupancyPct != null;
    const line = root.querySelector<SVGLineElement>('[data-crowd-now]')!;
    line.toggleAttribute('hidden', !visible);
    root.querySelector<HTMLElement>('[data-crowd-now-legend]')!.hidden = !visible;
    if (visible) {
      const x = (now.minute - first!) / (last! + 15 - first!) * 600;
      line.setAttribute('x1', String(x)); line.setAttribute('x2', String(x));
    }
  }

  function render() {
    root.querySelectorAll<HTMLElement>('[data-crowd-text]').forEach(el => el.textContent = t(el.dataset.crowdText as Key));
    const names = WEEKDAYS.map(weekdayName);
    daySelect.replaceChildren(...WEEKDAYS.map((d, i) => new Option(names[i], d)));
    daySelect.value = day;
    daySelect.setAttribute('aria-label', t('day'));
    slider.setAttribute('aria-label', t('explore'));
    root.querySelector('[data-crowd-source]')!.textContent = t(prediction.source === 'preview' ? 'preview' : 'backend');
    slots = slotsForDay(prediction, day);
    const available = slots.some(slot => slot.occupancyPct !== null);
    root.querySelector<HTMLElement>('[data-crowd-content]')!.hidden = !available;
    root.querySelector<HTMLElement>('[data-crowd-empty]')!.hidden = available;
    if (!available) return;
    selected = Math.min(selected, slots.length - 1);
    slider.max = String(slots.length - 1);
    slider.value = String(selected);
    slider.disabled = slots.length < 2;
    svg.setAttribute('aria-label', `${t('chart')} · ${weekdayName(day)} · ${slots.map(slot => `${formatTime(slot.startMinute)}: ${slot.occupancyPct === null ? t('missing') : `${slot.occupancyPct}%`}`).join(', ')}`);
    const width = 600 / slots.length;
    bars.replaceChildren(...slots.map((slot, i) => {
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', String(i * width + Math.min(3, width * .15)));
      rect.setAttribute('width', String(width - Math.min(6, width * .3)));
      rect.setAttribute('rx', '4');
      const height = slot.occupancyPct === null ? 3 : Math.max(1, slot.occupancyPct * 1.8);
      rect.setAttribute('y', String(180 - height)); rect.setAttribute('height', String(height));
      rect.setAttribute('class', slot.occupancyPct === null ? 'crowd-missing' : 'crowd-bar');
      if (slot.occupancyPct !== null) {
        rect.dataset.slot = String(i);
        rect.dataset.level = slot.occupancyPct < 40 ? 'quiet' : slot.occupancyPct < 70 ? 'moderate' : 'busy';
      }
      const title = document.createElementNS(svgNS, 'title');
      title.textContent = `${formatTime(slot.startMinute)}–${formatTime(slot.startMinute + 15)} · ${slot.occupancyPct === null ? t('missing') : `${slot.occupancyPct}%`}`;
      rect.append(title);
      return rect;
    }));
    const start = slots[0]!.startMinute;
    const end = slots.at(-1)!.startMinute + 15;
    root.querySelector('[data-crowd-ticks]')!.replaceChildren(...[start, Math.round((start + end) / 2 / 15) * 15, end].map(minute => {
      const span = document.createElement('span'); span.textContent = formatTime(minute); return span;
    }));
    showSelected();
    updateNow();
  }

  function selectDay(next: CrowdWeekday) {
    day = next;
    const nextSlots = slotsForDay(prediction, day);
    const now = nowInZurich();
    const current = now.day === day ? nextSlots.findIndex(slot => now.minute >= slot.startMinute && now.minute < slot.startMinute + 15) : -1;
    const noon = nextSlots.findIndex(slot => slot.startMinute >= 12 * 60);
    selected = current >= 0 ? current : Math.max(0, noon);
    render();
  }
  mountBudgetSlider(slider, value => { selected = value; showSelected(); });
  daySelect.addEventListener('change', () => selectDay(daySelect.value as CrowdWeekday));
  document.addEventListener('languagechange', render);
  // The backend adapter can replace preview data without remounting the chart.
  document.addEventListener('campuseats:crowd-prediction', event => {
    const next = (event as CustomEvent<CrowdPrediction>).detail;
    if (!next || next.mensaId !== root.dataset.mensaId || next.intervalMinutes !== 15 || next.timeZone !== 'Europe/Zurich' ||
      !next.byWeekday || typeof next.byWeekday !== 'object' || !['preview', 'backend'].includes(next.source)) return;
    prediction = next;
    selectDay(day);
  });
  selectDay(day);
  setInterval(updateNow, 60_000);
}
