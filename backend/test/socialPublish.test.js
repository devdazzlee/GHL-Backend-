import './helpers/env.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSocialSettings,
  publishSocialForSource,
  runSocialPostStatusCheck,
  updateSocialSettings,
} from '../src/services/ghlSocial.service.js';
import {
  FB,
  GBP,
  IG,
  TOKEN_ERROR,
  accountsResponse,
  captureAlerts,
  createPostOk,
  makeLocation,
  quietLogs,
  stubGhl,
  stubPrisma,
} from './helpers/stubs.js';

const source = (id, mediaUrl = 'https://images.example.com/a.jpg') => ({
  sourceType: 'GBP_POST',
  sourceId: id,
  summary: 'Post text',
  mediaUrl,
});

let alerts;
let restoreAlerts;
let restoreLogs;
beforeEach(() => {
  ({ alerts, restore: restoreAlerts } = captureAlerts());
  restoreLogs = quietLogs();
});
afterEach(() => {
  restoreAlerts();
  restoreLogs();
});

describe('publishSocialForSource with platform switches', () => {
  it('posts to both platforms and records per-platform SENT', async () => {
    const state = stubPrisma();
    const calls = stubGhl({ getAccounts: accountsResponse([GBP, FB, IG]), createPost: createPostOk() });

    const r = await publishSocialForSource(state.location, source('p1'));
    assert.equal(r.success, true);
    const create = calls.find((c) => c.url.endsWith('/posts'));
    assert.deepEqual(create.body.accountIds, [FB.id, IG.id]);
    const row = state.socialPosts.get('GBP_POST:p1');
    assert.equal(row.status, 'SENT');
    assert.equal(row.platformResults.facebook.status, 'SENT');
    assert.equal(row.platformResults.instagram.status, 'SENT');
    assert.equal(alerts.length, 0);
  });

  it('skips a switched-off platform and records it as DISABLED', async () => {
    const state = stubPrisma({ location: makeLocation({ socialInstagramEnabled: false }) });
    const calls = stubGhl({ getAccounts: accountsResponse([FB, IG]), createPost: createPostOk() });

    await publishSocialForSource(state.location, source('p2'));
    const create = calls.find((c) => c.url.endsWith('/posts'));
    assert.deepEqual(create.body.accountIds, [FB.id]);
    const row = state.socialPosts.get('GBP_POST:p2');
    assert.equal(row.platformResults.instagram.status, 'DISABLED');
    const audit = state.audits.find((a) => a.action === 'SOCIAL_POST_CREATED');
    assert.deepEqual(audit.details.disabledPlatforms, ['instagram']);
  });

  it('records SKIPPED with a reason and no alert when every platform is off', async () => {
    const state = stubPrisma({
      location: makeLocation({ socialFacebookEnabled: false, socialInstagramEnabled: false }),
    });
    const calls = stubGhl({ getAccounts: accountsResponse([FB, IG]) });

    const r = await publishSocialForSource(state.location, source('p3'));
    assert.equal(r.skipped, true);
    assert.equal(r.reason, 'platforms_disabled');
    assert.equal(calls.some((c) => c.url.endsWith('/posts')), false, 'nothing sent to GHL');
    const row = state.socialPosts.get('GBP_POST:p3');
    assert.equal(row.status, 'SKIPPED');
    assert.equal(row.error, 'All connected platforms are disabled for this location');
    assert.equal(row.platformResults.facebook.status, 'DISABLED');
    assert.equal(alerts.length, 0);
    assert.equal(state.audits.some((a) => a.action === 'SOCIAL_POST_FAILED'), false);
  });

  it('never targets Google, even with both platforms on', async () => {
    const state = stubPrisma();
    const calls = stubGhl({ getAccounts: accountsResponse([GBP, FB]), createPost: createPostOk() });
    await publishSocialForSource(state.location, source('p4'));
    assert.deepEqual(calls.find((c) => c.url.endsWith('/posts')).body.accountIds, [FB.id]);
  });

  it('records per-platform FAILED and alerts once when GHL rejects the post', async () => {
    const state = stubPrisma();
    stubGhl({
      getAccounts: accountsResponse([FB, IG]),
      createPost: () => ({ status: 422, data: { message: 'Bad media' } }),
    });
    const r = await publishSocialForSource(state.location, source('p5'));
    assert.equal(r.success, false);
    const row = state.socialPosts.get('GBP_POST:p5');
    assert.equal(row.status, 'FAILED');
    assert.equal(row.platformResults.facebook.status, 'FAILED');
    assert.equal(row.platformResults.instagram.status, 'FAILED');
    assert.equal(alerts.length, 1);
  });

  it('does nothing when the master switch is OFF', async () => {
    const state = stubPrisma({ location: makeLocation({ socialPostingMode: 'OFF' }) });
    const calls = stubGhl({});
    const r = await publishSocialForSource(state.location, source('p6'));
    assert.equal(r.reason, 'social_off');
    assert.equal(calls.length, 0);
    assert.equal(state.socialPosts.size, 0);
  });
});

