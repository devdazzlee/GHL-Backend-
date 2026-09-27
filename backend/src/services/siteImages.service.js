import { env } from '../config/env.js';
import prisma from '../database/client.js';
import { AppError } from '../utils/AppError.js';
import { revalidateSiteFrontendCache } from './siteRevalidation.service.js';

/**
 * Page images for generated sites (hero, about, one per service, legacy blog covers).
 *
 * Until now every request picked a new random Pexels photo, so pictures changed
 * by themselves about once a day. Now each slot is picked once and stored in
 * GeneratedSite.imagesContent; after that it only changes when someone chooses
 * or uploads another image in the dashboard.
 *
 * Stored shape: { hero, about, services: { [serviceTitle]: entry }, blog: [entry] }
 * entry = { url, source: 'AUTO' | 'PICKED' | 'UPLOAD' }
 * Service images are keyed by the service title, so removing or reordering
 * services keeps each picture with its service; a regenerated service with a
 * new title gets a new picture.
 */

// ---- Automatic picks (moved unchanged from phase4.routes.js) ----

async function generateOpenAIQuery(businessName, industry, purpose, serviceTitle = null) {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    if (serviceTitle) {
      return `${serviceTitle} ${industry} professional close up`;
    }
    return `${industry} professional`;
  }

  try {
    const userContent = serviceTitle
      ? `Best Pexels photo search query for "${serviceTitle}" service at ${businessName}, a ${industry} business. Use the exact service name in the query. Return only a 3-5 word search query, nothing else.`
      : `Best Pexels photo search query for ${purpose} at ${businessName}, a ${industry} business. Return only a 3-5 word search query, nothing else.`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 30,
        messages: [
          {
            role: 'system',
            content: 'Return only a 3-5 word Pexels photo search query. Nothing else.',
          },
          { role: 'user', content: userContent },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI request failed: ${res.status}`);
    }

    const data = await res.json();
    const query = data.choices?.[0]?.message?.content?.trim();
    if (!query) {
      throw new Error('OpenAI returned empty query');
    }

    return query.replace(/^["']|["']$/g, '');
  } catch {
    if (serviceTitle) {
      return `${serviceTitle} ${industry} professional close up`;
    }
    return `${industry} professional`;
  }
}

function buildSectionQuery(site, sectionKey, services) {
  const { businessName, industry } = site;

  if (sectionKey === 'hero') {
    return `hero banner background for ${businessName} ${industry} business exterior`;
  }
  if (sectionKey === 'about') {
    return `team at work inside ${industry} business office`;
  }
  if (sectionKey.startsWith('service_')) {
    const index = Number.parseInt(sectionKey.replace('service_', ''), 10);
    const title = services[index]?.title || `${industry} service`;
    return `${title} technician working close up`;
  }
  if (sectionKey === 'blog' || sectionKey.startsWith('blog_')) {
    const index = sectionKey === 'blog' ? 0 : Number.parseInt(sectionKey.replace('blog_', ''), 10);
    const blogQueries = [
      `${industry} professional tips advice`,
      `${industry} maintenance service`,
      `${industry} customer satisfaction`,
    ];
    return blogQueries[index] ?? `${industry} professional work environment`;
  }

  return `${industry} professional`;
}

async function fetchPexelsImage(query) {
  const apiKey = env.PEXELS_API_KEY?.trim();
  if (!apiKey || !String(query ?? '').trim()) {
    return null;
  }

  try {
    const page = Math.floor(Math.random() * 5) + 1;
    const params = new URLSearchParams({
      query: String(query).trim(),
      per_page: '15',
      orientation: 'landscape',
      page: String(page),
    });

    const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: { Authorization: apiKey },
    });

    if (!res.ok) {
      throw new Error(`Pexels request failed: ${res.status}`);
    }

    const data = await res.json();
    const photos = data.photos;
    if (!Array.isArray(photos) || photos.length === 0) {
      return null;
    }

    const photo = photos[Math.floor(Math.random() * photos.length)];
    return photo?.src?.large2x ?? null;
  } catch {
    return null;
  }
}

// ---- Stored images ----

function parseJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Service titles in page order (services page first, home page as fallback). */
export function serviceTitles(site) {
  const home = parseJson(site.homeContent, {});
  const page = parseJson(site.servicesContent, {});
  const homeServices = Array.isArray(home.services) ? home.services : [];
  const pageServices = Array.isArray(page.services) ? page.services : [];
  const count = Math.max(homeServices.length, pageServices.length);
  return Array.from({ length: count }, (_, i) => {
    const title = String(pageServices[i]?.title ?? '').trim() || String(homeServices[i]?.title ?? '').trim();
    return title || `${site.industry} service`;
  });
}

function blogCount(site) {
  const posts = parseJson(site.blogContent, {}).posts ?? [];
  return Math.max(posts.length, 3);
}

async function defaultAutoPick(site, slot, titles) {
  const services = titles.map((title) => ({ title }));
  if (slot.kind === 'service') {
    return fetchPexelsImage(await generateOpenAIQuery(site.businessName, site.industry, null, slot.title));
  }
  const key = slot.kind === 'blog' ? (slot.index === 0 ? 'blog' : `blog_${slot.index}`) : slot.kind;
  return fetchPexelsImage(buildSectionQuery(site, key, services));
}

function readStore(site) {
  const raw = parseJson(site?.imagesContent, {});
  return {
    hero: raw.hero ?? null,
    about: raw.about ?? null,
    services: raw.services && typeof raw.services === 'object' && !Array.isArray(raw.services) ? raw.services : {},
    blog: Array.isArray(raw.blog) ? raw.blog : [],
  };
}

/** Every image slot the site's pages use. */
export function imageSlots(site) {
  const titles = serviceTitles(site);
  return [
    { id: 'hero', kind: 'hero', label: 'Home page banner' },
    { id: 'about', kind: 'about', label: 'About section' },
    ...titles.map((title, index) => ({ id: `service:${index}`, kind: 'service', index, title, label: `Service: ${title}` })),
    ...Array.from({ length: blogCount(site) }, (_, index) => ({
      id: `blog:${index}`,
      kind: 'blog',
      index,
      label: `Original blog post ${index + 1}`,
    })),
  ];
}

function getEntry(store, slot) {
  if (slot.kind === 'service') return store.services[slot.title] ?? null;
  if (slot.kind === 'blog') return store.blog[slot.index] ?? null;
  return store[slot.kind] ?? null;
}

function setEntry(store, slot, entry) {
  if (slot.kind === 'service') store.services[slot.title] = entry;
  else if (slot.kind === 'blog') store.blog[slot.index] = entry;
  else store[slot.kind] = entry;
}

/**
 * The site's images for the renderer, picking and storing any slot that has
 * no image yet. Stored images are returned as they are; nothing is re-picked.
 */
export async function getStoredSiteImages(site, { autoPickFn = defaultAutoPick } = {}) {
  const slots = imageSlots(site);
  const titles = serviceTitles(site);
  let store = readStore(site);
  const missing = slots.filter((slot) => !getEntry(store, slot)?.url);

  if (missing.length > 0) {
    const picks = await Promise.all(missing.map(async (slot) => [slot, await autoPickFn(site, slot, titles)]));
    const found = picks.filter(([, url]) => url);
    if (found.length > 0) {
      // Re-read and fill only slots that are still empty, so an image chosen in
      // the dashboard meanwhile is never overwritten by an automatic pick.
      const latest = await prisma.generatedSite.findUnique({ where: { id: site.id }, select: { imagesContent: true } });
      store = readStore(latest);
      for (const [slot, url] of found) {
        if (!getEntry(store, slot)?.url) setEntry(store, slot, { url, source: 'AUTO' });
      }
      await prisma.generatedSite.update({ where: { id: site.id }, data: { imagesContent: JSON.stringify(store) } });
    }
  }

  const url = (slot) => getEntry(store, slot)?.url ?? null;
  return {
    hero: url(slots[0]),
    about: url(slots[1]),
    services: slots.filter((s) => s.kind === 'service').map(url),
    blog: slots.filter((s) => s.kind === 'blog').map(url),
  };
}

async function findSite(siteId) {
  const site = await prisma.generatedSite.findUnique({ where: { id: siteId } });
  if (!site) throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });
  return site;
}

function slotView(slot, entry) {
  return {
    id: slot.id,
    kind: slot.kind,
    label: slot.label,
    title: slot.title ?? null,
    url: entry?.url ?? null,
    source: entry?.source ?? null,
  };
}

/** Dashboard list: every slot with its current image and where it came from. */
export async function listImageSlots(siteId, options) {
  const site = await findSite(siteId);
  await getStoredSiteImages(site, options);
  const store = readStore(await findSite(siteId));
  return imageSlots(site).map((slot) => slotView(slot, getEntry(store, slot)));
}

function cleanUrl(value) {
  const url = String(value ?? '').trim();
  if (!/^https:\/\/\S+$/i.test(url) || url.length > 2000) {
    throw new AppError('Image must be an https:// URL.', 400, { code: 'INVALID_IMAGE' });
  }
  return url;
}

/** Stores the image chosen in the dashboard for one slot. */
export async function setSiteImage(siteId, slotId, { url, source = 'PICKED' } = {}) {
  const site = await findSite(siteId);
  const slot = imageSlots(site).find((s) => s.id === slotId);
  if (!slot) throw new AppError('Unknown image slot.', 404, { code: 'IMAGE_SLOT_NOT_FOUND' });
  if (!['PICKED', 'UPLOAD'].includes(source)) {
    throw new AppError('Source must be PICKED or UPLOAD.', 400, { code: 'INVALID_IMAGE' });
  }
  const store = readStore(site);
  const entry = { url: cleanUrl(url), source };
  setEntry(store, slot, entry);
  await prisma.generatedSite.update({ where: { id: siteId }, data: { imagesContent: JSON.stringify(store) } });
  await revalidateSiteFrontendCache(site.slug);
  return slotView(slot, entry);
}

/** Stock photos to choose from (Pexels search). */
export async function searchStockPhotos(query) {
  const q = String(query ?? '').trim().slice(0, 100);
  if (!q) throw new AppError('Enter something to search for.', 400, { code: 'INVALID_QUERY' });
  const apiKey = env.PEXELS_API_KEY?.trim();
  if (!apiKey) throw new AppError('Stock photos are not configured.', 503, { code: 'PEXELS_NOT_CONFIGURED' });
  const params = new URLSearchParams({ query: q, per_page: '18', orientation: 'landscape' });
  const res = await fetch(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: apiKey } });
  if (!res.ok) throw new AppError('Stock photo search failed. Try again.', 502, { code: 'PEXELS_ERROR' });
  const data = await res.json();
  return (Array.isArray(data.photos) ? data.photos : [])
    .map((p) => ({ url: p?.src?.large2x ?? null, thumb: p?.src?.medium ?? null, alt: p?.alt ?? '', photographer: p?.photographer ?? '' }))
    .filter((p) => p.url && p.thumb);
}
