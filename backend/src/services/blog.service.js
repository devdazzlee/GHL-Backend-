import OpenAI from 'openai';
import { env } from '../config/env.js';
import prisma from '../database/client.js';
import { AppError } from '../utils/AppError.js';
import { countMarkdownWords, markdownToPlainText, slugifyTitle, structuredPostToMarkdown } from './blogMarkdown.js';
import { fetchPexelsImageByQuery } from './pexels.service.js';
import { revalidateSiteFrontendCache } from './siteRevalidation.service.js';
import { maxSimilarity } from './textSimilarity.js';

/**
 * Per-site blog: the posts generated with the site are copied into BlogPost
 * the first time the blog is managed (dashboard or first automatic post);
 * from then on the table is the only source. Automatic posts only ever
 * create new rows, one per (site, local date) slot, so a scheduled run can
 * never overwrite a post someone edited.
 */

export const MIN_POST_WORDS = 1000;
/** Word 5-gram overlap with any earlier post on the site. */
export const BODY_SIMILARITY_LIMIT = 0.3;
/** Content-word overlap between two titles that counts as the same topic. */
export const TITLE_SIMILARITY_LIMIT = 0.5;
export const DEFAULT_AUTO_DAYS = [1, 4];
export const DEFAULT_AUTO_HOUR = 9;
export const DEFAULT_TIMEZONE = 'America/New_York';
const MAX_POSTS_WRITTEN_PER_RUN = 2;
const MAX_FAILURES_PER_SLOT = 3;
const OPENAI_MODEL = 'gpt-4o';
const STATUSES = ['DRAFT', 'PUBLISHED'];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseJson(raw, fallback) {
  if (!raw) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function notFound(message = 'Blog post not found.') {
  return new AppError(message, 404, { code: 'BLOG_POST_NOT_FOUND' });
}

function readTime(body) {
  return `${Math.max(1, Math.round(countMarkdownWords(body) / 225))} min read`;
}

// ---- Schedule ----

export function isValidTimezone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return typeof timeZone === 'string' && timeZone.length > 0;
  } catch {
    return false;
  }
}

/** Local date (YYYY-MM-DD), weekday (0=Sun) and hour for `now` in `timeZone`. */
export function localParts(now, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAY_NAMES.indexOf(parts.weekday),
    hour: Number(parts.hour),
  };
}

function parseDays(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',');
  return [...new Set(list.map((d) => Number.parseInt(String(d).trim(), 10)).filter((d) => d >= 0 && d <= 6))].sort();
}

export function settingsFromSite(site) {
  const days = parseDays(site.blogAutoDays);
  return {
    blogEnabled: site.blogEnabled !== false,
    autoEnabled: site.blogAutoEnabled === true,
    days: days.length ? days : DEFAULT_AUTO_DAYS,
    hour: Number.isInteger(site.blogAutoHour) ? site.blogAutoHour : DEFAULT_AUTO_HOUR,
    timezone: isValidTimezone(site.blogTimezone) ? site.blogTimezone : DEFAULT_TIMEZONE,
  };
}

/** The next slot an automatic post will be written for, or null when automatic posts are off. */
export function nextAutoSlot(settings, now, usedSlots = new Set()) {
  if (!settings.blogEnabled || !settings.autoEnabled) return null;
  for (let offset = 0; offset <= 7; offset += 1) {
    const local = localParts(new Date(now.getTime() + offset * 86_400_000), settings.timezone);
    if (!settings.days.includes(local.weekday) || usedSlots.has(local.date)) continue;
    return { date: local.date, hour: settings.hour, timezone: settings.timezone, dueNow: offset === 0 && local.hour >= settings.hour };
  }
  return null;
}

