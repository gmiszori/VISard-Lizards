import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('production image seeds the Caddy root before attempting a live rebuild', () => {
  const dockerfile = read('../Dockerfile');
  const entrypoint = read('./container-entrypoint.sh');
  const caddy = read('../Caddyfile');
  assert.match(dockerfile, /COPY --from=build \/app\/dist \/srv\b/);
  assert.match(caddy, /root \* \/srv\b/);
  assert.match(entrypoint, /if node scripts\/wait-for-backend\.mjs && node_modules\/\.bin\/astro build; then/);
  assert.match(entrypoint, /cp -a dist\/\. \/srv\//);
  assert.match(entrypoint, /else\s+echo .*bundled sample menus/);
  assert.match(entrypoint, /exec "\$@"/);
});

test('deployment permits same-origin voice capture without enabling cameras', () => {
  const caddy = read('../Caddyfile');
  assert.match(caddy, /Permissions-Policy "camera=\(\), microphone=\(self\), geolocation=\(self\)"/);
});
