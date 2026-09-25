import './helpers/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyChildFailures,
  buildActor,
  diffSocialSettings,
  isTokenError,
  legacyPlatformResults,
  platformResultsOnSend,
  selectTargets,
  summarizePlatforms,
  validateSocialSettingsChange,
} from '../src/services/socialPlatforms.js';
import { FB, IG, TOKEN_ERROR, makeLocation } from './helpers/stubs.js';

describe('selectTargets', () => {
  it('targets both platforms when both are on and there is an image', () => {
    const s = selectTargets([FB, IG], makeLocation(), { hasImage: true });
    assert.deepEqual(s.accountIds, [FB.id, IG.id]);
    assert.deepEqual(s.disabledPlatforms, []);
    assert.equal(s.allDisabled, false);
  });

  it('drops a switched-off platform and reports it', () => {
    const s = selectTargets([FB, IG], makeLocation({ socialFacebookEnabled: false }), { hasImage: true });
    assert.deepEqual(s.accountIds, [IG.id]);
    assert.deepEqual(s.disabledPlatforms, ['facebook']);
    assert.equal(s.allDisabled, false);
  });

  it('flags allDisabled when every connected platform is off', () => {
    const loc = makeLocation({ socialFacebookEnabled: false, socialInstagramEnabled: false });
    const s = selectTargets([FB, IG], loc, { hasImage: true });
    assert.deepEqual(s.accountIds, []);
    assert.equal(s.allDisabled, true);
  });

  it('does not flag allDisabled when the only enabled platform is dropped for lack of an image', () => {
    const loc = makeLocation({ socialFacebookEnabled: false });
    const s = selectTargets([FB, IG], loc, { hasImage: false });
    assert.deepEqual(s.accountIds, []);
    assert.equal(s.allDisabled, false);
  });

  it('does not flag allDisabled when nothing is connected', () => {
    assert.equal(selectTargets([], makeLocation(), { hasImage: true }).allDisabled, false);
  });
});

describe('validateSocialSettingsChange', () => {
  it('refuses to enable a platform with no connected account', () => {
    const loc = makeLocation({ ghlSocialAccounts: [FB], socialInstagramEnabled: false });
    assert.throws(
      () => validateSocialSettingsChange(loc, { instagramEnabled: true }),
      (e) =>
        e.statusCode === 400 &&
        e.code === 'SOCIAL_PLATFORM_NOT_CONNECTED' &&
        /Cannot enable Instagram: no Instagram account is connected/.test(e.message),
    );
  });

  it('always allows switching a platform off', () => {
    const loc = makeLocation({ ghlSocialAccounts: [], socialPostingMode: 'OFF' });
    assert.deepEqual(validateSocialSettingsChange(loc, { facebookEnabled: false }), {
      socialFacebookEnabled: false,
    });
  });

  it('rejects non-boolean switch values', () => {
    assert.throws(
      () => validateSocialSettingsChange(makeLocation(), { facebookEnabled: 'yes' }),
      (e) => e.code === 'INVALID_BODY',
    );
  });

  it('refuses DRAFT/LIVE when no platform is both enabled and connected', () => {
    const loc = makeLocation({ socialPostingMode: 'OFF', ghlSocialAccounts: [FB], socialFacebookEnabled: false });
    assert.throws(
      () => validateSocialSettingsChange(loc, { socialPostingMode: 'LIVE' }),
      (e) => e.code === 'SOCIAL_NO_USABLE_PLATFORM',
    );
  });

  it('allows switching off the last platform while LIVE (posts then record as SKIPPED)', () => {
    const loc = makeLocation({ ghlSocialAccounts: [FB] });
    assert.deepEqual(validateSocialSettingsChange(loc, { facebookEnabled: false }), {
      socialFacebookEnabled: false,
    });
  });

  it('allows enabling LIVE when one platform is on and connected', () => {
    const loc = makeLocation({ socialPostingMode: 'OFF', ghlSocialAccounts: [FB], socialInstagramEnabled: false });
    assert.deepEqual(validateSocialSettingsChange(loc, { socialPostingMode: 'LIVE' }), {
      socialPostingMode: 'LIVE',
    });
  });

  it('rejects an invalid mode and an overlong changedBy', () => {
    assert.throws(() => validateSocialSettingsChange(makeLocation(), { socialPostingMode: 'ON' }));
    assert.throws(() => validateSocialSettingsChange(makeLocation(), { changedBy: 'x'.repeat(101) }));
  });
});

