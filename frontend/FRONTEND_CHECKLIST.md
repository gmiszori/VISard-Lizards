# CampusEats comprehensive frontend regression checklist

Manual regression cases for deployment validation. This checklist is not evidence that each case has been executed; record results for the release being tested.

This inventory covers every current frontend feature plus cross-feature durability and the new API integration. It is exhaustive for the identified scope, not proof that arbitrary future inputs are safe. **Unchecked means execution/evidence is still required**, including cases partially covered by unit tests. Record PASS/FAIL/BLOCKED/NOT RUN/NOT APPLICABLE per ID, environment, actual result and evidence; never check off an entire group after one smoke test. Extend this inventory when a new surface or state is discovered.

## Matrix and fixtures

Run applicable cases in light/dark, EN/DE, guest/demo, fresh/existing/legacy/corrupt profile, no/some/all favourites, no/some stars, backend live/sample/failed. Use widths 320, 360, 390, 430, 768, 1024, 1440 and 1920; include landscape, 200%/400% zoom and a short viewport/software keyboard. Include Chrome/Edge/Firefox desktop, Safari iPhone and Chrome Android; emulation does not replace physical touch/keyboard/browser testing.

Use isolated test-origin storage, disposable backend fixtures and deterministic clocks. Back up and restore any pre-existing browser data. Never stress the shared production API. Test data must include today/yesterday/two days old, weekends, DST boundaries, empty menus, lunch/dinner duplicates, long Unicode names, HTML-looking strings, null prices, sparse crowd data and a deliberately changing import order.

## Shared shell and navigation (SH)

- [ ] SH01 Fresh `/` loads home without automatic onboarding redirect.
- [ ] SH02 Logo returns home from settings, detail and onboarding.
- [ ] SH03 PERSONALIZATION opens onboarding from every route.
- [ ] SH04 Settings opens from every route and browser Back restores context.
- [ ] SH05 Login opens from every route; demo label stays consistent on navigation.
- [ ] SH06 Header wraps cleanly at every matrix width; nothing overlaps or disappears.
- [ ] SH07 Each page has a meaningful title, main landmark and heading structure.
- [ ] SH08 Browser Back/Forward, direct links and refresh load the correct route.
- [ ] SH09 Unknown mensa and unknown route produce a usable 404 with a way home.
- [ ] SH10 No unexpected console errors or unhandled promise rejections on any route.
- [ ] SH11 Keyboard focus remains visible and follows a sensible order.
- [ ] SH12 Deep links/assets work on the actual deployed base URL.
- [ ] SH13 JS-disabled/slow-JS pages show useful content without misleading dead controls.
- [ ] SH14 Page restoration from BFCache resumes clock-dependent status and event handling.

## Home catalogue, cards and canteen locations (HM)

- [ ] HM01 Correct mensa count and catalogue for all supported campuses.
- [ ] HM02 Backend-added/deleted/renamed mensas follow the agreed catalogue ownership.
- [ ] HM03 Canteen name appears inside the smaller image area; open/closed sits beside it.
- [ ] HM04 Photo does not dominate meal content at phone and wide sizes.
- [ ] HM05 Long mensa names, long locations and translated labels wrap without clipping.
- [ ] HM06 Missing/broken/slow image has readable text and a stable placeholder.
- [ ] HM07 Name/photo/meal links open the correct detail page.
- [ ] HM08 Star and Location clicks do not accidentally open the detail link.
- [ ] HM09 Every Location link identifies the correct mensa/address in the external location viewer.
- [ ] HM10 Location links encode umlauts, spaces, slashes, punctuation and apostrophes.
- [ ] HM11 Location links open in a new tab with safe opener handling and descriptive labels.
- [ ] HM12 No “Fresh picks from around Zürich” subtitle remains.
- [ ] HM13 No “Heute auf dem Menü” home-card label or empty spacer rows remain.
- [ ] HM14 Missing menu has a specific unavailable message and sorts below available menus.
- [ ] HM15 A filter-excluded menu has different copy from absent source data.
- [ ] HM16 An actually closed mensa is distinguished from no menu and from sold-out meals.
- [ ] HM17 Live ratings, no ratings and sample ratings have distinct truthful presentation.
- [ ] HM18 Prices, dietary badge and meal stars remain readable on long rows.
- [ ] HM19 Lunch/dinner versions of the same dish are recognisably separated.
- [ ] HM20 Home and detail use the same actual menu date and data source.

