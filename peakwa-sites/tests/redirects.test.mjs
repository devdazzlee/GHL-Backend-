import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRedirectMap, redirectTarget } from '../src/lib/redirects.ts';

const map = buildRedirectMap([
  { from: 'paws-denver', to: 'paws-pines-lakewood' },
  { from: 'same', to: 'same' },
  { from: '', to: 'x' },
]);

test('every old URL keeps its path and query under the new address', () => {
  assert.equal(redirectTarget('/paws-denver', '', map), '/paws-pines-lakewood');
  assert.equal(redirectTarget('/paws-denver/', '', map), '/paws-pines-lakewood/');
  assert.equal(redirectTarget('/paws-denver/services/dog-boarding', '', map), '/paws-pines-lakewood/services/dog-boarding');
  assert.equal(redirectTarget('/paws-denver/k/ac-repair-paramus', '?utm_source=x', map), '/paws-pines-lakewood/k/ac-repair-paramus?utm_source=x');
  assert.equal(redirectTarget('/paws-denver/sitemap.xml', '', map), '/paws-pines-lakewood/sitemap.xml');
  assert.equal(redirectTarget('/PAWS-DENVER/blog', '', map), '/paws-pines-lakewood/blog');
});

test('current addresses and other paths are left alone', () => {
  assert.equal(redirectTarget('/paws-pines-lakewood/services', '', map), null);
  assert.equal(redirectTarget('/paws-denverx', '', map), null);
  assert.equal(redirectTarget('/', '', map), null);
  assert.equal(redirectTarget('/same', '', map), null, 'a row pointing at itself is ignored');
});
