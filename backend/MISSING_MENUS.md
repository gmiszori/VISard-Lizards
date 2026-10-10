# Lichthof, Polysnack and Irchel Bar

Checked on 2026-10-10, for the week of 2026-10-05. These are three different
availability cases; an empty menu is not always a scraping failure.

| Location | Verified result | Retrieval strategy |
| --- | --- | --- |
| Polysnack | 30 meals already exist in the backend snapshot (2026-09-28 through 2026-10-09). The live feed has 15 meal lines for October 5-9. | ETH Cookpit JSON, facility ID **10**, with pagination and week filtering. No HTML scraper or API key needed. |
| Lichthof | The operator reports temporary closure for construction. The public FOOD2050 weekly calendar contains seven days and zero menu items for this week. | Retain closure status and empty menu. The public weekly page can be checked again when it reopens; the ZFV GraphQL client is another option with a working key. |
| Irchel Bar | The operator page lists opening hours but no public FOOD2050 menu link. The bundled snapshot has no meals. | No verified public daily-menu feed found. Obtain a published snack/menu list or a supported outlet/feed identifier from the operator before importing meals. |

## Polysnack in Java

The new method returns a JSON `String` containing `weekly-rota-array` for one
facility and the Monday-based week containing the date:

```java
String json = ethMensaClient.fetchFacilityWeeklyRotas(
        10, LocalDate.of(2026, 10, 9), "en");
```

It fetches all pages before selecting the matching rota. It preserves upstream
meal fields and does not create DTOs. If that week is absent, it returns an empty
array rather than substituting an older menu. Map the nested structure:

```text
weekly-rota-array
  -> day-of-week-array
    -> opening-hour-array
      -> meal-time-array
        -> line-array
          -> meal
```

Polysnack's lunch is named `Pranzo (Lunch)` in the English feed. Do not rely on an
exact `Lunch` string when mapping service times. The data includes price tiers,
allergens, nutrition, image URLs and the information text about the renovation.
Match `valid-from` to the requested Monday and `day-of-week-code` to the requested
weekday (Monday = 1, Sunday = 7). A weekend has no meal lines.

With `mensa.upstream.enabled=true`, the equivalent optional raw HTTP route is:

```text
GET /api/upstream/eth/facilities/10/weekly-rotas?date=2026-10-09&language=en
```

The existing app route also already serves the snapshot's three Friday meals:

```text
GET /api/mensas/polysnack/meal-plan?dateStart=2026-10-09&dateEnd=2026-10-09
```

Adding raw retrieval does not replace the snapshot repository automatically.

## Reproduce the source investigation

From the repo root using PowerShell 7.5 or later:

```powershell
pwsh -File backend/scripts/check-missing-menus.ps1 -Date 2026-10-09
```

The script saves the ETH pages, selected Polysnack rota, public Lichthof weekly
HTML and operator pages under `backend/target/menu-sources/2026-10-09/`.
`report.json` records meal counts, the closure notice and whether Irchel Bar's
page exposes a FOOD2050 link. These diagnostic files are ignored by Git. The
script does not alter the app's JSON database or submit requests to authenticated
APIs. Its date parameter selects the ISO week, not a single day's meals.

The Lichthof check reads public JSON hydration records from the FOOD2050 page;
it never executes JavaScript. This website format is not a stable API contract.
If the outlet/calendar format changes or the wrong week is returned, the script
fails instead of reporting zero meals. The raw HTML is retained for inspection.
Do not treat an absent link on Irchel Bar's page as proof that it serves no food.

## Official sources and caveats

- [Polysnack official page](https://ethz.ch/en/campus/getting-to-know/cafes-restaurants-shops/gastronomy/restaurants-and-cafeterias/zentrum/polysnack.html): closure **12-16 October 2026** for renovation. This is a future closure relative to the checked menu week.
- [Cookpit weekly JSON](https://idapps.ethz.ch/cookpit-pub-services/v1/weeklyrotas?client-id=ethz-wcms&lang=en&rs-first=0&rs-size=50&valid-after=2026-10-05): query all pages, then facility/week; `valid-after` alone does not restrict the response to one week.
- [Lichthof operator page](https://www.zfv.ch/de/essen-gehen/lichthof): temporarily closed for construction; no reopening date stated.
- [Lichthof public weekly page](https://app.food2050.ch/de/zfv/universitat-zurich%2Ccampus-zentrum/lichthof/mittagsverpflegung/menu/weekly?week=41&year=2026): outlet ID `cm1tjarfv00h372q4ygm5o4wr`, empty weekly calendar. Its `weekly.pdf` endpoint returned HTTP 200 but a **zero-page PDF**, so HTTP success is not evidence of a menu.
- [Irchel Bar operator page](https://www.zfv.ch/de/essen-gehen/irchel-bar): Monday-Friday 11:00-23:00, phone `+41 44 635 40 40`, email `irchelbar@zfv.ch`. No current public meal-plan link found in the page HTML. Nearby-restaurant menu links belong to other restaurants.
- [UZH location directory](https://www.mensa.uzh.ch/de/Standorte-und-Verpflegung.html): links to those operator pages. Its separate Irchel Bar subpage advertises events, not a food menu.

The catering PDFs linked on the UZH/ZFV pages contain event-order items and
prices. They are not evidence that the same dishes are available daily at Irchel
Bar or Lichthof. Do not import them as daily meals. A working ZFV API key could
enable further outlet discovery, but Irchel Bar availability through that API
has not been verified. Do not reuse the Mensa Irchel or Seerose feed for the bar.