## Search (SE)

- [ ] SE01 Empty search restores all otherwise eligible canteens.
- [ ] SE02 Search by mensa name, campus and dish returns the expected matches.
- [ ] SE03 Mixed case and surrounding/repeated spaces do not change intended matches.
- [ ] SE04 Umlauts, composed/decomposed Unicode and compatibility characters behave consistently.
- [ ] SE05 Emoji, apostrophes, regex metacharacters and HTML-looking text render safely.
- [ ] SE06 A 10,000-character string does not crash or freeze filtering.
- [ ] SE07 No-match query has useful copy; clearing recovers immediately.
- [ ] SE08 Search composes correctly with food, campus, price and favourites filters.
- [ ] SE09 Search result count excludes hidden cards consistently.
- [ ] SE10 Rapid typing/deleting and input method composition keep the latest result.
- [ ] SE11 Search label and empty state translate on language change.
- [ ] SE12 Search does not expose hidden starred clones or double-count cards.

## AI voice search and beta preference (VS)

- [ ] VS01 AI voice search is available only when enabled; typed search remains usable without AI configuration.
- [ ] VS02 Microphone permission granted, denied, dismissed and unsupported states produce useful feedback.
- [ ] VS03 HTTPS/localhost and browser compatibility requirements are disclosed when voice cannot start.
- [ ] VS04 Start, stop, cancel and retry release microphone resources without duplicate sessions.
- [ ] VS05 Transcripts and AI results render safely and preserve the current filters and price tier.
- [ ] VS06 Missing AI configuration, service failure, timeout and offline state recover without losing typed search.
- [ ] VS07 Settings → Disable beta features hides only the AI voice-search button; disabling it restores the button when otherwise enabled.
- [ ] VS08 Beta preference persists on this device across reload/navigation and updates between tabs.
- [ ] VS09 Disabling beta features during a voice session stops it; menus, typed search, location sorting, ratings and push remain available.
- [ ] VS10 Voice controls, permission/errors and result announcements work in EN/DE and with keyboard/screen readers.

## Canteen distance sorting (DS)

- [ ] DS01 Sort by distance orders canteens consistently using their known coordinates and the current location fix.
- [ ] DS02 Missing/invalid coordinates and equal distances do not hide canteens or crash sorting.
- [ ] DS03 Permission denied, timeout, unavailable location and unsupported geolocation show a recoverable state.
- [ ] DS04 Distance labels distinguish unavailable distances from zero and format consistently.
- [ ] DS05 Distance sorting composes with typed search, campus/food filters and favourites without duplicating cards.
- [ ] DS06 Automatic distance-sort preference persists and applies on overview entry without resetting unrelated settings.
- [ ] DS07 Location prompts and sort controls remain keyboard/touch accessible on small screens.
- [ ] DS08 Device location handling matches the stated privacy policy; changing or clearing preferences restores the intended default.

## Settings, filters and price tier (PF)

