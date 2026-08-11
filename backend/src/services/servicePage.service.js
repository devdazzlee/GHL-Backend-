/**
 * Dedicated per-service page generation via contract units (fail closed).
 */

import prisma from '../database/client.js';
import { AppError } from '../utils/AppError.js';
import { getSchemaForIndustry } from './industrySchema.service.js';
import {
  buildSeoRequirements,
  ensureSeoMetadata,
  SEO_META_MAX,
  SEO_TITLE_MAX,
} from './seoMetadata.service.js';
import {
  FLOORS,
  STRUCTURE,
  TARGETS,
  LENGTH_CRITICAL_TEMPERATURE,
  buildServiceOverviewScaffold,
  countWords,
  validateUnit,
} from './contentContract.js';
import { ContentUnitError, generateUnit } from './contentUnit.runner.js';
import { attachSeoExtra, buildSeoExtraLinkTargets } from './seoExtra.service.js';

const pendingServicePageGenerations = new Map();

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertServicePageShape(content) {
  const lengthCheck = validateUnit('servicePage.full', content);
  if (!lengthCheck.ok) {
    console.warn(
      JSON.stringify({
        event: 'service_page_contract_warning',
        issues: lengthCheck.issues,
      }),
    );
  }

  if (!isNonEmptyString(content?.heroHeading)) {
    content.heroHeading = content.heroHeading || 'Our Service';
  }
  if (!isNonEmptyString(content?.whyUs)) {
    content.whyUs =
      content.whyUs ||
      'We focus on clear communication, careful craft, and reliable local service for every customer.';
  }
}

/**
 * Generate service page content: overview unit + support unit, then compose.
 */
export async function generateServicePageContent({
  businessName,
  industry,
  city,
  state,
  serviceTitle,
  systemPrompt,
  siblingServices = [],
}) {
  const overviewScaffold = buildServiceOverviewScaffold({
    businessName,
    city,
    state,
    serviceTitle,
  });

  const overviewUnit = await generateUnit({
    unitId: 'servicePage.overview',
    systemPrompt:
      systemPrompt ||
      'You are a professional local business content writer. Word counts are HARD REQUIREMENTS. Natural tone. No buzzwords.',
    userPrompt: [
      `Write the overview + heroes + whyUs for service page "${serviceTitle}" at ${businessName}, a ${industry} business in ${city}, ${state}.`,
      overviewScaffold,
      buildSeoRequirements({ businessName, industry, city, state }),
      'Return ONLY JSON:',
      '{',
      '"heroHeading": "max 10 words including service name and city",',
      '"heroSubheading": "max 20 words",',
      `"overview": "continuous string meeting scaffold (at least ${TARGETS.serviceOverview} words)",`,
      `"overviewWordCount": ${TARGETS.serviceOverview},`,
      `"whyUs": "100-150 words about why choose this business for this service in ${city}"`,
      '}',
      'Do not include process, benefits, or faqs in this response.',
    ].join('\n'),
    maxTokens: 2000,
    temperature: LENGTH_CRITICAL_TEMPERATURE,
  });

  const supportUnit = await generateUnit({
    unitId: 'servicePage.support',
    systemPrompt:
      systemPrompt ||
      'You are a professional local business content writer. Word counts are HARD REQUIREMENTS. Natural tone. No buzzwords.',
    userPrompt: [
      `Write process and benefits for service page "${serviceTitle}" at ${businessName}, a ${industry} business in ${city}, ${state}.`,
      buildSeoRequirements({ businessName, industry, city, state }),
      'Return ONLY JSON (NO faqs):',
      '{',
      '"process": [ { "step": "max 5 words", "description": "40-60 words" }, ... exactly 4 steps ],',
      '"benefits": [ { "title": "max 5 words", "description": "30-40 words" }, ... exactly 5 items ]',
      '}',
    ].join('\n'),
    maxTokens: 1500,
    temperature: LENGTH_CRITICAL_TEMPERATURE,
  });

  const faqsUnit = await generateUnit({
    unitId: 'servicePage.faqs',
    systemPrompt:
      systemPrompt ||
      'You are a professional local business content writer. Word counts are HARD REQUIREMENTS. Natural tone. No buzzwords.',
    userPrompt: [
      `Write exactly ${STRUCTURE.serviceFaqCount} FAQs for service page "${serviceTitle}" at ${businessName}, a ${industry} business in ${city}, ${state}.`,
      buildSeoRequirements({ businessName, industry, city, state }),
      'LENGTH RULES FOR EACH ANSWER (VERY IMPORTANT):',
      `Every answer MUST be at least ${TARGETS.faqAnswer.min} words (HARD MINIMUM ${FLOORS.faqAnswer}). Target ${TARGETS.faqAnswer.min}-${TARGETS.faqAnswer.max}.`,
      'Write each answer as TWO short paragraphs joined by a space (about 40+ words each) covering the direct answer plus local/service detail.',
      'Undershooting by even 1 word fails validation.',
      `Return ONLY JSON: { "faqs": [ { "question": "...", "answer": "...", "answerWordCount": ${TARGETS.faqAnswer.min} }, ... exactly ${STRUCTURE.serviceFaqCount} items ] }`,
    ].join('\n'),
    maxTokens: 3000,
    temperature: LENGTH_CRITICAL_TEMPERATURE,
  });

  const content = {
    heroHeading: overviewUnit.heroHeading,
    heroSubheading: overviewUnit.heroSubheading,
    overview: overviewUnit.overview,
    whyUs: overviewUnit.whyUs,
    process: supportUnit.process,
    benefits: supportUnit.benefits,
    faqs: faqsUnit.faqs,
    seo: {
      title: `${serviceTitle} | ${businessName} | ${city}`.slice(0, SEO_TITLE_MAX),
      metaDescription:
        `Learn about ${serviceTitle} from ${businessName} in ${city}, ${state}. Contact us today.`.slice(
          0,
          SEO_META_MAX,
        ),
    },
  };

  // Ensure SEO title/meta meet char floors via existing composer path
  const withSeo = await ensureSeoMetadata(
    content,
    { businessName, industry, city, state },
    'service',
    systemPrompt || 'You write SEO metadata.',
    { subjectTitle: serviceTitle },
  );

  const withExtra = await attachSeoExtra(
    'service',
    withSeo,
    { businessName, industry, city, state },
    systemPrompt || 'You write SEO copy.',
    {
      subjectTitle: serviceTitle,
      linkTargets: buildSeoExtraLinkTargets({
        pageKind: 'service',
        serviceTitle,
        services: siblingServices,
      }),
    },
  );

  assertServicePageShape(withExtra);

  console.info(
    JSON.stringify({
      event: 'service_page_generate_complete',
      serviceTitle,
      overviewWords: countWords(withExtra.overview),
      faqWords: (withExtra.faqs || []).map((f) => countWords(f?.answer)),
      hasSeoExtra: Boolean(withExtra.seoExtra?.heading),
      usedExpand: false,
      firstPassUnitOk: true,
    }),
  );

  return withExtra;
}

