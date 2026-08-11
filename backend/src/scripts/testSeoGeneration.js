import prisma from '../database/client.js';
import { getSchemaForIndustry } from '../services/industrySchema.service.js';
import { generatePageContent } from '../services/siteGenerator.service.js';
import { FLOORS, STRUCTURE, countWords, countBlogPostWords } from '../services/contentContract.js';
import { env } from '../config/env.js';

function pass(name, ok, detail) {
  console.log(JSON.stringify({ check: name, ok, ...detail }));
  return ok;
}

function slugifyServiceTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

async function testBlogGeneration() {
  const businessData = {
    businessName: 'Peakwa Contract Test Studio',
    industry: 'Ceramic Art & Pottery Studio',
    city: 'Portland',
    state: 'OR',
    phone: '(503) 555-0100',
    email: 'test@example.com',
    description: 'Local pottery classes and ceramic workshops for beginners and artists.',
  };

  const schema = await getSchemaForIndustry(businessData.industry);
  console.info(JSON.stringify({ event: 'test_blog_start' }));

  const blog = await generatePageContent(
    businessData,
    schema.blogPageSchema,
    schema.systemPrompt,
    'blog',
  );

  const posts = Array.isArray(blog?.posts) ? blog.posts : [];
  let allOk = pass('blog_post_count', posts.length === 3, { count: posts.length });

  for (const [i, post] of posts.entries()) {
    const words = countBlogPostWords(post);
    const faqs = Array.isArray(post?.faqs) ? post.faqs : [];
    const faqWords = faqs.map((f) => countWords(f?.answer));
    const h2 = (post?.sections || []).length;
    const h3 = (post?.sections || []).reduce(
      (n, s) => n + (Array.isArray(s?.subsections) ? s.subsections.length : 0),
      0,
    );
    const links = Array.isArray(post?.internalLinks) ? post.internalLinks.length : 0;

    allOk =
      pass(`blog[${i}].words`, words >= FLOORS.blogBody, {
        words,
        minimum: FLOORS.blogBody,
        title: post?.title,
      }) && allOk;
    allOk =
      pass(`blog[${i}].faqs_count`, faqs.length >= STRUCTURE.blogFaqCount, {
        count: faqs.length,
      }) && allOk;
    allOk =
      pass(
        `blog[${i}].faq_answer_words`,
        faqWords.every((w) => w >= FLOORS.faqAnswer),
        { faqWords, minimum: FLOORS.faqAnswer },
      ) && allOk;
    allOk = pass(`blog[${i}].h2_sections`, h2 >= STRUCTURE.blogH2Count, { h2 }) && allOk;
    allOk = pass(`blog[${i}].h3_subsections`, h3 >= STRUCTURE.blogH2Count, { h3 }) && allOk;
    allOk = pass(`blog[${i}].internal_links`, links >= 3, { links }) && allOk;
  }

  return allOk;
}

async function testServiceEndpoint() {
  const site = await prisma.generatedSite.findUnique({
    where: { slug: 'ember-clay-studio-portland' },
  });
  if (!site) {
    console.warn(JSON.stringify({ event: 'service_test_skip', reason: 'site_not_found' }));
    return false;
  }

  const services = JSON.parse(site.servicesContent || '{}')?.services || [];
  const service = services[0];
  if (!service?.title) {
    console.warn(JSON.stringify({ event: 'service_test_skip', reason: 'no_services' }));
    return false;
  }

  const serviceSlug = slugifyServiceTitle(service.title);
  await prisma.servicePage.deleteMany({
    where: { siteId: site.id, serviceSlug },
  });

  const url = `http://127.0.0.1:${env.PORT || 4000}/phase4/sites/${encodeURIComponent(site.slug)}/services/${encodeURIComponent(serviceSlug)}`;
  console.info(JSON.stringify({ event: 'test_service_start', url, serviceTitle: service.title }));

  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  let allOk = pass('service_http_status', res.ok, { status: res.status });

  let page = body?.data?.content;
  if (typeof page === 'string') {
    try {
      page = JSON.parse(page);
    } catch {
      page = null;
    }
  }

  if (!page?.overview) {
    const row = await prisma.servicePage.findFirst({
      where: { siteId: site.id, serviceSlug },
    });
    if (row?.content) {
      page = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
    }
  }

  const overviewWords = countWords(page?.overview);
  const faqs = Array.isArray(page?.faqs) ? page.faqs : [];
  const faqWords = faqs.map((f) => countWords(f?.answer));

  allOk =
    pass('service.overview_words', overviewWords >= FLOORS.serviceOverview, {
      overviewWords,
      minimum: FLOORS.serviceOverview,
    }) && allOk;
  allOk =
    pass('service.faqs_count', faqs.length >= STRUCTURE.serviceFaqCount, {
      count: faqs.length,
    }) && allOk;
  allOk =
    pass(
      'service.faq_answer_words',
      faqWords.every((w) => w >= FLOORS.faqAnswer),
      { faqWords, minimum: FLOORS.faqAnswer },
    ) && allOk;

  return allOk;
}

async function main() {
  console.info(JSON.stringify({ event: 'seo_generation_test_start' }));
  const blogOk = await testBlogGeneration();
  const serviceOk = await testServiceEndpoint();
  const ok = blogOk && serviceOk;
  console.info(
    JSON.stringify({
      event: 'seo_generation_test_complete',
      blogOk,
      serviceOk,
      ok,
    }),
  );
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(
      JSON.stringify({
        event: 'seo_generation_test_fatal',
        error: e?.message ?? String(e),
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
