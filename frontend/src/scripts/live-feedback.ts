import { API_URL, apiGet, type BackendCrowd } from '../data/api';
import { parseMensas } from '../data/validate';
import { occupancyOf, summarize, isOpenAt, type OpeningWindows, type LiveReport } from '../crowd/survey-logic';
import { appNow, CLOCK_EVENT } from '../time/clock';

interface LiveInfo { temporarilyClosed: boolean; windows: OpeningWindows }
const data = JSON.parse(document.querySelector('#live-data')?.textContent ?? '{}') as Record<string, LiveInfo>;
const reports = new Map<string, LiveReport[]>();
const ids = [...new Set([...document.querySelectorAll<HTMLElement>('[data-live="crowd"][data-live-id]')].map(el => el.dataset.liveId!))];
let loading = false;
let queued = false;

function renderCrowds() {
  let reset = false;
  for (const box of document.querySelectorAll<HTMLElement>('[data-feedback-crowd], [data-canteen-card] [data-live="crowd"]')) {
    const id = box.dataset.liveId!;
    const info = data[id];
    const summary = info && isOpenAt(info.windows, info.temporarilyClosed, appNow()) ? summarize(reports.get(id) ?? []) : null;
    const label = box.querySelector<HTMLElement>('[data-crowd-label]');
    if (!label) continue;
    if (!summary) {
      if (box.dataset.feedbackCrowd) {
        delete box.dataset.crowdReported;
        delete box.dataset.feedbackCrowd;
        delete box.dataset.occupancy;
        box.removeAttribute('title');
        reset = true;
      }
      continue;
    }
    box.dataset.feedbackCrowd = 'true';
    box.dataset.crowdReported = 'true';
    box.dataset.occupancy = occupancyOf(summary.level);
    delete label.dataset.i18n;
    const german = document.documentElement.lang === 'de';
    label.textContent = (german ? ['Leer', 'Ruhig', 'Etwas Schlange', 'Viel los', 'Sehr voll'] : ['Empty', 'Quiet', 'Some queue', 'Busy', 'Packed'])[summary.level - 1]!;
    box.title = german ? `${summary.count} Meldungen in den letzten 30 Min.` : `${summary.count} reports in the last 30 min`;
  }
  if (reset) document.dispatchEvent(new Event('campuseats:crowd-reset'));
}

async function refresh() {
  if (!API_URL || document.hidden) return;
  if (loading) { queued = true; return; }
  loading = true;
  try {
    if (document.querySelector('[data-canteen-rating]')) {
      try {
        const ratings = new Map(parseMensas(await apiGet('/api/mensas')).map(m => [m.id, m.avgRating]));
        document.querySelectorAll<HTMLElement>('[data-canteen-rating]').forEach(el => {
          const rating = ratings.get(el.dataset.canteenRating!);
          el.hidden = rating == null;
          el.textContent = rating == null ? '' : `★ ${rating.toFixed(1)}`;
        });
      } catch { /* retain the last known average during transient failures */ }
    }
    let index = 0;
    await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
      while (index < ids.length) {
        const id = ids[index++]!;
        try {
          const response = await apiGet<BackendCrowd & { live: LiveReport[] }>(`/api/mensas/${encodeURIComponent(id)}/crowd`);
          reports.set(id, Array.isArray(response.live) ? response.live : []);
          if (response.histogram?.sufficient && response.histogram.byWeekday) {
            document.dispatchEvent(new CustomEvent('campuseats:crowd-prediction', { detail: {
              mensaId: id, intervalMinutes: 15, timeZone: 'Europe/Zurich', source: 'backend', byWeekday: response.histogram.byWeekday,
            } }));
          }
        } catch { reports.delete(id); }
      }
    }));
    renderCrowds();
  } finally {
    loading = false;
    if (queued) { queued = false; void refresh(); }
  }
}
if (API_URL && (ids.length || document.querySelector('[data-canteen-rating]'))) {
  void refresh();
  setInterval(() => void refresh(), 120_000);
  setInterval(renderCrowds, 30_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  document.addEventListener('campuseats:feedback-changed', () => void refresh());
  document.addEventListener('languagechange', renderCrowds);
  document.addEventListener(CLOCK_EVENT, renderCrowds);
}