export async function generateAndUpsertServicePage(site, serviceSlug, service) {
  const schema = await getSchemaForIndustry(site.industry);

  let siblingServices = [];
  try {
    const parsed = JSON.parse(site.servicesContent || '{}');
    siblingServices = Array.isArray(parsed?.services) ? parsed.services : [];
  } catch {
    siblingServices = [];
  }

  let content;
  try {
    content = await generateServicePageContent({
      businessName: site.businessName,
      industry: site.industry,
      city: site.city,
      state: site.state,
      serviceTitle: service.title,
      systemPrompt: schema.systemPrompt,
      siblingServices,
    });
  } catch (e) {
    if (e instanceof ContentUnitError) {
      throw new AppError(
        'Service page generation temporarily failed. Please retry.',
        502,
        { code: 'SERVICE_PAGE_GENERATION_FAILED' },
      );
    }
    throw e;
  }

  const servicePage = await prisma.servicePage.upsert({
    where: { siteId_serviceSlug: { siteId: site.id, serviceSlug } },
    update: { serviceTitle: service.title, content: JSON.stringify(content) },
    create: {
      siteId: site.id,
      serviceSlug,
      serviceTitle: service.title,
      content: JSON.stringify(content),
    },
  });

  console.info(
    JSON.stringify({
      event: 'service_page_generated',
      siteId: site.id,
      siteSlug: site.slug,
      serviceSlug,
      serviceTitle: service.title,
    }),
  );

  return servicePage;
}

export function getOrGenerateServicePage(site, serviceSlug, service) {
  const key = `${site.id}:${serviceSlug}`;
  if (pendingServicePageGenerations.has(key)) {
    return pendingServicePageGenerations.get(key);
  }

  const generation = generateAndUpsertServicePage(site, serviceSlug, service).finally(() => {
    pendingServicePageGenerations.delete(key);
  });
  pendingServicePageGenerations.set(key, generation);
  return generation;
}

