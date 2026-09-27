import './helpers/env.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/database/client.js';
import { classifyRequest } from '../src/middleware/phase4Auth.js';
import {
  changeSiteSlug,
  getRedirectMap,
  isSlugAvailable,
  listSiteRedirects,
  normalizeSlug,
} from '../src/services/siteRedirects.service.js';

// ---- In-memory stand-in for the Prisma calls the redirect service makes ----

let sites;
let redirects;
let revalidated;

function unique(field, rows, row) {
  if (rows.some((r) => r !== row && r[field] === row[field])) {
    throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  }
}

function stubPrisma() {
  sites = [
    { id: 'site-a', slug: 'paws-denver' },
    { id: 'site-b', slug: 'coolflow-phoenix' },
  ];
  redirects = [];
  revalidated = [];
  let nextId = 1;
  prisma.generatedSite.findUnique = async ({ where }) =>
    sites.find((s) => (where.id ? s.id === where.id : s.slug === where.slug)) ?? null;
  prisma.generatedSite.update = async ({ where, data }) => {
    const site = sites.find((s) => s.id === where.id);
    const next = { ...site, ...data };
    unique('slug', sites.filter((s) => s !== site), next);
    return Object.assign(site, data);
  };
  prisma.siteRedirect = {
    findUnique: async ({ where }) => redirects.find((r) => r.fromSlug === where.fromSlug) ?? null,
    findMany: async ({ where, include }) =>
      redirects
        .filter((r) => !where || r.siteId === where.siteId)
        .map((r) => (include ? { ...r, site: sites.find((s) => s.id === r.siteId) } : { ...r })),
    delete: async ({ where }) => {
      redirects = redirects.filter((r) => r.fromSlug !== where.fromSlug);
    },
    upsert: async ({ where, update, create }) => {
      const existing = redirects.find((r) => r.fromSlug === where.fromSlug);
      if (existing) return Object.assign(existing, update);
      const row = { id: `r${nextId++}`, createdAt: new Date(), ...create };
      unique('fromSlug', redirects, row);
      redirects.push(row);
      return row;
    },
  };
  prisma.$transaction = async (ops) => {
    const out = [];
    for (const op of ops) out.push(await op);
    return out;
  };
}

const revalidateFn = async (slug) => {
  revalidated.push(slug);
};

describe('changing a site address', () => {
  beforeEach(() => stubPrisma());

  it('moves the site and keeps the old address as a redirect', async () => {
    const result = await changeSiteSlug('site-a', 'Paws Pines  Lakewood', { revalidateFn });
    assert.equal(result.newSlug, 'paws-pines-lakewood');
    assert.equal(sites[0].slug, 'paws-pines-lakewood');
    assert.deepEqual(await getRedirectMap(), [{ from: 'paws-denver', to: 'paws-pines-lakewood' }]);
    assert.deepEqual(revalidated, ['paws-denver', 'paws-pines-lakewood'], 'both caches refreshed');
    assert.deepEqual((await listSiteRedirects('site-a')).map((r) => r.fromSlug), ['paws-denver']);
  });

  it('chains: after A -> B -> C every old address goes straight to C', async () => {
    await changeSiteSlug('site-a', 'paws-b', { revalidateFn });
    await changeSiteSlug('site-a', 'paws-c', { revalidateFn });
    const map = await getRedirectMap();
    assert.deepEqual(
      map.map((r) => `${r.from}->${r.to}`).sort(),
      ['paws-b->paws-c', 'paws-denver->paws-c'],
    );
  });

  it('can go back to one of its own old addresses', async () => {
    await changeSiteSlug('site-a', 'paws-b', { revalidateFn });
    await changeSiteSlug('site-a', 'paws-denver', { revalidateFn });
    assert.equal(sites[0].slug, 'paws-denver');
    assert.deepEqual(await getRedirectMap(), [{ from: 'paws-b', to: 'paws-denver' }]);
  });

  it('refuses addresses used now or before by another site, reserved words and bad input', async () => {
    await assert.rejects(changeSiteSlug('site-a', 'coolflow-phoenix', { revalidateFn }), (e) => e.code === 'SLUG_TAKEN');
    await changeSiteSlug('site-b', 'coolflow-tempe', { revalidateFn });
    await assert.rejects(changeSiteSlug('site-a', 'coolflow-phoenix', { revalidateFn }), (e) => e.code === 'SLUG_TAKEN', 'old address of site B');
    for (const bad of ['api', 'design-preview', 'ab', '---', 'x'.repeat(81)]) {
      await assert.rejects(changeSiteSlug('site-a', bad, { revalidateFn }), (e) => e.code === 'INVALID_SLUG', bad);
    }
    await assert.rejects(changeSiteSlug('site-a', 'paws-denver', { revalidateFn }), (e) => e.code === 'SLUG_UNCHANGED');
    await assert.rejects(changeSiteSlug('nope', 'anything-new', { revalidateFn }), (e) => e.code === 'SITE_NOT_FOUND');
    assert.equal(sites[0].slug, 'paws-denver', 'nothing changed');
  });

  it('new sites never take an address that redirects', async () => {
    await changeSiteSlug('site-a', 'paws-b', { revalidateFn });
    assert.equal(await isSlugAvailable('paws-denver'), false);
    assert.equal(await isSlugAvailable('paws-b'), false);
    assert.equal(await isSlugAvailable('brand-new-site'), true);
    assert.equal(await isSlugAvailable('api'), false);
  });

  it('normalizes typed addresses', () => {
    assert.equal(normalizeSlug('  Paws & Pines -- Denver! '), 'paws-pines-denver');
  });
});

describe('redirect routes and keys', () => {
  it('renderer may read the redirect map; changing an address is admin-only', () => {
    assert.equal(classifyRequest('GET', '/site-redirects'), 'renderer-readable');
    assert.equal(classifyRequest('POST', '/sites/abc/change-url'), 'admin');
    assert.equal(classifyRequest('GET', '/sites/abc/redirects'), 'admin');
  });
});
