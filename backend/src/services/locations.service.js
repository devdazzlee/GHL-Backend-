import prisma from '../database/client.js';
import { AppError } from '../utils/AppError.js';
import { enrichPostsWithMedia } from './media.service.js';

const PLACEHOLDER_HOSTS = ['placehold.co', 'via.placeholder.com'];

export function isPlaceholderMediaUrl(url) {
  if (!url || typeof url !== 'string') return true;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return PLACEHOLDER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return true;
  }
}

/**
 * List active locations with business details for dashboard.
 */
export async function listAllLocations() {
  const locations = await prisma.location.findMany({
    where: { status: 'ACTIVE' },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          ghlAccountId: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return locations.map((loc) => ({
    id: loc.id,
    businessId: loc.businessId,
    businessName: loc.business.name,
    ghlLocationId: loc.ghlLocationId,
    requiresApproval: loc.requiresApproval,
    ghlLastPostDateFieldId: loc.ghlLastPostDateFieldId,
    ghlPostStatusFieldId: loc.ghlPostStatusFieldId,
    status: loc.status,
    timezone: loc.timezone,
    maxPostLength: loc.maxPostLength,
    serviceAreaTowns: loc.serviceAreaTowns,
    offerCouponCode: loc.offerCouponCode,
    offerTerms: loc.offerTerms,
    offerRedeemUrl: loc.offerRedeemUrl,
    socialPostingMode: loc.socialPostingMode,
  }));
}

/**
 * Replaces a location's service area town list. Empty strings are dropped;
 * an empty result falls back to the location's home city at post-generation time.
 */
export async function updateServiceAreaTowns(locationId, towns) {
  if (!Array.isArray(towns)) {
    throw new AppError('towns must be an array of strings.', 400, { code: 'INVALID_BODY' });
  }

  const cleaned = towns.map((t) => String(t ?? '').trim()).filter((t) => t.length > 0);

  try {
    return await prisma.location.update({
      where: { id: locationId },
      data: { serviceAreaTowns: cleaned },
      select: { id: true, serviceAreaTowns: true },
    });
  } catch (e) {
    if (e.code === 'P2025') {
      throw new AppError('Location not found.', 404, { code: 'LOCATION_NOT_FOUND' });
    }
    throw e;
  }
}

/**
 * Saves a location's OFFER post config. Empty strings are stored as null so
 * gbp.service.js's buildOfferDetails never sends a fabricated coupon/terms/url.
 */
export async function updateOfferConfig(locationId, { couponCode, terms, redeemUrl } = {}) {
  const clean = (value) => {
    const trimmed = String(value ?? '').trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  try {
    return await prisma.location.update({
      where: { id: locationId },
      data: {
        offerCouponCode: clean(couponCode),
        offerTerms: clean(terms),
        offerRedeemUrl: clean(redeemUrl),
      },
      select: { id: true, offerCouponCode: true, offerTerms: true, offerRedeemUrl: true },
    });
  } catch (e) {
    if (e.code === 'P2025') {
      throw new AppError('Location not found.', 404, { code: 'LOCATION_NOT_FOUND' });
    }
    throw e;
  }
}

const MIN_POST_LENGTH = 50;
const MAX_POST_LENGTH = 300;

/**
 * Saves a location's max post word length (50-300). This drives the word limit
 * used in the content generator's OpenAI prompt for that location's posts.
 */
export async function updateMaxPostLength(locationId, maxPostLength) {
  const n = Number(maxPostLength);
  if (!Number.isInteger(n) || n < MIN_POST_LENGTH || n > MAX_POST_LENGTH) {
    throw new AppError(
      `maxPostLength must be an integer between ${MIN_POST_LENGTH} and ${MAX_POST_LENGTH}.`,
      400,
      { code: 'INVALID_BODY' },
    );
  }

  try {
    return await prisma.location.update({
      where: { id: locationId },
      data: { maxPostLength: n },
      select: { id: true, maxPostLength: true },
    });
  } catch (e) {
    if (e.code === 'P2025') {
      throw new AppError('Location not found.', 404, { code: 'LOCATION_NOT_FOUND' });
    }
    throw e;
  }
}

/**
 * Links a location to a selected Google Business Profile location (and optionally
 * its Google account). Used by the Add Business flow after OAuth so the daily job
 * can publish to the chosen GBP listing.
 */
export async function updateGoogleLinkage(locationId, { googleAccountId, googleLocationId } = {}) {
  const gLocationId = String(googleLocationId ?? '').trim();
  if (!gLocationId) {
    throw new AppError('googleLocationId is required.', 400, { code: 'INVALID_BODY' });
  }
  const gAccountId = String(googleAccountId ?? '').trim();

  try {
    return await prisma.location.update({
      where: { id: locationId },
      data: {
        googleLocationId: gLocationId,
        ...(gAccountId ? { googleAccountId: gAccountId } : {}),
      },
      select: { id: true, googleAccountId: true, googleLocationId: true },
    });
  } catch (e) {
    if (e.code === 'P2025') {
      throw new AppError('Location not found.', 404, { code: 'LOCATION_NOT_FOUND' });
    }
    throw e;
  }
}

/**
 * Pending posts across all locations for approval queue.
 */
export async function listPendingPosts() {
  const posts = await prisma.post.findMany({
    where: { status: 'PENDING' },
    include: {
      location: {
        include: {
          business: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const enriched = await enrichPostsWithMedia(posts);

  return enriched.map(({ location, ...post }) => ({
    ...post,
    locationName: location.business.name,
    ghlLocationId: location.ghlLocationId,
  }));
}

export async function getLocationOrThrow(locationId) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    include: {
      business: { select: { id: true, name: true, ghlAccountId: true } },
    },
  });
  if (!location) {
    throw new AppError('Location not found.', 404, { code: 'LOCATION_NOT_FOUND' });
  }
  return location;
}

function isToday(date) {
  if (!date) return false;
  const d = new Date(date);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * Overview cards: locations with latest post stats.
 */
export async function listLocationSummaries() {
  const locations = await listAllLocations();

  return Promise.all(
    locations.map(async (loc) => {
      const [lastPostRaw, totalPosts, pendingCount] = await Promise.all([
        prisma.post.findFirst({
          where: { locationId: loc.id },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.post.count({ where: { locationId: loc.id } }),
        prisma.post.count({ where: { locationId: loc.id, status: 'PENDING' } }),
      ]);

      const lastPost = lastPostRaw
        ? (await enrichPostsWithMedia([lastPostRaw]))[0]
        : null;

      const hasPostToday = lastPost
        ? isToday(lastPost.postedAt) || isToday(lastPost.createdAt)
        : false;

      return {
        ...loc,
        lastPost,
        totalPosts,
        pendingCount,
        hasPostToday,
      };
    }),
  );
}