describe('diffSocialSettings / buildActor', () => {
  it('lists only fields that actually change', () => {
    const changes = diffSocialSettings(makeLocation(), {
      socialFacebookEnabled: false,
      socialInstagramEnabled: true,
    });
    assert.deepEqual(changes, { socialFacebookEnabled: { from: true, to: false } });
  });

  it('marks changedBy as unverified and keeps request facts', () => {
    assert.deepEqual(buildActor({ requestId: 'r1', ip: '1.2.3.4', userAgent: 'UA', changedBy: ' raza ' }), {
      requestId: 'r1',
      ip: '1.2.3.4',
      userAgent: 'UA',
      changedBy: 'raza',
      changedByVerified: false,
    });
    assert.equal(buildActor({}).changedBy, null);
  });
});

describe('platform results', () => {
  it('records SENT for targets and DISABLED for switched-off platforms', () => {
    const at = new Date('2026-09-25T00:00:00Z');
    assert.deepEqual(platformResultsOnSend([IG], ['facebook'], [FB, IG], at), {
      instagram: { accountId: IG.id, status: 'SENT', at },
      facebook: { accountId: FB.id, status: 'DISABLED', at },
    });
  });

  it('applies a GHL child failure to the right platform', () => {
    const at = new Date();
    const results = applyChildFailures(
      { facebook: { accountId: FB.id, status: 'SENT' }, instagram: { accountId: IG.id, status: 'SENT' } },
      [{ _id: 'child-1', accountId: FB.id, platform: 'facebook', error: TOKEN_ERROR }],
      [FB, IG],
      at,
    );
    assert.equal(results.facebook.status, 'FAILED');
    assert.equal(results.facebook.ghlChildPostId, 'child-1');
    assert.equal(results.instagram.status, 'SENT');
  });

  it('derives legacy results, blaming only the platform a checker error names', () => {
    const row = {
      accountIds: [FB.id, IG.id],
      status: 'FAILED',
      error: `GHL could not publish to facebook "Biz FB" (GHL post c1): ${TOKEN_ERROR}`,
      createdAt: new Date(),
    };
    const results = legacyPlatformResults(row, [FB, IG]);
    assert.equal(results.facebook.status, 'FAILED');
    assert.equal(results.instagram.status, 'SENT');
  });
});

describe('summarizePlatforms', () => {
  const t = (s) => new Date(`2026-09-25T${s}Z`);

  it('flags needsReconnect when the latest result is a token failure', () => {
    const rows = [
      { id: 'r2', createdAt: t('21:30:00'), platformResults: { facebook: { accountId: FB.id, status: 'FAILED', error: TOKEN_ERROR, at: t('21:36:00') } } },
      { id: 'r1', createdAt: t('20:00:00'), platformResults: { facebook: { accountId: FB.id, status: 'SENT', at: t('20:00:00') } } },
    ];
    const p = summarizePlatforms(makeLocation(), rows);
    assert.equal(p.facebook.lastResult.status, 'FAILED');
    assert.equal(p.facebook.needsReconnect, true);
    assert.equal(p.facebook.connected, true);
    assert.equal(p.instagram.lastResult, null);
    assert.equal(p.instagram.needsReconnect, false);
  });

  it('clears needsReconnect after a later success, and ignores non-token failures', () => {
    const rows = [
      { id: 'r3', createdAt: t('22:00:00'), platformResults: { facebook: { status: 'SENT' }, instagram: { status: 'FAILED', error: 'Image too large' } } },
      { id: 'r2', createdAt: t('21:30:00'), platformResults: { facebook: { status: 'FAILED', error: TOKEN_ERROR } } },
    ];
    const p = summarizePlatforms(makeLocation(), rows);
    assert.equal(p.facebook.needsReconnect, false);
    assert.equal(p.instagram.lastResult.status, 'FAILED');
    assert.equal(p.instagram.needsReconnect, false);
  });

  it('skips DISABLED results so switching off does not hide a failure', () => {
    const rows = [
      { id: 'r3', createdAt: t('22:00:00'), platformResults: { facebook: { status: 'DISABLED' } } },
      { id: 'r2', createdAt: t('21:30:00'), platformResults: { facebook: { status: 'FAILED', error: TOKEN_ERROR } } },
    ];
    const p = summarizePlatforms(makeLocation({ socialFacebookEnabled: false }), rows);
    assert.equal(p.facebook.enabled, false);
    assert.equal(p.facebook.needsReconnect, true);
  });

  it('reports a platform with no stored account as not connected', () => {
    const p = summarizePlatforms(makeLocation({ ghlSocialAccounts: [FB] }), []);
    assert.equal(p.instagram.connected, false);
    assert.equal(p.instagram.account, null);
  });

  it('isTokenError matches GHL\'s wording only', () => {
    assert.equal(isTokenError(TOKEN_ERROR), true);
    assert.equal(isTokenError('Image dimensions not supported'), false);
  });
});
