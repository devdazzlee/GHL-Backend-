import OpenAI from 'openai';
import { env } from '../config/env.js';
import prisma from '../database/client.js';
import { AppError } from '../utils/AppError.js';
import { contentToText, maxSimilarity } from './textSimilarity.js';

/**
 * Keyword + city landing pages, generated only when a user asks for them for a
 * site (never part of the automatic build). Each page is DRAFT until published.
 *
 * Uniqueness: every keyword+city pair gets its own angle, the city page's own
 * local facts, and the headings already used on the site to avoid. The result
 * is compared with every other page on the site (city pages, keyword pages,
 * this batch); anything above SIMILARITY_LIMIT is regenerated once and, if it
 * is still too close, rejected instead of saved.
 */

export const MAX_PAGES_PER_REQUEST = 10;
export const MAX_PAGES_PER_SITE = 200;
export const MAX_KEYWORDS_PER_REQUEST = 25;
/** Jaccard overlap of word 5-grams; a city-swapped template scores ~0.7+. */
export const SIMILARITY_LIMIT = 0.3;

const OPENAI_MODEL = 'gpt-4o';

const ANGLES = [
  'what it costs and which factors change the price (no invented dollar figures)',
  'how to choose a provider and the questions to ask before hiring',
  'warning signs and common problems that mean it is time to act',
  'seasonal timing and how local conditions in this area affect the service',
  'what to expect step by step, from first call to finished job',
  'mistakes to avoid and how to get the most value from the service',
];

