import './helpers/env.js';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/database/client.js';
import { createApp } from '../src/app.js';
import { classifyRequest, matchKey, parseAdminKeys } from '../src/middleware/phase4Auth.js';
import { quietLogs } from './helpers/stubs.js';

const ADMIN = 'admin-key-for-tests-0123456789abcdef';
const RENDERER = 'renderer-key-for-tests-0123456789abcd';
const WEBHOOK = 'webhook-key-for-tests-0123456789abcde';

let server;
let base;
let created;
let updated;
let restoreLogs;

function stubPrismaForRoutes() {
  created = [];
  updated = [];
  const site = {
    id: 'site-1',
    slug: 'demo-site-lodi',
    businessName: 'Demo',
    industry: 'hvac',
    city: 'Lodi',
    status: 'ACTIVE',
    searchIndexable: null,
    template: null,
    locationPages: [],
  };
  prisma.contactSubmission.findMany = async () => [];
  prisma.contactSubmission.count = async () => 0;
  prisma.contactSubmission.create = async ({ data }) => {
    created.push(data);
    return { id: 'sub-1', createdAt: new Date(), ...data };
  };
  prisma.contactSubmission.update = async ({ data }) => ({ id: 'sub-1', ...data });
  prisma.generatedSite.findUnique = async () => site;
  prisma.generatedSite.findMany = async ({ where }) =>
    where?.searchIndexable === true ? [{ slug: 'indexable-one' }] : [site];
  prisma.generatedSite.count = async () => 1;
  prisma.generatedSite.update = async ({ data }) => {
    updated.push(data);
    return { ...site, ...data };
  };
  prisma.location.findMany = async () => [];
  prisma.location.findUnique = async () => null;
}

