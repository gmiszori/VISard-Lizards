# Upstream cafeteria identifier catalogs

These are upstream JSON snapshots downloaded on 2026-10-10. Do not confuse their
app UUIDs with this project's own database IDs. They are exposed as raw JSON by
`MensaLocationCatalog` for manual mapping, not automatically joined to the app's
domain models or meal database.

| File | Source | License |
| --- | --- | --- |
| `eth-locations.json` | https://github.com/famoser/Mensa/blob/main/app/src/main/assets/eth/locations.json | `backend/third-party/Mensa-LICENSE.txt` |
| `uzh-zfv-locations.json` | https://github.com/fflopsi/mensa-zh/blob/main/app/src/main/assets/uzh/locations_zfv.json | `backend/third-party/MensaZH-LICENSE.md` |

ETH: use `facilityId` to match Cookpit rota entries; `idSlug` is a webpage ID and
can differ. `timeSlug` distinguishes lunch from dinner within a facility.

UZH/ZFV: match the outlet's `slug` and optional `categoryPath`. The ZFV client
retrieves the UZH organisation as a whole, so FOOD2050 `locationId` values from
the archived app are not used for ZFV requests.

Opening hours and restaurant membership are upstream snapshots and can become
outdated. The catalogs identify API entities; they are not live opening-status
data. To update, retrieve the linked source JSON, verify its structure, retain
the license notices, and record the new download date here.
