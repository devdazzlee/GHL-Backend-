import './helpers/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOpeningHours, parseAddress, schemaFactsFor } from '../src/services/siteSchemaFacts.service.js';
import { findPlaceCoordinates } from '../src/services/zipRadius.service.js';

describe('address -> street and ZIP', () => {
  it('splits a full address', () => {
    assert.deepEqual(parseAddress('115 Dell Glen Ave, Lodi, NJ 07644'), { streetAddress: '115 Dell Glen Ave', postalCode: '07644' });
    assert.deepEqual(parseAddress('  2200 Market St Suite 4,  Denver,  CO 80205-1234 '), {
      streetAddress: '2200 Market St Suite 4',
      postalCode: '80205',
    });
    assert.deepEqual(parseAddress('12-14 Main Street, Paterson NJ'), { streetAddress: '12-14 Main Street', postalCode: null });
  });

  it('never invents: no house number means no street, a lone street number is not a ZIP', () => {
    assert.deepEqual(parseAddress('Lodi, NJ 07644'), { streetAddress: null, postalCode: '07644' });
    assert.deepEqual(parseAddress('Downtown Denver'), { streetAddress: null, postalCode: null });
    assert.deepEqual(parseAddress('12345 Ridge Road'), { streetAddress: '12345 Ridge Road', postalCode: null });
    assert.deepEqual(parseAddress(''), { streetAddress: null, postalCode: null });
    assert.deepEqual(parseAddress(null), { streetAddress: null, postalCode: null });
  });
});

describe('map pin', () => {
  it("uses the address's ZIP when it's in the site's state", () => {
    const facts = schemaFactsFor({ address: '115 Dell Glen Ave, Lodi, NJ 07644', city: 'Lodi', state: 'NJ' });
    assert.equal(facts.geo.source, 'zip');
    assert.ok(Math.abs(facts.geo.latitude - 40.88) < 0.05, `latitude ${facts.geo.latitude}`);
    assert.ok(Math.abs(facts.geo.longitude - -74.08) < 0.05, `longitude ${facts.geo.longitude}`);
  });

  it('falls back to the town centre when there is no usable ZIP', () => {
    const facts = schemaFactsFor({ address: null, city: 'Denver', state: 'Colorado' });
    assert.equal(facts.geo.source, 'city');
    assert.equal(facts.stateCode, 'CO', 'full state name -> two-letter code');
    assert.ok(Math.abs(facts.geo.latitude - 39.7) < 0.3);
    assert.equal(facts.streetAddress, null);
    // A ZIP from another state is ignored in favour of the town.
    assert.equal(schemaFactsFor({ address: 'Lodi 07644', city: 'Denver', state: 'CO' }).geo.source, 'city');
  });

  it('no pin at all for an unknown town', () => {
    assert.equal(schemaFactsFor({ city: 'Nowhereville', state: 'NJ' }).geo, null);
    assert.equal(findPlaceCoordinates('Nowhereville', 'NJ'), null);
  });
});

describe('opening hours', () => {
  it('stores days with times, open 24/7, or nothing', () => {
    assert.equal(
      normalizeOpeningHours({ days: { Monday: { opens: '08:00', closes: '18:00' }, Sunday: null } }),
      JSON.stringify({ days: { Monday: { opens: '08:00', closes: '18:00' } } }),
    );
    assert.equal(normalizeOpeningHours({ open24x7: true }), '{"open24x7":true}');
    assert.equal(normalizeOpeningHours('{"open24x7":true}'), '{"open24x7":true}');
    assert.equal(normalizeOpeningHours(null), null);
    assert.equal(normalizeOpeningHours(''), null);
  });

  it('refuses bad input with a clear message', () => {
    const bad = [
      [{ days: { Funday: { opens: '08:00', closes: '18:00' } } }, /Unknown day/],
      [{ days: { Monday: { opens: '8am', closes: '18:00' } } }, /HH:MM/],
      [{ days: { Monday: { opens: '18:00', closes: '08:00' } } }, /after opening/],
      [{ days: { Monday: null } }, /at least one open day/],
      [{}, /"days" or "open24x7"/],
      ['not json', /must be an object/],
    ];
    for (const [input, message] of bad) {
      assert.throws(() => normalizeOpeningHours(input), (e) => e.code === 'INVALID_OPENING_HOURS' && message.test(e.message), JSON.stringify(input));
    }
  });
});