export function slugify(...parts) {
  return parts
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Accepts a string (newline/comma separated) or array; trims, dedupes, validates. */
export function parseKeywords(input) {
  const raw = Array.isArray(input) ? input : String(input ?? '').split(/[\n,;]+/);
  const seen = new Set();
  const keywords = [];
  for (const item of raw) {
    const keyword = String(item ?? '').replace(/\s+/g, ' ').trim();
    if (!keyword) continue;
    if (keyword.length < 2 || keyword.length > 80) {
      throw new AppError(`Keyword "${keyword.slice(0, 40)}" must be 2-80 characters.`, 400, { code: 'INVALID_KEYWORD' });
    }
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keywords.push(keyword);
  }
  if (keywords.length === 0) {
    throw new AppError('Enter at least one keyword.', 400, { code: 'INVALID_KEYWORD' });
  }
  if (keywords.length > MAX_KEYWORDS_PER_REQUEST) {
    throw new AppError(`At most ${MAX_KEYWORDS_PER_REQUEST} keywords per request.`, 400, { code: 'TOO_MANY_KEYWORDS' });
  }
  return keywords;
}

function parseJson(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function trimWords(text, max) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  return words.length > max ? `${words.slice(0, max).join(' ')}…` : words.join(' ');
}

function headingsOf(content) {
  const c = parseJson(content);
  return [c.h1, ...(Array.isArray(c.sections) ? c.sections.map((s) => s?.heading) : [])].filter(Boolean);
}

export function buildKeywordPagePrompt({ site, city, keyword, angle, services, avoidHeadings, retryNote }) {
  const local = parseJson(city.content);
  const localFacts = [local.localIntro, local.whyLocal, local.serviceArea].filter(Boolean).map((t) => trimWords(t, 120)).join('\n');
  return [
    `Write a landing page for the search "${keyword}" in ${city.city}, ${city.county} County, ${city.state}.`,
    `Business: ${site.businessName}, a ${site.industry} business based in ${site.city}, ${site.state}.`,
    site.phone ? `Phone: ${site.phone}.` : null,
    site.description ? `About the business: ${trimWords(site.description, 80)}` : null,
    services.length ? `Services this business offers: ${services.join('; ')}.` : null,
    `Angle for THIS page (make it the backbone of the page): ${angle}.`,
    localFacts ? `Local facts about ${city.city} you may use (do not copy sentences; rephrase and build on them):\n${localFacts}` : null,
    avoidHeadings.length ? `Headings already used on this site; do not reuse or closely paraphrase them: ${avoidHeadings.slice(0, 40).join(' | ')}.` : null,
    retryNote ?? null,
    'Rules: genuinely useful, specific writing for someone searching this in this town. No keyword stuffing, no filler, no generic text that would fit any city.',
    'Never invent prices, statistics, awards, licenses, certifications, years in business, customer counts or reviews. Only use local details from the facts above or well-known public facts about the town.',
    `The business is based in ${site.city}, ${site.state}. Do not say or imply it has an office, shop or location in or near ${city.city} (no "our facility near ${city.city}"); say it is based in ${site.city} and serves ${city.city}.`,
    'Length matters: the page body (intro + sections + FAQ answers) must total at least 850 words. Each section needs three full paragraphs.',
    'Return ONLY valid JSON with this exact shape:',
    '{ "seo": { "title": "50-60 characters with the keyword and town", "metaDescription": "120-155 characters" },',
    '  "h1": "max 12 words, includes keyword and town",',
    '  "intro": "120-160 words",',
    '  "sections": [ { "heading": "max 9 words", "paragraphs": ["80-120 words", "80-120 words", "80-120 words"] }, 4 sections in total ],',
    '  "localNotes": ["3 short points tied to this town, max 30 words each"],',
    '  "faqs": [ { "question": "...", "answer": "50-80 words" }, 4 FAQs in total ],',
    '  "ctaHeading": "max 8 words", "ctaText": "30-50 words" }',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Default generator: one OpenAI JSON completion. Replaced in tests. */
export async function generateWithOpenAi(prompt) {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new AppError('OpenAI is not configured.', 503, { code: 'OPENAI_NOT_CONFIGURED' });
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.8,
    max_tokens: 3500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You are a careful local-business copywriter. Always return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
  });
  return JSON.parse(completion.choices[0]?.message?.content ?? '{}');
}

function isUsable(content) {
  return (
    content &&
    typeof content.h1 === 'string' &&
    Array.isArray(content.sections) &&
    content.sections.length >= 3 &&
    Array.isArray(content.faqs)
  );
}

/**
 * Generates DRAFT keyword pages for keyword × city pairs.
 * @returns {{ created: object[], rejected: object[], skipped: object[] }}
 */
export async function generateKeywordPages(siteId, { keywords, locationPageIds }, { generateFn = generateWithOpenAi } = {}) {
  const site = await prisma.generatedSite.findUnique({ where: { id: siteId } });
  if (!site) throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });

  const parsedKeywords = parseKeywords(keywords);
  const ids = [...new Set((Array.isArray(locationPageIds) ? locationPageIds : []).map(String))];
  if (ids.length === 0) {
    throw new AppError('Choose at least one city.', 400, { code: 'INVALID_CITIES' });
  }
  const cities = await prisma.locationPage.findMany({ where: { siteId, id: { in: ids } } });
  if (cities.length !== ids.length) {
    throw new AppError('Every city must be one of this site\'s existing city pages.', 400, { code: 'INVALID_CITIES' });
  }

  const pairs = parsedKeywords.flatMap((keyword) =>
    cities.map((city) => ({ keyword, city, slug: slugify(keyword, city.city) })),
  );
  if (pairs.length > MAX_PAGES_PER_REQUEST) {
    throw new AppError(
      `That is ${pairs.length} pages; at most ${MAX_PAGES_PER_REQUEST} can be generated per request. Use fewer keywords or cities.`,
      400,
      { code: 'TOO_MANY_PAGES' },
    );
  }

  const existing = await prisma.keywordPage.findMany({ where: { siteId } });
  if (existing.length + pairs.length > MAX_PAGES_PER_SITE) {
    throw new AppError(`This site can have at most ${MAX_PAGES_PER_SITE} keyword pages.`, 400, { code: 'SITE_KEYWORD_LIMIT' });
  }
  const existingSlugs = new Set(existing.map((p) => p.slug));
  const allCities = await prisma.locationPage.findMany({ where: { siteId } });

  // Everything a new page must not duplicate.
  const corpus = [
    ...allCities.map((c) => ({ key: `city:${c.slug}`, text: contentToText(c.content) })),
    ...existing.map((p) => ({ key: `keyword:${p.slug}`, text: contentToText(p.content) })),
  ];
  const avoidHeadings = existing.flatMap((p) => headingsOf(p.content));
  const services = (parseJson(site.servicesContent).services ?? []).map((s) => s?.title).filter(Boolean).slice(0, 10);

  const created = [];
  const rejected = [];
  const skipped = [];
  let angleIndex = existing.length;

  for (const pair of pairs) {
    if (existingSlugs.has(pair.slug)) {
      skipped.push({ keyword: pair.keyword, city: pair.city.city, slug: pair.slug, reason: 'already exists' });
      continue;
    }
    const angle = ANGLES[angleIndex % ANGLES.length];
    angleIndex += 1;

    let content = null;
    let score = { max: 0, key: null };
    let retryNote = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const prompt = buildKeywordPagePrompt({ site, city: pair.city, keyword: pair.keyword, angle, services, avoidHeadings, retryNote });
      const candidate = await generateFn(prompt);
      if (!isUsable(candidate)) {
        retryNote = 'The previous answer was missing required fields. Follow the JSON shape exactly.';
        continue;
      }
      score = maxSimilarity(contentToText(candidate), corpus);
      content = candidate;
      if (score.max <= SIMILARITY_LIMIT) break;
      retryNote = `The previous draft repeated too much wording from another page on this site (${score.key}). Write it again with different structure, examples and phrasing.`;
    }

    if (!content || score.max > SIMILARITY_LIMIT) {
      rejected.push({
        keyword: pair.keyword,
        city: pair.city.city,
        slug: pair.slug,
        reason: content ? `too similar to ${score.key} (${Math.round(score.max * 100)}% overlap)` : 'generation failed',
        maxSimilarity: content ? score.max : null,
      });
      continue;
    }

    const page = await prisma.keywordPage.create({
      data: {
        siteId,
        locationPageId: pair.city.id,
        keyword: pair.keyword,
        slug: pair.slug,
        status: 'DRAFT',
        content: JSON.stringify(content),
        maxSimilarity: score.max,
        similarTo: score.key,
      },
    });
    created.push(page);
    existingSlugs.add(pair.slug);
    corpus.push({ key: `keyword:${pair.slug}`, text: contentToText(content) });
    avoidHeadings.push(...headingsOf(content));
  }

  return { created, rejected, skipped };
}