- [ ] PF01 First visit defaults to Student prices.
- [ ] PF02 Student/Worker/External selection shows exactly one chosen price per meal.
- [ ] PF03 Tier survives reload, route navigation and onboarding completion.
- [ ] PF04 Missing chosen-tier price stays unavailable; no silent fallback to another tier.
- [ ] PF05 Zero, decimals and null prices format correctly without NaN/Infinity.
- [ ] PF06 Negative, string and non-finite network prices are rejected safely.
- [ ] PF07 Vegan/Vegetarian/Meat settings apply individually and in all combinations.
- [ ] PF08 All food categories off gives an intentional empty state with recovery.
- [ ] PF09 All campuses off remains intentional after reload rather than resetting to all.
- [ ] PF10 One/multiple/all campus selections produce accurate menus and counts.
- [ ] PF11 Legacy campus labels migrate to supported IDs without duplicates.
- [ ] PF12 Unknown campus/tier/boolean-string values normalise safely.
- [ ] PF13 Saving settings applies both home and detail consistently.
- [ ] PF14 Cancelling/back navigation follows the agreed unsaved-settings behaviour.
- [ ] PF15 Storage quota failure says page-only/not persisted, without a false success notice.
- [ ] PF16 Settings changed in a second tab update the first tab without reload.
- [ ] PF17 Reset/clear storage returns safe documented defaults.
- [ ] PF18 Search, availability sorting and starred section recompute after preferences change.
- [ ] PF19 Rerun the onboarding button exists and opens `restart=1` only once.
- [ ] PF20 Hard constraints have the same agreed effect in payoff, home and detail.
- [ ] PF21 Settings remain operable if the profile is partial, array, primitive or malformed JSON.
- [ ] PF22 Save notice and errors are announced, translated and visible without covering controls.

## Favourite mensas and starred meal strings (ST)

- [ ] ST01 Add/remove a mensa favourite and verify pressed state and section movement.
- [ ] ST02 Favourites persist across navigation/reload and sync between tabs.
- [ ] ST03 Invalid/duplicate/stale favourite IDs cannot crash or produce duplicate cards.
- [ ] ST04 Failed favourite write leaves UI consistent and shows an error.
- [ ] ST05 Star a meal from home, detail and featured clone; all buttons stay consistent.
- [ ] ST06 `Schnitzel with pommes` stores plain `Schnitzel`, not a meal ID or object.
- [ ] ST07 `mit`, `avec`, `con` sides follow the documented string rule.
- [ ] ST08 Case, spacing and Unicode-equivalent saved strings deduplicate.
- [ ] ST09 `Ham` does not match `Champignon`; escaped regex punctuation matches literally.
- [ ] ST10 A starred dish returning with different sides/date/mensa is promoted as intended.
- [ ] ST11 Starred dishes outside the current menu remain saved but do not create fake dishes.
- [ ] ST12 Available matching meals/cards rise above unstarred ones.
- [ ] ST13 No-available-menu cards remain below available cards even when starred/favourited.
- [ ] ST14 Filtered-out starred meals do not leak into the featured section.
- [ ] ST15 Unstar restores stable original order rather than randomising the catalogue.
- [ ] ST16 Settings lists saved strings and removes the correct string.
- [ ] ST17 Stars saved before onboarding survive completion and rerun.
- [ ] ST18 Legacy object-shaped saved stars migrate safely without new ID persistence.
- [ ] ST19 Corrupt profile/storage failure does not falsely claim stars were saved.
- [ ] ST20 Rapid repeated star clicks and two-tab edits do not lose unrelated profile fields.
- [ ] ST21 Keyboard focus survives removing a featured clone or saved-list entry.
- [ ] ST22 Same named dish in lunch/dinner follows a documented dedup/promotion policy.

## Onboarding (OB)

