import './helpers/env.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/database/client.js';
import { classifyRequest } from '../src/middleware/phase4Auth.js';
import {
  GENERIC_CITY_QUERY,
  REPICK_LIMIT,
  chooseCityPagePhoto,
  safeSearchQuery,
  classifyCityPhoto,
  cityPhotoReport,
  pickCityPhoto,
  repickMismatchedCityPhotos,
} from '../src/services/cityPhoto.service.js';

const ridgewood = { city: 'Ridgewood', county: 'Bergen', state: 'NJ' };
const kind = (alt, place = ridgewood) => classifyCityPhoto(alt, place).kind;

// Real Pexels descriptions seen on live sites and in searches for small towns.
describe('judging a photo by its Pexels description', () => {
  it('names the town', () => {
    assert.equal(kind('White Mercedes-Benz SLS AMG parked near Ridgewood Station, New Jersey.'), 'TOWN');
    assert.equal(kind("Stunning view of Denver's cityscape with skyscrapers under a colorful sunset sky.", { city: 'Denver', state: 'Colorado' }), 'TOWN');
    assert.equal(kind('Tree-lined street in Sellwood Moreland, Portland.', { city: 'Sellwood-Moreland', state: 'OR' }), 'TOWN');
  });

  it('names no place at all (or only this state): an honest generic photo', () => {
    assert.equal(kind('Aerial view of a suburban neighborhood with houses, streets, and cars.'), 'PLACELESS');
    assert.equal(kind("Bird's eye view of a suburban neighborhood with tree-lined streets and houses."), 'PLACELESS');
    assert.equal(kind('Elegant suburban mansion in New Jersey showcasing classic architecture.'), 'PLACELESS');
    assert.equal(kind('Aerial view of urban residential apartments featuring an American flag, depicting city life.'), 'PLACELESS');
    assert.equal(kind('Close-up of an HVAC unit on a rooftop. Clear sky behind it.'), 'PLACELESS');
  });

  it('names somewhere else: never used', () => {
    const cases = [
      ['Quiet winter street scene with bare trees and snow, Wabasha, MN.', { city: 'Sellwood-Moreland', state: 'OR' }],
      ['Beautiful aerial view of Saint Peter Cathedral in Marquette, MI during sunset.', ridgewood],
      ['Breathtaking aerial view of Lake Powell with marinas and stunning rock formations.', ridgewood],
      ['A scenic winter view of the West Pierhead Lighthouse on Lake Ontario with snowy shores.', { city: 'Lake Oswego', state: 'OR' }],
      ['Drone view of a suburban residential area in Woodbridge Township, NJ.', ridgewood],
      ['Cozy bakery exterior with patrons lining up in Portland, Maine.', { city: 'Sellwood-Moreland', state: 'OR' }],
      ['Ridgewood Avenue at night in Ridgewood, NY.', ridgewood],
    ];
    for (const [alt, place] of cases) assert.equal(kind(alt, place), 'ELSEWHERE', alt);
    assert.deepEqual(classifyCityPhoto('Quiet winter street scene with bare trees and snow, Wabasha, MN.', { city: 'Sellwood-Moreland', state: 'OR' }).names, ['Wabasha', 'MN']);
  });

  it('ordinary lowercase words are never mistaken for state codes', () => {
    assert.equal(kind('A quiet street where kids play or walk in the morning.'), 'PLACELESS');
    assert.equal(kind(''), 'NO_DESCRIPTION');
  });
});