export async function listKeywordPages(siteId) {
  return prisma.keywordPage.findMany({
    where: { siteId },
    orderBy: { createdAt: 'desc' },
    include: { locationPage: { select: { city: true, county: true, state: true, slug: true } } },
  });
}

async function getOwnedPage(siteId, id) {
  const page = await prisma.keywordPage.findFirst({ where: { id, siteId } });
  if (!page) throw new AppError('Keyword page not found.', 404, { code: 'KEYWORD_PAGE_NOT_FOUND' });
  return page;
}

export async function setKeywordPagePublished(siteId, id, published) {
  await getOwnedPage(siteId, id);
  return prisma.keywordPage.update({
    where: { id },
    data: published ? { status: 'PUBLISHED', publishedAt: new Date() } : { status: 'DRAFT', publishedAt: null },
  });
}

export async function deleteKeywordPage(siteId, id) {
  const page = await getOwnedPage(siteId, id);
  await prisma.keywordPage.delete({ where: { id } });
  return page;
}

/** Published pages for the renderer (city-page links and sitemap). */
export async function listPublishedKeywordPages(siteSlug) {
  const site = await prisma.generatedSite.findUnique({ where: { slug: siteSlug }, select: { id: true } });
  if (!site) throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });
  const pages = await prisma.keywordPage.findMany({
    where: { siteId: site.id, status: 'PUBLISHED' },
    orderBy: { publishedAt: 'asc' },
    select: { slug: true, keyword: true, locationPageId: true, publishedAt: true, content: true, locationPage: { select: { slug: true, city: true } } },
  });
  return pages.map(({ content, ...p }) => ({ ...p, title: parseJson(content).h1 ?? p.keyword }));
}

export async function getPublishedKeywordPage(siteSlug, keywordSlug) {
  const site = await prisma.generatedSite.findUnique({ where: { slug: siteSlug }, select: { id: true } });
  if (!site) throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });
  const page = await prisma.keywordPage.findFirst({
    where: { siteId: site.id, slug: keywordSlug, status: 'PUBLISHED' },
    include: { locationPage: { select: { slug: true, city: true, county: true, state: true } } },
  });
  if (!page) throw new AppError('Keyword page not found.', 404, { code: 'KEYWORD_PAGE_NOT_FOUND' });
  return { ...page, content: parseJson(page.content) };
}
