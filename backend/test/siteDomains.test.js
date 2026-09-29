import './helpers/env.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/database/client.js';
import { classifyRequest } from '../src/middleware/phase4Auth.js';
import {
  alternateDomain,
  checkDns,
  createSiteOriginChecker,
  dnsRecordsFor,
  domainState,
  listCustomDomains,
  normalizeDomain,
  setSiteDomain,
  validateDomain,
  verifySiteDomain,
} from '../src/services/siteDomains.service.js';

const IP = '169.58.4.58';

// ---- In-memory stand-in for the Prisma calls the domain service makes ----

let sites;
let revalidated;

function pick(row, select) {
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).map((k) => [k, row[k] ?? null]));
}

function stubPrisma() {
  sites = [
    { id: 'site-a', slug: 'paws-denver', status: 'ACTIVE', customDomain: null, customDomainVerifiedAt: null },
    { id: 'site-b', slug: 'coolflow-phoenix', status: 'ACTIVE', customDomain: 'coolflow.com', customDomainVerifiedAt: new Date('2026-09-01') },
    { id: 'site-c', slug: 'old-demo', status: 'INACTIVE', customDomain: 'olddemo.com', customDomainVerifiedAt: new Date('2026-09-01') },
  ];
  revalidated = [];
  prisma.generatedSite.findUnique = async ({ where, select }) => {
    const row = sites.find((s) => s.id === where.id);
    return row ? pick(row, select) : null;
  };
  prisma.generatedSite.findFirst = async ({ where }) =>
    sites.find((s) => s.id !== where.id.not && where.customDomain.in.includes(s.customDomain)) ?? null;
  prisma.generatedSite.findMany = async ({ where, select }) =>
    sites.filter((s) => s.status === where.status && s.customDomain !== null).map((s) => pick(s, select));
  prisma.generatedSite.update = async ({ where, data, select }) => {
    const row = sites.find((s) => s.id === where.id);
    if (data.customDomain && sites.some((s) => s !== row && s.customDomain === data.customDomain)) {
      throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    }
    Object.assign(row, data);
    return pick(row, select);
  };
}

const revalidateFn = async (slug) => {
  revalidated.push(slug);
};

describe('domain input', () => {
  it('keeps only the host, lowercased', () => {
    assert.equal(normalizeDomain('  https://WWW.AcmeHVAC.com/about?x=1 '), 'www.acmehvac.com');
    assert.equal(normalizeDomain('acme.com:443'), 'acme.com');
    assert.equal(normalizeDomain('acme.com.'), 'acme.com');
    assert.equal(normalizeDomain(''), '');
    assert.equal(normalizeDomain(null), '');
  });

  it('converts international names to their xn-- form', () => {
    assert.equal(normalizeDomain('bäckerei.de'), 'xn--bckerei-5wa.de');
  });

  it('rejects things that are not a domain, and platform domains', () => {
    for (const bad of ['acme', 'acme .com', '192.168.1.1', '-acme.com', 'acme-.com', 'a.b']) {
      assert.throws(() => validateDomain(bad), (e) => e.code === 'INVALID_DOMAIN', bad);
    }
    for (const reserved of ['site.peakwa.com', 'peakwa.com', 'my-app.vercel.app']) {
      assert.throws(() => validateDomain(reserved), (e) => e.code === 'DOMAIN_RESERVED', reserved);
    }
    validateDomain('www.acmehvac.com');
    validateDomain('acme-hvac.co.uk');
    validateDomain('xn--bckerei-5wa.de');
  });

  it('pairs www and the bare domain, but not deeper subdomains', () => {
    assert.equal(alternateDomain('www.acme.com'), 'acme.com');
    assert.equal(alternateDomain('acme.com'), 'www.acme.com');
    assert.equal(alternateDomain('shop.acme.com'), null);
    assert.equal(alternateDomain(null), null);
  });

  it('lists the A records the client adds', () => {
    assert.deepEqual(dnsRecordsFor('www.acme.com', IP), [
      { type: 'A', host: 'www.acme.com', name: 'www', value: IP },
      { type: 'A', host: 'acme.com', name: '@', value: IP },
    ]);
    assert.deepEqual(dnsRecordsFor('shop.acme.com', IP), [{ type: 'A', host: 'shop.acme.com', name: 'shop', value: IP }]);
    assert.deepEqual(dnsRecordsFor(null, IP), []);
  });
});

