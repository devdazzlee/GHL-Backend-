import './helpers/env.js';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/database/client.js';
import { createApp } from '../src/app.js';
import { quietLogs } from './helpers/stubs.js';

const ADMIN = 'admin-key-for-tests-0123456789abcdef';
let server;
let base;
let updates;
let restoreLogs;

before(async () => {
  restoreLogs = quietLogs();
  process.env.ADMIN_API_KEYS = `raza=${ADMIN}`;
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/phase4`;
});
after(() => {
  server.close();
  restoreLogs();
});

beforeEach(() => {
  updates = [];
  const site = { id: 'site-1', slug: 'old-name-lodi', businessName: 'Old Name', industry: 'hvac', city: 'Lodi', state: 'NJ', status: 'ACTIVE', template: null };
  prisma.generatedSite.findUnique = async () => site;
  prisma.generatedSite.update = async ({ data }) => {
    updates.push(data);
    return { ...site, ...data };
  };
});

async function patch(body) {
  const res = await fetch(`${base}/sites/site-1`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

describe('item 9: URL stability', () => {
  it('renaming saves the fields only: no regeneration, same URL', async () => {
    const r = await patch({ businessName: 'New Name', city: 'Hackensack' });
    assert.equal(r.status, 200);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].businessName, 'New Name');
    assert.equal('slug' in updates[0], false);
    assert.equal('homeContent' in updates[0], false);
    assert.equal(r.json.data.site.slug, 'old-name-lodi');
  });

  it('regenerates only when explicitly asked (reaches the AI step; no key in tests)', async () => {
    const r = await patch({ businessName: 'New Name', regenerateContent: true });
    // OPENAI_API_KEY is blank in tests, so the explicit regeneration fails before any write.
    assert.notEqual(r.status, 200);
    assert.equal(updates.length, 0);
  });

  it('never changes the URL through the edit form (only the change-url action, which adds redirects)', async () => {
    const r = await patch({ businessName: 'New Name', changeSlug: true });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'USE_CHANGE_URL');
    assert.equal(updates.length, 0);
  });
});
