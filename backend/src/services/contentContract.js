/**
 * Single source of truth for SEO content length + structure (client SLA).
 * Prompts, validators, and seeds MUST import from here — no duplicate floors.
 */

export const LENGTH_CRITICAL_TEMPERATURE = 0.4;

export const LENGTH_PRIORITY_PREAMBLE = [
  'LENGTH RULES (VERY IMPORTANT — HARD REQUIREMENTS, NOT SUGGESTIONS):',
  'Every stated word count is a hard minimum. Undershooting by even 1 word is a failed response.',
  'Do not compress long fields to finish short ones — finish long fields first at full length.',
  'Meet length with concrete local details, process specifics, and useful examples — not filler or buzzwords.',
  'Include the self-check integer fields requested so you plan length before writing.',
].join(' ');

/** Client accept floors (SLA). Prompt targets are derived with a small buffer. */
export const FLOORS = Object.freeze({
  homeAboutParagraph: 180,
  aboutStoryParagraph: 200,
  aboutTeamDescription: 140,
  servicesIntro: 300,
  contactIntro: 300,
  serviceFullDescription: 250,
  serviceOverview: 300,
  faqAnswer: 60,
  blogBody: 1000,
  blogIntro: 160,
  blogH2Paragraph: 230,
  blogH3Paragraph: 110,
  blogConclusion: 130,
  locationLocalIntro: 200,
  locationWhyLocal: 150,
  locationServiceArea: 100,
  seoExtraParagraph: 80,
});

/** Prompt targets (buffer above floors so first-pass clears accept). */
export const TARGETS = Object.freeze({
  homeAboutParagraph: { min: 180, max: 220 },
  aboutStoryParagraph: { min: 200, max: 250 },
  aboutTeamDescription: { min: 140, max: 180 },
  servicesIntro: 320,
  contactIntro: 320,
  serviceFullDescription: { min: 250, max: 300 },
  serviceOverview: 320,
  faqAnswer: { min: 70, max: 90 },
  blogBody: 1100,
  blogIntro: { min: 160, max: 180 },
  blogH2Paragraph: { min: 230, max: 260 },
  blogH3Paragraph: { min: 110, max: 130 },
  blogConclusion: { min: 130, max: 150 },
  locationLocalIntro: { min: 200, max: 250 },
  locationWhyLocal: { min: 150, max: 200 },
  locationServiceArea: { min: 100, max: 150 },
  seoExtraParagraph: { min: 100, max: 140 },
});

export const STRUCTURE = Object.freeze({
  blogH2Count: 4,
  blogFaqCount: 5,
  serviceFaqCount: 5,
  serviceCatalogMin: 6,
  serviceCatalogMax: 8,
  seoExtraParagraphCount: 2,
  seoExtraParagraphPrefer: 3,
  seoExtraLinkCount: 3,
  seoExtraFaqCount: 3,
});

/** Page kinds that must include FAQs inside seoExtra (others already have page FAQs). */
export const SEO_EXTRA_FAQ_PAGES = Object.freeze([
  'about',
  'contact',
  'blog',
  'services',
]);

export function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function countBlogPostWords(post) {
  let total = countWords(post?.introduction) + countWords(post?.conclusion);
  for (const section of post?.sections || []) {
    for (const p of section?.paragraphs || []) total += countWords(p);
    for (const sub of section?.subsections || []) {
      for (const p of sub?.paragraphs || []) total += countWords(p);
    }
  }
  return total;
}

export function buildParagraphScaffold(spec) {
  const { fieldName, totalMinWords, paragraphs } = spec;
  const lines = paragraphs.map(
    (p, i) =>
      `  Paragraph ${i + 1} (${p.label}, at least ${p.minWords} words): ${p.purpose}`,
  );
  const sumMins = paragraphs.reduce((n, p) => n + p.minWords, 0);
  return [
    `Write "${fieldName}" as ONE continuous string made of these paragraphs joined by spaces (no labels in the output text):`,
    ...lines,
    `Combined "${fieldName}" MUST total at least ${totalMinWords} words (scaffold floors sum to ~${sumMins}+).`,
  ].join('\n');
}

function introScaffold(fieldName, totalMinWords, businessName, city, state) {
  return buildParagraphScaffold({
    fieldName,
    totalMinWords,
    paragraphs: [
      { label: 'scope', minWords: 70, purpose: 'What is covered and who it is for.' },
      { label: 'benefits', minWords: 70, purpose: 'Key benefits and outcomes for customers.' },
      {
        label: 'whyUs',
        minWords: 70,
        purpose: `Why choose ${businessName} specifically.`,
      },
      {
        label: 'local',
        minWords: 70,
        purpose: `Local relevance for ${city}, ${state} and nearby areas.`,
      },
      { label: 'cta', minWords: 50, purpose: 'Clear call to action.' },
    ],
  });
}

