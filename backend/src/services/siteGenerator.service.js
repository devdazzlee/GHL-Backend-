import OpenAI from 'openai';
import { env } from '../config/env.js';
import prisma from '../database/client.js';
import { AppError } from '../utils/AppError.js';
import { getSchemaForIndustry } from './industrySchema.service.js';
import { buildSeoRequirements, ensureSeoMetadata } from './seoMetadata.service.js';
import { pickDesignVariant } from './designVariant.service.js';

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
  contact: 2500,
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
      ? ' Write three distinct, in-depth articles. Each post must total 400-500 words across its introduction, section paragraphs, and conclusion (FAQs are separate). Include specific tips, concrete examples, and local relevance to this city. Every post needs a distinct topic, an engaging introduction, two substantive sections with descriptive headings, a conclusion, and three real FAQs a customer would actually ask. Do not repeat points across posts, and avoid filler.'
      : '';

  const seoRequirements = buildSeoRequirements(businessData);

  const accuracyRules =
    ' Accuracy rules: Never invent licensing, insurance, certifications, years in business, customer counts, ratings, or awards unless the business description explicitly states them. Do not claim the business is licensed or insured unless that is standard and required for this specific industry AND the description supports it. Prefer honest local-service language over unverifiable claims.';

  return `Generate ${pageType} page content for ${businessName}, a ${industry} business in ${city}, ${state}. ${details}${servicesInstruction}${blogInstruction}${seoRequirements}${accuracyRules} Return ONLY valid JSON matching this exact structure: ${pageSchema}. For every field with a word range, treat the lower number as a strict minimum you must reach; keep short fields (headings, buttons, titles) within their limits. Content must be specific to this business and city.`;
}

async function finalizePageContent(pageType, content, businessData, systemPrompt) {
  const withLength = await ensureMinimumContentLength(
    pageType,
    content,
    businessData,
    systemPrompt,
  );
  const withPageSeo = await ensureSeoMetadata(withLength, businessData, pageType, systemPrompt);

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

async function callOpenAiForPage(systemPrompt, userPrompt, maxTokens = 2500) {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError('OpenAI is not configured.', 503, { code: 'OPENAI_NOT_CONFIGURED' });
  }

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: OPENAI_CONTENT_MODEL,
    temperature: 0.7,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error('OpenAI returned empty content');
  }

  return raw;
}

/**
 * Generates a single long-form text field in its own completion so the model
 * can reliably reach SEO word targets without compressing a full page JSON blob.
 */
async function expandTextField(
  businessData,
  systemPrompt,
  { label, currentText, minWords, maxWords, contextNote = '' },
) {
  const { businessName, industry, city, state } = businessData;

  const userPrompt = [
    `Rewrite and expand this ${label} for ${businessName}, a ${industry} business in ${city}, ${state}.`,
    contextNote,
    buildSeoRequirements(businessData),
    `Current draft (${countWords(currentText)} words): "${currentText}"`,
    `Return ONLY valid JSON: { "text": "${minWords}-${maxWords} words of expanded, keyword-optimized, locally specific content" }`,
    `The text MUST be at least ${minWords} words.`,
  ]
    .filter(Boolean)
    .join(' ');

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const raw = await callOpenAiForPage(systemPrompt, userPrompt, 900);
      const parsed = parseJsonContent(raw);
      const text = parsed?.text;
      if (countWords(text) >= minWords) {
        return text;
      }
      if (attempt < 2) continue;
      return text || currentText;
    } catch (e) {
      lastError = e;
    }
  }

  console.warn(
    JSON.stringify({
      event: 'expand_text_field_failed',
      label,
      error: lastError?.message ?? String(lastError),
      businessName,
    }),
  );
  return currentText;
}

const TEXT_FIELD_EXPANSION_SPECS = {
  'about.paragraph1': {
    label: 'home page about section first paragraph',
    maxWords: 200,
  },
  'about.paragraph2': {
    label: 'home page about section second paragraph',
    maxWords: 200,
  },
  'story.paragraph1': {
    label: 'about page company history paragraph',
    maxWords: 250,
  },
  'story.paragraph2': {
    label: 'about page mission and values paragraph',
    maxWords: 250,
  },
  'team.description': {
    label: 'about page team description',
    maxWords: 140,
  },
  intro: {
    label: 'page introduction',
    maxWords: 160,
  },
  localIntro: {
    label: 'location page local introduction',
    maxWords: 200,
  },
  whyLocal: {
    label: 'location page why local customers should choose this business',
    maxWords: 150,
  },
  serviceArea: {
    label: 'location page service area description',
    maxWords: 120,
  },
};

