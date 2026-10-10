# Predicted crowd

The canteen detail page shows a weekday histogram, with occupancy on a fixed 0–100% scale and one bar per 15-minute interval. The slider explores individual intervals; the dashed marker follows the current time in Europe/Zurich. Missing intervals remain gaps, and days without predictions show an empty state.

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