export function buildServicesIntroScaffold({ businessName, city, state }) {
  return introScaffold('intro', TARGETS.servicesIntro, businessName, city, state);
}

export function buildContactIntroScaffold({ businessName, city, state }) {
  return introScaffold('intro', TARGETS.contactIntro, businessName, city, state);
}

export function buildServiceOverviewScaffold({ businessName, city, state, serviceTitle }) {
  return buildParagraphScaffold({
    fieldName: 'overview',
    totalMinWords: TARGETS.serviceOverview,
    paragraphs: [
      {
        label: 'what',
        minWords: 70,
        purpose: `Explain what ${serviceTitle} is and what customers receive.`,
      },
      {
        label: 'benefits',
        minWords: 70,
        purpose: 'Cover key benefits and outcomes for the customer.',
      },
      {
        label: 'whyUs',
        minWords: 70,
        purpose: `Why choose ${businessName} for this service specifically.`,
      },
      {
        label: 'local',
        minWords: 70,
        purpose: `Local relevance for customers in ${city}, ${state} and nearby areas.`,
      },
      {
        label: 'cta',
        minWords: 50,
        purpose: 'Clear call to action to inquire, book, or contact.',
      },
    ],
  });
}

export function buildBlogBodyScaffold() {
  const i = TARGETS.blogIntro;
  const h2 = TARGETS.blogH2Paragraph;
  const h3 = TARGETS.blogH3Paragraph;
  const c = TARGETS.blogConclusion;
  return [
    'BODY LENGTH RULES (VERY IMPORTANT):',
    `introduction: at least ${FLOORS.blogIntro} words (target ${i.min}-${i.max}).`,
    `Exactly ${STRUCTURE.blogH2Count} H2 sections; each H2 paragraphs array must contain one paragraph of at least ${FLOORS.blogH2Paragraph} words (target ${h2.min}-${h2.max}).`,
    `Each H2 must include at least one H3 subsection; each H3 paragraph at least ${FLOORS.blogH3Paragraph} words (target ${h3.min}-${h3.max}).`,
    `conclusion: at least ${FLOORS.blogConclusion} words (target ${c.min}-${c.max}).`,
    `Introduction + all H2/H3 paragraphs + conclusion MUST total at least ${TARGETS.blogBody} words (hard accept minimum ${FLOORS.blogBody}). Prefer longer paragraphs — do not stop early.`,
    'Do not include faqs in this response — faqs are generated in a separate step.',
  ].join(' ');
}

/** Schema annotation strings for seeds — always derived from TARGETS/FLOORS. */
export function schemaRange(key) {
  const t = TARGETS[key];
  const floor = FLOORS[key];
  if (t && typeof t === 'object' && 'min' in t) {
    return `${t.min}-${t.max} words (HARD MINIMUM ${floor})`;
  }
  if (typeof t === 'number') {
    return `at least ${t} words (HARD MINIMUM ${floor})`;
  }
  return `at least ${floor} words (HARD MINIMUM ${floor})`;
}

export function schemaIntroScaffoldText(kind) {
  const total = kind === 'contact' ? TARGETS.contactIntro : TARGETS.servicesIntro;
  const floor = kind === 'contact' ? FLOORS.contactIntro : FLOORS.servicesIntro;
  return `Write as ONE continuous string of 5 paragraphs joined by spaces totaling at least ${total} words (HARD MINIMUM ${floor}): (1) scope 70+ words, (2) benefits 70+ words, (3) why choose this business 70+ words, (4) local city/area 70+ words, (5) clear CTA 50+ words — keyword optimized for local SEO`;
}

/**
 * Validate a content unit against contract floors.
 * @returns {{ ok: boolean, issues: Array<{ field: string, words: number, minimum: number }> }}
 */
