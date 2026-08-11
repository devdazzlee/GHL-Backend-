/**
 * Bottom-of-page SEO keyword blocks (heading + paragraphs + internal links + optional FAQs).
 */

import {
  FLOORS,
  STRUCTURE,
  TARGETS,
  SEO_EXTRA_FAQ_PAGES,
  LENGTH_CRITICAL_TEMPERATURE,
  buildSeoExtraScaffold,
  countWords,
  validateUnit,
} from './contentContract.js';
import { buildSeoRequirements } from './seoMetadata.service.js';
import { ContentUnitError, generateUnit } from './contentUnit.runner.js';

function slugifyServiceTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Build allowed internal link targets for a page (path keys relative to /{siteSlug}/).
 * Each page kind gets a distinct mix so bottoms are not identical sitewide.
 */
export function buildSeoExtraLinkTargets({
  pageKind,
  services = [],
  serviceTitle,
  locationSlug,
}) {
  const serviceLinks = (Array.isArray(services) ? services : [])
    .map((s) => {
      const title = s?.title || '';
      const slug = slugifyServiceTitle(title);
      if (!slug) return null;
      return { label: title, href: `services/${slug}` };
    })
    .filter(Boolean);

  const about = { label: 'Our story', href: 'about' };
  const servicesIndex = { label: 'All services', href: 'services' };
  const contact = { label: 'Get in touch', href: 'contact' };
  const blog = { label: 'Read the blog', href: 'blog' };
  const home = { label: 'Back to home', href: '' };

  if (pageKind === 'home') {
    return [
      ...serviceLinks.slice(0, 3),
      about,
      contact,
      blog,
    ].slice(0, 6);
  }

  if (pageKind === 'about') {
    return [
      servicesIndex,
      ...serviceLinks.slice(0, 2),
      contact,
      blog,
      home,
    ].slice(0, 6);
  }

  if (pageKind === 'services') {
    return [
      ...serviceLinks.slice(0, 4),
      about,
      contact,
      blog,
    ].slice(0, 6);
  }

  if (pageKind === 'service' && serviceTitle) {
    const self = slugifyServiceTitle(serviceTitle);
    return [
      servicesIndex,
      ...serviceLinks.filter((l) => l.href !== `services/${self}`).slice(0, 3),
      contact,
      about,
      blog,
    ].slice(0, 6);
  }

  if (pageKind === 'contact') {
    return [
      servicesIndex,
      ...serviceLinks.slice(0, 2),
      about,
      blog,
      home,
    ].slice(0, 6);
  }

  if (pageKind === 'blog') {
    return [
      servicesIndex,
      ...serviceLinks.slice(0, 2),
      about,
      contact,
      home,
    ].slice(0, 6);
  }

  if (pageKind === 'location' && locationSlug) {
    return [
      home,
      servicesIndex,
      ...serviceLinks.slice(0, 2),
      contact,
      about,
    ].slice(0, 6);
  }

  return [servicesIndex, about, contact, blog];
}

function pageKindLabel(pageKind) {
  switch (pageKind) {
    case 'home':
      return 'homepage';
    case 'about':
      return 'about page';
    case 'services':
      return 'services category page';
    case 'service':
      return 'individual service page';
    case 'contact':
      return 'contact page';
    case 'blog':
      return 'blog index page';
    case 'location':
      return 'location landing page';
    default:
      return `${pageKind} page`;
  }
}

/**
 * Generate seoExtra for a page. FAQs included for about/contact/blog/services only.
 */
