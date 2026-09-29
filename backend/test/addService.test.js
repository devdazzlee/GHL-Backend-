import './helpers/env.js';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/database/client.js';
import { createApp } from '../src/app.js';
import {
  generateServiceContent,
  normalizeServiceTitle,
  serviceSlugOf,
  validateServiceTitle,
} from '../src/services/serviceGeneration.service.js';
import { validateUnit } from '../src/services/contentContract.js';
import { quietLogs } from './helpers/stubs.js';

const ADMIN = 'admin-key-for-tests-0123456789abcdef';
const site = {
  id: 'site-1',
  slug: 'paws-denver',
  businessName: 'Paws & Pines',
  industry: 'Pet Boarding',
  city: 'Denver',
  state: 'CO',
};
const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
const schemaFor = async () => ({ systemPrompt: 'You write for local businesses.' });

describe('service content from a name', () => {
  it('tidies and checks the name, and uses the site URL key', () => {
    assert.equal(normalizeServiceTitle('  Dog   Daycare '), 'Dog Daycare');
    assert.throws(() => validateServiceTitle('x'), (e) => e.code === 'INVALID_SERVICE_TITLE');
    assert.throws(() => validateServiceTitle('x'.repeat(81)), (e) => e.code === 'INVALID_SERVICE_TITLE');
    assert.equal(serviceSlugOf('Cat & Kitten Care'), 'cat--kitten-care');
  });

  it('asks for the summary + icon and the full description, with the site and service in the prompt', async () => {
    const calls = [];
    const generate = async (unit) => {
      calls.push(unit);
      return unit.unitId === 'services.fullDescription'
        ? { fullDescription: words(260) }
        : { shortDescription: words(35), icon: 'Heart' };
    };
    const out = await generateServiceContent(site, 'Dog Daycare', { generate, schemaFor });
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.match(call.userPrompt, /"Dog Daycare" offered by Paws & Pines, a Pet Boarding business in Denver, CO/);
      assert.equal(call.systemPrompt, 'You write for local businesses.');
    }
    assert.equal(out.icon, 'heart');
    assert.equal(out.shortDescription.split(' ').length, 35);
    assert.equal(out.fullDescription.split(' ').length, 260);
  });

  it('the real content checker accepts a good catalog entry and rejects a thin one', () => {
    assert.equal(validateUnit('services.catalogEntry', { shortDescription: words(32), icon: 'star' }).ok, true);
    assert.equal(validateUnit('services.catalogEntry', { shortDescription: 'too short', icon: 'star' }).ok, false);
    assert.equal(validateUnit('services.catalogEntry', { shortDescription: words(32), icon: '' }).ok, false);
  });

  it('falls back to the wrench for an icon the site cannot draw', async () => {
    const generate = async (unit) =>
      unit.unitId === 'services.fullDescription' ? { fullDescription: words(260) } : { shortDescription: words(35), icon: 'rocket' };
    assert.equal((await generateServiceContent(site, 'Dog Daycare', { generate, schemaFor })).icon, 'wrench');
  });

  it('refuses an answer that is far too short', async () => {
    const generate = async (unit) =>
      unit.unitId === 'services.fullDescription' ? { fullDescription: words(40) } : { shortDescription: words(35), icon: 'star' };
    await assert.rejects(generateServiceContent(site, 'Dog Daycare', { generate, schemaFor }), (e) => e.code === 'SERVICE_GENERATION_SHORT');
  });
});

describe('POST /phase4/sites/:id/services', () => {
  let server;
  let base;
  let restoreLogs;
  let saved;
  let row;

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
    saved = null;
    row = {
      ...site,
      status: 'ACTIVE',
      template: null,
      servicesContent: JSON.stringify({ services: [{ title: 'Dog Boarding', shortDescription: 's', fullDescription: 'f', icon: 'home' }] }),
      homeContent: JSON.stringify({ services: [{ title: 'Dog Boarding', description: 's', icon: 'home' }] }),
    };
    prisma.generatedSite.findUnique = async () => row;
    prisma.generatedSite.findFirst = async () => row;
    prisma.generatedSite.update = async ({ data }) => {
      saved = data;
      return { ...row, ...data };
    };
    prisma.servicePage.findUnique = async () => ({ id: 'page', content: '{}' });
    const schemaRow = { industry: 'Pet Boarding', systemPrompt: 'p', homePageSchema: '{}', aboutPageSchema: '{}', servicesPageSchema: '{}', contactPageSchema: '{}', blogPageSchema: '{}' };
    prisma.industrySchema.findFirst = async () => schemaRow;
    prisma.industrySchema.findUnique = async () => schemaRow;
    prisma.industrySchema.findMany = async () => [schemaRow];
    prisma.servicePage.findFirst = async () => ({ id: 'page', content: '{}' });
  });

  const post = (body) =>
    fetch(`${base}/sites/site-1/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN}` },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, json: await r.json() }));

  it('with every field typed in, saves them as they are (no AI)', async () => {
    const res = await post({ title: 'Cat Care', shortDescription: 'Short.', fullDescription: 'Full text.', icon: 'heart' });
    assert.equal(res.status, 201);
    assert.equal(res.json.data.generated, false);
    const services = JSON.parse(saved.servicesContent).services;
    assert.deepEqual(services.map((s) => s.title), ['Dog Boarding', 'Cat Care']);
    assert.equal(JSON.parse(saved.homeContent).services[1].description, 'Short.');
  });

  it('with only a name, asks the AI (here: not configured, so a clear 503)', async () => {
    const res = await post({ title: 'Cat Care' });
    assert.equal(res.status, 503);
    assert.equal(res.json.error.code, 'OPENAI_NOT_CONFIGURED');
    assert.equal(saved, null, 'nothing saved');
  });

  it('refuses a missing name and a service that already exists', async () => {
    assert.equal((await post({})).status, 400);
    const dup = await post({ title: ' dog   boarding ', shortDescription: 'a', fullDescription: 'b', icon: 'star' });
    assert.equal(dup.status, 409);
    assert.equal(dup.json.error.code, 'SERVICE_EXISTS');
  });
});
