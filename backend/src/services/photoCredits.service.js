import { env } from '../config/env.js';
import prisma from '../database/client.js';
import { AppError } from '../utils/AppError.js';
import { revalidateSiteFrontendCache } from './siteRevalidation.service.js';

/**
 * Who took each stock photo on a site, and what the photo shows.
 *
 * Every Pexels photo URL carries the photo's number (images.pexels.com/photos/<id>/...).
 * The photographer, their Pexels page, the photo's Pexels page and Pexels' own
 * description of the photo are looked up once by that number and kept on the site in
 * GeneratedSite.imagesContent under `credits: { [pexelsId]: credit }`, so no schema
 * change is needed. Photos that were on sites before credits were recorded are looked
 * up lazily in the background, a few at a time.
 *
 * The description is used as the photo's alt text on the site: it says what the photo
 * shows, and never claims the photo is of the business's own team or work.
 */

const PEXELS_ID_RX = /^https:\/\/images\.pexels\.com\/photos\/(\d+)\//i;

export function pexelsPhotoId(url) {
  const match = PEXELS_ID_RX.exec(String(url ?? '').trim());
  return match ? match[1] : null;
}

function httpsOrNull(value) {
  const url = String(value ?? '').trim();
  return /^https:\/\/\S+$/i.test(url) ? url : null;
}

/** The parts of a Pexels API photo we keep. */
export function creditFromPexelsPhoto(photo) {
  if (!photo || photo.id == null) return null;
  return {
    pexelsId: String(photo.id),
    photographer: String(photo.photographer ?? '').replace(/\s+/g, ' ').trim() || null,
    photographerUrl: httpsOrNull(photo.photographer_url),
    pageUrl: httpsOrNull(photo.url),
    alt: String(photo.alt ?? '').replace(/\s+/g, ' ').trim().slice(0, 300) || null,
  };
}

function parseJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function readCredits(site) {
  const credits = parseJson(site?.imagesContent, {}).credits;
  return credits && typeof credits === 'object' && !Array.isArray(credits) ? credits : {};
}

/** Adds credits to the stored images without touching anything else in it. */
export async function saveCredits(siteId, credits) {
  const list = credits.filter(Boolean);
  if (list.length === 0) return 0;
  const latest = await prisma.generatedSite.findUnique({ where: { id: siteId }, select: { imagesContent: true } });
  if (!latest) return 0;
  const raw = parseJson(latest.imagesContent, {});
  const stored = readCredits(latest);
  for (const credit of list) stored[credit.pexelsId] = credit;
  await prisma.generatedSite.update({
    where: { id: siteId },
    data: { imagesContent: JSON.stringify({ ...raw, credits: stored }) },
  });
  return list.length;
}

// ---- Every stock photo a site shows ----

const MARKDOWN_IMAGE_RX = /!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)/g;

/**
 * Every photo on the site with where it appears: page image slots, city pages, and
 * blog post covers and in-article images.
 */
export async function sitePhotoUses(site, slotsWithUrls) {
  const uses = slotsWithUrls.filter((s) => s.url).map((s) => ({ where: s.label, url: s.url }));
  const [cities, posts] = await Promise.all([
    prisma.locationPage.findMany({ where: { siteId: site.id }, select: { city: true, imageUrl: true }, orderBy: { city: 'asc' } }),
    prisma.blogPost.findMany({ where: { siteId: site.id }, select: { title: true, imageUrl: true, body: true }, orderBy: { createdAt: 'asc' } }),
  ]);
  for (const city of cities) {
    if (city.imageUrl) uses.push({ where: `City page: ${city.city}`, url: city.imageUrl });
  }
  for (const post of posts) {
    if (post.imageUrl) uses.push({ where: `Blog post cover: ${post.title}`, url: post.imageUrl });
    for (const match of String(post.body ?? '').matchAll(MARKDOWN_IMAGE_RX)) {
      uses.push({ where: `Blog post image: ${post.title}`, url: match[2] });
    }
  }
  return uses;
}

// ---- Looking up credits by photo number (paced; Pexels answers bursts with 429) ----

export const CREDIT_LOOKUPS_PER_RUN = 8;
export const CREDIT_COOLDOWN_MS = 10 * 60 * 1000;
let creditCooldownUntil = 0;
const runsInFlight = new Map();

/** Tests only. */
export function resetCreditLookupState() {
  creditCooldownUntil = 0;
  runsInFlight.clear();
}