describe('status checker writes per-platform failures', () => {
  it('marks only the failed platform and alerts once', async () => {
    const state = stubPrisma();
    const row = {
      id: 'sp-1',
      locationId: 'loc-1',
      sourceType: 'GBP_POST',
      sourceId: 'p7',
      mode: 'LIVE',
      status: 'SENT',
      accountIds: [FB.id, IG.id],
      ghlPostId: 'parent-1',
      createdAt: new Date('2026-09-25T21:00:00Z'),
      scheduledFor: new Date('2026-09-25T21:05:00Z'),
      alertedAt: null,
      platformResults: {
        facebook: { accountId: FB.id, status: 'SENT' },
        instagram: { accountId: IG.id, status: 'SENT' },
      },
    };
    state.socialPosts.set('GBP_POST:p7', row);
    stubGhl({
      listPosts: () => ({
        status: 201,
        data: {
          results: {
            posts: [{ _id: 'child-fb', parentPostId: 'parent-1', accountId: FB.id, platform: 'facebook', status: 'failed', error: TOKEN_ERROR }],
            count: 1,
          },
        },
      }),
    });

    const now = new Date('2026-09-25T22:00:00Z');
    await runSocialPostStatusCheck({ now, rows: [{ ...row }] });
    await runSocialPostStatusCheck({ now, rows: [{ ...row, status: 'SENT', alertedAt: null }] });

    assert.equal(row.status, 'FAILED');
    assert.equal(row.platformResults.facebook.status, 'FAILED');
    assert.equal(row.platformResults.facebook.ghlChildPostId, 'child-fb');
    assert.equal(row.platformResults.instagram.status, 'SENT');
    assert.equal(alerts.length, 1);

    const settings = await getSocialSettings('loc-1');
    assert.equal(settings.platforms.facebook.needsReconnect, true);
    assert.equal(settings.platforms.instagram.needsReconnect, false);
  });
});

describe('updateSocialSettings', () => {
  const actor = { requestId: 'req-1', ip: '10.0.0.1', userAgent: 'test-agent' };

  it('saves a switch change and audits who and what changed', async () => {
    const state = stubPrisma();
    const out = await updateSocialSettings('loc-1', { facebookEnabled: false, changedBy: 'raza' }, actor);

    assert.equal(state.location.socialFacebookEnabled, false);
    assert.equal(out.platforms.facebook.enabled, false);
    const audit = state.audits.find((a) => a.action === 'SOCIAL_SETTINGS_UPDATED');
    assert.deepEqual(audit.details.changes, { socialFacebookEnabled: { from: true, to: false } });
    assert.deepEqual(audit.details.actor, {
      requestId: 'req-1',
      ip: '10.0.0.1',
      userAgent: 'test-agent',
      changedBy: 'raza',
      changedByVerified: false,
    });
  });

  it('writes no audit entry when nothing changes', async () => {
    const state = stubPrisma();
    await updateSocialSettings('loc-1', { facebookEnabled: true }, actor);
    assert.equal(state.audits.length, 0);
    assert.equal(state.locationUpdates.length, 0);
  });

  it('refuses enabling a platform with no connected account and changes nothing', async () => {
    const state = stubPrisma({
      location: makeLocation({ ghlSocialAccounts: [FB], socialInstagramEnabled: false }),
    });
    await assert.rejects(
      updateSocialSettings('loc-1', { instagramEnabled: true }, actor),
      (e) => e.code === 'SOCIAL_PLATFORM_NOT_CONNECTED' && e.statusCode === 400,
    );
    assert.equal(state.location.socialInstagramEnabled, false);
    assert.equal(state.audits.length, 0);
  });
});
