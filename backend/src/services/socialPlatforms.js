/**
 * Pure per-platform social logic (no DB, no network) so it can be unit tested.
 * Platforms are the two we mirror to: Facebook Page and Instagram.
 */
import { AppError } from '../utils/AppError.js';

export const SOCIAL_PLATFORMS = ['facebook', 'instagram'];
export const SOCIAL_MODES = ['OFF', 'DRAFT', 'LIVE'];

const PLATFORM_LABEL = { facebook: 'Facebook', instagram: 'Instagram' };
const PLATFORM_SWITCH_FIELD = {
  facebook: 'socialFacebookEnabled',
  instagram: 'socialInstagramEnabled',
};
const PLATFORM_BODY_FIELD = { facebook: 'facebookEnabled', instagram: 'instagramEnabled' };

/** Fields that count as social settings for the audit log. */
const AUDITED_FIELDS = [
  'socialPostingMode',
  'ghlSocialUserId',
  'socialFacebookEnabled',
  'socialInstagramEnabled',
];

const TOKEN_ERROR_RX =
  /token has expired, been revoked, or is otherwise invalid|re-?connect your account/i;

export function platformOf(account) {
  const p = String(account?.platform ?? '').toLowerCase();
  return SOCIAL_PLATFORMS.includes(p) ? p : null;
}

export function isPlatformEnabled(location, platform) {
  return location?.[PLATFORM_SWITCH_FIELD[platform]] !== false;
}

export function isTokenError(message) {
  return TOKEN_ERROR_RX.test(String(message ?? ''));
}

/** First stored account for a platform, or null. */
export function connectedAccount(accounts, platform) {
  const list = Array.isArray(accounts) ? accounts : [];
  return list.find((a) => platformOf(a) === platform) ?? null;
}

/**
 * Chooses which accounts get the post. Accounts on a switched-off platform are
 * dropped (returned as disabledPlatforms); Instagram is dropped without an image.
 * Callers pass already-filtered FB/IG accounts (Google/expired excluded).
 */
export function selectTargets(accounts, location, { hasImage }) {
  const list = Array.isArray(accounts) ? accounts : [];
  const connected = list.filter((a) => platformOf(a));
  const enabled = connected.filter((a) => isPlatformEnabled(location, platformOf(a)));
  const disabledPlatforms = [
    ...new Set(connected.filter((a) => !enabled.includes(a)).map(platformOf)),
  ];
  const targets = enabled.filter((a) => hasImage || platformOf(a) !== 'instagram');
  return {
    targets,
    accountIds: targets.map((a) => a.id),
    disabledPlatforms,
    // Connected accounts existed but every one of them is switched off.
    allDisabled: connected.length > 0 && enabled.length === 0,
  };
}

/** platformResults for a post GHL accepted (targets SENT, switched-off DISABLED). */
export function platformResultsOnSend(targets, disabledPlatforms, accounts, at) {
  const results = {};
  for (const a of targets) {
    results[platformOf(a)] = { accountId: a.id, status: 'SENT', at };
  }
  for (const p of disabledPlatforms) {
    results[p] = { accountId: connectedAccount(accounts, p)?.id ?? null, status: 'DISABLED', at };
  }
  return results;
}

/** platformResults when the whole request failed for the targeted accounts. */
export function platformResultsOnFailure(targets, error, at) {
  const results = {};
  for (const a of targets) {
    results[platformOf(a)] = { accountId: a.id, status: 'FAILED', error, at };
  }
  return results;
}

/**
 * Applies GHL per-account child failures (from the status checker) onto a
 * row's platformResults. Children are matched to platforms by accountId,
 * falling back to the child's own platform field.
 */
export function applyChildFailures(platformResults, failedChildren, accounts, at) {
  const results = { ...(platformResults ?? {}) };
  for (const child of failedChildren) {
    const account = (Array.isArray(accounts) ? accounts : []).find((a) => a.id === child.accountId);
    const platform = platformOf(account) ?? platformOf({ platform: child.platform });
    if (!platform) continue;
    results[platform] = {
      accountId: child.accountId ?? results[platform]?.accountId ?? null,
      status: 'FAILED',
      error: child.error ?? 'GHL reported a failure without an error message',
      ghlChildPostId: child._id ?? null,
      at,
    };
  }
  return results;
}

/**
 * Best-effort platformResults for rows written before that field existed:
 * each account in accountIds gets the row status; for a FAILED row the error
 * only counts against a platform the error text names (the status checker
 * names the platform), otherwise against all of them.
 */
export function legacyPlatformResults(row, accounts) {
  const list = Array.isArray(accounts) ? accounts : [];
  const results = {};
  for (const accountId of row.accountIds ?? []) {
    const platform =
      platformOf(list.find((a) => a.id === accountId)) ??
      (/_page$/.test(accountId) ? 'facebook' : null);
    if (!platform) continue;
    let status = row.status === 'FAILED' ? 'FAILED' : row.status === 'SENT' ? 'SENT' : null;
    if (!status) continue;
    const error = row.error ?? null;
    if (status === 'FAILED' && error && /GHL could not publish to/i.test(error)) {
      const namesPlatform = new RegExp(`publish to ${platform}\\b`, 'i').test(error);
      if (!namesPlatform) status = 'SENT';
    }
    results[platform] = {
      accountId,
      status,
      ...(status === 'FAILED' ? { error } : {}),
      at: row.createdAt,
      legacy: true,
    };
  }
  return results;
}