export async function generateSeoExtra({
  pageKind,
  businessData,
  systemPrompt,
  linkTargets,
  subjectTitle,
  locationCity,
}) {
  const { businessName, industry, city, state } = businessData;
  const includeFaqs = SEO_EXTRA_FAQ_PAGES.includes(pageKind);
  const allowed = (linkTargets || []).map((l) => ({
    label: l.label,
    href: String(l.href || '').replace(/^\/+|\/+$/g, ''),
  }));

  const subjectBits = [];
  if (pageKind === 'service' && subjectTitle) {
    subjectBits.push(`Focus keywords on "${subjectTitle}" in ${city}.`);
  }
  if (pageKind === 'services') {
    subjectBits.push(
      `This is the services CATEGORY page — target "${industry} in ${city}" and related category keywords.`,
    );
  }
  if (pageKind === 'location' && locationCity) {
    subjectBits.push(`Target local keywords for ${locationCity}, ${state}.`);
  }

  const writerPrompt =
    systemPrompt ||
    'You write keyword-optimized local SEO copy. Word counts are HARD REQUIREMENTS. Natural tone. No buzzwords.';

  const bodyUnit = await generateUnit({
    unitId: 'seoExtra',
    systemPrompt: writerPrompt,
    userPrompt: [
      `Write a bottom-of-page SEO content block for the ${pageKindLabel(pageKind)} of ${businessName}, a ${industry} business in ${city}, ${state}.`,
      ...subjectBits,
      buildSeoRequirements({ businessName, industry, city, state }),
      buildSeoExtraScaffold({ includeFaqs: false }),
      'Allowed internal link targets (pick at least 3; use these href values EXACTLY):',
      JSON.stringify(allowed),
      'Prefer service-specific links when listed. Do not always pick the same about/services/contact trio — vary by this page.',
      'Return ONLY JSON (NO faqs):',
      '{ "heading": "...", "paragraphs": ["par1", "par2", "par3"], "links": [ { "label": "...", "href": "..." } ] }',
      `Each paragraph HARD MINIMUM ${FLOORS.seoExtraParagraph} words — aim for ${TARGETS.seoExtraParagraph.max}+ words each.`,
      'Do not repeat the hero verbatim. Add unique keyword-rich value and clear internal navigation.',
    ].join('\n'),
    maxTokens: 3000,
    temperature: LENGTH_CRITICAL_TEMPERATURE,
    normalize: (raw) => {
      let paragraphs = Array.isArray(raw?.paragraphs)
        ? raw.paragraphs.map((p) => String(p || '').trim()).filter(Boolean)
        : [];
      const longEnough = paragraphs.filter(
        (p) => countWords(p) >= FLOORS.seoExtraParagraph,
      );
      if (longEnough.length >= STRUCTURE.seoExtraParagraphCount) {
        paragraphs = longEnough.slice(0, 3);
      }

      const allowedHrefs = new Set(allowed.map((a) => a.href));
      const links = (Array.isArray(raw?.links) ? raw.links : [])
        .map((l) => ({
          label: String(l?.label || '').trim(),
          href: String(l?.href || '')
            .trim()
            .replace(/^\/+|\/+$/g, ''),
        }))
        .filter((l) => l.label && allowedHrefs.has(l.href));

      for (const a of allowed) {
        if (links.length >= STRUCTURE.seoExtraLinkCount) break;
        if (!links.some((l) => l.href === a.href)) {
          links.push({ label: a.label, href: a.href });
        }
      }

      return {
        heading: String(raw?.heading || '').trim() || `${industry} in ${city}`,
        paragraphs,
        links: links.slice(0, 8),
      };
    },
  });

  const seoExtra = {
    heading: bodyUnit.heading,
    paragraphs: bodyUnit.paragraphs,
    links: bodyUnit.links,
  };

  if (includeFaqs) {
    try {
      const faqsUnit = await generateUnit({
        unitId: 'seoExtra.faqs',
        systemPrompt: writerPrompt,
        userPrompt: [
          `Write exactly ${STRUCTURE.seoExtraFaqCount} FAQs for the ${pageKindLabel(pageKind)} of ${businessName}, a ${industry} business in ${city}, ${state}.`,
          ...subjectBits,
          buildSeoRequirements({ businessName, industry, city, state }),
          'LENGTH RULES FOR EACH ANSWER (VERY IMPORTANT):',
          `Every answer MUST be at least ${TARGETS.faqAnswer.min} words (HARD MINIMUM ${FLOORS.faqAnswer}). Target ${TARGETS.faqAnswer.min}-${TARGETS.faqAnswer.max}.`,
          'Write each answer as TWO short paragraphs joined by a space covering the direct answer plus local/service detail.',
          `Return ONLY JSON: { "faqs": [ { "question": "...", "answer": "...", "answerWordCount": ${TARGETS.faqAnswer.min} }, ... exactly ${STRUCTURE.seoExtraFaqCount} items ] }`,
        ].join('\n'),
        maxTokens: 3000,
        temperature: LENGTH_CRITICAL_TEMPERATURE,
        normalize: (raw) => ({
          faqs: (Array.isArray(raw?.faqs) ? raw.faqs : [])
            .map((f) => ({
              question: String(f?.question || '').trim(),
              answer: String(f?.answer || '').trim(),
            }))
            .filter((f) => f.question && f.answer),
        }),
      });
      seoExtra.faqs = faqsUnit.faqs;
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: 'seo_extra_faqs_soft_fail',
          pageKind,
          businessName,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  return seoExtra;
}

/**
 * Attach seoExtra to composed page content.
 * NEVER throws — a thin/failed seoExtra must not abort site generation.
 * Regenerates when shell JSON already has a thin seoExtra from the page schema.
 */
export async function attachSeoExtra(pageKind, content, businessData, systemPrompt, options = {}) {
  const existing = content?.seoExtra;
  const existingOk =
    existing &&
    validateUnit('seoExtra', existing).ok &&
    (!SEO_EXTRA_FAQ_PAGES.includes(pageKind) ||
      validateUnit('seoExtra.faqs', { faqs: existing.faqs }).ok);

  if (!options.force && existingOk) {
    return content;
  }

  const linkTargets =
    options.linkTargets ||
    buildSeoExtraLinkTargets({
      pageKind,
      services: options.services || content?.services || [],
      serviceTitle: options.subjectTitle,
      locationSlug: options.locationSlug,
    });

  try {
    const seoExtra = await generateSeoExtra({
      pageKind,
      businessData,
      systemPrompt,
      linkTargets,
      subjectTitle: options.subjectTitle,
      locationCity: options.locationCity,
    });
    return { ...content, seoExtra };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      JSON.stringify({
        event: 'seo_extra_attach_soft_fail',
        pageKind,
        businessName: businessData?.businessName,
        error: message,
        code: error instanceof ContentUnitError ? error.code : undefined,
        keptExisting: Boolean(existing?.heading),
      }),
    );
    // Keep whatever we have; omit only if nothing usable. Site gen continues.
    if (existing?.heading && Array.isArray(existing.paragraphs) && existing.paragraphs.length > 0) {
      return content;
    }
    const { seoExtra: _drop, ...rest } = content || {};
    return rest;
  }
}