/** Validates dashboard input; returns GeneratedSite update data. */
export function buildBlogSettingsUpdate(input) {
  const data = {};
  if (input.blogEnabled !== undefined) data.blogEnabled = Boolean(input.blogEnabled);
  if (input.autoEnabled !== undefined) data.blogAutoEnabled = Boolean(input.autoEnabled);
  if (input.days !== undefined) {
    const days = parseDays(input.days);
    if (days.length < 2 || days.length > 3) {
      throw new AppError('Choose 2 or 3 days a week for automatic posts.', 400, { code: 'INVALID_BLOG_DAYS' });
    }
    data.blogAutoDays = days.join(',');
  }
  if (input.hour !== undefined) {
    const hour = Number(input.hour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      throw new AppError('Hour must be 0-23.', 400, { code: 'INVALID_BLOG_HOUR' });
    }
    data.blogAutoHour = hour;
  }
  if (input.timezone !== undefined) {
    if (!isValidTimezone(input.timezone)) {
      throw new AppError('Unknown time zone.', 400, { code: 'INVALID_TIMEZONE' });
    }
    data.blogTimezone = input.timezone;
  }
  if (Object.keys(data).length === 0) {
    throw new AppError('No blog settings to update.', 400, { code: 'INVALID_BODY' });
  }
  return data;
}

async function findSiteOrThrow(siteId) {
  const site = await prisma.generatedSite.findUnique({ where: { id: siteId } });
  if (!site) throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });
  return site;
}

export async function getBlogSettings(siteId, now = new Date()) {
  const site = await findSiteOrThrow(siteId);
  const settings = settingsFromSite(site);
  const used = await prisma.blogPost.findMany({ where: { siteId, autoSlot: { not: null } }, select: { autoSlot: true } });
  return { ...settings, nextSlot: nextAutoSlot(settings, now, new Set(used.map((p) => p.autoSlot))) };
}

export async function updateBlogSettings(siteId, input) {
  const site = await findSiteOrThrow(siteId);
  const data = buildBlogSettingsUpdate(input ?? {});
  // Turning automatic posts on stores the schedule shown in the dashboard.
  if (data.blogAutoEnabled) {
    const current = settingsFromSite(site);
    data.blogAutoDays ??= current.days.join(',');
    data.blogAutoHour ??= current.hour;
    data.blogTimezone ??= current.timezone;
  }
  if (data.blogAutoEnabled || data.blogEnabled !== undefined) await importLegacyPosts(siteId);
  await prisma.generatedSite.update({ where: { id: siteId }, data });
  if (data.blogEnabled !== undefined) await revalidateSiteFrontendCache(site.slug);
  return getBlogSettings(siteId);
}

// ---- Import of the posts generated with the site ----

async function uniqueSlug(siteId, title, taken) {
  const base = slugifyTitle(title);
  const existing = new Set(
    (await prisma.blogPost.findMany({ where: { siteId, slug: { startsWith: base } }, select: { slug: true } })).map((p) => p.slug),
  );
  for (const s of taken ?? []) existing.add(s);
  if (!existing.has(base)) return base;
  for (let n = 2; ; n += 1) {
    if (!existing.has(`${base}-${n}`)) return `${base}-${n}`;
  }
}

async function defaultCoverImage(site, title) {
  try {
    return await fetchPexelsImageByQuery(`${title} ${site.industry}`.slice(0, 80));
  } catch {
    return null;
  }
}

/**
 * Copies the site's original posts into BlogPost once (no-op when the site already has rows).
 * Old /blog/{n} URLs keep working through legacyIndex.
 */
export async function importLegacyPosts(siteId, { coverImageFn = defaultCoverImage } = {}) {
  if ((await prisma.blogPost.count({ where: { siteId } })) > 0) return { imported: 0 };
  const site = await findSiteOrThrow(siteId);
  const posts = parseJson(site.blogContent, {}).posts ?? [];
  const taken = [];
  const rows = [];
  for (const [index, post] of posts.entries()) {
    if (!post?.title) continue;
    const slug = await uniqueSlug(siteId, post.title, taken);
    taken.push(slug);
    rows.push({
      siteId,
      slug,
      title: post.title,
      topic: post.title,
      excerpt: post.excerpt ?? null,
      body: structuredPostToMarkdown(post),
      faqs: JSON.stringify(Array.isArray(post.faqs) ? post.faqs : []),
      links: JSON.stringify(Array.isArray(post.internalLinks) ? post.internalLinks : []),
      // Stored once here, so the picture no longer changes from day to day.
      imageUrl: post.coverImageUrl || (await coverImageFn(site, post.title)) || null,
      category: post.category ?? null,
      seoTitle: post.seo?.title ?? null,
      seoDescription: post.seo?.metaDescription ?? null,
      status: 'PUBLISHED',
      source: 'IMPORTED',
      legacyIndex: index,
      publishedAt: site.createdAt ?? new Date(),
    });
  }
  try {
    await prisma.$transaction(rows.map((data) => prisma.blogPost.create({ data })));
  } catch (error) {
    // Another request imported at the same moment.
    if (error?.code === 'P2002') return { imported: 0 };
    throw error;
  }
  return { imported: rows.length };
}

