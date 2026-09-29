import './helpers/env.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/database/client.js';
import { classifyRequest } from '../src/middleware/phase4Auth.js';
import { getPageEditor, revertPageEdit, savePageEdits } from '../src/services/siteContentEdits.service.js';
import { deleteLocationPage } from '../src/services/locationPage.service.js';

let site;
let cities;
let keywords;

function stub() {
  site = { id: 'site-1', slug: 'paws-denver', contentEdits: null };
  cities = [
    { id: 'city1', siteId: 'site-1', city: 'Englewood', slug: 'englewood-arapahoe-county', content: JSON.stringify({ hero: { heading: 'Pet boarding in Englewood' }, intro: 'Englewood intro' }) },
    { id: 'cityother', siteId: 'site-2', city: 'Elsewhere', slug: 'elsewhere', content: JSON.stringify({ intro: 'not yours' }) },
  ];
  keywords = [{ id: 'kw1', siteId: 'site-1', locationPageId: 'city1', content: JSON.stringify({ title: 'Dog boarding Englewood', body: 'Keyword body' }) }];

  prisma.generatedSite.findUnique = async () => site;
  prisma.generatedSite.update = async ({ data }) => Object.assign(site, data);
  const rowModel = (rows) => ({
    findFirst: async ({ where }) => rows.find((r) => r.id === where.id && (!where.siteId || r.siteId === where.siteId)) ?? null,
    update: async ({ where, data }) => Object.assign(rows.find((r) => r.id === where.id), data),
  });
  prisma.locationPage = {
    ...rowModel(cities),
    findFirst: async ({ where, select }) => {
      const row = cities.find((r) => r.id === where.id && r.siteId === where.siteId);
      if (!row) return null;
      if (!select) return row;
      return { ...row, keywordPages: keywords.filter((k) => k.locationPageId === row.id).map((k) => ({ id: k.id })), site: { contentEdits: site.contentEdits } };
    },
    delete: async ({ where }) => {
      cities = cities.filter((c) => c.id !== where.id);
      keywords = keywords.filter((k) => k.locationPageId !== where.id);
    },
  };
  prisma.keywordPage = rowModel(keywords);
}

describe('editing city and keyword pages', () => {
  beforeEach(() => stub());

  it('a city page opens in the text editor', async () => {
    const editor = await getPageEditor('site-1', 'location:city1');
    assert.equal(editor.available, true);
    assert.deepEqual(editor.fields.map((f) => f.path), ['hero.heading', 'intro']);
  });

  it('saving a city page edit changes that page and records it (with the original, for undo)', async () => {
    const editor = await savePageEdits('site-1', 'location:city1', [{ path: 'intro', value: 'My Englewood intro' }]);
    assert.equal(JSON.parse(cities[0].content).intro, 'My Englewood intro');
    assert.equal(editor.fields.find((f) => f.path === 'intro').edited, true);
    const recorded = JSON.parse(site.contentEdits)['location:city1'].intro;
    assert.equal(recorded.original, 'Englewood intro');

    await revertPageEdit('site-1', 'location:city1', 'intro');
    assert.equal(JSON.parse(cities[0].content).intro, 'Englewood intro', 'undo puts the generated text back');
  });

  it('a keyword page is edited the same way', async () => {
    await savePageEdits('site-1', 'keyword:kw1', [{ path: 'body', value: 'My keyword body' }]);
    assert.equal(JSON.parse(keywords[0].content).body, 'My keyword body');
    assert.ok(JSON.parse(site.contentEdits)['keyword:kw1'].body);
  });

  it("another site's page, an unknown page and a bad key are refused", async () => {
    await assert.rejects(getPageEditor('site-1', 'location:cityother'), (e) => e.statusCode === 404);
    await assert.rejects(getPageEditor('site-1', 'keyword:nope'), (e) => e.statusCode === 404);
    await assert.rejects(getPageEditor('site-1', 'location:BAD KEY'), (e) => e.statusCode === 404);
  });
});

describe('deleting a city page', () => {
  beforeEach(() => stub());

  it('deletes the city, its keyword pages and their recorded edits; keeps other edits', async () => {
    site.contentEdits = JSON.stringify({
      'location:city1': { intro: { value: 'x' } },
      'keyword:kw1': { body: { value: 'y' } },
      home: { 'hero.heading': { value: 'kept' } },
    });
    const result = await deleteLocationPage('site-1', 'city1');
    assert.deepEqual(result, { city: 'Englewood', slug: 'englewood-arapahoe-county', keywordPagesDeleted: 1 });
    assert.equal(cities.some((c) => c.id === 'city1'), false);
    assert.equal(keywords.length, 0);
    assert.deepEqual(JSON.parse(site.contentEdits), { home: { 'hero.heading': { value: 'kept' } } });
  });

  it("refuses another site's city and an unknown one", async () => {
    await assert.rejects(deleteLocationPage('site-1', 'cityother'), (e) => e.statusCode === 404);
    await assert.rejects(deleteLocationPage('site-1', 'nope'), (e) => e.code === 'LOCATION_PAGE_NOT_FOUND');
    assert.equal(cities.length, 2);
  });

  it('needs an admin', () => {
    assert.equal(classifyRequest('DELETE', '/sites/site-1/location-pages/city1'), 'admin');
    assert.equal(classifyRequest('PUT', '/sites/site-1/editor/location:city1'), 'admin');
  });
});
