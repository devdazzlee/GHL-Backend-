import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOOTER_LINK_LIMIT, footerAreaLinks, footerServiceLinks } from '../src/lib/footerLinks.ts';

test('service links use the same URLs as the navbar and skip untitled services', () => {
  const links = footerServiceLinks('paws', {
    services: [{ title: 'Dog Boarding' }, { title: '  ' }, { title: 'Cat & Kitten Care' }, {}],
  });
  assert.deepEqual(links, [
    { label: 'Dog Boarding', href: '/paws/services/dog-boarding' },
    { label: 'Cat & Kitten Care', href: '/paws/services/cat--kitten-care' },
  ]);
});

test('area links point at the city pages', () => {
  const links = footerAreaLinks('paws', [
    { id: '1', slug: 'englewood-arapahoe-county', city: 'Englewood' },
    { id: '2', slug: '', city: 'Nowhere' },
  ]);
  assert.deepEqual(links, [{ label: 'Englewood', href: '/paws/englewood-arapahoe-county' }]);
});

test('no services or cities means no links', () => {
  assert.deepEqual(footerServiceLinks('paws', {}), []);
  assert.deepEqual(footerAreaLinks('paws', []), []);
  assert.equal(FOOTER_LINK_LIMIT, 8);
});

import { footerLinkColor } from '../src/lib/footerLinks.ts';
import { contrastRatio } from '../src/lib/theme.ts';

test('link color is the accent when it is already readable on the footer', () => {
  assert.equal(footerLinkColor('#FFD166', '#1F2937', contrastRatio), '#FFD166');
});

test('an accent too close to the footer color is tinted until readable, keeping its hue', () => {
  // Paws & Pines: orange accent on a teal footer.
  const c = footerLinkColor('#FF6F20', '#007A8E', contrastRatio);
  assert.ok(contrastRatio(c, '#007A8E') >= 4.5, `${c} readable`);
  assert.notEqual(c, '#FFFFFF', 'still a tint of the accent, not plain white');
  // A light footer darkens instead.
  const d = footerLinkColor('#FFB703', '#F3F4F6', contrastRatio);
  assert.ok(contrastRatio(d, '#F3F4F6') >= 4.5);
});
