# Overnight report — 2026-10-10

Branch for the experiments: **`claude/overnight-playground`** (already pushed, based on the current `main`).
Everything marked **main** is already merged and pushed to `main`; nothing in `backend/` was touched anywhere.

## 1. Fixes pushed to `main`

| Commit | What | Why it matters |
| --- | --- | --- |
| `c8ed2dd` | Prices from an older backend (only `price`, no `prices`) are read; other tiers are requested and merged | The "prices missing" bug. Checked end-to-end against a simulated old backend: student / worker / external all show. No tier is ever filled in with another tier's price |
| `7158c4f` | Buffets sold by weight (Dozentenfoyer, FUSION meal) show "per 100 g" | CHF 3.20 looked like a plate price, a 400 g portion is 4× that |
| `bb12d5b` | Search ignores umlauts (`zurich`, `hornli`, `spaetzli`) | Phones without umlaut keys found nothing |
| `f1fb740` | Onboarding "Today's pick" uses the live menu, not the Oct-5 snapshot | It could recommend a dish that no longer exists |
| `f619561` | Header and search usable at 320 px (German) | Brand overlapped the settings link, texts cut |
| `d650f02` | Empty home page gets "Show all canteens" + "Check my settings" | Dead end before |
| `3dcdb9b` | Grey text contrast 4.1 → 5.0 : 1 (55 elements on the home page) | WCAG AA |
| `c6a27a2` | "Skip to content" link | Keyboard users |
| `3377f7e` | German page titles, `h1` on the home page | Screen readers |
| `4384814` | Canteen names readable when a photo fails to load | White text on pale grey was invisible |
| `6185b32` | Dish links 23 → 45 px tap height (cards do not grow) | Thumb targets |
| `f2777a7` | iOS: no zoom when a select/field is tapped (16 px on iOS only) | **not tested on a real iPhone** |
| `9318b98` | Saved theme and language applied before first paint | Dark-mode flash |
| `84047aa` | Star only the exact dish (was only on `wip/pc-changes`) | Stars hit unrelated dishes |

## 2. Features on the branch (try them, cherry-pick what you like)

Run: `git switch claude/overnight-playground && cd frontend && pnpm install && pnpm dev`

| Commit | Feature | How to see it |
| --- | --- | --- |
| `c5fb9fd` | **Installable app + offline** (manifest, icons, service worker, offline page; new CampusEats icon replaces the Astro favicon) | `pnpm build && pnpm preview` (the worker only registers in production builds), then "Add to home screen". Worker logic is unit-tested with a fake browser; the in-app browser here cannot register workers, so **not tried in a real browser** |
| `cac6ada`, `cc596e9` | **Allergen filter**: Settings → "Allergens I avoid" (14 EU allergens). Dishes with an avoided allergen are hidden and a notice says how many and why. Dishes with no listed allergens are marked "check with the staff". Onboarding answers (milk/gluten/nuts) fill it. Allergen names now in German | Settings, then any canteen page. Screenshot: `docs/overnight/screens/settings-allergens.jpg` |
| `cd81d22` | **"Quietest time to go"** tip above the crowd chart, only inside meal service times | Any canteen page. Screenshot: `canteen-allergens-quiet-time-share.jpg` |
| `6f028d6` | **Share a dish** (share sheet on phones, copy link on desktop; shared link scrolls to and outlines the dish) | Share icon next to the star on a canteen page |

Dropped: "Near me" (your friends are doing location). It was reverted on the branch.

## 3. Bugs / decisions for others (drafts in `mensa-data/overnight/DISCORD.md`)

1. Location: switching "Sort by distance" off does not stop passive location capture on later page loads; visits cannot be seen or deleted. (Privacy)
2. Rating prompt is only offered after a location visit: users without location never get asked.
3. Deployment: static build freezes the menu at build time; `PUBLIC_API_URL` defaults to `localhost:8080`; backend CORS allows only localhost. Decide nightly rebuild vs SSR.
4. Photos are hot-linked from ethz.ch / zfv.ch at 180–740 KB each.
5. Backend: add `priceUnit` to `MealDTO` (frontend works around it for now).

## 4. What I did not verify
- iPhone behaviour (zoom fix), service worker in a real browser, screen reader, the shared link on a real phone.
- Text on photos was not contrast-measured (a dark gradient sits behind it).
- The Discord posts were drafted, not sent unless noted in the final message.
