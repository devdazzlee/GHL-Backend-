import './helpers/env.js';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_SCHEDULE_LEAD_MINUTES,
  publishSocialForSource,
} from '../src/services/ghlSocial.service.js';
import {
  FB,
  IG,
  accountsResponse,
  captureAlerts,
  createPostOk,
  makeLocation,
  stubGhl,
  stubPrisma,
} from './helpers/stubs.js';

const FIXED_NOW = new Date('2026-09-26T00:33:18.000Z');
const MIN_LEAD_MS = 15 * 60 * 1000;
const source = (id) => ({
  sourceType: 'GBP_POST',
  sourceId: id,
  summary: 'Post text',
  mediaUrl: 'https://images.example.com/a.jpg',
});

let alerts;
let restoreAlerts;
let infoLogs;
let restoreConsole;
beforeEach(() => {
  mock.timers.enable({ apis: ['Date'], now: FIXED_NOW });
  ({ alerts, restore: restoreAlerts } = captureAlerts());
  infoLogs = [];
  const { info, error } = console;
  console.info = (m) => infoLogs.push(String(m));
  console.error = () => {};
  restoreConsole = () => {
    console.info = info;
    console.error = error;
  };
});
afterEach(() => {
  mock.timers.reset();
  restoreAlerts();
  restoreConsole();
});

describe('LIVE schedule lead', () => {
  it('is a named constant of at least 15 minutes', () => {
    assert.ok(LIVE_SCHEDULE_LEAD_MINUTES >= 15);
  });

  it('schedules a LIVE post at least 15 minutes after the server clock, and records it', async () => {
    const state = stubPrisma();
    const calls = stubGhl({ getAccounts: accountsResponse([FB, IG]), createPost: createPostOk() });

    const r = await publishSocialForSource(state.location, source('p1'));
    assert.equal(r.success, true);

    const body = calls.find((c) => c.url.endsWith('/posts')).body;
    assert.equal(body.status, 'scheduled');
    const scheduled = new Date(body.scheduleDate).getTime();
    assert.ok(
      scheduled - FIXED_NOW.getTime() >= MIN_LEAD_MS,
      `scheduleDate ${body.scheduleDate} is less than 15 minutes after ${FIXED_NOW.toISOString()}`,
    );
    assert.equal(body.scheduleDate, new Date(FIXED_NOW.getTime() + LIVE_SCHEDULE_LEAD_MINUTES * 60000).toISOString());

    const row = state.socialPosts.get('GBP_POST:p1');
    assert.equal(row.scheduledFor.toISOString(), body.scheduleDate);
    const audit = state.audits.find((a) => a.action === 'SOCIAL_POST_CREATED');
    assert.equal(audit.details.scheduleLeadMinutes, LIVE_SCHEDULE_LEAD_MINUTES);
  });

  it('logs the lead used before sending', async () => {
    const state = stubPrisma();
    stubGhl({ getAccounts: accountsResponse([FB, IG]), createPost: createPostOk() });
    await publishSocialForSource(state.location, source('p2'));

    const log = infoLogs.map((l) => JSON.parse(l)).find((e) => e.event === 'ghl_social_post_scheduling');
    assert.ok(log, 'expected a ghl_social_post_scheduling log line');
    assert.equal(log.leadMinutes, LIVE_SCHEDULE_LEAD_MINUTES);
    assert.equal(log.serverNow, FIXED_NOW.toISOString());
  });

  it('sends no scheduleDate for DRAFT posts', async () => {
    const state = stubPrisma({ location: makeLocation({ socialPostingMode: 'DRAFT' }) });
    const calls = stubGhl({ getAccounts: accountsResponse([FB, IG]), createPost: createPostOk() });
    await publishSocialForSource(state.location, source('p3'));

    const body = calls.find((c) => c.url.endsWith('/posts')).body;
    assert.equal(body.status, 'draft');
    assert.equal(body.scheduleDate, undefined);
    assert.equal(infoLogs.some((l) => l.includes('ghl_social_post_scheduling')), false);
  });

  it('does not retry when GHL rejects the schedule date: one attempt, FAILED, one alert', async () => {
    const state = stubPrisma();
    const calls = stubGhl({
      getAccounts: accountsResponse([FB, IG]),
      createPost: () => ({
        status: 422,
        data: { message: ['Schedule Date must be after current date in ISO format'] },
      }),
    });

    const r = await publishSocialForSource(state.location, source('p4'));
    assert.equal(r.success, false);
    assert.equal(calls.filter((c) => c.url.endsWith('/posts')).length, 1);
    assert.equal(state.socialPosts.get('GBP_POST:p4').status, 'FAILED');
    assert.equal(alerts.length, 1);
  });
});
