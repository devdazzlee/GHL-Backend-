import './helpers/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveManualLocations } from '../src/services/locationPage.service.js';
import { findTownCounties, toStateCode } from '../src/services/zipRadius.service.js';

// These use the real ZIP dataset shipped in backend/data (GeoNames, CC BY 4.0).

describe('state codes', () => {
  it('accepts names and codes in any case, rejects everything else', () => {
    assert.equal(toStateCode('Colorado'), 'CO');
    assert.equal(toStateCode(' co '), 'CO');
    assert.equal(toStateCode('New Jersey'), 'NJ');
    assert.equal(toStateCode('WA'), 'WA');
    assert.equal(toStateCode('Narnia'), null);
    assert.equal(toStateCode(''), null);
  });
});

describe('county lookup from ZIP data', () => {
  it('finds the county of a town within a state', () => {
    assert.deepEqual(findTownCounties('Englewood', 'Colorado').map((t) => t.county), ['Arapahoe']);
    assert.deepEqual(findTownCounties('paramus', 'NJ').map((t) => t.county), ['Bergen']);
  });
  it('returns every county for a town that spans several', () => {
    assert.deepEqual(findTownCounties('Aurora', 'CO').map((t) => t.county), ['Adams', 'Arapahoe']);
  });
});

describe('manual cities (dashboard "Manual cities")', () => {
  const colorado = { state: 'Colorado' };

  it('uses the site\'s own state and fills in the county', () => {
    assert.deepEqual(resolveManualLocations([{ city: 'Englewood' }], colorado), [
      { city: 'Englewood', county: 'Arapahoe', state: 'CO' },
    ]);
  });

  it('never falls back to New Jersey', () => {
    assert.throws(
      () => resolveManualLocations([{ city: 'Paramus' }], { state: 'WA' }),
      (e) => e.code === 'CITY_NOT_FOUND' && /not found in WA/.test(e.message),
    );
  });

  it('an explicit state wins over the site\'s state', () => {
    assert.deepEqual(resolveManualLocations([{ city: 'Wyckoff', state: 'New Jersey' }], colorado), [
      { city: 'Wyckoff', county: 'Bergen', state: 'NJ' },
    ]);
  });

  it('keeps a county that was typed in (with or without the word County)', () => {
    assert.deepEqual(resolveManualLocations([{ city: 'Lakewood', county: 'Jefferson County' }], colorado), [
      { city: 'Lakewood', county: 'Jefferson', state: 'CO' },
    ]);
  });

  it('asks which county when the town spans several, and names them', () => {
    assert.throws(
      () => resolveManualLocations([{ city: 'Aurora' }], colorado),
      (e) => e.code === 'COUNTY_AMBIGUOUS' && e.message.includes('Adams, Arapahoe'),
    );
  });

  it('asks for the county when the town is not in the ZIP data', () => {
    assert.throws(() => resolveManualLocations([{ city: 'Lakewood' }], colorado), (e) => e.code === 'CITY_NOT_FOUND');
  });

  it('rejects an unknown state, a missing city and an empty list', () => {
    assert.throws(() => resolveManualLocations([{ city: 'Paramus', state: 'Narnia' }], colorado), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => resolveManualLocations([{ city: 'Denver' }], { state: '' }), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => resolveManualLocations([{ city: '  ' }], colorado), (e) => e.code === 'INVALID_BODY');
    assert.throws(() => resolveManualLocations([], colorado), (e) => e.code === 'INVALID_BODY');
  });
});
