import test from 'node:test';
import assert from 'node:assert/strict';
import { detectInstallKind } from './installGuide.ts';

test('install guidance follows device and browser', () => {
  assert.equal(detectInstallKind('iPhone AppleWebKit Safari', false), 'ios-safari');
  assert.equal(detectInstallKind('iPhone AppleWebKit CriOS Safari', false), 'ios-other');
  assert.equal(detectInstallKind('Macintosh AppleWebKit Safari', false, 5), 'ipad-safari');
  assert.equal(detectInstallKind('Android Chrome/124', false), 'android-chrome');
  assert.equal(detectInstallKind('Android SamsungBrowser Chrome/124', false), 'android-other');
  assert.equal(detectInstallKind('Windows Chrome/124', false), 'desktop-chrome');
  assert.equal(detectInstallKind('Windows Chrome/124 Edg/124', false), 'desktop-edge');
  assert.equal(detectInstallKind('Macintosh AppleWebKit Safari', false), 'desktop-safari');
  assert.equal(detectInstallKind('iPhone Safari', true), 'installed');
});