function getNestedField(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function setNestedField(obj, path, value) {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

function normalizePageStructure(pageType, content) {
  const result = { ...content };

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

async function expandShortTextFields(content, issues, businessData, systemPrompt) {
  const result = JSON.parse(JSON.stringify(content));

  await Promise.all(
    issues
      .filter((issue) => !issue.field.startsWith('posts['))
      .map(async (issue) => {
        const spec = TEXT_FIELD_EXPANSION_SPECS[issue.field];
        if (!spec) return;

        const currentText = getNestedField(result, issue.field);
        const draft =
          typeof currentText === 'string' && currentText.trim()
            ? currentText
            : 'Write fresh content for this section.';

        const expandedText = await expandTextField(businessData, systemPrompt, {
          label: spec.label,
          currentText: draft,
          minWords: issue.minimum,
          maxWords: spec.maxWords,
          contextNote:
            typeof currentText === 'string' && currentText.trim()
              ? ''
              : 'This section was missing from the draft — write it from scratch.',
        });
        setNestedField(result, issue.field, expandedText);
      }),
  );

  return result;
}

/**
 * Generates a single blog post in its own completion so each article reliably
 * reaches the 400-500 word SEO target.
 */
async function generateBlogPost(businessData, postOutline, systemPrompt, postIndex) {
  const { businessName, industry, city, state } = businessData;
  const title = postOutline?.title || `Blog post ${postIndex + 1}`;
  const category = postOutline?.category || 'Tips';

  const userPrompt = [
    `Write a complete blog post for ${businessName}, a ${industry} business in ${city}, ${state}.`,
    `Title: "${title}". Category: ${category}.`,
    postOutline?.excerpt ? `Summary theme: ${postOutline.excerpt}` : '',
    buildSeoRequirements(businessData),
    'Return ONLY valid JSON with this exact structure:',
    '{ "title": "...", "excerpt": "40-60 words", "category": "...", "readTime": "X min read",',
    '"introduction": "80-100 words",',
    '"sections": [',
    '{ "heading": "clear H2, max 8 words", "paragraphs": ["150-175 words with local and industry keywords"] },',
    '{ "heading": "clear H2, max 8 words", "paragraphs": ["150-175 words with practical advice and local relevance"] }',
    '],',
    '"conclusion": "80-100 words",',
    '"faqs": [',
    '{ "question": "real customer question", "answer": "40-70 words" },',
    '{ "question": "different real customer question", "answer": "40-70 words" },',
    '{ "question": "third real customer question", "answer": "40-70 words" }',
    '],',
    '"seo": { "title": "50-60 characters with post title, business name, and city", "metaDescription": "120-155 characters with post topic, city, and call to action" } }',
    'Introduction + all section paragraphs + conclusion combined MUST total at least 400 words.',
    'Write genuinely useful, distinct content — no filler or repetition.',
  ]
    .filter(Boolean)
    .join(' ');

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const raw = await callOpenAiForPage(systemPrompt, userPrompt, 2500);
      const parsed = parseJsonContent(raw);
      const words = countBlogPostWords(parsed);
      if (words >= MIN_BLOG_POST_WORDS) {
        return parsed;
      }
      if (attempt < 3) {
        console.warn(
          JSON.stringify({
            event: 'blog_post_retry',
            postIndex,
            title,
            words,
            businessName,
            attempt,
          }),
        );
        continue;
      }
      return parsed;
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError ?? new Error(`Failed to generate blog post "${title}"`);
}

/**
 * Blog page: outline first, then expand each post in parallel.
 */
async function generateBlogPageContent(businessData, pageSchema, systemPrompt, contextNote) {
  const shellNote = [
    contextNote,
    'Generate exactly 3 distinct blog posts. For each post provide only title, excerpt, category, and readTime.',
    'Use one-sentence placeholders for introduction, sections, conclusion, and FAQs — full post bodies are written separately.',
  ]
    .filter(Boolean)
    .join(' ');

  const shellPrompt = buildPagePrompt(businessData, pageSchema, 'blog', shellNote);
  let shell;
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const raw = await callOpenAiForPage(systemPrompt, shellPrompt, 2500);
      shell = parseJsonContent(raw);
      break;
    } catch (e) {
      lastError = e;
    }
  }

  if (!shell) {
    throw lastError ?? new Error('Failed to generate blog page shell');
  }

  const outlines = Array.isArray(shell.posts) ? shell.posts.slice(0, 3) : [];
  if (outlines.length === 0) {
    return shell;
  }

  const expandedPosts = await Promise.all(
    outlines.map(async (outline, index) => {
      try {
        return await generateBlogPost(businessData, outline, systemPrompt, index);
      } catch (e) {
        console.warn(
          JSON.stringify({
            event: 'blog_post_failed',
            postIndex: index,
            title: outline?.title,
            error: e?.message ?? String(e),
            businessName: businessData?.businessName,
          }),
        );
        return outline;
      }
    }),
  );

  const assembled = { ...shell, posts: expandedPosts };
  return ensureMinimumContentLength('blog', assembled, businessData, systemPrompt);
}

/**
 * Expands any body fields that still fall below SEO minimums after the initial
 * page generation pass.
 */
async function ensureMinimumContentLength(pageType, content, businessData, systemPrompt) {
  let result = normalizePageStructure(pageType, content);

  for (let pass = 1; pass <= 2; pass += 1) {
    const issues = validatePageContentLength(pageType, result);
    if (issues.length === 0) {
      return result;
    }

    const blogIssues = issues.filter((issue) => issue.field.startsWith('posts['));
    const textIssues = issues.filter((issue) => !issue.field.startsWith('posts['));

    if (textIssues.length > 0) {
      result = await expandShortTextFields(result, textIssues, businessData, systemPrompt);
    }

    if (blogIssues.length > 0 && Array.isArray(result.posts)) {
      const indexes = [
        ...new Set(
          blogIssues
            .map((issue) => {
              const match = issue.field.match(/^posts\[(\d+)\]/);
              return match ? Number(match[1]) : null;
            })
            .filter((index) => index != null),
        ),
      ];

      const posts = [...result.posts];
      await Promise.all(
        indexes.map(async (index) => {
          if (!posts[index]) return;
          try {
            posts[index] = await generateBlogPost(
              businessData,
              posts[index],
              systemPrompt,
              index,
            );
          } catch (e) {
            console.warn(
              JSON.stringify({
                event: 'blog_post_expand_failed',
                postIndex: index,
                pass,
                error: e?.message ?? String(e),
                businessName: businessData?.businessName,
              }),
            );
          }
        }),
      );
      result = { ...result, posts };
    }

    console.warn(
      JSON.stringify({
        event: 'page_content_expand_pass',
        pageType,
        pass,
        issueCount: issues.length,
        businessName: businessData?.businessName,
      }),
    );
  }

  const remaining = validatePageContentLength(pageType, result);
  if (remaining.length > 0) {
    console.warn(
      JSON.stringify({
        event: 'page_content_length_below_minimum',
        pageType,
        issues: remaining,
        businessName: businessData?.businessName,
      }),
    );
  }

  return result;
}

/**
 * Generates a single service fullDescription in its own completion so the model
 * can reliably reach 200-250 words. Packing 8 long descriptions into one JSON
 * object causes every model to compress each field.
 */
async function generateServiceFullDescription(businessData, service, systemPrompt) {
  const { businessName, industry, city, state } = businessData;
  const title = service?.title || 'Service';
  const short = service?.shortDescription || '';

  const userPrompt = [
    `Write the fullDescription for "${title}" offered by ${businessName}, a ${industry} business in ${city}, ${state}.`,
    short ? `Short summary: ${short}` : '',
    buildSeoRequirements(businessData),
    'Return ONLY valid JSON: { "fullDescription": "200-250 words of in-depth, keyword-optimized detail about this specific service — what it includes, the process, benefits, and why local customers in this city should choose this business." }',
    'The fullDescription MUST be at least 200 words.',
  ]
    .filter(Boolean)
    .join(' ');

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const raw = await callOpenAiForPage(systemPrompt, userPrompt, 900);
      const parsed = parseJsonContent(raw);
      const words = countWords(parsed?.fullDescription);
      if (words >= 200) {
        return parsed.fullDescription;
      }
      if (attempt < 2) {
        console.warn(
          JSON.stringify({
            event: 'service_full_description_retry',
            serviceTitle: title,
            words,
            businessName,
          }),
        );
        continue;
      }
      return parsed.fullDescription || short;
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError ?? new Error(`Failed to generate fullDescription for "${title}"`);
}

/**
 * Services page: structure first, then expand each fullDescription in parallel.
 */
async function generateServicesPageContent(businessData, pageSchema, systemPrompt, contextNote) {
  const shellNote = [
    contextNote,
    'For each service fullDescription, write only a single-sentence placeholder (20-30 words). Each fullDescription will be expanded in a separate step.',
  ]
    .filter(Boolean)
    .join(' ');

  const shellPrompt = buildPagePrompt(
    businessData,
    pageSchema,
    'services',
    shellNote,
  );

  const maxTokens = MAX_TOKENS_BY_PAGE.services;
  let shell;
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const raw = await callOpenAiForPage(systemPrompt, shellPrompt, maxTokens);
      shell = parseJsonContent(raw);
      break;
    } catch (e) {
      lastError = e;
    }
  }

  if (!shell) {
    throw lastError ?? new Error('Failed to generate services page shell');
  }

  const services = Array.isArray(shell.services) ? shell.services : [];
  if (services.length === 0) {
    return shell;
  }

  const expandedServices = await Promise.all(
    services.map(async (service) => {
      try {
        const fullDescription = await generateServiceFullDescription(
          businessData,
          service,
          systemPrompt,
        );
        return { ...service, fullDescription };
      } catch (e) {
        console.warn(
          JSON.stringify({
            event: 'service_full_description_failed',
            serviceTitle: service?.title,
            error: e?.message ?? String(e),
            businessName: businessData?.businessName,
          }),
        );
        return service;
      }
    }),
  );

  return { ...shell, services: expandedServices };
}

