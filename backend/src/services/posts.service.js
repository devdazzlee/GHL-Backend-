import { env } from '../config/env.js';
import prisma from '../database/client.js';
import { AppError } from '../utils/AppError.js';
import { publishLocalPostToGoogle } from './gbp.service.js';
import { updateLocationCustomFields } from './ghl.service.js';
import { publishSocialForSource, SOCIAL_SOURCE_GBP_POST } from './ghlSocial.service.js';
import { enrichPostsWithMedia, getMediaForPost } from './media.service.js';

const POST_TYPES = new Set(['UPDATE', 'OFFER', 'EVENT']);

/** Google not ready — save as SCHEDULED (not FAILED) for GHL/dashboard. */
const SCHEDULED_GOOGLE_ERROR_CODES = new Set([
  'GOOGLE_NOT_CONNECTED',
  'GBP_ACCOUNT_ID_MISSING',
  'GBP_LOCATION_ID_MISSING',
]);

function isInvalidTokenError(error) {
  const msg = (error?.message ?? '').toLowerCase();
  if (error?.statusCode === 401) return true;
  if (msg.includes('invalid token')) return true;
  if (msg.includes('invalid credentials')) return true;
  if (msg.includes('invalid_grant')) return true;
  if (msg.includes('unauthorized') && msg.includes('token')) return true;
  return false;
}

function isApiNotApprovedOrAccessError(error) {
  const msg = (error?.message ?? '').toLowerCase();
  const details = error?.details;
  const googleStatus =
    details?.error?.status ??
    details?.body?.error?.status ??
    details?.status;

  if (error?.statusCode === 403 || googleStatus === 'PERMISSION_DENIED') return true;
  if (googleStatus === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT') return true;

  const accessPhrases = [
    'not been used',
    'has not been enabled',
    'access not configured',
    'not approved',
    'permission denied',
    'insufficient permission',
    'caller does not have permission',
    'service disabled',
    'api is not enabled',
  ];
  return accessPhrases.some((phrase) => msg.includes(phrase));
}

function shouldSaveAsScheduledNotFailed(error) {
  if (!error) return false;
  if (error?.code && SCHEDULED_GOOGLE_ERROR_CODES.has(error.code)) return true;
  if (isInvalidTokenError(error)) return false;
  if (isApiNotApprovedOrAccessError(error)) return true;

  const msg = (error?.message ?? '').toLowerCase();
  if (msg.includes('google is not connected')) return true;
  if (msg.includes('not configured') && msg.includes('google')) return true;

  return false;
}

/**
 * @returns {{ status: 'PUBLISHED' | 'SCHEDULED' | 'FAILED'; auditAction: string }}
 */
function resolvePostStatusAfterGoogleError(googleError) {
  if (!googleError) {
    return { status: 'PUBLISHED', auditAction: 'POST_PUBLISHED' };
  }
  if (shouldSaveAsScheduledNotFailed(googleError)) {
    return { status: 'SCHEDULED', auditAction: 'POST_SCHEDULED' };
  }
  return { status: 'FAILED', auditAction: 'POST_PUBLISH_FAILED' };
}

function validatePublishBody(body) {
  if (!body || typeof body !== 'object') {
    throw new AppError('Request body must be a JSON object.', 400, { code: 'INVALID_BODY' });
  }
  const { type, content, mediaUrl } = body;
  if (type == null || !POST_TYPES.has(String(type).toUpperCase())) {
    throw new AppError('Field `type` must be one of: UPDATE, OFFER, EVENT.', 400, {
      code: 'INVALID_BODY',
    });
  }
  if (content == null || typeof content !== 'string' || content.trim() === '') {
    throw new AppError('Field `content` must be a non-empty string.', 400, {
      code: 'INVALID_BODY',
    });
  }
  if (mediaUrl != null && typeof mediaUrl !== 'string') {
    throw new AppError('Field `mediaUrl` must be a string when provided.', 400, {
      code: 'INVALID_BODY',
    });
  }
  if (body.skipSocial != null && typeof body.skipSocial !== 'boolean') {
    throw new AppError('Field `skipSocial` must be a boolean when provided.', 400, {
      code: 'INVALID_BODY',
    });
  }

  let scheduledAt;
  if (Object.prototype.hasOwnProperty.call(body, 'scheduledAt')) {
    if (body.scheduledAt == null || body.scheduledAt === '') {
      scheduledAt = null;
    } else {
      const parsed = new Date(body.scheduledAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new AppError('Field `scheduledAt` must be a valid date/time.', 400, {
          code: 'INVALID_BODY',
        });
      }
      scheduledAt = parsed;
    }
  }

  const result = {
    type: String(type).toUpperCase(),
    content: content.trim(),
    mediaUrl: mediaUrl != null && mediaUrl !== '' ? String(mediaUrl).trim() : null,
  };
  if (scheduledAt !== undefined) {
    result.scheduledAt = scheduledAt;
  }
  if (body.skipSocial != null) {
    result.skipSocial = body.skipSocial;
  }
  return result;
}

async function syncGhlAfterPublish(location, post) {
  try {
    await updateLocationCustomFields(
      location.ghlLocationId,
      post.postedAt ?? new Date(),
      post.status,
    );
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'ghl_custom_fields_after_publish_failed',
        locationId: location.id,
        ghlLocationId: location.ghlLocationId,
        postId: post.id,
        error: e?.message ?? String(e),
      }),
    );
  }
}

