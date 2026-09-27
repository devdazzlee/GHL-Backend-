import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSiteIndexable, robotsDirective, robotsHeaderForPath, slugFromPathname } from '../src/lib/indexing.ts';

test('sites are noindex unless explicitly switched on', () => {
  assert.equal(isSiteIndexable({}, true), false);
  assert.equal(isSiteIndexable({ searchIndexable: null }, true), false);
  assert.equal(isSiteIndexable({ searchIndexable: false }, true), false);
  assert.equal(isSiteIndexable(undefined, true), false);
  assert.equal(isSiteIndexable({ searchIndexable: true }, true), true);
});

test('platform kill switch overrides the per-site switch', () => {
  assert.equal(isSiteIndexable({ searchIndexable: true }, false), false);
});

test('robots directive strings', () => {
  assert.equal(robotsDirective(true), 'index, follow');
  assert.equal(robotsDirective(false), 'noindex, nofollow');
});

test('slug extraction ignores platform paths', () => {
  assert.equal(slugFromPathname('/acme-hvac-lodi'), 'acme-hvac-lodi');
  assert.equal(slugFromPathname('/acme-hvac-lodi/blog/0'), 'acme-hvac-lodi');
  assert.equal(slugFromPathname('/'), null);
  assert.equal(slugFromPathname('/design-preview/3'), null);
  assert.equal(slugFromPathname('/api/revalidate'), null);
});

test('X-Robots-Tag per path: only the switched-on site is indexable', () => {
  const on = new Set(['real-business-lodi']);
  // every page type of the switched-on site
  for (const p of ['/real-business-lodi', '/real-business-lodi/services/ac-repair', '/real-business-lodi/lodi-bergen-county', '/real-business-lodi/blog/1']) {
    assert.equal(robotsHeaderForPath(p, on, true), 'index, follow', p);
  }
  // every page type of any other site stays noindex
  for (const p of ['/paws-pines-retreat-denver', '/paws-pines-retreat-denver/about', '/paws-pines-retreat-denver/englewood-arapahoe-county', '/paws-pines-retreat-denver/blog/0']) {
    assert.equal(robotsHeaderForPath(p, on, true), 'noindex, nofollow', p);
  }
});

test('fails closed when the indexable list is unavailable, and previews never index', () => {
  assert.equal(robotsHeaderForPath('/real-business-lodi', null, true), 'noindex, nofollow');
  assert.equal(robotsHeaderForPath('/design-preview/5', new Set(['design-preview']), true), 'noindex, nofollow');
  assert.equal(robotsHeaderForPath('/real-business-lodi', new Set(['real-business-lodi']), false), 'noindex, nofollow');
});
