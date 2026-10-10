import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiUrl } from './api.ts';

test('browser API requests use the page origin when no URL is configured', () => {
  assert.equal(resolveApiUrl(undefined, 'http://127.0.0.1:8080/'), 'http://127.0.0.1:8080');
  assert.equal(resolveApiUrl(undefined, 'https://campus.example.org'), 'https://campus.example.org');
});

test('build-time requests use the local backend by default', () => {
  assert.equal(resolveApiUrl(undefined), 'http://localhost:8080');
});

test('configured URL overrides the origin and empty means sample mode', () => {
  assert.equal(resolveApiUrl('https://api.example.org/', 'https://campus.example.org'), 'https://api.example.org');
  assert.equal(resolveApiUrl('', 'http://127.0.0.1:8080'), '');
});
