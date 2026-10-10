import { API_URL, ApiError, apiGet, apiPost } from '../data/api';
import { cooldownLeft, isOpenAt, occupancyOf, REPORT_COOLDOWN_MS, summarize, type CrowdLevel, type CrowdSummary, type LiveReport, type OpeningWindows } from './survey-logic';

/**
 * "How busy is it right now?" on the canteen page. Shown only while the mensa is open and a backend is
 * configured. Reports go to POST /api/mensas/{id}/crowd-reports; the reports of the last 30 minutes
 * (GET /api/mensas/{id}/crowd, `live`) are summarized in the card and replace the illustrative value in
 * the "Current crowd" box. With enough reports the backend also feeds the predicted crowd chart.
 */
const copy = {
  en: {
    title: 'How busy is it right now?', subtitle: 'Tap what you see. Your report helps others pick a good time.',
    level1: 'Empty', level2: 'Quiet', level3: 'Some queue', level4: 'Busy', level5: 'Packed',
    now: 'Right now:', reports: (n: number) => `${n} report${n === 1 ? '' : 's'} in the last 30 min`,
    none: 'No reports in the last 30 minutes yet.',
    unavailable: 'Current reports are unavailable. Please try again shortly.',
    sending: 'Sending…', thanks: 'Thanks! Your report is in.',
    cooldown: (m: number) => `You can report again in ${m} min.`,
    rateLimited: (m: number) => `Your report was not sent. Please wait ${m} min before reporting again.`,
    retryNow: 'Your report was not sent. Please try again.',
    error: 'Could not send your report. Please try again.',
  },
  de: {
    title: 'Wie voll ist es gerade?', subtitle: 'Tippe, was du siehst. Deine Meldung hilft anderen, eine gute Zeit zu finden.',
    level1: 'Leer', level2: 'Ruhig', level3: 'Etwas Schlange', level4: 'Viel los', level5: 'Sehr voll',
    now: 'Gerade:', reports: (n: number) => `${n} ${n === 1 ? 'Meldung' : 'Meldungen'} in den letzten 30 Min.`,
    none: 'In den letzten 30 Minuten noch keine Meldung.',
    unavailable: 'Aktuelle Meldungen sind gerade nicht verfügbar. Bitte versuche es gleich noch einmal.',
    sending: 'Wird gesendet…', thanks: 'Danke! Deine Meldung ist angekommen.',
    cooldown: (m: number) => `Neue Meldung in ${m} Min. möglich.`,
    rateLimited: (m: number) => `Deine Meldung wurde nicht gesendet. Bitte warte ${m} Min. vor der nächsten Meldung.`,
    retryNow: 'Deine Meldung wurde nicht gesendet. Bitte versuche es erneut.',
    error: 'Meldung konnte nicht gesendet werden. Bitte versuche es erneut.',
  },
};
type Copy = typeof copy.en;
const t = (): Copy => (document.documentElement.lang === 'de' ? copy.de : copy.en);
const LAST_REPORT_KEY = 'campuseats-crowd-last-report';
const RETRY_UNTIL_KEY = 'campuseats-crowd-retry-until';

interface LiveInfo { temporarilyClosed: boolean; windows: OpeningWindows }
interface CrowdResponse { live: LiveReport[] }

function readSavedTimes(key: string): Record<string, number> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === 'number' && Number.isFinite(value)));
  } catch { return {}; }
}
function rememberTime(key: string, mensaId: string, at: number) {
  try { localStorage.setItem(key, JSON.stringify({ ...readSavedTimes(key), [mensaId]: at })); } catch { /* the session keeps the cooldown in memory */ }
}

