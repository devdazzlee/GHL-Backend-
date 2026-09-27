import './helpers/env.js';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/database/client.js';
import { createApp } from '../src/app.js';

const ADMIN = 'admin-key-for-tests-0123456789abcdef';
const RENDERER = 'renderer-key-for-tests-0123456789abcd';

let server;
let base;
let site;
let deletedServicePages;
let purged;
let restoreConsole;

function services(...titles) {
  return JSON.stringify({ services: titles.map((title) => ({ title, shortDescription: 's', fullDescription: 'f', icon: 'wrench' })) });
}

before(async () => {
  process.env.ADMIN_API_KEYS = `raza=${ADMIN}`;
  process.env.SITE_RENDERER_API_KEY = RENDERER;
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/phase4`;
});
after(() => server.close());

beforeEach(() => {
  purged = [];
  deletedServicePages = [];
  const { info, error, warn } = console;
  console.info = () => {};
  console.error = () => {};
  // REVALIDATE_SECRET is empty in tests, so every purge logs "skipped" with its slug.
  console.warn = (m) => {
    const text = String(m);
    if (text.includes('frontend_revalidate_skipped')) purged.push(JSON.parse(text).slug);
  };
  restoreConsole = () => Object.assign(console, { info, error, warn });

  site = {
    id: 'site-1',
    slug: 'demo-site-lodi',
    businessName: 'Demo',
    industry: 'hvac',
    city: 'Lodi',
    status: 'ACTIVE',
    template: null,
    servicesContent: services('AC Repair', 'Duct Cleaning'),
    homeContent: services('AC Repair', 'Duct Cleaning'),
  };
  prisma.generatedSite.findUnique = async () => site;
  prisma.generatedSite.update = async ({ data }) => Object.assign(site, data);
  prisma.generatedSite.delete = async () => site;
  prisma.locationPage.deleteMany = async () => ({ count: 0 });
  prisma.servicePage.deleteMany = async ({ where }) => {
    deletedServicePages.push(where.serviceSlug);
    return { count: 1 };
  };
  // A stored page exists for every slug asked about (including removed services).
  prisma.servicePage.findUnique = async ({ where }) => ({
    content: JSON.stringify({ title: where.siteId_serviceSlug.serviceSlug }),
  });
});

const admin = { Authorization: `Bearer ${ADMIN}` };
async function call(method, path, headers = {}, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

describe('item 8: freshness', () => {
  it('purges the site cache when a service is added', async () => {
    const r = await call('POST', '/sites/site-1/services', admin, {
      title: 'Heat Pumps', shortDescription: 's', fullDescription: 'f', icon: 'wrench',
    });
    restoreConsole();
    assert.equal(r.status, 201);
    assert.deepEqual(purged, ['demo-site-lodi']);
  });

  it('deletes the removed service page, purges the cache, and the API then 404s it', async () => {
    const del = await call('DELETE', '/sites/site-1/services/1', admin);
    assert.equal(del.status, 200);
    assert.deepEqual(deletedServicePages, ['duct-cleaning']);
    assert.deepEqual(purged, ['demo-site-lodi']);

    // Stored page still "exists" in the stub, but the service is no longer listed.
    const gone = await call('GET', '/sites/demo-site-lodi/services/duct-cleaning', { 'x-site-api-key': RENDERER });
    const kept = await call('GET', '/sites/demo-site-lodi/services/ac-repair', { 'x-site-api-key': RENDERER });
    restoreConsole();
    assert.equal(gone.status, 404);
    assert.equal(gone.json.error.code, 'SERVICE_NOT_FOUND');
    assert.equal(kept.status, 200);
  });

  it('purges the cache when a site is deleted', async () => {
    const r = await call('DELETE', '/sites/site-1', admin);
    restoreConsole();
    assert.equal(r.status, 200);
    assert.deepEqual(purged, ['demo-site-lodi']);
  });
});