/**
 * Per-platform status for the settings response. rows are recent SocialPost
 * rows, newest first. DISABLED results are skipped when finding the last
 * result, so switching a platform off doesn't hide an unresolved failure.
 */
export function summarizePlatforms(location, rows) {
  const accounts = Array.isArray(location.ghlSocialAccounts) ? location.ghlSocialAccounts : [];
  const platforms = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const account = connectedAccount(accounts, platform);
    let lastResult = null;
    for (const row of rows) {
      const results = row.platformResults ?? legacyPlatformResults(row, accounts);
      const r = results?.[platform];
      if (!r || r.status === 'DISABLED') continue;
      lastResult = {
        socialPostId: row.id,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        mode: row.mode,
        status: r.status,
        ...(r.error ? { error: r.error } : {}),
        ...(r.ghlChildPostId ? { ghlChildPostId: r.ghlChildPostId } : {}),
        at: r.at ?? row.createdAt,
      };
      break;
    }
    platforms[platform] = {
      enabled: isPlatformEnabled(location, platform),
      connected: Boolean(account),
      account: account ? { id: account.id, name: account.name, type: account.type } : null,
      lastResult,
      needsReconnect: lastResult?.status === 'FAILED' && isTokenError(lastResult.error),
    };
  }
  return platforms;
}

function badRequest(message, code = 'INVALID_BODY', details) {
  return new AppError(message, 400, { code, ...(details ? { details } : {}) });
}

/**
 * Validates a PATCH body against the current location and returns the Prisma
 * update data. Throws AppError(400) with a clear message on refusal.
 */
export function validateSocialSettingsChange(location, body = {}) {
  const data = {};

  if (body.ghlSocialUserId !== undefined) {
    const userId = String(body.ghlSocialUserId ?? '').trim();
    data.ghlSocialUserId = userId || null;
  }

  if (body.socialPostingMode !== undefined) {
    const mode = String(body.socialPostingMode).trim().toUpperCase();
    if (!SOCIAL_MODES.includes(mode)) {
      throw badRequest(`socialPostingMode must be one of: ${SOCIAL_MODES.join(', ')}.`);
    }
    data.socialPostingMode = mode;
  }

  const accounts = Array.isArray(location.ghlSocialAccounts) ? location.ghlSocialAccounts : [];
  for (const platform of SOCIAL_PLATFORMS) {
    const value = body[PLATFORM_BODY_FIELD[platform]];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') {
      throw badRequest(`${PLATFORM_BODY_FIELD[platform]} must be true or false.`);
    }
    if (value && !connectedAccount(accounts, platform)) {
      throw badRequest(
        `Cannot enable ${PLATFORM_LABEL[platform]}: no ${PLATFORM_LABEL[platform]} account is connected in GHL for this location. Connect it in the Social Planner, then run sync-accounts.`,
        'SOCIAL_PLATFORM_NOT_CONNECTED',
        { platform },
      );
    }
    data[PLATFORM_SWITCH_FIELD[platform]] = value;
  }

  if (body.changedBy !== undefined && body.changedBy !== null) {
    if (typeof body.changedBy !== 'string' || body.changedBy.trim().length > 100) {
      throw badRequest('changedBy must be a string of at most 100 characters.');
    }
  }

  const next = { ...location, ...data };
  if (next.socialPostingMode !== 'OFF') {
    if (!location.ghlApiKey?.trim()) {
      throw badRequest(
        'Location has no GHL API key; cannot enable social posting.',
        'GHL_SOCIAL_TOKEN_MISSING',
      );
    }
    if (!next.ghlSocialUserId) {
      throw badRequest('Set ghlSocialUserId before enabling social posting.', 'GHL_SOCIAL_USER_MISSING');
    }
    // Only checked when the master switch is being turned on: switching every
    // platform off while LIVE is allowed and makes posts record as SKIPPED.
    const usable = SOCIAL_PLATFORMS.filter(
      (p) => isPlatformEnabled(next, p) && connectedAccount(accounts, p),
    );
    if (data.socialPostingMode && data.socialPostingMode !== 'OFF' && usable.length === 0) {
      throw badRequest(
        'Cannot turn social posting on: no platform is both enabled and connected. Connect Facebook or Instagram in the Social Planner, run sync-accounts, and enable at least one.',
        'SOCIAL_NO_USABLE_PLATFORM',
      );
    }
  }

  return data;
}

/** { field: { from, to } } for audited fields that actually change. */
export function diffSocialSettings(before, data) {
  const changes = {};
  for (const field of AUDITED_FIELDS) {
    if (!(field in data)) continue;
    const from = before[field] ?? null;
    const to = data[field] ?? null;
    if (from !== to) changes[field] = { from, to };
  }
  return changes;
}

/** "Who" for the audit log: request facts plus an unverified self-reported label. */
export function buildActor({ requestId, ip, userAgent, changedBy } = {}) {
  const label = typeof changedBy === 'string' ? changedBy.trim() : '';
  return {
    requestId: requestId ?? null,
    ip: ip ?? null,
    userAgent: userAgent ? String(userAgent).slice(0, 300) : null,
    changedBy: label || null,
    changedByVerified: false,
  };
}