- [ ] OB01 Explicit entry begins or resumes the expected draft/step.
- [ ] OB02 Restart clears the draft once and preserves completed stars/profile as intended.
- [ ] OB03 Campus choice and secondary campuses select/deselect accessibly.
- [ ] OB04 Campus skip/default behaviour is consistent with eventual home filters.
- [ ] OB05 Mensa choices and recommendations belong to the selected campuses.
- [ ] OB06 Mensa preference ratings show 1–5 stars and persist correctly.
- [ ] OB07 Clearing/all-unrated mensas produces useful recommendations and no crash.
- [ ] OB08 Diet choices are exactly A bit of everything, Vegan, Vegetarian, Carnivore.
- [ ] OB09 Vegan control has the requested translucent styling in both themes.
- [ ] OB10 Legacy flexitarian/pescetarian draft follows the documented migration.
- [ ] OB11 Hard-constraint chips toggle via touch, keyboard and pointer.
- [ ] OB12 No-pork ignores Champignon/Hamburger false positives and handles real pork terms.
- [ ] OB13 Missing allergen/certification information follows explicit unknown-data policy.
- [ ] OB14 Budget slider moves continuously by touch drag, mouse and keyboard.
- [ ] OB15 Slider endpoints, increments and current label agree.
- [ ] OB16 Empty/single-price/null-price datasets produce a usable slider/empty state.
- [ ] OB17 Tier changes recompute budget scale without NaN or a stale limit.
- [ ] OB18 Hard vs soft budget follows the recommendation policy.
- [ ] OB19 Priorities reorder by touch sliding and pointer dragging.
- [ ] OB20 Priority up/down arrows remain available and keyboard accessible.
- [ ] OB21 Reorder preserves each priority exactly once, including first/last boundaries.
- [ ] OB22 Reorder does not prevent ordinary page scrolling or trap touch gestures.
- [ ] OB23 Next/Back/Skip preserve intended answers and step progress.
- [ ] OB24 Alt+arrow navigation does not interfere with native input/radio keys.
- [ ] OB25 Reload each step resumes correctly, including after a tier or language change.
- [ ] OB26 Progress text, heading focus and screen-reader announcements identify the current step.
- [ ] OB27 Make it Yours/cuisines/disliked ingredients/usual lunch time remain absent.
- [ ] OB28 Completion saves profile and opens a valid dated recommendation.
- [ ] OB29 No eligible dish gives a recoverable empty state rather than an arbitrary dish.
- [ ] OB30 Backend menus and payoff use the same dataset/date or clearly disclose preview data.
- [ ] OB31 Editing completed choices recomputes the payoff and preserves unrelated stars.
- [ ] OB32 Null/malformed ratings, invalid draft step and schema versions restore safely.
- [ ] OB33 Denied/quota-full storage has a usable error/retry or agreed guest mode.
- [ ] OB34 Partial profile/preference write failure does not leave contradictory saved settings.
- [ ] OB35 Every onboarding step fits at 320/390px with the software keyboard visible.
- [ ] OB36 Complete full flow in EN/DE, dark/light and with keyboard only.

## Login preview and demo (LG)

- [ ] LG01 Login opens a labelled dialog with appropriate initial focus.
- [ ] LG02 Tab/Shift+Tab stay in the dialog; Escape closes and returns focus.
- [ ] LG03 Close button/backdrop behaviour works without background interaction.
- [ ] LG04 Empty email/password trigger useful native validation without navigation.
- [ ] LG05 Invalid email, whitespace, long Unicode and HTML-looking input do not crash.
- [ ] LG06 Show/Hide toggles password visibility and aria-pressed correctly.
- [ ] LG07 Submitting valid-looking dummy credentials sends no network request or storage write.
- [ ] LG08 Preview feedback clearly says account login is not connected.
- [ ] LG09 pass enters a demo session without credentials and is clearly labelled demo.
- [ ] LG10 Demo survives the intended same-tab routes/reload; other tabs follow documented scope.
- [ ] LG11 Leaving demo clears demo session and does not delete meal/profile preferences.
- [ ] LG12 Closing clears password and resets reveal state/error copy.
- [ ] LG13 Session storage denied still allows an in-memory demo without crashing.
- [ ] LG14 Software keyboard/rotation/short viewport keeps close and submit reachable.
- [ ] LG15 Language change updates open dialog, errors and demo state.
- [ ] LG16 Demo session is never interpreted as authentication by API calls.

## Rating eligibility and daily state (RE)

