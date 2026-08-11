/**
 * Attach bottom-of-page seoExtra blocks to an existing site without regenerating
 * the full page bodies. Clears ServicePage cache so detail pages regenerate with
 * seoExtra on warm. Updates location page JSON in place.
 *
 * Usage: node src/scripts/backfillSeoExtra.js [siteSlug]
 * Default slug: ember-clay-studio-portland
 */
import prisma from '../database/client.js';
import { getSchemaForIndustry } from '../services/industrySchema.service.js';
import {
  attachSeoExtra,
  buildSeoExtraLinkTargets,
} from '../services/seoExtra.service.js';
import { revalidateSiteFrontendCache } from '../services/siteRevalidation.service.js';
import { env } from '../config/env.js';

function slugifyServiceTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function parseJson(raw, fallback = {}) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function apiBaseUrl() {
  const port = env.PORT || 4000;
  return `http://127.0.0.1:${port}`;
}

async function warmServicePages(site, services) {
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

  const servicesContent = parseJson(site.servicesContent, {});
  const services = Array.isArray(servicesContent.services) ? servicesContent.services : [];

  const pageJobs = [
    {
      field: 'homeContent',
      pageKind: 'home',
      raw: site.homeContent,
      options: { force: true, services },
    },
    {
      field: 'aboutContent',
      pageKind: 'about',
      raw: site.aboutContent,
      options: { force: true },
    },
    {
      field: 'servicesContent',
      pageKind: 'services',
      raw: site.servicesContent,
      options: {
        force: true,
        services,
        linkTargets: buildSeoExtraLinkTargets({ pageKind: 'services', services }),
      },
    },
    {
      field: 'contactContent',
      pageKind: 'contact',
      raw: site.contactContent,
      options: { force: true },
    },
    {
      field: 'blogContent',
      pageKind: 'blog',
      raw: site.blogContent,
      options: { force: true },
    },
  ];

  const updates = {};
  for (const job of pageJobs) {
    const content = parseJson(job.raw, {});
    const withExtra = await attachSeoExtra(
      job.pageKind,
      content,
      businessData,
      schema.systemPrompt,
      job.options,
    );
    updates[job.field] = JSON.stringify(withExtra);
    await prisma.generatedSite.update({
      where: { id: site.id },
      data: { [job.field]: updates[job.field] },
    });
    console.info(
      JSON.stringify({
        event: 'seo_extra_attached',
        slug: site.slug,
        page: job.pageKind,
        heading: withExtra.seoExtra?.heading,
        paragraphs: withExtra.seoExtra?.paragraphs?.length || 0,
        links: withExtra.seoExtra?.links?.length || 0,
        faqs: withExtra.seoExtra?.faqs?.length || 0,
      }),
    );
  }
  const deleted = await prisma.servicePage.deleteMany({ where: { siteId: site.id } });
  console.info(
    JSON.stringify({
      event: 'service_pages_cleared',
      slug: site.slug,
      count: deleted.count,
    }),
  );

  const locationPages = await prisma.locationPage.findMany({ where: { siteId: site.id } });
  for (const page of locationPages) {
    const content = parseJson(page.content, {});
    const withExtra = await attachSeoExtra(
      'location',
      content,
      businessData,
      schema.systemPrompt,
      {
        force: true,
        locationCity: page.city,
        locationSlug: page.slug,
        linkTargets: buildSeoExtraLinkTargets({
          pageKind: 'location',
          locationSlug: page.slug,
          services,
        }),
      },
    );
    await prisma.locationPage.update({
      where: { id: page.id },
      data: { content: JSON.stringify(withExtra) },
    });
    console.info(
      JSON.stringify({
        event: 'seo_extra_attached_location',
        slug: site.slug,
        location: page.slug,
        heading: withExtra.seoExtra?.heading,
      }),
    );
  }

  await warmServicePages(site, services);
  await revalidateSiteFrontendCache(site.slug);

  console.info(JSON.stringify({ event: 'seo_extra_backfill_complete', slug: site.slug }));
}

async function main() {
  const targetSlug = process.argv[2]?.trim() || 'ember-clay-studio-portland';
  const site = await prisma.generatedSite.findUnique({ where: { slug: targetSlug } });
  if (!site) {
    throw new Error(`Site not found: ${targetSlug}`);
  }
  await backfillSite(site);
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        event: 'seo_extra_backfill_error',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
