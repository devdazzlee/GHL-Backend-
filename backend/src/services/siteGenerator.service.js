import OpenAI from 'openai';
import { env } from '../config/env.js';
import prisma from '../database/client.js';
import { AppError } from '../utils/AppError.js';
import { getSchemaForIndustry } from './industrySchema.service.js';
import { buildSeoRequirements, ensureSeoMetadata } from './seoMetadata.service.js';
import { pickDesignVariant } from './designVariant.service.js';
import {
  FLOORS,
  STRUCTURE,
  TARGETS,
  LENGTH_CRITICAL_TEMPERATURE,
  LENGTH_PRIORITY_PREAMBLE,
  buildBlogBodyScaffold,
  buildServicesIntroScaffold,
  buildContactIntroScaffold,
  validatePageLength,
  scrubGeneratedContent,
} from './contentContract.js';
import { ContentUnitError, generateUnit, mapPool } from './contentUnit.runner.js';
import { attachSeoExtra } from './seoExtra.service.js';

const DEFAULT_THEME = {
  primaryColor: '#1F2937',
  secondaryColor: '#F3F4F6',
  accentColor: '#6366F1',
  heroStyle: 'dark',
  fontStyle: 'modern',
};

const HERO_STYLES = new Set(['dark', 'light']);
const FONT_STYLES = new Set(['modern', 'classic', 'friendly']);

// gpt-4o-mini compresses long JSON fields and misses SEO word targets; gpt-4o
// reliably produces the 150–250 word paragraphs the schemas require.
const OPENAI_CONTENT_MODEL = 'gpt-4o';
const OPENAI_THEME_MODEL = 'gpt-4o-mini';

// Per-page completion budgets (output tokens). Sized for the SEO-optimized
// content lengths defined in the industry schemas, with headroom so responses
// are never truncated before the closing JSON brace.
const MAX_TOKENS_BY_PAGE = {
  home: 4500,
  about: 4500,
  services: 8000,
  contact: 4500,
  blog: 12000,
  location: 3500,
};

function normalizeHexColor(value) {
  const v = String(value ?? '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v.toUpperCase();
  if (/^[0-9A-Fa-f]{6}$/.test(v)) return `#${v.toUpperCase()}`;
  return null;
}

function buildThemeUserPrompt(businessName, industry, city) {
  return `Generate a professional color theme for ${businessName}, a ${industry} business in ${city}.
Return ONLY valid JSON with exactly these fields:

{
"primaryColor": "hex color that represents this industry professionally",
"secondaryColor": "lighter complementary hex color for backgrounds and sections",
"accentColor": "contrasting hex color for CTA buttons and highlights",
"heroStyle": "dark or light depending on which looks better with primaryColor",
"fontStyle": "modern or classic or friendly based on industry personality"
}

Color guidelines per industry type:
HVAC heating cooling: blues and navy tones
Automotive car dealer: bold reds or dark charcoal
Restaurant food: warm oranges greens or earthy tones
Plumbing: deep blues or teals
Electrical: yellows ambers or dark charcoal
Legal law: navy dark blue or burgundy
Medical health: clean blues greens or whites
Construction: oranges browns or industrial grays
Cleaning: fresh greens or sky blues
General business: professional navy indigo or slate

Rules:
primaryColor must have good contrast with white text
secondaryColor must be light enough for dark text on top
accentColor must stand out clearly against both primary and secondary
Never generate clashing or unprofessional color combinations
Colors must feel appropriate for the specific industry
fontStyle modern for tech and automotive, classic for legal and medical, friendly for restaurants and cleaning`;
}

function validateTheme(theme) {
  if (!theme || typeof theme !== 'object') return null;

  const primaryColor = normalizeHexColor(theme.primaryColor);
  const secondaryColor = normalizeHexColor(theme.secondaryColor);
  const accentColor = normalizeHexColor(theme.accentColor);
  const heroStyle = String(theme.heroStyle ?? '').trim().toLowerCase();
  const fontStyle = String(theme.fontStyle ?? '').trim().toLowerCase();

  if (
    !primaryColor ||
    !secondaryColor ||
    !accentColor ||
    !HERO_STYLES.has(heroStyle) ||
    !FONT_STYLES.has(fontStyle)
  ) {
    return null;
  }

  return { primaryColor, secondaryColor, accentColor, heroStyle, fontStyle };
}

export async function generateSiteTheme(businessName, industry, city) {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.warn(JSON.stringify({ event: 'site_theme_skipped', reason: 'OPENAI_API_KEY not configured' }));
    return { ...DEFAULT_THEME };
  }

  const systemPrompt =
    'You are a professional web designer who creates color themes for business websites. You understand color psychology and industry conventions. Always return valid JSON only, no extra text.';
  const userPrompt = buildThemeUserPrompt(businessName, industry, city);

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: OPENAI_THEME_MODEL,
      temperature: 0.7,
      max_tokens: 300,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      throw new Error('OpenAI returned empty theme');
    }

    const parsed = JSON.parse(raw);
    const validated = validateTheme(parsed);
    if (!validated) {
      throw new Error('Theme validation failed');
    }

    return validated;
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: 'site_theme_generate_failed',
        error: e?.message ?? String(e),
        businessName,
        industry,
        city,
      }),
    );
    return { ...DEFAULT_THEME };
  }
}