/**
 * Mirrors a PUBLISHED Google post to the location's FB Page + IG through GHL.
 * Never throws — social failures are handled and alerted inside.
 */
async function mirrorPostToSocial(location, post) {
  // Backstop: an escape here would make the daily job retry and re-post to Google.
  try {
    await publishSocialForSource(location, {
      sourceType: SOCIAL_SOURCE_GBP_POST,
      sourceId: post.id,
      summary: post.content,
      mediaUrl: post.mediaUrl,
      skipSocial: post.skipSocial,
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'social_mirror_unexpected_error',
        locationId: location.id,
        postId: post.id,
        error: e?.message ?? String(e),
      }),
    );
  }
}

/**
 * Publishes to GBP (unless MOCK_MODE), updates GHL custom fields, then mirrors
 * to social. A Google failure throws before social is attempted.
 */
async function executeExternalPublish(location, post) {
  if (!env.MOCK_MODE) {
    await publishLocalPostToGoogle(location, {
      type: post.type,
      content: post.content,
      mediaUrl: post.mediaUrl,
    });
  }
  await syncGhlAfterPublish(location, post);
  await mirrorPostToSocial(location, post);
}

async function getLocationOrThrow(locationId) {
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) {
    throw new AppError('Location not found.', 404, { code: 'LOCATION_NOT_FOUND' });
  }
  return location;
}

async function getPendingPostOrThrow(locationId, postId) {
  const post = await prisma.post.findFirst({
    where: { id: postId, locationId },
  });
  if (!post) {
    throw new AppError('Post not found.', 404, { code: 'POST_NOT_FOUND' });
  }
  if (post.status !== 'PENDING') {
    throw new AppError('Post is not pending approval.', 400, {
      code: 'POST_NOT_PENDING',
      details: { status: post.status },
    });
  }
  return post;
}

/**
 * Publishes a post (or queues for approval), persists Post + AuditLog, returns saved Post.
 */
export async function publishPostForLocation(locationId, body) {
  const {
    type,
    content,
    mediaUrl: bodyMediaUrl,
    scheduledAt,
    skipSocial,
  } = validatePublishBody(body);
  const location = await getLocationOrThrow(locationId);
  const mediaUrl = bodyMediaUrl ?? (await getMediaForPost(locationId, type));

  if (location.requiresApproval) {
    try {
      const [post] = await prisma.$transaction([
        prisma.post.create({
          data: {
            locationId,
            type,
            content,
            mediaUrl,
            status: 'PENDING',
            platform: 'google',
            ...(scheduledAt !== undefined ? { scheduledAt } : {}),
            ...(skipSocial !== undefined ? { skipSocial } : {}),
          },
        }),
        prisma.auditLog.create({
          data: {
            action: 'POST_PENDING_APPROVAL',
            locationId,
            details: { type, mockMode: env.MOCK_MODE },
          },
        }),
      ]);
      return post;
    } catch (e) {
      if (e?.name === 'PrismaClientKnownRequestError') {
        throw new AppError('Failed to save post.', 500, { code: 'POST_SAVE_FAILED' });
      }
      throw e;
    }
  }

  let googleError = null;
  if (!env.MOCK_MODE) {
    try {
      await publishLocalPostToGoogle(location, { type, content, mediaUrl });
    } catch (e) {
      googleError = e;
      console.error(
        JSON.stringify({
          event: 'google_publish_failed',
          locationId,
          error: e?.message ?? String(e),
          code: e?.code,
        }),
      );
    }
  }

  const now = new Date();
  const { status, auditAction } = resolvePostStatusAfterGoogleError(googleError);
  const published = status === 'PUBLISHED';
  const effectiveScheduledAt =
    scheduledAt !== undefined ? scheduledAt : status === 'SCHEDULED' ? now : undefined;

  try {
    const [post] = await prisma.$transaction([
      prisma.post.create({
        data: {
          locationId,
          type,
          content,
          mediaUrl,
          status,
          postedAt: published ? now : null,
          platform: 'google',
          ...(effectiveScheduledAt !== undefined ? { scheduledAt: effectiveScheduledAt } : {}),
          ...(skipSocial !== undefined ? { skipSocial } : {}),
        },
      }),
      prisma.auditLog.create({
        data: {
          action: auditAction,
          locationId,
          details: {
            type,
            mockMode: env.MOCK_MODE,
            ...(googleError
              ? {
                  error: googleError.message,
                  errorCode: googleError.code,
                  savedAs: status,
                }
              : {}),
          },
        },
      }),
    ]);

    await syncGhlAfterPublish(location, post);
    if (published) {
      await mirrorPostToSocial(location, post);
    }
    return post;
  } catch (e) {
    if (e?.name === 'PrismaClientKnownRequestError') {
      throw new AppError('Failed to save post.', 500, { code: 'POST_SAVE_FAILED' });
    }
    throw e;
  }
}