function parseJsonContent(raw) {
  return JSON.parse(raw);
}

function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countBlogPostWords(post) {
  if (!post || typeof post !== 'object') return 0;

  let total = countWords(post.introduction) + countWords(post.conclusion);

  if (Array.isArray(post.sections)) {
    for (const section of post.sections) {
      if (!Array.isArray(section?.paragraphs)) continue;
      for (const paragraph of section.paragraphs) {
        total += countWords(paragraph);
      }
    }
  }

  return total;
}

/** Minimum word counts for SEO body fields, keyed by page type. */
const MIN_WORDS_BY_PAGE = {
  home: [
    ['about.paragraph1', (c) => countWords(c?.about?.paragraph1), 150],
    ['about.paragraph2', (c) => countWords(c?.about?.paragraph2), 150],
  ],
  about: [
    ['story.paragraph1', (c) => countWords(c?.story?.paragraph1), 200],
    ['story.paragraph2', (c) => countWords(c?.story?.paragraph2), 200],
    ['team.description', (c) => countWords(c?.team?.description), 100],
  ],
  services: [['intro', (c) => countWords(c?.intro), 120]],
  contact: [['intro', (c) => countWords(c?.intro), 90]],
  location: [
    ['localIntro', (c) => countWords(c?.localIntro), 150],
    ['whyLocal', (c) => countWords(c?.whyLocal), 100],
    ['serviceArea', (c) => countWords(c?.serviceArea), 80],
  ],
};

