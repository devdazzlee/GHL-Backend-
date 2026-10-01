import OpenAI from 'openai';
import { env } from '../config/env.js';
import prisma from '../database/client.js';
import { AppError } from '../utils/AppError.js';
import { creditFromPexelsPhoto, fillMissingCreditsInBackground, pexelsPhotoId, readCredits, saveCredits } from './photoCredits.service.js';
import { revalidateSiteFrontendCache } from './siteRevalidation.service.js';
import { US_STATES, toStateCode } from './zipRadius.service.js';

/**
 * Photos for city pages that never show the wrong place.
 *
 * Pexels has few photos of small towns: a search for "Hawthorne New Jersey" returns
 * scenery from Jersey City, Atlantic City or another state. Pexels describes each photo
 * ("Quiet winter street scene ... Wabasha, MN"), so a photo is judged by its description:
 *   TOWN       names this town (and no other state)        -> best
 *   PLACELESS  names no place at all (or only this state)  -> honest generic fallback
 *   ELSEWHERE  names some other place                      -> never used
 * Only the first page of results is used (deeper pages are even less related). When
 * nothing qualifies, the city page has no photo rather than a misleading one.
 */

// ---- Judging a photo by its Pexels description ----

/** Capitalised words that are not place names. */
const NOT_PLACES = new Set([
  'AC', 'HVAC', 'DIY', 'LED', 'TV', 'UV', 'PVC', 'SUV', 'CCTV', 'HD', '3D', 'I',
  'USA', 'US', 'U.S.', 'United', 'States', 'America', 'American', 'County',
]);