- [ ] RE01 Zurich 12:00 → no prompt.
- [ ] RE02 Zurich 13:29:59 → no prompt.
- [ ] RE03 Zurich 13:30 → today.
- [ ] RE04 Zurich 20:59 → today.
- [ ] RE05 Zurich 20:59:59 → today.
- [ ] RE06 Zurich 21:00 → no prompt.
- [ ] RE07 Next day 10:59 → yesterday if unresolved.
- [ ] RE08 Next day 11:00 → no prompt.
- [ ] RE09 Resolved target → no prompt on same date or following morning.
- [ ] RE10 Dismissed target → no prompt on same date or following morning.
- [ ] RE11 Two-days-old candidates never become a target.
- [ ] RE12 Month/year/leap-day transitions calculate yesterday correctly.
- [ ] RE13 DST spring/autumn and devices in other timezones still use Zurich rules.
- [ ] RE14 Invalid Date returns null without throwing.
- [ ] RE15 Morning shown target prevents a second afternoon target on the same calendar day.
- [ ] RE16 Unresolved same target resumes on reload without creating another daily target.
- [ ] RE17 Midnight/visibility restoration and 30-second refresh update eligibility correctly.
- [ ] RE18 Duplicate candidates are removed and maximum four personal suggestions appear.
- [ ] RE19 No selection gives Polyterrasse, UZH Untere Mensa, Other and No / skip.
- [ ] RE20 Missing default catalogue IDs degrade safely while Other/skip remain usable.
- [ ] RE21 Favourites precede highest profile preference scores according to documented policy.
- [ ] RE22 Stale/malformed profile ratings and favourite IDs trigger useful safe defaults.
- [ ] RE23 Favourites/profile changes refresh chips without interrupting meal/rating steps.
- [ ] RE24 Concurrent tabs cannot lose resolutions or violate the daily prompt cap.

## Rating interaction and saves (RF)

- [ ] RF01 Prompt is an inline dismissible home card, not a modal.
- [ ] RF02 No / skip is prominent and at least the same target size as other chips.
- [ ] RF03 Dismiss/skip records the target and remains hidden after reload.
- [ ] RF04 Other mensa opens a labelled picker containing all supported mensas.
- [ ] RF05 Empty Other selection shows an accessible validation error without crashing.
- [ ] RF06 Pick a mensa and load only that target date and mensa’s meals.
- [ ] RF07 Missing menu says No menu available, resolves according to policy and closes.
- [ ] RF08 Loading failure is distinguished from a genuine empty menu.
- [ ] RF09 Back to mensas/meals preserves appropriate selection and focus.
- [ ] RF10 Pick a meal and show exactly the agreed 1–3 or 1–5 rating scale.
- [ ] RF11 Every score has an accessible numeric label and ≥44px target at 320px.
- [ ] RF12 Selecting a score saves immediately; controls disable only while saving.
- [ ] RF13 Save success is announced, then card closes without losing focus.
- [ ] RF14 Duplicate local user+meal is rejected; a different user/meal is allowed.
- [ ] RF15 Real POST sends only documented payload to the encoded meal route.
- [ ] RF16 Server response derives correct mensa/date/timestamp and updates local cache.
- [ ] RF17 HTTP 409 gives duplicate feedback and resolves without posting repeatedly.
- [ ] RF18 HTTP 400/404/429/500, timeout and offline preserve a recoverable selection.
- [ ] RF19 Server success plus local parse/quota failure is not misreported as server failure.
- [ ] RF20 Bundled fallback IDs are never accidentally submitted as verified live IDs.
- [ ] RF21 Two rapid score presses produce one effective save.
- [ ] RF22 Switching mensa/dismissing/back during fetch ignores obsolete responses.
- [ ] RF23 Clock changes beyond eligibility during editing/saving follow the agreed rule.
- [ ] RF24 Corrupt resolution/ratings storage produces a contained error and no repeat loop.
- [ ] RF25 Anonymous identity is stable, valid and independent of demo login.
- [ ] RF26 Fake score, missing meal/user, impossible date and invalid timestamp are rejected.
- [ ] RF27 All dynamic card states translate, including failure/duplicate/empty/loading.
- [ ] RF28 Confirmation duration and focus restoration work with screen readers.
- [ ] RF29 Dev rate opens fixtures even outside real eligibility hours.
- [ ] RF30 Dev override validates offset/Z and rejects malformed timestamps gracefully.
- [ ] RF31 Reset simulation removes only isolated simulation keys.
- [ ] RF32 Dev override never writes production backend ratings or normal rating state.
- [ ] RF33 Production build omits rate button, simulator and override behaviour.
- [ ] RF34 Imported meal reorder does not reassign feedback to another dish.