describe('setting a domain', () => {
  beforeEach(() => stubPrisma());

  it('saves it unverified, so nothing changes for visitors yet', async () => {
    const state = await setSiteDomain('site-a', 'https://www.PawsPines.com/', { revalidateFn });
    assert.equal(sites[0].customDomain, 'www.pawspines.com');
    assert.equal(state.live, false);
    assert.equal(state.url, null);
    assert.equal(state.alternate, 'pawspines.com');
    assert.equal(state.dnsRecords.length, 2);
    assert.deepEqual(revalidated, ['paws-denver']);
  });

  it('changing a live domain starts it over as unverified', async () => {
    const state = await setSiteDomain('site-b', 'www.coolflow.com', { revalidateFn });
    assert.equal(sites[1].customDomainVerifiedAt, null);
    assert.equal(state.live, false);
  });

  it('saving the same domain again changes nothing', async () => {
    const state = await setSiteDomain('site-b', 'COOLFLOW.com', { revalidateFn });
    assert.equal(state.live, true);
    assert.deepEqual(revalidated, []);
  });

  it('an empty value removes the domain', async () => {
    const state = await setSiteDomain('site-b', '', { revalidateFn });
    assert.equal(sites[1].customDomain, null);
    assert.equal(sites[1].customDomainVerifiedAt, null);
    assert.equal(state.domain, null);
    assert.deepEqual(revalidated, ['coolflow-phoenix']);
  });

  it('refuses a domain (or its www twin) that another site uses', async () => {
    for (const taken of ['coolflow.com', 'www.coolflow.com']) {
      await assert.rejects(setSiteDomain('site-a', taken, { revalidateFn }), (e) => e.statusCode === 409 && e.code === 'DOMAIN_TAKEN');
    }
    assert.equal(sites[0].customDomain, null);
  });

  it('refuses an invalid domain and an unknown site', async () => {
    await assert.rejects(setSiteDomain('site-a', 'not a domain', { revalidateFn }), (e) => e.code === 'INVALID_DOMAIN');
    await assert.rejects(setSiteDomain('nope', 'acme.com', { revalidateFn }), (e) => e.statusCode === 404);
  });
});

function dnsStub(records) {
  return {
    resolve4: async (host) => {
      if (!records[host]?.a) throw Object.assign(new Error('nx'), { code: 'ENOTFOUND' });
      return records[host].a;
    },
    resolve6: async (host) => {
      if (!records[host]?.aaaa) throw Object.assign(new Error('nodata'), { code: 'ENODATA' });
      return records[host].aaaa;
    },
  };
}

const answers = (slug, status = 200) => async () => new Response(JSON.stringify({ success: true, data: { slug } }), { status });

describe('DNS check', () => {
  it('passes only when every A record is the frontend server and there is no AAAA', async () => {
    const ok = await checkDns('acme.com', { ...dnsStub({ 'acme.com': { a: [IP] } }), expectedIp: IP });
    assert.equal(ok.ok, true);

    const missing = await checkDns('acme.com', { ...dnsStub({}), expectedIp: IP });
    assert.match(missing.problem, /No A record yet/);

    const extra = await checkDns('acme.com', { ...dnsStub({ 'acme.com': { a: [IP, '76.76.21.21'] } }), expectedIp: IP });
    assert.match(extra.problem, /must all be 169\.58\.4\.58/);

    const v6 = await checkDns('acme.com', { ...dnsStub({ 'acme.com': { a: [IP], aaaa: ['2606::1'] } }), expectedIp: IP });
    assert.match(v6.problem, /AAAA/);
  });

  it('reports a lookup failure instead of throwing', async () => {
    const failing = await checkDns('acme.com', {
      resolve4: async () => {
        throw Object.assign(new Error('timeout'), { code: 'ETIMEOUT' });
      },
      resolve6: async () => [],
      expectedIp: IP,
    });
    assert.equal(failing.ok, false);
    assert.match(failing.problem, /ETIMEOUT/);
  });
});