export function validateUnit(unitId, content) {
  const issues = [];

  const push = (field, words, minimum) => {
    if (words < minimum) issues.push({ field, words, minimum });
  };

  switch (unitId) {
    case 'home.about': {
      push('about.paragraph1', countWords(content?.paragraph1), FLOORS.homeAboutParagraph);
      push('about.paragraph2', countWords(content?.paragraph2), FLOORS.homeAboutParagraph);
      break;
    }
    case 'about.story': {
      push('story.paragraph1', countWords(content?.paragraph1), FLOORS.aboutStoryParagraph);
      push('story.paragraph2', countWords(content?.paragraph2), FLOORS.aboutStoryParagraph);
      break;
    }
    case 'about.team': {
      push('team.description', countWords(content?.description), FLOORS.aboutTeamDescription);
      break;
    }
    case 'services.intro':
    case 'contact.intro': {
      const floor = unitId === 'contact.intro' ? FLOORS.contactIntro : FLOORS.servicesIntro;
      push('intro', countWords(content?.intro ?? content?.text), floor);
      break;
    }
    case 'services.fullDescription': {
      push(
        'fullDescription',
        countWords(content?.fullDescription),
        FLOORS.serviceFullDescription,
      );
      break;
    }
    case 'blog.body': {
      const words = countBlogPostWords(content);
      push('blog.body', words, FLOORS.blogBody);
      const sections = content?.sections || [];
      if (sections.length < STRUCTURE.blogH2Count) {
        issues.push({
          field: 'sections.length',
          words: sections.length,
          minimum: STRUCTURE.blogH2Count,
        });
      }
      break;
    }
    case 'blog.faqs':
    case 'servicePage.faqs': {
      const faqs = Array.isArray(content?.faqs) ? content.faqs : [];
      const need =
        unitId === 'blog.faqs' ? STRUCTURE.blogFaqCount : STRUCTURE.serviceFaqCount;
      if (faqs.length < need) {
        issues.push({ field: 'faqs.length', words: faqs.length, minimum: need });
      }
      faqs.forEach((f, i) => {
        push(`faqs[${i}].answer`, countWords(f?.answer), FLOORS.faqAnswer);
      });
      break;
    }
    case 'servicePage.support': {
      if (!Array.isArray(content?.process) || content.process.length === 0) {
        issues.push({ field: 'process', words: 0, minimum: 1 });
      }
      if (!Array.isArray(content?.benefits) || content.benefits.length === 0) {
        issues.push({ field: 'benefits', words: 0, minimum: 1 });
      }
      break;
    }
    case 'servicePage.overview': {
      push('overview', countWords(content?.overview), FLOORS.serviceOverview);
      break;
    }
    case 'servicePage.full': {
      push('overview', countWords(content?.overview), FLOORS.serviceOverview);
      const faqs = Array.isArray(content?.faqs) ? content.faqs : [];
      if (faqs.length < STRUCTURE.serviceFaqCount) {
        issues.push({
          field: 'faqs.length',
          words: faqs.length,
          minimum: STRUCTURE.serviceFaqCount,
        });
      }
      faqs.forEach((f, i) => {
        push(`faqs[${i}].answer`, countWords(f?.answer), FLOORS.faqAnswer);
      });
      break;
    }
    case 'location.fields': {
      push('localIntro', countWords(content?.localIntro), FLOORS.locationLocalIntro);
      push('whyLocal', countWords(content?.whyLocal), FLOORS.locationWhyLocal);
      push('serviceArea', countWords(content?.serviceArea), FLOORS.locationServiceArea);
      break;
    }
    case 'seoExtra.faqs': {
      const faqs = Array.isArray(content?.faqs) ? content.faqs : [];
      if (faqs.length < STRUCTURE.seoExtraFaqCount) {
        issues.push({
          field: 'faqs.length',
          words: faqs.length,
          minimum: STRUCTURE.seoExtraFaqCount,
        });
      }
      faqs.forEach((f, i) => {
        push(`faqs[${i}].answer`, countWords(f?.answer), FLOORS.faqAnswer);
      });
      break;
    }
    case 'seoExtra': {
      push('heading', countWords(content?.heading), 3);
      const paragraphs = Array.isArray(content?.paragraphs) ? content.paragraphs : [];
      const longEnough = paragraphs.filter(
        (p) => countWords(p) >= FLOORS.seoExtraParagraph,
      );
      if (longEnough.length < STRUCTURE.seoExtraParagraphCount) {
        issues.push({
          field: 'paragraphs.meetingFloor',
          words: longEnough.length,
          minimum: STRUCTURE.seoExtraParagraphCount,
        });
        paragraphs.forEach((p, i) => {
          push(`paragraphs[${i}]`, countWords(p), FLOORS.seoExtraParagraph);
        });
      }
      const links = Array.isArray(content?.links) ? content.links : [];
      if (links.length < STRUCTURE.seoExtraLinkCount) {
        issues.push({
          field: 'links.length',
          words: links.length,
          minimum: STRUCTURE.seoExtraLinkCount,
        });
      }
      links.forEach((link, i) => {
        if (!link?.label || !String(link.label).trim()) {
          issues.push({ field: `links[${i}].label`, words: 0, minimum: 1 });
        }
        if (typeof link?.href !== 'string') {
          issues.push({ field: `links[${i}].href`, words: 0, minimum: 1 });
        }
      });
      break;
    }
    default:
      issues.push({ field: `unknown_unit:${unitId}`, words: 0, minimum: 1 });
  }

  return { ok: issues.length === 0, issues };
}

