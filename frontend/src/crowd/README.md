# Predicted crowd

The canteen detail page shows a small, orientative weekday histogram (about 60 px high): occupancy on a fixed 0–100% scale, one bar per 15-minute interval, with the exact value in each bar's tooltip and in the chart's accessible label. There is no slider. The chart opens on today, or on Monday on Saturday and Sunday (`defaultDay.ts`). The dashed marker follows the current time in Europe/Zurich. Missing intervals remain gaps, and days without predictions show an empty state.

Initially the chart uses the synthetic `CROWD` module and is visibly labelled **Preview data**. Opening windows exclude closed hours; temporarily closed mensas have no preview prediction. `src/scripts/live-feedback.ts` loads `GET /api/mensas/{id}/crowd` on page load, every two minutes, after successful feedback, and when returning to the tab. Once at least ten reports exist (`histogram.sufficient`), it replaces the chart with backend predictions (`source: 'backend'`) without rebuilding or reloading. Missing slots remain unknown.

## Backend contract

`CrowdPrediction` in `prediction.ts` is the frontend contract:

```ts
{
  mensaId: 'polyterrasse',
  intervalMinutes: 15,
  timeZone: 'Europe/Zurich',
  source: 'backend',
  byWeekday: {
    mon: { '11:00': 25, '11:15': 40, '11:30': null, '11:45': 65 }
  }
}
```

Times are Zurich local start times, aligned to 00/15/30/45. Values are predicted occupancy percentages; `null` or an omitted slot means unknown, while `0` means a known prediction of zero occupancy. Do not substitute raw visit frequency for occupancy without a backend-defined capacity/model conversion.

Pass this shape as the Astro component's `prediction` prop, or dispatch `new CustomEvent('campuseats:crowd-prediction', { detail: prediction })` from the future API adapter to update an existing chart. Mark actual backend predictions `source: 'backend'`; never relabel the sample series.

The backend's `GET /api/mensas/{id}/crowd` returns `histogram.byWeekday` in exactly this shape (15-minute Zurich slots, `null` for slots without reports, opening hours defining the slots).

## Crowd survey ("How busy is it right now?")

`CrowdSurvey.astro` sits below the opening hours on the canteen page. While the mensa is open (Zurich
time, opening windows from `#live-data`) and a backend is configured, visitors pick one of five levels
(empty, quiet, some queue, busy, packed). Reports go to `POST /api/mensas/{id}/crowd-reports`; the card
then summarizes the reports of the last 30 minutes (`GET /api/mensas/{id}/crowd`, `live`): the level is the rounded mean of the 6 newest reports, each
weighted by its age (half-life 10 minutes), so it follows a change after a few reports
and the "Current crowd" box shows that real level instead of the illustrative value
(`live-status.ts` skips boxes marked `data-crowd-reported`). With at least 10 reports the backend's
prediction replaces the preview chart.

Homepage crowd badges also use real recent reports through `src/scripts/live-feedback.ts`, with the same weighted summary, translated labels and opening-window checks. Detail summaries remain owned by the survey. Backend polling is bounded to four concurrent requests; accepted feedback triggers a refresh.

Live summaries expire after 30 minutes in the browser, including while the page stays open without a
new response. Empty or failed refreshes and closing time release the current-crowd display back to
the normal opening/status renderer; a failed refresh says that current reports are unavailable.

A device can report a mensa once every 5 minutes, like the backend's per-IP limit. A `429` says that
the report was not sent and disables the buttons for the server's `Retry-After` interval (5 minutes
when that header is absent or invalid). Retry deadlines are stored separately from accepted reports,
and the cooldown also works in memory when browser storage is unavailable. Logic lives in
`survey-logic.ts` (tested in `survey.test.ts`).
In development, `?crowdNow=2026-10-12T12:00:00%2B02:00` shows the survey as if it were that time.

### Testing the survey without a backend (developer tools)

Settings → **Dev mode** shows the developer tools on the home page. Their **Crowd survey mock** section
switches the survey on this device to mock reports (`survey-mock.ts`, stored under
`campuseats-dev-crowd-mock`): pick a mensa, a level and a number of reports, add them, then open the
canteen page. While the mock is on, the survey never calls the backend, its card shows "Mock data", and
"Show the survey even when the mensa is closed" lets you test outside opening hours. "Reset report lock"
clears the 5-minute device lock. The predicted crowd chart keeps using the backend.
