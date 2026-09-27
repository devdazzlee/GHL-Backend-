import { unlink } from 'node:fs/promises';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import prisma from '../database/client.js';
import { AppError } from '../utils/AppError.js';

const PLACEHOLDER_IMAGE_URL =
  'https://placehold.co/1200x630/png?text=GBP+Automation+Post';

const PLACEHOLDER_HOSTS = ['placehold.co', 'via.placeholder.com'];

export function isPlaceholderMediaUrl(url) {
  if (!url || typeof url !== 'string') return true;
  if (url === PLACEHOLDER_IMAGE_URL) return true;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return PLACEHOLDER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return true;
  }
}

/**
 * Replace placeholder mediaUrl with the latest real upload from the Media table.
 */
export async function resolvePostMediaUrl(post) {
  if (post.mediaUrl && !isPlaceholderMediaUrl(post.mediaUrl)) {
    return post.mediaUrl;
  }

  const stored = await prisma.media.findFirst({
    where: { locationId: post.locationId, postType: post.type },
    orderBy: { createdAt: 'desc' },
    select: { url: true },
  });

  if (stored?.url && !isPlaceholderMediaUrl(stored.url)) {
    return stored.url;
  }

  return null;
}

export async function enrichPostsWithMedia(posts) {
  return Promise.all(
    posts.map(async (post) => ({
      ...post,
      mediaUrl: await resolvePostMediaUrl(post),
    })),
  );
}

const POST_TYPES = new Set(['UPDATE', 'OFFER', 'EVENT']);

function normalizePostType(postType) {
  const t = String(postType ?? '').toUpperCase();
  if (!POST_TYPES.has(t)) {
    throw new AppError('postType must be one of: UPDATE, OFFER, EVENT.', 400, {
      code: 'INVALID_POST_TYPE',
    });
  }
  return t;
}

function cloudinaryFolder(locationId, postType) {
  return `gbp-automation/${locationId}/${normalizePostType(postType)}`;
}

function ensureCloudinaryConfigured() {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new AppError('Cloudinary is not configured.', 500, { code: 'CLOUDINARY_NOT_CONFIGURED' });
  }
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/**
 * @param {string} filePath
 * @param {string} locationId
 * @param {string} postType
 * @returns {Promise<string>} secure URL
 */
export async function uploadMedia(filePath, locationId, postType) {
  const type = normalizePostType(postType);
  const folder = cloudinaryFolder(locationId, type);

  if (env.MOCK_MODE) {
    console.info(
      JSON.stringify({
        event: 'cloudinary_upload_mock',
        locationId,
        postType: type,
        folder,
        filePath,
      }),
    );
    return PLACEHOLDER_IMAGE_URL;
  }

  ensureCloudinaryConfigured();

  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: 'image',
    });
    return result.secure_url;
  } catch (e) {
    throw new AppError(`Cloudinary upload failed: ${e.message}`, 502, {
      code: 'CLOUDINARY_UPLOAD_ERROR',
    });
  }
}

/**
 * Image for a generated site (blog cover, page section): stored in Cloudinary under
 * peakwa-sites/{siteId}/{kind} so the URL stays the same until someone changes it.
 * @returns {Promise<string>} secure URL
 */
export async function uploadSiteImage(filePath, siteId, kind) {
  const folder = `peakwa-sites/${siteId}/${String(kind || 'images').replace(/[^a-z0-9-]/gi, '')}`;
  if (env.MOCK_MODE) {
    console.info(JSON.stringify({ event: 'cloudinary_upload_mock', siteId, folder, filePath }));
    return PLACEHOLDER_IMAGE_URL;
  }
  ensureCloudinaryConfigured();
  try {
    const result = await cloudinary.uploader.upload(filePath, { folder, resource_type: 'image' });
    return result.secure_url;
  } catch (e) {
    throw new AppError(`Cloudinary upload failed: ${e.message}`, 502, { code: 'CLOUDINARY_UPLOAD_ERROR' });
  }
}

/**
 * Picks a random image URL from Cloudinary folder (or DB fallback).
 */
export async function getMediaForPost(locationId, postType) {
  const type = normalizePostType(postType);
  const folder = cloudinaryFolder(locationId, type);

  if (env.MOCK_MODE) {
    return PLACEHOLDER_IMAGE_URL;
  }

  ensureCloudinaryConfigured();

  try {
    const { resources } = await cloudinary.api.resources({
      type: 'upload',
      prefix: folder,
      max_results: 100,
    });

    if (resources?.length) {
      const pick = resources[Math.floor(Math.random() * resources.length)];
      if (pick.secure_url) return pick.secure_url;
    }
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: 'cloudinary_list_failed',
        folder,
        error: e?.message ?? String(e),
      }),
    );
  }

  const stored = await prisma.media.findMany({
    where: { locationId, postType: type },
    select: { url: true },
  });
  if (stored.length > 0) {
    return stored[Math.floor(Math.random() * stored.length)].url;
  }

  return PLACEHOLDER_IMAGE_URL;
}

/** Stable key for deduping Cloudinary URLs (transform/query params ignored). */
export function normalizeMediaUrlKey(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.includes('res.cloudinary.com')) {
    const publicId = cloudinaryPublicIdFromUrl(url);
    if (publicId) return publicId;
  }
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return url.split('?')[0];
  }
}