async function call(method, path, { headers = {}, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const contactBody = (overrides = {}) => ({
  name: 'Test Visitor',
  email: 'visitor@example.com',
  message: 'Hello',
  ...overrides,
});

before(async () => {
  restoreLogs = quietLogs();
  process.env.ADMIN_API_KEYS = `raza=${ADMIN}`;
  process.env.SITE_RENDERER_API_KEY = RENDERER;
  delete process.env.WEBHOOK_API_KEY;
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/phase4`;
});

after(() => {
  server.close();
  restoreLogs();
});

beforeEach(() => stubPrismaForRoutes());

describe('phase4 auth helpers', () => {
  it('parses labelled keys and ignores short ones', () => {
    assert.deepEqual(
      parseAdminKeys(`raza=${ADMIN},short=abc, ${RENDERER}`).map((k) => k.label),
      ['raza', 'key3'],
    );
  });

  it('matches keys and returns the label', () => {
    const keys = parseAdminKeys(`raza=${ADMIN}`);
    assert.equal(matchKey(ADMIN, keys), 'raza');
    assert.equal(matchKey(`${ADMIN}x`, keys), null);
    assert.equal(matchKey('', keys), null);
  });

  it('classifies routes', () => {
    assert.equal(classifyRequest('POST', '/sites/abc/contact'), 'public');
    assert.equal(classifyRequest('GET', '/contacts'), 'admin');
    assert.equal(classifyRequest('GET', '/sites/abc'), 'renderer-readable');
    assert.equal(classifyRequest('GET', '/sites/abc/services/x'), 'renderer-readable');
    assert.equal(classifyRequest('PATCH', '/sites/abc'), 'admin');
    assert.equal(classifyRequest('POST', '/webhook'), 'webhook');
  });
});

describe('phase4 endpoints over HTTP', () => {
  it('rejects unauthenticated GET /phase4/contacts with 401', async () => {
    const r = await call('GET', '/contacts');
    assert.equal(r.status, 401);
    assert.equal(r.json.error.code, 'AUTH_REQUIRED');
  });

  it('rejects a wrong key with 401 AUTH_INVALID', async () => {
    const r = await call('GET', '/contacts', { headers: { Authorization: 'Bearer wrong-key-000000000000000000' } });
    assert.equal(r.status, 401);
    assert.equal(r.json.error.code, 'AUTH_INVALID');
  });

  it('allows an admin key', async () => {
    const r = await call('GET', '/contacts', { headers: { Authorization: `Bearer ${ADMIN}` } });
    assert.equal(r.status, 200);
  });

  it('lets the renderer key read sites but nothing else', async () => {
    const ok = await call('GET', '/sites/demo-site-lodi', { headers: { 'x-site-api-key': RENDERER } });
    assert.equal(ok.status, 200);
    const contacts = await call('GET', '/contacts', { headers: { 'x-site-api-key': RENDERER } });
    assert.equal(contacts.status, 403);
    const patch = await call('PATCH', '/sites/site-1', { headers: { 'x-site-api-key': RENDERER }, body: { status: 'INACTIVE' } });
    assert.equal(patch.status, 403);
    assert.equal(updated.length, 0);
  });

  it('fails closed with 503 when no admin keys are configured', async () => {
    const saved = process.env.ADMIN_API_KEYS;
    process.env.ADMIN_API_KEYS = '';
    try {
      const r = await call('DELETE', '/sites/site-1');
      assert.equal(r.status, 503);
      assert.equal(r.json.error.code, 'AUTH_NOT_CONFIGURED');
    } finally {
      process.env.ADMIN_API_KEYS = saved;
    }
  });

  it('keeps the public contact form working without a key', async () => {
    const r = await call('POST', '/sites/demo-site-lodi/contact', { body: contactBody() });
    assert.equal(r.status, 201);
    assert.equal(created.length, 1);
  });

  it('silently drops honeypot submissions', async () => {
    const r = await call('POST', '/sites/demo-site-lodi/contact', { body: contactBody({ website: 'http://spam' }) });
    assert.equal(r.status, 201);
    assert.equal(created.length, 0);
  });

  it('validates contact fields', async () => {
    const bad = await call('POST', '/sites/demo-site-lodi/contact', { body: contactBody({ email: 'not-an-email' }) });
    assert.equal(bad.status, 400);
    const long = await call('POST', '/sites/demo-site-lodi/contact', { body: contactBody({ message: 'x'.repeat(5001) }) });
    assert.equal(long.status, 400);
  });

  it('webhook stays public until WEBHOOK_API_KEY is set, then requires it', async () => {
    const open = await call('POST', '/webhook', { body: {} });
    assert.equal(open.status, 400); // reached the handler (validation error), not blocked
    process.env.WEBHOOK_API_KEY = WEBHOOK;
    try {
      const blocked = await call('POST', '/webhook', { body: {} });
      assert.equal(blocked.status, 401);
      const allowed = await call('POST', '/webhook', { headers: { 'x-webhook-key': WEBHOOK }, body: {} });
      assert.equal(allowed.status, 400); // key accepted, handler validation runs
    } finally {
      delete process.env.WEBHOOK_API_KEY;
    }
  });
});

describe('item 1: per-site indexing switch', () => {
  it('lists indexable slugs for the renderer', async () => {
    const r = await call('GET', '/indexable-sites', { headers: { 'x-site-api-key': RENDERER } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.data.slugs, ['indexable-one']);
  });

  it('accepts only a boolean searchIndexable in PATCH', async () => {
    const bad = await call('PATCH', '/sites/site-1', { headers: { Authorization: `Bearer ${ADMIN}` }, body: { searchIndexable: 'yes' } });
    assert.equal(bad.status, 400);
    const ok = await call('PATCH', '/sites/site-1', { headers: { Authorization: `Bearer ${ADMIN}` }, body: { searchIndexable: true } });
    assert.equal(ok.status, 200);
    assert.equal(updated.at(-1).searchIndexable, true);
  });
});

// Rate limit last: it keeps state for this IP across the file.
describe('contact form rate limit', () => {
  it('returns 429 after 5 messages from one IP in 10 minutes', async () => {
    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await call('POST', '/sites/demo-site-lodi/contact', { body: contactBody() })).status);
    }
    assert.equal(statuses.at(-1), 429);
  });
});
