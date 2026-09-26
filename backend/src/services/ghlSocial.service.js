import axios from 'axios';
import { env } from '../config/env.js';
import prisma from '../database/client.js';
import { AppError } from '../utils/AppError.js';
import { sendSocialPostFailureAlert } from './alert.service.js';
import {
  applyChildFailures,
  buildActor,
  diffSocialSettings,
  legacyPlatformResults,
  platformResultsOnFailure,
  platformResultsOnSend,
  selectTargets,
  SOCIAL_MODES,
  summarizePlatforms,
  validateSocialSettingsChange,
} from './socialPlatforms.js';

const GHL_BASE = 'https://services.leadconnectorhq.com';
/**
 * Taken from GHL's API docs (highlevel-api-docs apps/social-media-posting.json
 * and apps/users.json), where it is the only allowed Version for these endpoints.
 */
const GHL_SOCIAL_VERSION = '2021-07-28';

/**
 * Minutes ahead of now for a LIVE post's scheduleDate. GHL rejected a 5-minute
 * lead in production ("Schedule Date must be after current date") even with
 * the server clock in sync with GHL's; ~9 minutes worked in testing. 15 leaves
 * margin for clock drift and GHL's undocumented minimum.
 */
export const LIVE_SCHEDULE_LEAD_MINUTES = 15;

/** Per-request cap so a slow GHL response can't hold up the publish path. */
const GHL_SOCIAL_TIMEOUT_MS = 20_000;

export { SOCIAL_MODES };
export const SOCIAL_SOURCE_GBP_POST = 'GBP_POST';

const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};

/**
 * Social always uses the location's own key — never env.GHL_API_KEY — so a
 * shared key can never post to the wrong business's pages.
 */
function requireLocationToken(location) {
  const token = location?.ghlApiKey?.trim();
  if (!token) {
    throw new AppError('Location has no GHL API key; social posting skipped.', 400, {
      code: 'GHL_SOCIAL_TOKEN_MISSING',
    });
  }
  return token;
}

function socialHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Version: GHL_SOCIAL_VERSION,
  };
}

function ghlErrorMessage(response) {
  const msg = response.data?.message ?? response.data?.error ?? response.data?.msg;
  const text = Array.isArray(msg) ? msg.join('; ') : msg;
  return text || `HTTP ${response.status}`;
}

function throwGhlSocialError(label, response) {
  throw new AppError(`GHL ${label} failed: ${ghlErrorMessage(response)}`, 502, {
    code: 'GHL_SOCIAL_API_ERROR',
    details: { status: response.status, body: response.data },
  });
}

function isTimeoutError(e) {
  return e?.code === 'ECONNABORTED' || e?.code === 'ETIMEDOUT';
}

/**
 * Sends one GHL request with the social timeout. A timeout or network error
 * becomes an AppError, so callers handle it like any other GHL failure.
 */
async function ghlSocialRequest(label, config) {
  try {
    return await axios.request({
      ...config,
      timeout: GHL_SOCIAL_TIMEOUT_MS,
      validateStatus: () => true,
    });
  } catch (e) {
    if (isTimeoutError(e)) {
      throw new AppError(
        `GHL ${label} timed out after ${GHL_SOCIAL_TIMEOUT_MS / 1000}s` +
          (config.method === 'post'
            ? '; the post may still have been created in GHL, check the Social Planner before retrying.'
            : '.'),
        504,
        { code: 'GHL_SOCIAL_TIMEOUT', details: { label, axiosCode: e.code } },
      );
    }
    throw new AppError(`GHL ${label} request failed: ${e?.message ?? String(e)}`, 502, {
      code: 'GHL_SOCIAL_NETWORK_ERROR',
      details: { label, axiosCode: e?.code ?? null },
    });
  }
}

async function getLocationOrThrow(locationId) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    include: { business: { select: { name: true } } },
  });
  if (!location) {
    throw new AppError('Location not found.', 404, { code: 'LOCATION_NOT_FOUND' });
  }
  return location;
}

