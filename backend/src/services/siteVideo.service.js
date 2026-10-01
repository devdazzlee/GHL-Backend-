import { env } from '../config/env.js';
import prisma from '../database/client.js';
import { AppError } from '../utils/AppError.js';
import { revalidateSiteFrontendCache } from './siteRevalidation.service.js';

/**
 * One short, silent stock clip per site (the 551 HVAC home page video).
 *
 * Stored in GeneratedSite.imagesContent under `video` (no schema change):
 *   { source: 'AUTO' | 'PICKED', pexelsId, url, poster, width, height, duration, label,
 *     credit: { videographer, videographerUrl, pageUrl } }
 *   or { source: 'NONE' } when someone removed it in the dashboard (never re-picked).
 * Picked once from Pexels on the site's first render, then only changed in the dashboard.
 * The label says what the clip shows (from its Pexels page name), never that it is
 * the business's own team or work.
 */

const VIDEO_SEARCH = 'https://api.pexels.com/videos/search';
const VIDEO_BY_ID = 'https://api.pexels.com/videos/videos';

/** Short loops only; long clips are heavy and rarely loop well. */
const MIN_SECONDS = 4;
const MAX_SECONDS = 40;

function parseJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function httpsOrNull(value) {
  const url = String(value ?? '').trim();
  return /^https:\/\/\S+$/i.test(url) ? url : null;
}

/** "https://www.pexels.com/video/a-hand-setting-a-thermostat-12345/" -> "A hand setting a thermostat" */
export function labelFromPageUrl(pageUrl) {
  const match = /\/video\/([a-z0-9-]+?)-?\d*\/?$/i.exec(String(pageUrl ?? ''));
  const words = match ? match[1].replace(/-+/g, ' ').trim() : '';
  if (!words || /^\d+$/.test(words)) return null;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The file to play: an MP4 around 1280 px wide (sharp on a 720 px player, a few MB at most).
 * Never 4K. null when the clip has no usable MP4.
 */
export function pickVideoFile(files) {
  const mp4 = (Array.isArray(files) ? files : []).filter(
    (f) => f?.file_type === 'video/mp4' && httpsOrNull(f.link) && f.width > 0 && f.height > 0,
  );
  const inRange = mp4.filter((f) => f.width >= 960 && f.width <= 1920);
  if (inRange.length > 0) return inRange.sort((a, b) => Math.abs(a.width - 1280) - Math.abs(b.width - 1280))[0];
  const smaller = mp4.filter((f) => f.width >= 640 && f.width < 960).sort((a, b) => b.width - a.width);
  return smaller[0] ?? null;
}

/** A Pexels API video -> what we store, or null when it isn't suitable (portrait, too long, no MP4). */
export function videoFromPexels(video) {
  if (!video || video.id == null) return null;
  if (!(video.width > video.height)) return null;
  if (!(video.duration >= MIN_SECONDS && video.duration <= MAX_SECONDS)) return null;
  const file = pickVideoFile(video.video_files);
  const poster = httpsOrNull(video.image);
  if (!file || !poster) return null;
  const pageUrl = httpsOrNull(video.url);
  return {
    pexelsId: String(video.id),
    url: file.link,
    poster,
    width: file.width,
    height: file.height,
    duration: video.duration,
    label: labelFromPageUrl(pageUrl),
    credit: {
      videographer: String(video.user?.name ?? '').replace(/\s+/g, ' ').trim() || null,
      videographerUrl: httpsOrNull(video.user?.url),
      pageUrl,
    },
  };
}

function pexelsKey() {
  return env.PEXELS_API_KEY?.trim() || null;
}

async function pexelsGet(url) {
  const apiKey = pexelsKey();
  if (!apiKey) throw new AppError('Stock videos are not configured.', 503, { code: 'PEXELS_NOT_CONFIGURED' });
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (res.status === 429) throw Object.assign(new Error('Pexels rate limit (HTTP 429)'), { rateLimited: true });
  return res;
}

/** Suitable clips for a search, best first (Pexels' own ranking). */
export async function searchStockVideos(query) {
  const q = String(query ?? '').trim().slice(0, 100);
  if (!q) throw new AppError('Enter something to search for.', 400, { code: 'INVALID_QUERY' });
  const params = new URLSearchParams({ query: q, per_page: '30', orientation: 'landscape', size: 'medium' });
  const res = await pexelsGet(`${VIDEO_SEARCH}?${params}`);
  if (!res.ok) throw new AppError('Stock video search failed. Try again.', 502, { code: 'PEXELS_ERROR' });
  const data = await res.json();
  return (Array.isArray(data.videos) ? data.videos : []).map(videoFromPexels).filter(Boolean);
}

async function fetchVideoById(pexelsId) {
  const res = await pexelsGet(`${VIDEO_BY_ID}/${encodeURIComponent(pexelsId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new AppError('Could not load that video from Pexels. Try again.', 502, { code: 'PEXELS_ERROR' });
  return videoFromPexels(await res.json());
}

// ---- Stored video ----

export function readVideo(site) {
  const video = parseJson(site?.imagesContent, {}).video;
  return video && typeof video === 'object' && !Array.isArray(video) ? video : null;
}

async function saveVideo(siteId, video, { onlyIfEmpty = false } = {}) {
  const latest = await prisma.generatedSite.findUnique({ where: { id: siteId }, select: { imagesContent: true } });
  if (!latest) return false;
  if (onlyIfEmpty && readVideo(latest)) return false; // chosen in the dashboard meanwhile
  const raw = parseJson(latest.imagesContent, {});
  await prisma.generatedSite.update({ where: { id: siteId }, data: { imagesContent: JSON.stringify({ ...raw, video }) } });
  return true;
}

/** What the renderer shows: { url, poster, label, width, height } or null. */
export function videoForRenderer(video) {
  if (!video?.url || video.source === 'NONE') return null;
  return { url: video.url, poster: video.poster, label: video.label ?? null, width: video.width, height: video.height };
}

// ---- Automatic pick (once per site, paced) ----

const COOLDOWN_MS = 10 * 60 * 1000;
let cooldownUntil = 0;
const picksInFlight = new Map();

/** Tests only. */
export function resetVideoPickState() {
  cooldownUntil = 0;
  picksInFlight.clear();
}

/** A search for the site's trade, e.g. "HVAC technician", "pottery studio". */
export function videoQueryFor(site) {
  return String(site?.industry ?? '').trim().slice(0, 80);
}

async function defaultVideoSearch(query) {
  const res = await pexelsGet(`${VIDEO_SEARCH}?${new URLSearchParams({ query, per_page: '15', orientation: 'landscape', size: 'medium' })}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (Array.isArray(data.videos) ? data.videos : []).map(videoFromPexels).filter(Boolean);
}

/**
 * Picks and stores a clip for a site that has none yet (one search, one of the top
 * five suitable results). Never replaces a video chosen or removed in the dashboard.
 */
export function pickVideoIfMissing(site, { search = defaultVideoSearch } = {}) {
  if (readVideo(site) || !pexelsKey() || Date.now() < cooldownUntil) return Promise.resolve(false);
  if (picksInFlight.has(site.id)) return picksInFlight.get(site.id);
  const run = (async () => {
    const query = videoQueryFor(site);
    if (!query) return false;
    try {
      const results = (await search(query)).slice(0, 5);
      if (results.length === 0) return false;
      const chosen = results[Math.floor(Math.random() * results.length)];
      return saveVideo(site.id, { source: 'AUTO', ...chosen }, { onlyIfEmpty: true });
    } catch (error) {
      if (error?.rateLimited) {
        cooldownUntil = Date.now() + COOLDOWN_MS;
        console.warn(JSON.stringify({ event: 'site_video_rate_limited', siteId: site.id, cooldownMs: COOLDOWN_MS }));
        return false;
      }
      console.warn(JSON.stringify({ event: 'site_video_pick_failed', siteId: site.id, error: error?.message }));
      return false;
    }
  })().finally(() => picksInFlight.delete(site.id));
  picksInFlight.set(site.id, run);
  return run;
}

/** Renderer: the stored clip; picks one in the background (then refreshes the pages) when there is none. */
export function getSiteVideo(site, options = {}) {
  const video = readVideo(site);
  if (!video) {
    pickVideoIfMissing(site, options)
      .then((picked) => (picked && options.revalidate !== false ? revalidateSiteFrontendCache(site.slug) : null))
      .catch(() => null);
  }
  return videoForRenderer(video);
}

// ---- Dashboard ----

async function findSite(siteId) {
  const site = await prisma.generatedSite.findUnique({ where: { id: siteId } });
  if (!site) throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });
  return site;
}

