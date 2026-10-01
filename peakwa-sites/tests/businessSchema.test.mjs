import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaServed, businessExtras, openingHoursSpecification, sameAsLinks } from '../src/lib/businessSchema.ts';

const site = {
  city: 'Lodi',
  state: 'NJ',
  phone: '(551) 365-3500',
  facebookUrl: 'https://www.facebook.com/551hvac',
  instagramUrl: 'https://www.instagram.com/551hvac',
  openingHours: JSON.stringify({ days: {
    Monday: { opens: '08:00', closes: '18:00' }, Tuesday: { opens: '08:00', closes: '18:00' },
    Wednesday: { opens: '08:00', closes: '18:00' }, Thursday: { opens: '08:00', closes: '18:00' },
    Friday: { opens: '08:00', closes: '18:00' }, Saturday: { opens: '09:00', closes: '14:00' },
  } }),
  schemaFacts: { streetAddress: '115 Dell Glen Ave', postalCode: '07644', geo: { latitude: 40.8823, longitude: -74.0835 } },
};

test('hours: days with the same times are grouped, closed days left out', () => {
  assert.deepEqual(openingHoursSpecification(site.openingHours), [
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '08:00', closes: '18:00' },
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday'], opens: '09:00', closes: '14:00' },
  ]);
  assert.equal(openingHoursSpecification('{"open24x7":true}')[0].dayOfWeek.length, 7);
  assert.deepEqual(openingHoursSpecification(null), []);
  assert.deepEqual(openingHoursSpecification('not json'), []);
});

test('social profiles: only real https links', () => {
  assert.deepEqual(sameAsLinks(site), [site.facebookUrl, site.instagramUrl]);
  assert.deepEqual(sameAsLinks({ ...site, facebookUrl: 'facebook.com/x', instagramUrl: 'http://insecure.example/x' }), []);
});

test('service area: main city plus city pages, no duplicates', () => {
  assert.deepEqual(areaServed(site, [{ city: 'Garfield', state: 'NJ' }, { city: 'lodi' }, { city: '' }]), [
    { '@type': 'City', name: 'Lodi, NJ' },
    { '@type': 'City', name: 'Garfield, NJ' },
  ]);
});

test('service area uses the two-letter state when the site stores the full name', () => {
  const full = { city: 'Portland', state: 'Oregon', schemaFacts: { stateCode: 'OR' } };
  assert.deepEqual(areaServed(full, [{ city: 'Hawthorne', state: 'OR' }]).map((c) => c.name), ['Portland, OR', 'Hawthorne, OR']);
});

test('extras: everything the site has, nothing it does not (no rating, no price range)', () => {
  const extras = businessExtras(site, [{ city: 'Garfield', state: 'NJ' }]);
  assert.equal(extras.streetAddress, '115 Dell Glen Ave');
  assert.equal(extras.postalCode, '07644');
  assert.deepEqual(extras.geo, { '@type': 'GeoCoordinates', latitude: 40.8823, longitude: -74.0835 });
  assert.equal(extras.sameAs.length, 2);
  assert.equal(extras.openingHoursSpecification.length, 2);
  assert.equal(extras.areaServed.length, 2);
  assert.deepEqual(extras.contactPoint, { '@type': 'ContactPoint', telephone: '(551) 365-3500', contactType: 'customer service' });
  for (const invented of ['aggregateRating', 'review', 'priceRange']) assert.equal(invented in extras, false, invented);

  const bare = businessExtras({ city: 'Lodi', state: 'NJ' });
  assert.deepEqual(Object.keys(bare), ['areaServed'], 'a site with no extra data gets no empty fields');
});