/**
 * Only the Facebook Page and the Instagram account are mirror targets. Google
 * accounts (the GBP "location") are excluded explicitly: we already publish to
 * Google directly and posting there too would duplicate.
 */
export function isMirrorAccount(account) {
  const platform = String(account?.platform ?? '').toLowerCase();
  const type = String(account?.type ?? '').toLowerCase();
  if (!account?.id || account.isExpired === true) return false;
  if (platform === 'google') return false;
  if (platform === 'facebook') return type === 'page';
  return platform === 'instagram';
}

/** GET /social-media-posting/:locationId/accounts — all connected accounts. */
export async function listGhlSocialAccounts(location) {
  const token = requireLocationToken(location);
  const response = await ghlSocialRequest('Get Accounts', {
    method: 'get',
    url: `${GHL_BASE}/social-media-posting/${encodeURIComponent(location.ghlLocationId)}/accounts`,
    headers: socialHeaders(token),
  });
  if (response.status < 200 || response.status >= 300) {
    throwGhlSocialError('Get Accounts', response);
  }
  const accounts = response.data?.results?.accounts;
  return Array.isArray(accounts) ? accounts : [];
}

/**
 * Fetches connected accounts from GHL and stores only the FB Page + IG ones.
 * Returns what was kept and what was excluded so the choice is visible.
 */
export async function syncSocialAccountsForLocation(locationId) {
  const location = await getLocationOrThrow(locationId);
  const { kept, excluded } = await refreshMirrorAccounts(location);
  return { locationId, kept, excluded };
}

/**
 * Fetches the location's accounts from GHL, keeps only FB Page + IG (Google
 * and expired accounts are excluded by isMirrorAccount), and stores the result.
 * Used by sync-accounts and before every social post, so a reconnected account
 * with a new ID is picked up without a manual sync.
 */
async function refreshMirrorAccounts(location) {
  const accounts = await listGhlSocialAccounts(location);

  const summarize = (a) => ({
    id: a.id,
    platform: a.platform,
    type: a.type,
    name: a.name,
    ...(a.isExpired ? { isExpired: true } : {}),
  });
  const kept = accounts.filter(isMirrorAccount).map(summarize);
  const excluded = accounts.filter((a) => !isMirrorAccount(a)).map(summarize);
  const expired = excluded.filter(
    (a) => a.isExpired && ['facebook', 'instagram'].includes(String(a.platform).toLowerCase()),
  );

  await prisma.location.update({
    where: { id: location.id },
    data: { ghlSocialAccounts: kept, ghlSocialAccountsSyncedAt: new Date() },
  });

  console.info(
    JSON.stringify({
      event: 'ghl_social_accounts_synced',
      locationId: location.id,
      kept: kept.map((a) => `${a.platform}:${a.name}`),
      excluded: excluded.map((a) => `${a.platform}:${a.type}:${a.name}`),
    }),
  );

  return { kept, excluded, expired };
}

/**
 * Accounts to post to right now: a fresh Get Accounts when GHL answers, else
 * the stored list (a GHL blip shouldn't block the post; if the stored IDs are
 * stale, Create Post fails and alerts as usual).
 */
async function resolveCurrentMirrorAccounts(location) {
  try {
    const { kept, expired } = await refreshMirrorAccounts(location);
    if (expired.length > 0) {
      console.warn(
        JSON.stringify({
          event: 'social_accounts_expired_skipped',
          locationId: location.id,
          expired: expired.map((a) => `${a.platform}:${a.name}:${a.id}`),
        }),
      );
    }
    return { accounts: kept, source: 'fresh', expired };
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: 'social_accounts_refresh_failed',
        locationId: location.id,
        error: e?.message ?? String(e),
        code: e?.code ?? null,
        usingStored: true,
      }),
    );
    const stored = Array.isArray(location.ghlSocialAccounts) ? location.ghlSocialAccounts : [];
    return { accounts: stored, source: 'stored', expired: [] };
  }
}