/** One photo from the Pexels API. null when it no longer exists; throws { rateLimited } on 429. */
async function defaultLookup(pexelsId) {
  const apiKey = env.PEXELS_API_KEY?.trim();
  if (!apiKey) return undefined;
  const res = await fetch(`https://api.pexels.com/v1/photos/${encodeURIComponent(pexelsId)}`, { headers: { Authorization: apiKey } });
  if (res.status === 429) throw Object.assign(new Error('Pexels rate limit (HTTP 429)'), { rateLimited: true });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Pexels request failed: ${res.status}`);
  return res.json();
}

/**
 * Looks up credits the site doesn't have yet, a few per run. A photo Pexels no longer
 * has is recorded as { pexelsId, unavailable: true } so it isn't asked for again.
 * Returns how many were added and how many are still unknown.
 */
export function fillMissingCredits(site, ids, { lookup = defaultLookup, limit = CREDIT_LOOKUPS_PER_RUN } = {}) {
  if (runsInFlight.has(site.id)) return runsInFlight.get(site.id);
  const run = (async () => {
    const known = readCredits(site);
    const missing = [...new Set(ids.filter(Boolean))].filter((id) => !known[id]);
    if (missing.length === 0 || Date.now() < creditCooldownUntil) return { added: 0, missing: missing.length };
    const found = [];
    for (const id of missing.slice(0, limit)) {
      try {
        const photo = await lookup(id);
        if (photo === undefined) break; // stock photos not configured
        found.push(photo ? creditFromPexelsPhoto(photo) : { pexelsId: id, unavailable: true });
      } catch (error) {
        if (error?.rateLimited) {
          creditCooldownUntil = Date.now() + CREDIT_COOLDOWN_MS;
          console.warn(JSON.stringify({ event: 'photo_credit_rate_limited', siteId: site.id, cooldownMs: CREDIT_COOLDOWN_MS }));
          break;
        }
        console.warn(JSON.stringify({ event: 'photo_credit_lookup_failed', siteId: site.id, pexelsId: id, error: error?.message }));
      }
    }
    const added = await saveCredits(site.id, found);
    return { added, missing: missing.length - added };
  })().finally(() => runsInFlight.delete(site.id));
  runsInFlight.set(site.id, run);
  return run;
}

/** Fire-and-forget version for page and dashboard requests; refreshes the site's pages when alt text changed. */
export function fillMissingCreditsInBackground(site, ids, options) {
  fillMissingCredits(site, ids, options)
    .then((result) => (result.added > 0 && options?.revalidate !== false ? revalidateSiteFrontendCache(site.slug) : null))
    .catch((error) => console.warn(JSON.stringify({ event: 'photo_credit_fill_failed', siteId: site.id, error: error?.message })));
}

// ---- What the renderer and the dashboard get ----

/** { [pexelsId]: { alt } } for every photo with a known description (renderer: alt text). */
export function photoDescriptions(site) {
  const out = {};
  for (const [id, credit] of Object.entries(readCredits(site))) {
    if (credit?.alt) out[id] = { alt: credit.alt };
  }
  return out;
}

export function creditView(url, credits) {
  const id = pexelsPhotoId(url);
  if (!id) return { status: 'NOT_STOCK' };
  const credit = credits[id];
  if (!credit) return { status: 'PENDING', pexelsId: id };
  if (credit.unavailable) return { status: 'UNAVAILABLE', pexelsId: id };
  return { status: 'KNOWN', ...credit };
}

/**
 * Dashboard credits list: each photo once, with every place it appears. Starts the
 * lookups for photos whose credit isn't known yet.
 */
export async function listPhotoCredits(siteId, slotsWithUrls, options) {
  const site = await prisma.generatedSite.findUnique({ where: { id: siteId } });
  if (!site) throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });
  const uses = await sitePhotoUses(site, slotsWithUrls);
  const credits = readCredits(site);
  const byUrl = new Map();
  for (const use of uses) {
    const entry = byUrl.get(use.url) ?? { url: use.url, usedIn: [], credit: creditView(use.url, credits) };
    if (!entry.usedIn.includes(use.where)) entry.usedIn.push(use.where);
    byUrl.set(use.url, entry);
  }
  const photos = [...byUrl.values()];
  const pending = photos.filter((p) => p.credit.status === 'PENDING').map((p) => p.credit.pexelsId);
  if (pending.length > 0) fillMissingCreditsInBackground(site, pending, options);
  return { photos, pending: pending.length };
}