## Mensa detail, availability and crowd (CR)

- [ ] CR01 Every generated mensa detail route renders the correct name/photo/menu.
- [ ] CR02 Back and canteen Location links work; long name/status/photo remain readable.
- [ ] CR03 Opening windows respect Zurich day, weekend and temporary closures.
- [ ] CR04 Open/closed updates after window boundary and visibility restoration.
- [ ] CR05 Actual current crowd is identified separately from predicted/preview crowd.
- [ ] CR06 Stale/missing current crowd is shown as unknown, not a fabricated value.
- [ ] CR07 Menu date/fallback source is prominent on detail, including empty menus.
- [ ] CR08 Meal descriptions/allergens/badges are safe for missing and long values.
- [ ] CR09 Predicted crowd uses a histogram with 15-minute bins and correct time labels.
- [ ] CR10 Weekday selection changes the correct series and accessible selected state.
- [ ] CR11 Selected bin/time movement works by pointer, touch and keyboard.
- [ ] CR12 True 0% is displayed differently from missing/null data.
- [ ] CR13 Sparse bins retain gaps without interpolation that invents observations.
- [ ] CR14 Negative/>100/non-finite/non-numeric values are safely rejected or bounded by policy.
- [ ] CR15 Invalid bin timestamps and mismatched interval/timezone are rejected.
- [ ] CR16 Empty weekday, insufficient sample and backend failure show truthful empty/preview UI.
- [ ] CR17 Backend data replaces preview without resetting a user’s choice unexpectedly.
- [ ] CR18 Current-time marker uses Zurich even when the device timezone differs.
- [ ] CR19 Chart handles DST and all 96 bins without labels overlapping on phone.
- [ ] CR20 Tooltip/selection information is available without hover or colour alone.
- [ ] CR21 Dark/high-contrast charts keep axes/bars/selected state readable.
- [ ] CR22 No chart overflow at all matrix widths and zoom settings.
- [ ] CR23 Source, sample size and freshness are visible according to the agreed design.
- [ ] CR24 Closing-time bins and lunch/dinner openings follow the documented policy.

## Web Push notifications (PU)

- [ ] PU01 Supported HTTPS/localhost browsers can enable notifications after explicit permission.
- [ ] PU02 Unsupported browsers, denied permission and unavailable service workers show truthful actionable states.
- [ ] PU03 Subscription creation, refresh and removal handle backend errors without false success notices.
- [ ] PU04 Reload/navigation preserve the actual subscription state; device/browser changes do not imply a shared subscription.
- [ ] PU05 Saved dish preferences and notification settings agree with the subscription sent to the API.
- [ ] PU06 Notification content and click targets identify the correct canteen/menu without exposing credentials.
- [ ] PU07 Backend restart with persisted VAPID keys preserves subscriptions; changed keys produce recoverable re-subscription behaviour.
- [ ] PU08 Permission, subscription and notification controls remain accessible and translated in EN/DE.

## Backend integration and degraded networks (API)

- [ ] API01 Public HTTPS frontend uses a reachable HTTPS/same-origin backend on a real phone.
- [ ] API02 CORS preflight allows intended preview/production origins and rejects others as designed.
- [ ] API03 Build with live backend, sample-only mode and unreachable backend all behave explicitly.
- [ ] API04 Partial endpoint failure follows a documented fallback policy, without mixed stale writes.
- [ ] API05 Validate meta/menu/mensa/crowd/rating JSON before rendering or persisting.
- [ ] API06 Missing/null/extra fields and incompatible schema versions fail recoverably.
- [ ] API07 Valid null prices/ratings and zero values are preserved correctly.
- [ ] API08 HTML error bodies, malformed JSON, 204 and truncated responses do not crash the shell.
- [ ] API09 Timeouts cancel requests and make retry possible without duplicated side effects.
- [ ] API10 Backend restart/import/cache expiry refreshes current menus according to freshness SLA.
- [ ] API11 Today absent/latest earlier menu has a truthful date, never an unqualified today label.
- [ ] API12 Unknown mensa/meal references and URL-encoded IDs cannot navigate to a wrong record.
- [ ] API13 Server schema and frontend types agree on price tiers, ratings and classification values.
- [ ] API14 Rate-limit responses recover after the window; shared-IP users are handled sensibly.
- [ ] API15 Offline-to-online recovery replaces stale state and preserves user choices.
- [ ] API16 No secrets, credentials or private endpoints appear in public client bundles/logs.