/** GET /users/?locationId= — for choosing ghlSocialUserId. Needs users.readonly. */
export async function listGhlUsersForLocation(locationId) {
  const location = await getLocationOrThrow(locationId);
  const token = requireLocationToken(location);
  const response = await ghlSocialRequest('Get Users', {
    method: 'get',
    url: `${GHL_BASE}/users/`,
    params: { locationId: location.ghlLocationId },
    headers: socialHeaders(token),
  });
  if (response.status < 200 || response.status >= 300) {
    throwGhlSocialError('Get Users', response);
  }
  const users = Array.isArray(response.data?.users) ? response.data.users : [];
  return users.map((u) => ({
    id: u.id,
    name: u.name ?? [u.firstName, u.lastName].filter(Boolean).join(' '),
    email: u.email,
    role: u.roles?.role ?? null,
    type: u.roles?.type ?? null,
  }));
}

/** How many recent rows feed the per-platform "last result". */
const SETTINGS_RECENT_ROWS = 25;

export async function getSocialSettings(locationId) {
  const location = await getLocationOrThrow(locationId);
  const recent = await prisma.socialPost.findMany({
    where: { locationId },
    orderBy: { createdAt: 'desc' },
    take: SETTINGS_RECENT_ROWS,
  });
  return {
    locationId,
    socialPostingMode: location.socialPostingMode,
    ghlSocialUserId: location.ghlSocialUserId,
    hasLocationGhlKey: Boolean(location.ghlApiKey?.trim()),
    ghlSocialAccountsSyncedAt: location.ghlSocialAccountsSyncedAt,
    platforms: summarizePlatforms(location, recent),
    ghlSocialAccounts: location.ghlSocialAccounts,
    recentSocialPosts: recent.slice(0, 10),
  };
}

/**
 * Updates the master switch, the GHL user and/or the per-platform switches.
 * Every real change writes one SOCIAL_SETTINGS_UPDATED audit entry (in the same
 * transaction) with before/after values and the request's actor. Changes apply
 * to future posts only; nothing already scheduled in GHL is edited.
 *
 * @param {{ requestId?: string, ip?: string, userAgent?: string, changedBy?: string }} [actorInfo]
 */
export async function updateSocialSettings(locationId, body = {}, actorInfo = {}) {
  const location = await getLocationOrThrow(locationId);
  const data = validateSocialSettingsChange(location, body);
  const changes = diffSocialSettings(location, data);

  if (Object.keys(changes).length > 0) {
    await prisma.$transaction([
      prisma.location.update({ where: { id: locationId }, data }),
      prisma.auditLog.create({
        data: {
          action: 'SOCIAL_SETTINGS_UPDATED',
          locationId,
          details: { changes, actor: buildActor({ ...actorInfo, changedBy: body.changedBy }) },
        },
      }),
    ]);
  }
  return getSocialSettings(locationId);
}

function guessMimeType(url) {
  try {
    const ext = new URL(url).pathname.split('.').pop()?.toLowerCase();
    return MIME_BY_EXT[ext] ?? 'image/jpeg';
  } catch {
    return 'image/jpeg';
  }
}

/**
 * Picks FB/IG accounts to post to: Google and expired are filtered again here
 * as a guard, switched-off platforms are dropped, and Instagram is dropped
 * when there is no image.
 */
function selectTargetsForLocation(location, accounts, { hasImage }) {
  const mirrorable = (Array.isArray(accounts) ? accounts : []).filter(isMirrorAccount);
  return selectTargets(mirrorable, location, { hasImage });
}

export function selectTargetAccountIds(location, { hasImage }) {
  return selectTargetsForLocation(location, location.ghlSocialAccounts, { hasImage }).accountIds;
}

/**
 * POST /social-media-posting/:locationId/posts. DRAFT → status "draft";
 * LIVE → status "scheduled" a few minutes ahead. Never "in_review".
 */