// ---- Dashboard ----

function adminView(post) {
  return {
    ...post,
    faqs: parseJson(post.faqs, []),
    links: parseJson(post.links, []),
    wordCount: countMarkdownWords(post.body),
  };
}

export async function listBlogPosts(siteId) {
  await findSiteOrThrow(siteId);
  const posts = await prisma.blogPost.findMany({
    where: { siteId, deletedAt: null },
    orderBy: [{ publishedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
  });
  return posts.map(adminView);
}

function cleanText(value, { field, max, required = false }) {
  const text = String(value ?? '').trim();
  if (required && !text) throw new AppError(`${field} is required.`, 400, { code: 'INVALID_BLOG_POST' });
  if (text.length > max) throw new AppError(`${field} is too long (max ${max} characters).`, 400, { code: 'INVALID_BLOG_POST' });
  return text || null;
}

function cleanImageUrl(value) {
  const url = String(value ?? '').trim();
  if (!url) return null;
  if (!/^https:\/\/\S+$/i.test(url) || url.length > 2000) {
    throw new AppError('Image must be an https:// URL.', 400, { code: 'INVALID_BLOG_POST' });
  }
  return url;
}

function cleanFaqs(value) {
  if (!Array.isArray(value)) throw new AppError('FAQs must be a list.', 400, { code: 'INVALID_BLOG_POST' });
  return JSON.stringify(
    value
      .map((f) => ({ question: String(f?.question ?? '').trim(), answer: String(f?.answer ?? '').trim() }))
      .filter((f) => f.question && f.answer)
      .slice(0, 20),
  );
}

function buildPostUpdate(input) {
  const data = {};
  if (input.title !== undefined) data.title = cleanText(input.title, { field: 'Title', max: 200, required: true });
  if (input.excerpt !== undefined) data.excerpt = cleanText(input.excerpt, { field: 'Excerpt', max: 1000 });
  if (input.body !== undefined) data.body = cleanText(input.body, { field: 'Body', max: 100_000 }) ?? '';
  if (input.imageUrl !== undefined) data.imageUrl = cleanImageUrl(input.imageUrl);
  if (input.category !== undefined) data.category = cleanText(input.category, { field: 'Category', max: 40 });
  if (input.seoTitle !== undefined) data.seoTitle = cleanText(input.seoTitle, { field: 'SEO title', max: 120 });
  if (input.seoDescription !== undefined) data.seoDescription = cleanText(input.seoDescription, { field: 'Meta description', max: 300 });
  if (input.faqs !== undefined) data.faqs = cleanFaqs(input.faqs);
  if (input.status !== undefined) {
    if (!STATUSES.includes(input.status)) throw new AppError('Status must be DRAFT or PUBLISHED.', 400, { code: 'INVALID_BLOG_POST' });
    data.status = input.status;
  }
  return data;
}

export async function createBlogPost(siteId, input) {
  const site = await findSiteOrThrow(siteId);
  await importLegacyPosts(siteId);
  const data = buildPostUpdate({ status: 'DRAFT', body: '', ...input });
  if (!data.title) throw new AppError('Title is required.', 400, { code: 'INVALID_BLOG_POST' });
  const post = await prisma.blogPost.create({
    data: {
      ...data,
      siteId,
      topic: data.title,
      slug: await uniqueSlug(siteId, data.title),
      source: 'MANUAL',
      editedAt: new Date(),
      publishedAt: data.status === 'PUBLISHED' ? new Date() : null,
    },
  });
  if (post.status === 'PUBLISHED') await revalidateSiteFrontendCache(site.slug);
  return adminView(post);
}

/** The URL (slug) never changes on edit, so links to a post keep working. */
export async function updateBlogPost(siteId, postId, input) {
  const site = await findSiteOrThrow(siteId);
  const existing = await prisma.blogPost.findFirst({ where: { id: postId, siteId, deletedAt: null } });
  if (!existing || existing.status === 'GENERATING') throw notFound();
  const data = buildPostUpdate(input ?? {});
  if (Object.keys(data).length === 0) throw new AppError('Nothing to update.', 400, { code: 'INVALID_BODY' });
  if (data.status === 'PUBLISHED' && !existing.publishedAt) data.publishedAt = new Date();
  const post = await prisma.blogPost.update({ where: { id: postId }, data: { ...data, editedAt: new Date() } });
  await revalidateSiteFrontendCache(site.slug);
  return adminView(post);
}

/** Soft delete: the post disappears everywhere, but its topic is never written again. */
export async function deleteBlogPost(siteId, postId) {
  const site = await findSiteOrThrow(siteId);
  const existing = await prisma.blogPost.findFirst({ where: { id: postId, siteId, deletedAt: null } });
  if (!existing || existing.status === 'GENERATING') throw notFound();
  await prisma.blogPost.update({ where: { id: postId }, data: { deletedAt: new Date(), status: 'DRAFT' } });
  await revalidateSiteFrontendCache(site.slug);
  return { id: postId, deleted: true };
}

// ---- Renderer (published posts only) ----

/**
 * managed=false: the site has never been managed; the renderer keeps showing
 * the posts stored in GeneratedSite.blogContent.
 */
export async function getPublicBlog(siteSlug) {
  const site = await prisma.generatedSite.findUnique({ where: { slug: siteSlug }, select: { id: true, blogEnabled: true } });
  if (!site) throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });
  const enabled = site.blogEnabled !== false;
  const managed = (await prisma.blogPost.count({ where: { siteId: site.id } })) > 0;
  if (!enabled || !managed) return { enabled, managed, posts: [] };
  const posts = await prisma.blogPost.findMany({
    where: { siteId: site.id, status: 'PUBLISHED', deletedAt: null },
    orderBy: { publishedAt: 'desc' },
  });
  return {
    enabled,
    managed,
    posts: posts.map((p) => ({
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      imageUrl: p.imageUrl,
      category: p.category,
      readTime: readTime(p.body),
      publishedAt: p.publishedAt,
      updatedAt: p.editedAt ?? p.publishedAt,
      legacyIndex: p.legacyIndex,
    })),
  };
}