describe('verifying a domain', () => {
  beforeEach(() => stubPrisma());

  it('goes live when DNS and HTTPS both pass', async () => {
    sites[0].customDomain = 'www.pawspines.com';
    const now = new Date('2026-09-29T10:00:00Z');
    const result = await verifySiteDomain('site-a', {
      ...dnsStub({ 'www.pawspines.com': { a: [IP] }, 'pawspines.com': { a: [IP] } }),
      fetchFn: answers('paws-denver'),
      expectedIp: IP,
      revalidateFn,
      now: () => now,
    });
    assert.equal(result.verified, true);
    assert.equal(result.checks.alternateDns.ok, true);
    assert.equal(result.domain.live, true);
    assert.equal(result.domain.url, 'https://www.pawspines.com');
    assert.equal(sites[0].customDomainVerifiedAt, now);
    assert.deepEqual(revalidated, ['paws-denver']);
  });

  it('stays unverified while DNS is not pointed yet, without trying HTTPS', async () => {
    sites[0].customDomain = 'pawspines.com';
    let fetched = false;
    const result = await verifySiteDomain('site-a', {
      ...dnsStub({}),
      fetchFn: async () => {
        fetched = true;
        return new Response('{}');
      },
      expectedIp: IP,
      revalidateFn,
    });
    assert.equal(result.verified, false);
    assert.equal(fetched, false);
    assert.equal(sites[0].customDomainVerifiedAt, null);
    assert.deepEqual(revalidated, []);
  });

  it('stays unverified when the domain serves another site, or has no certificate yet', async () => {
    sites[0].customDomain = 'pawspines.com';
    const dns = dnsStub({ 'pawspines.com': { a: [IP] }, 'www.pawspines.com': { a: [IP] } });

    const other = await verifySiteDomain('site-a', { ...dns, fetchFn: answers('coolflow-phoenix'), expectedIp: IP, revalidateFn });
    assert.equal(other.verified, false);
    assert.match(other.checks.https.problem, /different site/);

    const noCert = await verifySiteDomain('site-a', {
      ...dns,
      fetchFn: async () => {
        throw new TypeError('fetch failed', { cause: { code: 'ERR_TLS_CERT_ALTNAME_INVALID' } });
      },
      expectedIp: IP,
      revalidateFn,
    });
    assert.equal(noCert.verified, false);
    assert.match(noCert.checks.https.problem, /ERR_TLS_CERT_ALTNAME_INVALID/);
    assert.equal(sites[0].customDomainVerifiedAt, null);
  });

  it('a failing check never takes a live domain down', async () => {
    const result = await verifySiteDomain('site-b', { ...dnsStub({}), fetchFn: answers(null), expectedIp: IP, revalidateFn });
    assert.equal(result.verified, false);
    assert.equal(result.domain.live, true);
    assert.notEqual(sites[1].customDomainVerifiedAt, null);
  });

  it('needs a domain first', async () => {
    await assert.rejects(verifySiteDomain('site-a', { revalidateFn }), (e) => e.code === 'NO_DOMAIN');
  });
});

describe('renderer and CORS', () => {
  beforeEach(() => stubPrisma());

  it('the renderer gets active sites’ domains with their live state', async () => {
    sites[0].customDomain = 'pawspines.com';
    assert.deepEqual(await listCustomDomains(), [
      { slug: 'paws-denver', domain: 'pawspines.com', live: false },
      { slug: 'coolflow-phoenix', domain: 'coolflow.com', live: true },
    ]);
    assert.equal(classifyRequest('GET', '/custom-domains'), 'renderer-readable');
    assert.equal(classifyRequest('PUT', '/sites/site-a/domain'), 'admin');
    assert.equal(classifyRequest('POST', '/sites/site-a/domain/verify'), 'admin');
    assert.equal(classifyRequest('GET', '/sites/site-a/domain'), 'admin');
  });

  it('only live custom domains over https may call the API', async () => {
    let loads = 0;
    let clock = 0;
    const check = createSiteOriginChecker({
      loadFn: async () => {
        loads += 1;
        return [
          { slug: 'a', domain: 'coolflow.com', live: true },
          { slug: 'b', domain: 'pawspines.com', live: false },
        ];
      },
      ttlMs: 1000,
      now: () => clock,
    });
    assert.equal(await check('https://coolflow.com'), true);
    assert.equal(await check('https://pawspines.com'), false, 'not live yet');
    assert.equal(await check('http://coolflow.com'), false, 'https only');
    assert.equal(await check('https://evil.example'), false);
    assert.equal(await check(undefined), false);
    assert.equal(loads, 1, 'list reused within the minute');
    clock = 2000;
    await check('https://coolflow.com');
    assert.equal(loads, 2);
  });

  it('a failed refresh keeps the last good list', async () => {
    let fail = false;
    let clock = 0;
    const check = createSiteOriginChecker({
      loadFn: async () => {
        if (fail) throw new Error('db down');
        return [{ slug: 'a', domain: 'coolflow.com', live: true }];
      },
      ttlMs: 1000,
      now: () => clock,
    });
    assert.equal(await check('https://coolflow.com'), true);
    fail = true;
    clock = 5000;
    assert.equal(await check('https://coolflow.com'), true);
  });

  it('dashboard state for a site without a domain', () => {
    assert.deepEqual(domainState({ customDomain: null, customDomainVerifiedAt: null }, IP), {
      domain: null,
      alternate: null,
      verifiedAt: null,
      live: false,
      url: null,
      dnsRecords: [],
    });
  });
});