export async function createGhlSocialPost(location, { summary, mediaUrl, accountIds, mode }) {
  const token = requireLocationToken(location);
  const userId = location.ghlSocialUserId?.trim();
  if (!userId) {
    throw new AppError('Location has no ghlSocialUserId; social posting skipped.', 400, {
      code: 'GHL_SOCIAL_USER_MISSING',
    });
  }

  const now = Date.now();
  const body = {
    accountIds,
    summary,
    media: mediaUrl ? [{ url: mediaUrl, type: guessMimeType(mediaUrl) }] : [],
    type: 'post',
    userId,
    ...(mode === 'LIVE'
      ? {
          status: 'scheduled',
          scheduleDate: new Date(now + LIVE_SCHEDULE_LEAD_MINUTES * 60 * 1000).toISOString(),
        }
      : { status: 'draft' }),
  };

  if (mode === 'LIVE') {
    console.info(
      JSON.stringify({
        event: 'ghl_social_post_scheduling',
        locationId: location.id,
        leadMinutes: LIVE_SCHEDULE_LEAD_MINUTES,
        serverNow: new Date(now).toISOString(),
        scheduleDate: body.scheduleDate,
      }),
    );
  }

  const response = await ghlSocialRequest('Create Post', {
    method: 'post',
    url: `${GHL_BASE}/social-media-posting/${encodeURIComponent(location.ghlLocationId)}/posts`,
    data: body,
    headers: socialHeaders(token),
  });
  if (response.status < 200 || response.status >= 300) {
    throwGhlSocialError('Create Post', response);
  }

  const created = response.data?.results?.post ?? {};
  return {
    ghlPostId: created._id ?? created.id ?? created.postId ?? null,
    status: body.status,
    scheduleDate: body.scheduleDate ?? null,
    leadMinutes: mode === 'LIVE' ? LIVE_SCHEDULE_LEAD_MINUTES : null,
  };
}

async function safeAudit(data) {
  try {
    await prisma.auditLog.create({ data });
  } catch (e) {
    console.error(
      JSON.stringify({ event: 'social_audit_log_failed', error: e?.message ?? String(e) }),
    );
  }
}

async function recordSocialPost(data) {
  try {
    await prisma.socialPost.upsert({
      where: { sourceType_sourceId: { sourceType: data.sourceType, sourceId: data.sourceId } },
      create: data,
      update: data,
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'social_post_record_failed',
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        error: e?.message ?? String(e),
      }),
    );
  }
}

async function alertSocialFailure(location, sourceId, message) {
  try {
    let businessName = location.business?.name;
    if (!businessName) {
      const business = await prisma.business.findUnique({
        where: { id: location.businessId },
        select: { name: true },
      });
      businessName = business?.name ?? 'Business';
    }
    await sendSocialPostFailureAlert(location.id, businessName, message, sourceId);
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'social_failure_alert_send_failed',
        locationId: location.id,
        error: e?.message ?? String(e),
      }),
    );
  }
}

/**
 * Mirrors one piece of content to the location's FB Page + IG via GHL.
 * Never throws: a social failure is logged, recorded, audited and alerted,
 * and must not affect the Google post that triggered it.
 *
 * @param {object} location Location row (with ghlApiKey and social fields)
 * @param {{ sourceType: string, sourceId: string, summary: string, mediaUrl?: string | null, skipSocial?: boolean }} source
 */
