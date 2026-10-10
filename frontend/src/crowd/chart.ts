import { formatTime, slotsForDay, WEEKDAYS, type CrowdPrediction, type CrowdSlot, type CrowdWeekday } from './prediction';
import { defaultCrowdDay } from './defaultDay';
import { appNow, CLOCK_EVENT, zurichClock } from '../time/clock';

const copy = {
  en: { eyebrow: 'PLAN YOUR LUNCH', title: 'Predicted crowd', minutes: 'min', subtitle: 'Typical occupancy, every 15 minutes.', day: 'Day', quiet: 'Quiet', moderate: 'Moderate', busy: 'Busy', now: 'Now', empty: 'No prediction available for this day.', missing: 'No prediction for this interval', preview: 'Preview data · Illustrative occupancy, not a live forecast.', backend: 'Estimated occupancy · 15-minute intervals · Zürich time.', chart: 'Predicted occupancy by time', occupancy: 'predicted occupancy', hint: 'Tap a bar, or use the arrow keys, to see its time slot.', hintTouch: 'Tap a bar to see its time slot.' },
  de: { eyebrow: 'PLANE DEIN MITTAGESSEN', title: 'Erwartete Auslastung', minutes: 'Min.', subtitle: 'Typische Auslastung im 15-Minuten-Takt.', day: 'Tag', quiet: 'Ruhig', moderate: 'Mäßig besucht', busy: 'Voll', now: 'Jetzt', empty: 'Für diesen Tag ist keine Prognose verfügbar.', missing: 'Keine Prognose für dieses Intervall', preview: 'Vorschaudaten · Beispielhafte Auslastung, keine Live-Prognose.', backend: 'Geschätzte Auslastung · 15-Minuten-Takt · Zürcher Zeit.', chart: 'Erwartete Auslastung nach Uhrzeit', occupancy: 'erwartete Auslastung', hint: 'Tippe auf einen Balken oder nutze die Pfeiltasten, um das Zeitfenster zu sehen.', hintTouch: 'Tippe auf einen Balken, um das Zeitfenster zu sehen.' },
};
type Key = keyof typeof copy.en;
const language = () => document.documentElement.lang === 'de' ? 'de' : 'en';
const t = (key: Key) => copy[language()][key];
const svgNS = 'http://www.w3.org/2000/svg';
function nowInZurich() {
  const { weekday, minutes } = zurichClock(appNow());
  return { day: weekday as CrowdWeekday, minute: minutes };
}
const weekdayName = (day: CrowdWeekday) => new Intl.DateTimeFormat(language(), { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 5 + WEEKDAYS.indexOf(day))));

document.querySelectorAll<HTMLElement>('[data-crowd-chart]').forEach(mountChart);

function mountChart(root: HTMLElement) {
  let prediction: CrowdPrediction;
  try { prediction = JSON.parse(root.querySelector('[data-crowd-data]')!.textContent!) as CrowdPrediction; }
  catch { return; }
  const daySelect = root.querySelector<HTMLSelectElement>('[data-crowd-day]')!;
  const bars = root.querySelector<SVGGElement>('[data-crowd-bars]')!;
  const svg = root.querySelector<SVGSVGElement>('[data-crowd-svg]')!;
  // Today, or Monday on Saturday and Sunday; the first day with data if that day has none.
  let day: CrowdWeekday = defaultCrowdDay(nowInZurich().day, d => slotsForDay(prediction, d).some(slot => slot.occupancyPct !== null));
  let slots: CrowdSlot[] = [];
  const readout = root.querySelector<HTMLElement>('[data-crowd-readout]');
  let selected = -1;

  /** One slot's time and value as text, so a tap or the keyboard can read what hovering shows as a tooltip. */
  function selectSlot(index: number) {
    if (!slots.length) return;
    selected = Math.max(0, Math.min(slots.length - 1, index));
    bars.querySelectorAll('rect').forEach((rect, i) => rect.classList.toggle('is-selected', i === selected));
    const slot = slots[selected]!;
    if (readout) readout.textContent = `${formatTime(slot.startMinute)}–${formatTime(slot.startMinute + 15)} · ${slot.occupancyPct === null ? t('missing') : `${slot.occupancyPct}% ${t('occupancy')}`}`;
  }
  svg.addEventListener('click', event => {
    const box = svg.getBoundingClientRect();
    if (box.width > 0 && slots.length) selectSlot(Math.floor((event.clientX - box.left) / box.width * slots.length));
  });
  svg.addEventListener('keydown', event => {
    const target = event.key === 'ArrowRight' ? selected + 1 : event.key === 'ArrowLeft' ? selected - 1
      : event.key === 'Home' ? 0 : event.key === 'End' ? slots.length - 1 : null;
    if (target === null) return;
    event.preventDefault();
    selectSlot(selected < 0 && event.key === 'ArrowLeft' ? slots.length - 1 : target);
  });

  function updateNow() {
    const now = nowInZurich();
    const first = slots[0]?.startMinute;
    const last = slots.at(-1)?.startMinute;
    const currentSlot = slots.find(slot => now.minute >= slot.startMinute && now.minute < slot.startMinute + 15);
    const visible = now.day === day && first !== undefined && last !== undefined && currentSlot?.occupancyPct != null;
    const line = root.querySelector<SVGLineElement>('[data-crowd-now]')!;
    line.style.display = visible ? '' : 'none';
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
    root.querySelector('[data-crowd-source]')!.textContent = t(prediction.source === 'preview' ? 'preview' : 'backend');
    slots = slotsForDay(prediction, day);
    selected = -1;
    if (readout) readout.textContent = t(window.matchMedia('(pointer: coarse)').matches ? 'hintTouch' : 'hint');
    const available = slots.some(slot => slot.occupancyPct !== null);
    root.querySelector<HTMLElement>('[data-crowd-content]')!.hidden = !available;
    root.querySelector<HTMLElement>('[data-crowd-empty]')!.hidden = available;
    if (!available) return;
    svg.setAttribute('aria-label', `${t('chart')} · ${weekdayName(day)} · ${slots.map(slot => `${formatTime(slot.startMinute)}: ${slot.occupancyPct === null ? t('missing') : `${slot.occupancyPct}%`}`).join(', ')}`);
    const width = 600 / slots.length;
    bars.replaceChildren(...slots.map((slot, i) => {
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', String(i * width + Math.min(3, width * .15)));
      rect.setAttribute('width', String(width - Math.min(6, width * .3)));
      rect.setAttribute('rx', '2');
      const height = slot.occupancyPct === null ? 2 : Math.max(1, slot.occupancyPct * 0.6);
      rect.setAttribute('y', String(60 - height)); rect.setAttribute('height', String(height));
      rect.setAttribute('class', slot.occupancyPct === null ? 'crowd-missing' : 'crowd-bar');
      if (slot.occupancyPct !== null) {
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
    updateNow();
  }

  function selectDay(next: CrowdWeekday) {
    day = next;
    render();
  }
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
  // A simulated time (developer tools) moves the "now" marker right away.
  document.addEventListener(CLOCK_EVENT, updateNow);
  setInterval(updateNow, 60_000);
}
