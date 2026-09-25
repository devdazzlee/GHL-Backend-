import axios from 'axios';
import { env } from '../config/env.js';
import prisma from '../database/client.js';
import { AppError } from '../utils/AppError.js';
import { sendSocialPostFailureAlert } from './alert.service.js';

const GHL_BASE = 'https://services.leadconnectorhq.com';
/**
 * Taken from GHL's API docs (highlevel-api-docs apps/social-media-posting.json
 * and apps/users.json), where it is the only allowed Version for these endpoints.
 */
const GHL_SOCIAL_VERSION = '2021-07-28';

/** Minutes ahead of now for LIVE posts, so GHL never sees a past scheduleDate. */
const LIVE_SCHEDULE_LEAD_MINUTES = 5;

/** Per-request cap so a slow GHL response can't hold up the publish path. */
const GHL_SOCIAL_TIMEOUT_MS = 20_000;

export const SOCIAL_MODES = ['OFF', 'DRAFT', 'LIVE'];
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

  await prisma.location.update({
    where: { id: locationId },
    data: { ghlSocialAccounts: kept, ghlSocialAccountsSyncedAt: new Date() },
  });

  console.info(
    JSON.stringify({
      event: 'ghl_social_accounts_synced',
      locationId,
      kept: kept.map((a) => `${a.platform}:${a.name}`),
      excluded: excluded.map((a) => `${a.platform}:${a.type}:${a.name}`),
    }),
  );

  return { locationId, kept, excluded };
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

export async function getSocialSettings(locationId) {
  const location = await getLocationOrThrow(locationId);
  const recent = await prisma.socialPost.findMany({
    where: { locationId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  return {
    locationId,
    socialPostingMode: location.socialPostingMode,
    ghlSocialUserId: location.ghlSocialUserId,
    ghlSocialAccounts: location.ghlSocialAccounts,
    ghlSocialAccountsSyncedAt: location.ghlSocialAccountsSyncedAt,
    hasLocationGhlKey: Boolean(location.ghlApiKey?.trim()),
    recentSocialPosts: recent,
  };
}

/**
 * Updates the per-business switch and/or GHL user. Turning social on (DRAFT or
 * LIVE) requires a chosen user and at least one synced FB/IG account.
 */
export async function updateSocialSettings(locationId, body = {}) {
  const location = await getLocationOrThrow(locationId);
  const data = {};

  if (body.ghlSocialUserId !== undefined) {
    const userId = String(body.ghlSocialUserId ?? '').trim();
    data.ghlSocialUserId = userId || null;
  }

  if (body.socialPostingMode !== undefined) {
    const mode = String(body.socialPostingMode).trim().toUpperCase();
    if (!SOCIAL_MODES.includes(mode)) {
      throw new AppError(`socialPostingMode must be one of: ${SOCIAL_MODES.join(', ')}.`, 400, {
        code: 'INVALID_BODY',
      });
    }
    data.socialPostingMode = mode;
  }

  const nextMode = data.socialPostingMode ?? location.socialPostingMode;
  if (nextMode !== 'OFF') {
    const nextUserId =
      data.ghlSocialUserId !== undefined ? data.ghlSocialUserId : location.ghlSocialUserId;
    const accounts = Array.isArray(location.ghlSocialAccounts) ? location.ghlSocialAccounts : [];
    if (!location.ghlApiKey?.trim()) {
      throw new AppError('Location has no GHL API key; cannot enable social posting.', 400, {
        code: 'GHL_SOCIAL_TOKEN_MISSING',
      });
    }
    if (!nextUserId) {
      throw new AppError('Set ghlSocialUserId before enabling social posting.', 400, {
        code: 'GHL_SOCIAL_USER_MISSING',
      });
    }
    if (accounts.length === 0) {
      throw new AppError('Sync social accounts before enabling social posting.', 400, {
        code: 'GHL_SOCIAL_ACCOUNTS_MISSING',
      });
    }
  }

  await prisma.location.update({ where: { id: locationId }, data });
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
 * Picks stored FB/IG account ids. Instagram cannot take a text-only post, so it
 * is dropped when there is no image. Google is filtered again here as a guard.
 */
export function selectTargetAccountIds(location, { hasImage }) {
  const stored = Array.isArray(location.ghlSocialAccounts) ? location.ghlSocialAccounts : [];
  return stored
    .filter(isMirrorAccount)
    .filter((a) => hasImage || String(a.platform).toLowerCase() !== 'instagram')
    .map((a) => a.id);
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

  const body = {
    accountIds,
    summary,
    media: mediaUrl ? [{ url: mediaUrl, type: guessMimeType(mediaUrl) }] : [],
    type: 'post',
    userId,
    ...(mode === 'LIVE'
      ? {
          status: 'scheduled',
          scheduleDate: new Date(
            Date.now() + LIVE_SCHEDULE_LEAD_MINUTES * 60 * 1000,
          ).toISOString(),
        }
      : { status: 'draft' }),
  };

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
  return { ghlPostId: created._id ?? created.id ?? created.postId ?? null, status: body.status };
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

  try {
    if (mode === 'OFF') {
      return { skipped: true, reason: 'social_off' };
    }

    const existing = await prisma.socialPost.findUnique({
      where: { sourceType_sourceId: { sourceType, sourceId } },
    });
    if (existing && existing.status !== 'FAILED') {
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

    const accountIds = selectTargetAccountIds(location, { hasImage: Boolean(mediaUrl) });
    if (accountIds.length === 0) {
      throw new AppError('No Facebook Page or Instagram account available to post to.', 400, {
        code: 'GHL_SOCIAL_ACCOUNTS_MISSING',
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
    });
    await safeAudit({
      action: 'SOCIAL_POST_CREATED',
      locationId: location.id,
      details: { sourceType, sourceId, mode, ghlStatus: result.status, ghlPostId: result.ghlPostId, accountIds },
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
