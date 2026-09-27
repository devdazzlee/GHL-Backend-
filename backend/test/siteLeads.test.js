import './helpers/env.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import prisma from '../src/database/client.js';
import { deliverLeadToGhl, LEAD_STATUS } from '../src/services/siteLeads.service.js';
import { quietLogs } from './helpers/stubs.js';

const LOCATIONS = {
  'loc-a': { id: 'loc-a', ghlLocationId: 'GHL_A', ghlApiKey: 'pit-a', status: 'ACTIVE' },
  'loc-b': { id: 'loc-b', ghlLocationId: 'GHL_B', ghlApiKey: 'pit-b', status: 'ACTIVE' },
  'loc-nokey': { id: 'loc-nokey', ghlLocationId: 'GHL_C', ghlApiKey: null, status: 'ACTIVE' },
};
const submission = (id) => ({ id, name: 'Jane Q Visitor', email: 'jane@example.com', phone: '+15551234567', message: 'Need a quote' });

let recorded;
let calls;
let restoreLogs;
let upsertFails;

beforeEach(() => {
  restoreLogs = quietLogs();
  recorded = {};
  calls = [];
  upsertFails = false;
  prisma.location.findUnique = async ({ where }) => LOCATIONS[where.id] ?? null;
  // Guard: the old code used findMany to pick the oldest location. It must never be used now.
  prisma.location.findMany = async () => { throw new Error('location.findMany must not be used for lead routing'); };
  prisma.contactSubmission.update = async ({ where, data }) => { recorded[where.id] = data; return data; };
  axios.defaults.adapter = async (config) => {
    calls.push({ url: config.url, auth: config.headers.Authorization, body: JSON.parse(config.data) });
    if (config.url.endsWith('/contacts/upsert')) {
      if (upsertFails) {
        // Real axios rejects non-2xx responses with the response attached.
        throw Object.assign(new Error('Request failed with status code 400'), { response: { status: 400, data: { message: 'Bad email' } } });
      }
      return { status: 200, data: { new: true, contact: { id: `contact-${calls.length}` } }, headers: {}, config };
    }
    return { status: 201, data: { note: { id: 'n1' } }, headers: {}, config };
  };
});
afterEach(() => restoreLogs());

describe('lead routing', () => {
  it('sends each site\'s lead to its own mapped location with that location\'s key', async () => {
    await deliverLeadToGhl({ slug: 'site-one', leadLocationId: 'loc-a' }, submission('s1'));
    await deliverLeadToGhl({ slug: 'site-two', leadLocationId: 'loc-b' }, submission('s2'));

    const upserts = calls.filter((c) => c.url.endsWith('/contacts/upsert'));
    assert.deepEqual(upserts.map((c) => [c.body.locationId, c.auth]), [['GHL_A', 'Bearer pit-a'], ['GHL_B', 'Bearer pit-b']]);
    assert.equal(upserts[0].body.firstName, 'Jane');
    assert.equal(upserts[0].body.lastName, 'Q Visitor');
    assert.ok(upserts[0].body.tags.includes('site:site-one'));
    assert.equal(recorded.s1.ghlStatus, LEAD_STATUS.SENT);
    assert.equal(recorded.s1.ghlLocationId, 'GHL_A');
    assert.equal(recorded.s2.ghlLocationId, 'GHL_B');
    // message added as a note on the created contact
    assert.ok(calls.some((c) => c.url.includes('/contacts/contact-1/notes') && c.body.body.includes('Need a quote')));
  });

  it('holds and flags the lead when the site has no location mapped (no GHL call, no fallback)', async () => {
    const r = await deliverLeadToGhl({ slug: 'unmapped', leadLocationId: null }, submission('s3'));
    assert.equal(r.ghlStatus, LEAD_STATUS.HELD_NO_LOCATION);
    assert.equal(recorded.s3.ghlStatus, LEAD_STATUS.HELD_NO_LOCATION);
    assert.equal(calls.length, 0);
  });

  it('holds the lead when the mapped location has no key', async () => {
    const r = await deliverLeadToGhl({ slug: 'x', leadLocationId: 'loc-nokey' }, submission('s4'));
    assert.equal(r.ghlStatus, LEAD_STATUS.HELD_NO_KEY);
    assert.equal(calls.length, 0);
  });

  it('records FAILED with GHL\'s error and does not throw', async () => {
    upsertFails = true;
    const r = await deliverLeadToGhl({ slug: 'x', leadLocationId: 'loc-a' }, submission('s5'));
    assert.equal(r.ghlStatus, LEAD_STATUS.FAILED);
    assert.match(recorded.s5.ghlError, /Bad email/);
  });
});