function slugify(...parts) {
  return parts
    .filter(Boolean)
    .join('-')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function ensureUniqueSiteSlug(baseSlug) {
  let candidate = baseSlug;
  let suffix = 2;

  while (await prisma.generatedSite.findUnique({ where: { slug: candidate } })) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function findTemplateByIndustry(industry) {
  const normalized = String(industry ?? '').trim();
  if (!normalized) {
    throw new AppError('Field `industry` is required.', 400, { code: 'INVALID_BODY' });
  }

  const byIndustry = await prisma.template.findFirst({
    where: {
      isActive: true,
      industry: { equals: normalized, mode: 'insensitive' },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (byIndustry) return byIndustry;

  const general = await prisma.template.findFirst({
    where: {
      isActive: true,
      industry: { equals: 'general', mode: 'insensitive' },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (general) return general;

  const fallback = await prisma.template.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (fallback) return fallback;

  throw new AppError('No active templates found. Create at least one template.', 404, {
    code: 'TEMPLATE_NOT_FOUND',
  });
}

function validateFormData(formData) {
  if (!formData || typeof formData !== 'object') {
    throw new AppError('Request body must be a JSON object.', 400, { code: 'INVALID_BODY' });
  }

  const businessName = String(formData.businessName ?? '').trim();
  const industry = String(formData.industry ?? '').trim();
  const city = String(formData.city ?? '').trim();
  const state = String(formData.state ?? '').trim();

  if (!businessName) {
    throw new AppError('Field `businessName` is required.', 400, { code: 'INVALID_BODY' });
  }
  if (!industry) {
    throw new AppError('Field `industry` is required.', 400, { code: 'INVALID_BODY' });
  }
  if (!city) {
    throw new AppError('Field `city` is required.', 400, { code: 'INVALID_BODY' });
  }
  if (!state) {
    throw new AppError('Field `state` is required.', 400, { code: 'INVALID_BODY' });
  }

  return {
    businessName,
    industry,
    city,
    state,
    phone: formData.phone != null && formData.phone !== '' ? String(formData.phone).trim() : null,
    email: formData.email != null && formData.email !== '' ? String(formData.email).trim() : null,
    description:
      formData.description != null && formData.description !== ''
        ? String(formData.description).trim()
        : null,
  };
}

function buildPagePrompt(businessData, pageSchema, pageType, contextNote = '') {
  const {
    businessName,
    industry,
    city,
    state,
    phone,
    email,
    description,
  } = businessData;

  const details = [
    contextNote,
    `Phone: ${phone ?? 'not provided'}.`,
    email ? `Email: ${email}.` : null,
    description ? `Description: ${description}.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const servicesInstruction =
    pageType === 'services'
      ? ' Generate 6 to 8 services that are highly relevant and specific to this exact business type. Each service must be genuinely offered by this type of business and use its real, concrete name (for example "Kitchen Remodeling", "Root Canal Treatment", "Cruise Bookings"). Never output generic placeholder names such as "Service One", "Core Service", "Specialty Service", "Support Service" or "Consultation" on its own. Base services on industry keywords and common offerings in this field.'
      : '';

  const blogInstruction =
    pageType === 'blog'
      ? ' Write three distinct, in-depth articles. Each post body (introduction + H2/H3 section paragraphs + conclusion) MUST total at least 1000 words (target 1100+). Every post needs: introduction, exactly 4 H2 sections each with at least one H3 subsection, conclusion, exactly 5 FAQs with answers of 70-90 words each (hard minimum 60, never one-sentence answers), and 3 internalLinks (services/about/contact). Word counts are HARD REQUIREMENTS. Include specific tips, concrete examples, and local relevance to this city. Do not repeat points across posts, and avoid filler.'
      : '';

  const seoRequirements = buildSeoRequirements(businessData);

  const accuracyRules =
    ' Accuracy rules: Never invent licensing, insurance, certifications, years in business, customer counts, ratings, or awards unless the business description explicitly states them. Do not claim the business is licensed or insured unless that is standard and required for this specific industry AND the description supports it. Prefer honest local-service language over unverifiable claims.';

  return `${LENGTH_PRIORITY_PREAMBLE} Generate ${pageType} page content for ${businessName}, a ${industry} business in ${city}, ${state}. ${details}${servicesInstruction}${blogInstruction}${seoRequirements}${accuracyRules} Return ONLY valid JSON matching this exact structure: ${pageSchema}. For every field with a word range, treat the lower number as a strict minimum you must reach; keep short fields (headings, buttons, titles) within their limits. Content must be specific to this business and city.`;
}

async function finalizePageContent(pageType, content, businessData, systemPrompt) {
  // Drop any thin seoExtra the shell/schema model may have embedded — unit path owns it.
  const { seoExtra: _shellSeoExtra, ...withoutShellExtra } = content || {};
  const withExtra = await attachSeoExtra(pageType, withoutShellExtra, businessData, systemPrompt, {
    services: content?.services,
  });
  assertPageMeetsContract(pageType, withExtra);
  const withPageSeo = await ensureSeoMetadata(withExtra, businessData, pageType, systemPrompt);

  if (pageType !== 'blog' || !Array.isArray(withPageSeo.posts)) {
    return withPageSeo;
  }

  const posts = await Promise.all(
    withPageSeo.posts.map(async (post) => {
      const fixed = await ensureSeoMetadata(
        { seo: post?.seo ?? {} },
        businessData,
        'blogPost',
        systemPrompt,
        { subjectTitle: post?.title },
      );
      return { ...post, seo: fixed.seo };
    }),
  );

  return { ...withPageSeo, posts };
}

function assertPageMeetsContract(pageType, content) {
  const issues = validatePageLength(pageType, content);
  if (issues.length === 0) return;
  // Units are responsible for meeting floors; log if something slipped through compose.
  console.warn(
    JSON.stringify({
      event: 'page_contract_warning_after_compose',
      pageType,
      issues,
    }),
  );
}

async function callOpenAiForPage(systemPrompt, userPrompt, maxTokens = 2500, options = {}) {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError('OpenAI is not configured.', 503, { code: 'OPENAI_NOT_CONFIGURED' });
  }

  const temperature =
    typeof options.temperature === 'number' ? options.temperature : 0.7;

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: OPENAI_CONTENT_MODEL,
    temperature,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const choice = completion.choices[0];
  const finishReason = choice?.finish_reason;
  const raw = choice?.message?.content?.trim();
  if (!raw) {
    throw new Error('OpenAI returned empty content');
  }

  if (finishReason === 'length') {
    console.warn(
      JSON.stringify({
        event: 'openai_output_truncated',
        scope: options.scope || 'page',
        completionTokens: completion.usage?.completion_tokens ?? null,
      }),
    );
  }

  if (options.returnMeta) {
    return {
      raw,
      finishReason,
      completionTokens: completion.usage?.completion_tokens ?? null,
    };
  }

  return raw;
}

function normalizePageStructure(pageType, content) {
  const result = scrubGeneratedContent({ ...content });

  if (pageType === 'about') {
    result.story = result.story && typeof result.story === 'object' ? { ...result.story } : {};
    if (result.paragraph2 && !result.story.paragraph2) {
      result.story.paragraph2 = result.paragraph2;
      delete result.paragraph2;
    }
    if (result.paragraph1 && !result.story.paragraph1) {
      result.story.paragraph1 = result.paragraph1;
      delete result.paragraph1;
    }
    result.team = result.team && typeof result.team === 'object' ? { ...result.team } : {};
    result.mission =
      result.mission && typeof result.mission === 'object' ? { ...result.mission } : {};
  }

  if (pageType === 'home') {
    result.about = result.about && typeof result.about === 'object' ? { ...result.about } : {};
    if (result.paragraph1 && !result.about.paragraph1) {
      result.about.paragraph1 = result.paragraph1;
      delete result.paragraph1;
    }
    if (result.paragraph2 && !result.about.paragraph2) {
      result.about.paragraph2 = result.paragraph2;
      delete result.paragraph2;
    }
  }

  return result;
}

/**
 * Blog body + FAQs as separate contract units (fail closed).
 */
async function generateBlogPost(businessData, postOutline, systemPrompt, postIndex) {
  const { businessName, industry, city, state } = businessData;
  const title = postOutline?.title || `Blog post ${postIndex + 1}`;
  const category = postOutline?.category || 'Tips';

  const bodyPrompt = [
    `Write a complete long-form blog post BODY for ${businessName}, a ${industry} business in ${city}, ${state}.`,
    `Title: "${title}". Category: ${category}.`,
    postOutline?.excerpt ? `Summary theme: ${postOutline.excerpt}` : '',
    buildSeoRequirements(businessData),
    buildBlogBodyScaffold(),
    'Return ONLY valid JSON with this exact structure (NO faqs field):',
    '{ "title": "...", "excerpt": "40-60 words", "category": "...", "readTime": "X min read",',
    `"introduction": "${TARGETS.blogIntro.min}-${TARGETS.blogIntro.max} words",`,
    '"sections": [',
    `{ "heading": "H2 max 8 words", "paragraphs": ["${TARGETS.blogH2Paragraph.min}-${TARGETS.blogH2Paragraph.max} words"], "subsections": [{ "heading": "H3 max 8 words", "paragraphs": ["${TARGETS.blogH3Paragraph.min}-${TARGETS.blogH3Paragraph.max} words"] }] },`,
    `{ "heading": "H2 max 8 words", "paragraphs": ["${TARGETS.blogH2Paragraph.min}-${TARGETS.blogH2Paragraph.max} words"], "subsections": [{ "heading": "H3 max 8 words", "paragraphs": ["${TARGETS.blogH3Paragraph.min}-${TARGETS.blogH3Paragraph.max} words"] }] },`,
    `{ "heading": "H2 max 8 words", "paragraphs": ["${TARGETS.blogH2Paragraph.min}-${TARGETS.blogH2Paragraph.max} words"], "subsections": [{ "heading": "H3 max 8 words", "paragraphs": ["${TARGETS.blogH3Paragraph.min}-${TARGETS.blogH3Paragraph.max} words"] }] },`,
    `{ "heading": "H2 max 8 words", "paragraphs": ["${TARGETS.blogH2Paragraph.min}-${TARGETS.blogH2Paragraph.max} words"], "subsections": [{ "heading": "H3 max 8 words", "paragraphs": ["${TARGETS.blogH3Paragraph.min}-${TARGETS.blogH3Paragraph.max} words"] }] }`,
    '],',
    `"conclusion": "${TARGETS.blogConclusion.min}-${TARGETS.blogConclusion.max} words",`,
    '"internalLinks": [',
    '{ "label": "descriptive anchor text to services", "path": "services" },',
    '{ "label": "descriptive anchor text to about", "path": "about" },',
    '{ "label": "descriptive anchor text to contact", "path": "contact" }',
    '],',
    `"bodyWordCount": ${TARGETS.blogBody},`,
    '"seo": { "title": "50-60 characters with post title, business name, and city", "metaDescription": "120-155 characters with post topic, city, and call to action" } }',
    `Include exactly ${STRUCTURE.blogH2Count} H2 sections, each with at least one H3 subsection.`,
    'internalLinks path values must be one of: services, about, contact, blog (relative page keys only).',
    'Write genuinely useful, distinct content — no filler or repetition.',
  ]
    .filter(Boolean)
    .join(' ');

  const body = await generateUnit({
    unitId: 'blog.body',
    systemPrompt,
    userPrompt: bodyPrompt,
    maxTokens: 7000,
    temperature: LENGTH_CRITICAL_TEMPERATURE,
  });

  const faqsPayload = await generateUnit({
    unitId: 'blog.faqs',
    systemPrompt,
    userPrompt: [
      `Write exactly ${STRUCTURE.blogFaqCount} FAQs for the blog post "${body.title || title}" for ${businessName}, a ${industry} business in ${city}, ${state}.`,
      `Return ONLY valid JSON: { "faqs": [ { "question": "...", "answer": "${TARGETS.faqAnswer.min}-${TARGETS.faqAnswer.max} words" }, ... ${STRUCTURE.blogFaqCount} items ] }`,
      `Each answer MUST be at least ${FLOORS.faqAnswer} words (target ${TARGETS.faqAnswer.min}-${TARGETS.faqAnswer.max}). Never one-sentence answers.`,
      'Questions must be distinct, useful, and related to the article topic with local/industry detail.',
    ].join(' '),
    maxTokens: 2500,
    temperature: LENGTH_CRITICAL_TEMPERATURE,
  });

  return { ...body, faqs: faqsPayload.faqs };
}

async function generateBlogPageContent(businessData, pageSchema, systemPrompt, contextNote) {
  const { businessName, industry, city, state } = businessData;
  const outlinePrompt = [
    `Propose exactly 3 distinct blog post ideas for ${businessName}, a ${industry} business in ${city}, ${state}.`,
    contextNote || '',
    'Return ONLY valid JSON with this exact shape (no post bodies):',
    '{ "posts": [',
    '{ "title": "max 12 words", "excerpt": "40-60 words", "category": "one word", "readTime": "X min read" },',
    '{ "title": "max 12 words", "excerpt": "40-60 words", "category": "one word", "readTime": "X min read" },',
    '{ "title": "max 12 words", "excerpt": "40-60 words", "category": "one word", "readTime": "X min read" }',
    '],',
    '"seo": { "title": "50-60 characters with business name, city, and industry", "metaDescription": "120-155 characters with city and call to action" } }',
    'Do not include introduction, sections, conclusion, faqs, or internalLinks in this response.',
  ]
    .filter(Boolean)
    .join(' ');

  let shell;
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const raw = await callOpenAiForPage(systemPrompt, outlinePrompt, 1200, {
        temperature: LENGTH_CRITICAL_TEMPERATURE,
        scope: 'blog_outline',
      });
      shell = parseJsonContent(raw);
      if (Array.isArray(shell?.posts) && shell.posts.length >= 3) break;
      throw new Error('Blog outline missing 3 posts');
    } catch (e) {
      lastError = e;
      console.warn(
        JSON.stringify({
          event: 'blog_outline_retry',
          attempt,
          error: e?.message ?? String(e),
          businessName,
        }),
      );
    }
  }

  if (!shell || !Array.isArray(shell.posts) || shell.posts.length < 3) {
    throw lastError ?? new ContentUnitError('Failed to generate blog outline', {
      unitId: 'blog.outline',
      code: 'CONTENT_UNIT_INFRA',
    });
  }

  const outlines = shell.posts.slice(0, 3);
  const expandedPosts = [];
  for (let index = 0; index < outlines.length; index += 1) {
    expandedPosts.push(
      await generateBlogPost(businessData, outlines[index], systemPrompt, index),
    );
  }

  return { ...shell, posts: expandedPosts };
}

/**
 * Services: catalog (short) + intro unit + one fullDescription unit per service.
 */
async function generateServicesPageContent(businessData, pageSchema, systemPrompt, contextNote) {
  const { businessName, industry, city, state } = businessData;

  const catalogPrompt = [
    contextNote || '',
    `Generate the services catalog for ${businessName}, a ${industry} business in ${city}, ${state}.`,
    buildSeoRequirements(businessData),
    `Return ONLY valid JSON with hero, cta, seo, and ${STRUCTURE.serviceCatalogMin}-${STRUCTURE.serviceCatalogMax} services.`,
    'Each service: { "title": "2-5 word real service name", "shortDescription": "30-45 words", "icon": "lucide icon name", "fullDescription": "" }',
    'Leave fullDescription empty — it is generated per service in a separate unit.',
    'Never use placeholder titles like Service One or Core Service.',
    'Include hero { heading, subheading }, cta { heading, buttonText }, seo { title, metaDescription }.',
  ]
    .filter(Boolean)
    .join(' ');

  let catalogRaw;
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const raw = await callOpenAiForPage(systemPrompt, catalogPrompt, 3500, {
        temperature: LENGTH_CRITICAL_TEMPERATURE,
        scope: 'services_catalog',
      });
      catalogRaw = parseJsonContent(raw);
      if (
        Array.isArray(catalogRaw?.services) &&
        catalogRaw.services.length >= STRUCTURE.serviceCatalogMin
      ) {
        break;
      }
      throw new Error('Services catalog missing services array');
    } catch (e) {
      lastError = e;
    }
  }
  if (!catalogRaw?.services?.length) {
    throw lastError ?? new ContentUnitError('Failed to generate services catalog', {
      unitId: 'services.catalog',
      code: 'CONTENT_UNIT_INFRA',
    });
  }

  const introUnit = await generateUnit({
    unitId: 'services.intro',
    systemPrompt,
    userPrompt: [
      `Write the services page intro for ${businessName}, a ${industry} business in ${city}, ${state}.`,
      buildServicesIntroScaffold({ businessName, city, state }),
      buildSeoRequirements(businessData),
      `Return ONLY JSON: { "intro": "continuous string meeting scaffold, at least ${TARGETS.servicesIntro} words", "introWordCount": ${TARGETS.servicesIntro} }`,
    ].join(' '),
    maxTokens: 1200,
    normalize: (c) => ({ intro: c.intro || c.text }),
  });

  const services = catalogRaw.services.slice(0, STRUCTURE.serviceCatalogMax);
  const withDescriptions = await mapPool(
    services.map((service) => async () => {
      const desc = await generateUnit({
        unitId: 'services.fullDescription',
        systemPrompt,
        userPrompt: [
          `Write the fullDescription for "${service.title}" offered by ${businessName}, a ${industry} business in ${city}, ${state}.`,
          service.shortDescription ? `Short summary: ${service.shortDescription}` : '',
          buildSeoRequirements(businessData),
          `Return ONLY JSON: { "fullDescription": "${TARGETS.serviceFullDescription.min}-${TARGETS.serviceFullDescription.max} words of in-depth detail" }`,
          `HARD MINIMUM ${FLOORS.serviceFullDescription} words.`,
        ]
          .filter(Boolean)
          .join(' '),
        maxTokens: 1200,
      });
      return { ...service, fullDescription: desc.fullDescription };
    }),
    3,
  );

  return { ...catalogRaw, intro: introUnit.intro, services: withDescriptions };
}


function parseJsonContent(raw) {
  const text = String(raw ?? '').trim();
  try {
    return JSON.parse(text);
  } catch {
    // Models occasionally wrap JSON in fences or add trailing prose.
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim());
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error('Failed to parse JSON content from model response');
  }
}


/**
 * @param {object} businessData
 * @param {string} pageSchema - JSON schema string from IndustrySchema
 * @param {string} systemPrompt
 * @param {string} pageType - home | about | services | contact | blog | location
 * @param {string} [contextNote]
 */
export async function generatePageContent(
  businessData,
  pageSchema,
  systemPrompt,
  pageType,
  contextNote = '',
) {
  if (pageType === 'services') {
    const content = await generateServicesPageContent(
      businessData,
      pageSchema,
      systemPrompt,
      contextNote,
    );
    return finalizePageContent('services', content, businessData, systemPrompt);
  }

  if (pageType === 'blog') {
    const blogContent = await generateBlogPageContent(
      businessData,
      pageSchema,
      systemPrompt,
      contextNote,
    );
    return finalizePageContent('blog', blogContent, businessData, systemPrompt);
  }

  if (pageType === 'contact') {
    const content = await generateContactPageContent(
      businessData,
      pageSchema,
      systemPrompt,
      contextNote,
    );
    return finalizePageContent('contact', content, businessData, systemPrompt);
  }

  if (pageType === 'home' || pageType === 'about') {
    const content = await generateStructuredPageWithLongUnits(
      businessData,
      pageSchema,
      systemPrompt,
      pageType,
      contextNote,
    );
    return finalizePageContent(pageType, content, businessData, systemPrompt);
  }

  const userPrompt = buildPagePrompt(businessData, pageSchema, pageType, contextNote);
  const maxTokens = MAX_TOKENS_BY_PAGE[pageType] ?? 4500;

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const raw = await callOpenAiForPage(systemPrompt, userPrompt, maxTokens, {
        temperature: LENGTH_CRITICAL_TEMPERATURE,
        scope: pageType,
      });
      const content = normalizePageStructure(pageType, parseJsonContent(raw));
      return finalizePageContent(pageType, content, businessData, systemPrompt);
    } catch (e) {
      lastError = e;
      console.warn(
        JSON.stringify({
          event: 'page_content_generate_retry',
          pageType,
          attempt,
          error: e?.message ?? String(e),
          businessName: businessData?.businessName,
        }),
      );
    }
  }

  throw lastError ?? new Error(`Failed to generate ${pageType} page content`);
}

async function generateContactPageContent(businessData, pageSchema, systemPrompt, contextNote) {
  const { businessName, industry, city, state } = businessData;
  const shellNote = [
    contextNote,
    'For "intro", write a single placeholder sentence only — intro is generated in a separate contract unit.',
  ]
    .filter(Boolean)
    .join(' ');

  const raw = await callOpenAiForPage(
    systemPrompt,
    buildPagePrompt(businessData, pageSchema, 'contact', shellNote),
    2500,
    { temperature: LENGTH_CRITICAL_TEMPERATURE, scope: 'contact_shell' },
  );
  const shell = normalizePageStructure('contact', parseJsonContent(raw));

  const introUnit = await generateUnit({
    unitId: 'contact.intro',
    systemPrompt,
    userPrompt: [
      `Write the contact page intro for ${businessName}, a ${industry} business in ${city}, ${state}.`,
      buildContactIntroScaffold({ businessName, city, state }),
      buildSeoRequirements(businessData),
      `Return ONLY JSON: { "intro": "continuous string meeting scaffold, at least ${TARGETS.contactIntro} words", "introWordCount": ${TARGETS.contactIntro} }`,
    ].join(' '),
    maxTokens: 1200,
    normalize: (c) => ({ intro: c.intro || c.text }),
  });

  return { ...shell, intro: introUnit.intro };
}

async function generateStructuredPageWithLongUnits(
  businessData,
  pageSchema,
  systemPrompt,
  pageType,
  contextNote,
) {
  const { businessName, industry, city, state } = businessData;
  const shellNote = [
    contextNote,
    pageType === 'home'
      ? 'For about.paragraph1 and about.paragraph2, write one short placeholder sentence each — those fields are generated in a separate contract unit.'
      : 'For story.paragraph1, story.paragraph2, and team.description, write one short placeholder sentence each — those fields are generated in separate contract units.',
  ]
    .filter(Boolean)
    .join(' ');

  const raw = await callOpenAiForPage(
    systemPrompt,
    buildPagePrompt(businessData, pageSchema, pageType, shellNote),
    MAX_TOKENS_BY_PAGE[pageType] ?? 4500,
    { temperature: LENGTH_CRITICAL_TEMPERATURE, scope: `${pageType}_shell` },
  );
  const shell = normalizePageStructure(pageType, parseJsonContent(raw));

  if (pageType === 'home') {
    const about = await generateUnit({
      unitId: 'home.about',
      systemPrompt,
      userPrompt: [
        `Write the home page about section for ${businessName}, a ${industry} business in ${city}, ${state}.`,
        buildSeoRequirements(businessData),
        `Return ONLY JSON: { "paragraph1": "${TARGETS.homeAboutParagraph.min}-${TARGETS.homeAboutParagraph.max} words", "paragraph2": "${TARGETS.homeAboutParagraph.min}-${TARGETS.homeAboutParagraph.max} words" }`,
        `HARD MINIMUM ${FLOORS.homeAboutParagraph} words per paragraph.`,
      ].join(' '),
      maxTokens: 1500,
    });
    return {
      ...shell,
      about: { ...(shell.about || {}), paragraph1: about.paragraph1, paragraph2: about.paragraph2 },
    };
  }

  const story = await generateUnit({
    unitId: 'about.story',
    systemPrompt,
    userPrompt: [
      `Write the about page story paragraphs for ${businessName}, a ${industry} business in ${city}, ${state}.`,
      buildSeoRequirements(businessData),
      `Return ONLY JSON: { "paragraph1": "${TARGETS.aboutStoryParagraph.min}-${TARGETS.aboutStoryParagraph.max} words", "paragraph2": "${TARGETS.aboutStoryParagraph.min}-${TARGETS.aboutStoryParagraph.max} words" }`,
      `HARD MINIMUM ${FLOORS.aboutStoryParagraph} words per paragraph.`,
      'Paragraph values must be plain prose only — never include JSON braces, stray quotes, or code artifacts inside the text.',
    ].join(' '),
    maxTokens: 1600,
  });

  const team = await generateUnit({
    unitId: 'about.team',
    systemPrompt,
    userPrompt: [
      `Write the about page team description for ${businessName}, a ${industry} business in ${city}, ${state}.`,
      buildSeoRequirements(businessData),
      `Return ONLY JSON: { "description": "${TARGETS.aboutTeamDescription.min}-${TARGETS.aboutTeamDescription.max} words" }`,
      `HARD MINIMUM ${FLOORS.aboutTeamDescription} words.`,
    ].join(' '),
    maxTokens: 800,
  });

  const mission = await generateUnit({
    unitId: 'about.mission',
    systemPrompt,
    userPrompt: [
      `Write the about page mission statement for ${businessName}, a ${industry} business in ${city}, ${state}.`,
      buildSeoRequirements(businessData),
      'Describe purpose, who you serve, and local commitment — concrete, not a slogan.',
      `Return ONLY JSON: { "statement": "${TARGETS.aboutMissionStatement.min}-${TARGETS.aboutMissionStatement.max} words" }`,
      `HARD MINIMUM ${FLOORS.aboutMissionStatement} words.`,
      'Do not include JSON braces, quotes, or code artifacts inside the statement text.',
    ].join(' '),
    maxTokens: 600,
  });

  return {
    ...shell,
    story: { ...(shell.story || {}), paragraph1: story.paragraph1, paragraph2: story.paragraph2 },
    team: { ...(shell.team || {}), description: team.description },
    mission: { ...(shell.mission || {}), statement: mission.statement },
  };
}

const HOME_SERVICES_LIMIT = 6;

/**
 * The services page is the single source of truth for the service list. The
 * home page "Our Services" section is derived from it so their titles — and
 * therefore the /services/:serviceSlug links — always match. Without this the
 * two pages are generated independently and their slugs diverge, leaving home
 * cards pointing at service pages that do not exist.
 */
export function syncHomeServicesWithServices(homeResult, servicesResult) {
  const services = Array.isArray(servicesResult?.services) ? servicesResult.services : [];
  if (services.length === 0) return homeResult;

  const derived = services.slice(0, HOME_SERVICES_LIMIT).map((service) => ({
    title: service.title,
    description: service.shortDescription || service.fullDescription || '',
    icon: service.icon || 'wrench',
  }));

  return { ...homeResult, services: derived };
}

export async function generateSite(formData) {
  try {
    const validated = validateFormData(formData);
    const [template, schema] = await Promise.all([
      findTemplateByIndustry(validated.industry),
      getSchemaForIndustry(validated.industry),
    ]);

    const [homeResult, aboutResult, servicesResult, contactResult, blogResult, theme] =
      await Promise.all([
        generatePageContent(
          validated,
          schema.homePageSchema,
          schema.systemPrompt,
          'home',
        ),
        generatePageContent(
          validated,
          schema.aboutPageSchema,
          schema.systemPrompt,
          'about',
        ),
        generatePageContent(
          validated,
          schema.servicesPageSchema,
          schema.systemPrompt,
          'services',
        ),
        generatePageContent(
          validated,
          schema.contactPageSchema,
          schema.systemPrompt,
          'contact',
        ),
        generatePageContent(
          validated,
          schema.blogPageSchema,
          schema.systemPrompt,
          'blog',
        ),
        generateSiteTheme(validated.businessName, validated.industry, validated.city),
      ]);

    const syncedHome = syncHomeServicesWithServices(homeResult, servicesResult);

    const baseSlug = slugify(validated.businessName, validated.city);
    const slug = await ensureUniqueSiteSlug(baseSlug);
    const designVariant = await pickDesignVariant(slug);

    const site = await prisma.generatedSite.create({
      data: {
        businessName: validated.businessName,
        industry: validated.industry,
        city: validated.city,
        state: validated.state,
        phone: validated.phone,
        email: validated.email,
        description: validated.description,
        slug,
        templateId: template.id,
        homeContent: JSON.stringify(syncedHome),
        aboutContent: JSON.stringify(aboutResult),
        servicesContent: JSON.stringify(servicesResult),
        contactContent: JSON.stringify(contactResult),
        blogContent: JSON.stringify(blogResult),
        status: 'ACTIVE',
        primaryColor: theme.primaryColor,
        secondaryColor: theme.secondaryColor,
        accentColor: theme.accentColor,
        heroStyle: theme.heroStyle,
        fontStyle: theme.fontStyle,
        designVariant,
      },
      include: { template: true },
    });

    console.info(
      JSON.stringify({
        event: 'site_generated',
        siteId: site.id,
        slug: site.slug,
        templateId: template.id,
        industrySchema: schema.industry,
        industry: validated.industry,
        designVariant,
        theme,
      }),
    );

    return site;
  } catch (e) {
    if (e instanceof AppError) {
      throw e;
    }

    console.error(
      JSON.stringify({
        event: 'site_generate_failed',
        error: e?.message ?? String(e),
        businessName: formData?.businessName,
      }),
    );

    throw new AppError(e?.message ?? 'Failed to generate site.', 502, {
      code: 'SITE_GENERATION_FAILED',
    });
  }
}

export async function listGeneratedSites(query = {}) {
  const page = Math.max(1, Number.parseInt(String(query.page ?? 1), 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(String(query.limit ?? 12), 10) || 12),
  );
  const search = String(query.search ?? '').trim();
  const status = String(query.status ?? '').trim().toUpperCase();

  const where = {};

  if (search) {
    where.OR = [
      { businessName: { contains: search, mode: 'insensitive' } },
      { industry: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
      { state: { contains: search, mode: 'insensitive' } },
      { slug: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (status && ['PENDING', 'ACTIVE', 'INACTIVE'].includes(status)) {
    where.status = status;
  }

  const skip = (page - 1) * limit;

  const [sites, total] = await Promise.all([
    prisma.generatedSite.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        template: true,
        _count: { select: { locationPages: true } },
      },
    }),
    prisma.generatedSite.count({ where }),
  ]);

  return {
    sites,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function getGeneratedSiteBySlug(slug) {
  const normalized = slugify(slug);
  const site = await prisma.generatedSite.findUnique({
    where: { slug: normalized },
    include: {
      template: true,
      locationPages: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!site) {
    throw new AppError('Generated site not found.', 404, { code: 'SITE_NOT_FOUND' });
  }

  return site;
}
