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
