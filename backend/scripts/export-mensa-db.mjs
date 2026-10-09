// Exports the DB constant of frontend/src/data/canteens.ts as JSON for the backend.
// Usage (from the repo root): node backend/scripts/export-mensa-db.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../frontend/src/data/canteens.ts');
const target = resolve(here, '../src/main/resources/data/mensa-db.json');

const { DB } = await import(pathToFileURL(source).href);
writeFileSync(target, JSON.stringify(DB));
console.log(`Wrote ${DB.mensas.length} mensas and ${DB.meals.length} meals to ${target}`);
