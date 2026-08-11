/**
 * Finish SEO backfill leftovers for one site:
 * - Expand blog posts still under 1000 words
 * - Warm any missing ServicePage rows
 *
 * Usage: node src/scripts/finishSeoBackfill.js [siteSlug]
 */
import prisma from '../database/client.js';
import { getSchemaForIndustry } from '../services/industrySchema.service.js';
import { generatePageContent } from '../services/siteGenerator.service.js';
import { revalidateSiteFrontendCache } from '../services/siteRevalidation.service.js';
import { env } from '../config/env.js';

function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countBlogPostWords(post) {
  if (!post || typeof post !== 'object') return 0;
  let total = countWords(post.introduction) + countWords(post.conclusion);
  if (Array.isArray(post.sections)) {
    for (const section of post.sections) {
      for (const paragraph of section?.paragraphs ?? []) total += countWords(paragraph);
      for (const subsection of section?.subsections ?? []) {
        for (const paragraph of subsection?.paragraphs ?? []) total += countWords(paragraph);
      }
    }
  }
  return total;
}

function slugifyServiceTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function apiBaseUrl() {
  return `http://127.0.0.1:${env.PORT || 4000}`;
}

async function refreshBlogIfNeeded(site) {
  const blog = JSON.parse(site.blogContent || '{}');
  const posts = Array.isArray(blog.posts) ? blog.posts : [];
  const short = posts.filter((p) => countBlogPostWords(p) > 0 && countBlogPostWords(p) < 1000);
  if (short.length === 0) {
    console.info(JSON.stringify({ event: 'blog_already_meets_minimum', slug: site.slug }));
    return;
  }

  console.info(
    JSON.stringify({
      event: 'blog_refresh_start',
      slug: site.slug,
      shortPosts: short.map((p) => ({ title: p.title, words: countBlogPostWords(p) })),
    }),
  );

  const schema = await getSchemaForIndustry(site.industry);
  const businessData = {
    businessName: site.businessName,
    industry: site.industry,
    city: site.city,
    state: site.state,
    phone: site.phone,
    email: site.email,
    description: site.description,
  };

  const blogResult = await generatePageContent(
    businessData,
    schema.blogPageSchema,
    schema.systemPrompt,
    'blog',
  );

  await prisma.generatedSite.update({
    where: { id: site.id },
    data: { blogContent: JSON.stringify(blogResult) },
  });

  console.info(
    JSON.stringify({
      event: 'blog_refresh_done',
      slug: site.slug,
      posts: (blogResult.posts || []).map((p, i) => ({
        i,
        title: p?.title,
        words: countBlogPostWords(p),
      })),
    }),
  );
}

async function warmMissingServices(site) {
  const services = JSON.parse(site.servicesContent || '{}')?.services ?? [];
  const existing = await prisma.servicePage.findMany({
    where: { siteId: site.id },
    select: { serviceSlug: true },
  });
  const have = new Set(existing.map((r) => r.serviceSlug));
  const base = apiBaseUrl();
  let ok = 0;
  let failed = 0;

  for (const service of services) {
    const serviceSlug = slugifyServiceTitle(service?.title);
    if (!serviceSlug || have.has(serviceSlug)) continue;
    const url = `${base}/phase4/sites/${encodeURIComponent(site.slug)}/services/${encodeURIComponent(serviceSlug)}`;
    try {
      const res = await fetch(url);
      if (res.ok) ok += 1;
      else failed += 1;
      console.info(
        JSON.stringify({
          event: 'warm_missing_service',
          slug: site.slug,
          serviceSlug,
          status: res.status,
          ok: res.ok,
        }),
      );
    } catch (error) {
      failed += 1;
      console.warn(
        JSON.stringify({
          event: 'warm_missing_service_failed',
          slug: site.slug,
          serviceSlug,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  return { ok, failed };
}

async function main() {
  const targetSlug = process.argv[2]?.trim() || 'ember-clay-studio-portland';
  const site = await prisma.generatedSite.findUnique({ where: { slug: targetSlug } });
  if (!site) {
    console.warn(JSON.stringify({ event: 'site_not_found', slug: targetSlug }));
    return;
  }

  await refreshBlogIfNeeded(site);
  const refreshed = await prisma.generatedSite.findUnique({ where: { id: site.id } });
  const warm = await warmMissingServices(refreshed);
  await revalidateSiteFrontendCache(site.slug);

  const cacheCount = await prisma.servicePage.count({ where: { siteId: site.id } });
  console.info(
    JSON.stringify({
      event: 'finish_seo_backfill_complete',
      slug: site.slug,
      warm,
      servicePageCache: cacheCount,
    }),
  );
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ event: 'finish_seo_backfill_fatal', error: e?.message ?? String(e) }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