export async function publishSocialForSource(location, source) {
  const { sourceType, sourceId, summary, mediaUrl = null, skipSocial = false } = source;
  const mode = location?.socialPostingMode ?? 'OFF';
  let selection = null;

  try {
    if (mode === 'OFF') {
      return { skipped: true, reason: 'social_off' };
    }

    const existing = await prisma.socialPost.findUnique({
      where: { sourceType_sourceId: { sourceType, sourceId } },
    });
    // Once GHL has accepted a post (ghlPostId set) it is never sent again, even
    // if the status checker later marked it FAILED: some accounts may already
    // have published it. Only a failure before GHL accepted it can be re-run.
    if (existing && (existing.status !== 'FAILED' || existing.ghlPostId)) {
      return { skipped: true, reason: 'already_mirrored', socialPostId: existing.id };
    }

    if (skipSocial) {
      await recordSocialPost({
        locationId: location.id,
        sourceType,
        sourceId,
        mode,
        status: 'SKIPPED',
        error: 'skipSocial set on post',
      });
      return { skipped: true, reason: 'skip_social' };
    }

    if (env.MOCK_MODE) {
      console.info(
        JSON.stringify({ event: 'social_post_mock', locationId: location.id, sourceType, sourceId, mode }),
      );
      return { skipped: true, reason: 'mock_mode' };
    }

    const current = await resolveCurrentMirrorAccounts(location);
    selection = selectTargetsForLocation(location, current.accounts, {
      hasImage: Boolean(mediaUrl),
    });
    const { accountIds } = selection;

    // Every connected platform is switched off: a deliberate setting, not a
    // failure, so it is recorded as SKIPPED with no alert.
    if (selection.allDisabled) {
      const reason = 'All connected platforms are disabled for this location';
      await recordSocialPost({
        locationId: location.id,
        sourceType,
        sourceId,
        mode,
        status: 'SKIPPED',
        error: reason,
        platformResults: platformResultsOnSend([], selection.disabledPlatforms, current.accounts, new Date()),
      });
      console.info(
        JSON.stringify({
          event: 'social_post_skipped_platforms_disabled',
          locationId: location.id,
          sourceType,
          sourceId,
          disabledPlatforms: selection.disabledPlatforms,
        }),
      );
      return { skipped: true, reason: 'platforms_disabled', disabledPlatforms: selection.disabledPlatforms };
    }

    if (accountIds.length === 0) {
      throw new AppError('No Facebook Page or Instagram account available to post to.', 400, {
        code: 'GHL_SOCIAL_ACCOUNTS_MISSING',
        details: {
          accountsSource: current.source,
          expiredSkipped: current.expired.map((a) => `${a.platform}:${a.name}`),
        },
      });
    }

    const result = await createGhlSocialPost(location, { summary, mediaUrl, accountIds, mode });

    await recordSocialPost({
      locationId: location.id,
      sourceType,
      sourceId,
      mode,
      accountIds,
      ghlPostId: result.ghlPostId,
      status: 'SENT',
      error: null,
      scheduledFor: result.scheduleDate ? new Date(result.scheduleDate) : null,
      platformResults: platformResultsOnSend(
        selection.targets,
        selection.disabledPlatforms,
        current.accounts,
        new Date(),
      ),
    });
    await safeAudit({
      action: 'SOCIAL_POST_CREATED',
      locationId: location.id,
      details: {
        sourceType,
        sourceId,
        mode,
        ghlStatus: result.status,
        ghlPostId: result.ghlPostId,
        scheduleDate: result.scheduleDate,
        scheduleLeadMinutes: result.leadMinutes,
        accountIds,
        accountsSource: current.source,
        expiredSkipped: current.expired.map((a) => `${a.platform}:${a.name}`),
        disabledPlatforms: selection.disabledPlatforms,
      },
    });
    console.info(
      JSON.stringify({
        event: 'social_post_created',
        locationId: location.id,
        sourceType,
        sourceId,
        mode,
        ghlPostId: result.ghlPostId,
        accountCount: accountIds.length,
        hasImage: Boolean(mediaUrl),
      }),
    );
    return { success: true, ...result, accountIds };
  } catch (e) {
    const message = e?.message ?? String(e);
    console.error(
      JSON.stringify({
        event: 'social_post_failed',
        locationId: location?.id,
        sourceType,
        sourceId,
        mode,
        error: message,
        code: e?.code ?? null,
        details: e?.details ?? null,
      }),
    );
    await recordSocialPost({
      locationId: location.id,
      sourceType,
      sourceId,
      mode,
      status: 'FAILED',
      error: message,
      alertedAt: new Date(),
      platformResults: selection?.targets?.length
        ? platformResultsOnFailure(selection.targets, message, new Date())
        : null,
    });
    await safeAudit({
      action: 'SOCIAL_POST_FAILED',
      locationId: location.id,
      details: { sourceType, sourceId, mode, error: message, code: e?.code ?? null },
    });
    await alertSocialFailure(location, sourceId, message);
    return { success: false, error: message };
  }
}