export async function getPublicBlogPost(siteSlug, postSlug) {
  const blog = await getPublicBlog(siteSlug);
  if (!blog.enabled || !blog.managed) throw notFound();
  const site = await prisma.generatedSite.findUnique({ where: { slug: siteSlug }, select: { id: true } });
  const post = await prisma.blogPost.findFirst({
    where: { siteId: site.id, slug: postSlug, status: 'PUBLISHED', deletedAt: null },
  });
  if (!post) throw notFound();
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    body: post.body,
    faqs: parseJson(post.faqs, []),
    links: parseJson(post.links, []),
    imageUrl: post.imageUrl,
    category: post.category,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    readTime: readTime(post.body),
    publishedAt: post.publishedAt,
    updatedAt: post.editedAt ?? post.publishedAt,
    related: blog.posts.filter((p) => p.slug !== post.slug).slice(0, 3).map((p) => ({ slug: p.slug, title: p.title })),
  };
}

// ---- Automatic posts ----

const STOPWORDS = new Set(
  'a an and are as at be best by can do does for from get guide how i in into is it its of on or our tips top the to vs what when where which who why will with you your'.split(' '),
);

function stem(word) {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function topicWords(title, ignore) {
  return new Set(
    String(title ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !STOPWORDS.has(w) && !ignore.has(w))
      .map(stem),
  );
}

/** Overlap of the meaningful words of two titles (business and city names ignored). */
export function titleSimilarity(a, b, ignoreWords = []) {
  const ignore = new Set(ignoreWords.flatMap((w) => String(w).toLowerCase().split(/\W+/)).filter(Boolean));
  const x = topicWords(a, ignore);
  const y = topicWords(b, ignore);
  if (x.size === 0 || y.size === 0) return 0;
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / (x.size + y.size - shared);
}

export function pickNewTopics(candidates, historyTitles, ignoreWords) {
  const accepted = [];
  for (const topic of candidates) {
    if (!topic?.title) continue;
    const clash = [...historyTitles, ...accepted.map((t) => t.title)].some(
      (title) => titleSimilarity(topic.title, title, ignoreWords) >= TITLE_SIMILARITY_LIMIT,
    );
    if (!clash) accepted.push(topic);
  }
  return accepted;
}

async function openAiJson(prompt, { maxTokens = 1500, temperature = 0.9 } = {}) {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new AppError('OpenAI is not configured.', 503, { code: 'OPENAI_NOT_CONFIGURED' });
  const completion = await new OpenAI({ apiKey }).chat.completions.create({
    model: OPENAI_MODEL,
    temperature,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You plan useful blog content for local businesses. Always return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
  });
  return JSON.parse(completion.choices[0]?.message?.content ?? '{}');
}

async function defaultSuggestTopics(site, historyTitles, context) {
  const prompt = [
    `Suggest 8 new blog post topics for ${site.businessName}, a ${site.industry} business in ${site.city}, ${site.state}.`,
    context.services.length ? `Services: ${context.services.join('; ')}.` : null,
    context.cities.length ? `Areas served: ${context.cities.join(', ')}.` : null,
    historyTitles.length
      ? `The blog has already covered these topics. Every new topic must be about something clearly different (not a rewording, not the same question from another angle):\n- ${historyTitles.slice(0, 150).join('\n- ')}`
      : null,
    'Topics must be genuinely useful to local customers (questions they ask, decisions they face, seasonal or local concerns). No invented statistics, prices or events.',
    'Return ONLY JSON: { "topics": [ { "title": "max 12 words", "excerpt": "40-60 words", "category": "one word" } ] }',
  ]
    .filter(Boolean)
    .join('\n');
  const result = await openAiJson(prompt);
  return Array.isArray(result.topics) ? result.topics : [];
}

async function defaultWritePost(site, topic) {
  const [{ generateBlogPost }, { getSchemaForIndustry }] = await Promise.all([
    import('./siteGenerator.service.js'),
    import('./industrySchema.service.js'),
  ]);
  const schema = await getSchemaForIndustry(site.industry);
  return generateBlogPost(site, topic, schema.systemPrompt, 0);
}

const failures = new Map();
let autoRunInProgress = false;

function internalLinks(post) {
  const links = Array.isArray(post?.internalLinks) ? post.internalLinks : [];
  return links.filter((l) => l?.label && l?.path).slice(0, 5);
}

/**
 * Writes and publishes one automatic post for `site` if its schedule is due
 * at `now` and no post exists for today's slot. Never touches existing posts.
 */
export async function runAutoPostForSite(site, now = new Date(), deps = {}) {
  const { suggestTopicsFn = defaultSuggestTopics, writePostFn = defaultWritePost, revalidateFn = revalidateSiteFrontendCache } = deps;
  const settings = settingsFromSite(site);
  if (!settings.blogEnabled || !settings.autoEnabled) return { status: 'off' };
  const local = localParts(now, settings.timezone);
  if (!settings.days.includes(local.weekday) || local.hour < settings.hour) return { status: 'not_due' };

  const slotKey = `${site.id}:${local.date}`;
  if ((failures.get(slotKey) ?? 0) >= MAX_FAILURES_PER_SLOT) return { status: 'gave_up', slot: local.date };
  if (await prisma.blogPost.findFirst({ where: { siteId: site.id, autoSlot: local.date }, select: { id: true } })) {
    return { status: 'already_done', slot: local.date };
  }

  await importLegacyPosts(site.id);

  // Claim the slot first: the unique (siteId, autoSlot) makes a second process or tick skip it.
  let claim;
  try {
    claim = await prisma.blogPost.create({
      data: { siteId: site.id, slug: `writing-${local.date}`, title: 'Writing…', body: '', status: 'GENERATING', source: 'AUTO', autoSlot: local.date },
    });
  } catch (error) {
    if (error?.code === 'P2002') return { status: 'already_done', slot: local.date };
    throw error;
  }

  try {
    const history = await prisma.blogPost.findMany({ where: { siteId: site.id, id: { not: claim.id } }, select: { slug: true, title: true, topic: true, body: true } });
    const cities = (await prisma.locationPage.findMany({ where: { siteId: site.id }, select: { city: true } })).map((c) => c.city);
    const services = (parseJson(site.servicesContent, {}).services ?? []).map((s) => s?.title).filter(Boolean).slice(0, 12);
    const ignoreWords = [site.businessName, site.city, site.state, ...cities];
    // Current titles and original topics: a retitled post still blocks its topic.
    const historyTitles = [...new Set(history.flatMap((p) => [p.title, p.topic]).filter(Boolean))];

    const candidates = await suggestTopicsFn(site, historyTitles, { services, cities });
    const topics = pickNewTopics(candidates, historyTitles, ignoreWords);
    if (topics.length === 0) throw new Error('every suggested topic repeats an earlier post');

    const corpus = history.map((p) => ({ key: p.slug, text: markdownToPlainText(p.body) }));
    let written = null;
    const reasons = [];
    for (const topic of topics.slice(0, MAX_POSTS_WRITTEN_PER_RUN)) {
      const post = await writePostFn(site, topic);
      const body = structuredPostToMarkdown(post);
      const words = countMarkdownWords(body);
      const overlap = maxSimilarity(markdownToPlainText(body), corpus);
      if (words < MIN_POST_WORDS) {
        reasons.push(`"${topic.title}": ${words} words`);
        continue;
      }
      if (overlap.max > BODY_SIMILARITY_LIMIT) {
        reasons.push(`"${topic.title}": ${Math.round(overlap.max * 100)}% overlap with ${overlap.key}`);
        continue;
      }
      written = { topic, post, body };
      break;
    }
    if (!written) throw new Error(`no acceptable post (${reasons.join('; ')})`);

    const { topic, post, body } = written;
    const title = topic.title;
    const published = await prisma.blogPost.update({
      where: { id: claim.id },
      data: {
        slug: await uniqueSlug(site.id, title),
        title,
        topic: title,
        excerpt: post.excerpt || topic.excerpt || null,
        body,
        faqs: JSON.stringify(Array.isArray(post.faqs) ? post.faqs : []),
        links: JSON.stringify(internalLinks(post)),
        imageUrl: post.coverImageUrl || null,
        category: post.category || topic.category || null,
        seoTitle: post.seo?.title ?? null,
        seoDescription: post.seo?.metaDescription ?? null,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    failures.delete(slotKey);
    await revalidateFn(site.slug);
    console.info(JSON.stringify({ event: 'blog_auto_post_published', siteId: site.id, slot: local.date, slug: published.slug }));
    return { status: 'published', slot: local.date, post: published };
  } catch (error) {
    // Release the slot so a later tick can retry (at most MAX_FAILURES_PER_SLOT times per process).
    await prisma.blogPost.delete({ where: { id: claim.id } }).catch(() => {});
    failures.set(slotKey, (failures.get(slotKey) ?? 0) + 1);
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: 'blog_auto_post_failed', siteId: site.id, slot: local.date, error: message }));
    return { status: 'failed', slot: local.date, error: message };
  }
}

/** One scheduler tick: every site with automatic posts on. Ticks never overlap. */
export async function runDueAutoPosts(now = new Date(), deps = {}) {
  if (autoRunInProgress) return [];
  autoRunInProgress = true;
  try {
    const sites = await prisma.generatedSite.findMany({
      where: { blogAutoEnabled: true, OR: [{ blogEnabled: null }, { blogEnabled: true }] },
    });
    const results = [];
    for (const site of sites) {
      results.push({ siteId: site.id, ...(await runAutoPostForSite(site, now, deps)) });
    }
    return results;
  } finally {
    autoRunInProgress = false;
  }
}

/** Tests only. */
export function resetAutoPostState() {
  failures.clear();
  autoRunInProgress = false;
}