export function mountCrowdSurvey(): void {
  const root = document.querySelector<HTMLElement>('[data-crowd-survey]');
  const mensaId = root?.dataset.mensaId;
  if (!root || !mensaId || !API_URL) return;
  const live = (JSON.parse(document.querySelector('#live-data')?.textContent || '{}') as Record<string, LiveInfo>)[mensaId];
  if (!live) return;
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-survey-level]')];
  const summaryEl = root.querySelector<HTMLElement>('[data-survey-summary]')!;
  const statusEl = root.querySelector<HTMLElement>('[data-survey-status]')!;
  let reports: LiveReport[] = [];
  let summaryLoaded = false;
  let summaryFailed = false;
  let loading = false;
  let status: { kind: 'sending' | 'thanks' | 'error' | 'rateLimited' } | null = null;
  let busy = false;
  let lastReportedAt = readSavedTimes(LAST_REPORT_KEY)[mensaId] ?? null;
  let retryUntil = readSavedTimes(RETRY_UNTIL_KEY)[mensaId] ?? 0;

  function waitLeft(): number {
    const savedLastReport = readSavedTimes(LAST_REPORT_KEY)[mensaId!];
    if (savedLastReport !== undefined) lastReportedAt = Math.max(lastReportedAt ?? 0, savedLastReport);
    retryUntil = Math.max(retryUntil, readSavedTimes(RETRY_UNTIL_KEY)[mensaId!] ?? 0);
    return Math.max(cooldownLeft(lastReportedAt, Date.now()), retryUntil - Date.now(), 0);
  }

  function renderTexts() {
    const c = t();
    const summary = summarize(reports);
    root!.querySelectorAll<HTMLElement>('[data-survey-text]').forEach(el => {
      const value = c[el.dataset.surveyText as keyof Copy];
      if (typeof value === 'string') el.textContent = value;
    });
    buttons.forEach(b => b.setAttribute('aria-label', `${b.dataset.surveyLevel} / 5: ${c[`level${b.dataset.surveyLevel}` as keyof Copy]}`));
    summaryEl.replaceChildren();
    if (summary) {
      const label = document.createElement('strong');
      label.textContent = c[`level${summary.level}` as keyof Copy] as string;
      summaryEl.append(`${c.now} `, label, ` · ${c.reports(summary.count)}`);
    } else if (summaryLoaded) {
      summaryEl.textContent = c.none;
    } else if (summaryFailed) {
      summaryEl.textContent = c.unavailable;
    }
    const wait = waitLeft();
    buttons.forEach(b => { b.disabled = busy || wait > 0; });
    if (status?.kind === 'sending') statusEl.textContent = c.sending;
    else if (status?.kind === 'error') statusEl.textContent = c.error;
    else if (status?.kind === 'rateLimited') statusEl.textContent = wait > 0 ? c.rateLimited(Math.ceil(wait / 60_000)) : c.retryNow;
    else if (wait > 0) statusEl.textContent = status?.kind === 'thanks' && wait > 4 * 60_000 ? c.thanks : c.cooldown(Math.ceil(wait / 60_000));
    else statusEl.textContent = '';
    updateCurrentCrowdBox(summary);
  }

  /** Real reports replace the illustrative value of the "Current crowd" box (src/scripts/live-status.ts skips it then). */
  function updateCurrentCrowdBox(summary: CrowdSummary | null) {
    const box = document.querySelector<HTMLElement>(`[data-live="crowd"][data-live-id="${CSS.escape(mensaId!)}"]`);
    if (!box) return;
    if (!summary || root!.hidden) {
      if (box.dataset.crowdReported) {
        delete box.dataset.crowdReported;
        delete box.dataset.occupancy;
        box.removeAttribute('title');
        // Give the normal status renderer ownership again, including its translated closed state.
        document.dispatchEvent(new Event('campuseats:crowd-reset'));
      }
      return;
    }
    box.dataset.crowdReported = 'true';
    box.dataset.occupancy = occupancyOf(summary.level);
    // The survey translates this label itself; without data-i18n the layout's translation leaves it alone.
    delete box.dataset.i18n;
    box.textContent = t()[`level${summary.level}` as keyof Copy] as string;
    box.title = t().reports(summary.count);
  }

  async function loadSummary() {
    if (loading) return;
    loading = true;
    try {
      const response = await apiGet<CrowdResponse>(`/api/mensas/${encodeURIComponent(mensaId!)}/crowd`);
      if (!Array.isArray(response.live)) throw new Error('Invalid crowd response');
      reports = response.live;
      summaryLoaded = true;
      summaryFailed = false;
    } catch {
      reports = [];
      summaryLoaded = false;
      summaryFailed = true;
    } finally { loading = false; }
    renderTexts();
  }

  async function report(level: CrowdLevel, button: HTMLButtonElement) {
    if (busy || waitLeft() > 0) return;
    if (root!.hidden || !isOpenAt(live!.windows, live!.temporarilyClosed, now())) {
      refreshVisibility();
      return;
    }
    busy = true;
    status = { kind: 'sending' };
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    renderTexts();
    try {
      await apiPost(`/api/mensas/${encodeURIComponent(mensaId!)}/crowd-reports`, { level });
      lastReportedAt = Date.now();
      rememberTime(LAST_REPORT_KEY, mensaId!, lastReportedAt);
      status = { kind: 'thanks' };
    } catch (error) {
      buttons.forEach(b => b.setAttribute('aria-pressed', 'false'));
      if (error instanceof ApiError && error.status === 429) {
        retryUntil = Date.now() + (error.retryAfterMs ?? REPORT_COOLDOWN_MS);
        rememberTime(RETRY_UNTIL_KEY, mensaId!, retryUntil);
        status = { kind: 'rateLimited' };
      } else {
        status = { kind: 'error' };
      }
    } finally {
      busy = false;
    }
    await loadSummary();
  }

  // Development only: ?crowdNow=2026-10-12T12:00:00%2B02:00 shows the survey as if it were that time (like ?ratingNow=).
  const override = import.meta.env.DEV ? new URL(location.href).searchParams.get('crowdNow') : null;
  const now = () => (override && Number.isFinite(Date.parse(override)) ? new Date(override) : new Date());

  function refreshVisibility() {
    const open = isOpenAt(live!.windows, live!.temporarilyClosed, now());
    const wasHidden = root!.hidden;
    root!.hidden = !open;
    if (!open) {
      reports = [];
      summaryLoaded = false;
      summaryFailed = false;
    }
    renderTexts();
    if (open && wasHidden) void loadSummary();
  }

  buttons.forEach(button => button.addEventListener('click', () => report(Number(button.dataset.surveyLevel) as CrowdLevel, button)));
  document.addEventListener('languagechange', renderTexts);
  window.addEventListener('storage', event => {
    if (event.key === LAST_REPORT_KEY || event.key === RETRY_UNTIL_KEY) renderTexts();
  });
  refreshVisibility();
  setInterval(refreshVisibility, 60_000);
  setInterval(() => { if (!root.hidden) void loadSummary(); }, 2 * 60_000);
}