const photo = (id, alt) => ({ id, alt, photographer: `P${id}`, url: `https://www.pexels.com/photo/${id}/`, src: { large2x: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg` } });

function fakeSearch(byQuery) {
  const calls = [];
  const fn = async (query) => {
    calls.push(query);
    if (byQuery.rateLimited) throw Object.assign(new Error('429'), { rateLimited: true });
    return byQuery[query] ?? byQuery.default ?? [];
  };
  return Object.assign(fn, { calls });
}

describe('search words', () => {
  it("never sends a bare state code or AND/OR/NOT (Pexels' firewall answers 403)", () => {
    assert.equal(safeSearchQuery('Sellwood-Moreland OR neighborhood', 'OR'), 'Sellwood-Moreland Oregon neighborhood');
    assert.equal(safeSearchQuery('Ridgewood NJ downtown', 'New Jersey'), 'Ridgewood New Jersey downtown');
    assert.equal(safeSearchQuery('Portland OR Seattle NOT rain', 'WA'), 'Portland Seattle rain');
    assert.equal(safeSearchQuery('Oregon coast', 'OR'), 'Oregon coast', 'words that merely contain the code are kept');
  });
});

describe('picking a city photo', () => {
  it('prefers a photo of the town', async () => {
    const search = fakeSearch({ default: [photo(1, 'Jersey City skyline at night.'), photo(2, 'Ridgewood Station, New Jersey.'), photo(3, 'Houses on a quiet street.')] });
    for (let i = 0; i < 5; i += 1) assert.match((await pickCityPhoto(ridgewood, 'Ridgewood NJ', { search })).url, /photos\/2\//);
  });

  it('else a generic one from the same results, without another search', async () => {
    const search = fakeSearch({ default: [photo(1, 'Lake Powell at sunset.'), photo(3, 'Houses on a quiet street.')] });
    const picked = await pickCityPhoto(ridgewood, 'Ridgewood NJ', { search });
    assert.match(picked.url, /photos\/3\//);
    assert.equal(picked.credit.photographer, 'P3');
    assert.deepEqual(search.calls, ['Ridgewood New Jersey'], 'page 1 of one search only, state spelled out');
  });

  it('else a generic street search; else no photo at all', async () => {
    const elsewhere = [photo(1, 'Lake Powell at sunset.'), photo(4, 'Saint Peter Cathedral in Marquette, MI.')];
    const withGeneric = fakeSearch({ 'Ridgewood New Jersey': elsewhere, [GENERIC_CITY_QUERY]: [photo(5, 'Brick houses along a residential street.')] });
    assert.match((await pickCityPhoto(ridgewood, 'Ridgewood NJ', { search: withGeneric })).url, /photos\/5\//);
    const nothing = fakeSearch({ 'Ridgewood New Jersey': elsewhere, [GENERIC_CITY_QUERY]: [photo(6, 'Main Street in Boise, Idaho.')] });
    assert.equal(await pickCityPhoto(ridgewood, 'Ridgewood NJ', { search: nothing }), null);
  });

  it('a new city page gets no photo rather than a wrong one, and never fails page creation', async () => {
    const queryFn = async () => 'q';
    assert.equal(await chooseCityPagePhoto(ridgewood, { industry: 'HVAC' }, { queryFn, search: fakeSearch({ default: [photo(1, 'Lake Powell.')] }) }), null);
    assert.equal(await chooseCityPagePhoto(ridgewood, { industry: 'HVAC' }, { queryFn, search: fakeSearch({ rateLimited: true }) }), null);
  });
});

// ---- Existing pages ----

let site;
let pages;
const pexelsUrl = (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&w=940`;

function stubPrisma() {
  const credit = (id, alt) => ({ pexelsId: String(id), photographer: 'x', photographerUrl: null, pageUrl: null, alt });
  site = {
    id: 'site-1',
    slug: 'brightvale',
    industry: 'HVAC',
    imagesContent: JSON.stringify({
      hero: { url: pexelsUrl(1), source: 'AUTO' },
      credits: {
        10: credit(10, 'Ridgewood Station, New Jersey.'),
        11: credit(11, 'Aerial view of a suburban neighborhood with houses.'),
        12: credit(12, 'Beautiful aerial view of Saint Peter Cathedral in Marquette, MI.'),
        13: credit(13, 'Breathtaking aerial view of Lake Powell with marinas.'),
      },
    }),
  };
  pages = [
    { id: 'p1', city: 'Ridgewood', county: 'Bergen', state: 'NJ', slug: 'ridgewood', imageUrl: pexelsUrl(10) },
    { id: 'p2', city: 'Glen Rock', county: 'Bergen', state: 'NJ', slug: 'glen-rock', imageUrl: pexelsUrl(11) },
    { id: 'p3', city: 'Hawthorne', county: 'Passaic', state: 'NJ', slug: 'hawthorne', imageUrl: pexelsUrl(12) },
    { id: 'p4', city: 'Wyckoff', county: 'Bergen', state: 'NJ', slug: 'wyckoff', imageUrl: pexelsUrl(13) },
    { id: 'p5', city: 'Paramus', county: 'Bergen', state: 'NJ', slug: 'paramus', imageUrl: 'https://res.cloudinary.com/demo/own-photo.jpg' },
    { id: 'p6', city: 'Midland Park', county: 'Bergen', state: 'NJ', slug: 'midland-park', imageUrl: pexelsUrl(99) },
  ];
  prisma.generatedSite.findUnique = async ({ where, select }) => {
    if (where.id !== site.id) return null;
    return select ? { imagesContent: site.imagesContent } : { ...site };
  };
  prisma.generatedSite.update = async ({ data }) => Object.assign(site, data);
  prisma.locationPage.findMany = async () => pages.map((p) => ({ ...p }));
  prisma.locationPage.update = async ({ where, data }) => Object.assign(pages.find((p) => p.id === where.id), data);
}

describe('existing city pages', () => {
  beforeEach(() => stubPrisma());

  it('reports which photos fit; uploads are left alone; unknown ones are checked first', async () => {
    const { pages: rows, summary } = await cityPhotoReport('site-1', { lookup: async () => undefined, revalidate: false });
    assert.deepEqual(
      rows.map((r) => `${r.city}:${r.status}`),
      ['Ridgewood:MATCHES_TOWN', 'Glen Rock:GENERIC', 'Hawthorne:MISMATCHED', 'Wyckoff:MISMATCHED', 'Paramus:NOT_STOCK', 'Midland Park:CHECKING'],
    );
    assert.deepEqual(rows[2].names, ['Saint', 'Peter', 'Cathedral', 'Marquette', 'MI']);
    assert.deepEqual(summary, { matchesTown: 1, generic: 1, mismatched: 2, checking: 1 });
  });

  it('re-picks only the mismatched ones: the town, else generic, else no photo', async () => {
    const search = fakeSearch({
      'Hawthorne q': [photo(20, 'Main street shops in Hawthorne, New Jersey.')],
      'Wyckoff q': [photo(21, 'Jersey City skyline.')],
      [GENERIC_CITY_QUERY]: [photo(22, 'Downtown Boise, Idaho.')],
    });
    const result = await repickMismatchedCityPhotos('site-1', { search, queryFn: async (page) => `${page.city} q` });
    assert.deepEqual(result.changed.map((c) => `${c.city}->${c.to ? c.to.match(/photos\/(\d+)/)[1] : 'none'}`), ['Hawthorne->20', 'Wyckoff->none']);
    assert.equal(pages.find((p) => p.id === 'p3').imageUrl, pexelsUrl(20).split('?')[0]);
    assert.equal(pages.find((p) => p.id === 'p4').imageUrl, null);
    assert.equal(pages.find((p) => p.id === 'p1').imageUrl, pexelsUrl(10), 'fitting photo untouched');
    assert.equal(pages.find((p) => p.id === 'p5').imageUrl, 'https://res.cloudinary.com/demo/own-photo.jpg', 'upload untouched');
    assert.equal(JSON.parse(site.imagesContent).credits['20'].alt, 'Main street shops in Hawthorne, New Jersey.');
    assert.equal(result.remaining, 0);
  });

  it('one town failing (e.g. Pexels 403) is skipped; the others still get re-picked', async () => {
    const search = async (query) => {
      if (query.startsWith('Hawthorne')) throw new Error('Pexels search failed (HTTP 403)');
      return [photo(30, 'Wyckoff town hall, New Jersey.')];
    };
    const result = await repickMismatchedCityPhotos('site-1', { search, queryFn: async (page) => `${page.city} q` });
    assert.deepEqual(result.failed, ['Hawthorne']);
    assert.deepEqual(result.changed.map((c) => c.city), ['Wyckoff']);
    assert.equal(pages.find((p) => p.id === 'p3').imageUrl, pexelsUrl(12), 'failed town keeps its photo');
  });

  it('stops at a 429 and leaves the rest for the next click; at most 10 per click', async () => {
    const result = await repickMismatchedCityPhotos('site-1', { search: fakeSearch({ rateLimited: true }), queryFn: async () => 'q' });
    assert.deepEqual(result, { changed: [], failed: [], remaining: 2, stoppedEarly: true });
    assert.equal(pages.find((p) => p.id === 'p3').imageUrl, pexelsUrl(12));
    assert.equal(REPICK_LIMIT, 10);
  });

  it('the report and the re-pick are admin-only', () => {
    assert.equal(classifyRequest('GET', '/sites/abc/city-photos'), 'admin');
    assert.equal(classifyRequest('POST', '/sites/abc/city-photos/repick'), 'admin');
  });
});
