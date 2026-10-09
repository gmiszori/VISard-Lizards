# Starred meals

Stars are plain strings in the local profile:

```json
{ "starredMeals": ["Schnitzel", "Green Crunch Bowl"] }
```

`starName()` takes the name before a side-dish phrase introduced by “with”, “mit”, “avec”, or “con”. For example, “Schnitzel with pommes” saves “Schnitzel”. Matches use case-insensitive, whitespace-normalized dish-name containment, so “Schnitzel mit Reis” matches the same saved string. No meal IDs are stored or used for matching.

Only dishes in the displayed menu rotation can appear in the overview's starred section. The section shows that menu's actual `MENU_DATE`, including when the existing database falls back to an earlier menu. Diet, campus, open-only, and search filters still apply. Starred dishes sort first within a menu, canteens with matching dishes sort first within each group, and canteens with no visible dishes sort last. Favourite canteens with no dishes move to the bottom of the general list while retaining their saved favourite status.

Settings lists saved dish-name strings even when those dishes are not in the current rotation. Re-running and finishing personalization preserves these stars. Account/backend synchronization is not connected yet; a backend profile can persist the same string array later.