const MIN_BLOG_POST_WORDS = 400;

function validatePageContentLength(pageType, content) {
  const rules = MIN_WORDS_BY_PAGE[pageType];
  const issues = [];

  if (rules) {
    for (const [field, getter, minimum] of rules) {
      const words = getter(content);
      if (words > 0 && words < minimum) {
        issues.push({ field, words, minimum });
      }
    }
  }

  if (pageType === 'blog' && Array.isArray(content?.posts)) {
    content.posts.forEach((post, index) => {
      const words = countBlogPostWords(post);
      if (words > 0 && words < MIN_BLOG_POST_WORDS) {
        issues.push({
          field: `posts[${index}] total content (intro + sections + conclusion)`,
          words,
          minimum: MIN_BLOG_POST_WORDS,
        });
      }
    });
  }

  return issues;
}

function buildLengthRetryFeedback(issues) {
  const lines = issues.map(
    (i) => `- ${i.field}: ${i.words} words (minimum ${i.minimum} required)`,
  );
  return [
    ' CRITICAL LENGTH CORRECTION:',
    'Your previous JSON was structurally valid but these body fields were too short:',
    ...lines,
    'Regenerate the COMPLETE JSON from scratch. Every field listed above MUST reach its minimum word count.',
    'Expand with specific, locally relevant detail about the business, city, and services — not generic filler.',
  ].join(' ');
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

  const userPrompt = buildPagePrompt(businessData, pageSchema, pageType, contextNote);
  const maxTokens = MAX_TOKENS_BY_PAGE[pageType] ?? 4500;
  const maxAttempts = 2;

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const raw = await callOpenAiForPage(systemPrompt, userPrompt, maxTokens);
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
