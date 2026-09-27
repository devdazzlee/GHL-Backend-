import './helpers/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTownsWithinRadius, haversineMiles, lookupZip } from '../src/services/zipRadius.service.js';

describe('item 7: ZIP radius from real data', () => {
  it('07644 is Lodi, Bergen County, NJ', () => {
    assert.deepEqual(
      (({ place, county, state }) => ({ place, county, state }))(lookupZip('07644')),
      { place: 'Lodi', county: 'Bergen', state: 'NJ' },
    );
  });

  it('07644 + 15 miles returns real nearby towns with correct county and state', () => {
    const { origin, towns } = findTownsWithinRadius('07644', 15);
    assert.equal(origin.city, 'Lodi');
    const find = (city, state = 'NJ') => towns.find((t) => t.city === city && t.state === state);
    for (const [city, county] of [
      ['Hackensack', 'Bergen'], ['Garfield', 'Bergen'], ['Hasbrouck Heights', 'Bergen'],
      ['Saddle Brook', 'Bergen'], ['Passaic', 'Passaic'], ['Clifton', 'Passaic'], ['Paterson', 'Passaic'],
    ]) {
      const t = find(city);
      assert.ok(t, `${city} should be within 15 miles`);
      assert.equal(t.county, county, `${city} county`);
      assert.ok(t.miles <= 15);
    }
    assert.ok(towns.length > 5, 'more than 5 towns');
    // sorted nearest first
    for (let i = 1; i < towns.length; i += 1) assert.ok(towns[i - 1].miles <= towns[i].miles);
  });

  it('excludes towns outside the radius', () => {
    const { towns } = findTownsWithinRadius('07644', 15);
    for (const far of ['Trenton', 'Princeton', 'Philadelphia']) {
      assert.equal(towns.some((t) => t.city === far), false, `${far} is far outside 15 miles`);
    }
    assert.ok(towns.every((t) => t.miles <= 15));
  });

  it('distance math is sane (Lodi to Hackensack about 2 miles)', () => {
    const d = haversineMiles(lookupZip('07644'), lookupZip('07601'));
    assert.ok(d > 1 && d < 3.5, `got ${d}`);
  });

  it('rejects invalid input and unknown ZIPs', () => {
    assert.throws(() => findTownsWithinRadius('7644', 15), (e) => e.statusCode === 400);
    assert.throws(() => findTownsWithinRadius('07644', 0), (e) => e.statusCode === 400);
    assert.throws(() => findTownsWithinRadius('07644', 101), (e) => e.statusCode === 400);
    assert.throws(() => findTownsWithinRadius('00000', 10), (e) => e.statusCode === 404);
  });
});