/** Page-level length rules for composed pages (post-compose gate). */
export function validatePageLength(pageType, content) {
  const issues = [];
  const push = (field, words, minimum) => {
    if (words > 0 && words < minimum) issues.push({ field, words, minimum });
  };

  if (pageType === 'home') {
    push('about.paragraph1', countWords(content?.about?.paragraph1), FLOORS.homeAboutParagraph);
    push('about.paragraph2', countWords(content?.about?.paragraph2), FLOORS.homeAboutParagraph);
  } else if (pageType === 'about') {
    push('story.paragraph1', countWords(content?.story?.paragraph1), FLOORS.aboutStoryParagraph);
    push('story.paragraph2', countWords(content?.story?.paragraph2), FLOORS.aboutStoryParagraph);
    push('team.description', countWords(content?.team?.description), FLOORS.aboutTeamDescription);
  } else if (pageType === 'services') {
    push('intro', countWords(content?.intro), FLOORS.servicesIntro);
  } else if (pageType === 'contact') {
    push('intro', countWords(content?.intro), FLOORS.contactIntro);
  } else if (pageType === 'location') {
    push('localIntro', countWords(content?.localIntro), FLOORS.locationLocalIntro);
    push('whyLocal', countWords(content?.whyLocal), FLOORS.locationWhyLocal);
    push('serviceArea', countWords(content?.serviceArea), FLOORS.locationServiceArea);
  } else if (pageType === 'blog' && Array.isArray(content?.posts)) {
    content.posts.forEach((post, index) => {
      const words = countBlogPostWords(post);
      push(`posts[${index}].body`, words, FLOORS.blogBody);
      const faqs = Array.isArray(post?.faqs) ? post.faqs : [];
      if (faqs.length < STRUCTURE.blogFaqCount) {
        issues.push({
          field: `posts[${index}].faqs.length`,
          words: faqs.length,
          minimum: STRUCTURE.blogFaqCount,
        });
      }
      faqs.forEach((f, fi) => {
        push(`posts[${index}].faqs[${fi}].answer`, countWords(f?.answer), FLOORS.faqAnswer);
      });
    });
  }

  // Soft-check seoExtra when present (generation attaches it before finalize).
  if (content?.seoExtra) {
    const { issues: seoIssues } = validateUnit('seoExtra', content.seoExtra);
    for (const issue of seoIssues) {
      issues.push({ ...issue, field: `seoExtra.${issue.field}` });
    }
    if (SEO_EXTRA_FAQ_PAGES.includes(pageType)) {
      const { issues: faqIssues } = validateUnit('seoExtra.faqs', {
        faqs: content.seoExtra.faqs,
      });
      for (const issue of faqIssues) {
        issues.push({ ...issue, field: `seoExtra.${issue.field}` });
      }
    }
  }

  return issues;
}

/**
 * Prompt scaffold for bottom-of-page SEO keyword blocks.
 */
export function buildSeoExtraScaffold({ includeFaqs }) {
  const p = TARGETS.seoExtraParagraph;
  const lines = [
    `heading: keyword-optimized H2 (include industry + city when natural).`,
    `paragraphs: write EXACTLY 3 strings; EACH must be at least ${p.min} words (HARD MINIMUM ${FLOORS.seoExtraParagraph}, prefer ${p.max}+).`,
    `Cover local keywords, what customers get, and why this page matters — not a repeat of the hero.`,
    `Count words carefully before finishing each paragraph — undershooting fails validation.`,
    `links: at least ${STRUCTURE.seoExtraLinkCount} internal links as { "label": "...", "href": "/slug/..." } using ONLY the allowed hrefs provided.`,
    'Never invent external URLs. href values must start with / and match an allowed target.',
  ];
  if (includeFaqs) {
    lines.push(
      `faqs: exactly ${STRUCTURE.seoExtraFaqCount} items; each answer MUST be at least ${TARGETS.faqAnswer.min} words (HARD MINIMUM ${FLOORS.faqAnswer}, target ${TARGETS.faqAnswer.min}-${TARGETS.faqAnswer.max}). Write each answer as two sentences with local detail.`,
    );
  } else {
    lines.push('Do NOT include a faqs field — this page already has FAQs elsewhere.');
  }
  return lines.join(' ');
}
