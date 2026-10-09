# Data (`canteens.ts`)

`canteens.ts` is the hard-coded database of the app: 22 ETH and UZH mensas (Zentrum 13, Hönggerberg 5, Irchel 4) and 901 real dishes
from **2026-09-28 to 2026-10-09**. It is generated, so don't edit it by hand. Ask Martin to regenerate it.

| What | Real? |
| --- | --- |
| Mensas: address, contacts, opening hours, payment options, photo links | real (UZH hours curated from the operator's page text, see `hoursSource`) |
| Dishes: title, components, prices (student / staff / external), allergens, origin, diet | real |
| Nutrition: ETH per 100 g, UZH per serving | real. ETH per-portion values are **estimated** (`estimated: true`) |
| Crowd (`CROWD`): 15-minute series and typical weekday profile | **fake**, flagged `synthetic: true` |
| Mensa star ratings (`rating`) | **fake**, flagged `synthetic: true` |

## What the pages use now

| Export | Used by |
| --- | --- |
| `CANTEENS` (`Canteen`, `MenuItem`) | index page, `CanteenCard`, `[id].astro`, `MenuItem` |
| `formatPrice()` | `CanteenCard`, `MenuItem`: prints `–` when the source has no price |
| `LIVE_DATA` | `BaseLayout` embeds it as `#live-data`; `scripts/live-status.ts` refreshes **Open now**, today's hours and the crowd level in the browser every minute (the site is static, so build-time values would go stale) |
| `Canteen.campusId` (`zentrum` / `hoenggerberg` / `irchel`) | campus filter in Settings and `scripts/preferences.ts` ("Zentrum" covers ETH **and** UZH) |

The menu shown is `MENU_DATE`: today if the database has it, otherwise the latest earlier day (on weekends that is Friday).

## Features the data already supports (not built yet)

Everything below is available through `DB`, `MENSAS`, `MEALS`, `CROWD`, `mealsOf(mensaId, date, service?)`, `levelFromPct()`.

1. **Day picker / week view.** `MEALS` covers 10 weekdays. Use `mealsOf(id, date)`. Show the menu date in the UI (`MENU_DATE`).
2. **Lunch / Dinner switch.** Every `MenuItem` has `service`. Dinner exists at Polyterrasse, Untere Mensa, Alumni quattro Lounge and Seerose.
3. **Nutrition on cards and detail pages.** `MenuItem.kcal` and `proteinG` (per portion). Full values in `MEALS[].nutrition.perPortion` and `.per100g`.
   Show a hint when `estimated` is true, and "no data" when `nutrition` is `null` (FUSION meal and Rice Up! publish none). Skip values with `suspect: true`.
4. **Protein / calorie filters** in Settings (exclude dishes without nutrition data, tell the user how many were hidden).
5. **Dish photos.** `MenuItem.imageUrl` (756 of 901 dishes). Image rights belong to ETH, ZFV and SV Group, check before going public.
6. **Allergen filter.** `Meal.allergens` are canonical ids (`gluten`, `milk`, ...). Labels are English only so far, so add German ones to the i18n table.
7. **Fish as its own diet**, plus **eco badges**: `Meal.dietTag === 'fish'`, `Meal.ecoScore` (ETH, e.g. "C+"), `Meal.climateImpact` (UZH, LOW/MEDIUM/HIGH).
8. **"Popular times" chart** per mensa: `CROWD[id].typicalByWeekday[weekday].pct` (15-minute slots) and `CROWD[id].days[date]` for the real dates. Needs a "closed" state: the crowd label currently shows "Quiet" on closed days.
9. **Mensa detail extras:** `address`, `contact` (phone, website), `paymentOptions`, `closures`, all `pictures` (gallery), `operator`.
10. **Distance and "nearest mensa":** every mensa has `coordinates` (lat/lng), and each campus has its own in `CAMPUSES[].coordinates`.
11. **Price category setting** (student / worker / external) to show one price instead of three.
12. **Origin of meat/fish:** `Meal.origin` and `originDetail`.
13. **Real ratings and crowd reports** need a backend. Until then they stay fake.

## Notes

- ETH texts are English, UZH texts are German (`Meal.language`). ETH dishes also have `titleDe`.
- `Lichthof` is temporarily closed (`temporarilyClosed`). `Irchel Bar` has no menu.
- Prices of 0.00 in the source are stored as `null`. Dozentenfoyer has one price for everyone (`priceNote`).