/* ------------------------------------------------------------------------ */
/* Status checker: GHL accepts a LIVE post, then publishes it later per      */
/* account. Those later failures only show up on GHL's per-account child     */
/* posts, so SENT rows are checked after their scheduled time.               */
/* ------------------------------------------------------------------------ */

const STATUS_CHECK_LOOKBACK_HOURS = 24;
/** Time GHL gets after scheduleDate to finish publishing before we look. */
const STATUS_CHECK_GRACE_MINUTES = 5;
const STATUS_CHECK_PAGE_SIZE = 50;
const STATUS_CHECK_MAX_PAGES = 10;

function scheduledTimeFor(row) {
  return (
    row.scheduledFor ??
    new Date(new Date(row.createdAt).getTime() + LIVE_SCHEDULE_LEAD_MINUTES * 60 * 1000)
  );
}

/** LIVE rows GHL accepted in the lookback window that are still marked SENT. */
export async function findSocialPostsToCheck(now = new Date()) {
  return prisma.socialPost.findMany({
    where: {
      mode: 'LIVE',
      status: 'SENT',
      ghlPostId: { not: null },
      createdAt: { gte: new Date(now.getTime() - STATUS_CHECK_LOOKBACK_HOURS * 3600 * 1000) },
    },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * POST /social-media-posting/:locationId/posts/list (read-only search) with
 * type "failed" for the row's accounts; keeps only children of this post.
 */
export async function listFailedChildPosts(location, row, now = new Date()) {
  const token = requireLocationToken(location);
  const fromDate = new Date(new Date(row.createdAt).getTime() - 3600 * 1000).toISOString();
  const toDate = new Date(now.getTime() + 3600 * 1000).toISOString();
  const failed = [];

  for (let page = 0; page < STATUS_CHECK_MAX_PAGES; page += 1) {
    const response = await ghlSocialRequest('List Posts', {
      method: 'post',
      url: `${GHL_BASE}/social-media-posting/${encodeURIComponent(location.ghlLocationId)}/posts/list`,
      data: {
        type: 'failed',
        accounts: row.accountIds.join(','),
        skip: String(page * STATUS_CHECK_PAGE_SIZE),
        limit: String(STATUS_CHECK_PAGE_SIZE),
        fromDate,
        toDate,
        includeUsers: 'false',
      },
      headers: socialHeaders(token),
    });
    if (response.status < 200 || response.status >= 300) {
      throwGhlSocialError('List Posts', response);
    }
    const posts = Array.isArray(response.data?.results?.posts) ? response.data.results.posts : [];
    for (const p of posts) {
      if (p?.parentPostId === row.ghlPostId && String(p.status).toLowerCase() === 'failed') {
        failed.push(p);
      }
    }
    const total = Number(response.data?.results?.count ?? 0);
    if (posts.length < STATUS_CHECK_PAGE_SIZE || (page + 1) * STATUS_CHECK_PAGE_SIZE >= total) {
      break;
    }
  }
  return failed;
}

function describeChildFailures(location, failedChildren) {
  const accounts = Array.isArray(location.ghlSocialAccounts) ? location.ghlSocialAccounts : [];
  return failedChildren
    .map((p) => {
      const account = accounts.find((a) => a.id === p.accountId);
      const label = account ? `${account.platform} "${account.name}"` : p.platform ?? p.accountId;
      return `GHL could not publish to ${label} (GHL post ${p._id}): ${p.error ?? 'no error given'}`;
    })
    .join(' | ');
}

/**
 * Checks one SENT row. On a GHL-side failure: marks it FAILED with GHL's
 * error, audits, and alerts once (alertedAt). Never re-sends anything.
 * dryRun reports what would happen without writing or alerting.
 */
export async function checkSocialPostStatus(row, { location, now = new Date(), dryRun = false } = {}) {
  const dueAt = new Date(scheduledTimeFor(row).getTime() + STATUS_CHECK_GRACE_MINUTES * 60 * 1000);
  if (now < dueAt) {
    return { socialPostId: row.id, result: 'not_due', dueAt };
  }

  const failedChildren = await listFailedChildPosts(location, row, now);

  if (failedChildren.length === 0) {
    if (!dryRun) {
      await prisma.socialPost.update({ where: { id: row.id }, data: { lastCheckedAt: now } });
    }
    return { socialPostId: row.id, result: 'no_failures' };
  }

  const message = describeChildFailures(location, failedChildren);
  const failedChildIds = failedChildren.map((p) => p._id);
  const wouldAlert = !row.alertedAt;

  const accounts = Array.isArray(location.ghlSocialAccounts) ? location.ghlSocialAccounts : [];
  const platformResults = applyChildFailures(
    row.platformResults ?? legacyPlatformResults({ ...row, status: 'SENT', error: null }, accounts),
    failedChildren,
    accounts,
    now,
  );

  if (dryRun) {
    return {
      socialPostId: row.id,
      result: 'failed',
      failedChildIds,
      message,
      platformResults,
      wouldAlert,
      dryRun: true,
    };
  }

  const marked = await prisma.socialPost.updateMany({
    where: { id: row.id, status: 'SENT' },
    data: { status: 'FAILED', error: message, lastCheckedAt: now, platformResults },
  });
  if (marked.count === 1) {
    await safeAudit({
      action: 'SOCIAL_POST_PUBLISH_FAILED',
      locationId: row.locationId,
      details: { sourceType: row.sourceType, sourceId: row.sourceId, ghlPostId: row.ghlPostId, failedChildIds, error: message },
    });
  }

  // Claim the alert before sending so overlapping runs can't alert twice.
  const claimed = await prisma.socialPost.updateMany({
    where: { id: row.id, alertedAt: null },
    data: { alertedAt: now },
  });
  if (claimed.count === 1) {
    await alertSocialFailure(location, row.sourceId, message);
  }

  console.error(
    JSON.stringify({
      event: 'social_post_publish_failed',
      locationId: row.locationId,
      socialPostId: row.id,
      sourceId: row.sourceId,
      ghlPostId: row.ghlPostId,
      failedChildIds,
      alerted: claimed.count === 1,
      error: message,
    }),
  );
  return { socialPostId: row.id, result: 'failed', failedChildIds, message, alerted: claimed.count === 1 };
}

/**
 * Runs the checker over recent SENT LIVE rows. Never throws; one row's error
 * (GHL down, missing token) is logged and the rest still run.
 *
 * @param {{ now?: Date, dryRun?: boolean, rows?: object[] }} [options] rows overrides the DB lookup
 */
export async function runSocialPostStatusCheck({ now = new Date(), dryRun = false, rows } = {}) {
  const results = [];
  let candidates = rows;
  try {
    candidates = candidates ?? (await findSocialPostsToCheck(now));
  } catch (e) {
    console.error(JSON.stringify({ event: 'social_status_check_load_failed', error: e?.message ?? String(e) }));
    return { checked: 0, results };
  }

  const locations = new Map();
  for (const row of candidates) {
    try {
      if (!locations.has(row.locationId)) {
        locations.set(
          row.locationId,
          await prisma.location.findUnique({
            where: { id: row.locationId },
            include: { business: { select: { name: true } } },
          }),
        );
      }
      const location = locations.get(row.locationId);
      if (!location) {
        results.push({ socialPostId: row.id, result: 'location_missing' });
        continue;
      }
      results.push(await checkSocialPostStatus(row, { location, now, dryRun }));
    } catch (e) {
      console.error(
        JSON.stringify({
          event: 'social_status_check_row_failed',
          socialPostId: row.id,
          error: e?.message ?? String(e),
          code: e?.code ?? null,
        }),
      );
      results.push({ socialPostId: row.id, result: 'check_error', error: e?.message ?? String(e) });
    }
  }

  const failed = results.filter((r) => r.result === 'failed').length;
  console.info(
    JSON.stringify({ event: 'social_status_check_complete', checked: candidates.length, failed, dryRun }),
  );
  return { checked: candidates.length, failed, results };
}
