/**
 * One-off migration that regenerates the SEO-optimized page content for existing
 * generated sites using the updated prompts and schema word limits.
 *
 * It regenerates the home, about, services, contact and blog content, then
 * derives the home "Our Services" section from the authoritative services list
 * (keeping slugs aligned with the dedicated service pages). It intentionally
 * PRESERVES each site's theme (colors, fonts), slug, and business details — only
 * the textual page content is refreshed.
 *
 * Stale ServicePage cache rows are cleared so dedicated service pages regenerate
 * with the new SEO content on first visit.
 *
 * Usage: node src/scripts/backfillContent.js [siteSlug]
 *   - no argument: processes every generated site
 *   - a slug: processes just that site
 */
import prisma from '../database/client.js';
import { getSchemaForIndustry } from '../services/industrySchema.service.js';
import {
  generatePageContent,
  syncHomeServicesWithServices,
} from '../services/siteGenerator.service.js';
import { revalidateSiteFrontendCache } from '../services/siteRevalidation.service.js';
import { env } from '../config/env.js';

function slugifyServiceTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function apiBaseUrl() {
  const port = env.PORT || 4000;
  return `http://127.0.0.1:${port}`;
}

async function warmServicePages(site, servicesResult) {
  const services = Array.isArray(servicesResult?.services) ? servicesResult.services : [];
  const base = apiBaseUrl();

  for (const service of services) {
    const serviceSlug = slugifyServiceTitle(service?.title);
    if (!serviceSlug) continue;
    const url = `${base}/phase4/sites/${encodeURIComponent(site.slug)}/services/${encodeURIComponent(serviceSlug)}`;
    try {
      const res = await fetch(url);
      console.info(
        JSON.stringify({
          event: 'warm_service_page',
          slug: site.slug,
          serviceSlug,
          status: res.status,
          ok: res.ok,
        }),
      );
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: 'warm_service_page_failed',
          slug: site.slug,
          serviceSlug,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}

async function backfillSite(site) {
  const businessData = {
    businessName: site.businessName,
    industry: site.industry,
    city: site.city,
    state: site.state,
    phone: site.phone,
    email: site.email,
    description: site.description,
  };

  const schema = await getSchemaForIndustry(site.industry);

  // Generate pages sequentially so a truncated JSON response on one page
  // does not abort the entire site, and OpenAI load stays predictable.
  const homeResult = await generatePageContent(
    businessData,
    schema.homePageSchema,
    schema.systemPrompt,
    'home',
  );
  const aboutResult = await generatePageContent(
    businessData,
    schema.aboutPageSchema,
    schema.systemPrompt,
    'about',
  );
  const servicesResult = await generatePageContent(
    businessData,
    schema.servicesPageSchema,
    schema.systemPrompt,
    'services',
  );
  const contactResult = await generatePageContent(
    businessData,
    schema.contactPageSchema,
    schema.systemPrompt,
    'contact',
  );
  const blogResult = await generatePageContent(
    businessData,
    schema.blogPageSchema,
    schema.systemPrompt,
    'blog',
  );

  const syncedHome = syncHomeServicesWithServices(homeResult, servicesResult);

  await prisma.$transaction([
    prisma.servicePage.deleteMany({ where: { siteId: site.id } }),
    prisma.generatedSite.update({
      where: { id: site.id },
      data: {
        homeContent: JSON.stringify(syncedHome),
        aboutContent: JSON.stringify(aboutResult),
        servicesContent: JSON.stringify(servicesResult),
        contactContent: JSON.stringify(contactResult),
        blogContent: JSON.stringify(blogResult),
      },
    }),
  ]);

  const services = servicesResult.services ?? [];
  console.info(
    JSON.stringify({
      event: 'backfill_content_done',
      slug: site.slug,
      serviceCount: services.length,
      aboutWords: countWords(aboutResult?.story?.paragraph1),
      firstServiceWords: countWords(services[0]?.fullDescription),
      blogPostWords: countWords(
        [
          blogResult?.posts?.[0]?.introduction,
          ...(blogResult?.posts?.[0]?.sections ?? []).flatMap((s) => [
            ...(s?.paragraphs ?? []),
            ...((s?.subsections ?? []).flatMap((sub) => sub?.paragraphs ?? [])),
          ]),
          blogResult?.posts?.[0]?.conclusion,
        ]
          .filter(Boolean)
          .join(' '),
      ),
    }),
  );

  await warmServicePages(site, servicesResult);
  await revalidateSiteFrontendCache(site.slug);
}

function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function main() {
  const targetSlug = process.argv[2]?.trim();

  const sites = await prisma.generatedSite.findMany({
    where: targetSlug ? { slug: targetSlug } : undefined,
    orderBy: { createdAt: 'asc' },
  });

  if (sites.length === 0) {
    console.warn(
      JSON.stringify({ event: 'backfill_content_no_sites', targetSlug: targetSlug ?? null }),
    );
    return;
  }

  console.info(JSON.stringify({ event: 'backfill_content_start', total: sites.length }));

  let succeeded = 0;
  let failed = 0;

  // Sequential across sites to stay well within OpenAI rate limits; the five
  // pages per site are generated in parallel inside backfillSite.
  for (const site of sites) {
    try {
      await backfillSite(site);
      succeeded += 1;
    } catch (error) {
      failed += 1;
      console.error(
        JSON.stringify({
          event: 'backfill_content_failed',
          slug: site.slug,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  console.info(
    JSON.stringify({ event: 'backfill_content_complete', total: sites.length, succeeded, failed }),
  );
}

main()
  .catch((e) => {
    console.error(
      JSON.stringify({ event: 'backfill_content_fatal', error: e?.message ?? String(e) }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