## Accessibility, language and visual quality (AX)

- [ ] AX01 All routes and flow steps are fully keyboard operable with visible focus.
- [ ] AX02 Buttons/links/inputs have unique understandable accessible names.
- [ ] AX03 Targets meet ≥44px or an explicitly documented accessible spacing exception.
- [ ] AX04 Dynamic counts, saves/errors and step changes are announced without excessive chatter.
- [ ] AX05 Focus stays valid when content is reordered, cloned, removed or auto-hidden.
- [ ] AX06 Text/input/focus contrast passes in both themes and over every image.
- [ ] AX07 State is conveyed without colour alone: stars, ratings, crowd and open/closed.
- [ ] AX08 Text remains usable at 200%/400% zoom and enlarged mobile font settings.
- [ ] AX09 Reduced motion and forced-colours preferences preserve all functionality.
- [ ] AX10 EN/DE updates static/dynamic text, dates, errors, ARIA and tooltips consistently.
- [ ] AX11 Location, image alt and no-rating strings have the chosen localisation policy.
- [ ] AX12 Menu language is identified correctly; interface language does not promise unavailable translation.
- [ ] AX13 Screen reader journeys pass on NVDA/Firefox and VoiceOver/Safari as available.
- [ ] AX14 Mobile safe areas/notches/keyboard do not hide fixed notices or key actions.
- [ ] AX15 Print/high-density screens and landscape maintain readable essential information.
- [ ] AX16 No horizontal overflow or clipped focus at each width, including every noninitial flow step.

## Storage, durability, security and performance (RS)

- [ ] RS01 Missing, malformed JSON, null, arrays and primitive values are tested for every storage key.
- [ ] RS02 Getter denied, setter quota-full and removal failure are handled in every persistence path.
- [ ] RS03 Clearing storage while another tab is open restores safe state without losing event handling.
- [ ] RS04 Legacy schema, future schema and invalid enums/numbers migrate or reject deterministically.
- [ ] RS05 Concurrent profile/stars/preferences/prompt writes do not silently lose unrelated changes.
- [ ] RS06 Repeated navigation/resume does not duplicate event listeners or timers.
- [ ] RS07 No input/network text is inserted as executable markup or unsafe URL.
- [ ] RS08 CSP/deployment headers, third-party images and external location links are reviewed against deployment needs.
- [ ] RS09 Anonymous feedback/local data retention and clearing are documented truthfully.
- [ ] RS10 Dummy login credentials never persist, log or leave the browser.
- [ ] RS11 1,000 local meal fixtures/100 canteens render/filter without freezing under measured budgets.
- [ ] RS12 1,000 saved stars and long names have bounded matching/render time and storage behaviour.
- [ ] RS13 100 rapid local filter/star actions end in the final intended state.
- [ ] RS14 Slow CPU/network/image loading does not produce major layout shifts or blocked interaction.
- [ ] RS15 Production bundle/image payloads and request counts meet explicitly recorded budgets.
- [ ] RS16 Long menus and repeated chart changes do not leak DOM nodes or memory.
- [ ] RS17 Build/check/tests run from a clean install with the supported Node version and lockfile.
- [ ] RS18 CI reports actual check/test/build results and explicitly says no lint script when absent.
- [ ] RS19 Stress tests use disposable local/staging fixtures with limits, never shared production traffic.
- [ ] RS20 Every fixed defect gets a meaningful regression case; failures include reproduction and evidence.

## Release gate

Do not call the complete frontend production-ready merely because static checks pass. Verify live API and phone operation, execute the relevant matrix, and record unresolved decisions, mocks and blocked cases with owners. New findings expand this checklist.