function escapeRx(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every US state the text names, as two-letter codes ("New Jersey", ", NJ"). */
export function statesNamed(text) {
  const found = new Set();
  for (const [code, name] of Object.entries(US_STATES)) {
    if (new RegExp(`\\b${escapeRx(name)}\\b`, 'i').test(text)) found.add(code);
    // Codes only in address form (", MN" / ", MN."), so "OR", "IN", "ME" as words don't count.
    if (new RegExp(`,\\s*${code}\\b`).test(text)) found.add(code);
  }
  // "Washington" alone is usually the city or a street; only count it with "State".
  if (found.has('WA') && !/\bWashington State\b|,\s*WA\b/.test(text)) found.delete('WA');
  return found;
}

/** Proper nouns in the description (capitalised words not at the start of a sentence). */
function properNouns(text) {
  const words = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const tokens = sentence.split(/[\s,;:()"“”]+/).filter(Boolean);
    tokens.slice(1).forEach((raw) => {
      const word = raw.replace(/['’]s$/i, '').replace(/[^\p{L}\p{N}.&-]+$/u, '').replace(/^[^\p{L}\p{N}]+/u, '');
      if (/^\p{Lu}/u.test(word)) words.push(word.replace(/\.$/, ''));
    });
  }
  return words;
}

/**
 * How a photo's description relates to a town.
 * @returns {{ kind: 'TOWN' | 'PLACELESS' | 'ELSEWHERE' | 'NO_DESCRIPTION', names: string[] }}
 *   names: the other places it mentions (for the dashboard)
 */
export function classifyCityPhoto(description, { city, state, county } = {}) {
  const text = String(description ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { kind: 'NO_DESCRIPTION', names: [] };
  const stateCode = toStateCode(state);
  const otherStates = [...statesNamed(text)].filter((code) => code !== stateCode);

  const cityName = String(city ?? '').trim();
  const cityVariants = cityName ? [cityName, cityName.replace(/-/g, ' ')] : [];
  const namesTown = cityVariants.some((v) => new RegExp(`\\b${escapeRx(v)}(?:['’]s)?\\b`, 'i').test(text));
  if (namesTown && otherStates.length === 0) return { kind: 'TOWN', names: [] };

  const allowed = new Set(
    [cityName, String(county ?? ''), stateCode ? US_STATES[stateCode] : '', stateCode ?? '']
      .flatMap((s) => s.split(/[\s-]+/))
      .filter(Boolean)
      .map((w) => w.toLowerCase()),
  );
  const others = properNouns(text).filter((w) => !NOT_PLACES.has(w) && !allowed.has(w.toLowerCase()));
  if (others.length === 0 && otherStates.length === 0) return { kind: 'PLACELESS', names: [] };
  return { kind: 'ELSEWHERE', names: [...new Set([...others, ...otherStates])] };
}

// ---- Picking ----

/** Used when the town search has nothing usable: a generic street with no place in it. */
export const GENERIC_CITY_QUERY = 'residential street houses trees';

async function defaultSearch(query) {
  const apiKey = env.PEXELS_API_KEY?.trim();
  if (!apiKey) return [];
  const params = new URLSearchParams({ query, per_page: '15', orientation: 'landscape', page: '1' });
  const res = await fetch(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: apiKey } });
  if (res.status === 429) throw Object.assign(new Error('Pexels rate limit (HTTP 429)'), { rateLimited: true });
  if (!res.ok) throw new Error(`Pexels search failed (HTTP ${res.status}) for "${query}"`);
  const data = await res.json();
  return Array.isArray(data.photos) ? data.photos : [];
}

/**
 * Search words safe to send: the town's state code becomes the state's name ("OR" ->
 * "Oregon"), and stray AND/OR/NOT are dropped. Pexels' firewall answers 403 to
 * queries like "Sellwood-Moreland OR neighborhood", which look like an injection attempt.
 */
export function safeSearchQuery(query, state) {
  const code = toStateCode(state);
  let q = String(query ?? '');
  if (code) q = q.replace(new RegExp(`\\b${code}\\b`, 'g'), US_STATES[code]);
  return q
    .replace(/\b(AND|OR|NOT)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function randomOf(items) {
  return items[Math.floor(Math.random() * items.length)];
}

const asPick = (photo) => (photo?.src?.large2x ? { url: photo.src.large2x, credit: creditFromPexelsPhoto(photo) } : null);

/**
 * A photo for one town: one that names the town, else one that names no place, else
 * none (null). Throws { rateLimited } on Pexels 429.
 */
export async function pickCityPhoto(place, query, { search = defaultSearch } = {}) {
  const usable = (photos) => photos.filter((p) => p?.src?.large2x);
  const results = usable(await search(safeSearchQuery(query, place?.state)));
  const judged = results.map((p) => ({ photo: p, kind: classifyCityPhoto(p.alt, place).kind }));
  const town = judged.filter((j) => j.kind === 'TOWN');
  if (town.length > 0) return asPick(randomOf(town).photo);
  let placeless = judged.filter((j) => j.kind === 'PLACELESS');
  if (placeless.length === 0) {
    placeless = usable(await search(GENERIC_CITY_QUERY))
      .map((p) => ({ photo: p, kind: classifyCityPhoto(p.alt, place).kind }))
      .filter((j) => j.kind === 'PLACELESS');
  }
  return placeless.length > 0 ? asPick(randomOf(placeless).photo) : null;
}

/** Pexels search words for a town (AI, with the town name in it), e.g. "Ridgewood NJ downtown street". */
export async function generateLocationImageQuery(location, site) {
  const fallback = `${location.city} ${location.state} neighborhood`;
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return fallback;
  }

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 30,
      messages: [
        {
          role: 'system',
          content: 'Return only a 3-5 word Pexels photo search query. Nothing else.',
        },
        {
          role: 'user',
          content:
            `Best Pexels photo search query for ${location.city}, ${location.county} County, ${location.state}. ` +
            `Show a recognizable scenic or neighborhood view of this specific city, suitable for a ${site.industry} business location page. ` +
            'Include the city name. Return only 3-5 words.',
        },
      ],
    });

    const query = completion.choices?.[0]?.message?.content?.trim();
    if (!query) {
      return fallback;
    }

    return query.replace(/^["']|["']$/g, '');
  } catch {
    return fallback;
  }
}

/** The photo for a new city page (URL or null); its credit is stored with the site's photos. */
export async function chooseCityPagePhoto(location, site, { search, queryFn = generateLocationImageQuery } = {}) {
  const query = await queryFn(location, site);
  try {
    const picked = await pickCityPhoto(location, query, { search });
    console.info(JSON.stringify({ event: 'location_image_pick', city: location.city, query, found: Boolean(picked) }));
    if (!picked) return null;
    if (picked.credit && site?.id) await saveCredits(site.id, [picked.credit]).catch(() => null);
    return picked.url;
  } catch (error) {
    console.warn(JSON.stringify({ event: 'location_image_failed', city: location.city, query, error: error?.message }));
    return null;
  }
}

// ---- Existing city pages: find and re-pick photos of the wrong place ----

async function loadSite(siteId) {
  const site = await prisma.generatedSite.findUnique({ where: { id: siteId } });
  if (!site) throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });
  const pages = await prisma.locationPage.findMany({
    where: { siteId },
    select: { id: true, city: true, county: true, state: true, slug: true, imageUrl: true },
    orderBy: { city: 'asc' },
  });
  return { site, pages };
}

/**
 * Each city page's photo:
 *   MATCHES_TOWN | GENERIC | MISMATCHED (shows somewhere else) | NO_PHOTO |
 *   NOT_STOCK (uploaded/own link, left alone) | CHECKING (credit still being looked up) | UNKNOWN
 */
function judgePage(page, credits) {
  if (!page.imageUrl) return { status: 'NO_PHOTO' };
  const id = pexelsPhotoId(page.imageUrl);
  if (!id) return { status: 'NOT_STOCK' };
  const credit = credits[id];
  if (!credit) return { status: 'CHECKING', pexelsId: id };
  if (credit.unavailable) return { status: 'UNKNOWN' };
  const { kind, names } = classifyCityPhoto(credit.alt, page);
  const status = { TOWN: 'MATCHES_TOWN', PLACELESS: 'GENERIC', ELSEWHERE: 'MISMATCHED', NO_DESCRIPTION: 'UNKNOWN' }[kind];
  return { status, description: credit.alt ?? null, names };
}

export async function cityPhotoReport(siteId, options) {
  const { site, pages } = await loadSite(siteId);
  const credits = readCredits(site);
  const rows = pages.map((page) => ({ id: page.id, city: page.city, state: page.state, slug: page.slug, imageUrl: page.imageUrl, ...judgePage(page, credits) }));
  const checking = rows.filter((r) => r.status === 'CHECKING').map((r) => r.pexelsId);
  if (checking.length > 0) fillMissingCreditsInBackground(site, checking, options);
  const count = (status) => rows.filter((r) => r.status === status).length;
  return {
    pages: rows,
    summary: { matchesTown: count('MATCHES_TOWN'), generic: count('GENERIC'), mismatched: count('MISMATCHED'), checking: checking.length },
  };
}

/** At most this many pages per click (each is one or two Pexels searches). */
export const REPICK_LIMIT = 10;

/**
 * Re-picks only the city pages whose photo shows somewhere else. Each gets a photo of
 * the town, else a generic one, else no photo. Stops at a Pexels 429 (the rest stay
 * for the next click). Never touches uploaded photos or ones that already fit.
 */
export async function repickMismatchedCityPhotos(siteId, { search, queryFn = generateLocationImageQuery, limit = REPICK_LIMIT } = {}) {
  const { site, pages } = await loadSite(siteId);
  const credits = readCredits(site);
  const mismatched = pages.filter((page) => judgePage(page, credits).status === 'MISMATCHED');
  const changed = [];
  const failed = [];
  let stoppedEarly = false;
  for (const page of mismatched.slice(0, limit)) {
    let picked;
    try {
      picked = await pickCityPhoto(page, await queryFn(page, site), { search });
    } catch (error) {
      if (error?.rateLimited) {
        stoppedEarly = true;
        break;
      }
      // One town's search failing never blocks the others; its photo stays as it was.
      console.warn(JSON.stringify({ event: 'city_photo_repick_failed', siteId, city: page.city, error: error?.message }));
      failed.push(page.city);
      continue;
    }
    await prisma.locationPage.update({ where: { id: page.id }, data: { imageUrl: picked?.url ?? null } });
    if (picked?.credit) await saveCredits(site.id, [picked.credit]);
    changed.push({ city: page.city, from: page.imageUrl, to: picked?.url ?? null, description: picked?.credit?.alt ?? null });
  }
  if (changed.length > 0) await revalidateSiteFrontendCache(site.slug);
  return { changed, failed, remaining: mismatched.length - changed.length, stoppedEarly };
}
