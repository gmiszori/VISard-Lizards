import { activeSimulatedClock, appNow, clearSimulatedClock, setSimulatedClock, zurichParts, zurichToEpoch } from '../time/clock.ts';
import { addDays, weekdayIndex } from '../data/menuDate.ts';

/**
 * Developer tools section "Simulated time": sets the app's clock (src/time/clock.ts) to a Zurich date and
 * time, frozen or running, so weekdays and service hours can be tested on a weekend.
 */
export function mountClockPanel(onChange: () => void): void {
  const root = document.querySelector<HTMLElement>('[data-dev-clock]');
  if (!root) return;
  const date = root.querySelector<HTMLInputElement>('[data-dev-clock-date]')!;
  const time = root.querySelector<HTMLInputElement>('[data-dev-clock-time]')!;
  const running = root.querySelector<HTMLInputElement>('[data-dev-clock-running]')!;
  const status = root.querySelector<HTMLElement>('[data-dev-clock-status]')!;

  function apply(day: string, hhmm: string) {
    const at = zurichToEpoch(day, hhmm);
    if (at === null) { status.textContent = 'Enter a valid date and time.'; return; }
    setSimulatedClock(at, running.checked);
    status.textContent = `App time set to ${day} ${hhmm} (Zurich)${running.checked ? ', running' : ', frozen'}. Menus follow the day.`;
    renderClockPanel();
    onChange();
  }
  /** The next date (from the real today) with this weekday, 1 = Monday ... 5 = Friday. */
  function nextWeekday(target: number): string {
    const today = zurichParts(Date.now()).date;
    for (let i = 0; i < 8; i++) {
      const day = addDays(today, i)!;
      if (weekdayIndex(day) === target) return day;
    }
    return today;
  }

  root.querySelector('[data-dev-clock-apply]')!.addEventListener('click', () => apply(date.value, time.value));
  root.querySelectorAll<HTMLButtonElement>('[data-dev-clock-preset]').forEach(button => button.addEventListener('click', () => {
    const [weekday, hhmm] = button.dataset.devClockPreset!.split(' ');
    apply(nextWeekday(Number(weekday)), hhmm!);
  }));
  root.querySelector('[data-dev-clock-plus-hour]')!.addEventListener('click', () => {
    const next = zurichParts(appNow().getTime() + 3_600_000);
    apply(next.date, next.time);
  });
  root.querySelector('[data-dev-clock-reset]')!.addEventListener('click', () => {
    clearSimulatedClock();
    status.textContent = 'Using the real time again.';
    renderClockPanel();
    onChange();
  });
  renderClockPanel();
}

export function renderClockPanel(): void {
  const root = document.querySelector<HTMLElement>('[data-dev-clock]');
  if (!root) return;
  const clock = activeSimulatedClock();
  const now = zurichParts(appNow());
  const date = root.querySelector<HTMLInputElement>('[data-dev-clock-date]')!;
  const time = root.querySelector<HTMLInputElement>('[data-dev-clock-time]')!;
  // Keep what the developer is typing; fill the fields only when they are not focused.
  if (document.activeElement !== date) date.value = now.date;
  if (document.activeElement !== time) time.value = now.time;
  if (clock) root.querySelector<HTMLInputElement>('[data-dev-clock-running]')!.checked = clock.running;
  root.querySelector<HTMLElement>('[data-dev-clock-current]')!.textContent =
    `${clock ? 'Simulated' : 'Real'} app time: ${now.date} ${now.time} (Zurich, ${now.weekday})`;
}
