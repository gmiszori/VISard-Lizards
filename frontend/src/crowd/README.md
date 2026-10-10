# Predicted crowd

The canteen detail page shows a small, orientative weekday histogram (about 60 px high): occupancy on a fixed 0–100% scale, one bar per 15-minute interval, with the exact value in each bar's tooltip and in the chart's accessible label. There is no slider. The chart opens on today, or on Monday on Saturday and Sunday (`defaultDay.ts`). The dashed marker follows the current time in Europe/Zurich. Missing intervals remain gaps, and days without predictions show an empty state.

The current data comes from the existing synthetic `CROWD` module and is visibly labelled **Preview data**. Opening windows exclude closed hours; temporarily closed mensas have no preview prediction. On the detail page, a small adapter in `src/pages/canteen/[id].astro` loads `GET /api/mensas/{id}/crowd` and dispatches the backend prediction (`source: 'backend'`) once the backend has enough reports (`histogram.sufficient`); until then the preview stays, labelled as such.

## Backend handoff

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
then summarizes the reports of the last 30 minutes (`GET /api/mensas/{id}/crowd`, `live`, rounded mean)
and the "Current crowd" box shows that real level instead of the illustrative value
(`live-status.ts` skips boxes marked `data-crowd-reported`). With at least 10 reports the backend's
prediction replaces the preview chart.

A device can report a mensa once every 5 minutes, like the backend's per-IP limit; a `429` from the
backend is treated as "already reported". Logic lives in `survey-logic.ts` (tested in `survey.test.ts`).
In development, `?crowdNow=2026-10-12T12:00:00%2B02:00` shows the survey as if it were that time.
