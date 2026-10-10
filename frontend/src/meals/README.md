# Starred meals

Stars are plain strings in the local profile:

```json
{ "starredMeals": ["PANIERTES SCHNITZEL", "Green Crunch Bowl"] }
```

`starName()` saves the dish name exactly as shown, with whitespace tidied up. A star matches only a dish with the same name, ignoring case and spacing, so the same dish is found again on other days or at other canteens, but starring “Ground Meat with Horn-Shaped Noodles” never stars “Vegan Ground Meat with Horn-Shaped Pasta”. No meal IDs are stored or used for matching.

Only dishes in the displayed menu rotation can appear in the overview's starred section. The section shows that menu's actual `MENU_DATE`, including when the existing database falls back to an earlier menu. Diet, campus, open-only, and search filters still apply. Starred dishes sort first within a menu, canteens with matching dishes sort first within each group, and canteens with no visible dishes sort last. Favourite canteens with no dishes move to the bottom of the general list while retaining their saved favourite status.

Settings lists saved dish-name strings even when those dishes are not in the current rotation. Re-running and finishing personalization preserves these stars. Account/backend synchronization is not connected yet; a backend profile can persist the same string array later.