async function collectLocationMediaUrls(locationId, postType) {
  const type = normalizePostType(postType);
  const locationPrefix = `gbp-automation/${locationId}`;
  const urls = new Set();

  const stored = await prisma.media.findMany({
    where: { locationId },
    select: { url: true },
  });

  for (const row of stored) {
    if (row.url && !isPlaceholderMediaUrl(row.url)) {
      urls.add(row.url);
    }
  }

  if (
    !env.MOCK_MODE &&
    env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET
  ) {
    ensureCloudinaryConfigured();
    try {
      const { resources } = await cloudinary.api.resources({
        type: 'upload',
        prefix: locationPrefix,
        max_results: 500,
      });
      for (const r of resources ?? []) {
        if (r.secure_url && !isPlaceholderMediaUrl(r.secure_url)) {
          urls.add(r.secure_url);
        }
      }
    } catch (e) {
      console.warn(
        JSON.stringify({
          event: 'cloudinary_list_failed',
          folder: locationPrefix,
          error: e?.message ?? String(e),
        }),
      );
    }
  }

  return [...urls];
}

async function getLastUsedAtByMediaKey(locationId) {
  const posts = await prisma.post.findMany({
    where: { locationId, mediaUrl: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { mediaUrl: true, createdAt: true },
  });

  const map = new Map();
  for (const post of posts) {
    const key = normalizeMediaUrlKey(post.mediaUrl);
    if (key && !map.has(key)) {
      map.set(key, post.createdAt);
    }
  }
  return map;
}

/** Pick the upload used longest ago (never-used first). */
function pickLeastRecentlyUsed(urls, lastUsedByKey) {
  if (!urls.length) return null;

  let neverUsed = null;
  let bestUrl = null;
  let oldestUsedAt = null;

  for (const url of urls) {
    const key = normalizeMediaUrlKey(url);
    const usedAt = lastUsedByKey.get(key);
    if (usedAt === undefined) {
      neverUsed = url;
      break;
    }
    if (oldestUsedAt === null || usedAt < oldestUsedAt) {
      oldestUsedAt = usedAt;
      bestUrl = url;
    }
  }

  return neverUsed ?? bestUrl ?? urls[0];
}

export function wouldReuseLastPostMedia(selectedUrl, recentPostUrls) {
  if (!selectedUrl || !recentPostUrls?.length) return false;
  return (
    normalizeMediaUrlKey(selectedUrl) === normalizeMediaUrlKey(recentPostUrls[0])
  );
}

/**
 * Random real media URL from Cloudinary or the Media table, or null if none.
 */
export async function getLocationMediaFallbackUrl(locationId, postType = 'UPDATE') {
  const urls = await collectLocationMediaUrls(locationId, postType);
  if (!urls.length) return null;
  const lastUsed = await getLastUsedAtByMediaKey(locationId);
  return pickLeastRecentlyUsed(urls, lastUsed);
}

/**
 * Prefer uploaded Cloudinary/media library images for daily posts (LRU rotation).
 * @returns {Promise<{ url: string|null, poolSize: number }>}
 */
export async function getLocationMediaForDailyPost(locationId, postType = 'UPDATE') {
  const urls = await collectLocationMediaUrls(locationId, postType);
  if (!urls.length) {
    return { url: null, poolSize: 0 };
  }

  const lastUsed = await getLastUsedAtByMediaKey(locationId);
  const url = pickLeastRecentlyUsed(urls, lastUsed);
  return { url, poolSize: urls.length };
}

/**
 * List uploaded media records for a location (newest first).
 */
export async function listMediaForLocation(locationId) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true },
  });
  if (!location) {
    throw new AppError('Location not found.', 404, { code: 'LOCATION_NOT_FOUND' });
  }

  return prisma.media.findMany({
    where: { locationId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Persists an uploaded media URL for a location + post type.
 */
export async function saveMediaRecord(locationId, postType, url) {
  const type = normalizePostType(postType);

  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true },
  });
  if (!location) {
    throw new AppError('Location not found.', 404, { code: 'LOCATION_NOT_FOUND' });
  }

  return prisma.media.create({
    data: {
      locationId,
      postType: type,
      url,
    },
  });
}

/**
 * Upload file from disk, save URL to DB, remove temp file.
 */
export async function uploadAndSaveMedia(filePath, locationId, postType) {
  const url = await uploadMedia(filePath, locationId, postType);
  const record = await saveMediaRecord(locationId, postType, url);
  try {
    await unlink(filePath);
  } catch {
    // temp cleanup best-effort
  }
  return { url, media: record };
}

function cloudinaryPublicIdFromUrl(url) {
  try {
    const marker = '/upload/';
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    let path = url.slice(idx + marker.length);
    path = path.replace(/^v\d+\//, '');
    const dot = path.lastIndexOf('.');
    if (dot > -1) path = path.slice(0, dot);
    return path || null;
  } catch {
    return null;
  }
}

async function deleteFromCloudinaryIfPossible(url) {
  if (env.MOCK_MODE || isPlaceholderMediaUrl(url)) return;
  if (!url.includes('res.cloudinary.com')) return;

  ensureCloudinaryConfigured();
  const publicId = cloudinaryPublicIdFromUrl(url);
  if (!publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: 'cloudinary_delete_failed',
        publicId,
        error: e?.message ?? String(e),
      }),
    );
  }
}

/**
 * Deletes a media row and removes the image from Cloudinary when applicable.
 */
export async function deleteMediaForLocation(locationId, mediaId) {
  const existing = await prisma.media.findFirst({
    where: { id: mediaId, locationId },
  });
  if (!existing) {
    throw new AppError('Media not found.', 404, { code: 'MEDIA_NOT_FOUND' });
  }

  await deleteFromCloudinaryIfPossible(existing.url);

  await prisma.media.delete({ where: { id: mediaId } });

  await prisma.auditLog.create({
    data: {
      action: 'MEDIA_DELETED',
      locationId,
      details: { mediaId, url: existing.url, postType: existing.postType },
    },
  });

  return { deleted: true, mediaId };
}