export function videoView(video) {
  if (!video) return { status: 'NOT_PICKED_YET' };
  if (video.source === 'NONE') return { status: 'REMOVED' };
  return { status: 'SHOWN', ...video };
}

export async function getVideoSlot(siteId) {
  const site = await findSite(siteId);
  return { video: videoView(readVideo(site)), suggestedQuery: videoQueryFor(site) };
}

/** Body: { pexelsId } to show that clip, or { remove: true } to show no video. */
export async function setSiteVideo(siteId, body = {}, { lookup = fetchVideoById } = {}) {
  const site = await findSite(siteId);
  let video;
  if (body.remove === true) {
    video = { source: 'NONE' };
  } else {
    const pexelsId = String(body.pexelsId ?? '').trim();
    if (!/^\d{1,12}$/.test(pexelsId)) throw new AppError('Choose a video from the search results.', 400, { code: 'INVALID_VIDEO' });
    // Looked up on Pexels by its number, so the stored link, poster and credit are Pexels' own.
    const found = await lookup(pexelsId);
    if (!found) throw new AppError('That video is not available (it must be landscape, 4-40 seconds, with an MP4 file).', 400, { code: 'INVALID_VIDEO' });
    video = { source: 'PICKED', ...found };
  }
  await saveVideo(site.id, video);
  await revalidateSiteFrontendCache(site.slug);
  return { video: videoView(video), suggestedQuery: videoQueryFor(site) };
}