/**
 * Approves a pending post, publishes externally, and marks PUBLISHED.
 */
export async function approvePostForLocation(locationId, postId) {
  const location = await getLocationOrThrow(locationId);
  await getPendingPostOrThrow(locationId, postId);

  const now = new Date();

  const post = await prisma.$transaction(async (tx) => {
    const updated = await tx.post.update({
      where: { id: postId },
      data: {
        status: 'PUBLISHED',
        postedAt: now,
      },
    });
    await tx.auditLog.create({
      data: {
        action: 'POST_APPROVED',
        locationId,
        details: { postId, mockMode: env.MOCK_MODE },
      },
    });
    return updated;
  });

  await executeExternalPublish(location, post);
  return post;
}

/**
 * Rejects a pending post without publishing externally.
 */
export async function rejectPostForLocation(locationId, postId) {
  await getLocationOrThrow(locationId);
  await getPendingPostOrThrow(locationId, postId);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.post.update({
      where: { id: postId },
      data: { status: 'REJECTED' },
    });
    await tx.auditLog.create({
      data: {
        action: 'POST_REJECTED',
        locationId,
        details: { postId },
      },
    });
    return updated;
  });
}

export async function listPostsForLocation(locationId, query = {}) {
  await getLocationOrThrow(locationId);

  const hasPagination = query.page != null || query.limit != null;
  const page = Math.max(1, Number.parseInt(String(query.page ?? 1), 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(String(query.limit ?? 10), 10) || 10),
  );

  if (!hasPagination) {
    const posts = await prisma.post.findMany({
      where: { locationId },
      orderBy: { createdAt: 'desc' },
    });
    return { posts: await enrichPostsWithMedia(posts) };
  }

  const skip = (page - 1) * limit;
  const where = { locationId };

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.post.count({ where }),
  ]);

  return {
    posts: await enrichPostsWithMedia(posts),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function getPostForLocation(locationId, postId) {
  await getLocationOrThrow(locationId);

  const post = await prisma.post.findFirst({
    where: { id: postId, locationId },
  });
  if (!post) {
    throw new AppError('Post not found.', 404, { code: 'POST_NOT_FOUND' });
  }
  const [enriched] = await enrichPostsWithMedia([post]);
  return enriched;
}

/**
 * Updates an existing post (content, type, mediaUrl).
 */
export async function updatePostForLocation(locationId, postId, body) {
  await getLocationOrThrow(locationId);

  const existing = await prisma.post.findFirst({
    where: { id: postId, locationId },
  });
  if (!existing) {
    throw new AppError('Post not found.', 404, { code: 'POST_NOT_FOUND' });
  }

  const { type, content, mediaUrl, scheduledAt, skipSocial } = validatePublishBody(body);

  const updated = await prisma.$transaction(async (tx) => {
    const post = await tx.post.update({
      where: { id: postId },
      data: {
        type,
        content,
        mediaUrl,
        ...(scheduledAt !== undefined ? { scheduledAt } : {}),
        ...(skipSocial !== undefined ? { skipSocial } : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        action: 'POST_UPDATED',
        locationId,
        details: { postId, type, mockMode: env.MOCK_MODE },
      },
    });
    return post;
  });

  const [enriched] = await enrichPostsWithMedia([updated]);
  return enriched;
}

/**
 * Deletes a post from the database.
 */
export async function deletePostForLocation(locationId, postId) {
  await getLocationOrThrow(locationId);

  const existing = await prisma.post.findFirst({
    where: { id: postId, locationId },
  });
  if (!existing) {
    throw new AppError('Post not found.', 404, { code: 'POST_NOT_FOUND' });
  }

  await prisma.$transaction(async (tx) => {
    await tx.post.delete({ where: { id: postId } });
    await tx.auditLog.create({
      data: {
        action: 'POST_DELETED',
        locationId,
        details: { postId, status: existing.status },
      },
    });
  });

  return { deleted: true, postId };
}
