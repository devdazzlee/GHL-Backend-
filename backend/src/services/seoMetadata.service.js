import OpenAI from 'openai';
import { env } from '../config/env.js';

/** Google SERP best-practice character limits (enforced at generation time). */
export const SEO_TITLE_MIN = 50;
export const SEO_TITLE_MAX = 60;
export const SEO_META_MIN = 120;
export const SEO_META_MAX = 155;

/** Uses the region label exactly as stored on the site record — no geo guessing. */
function formatLocationSegment(value) {
  return String(value ?? '').trim();
}

function formatIndustryLabel(industry) {
  const value = formatLocationSegment(industry);
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function seoTextLength(text) {
  return String(text ?? '').trim().length;
}

export function isValidSeoTitle(title) {
  const length = seoTextLength(title);
  return length >= SEO_TITLE_MIN && length <= SEO_TITLE_MAX;
}

export function isValidSeoMetaDescription(description) {
  const length = seoTextLength(description);
  return length >= SEO_META_MIN && length <= SEO_META_MAX;
}

export function validateSeoBlock(seo) {
  const issues = [];

  if (!isValidSeoTitle(seo?.title)) {
    issues.push({
      field: 'title',
      length: seoTextLength(seo?.title),
      minimum: SEO_TITLE_MIN,
      maximum: SEO_TITLE_MAX,
    });
  }

  if (!isValidSeoMetaDescription(seo?.metaDescription)) {
    issues.push({
      field: 'metaDescription',
      length: seoTextLength(seo?.metaDescription),
      minimum: SEO_META_MIN,
      maximum: SEO_META_MAX,
    });
  }

  return issues;
}

function trimToMax(text, max) {
  const value = String(text ?? '').trim();
  if (value.length <= max) return value;

  const slice = value.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace >= SEO_TITLE_MIN - 10) {
    return slice.slice(0, lastSpace).trim();
  }

  return slice.trim();
}

function padToMin(text, min, suffix) {
  let value = String(text ?? '').trim();
  if (value.length >= min) return value;

  const addition = String(suffix ?? '').trim();
  if (!addition) return value;

  const combined = `${value}${value.endsWith('.') ? ' ' : ' | '}${addition}`;
  return combined.length >= min ? combined : value;
}

/**
 * Deterministic SEO title composition — canonical product format when AI output
 * misses length targets. Tries multiple templates before trimming.
 */
export function composeSeoTitle({
  businessName,
  industry,
  city,
  state,
  pageKind = 'home',
  locationCity,
  subjectTitle,
}) {
  const name = formatLocationSegment(businessName);
  const place = formatLocationSegment(city);
  const st = formatLocationSegment(state);
  const ind = formatIndustryLabel(industry);
  const loc = formatLocationSegment(locationCity) || place;
  const subject = formatLocationSegment(subjectTitle);

  const templatesByKind = {
    home: [
      `${name} | ${ind} Services in ${place}, ${st}`,
      `${name} | Trusted ${ind} Professionals in ${place}, ${st}`,
      `${name} - Local ${ind} Experts Serving ${place}, ${st}`,
    ],
    about: [
      `About ${name} | ${ind} Company in ${place}, ${st}`,
      `${name} About Us | Trusted ${ind} in ${place}, ${st}`,
    ],
    services: [
      `${name} Services | ${ind} in ${place}, ${st}`,
      `${ind} Services in ${place}, ${st} | ${name}`,
    ],
    contact: [
      `Contact ${name} | ${ind} Services in ${place}, ${st}`,
      `${name} Contact | ${ind} Experts in ${place}, ${st}`,
    ],
    blog: [
      `${name} Blog | ${ind} Tips and Guides for ${place}, ${st}`,
      `${ind} Blog in ${place}, ${st} | ${name} Insights`,
    ],
    location: [
      `${name} in ${loc}, ${st} | Local ${ind} Services`,
      `${loc} ${ind} Services | Trusted Local Experts | ${name}`,
    ],
    service: subject
      ? [
          `${subject} | ${name} | ${place}, ${st}`,
          `${subject} in ${place}, ${st} | ${name}`,
        ]
      : [],
    blogPost: subject
      ? [
          `${subject} | ${name} Blog | ${place}, ${st}`,
          `${subject} | ${ind} Tips | ${name}`,
        ]
      : [],
  };

  const templates =
    templatesByKind[pageKind]?.length > 0
      ? templatesByKind[pageKind]
      : templatesByKind.home;

  for (const template of templates) {
    const trimmed = trimToMax(template, SEO_TITLE_MAX);
    if (isValidSeoTitle(trimmed)) {
      return trimmed;
    }
  }

  const fallback = trimToMax(templates[0], SEO_TITLE_MAX);
  return padToMin(fallback, SEO_TITLE_MIN, `${place}, ${st}`);
}

export function composeSeoMetaDescription({
  businessName,
  industry,
  city,
  state,
  phone,
  pageKind = 'home',
  locationCity,
  subjectTitle,
}) {
  const name = formatLocationSegment(businessName);
  const place = formatLocationSegment(city);
  const st = formatLocationSegment(state);
  const ind = formatIndustryLabel(industry).toLowerCase();
  const loc = formatLocationSegment(locationCity) || place;
  const subject = formatLocationSegment(subjectTitle);
  const phoneText = formatLocationSegment(phone);
  const callToAction = phoneText
    ? ` Call ${phoneText} today for a free consultation.`
    : ' Contact us today for a free consultation.';

  const baseTemplates = {
    home: `${name} provides trusted ${ind} services in ${place}, ${st}. Serving local homeowners and businesses with professional, reliable solutions.${callToAction}`,
    about: `Learn about ${name}, a locally owned ${ind} company serving ${place}, ${st}. Discover our story, team, and commitment to quality service for every customer.${callToAction}`,
    services: `Explore ${ind} services from ${name} in ${place}, ${st}. From routine work to complex projects, our local team delivers dependable results for customers nearby.${callToAction}`,
    contact: `Contact ${name} in ${place}, ${st} for ${ind} services. Request a quote, schedule service, or speak with our local team for fast, friendly assistance.${callToAction}`,
    blog: `Read ${ind} tips, guides, and local insights from ${name} in ${place}, ${st}. Stay informed with expert advice for homeowners and businesses in your area.${callToAction}`,
    location: `${name} proudly serves ${loc}, ${st} with professional ${ind} services. Local experts who know the area — reliable service for residents and businesses nearby.${callToAction}`,
  };

  const templatesByKind = {
    ...baseTemplates,
    service: subject
      ? `${name} offers professional ${subject.toLowerCase()} in ${place}, ${st}. Local experts delivering dependable results for homeowners and businesses throughout the area.${callToAction}`
      : baseTemplates.services,
    blogPost: subject
      ? `Read ${subject.toLowerCase()} from ${name} in ${place}, ${st}. Practical ${ind} tips and local guidance for homeowners and businesses in your community.${callToAction}`
      : baseTemplates.blog,
  };

  const template = templatesByKind[pageKind] ?? baseTemplates.home;
  return trimToMax(template, SEO_META_MAX);
}

export function buildSeoRequirements({ businessName, industry, city, state }) {
  return [
    ' IMPORTANT SEO REQUIREMENTS:',
    `SEO title MUST be ${SEO_TITLE_MIN}-${SEO_TITLE_MAX} characters (strict minimum ${SEO_TITLE_MIN}).`,
    `SEO meta description MUST be ${SEO_META_MIN}-${SEO_META_MAX} characters (strict minimum ${SEO_META_MIN}).`,
    `Include city name ${city} and state ${state} naturally at least 3 times in body copy.`,
    `Include industry keyword ${industry} naturally at least 4 times in body copy.`,
    `Include business name ${businessName} naturally at least 2 times per section.`,
    `Use long tail keywords related to ${industry} services in ${city}.`,
    'Write minimum 150 words per paragraph not 60-80.',
    'Add specific details about services offered.',
    `Make content feel local and specific to ${city} ${state}.`,
    'Word counts in the schema are strict minimums — reach the lower bound of every range.',
    'Keep writing natural and human; never keyword-stuff or sacrifice readability.',
  ].join(' ');
}

async function callOpenAiForSeo(systemPrompt, userPrompt) {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OpenAI is not configured');
  }

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.4,
    max_tokens: 200,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error('OpenAI returned empty SEO metadata');
  }

  return JSON.parse(raw);
}

async function regenerateSeoField({
  field,
  businessData,
  pageKind,
  currentValue,
  systemPrompt,
  locationCity,
  subjectTitle,
}) {
  const { businessName, industry, city, state, phone } = businessData;
  const limits =
    field === 'title'
      ? `${SEO_TITLE_MIN}-${SEO_TITLE_MAX} characters`
      : `${SEO_META_MIN}-${SEO_META_MAX} characters`;

  const userPrompt = [
    `Rewrite the SEO ${field} for the ${pageKind} page of ${businessName}, a ${industry} business in ${city}, ${state}.`,
    locationCity ? `This location page targets ${locationCity}, ${state}.` : '',
    subjectTitle ? `The page subject is "${subjectTitle}".` : '',
    `Current draft (${seoTextLength(currentValue)} chars): "${currentValue}"`,
    `Return ONLY valid JSON: { "${field}": "..." }`,
    `The ${field} MUST be ${limits}, include the business name, city, and industry keyword, and read naturally.`,
    field === 'metaDescription' && phone ? `Include phone number ${phone} when it fits naturally.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const parsed = await callOpenAiForSeo(systemPrompt, userPrompt);
  return String(parsed?.[field] ?? '').trim();
}

/**
 * Validates and normalizes a page's seo block. Uses AI regeneration first,
 * then the canonical compose functions — never saves invalid metadata.
 */
export async function ensureSeoMetadata(
  content,
  businessData,
  pageKind,
  systemPrompt,
  options = {},
) {
  if (!content || typeof content !== 'object') {
    return content;
  }

  const result = { ...content };
  const seo = { ...(result.seo ?? {}) };
  const issues = validateSeoBlock(seo);

  if (issues.length === 0) {
    result.seo = seo;
    return result;
  }

  for (const issue of issues) {
    let value = issue.field === 'title' ? seo.title : seo.metaDescription;

    try {
      value = await regenerateSeoField({
        field: issue.field,
        businessData,
        pageKind,
        currentValue: value,
        systemPrompt,
        locationCity: options.locationCity,
        subjectTitle: options.subjectTitle,
      });
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: 'seo_field_regenerate_failed',
          field: issue.field,
          pageKind,
          error: error?.message ?? String(error),
          businessName: businessData?.businessName,
        }),
      );
    }

    const stillInvalid =
      issue.field === 'title' ? !isValidSeoTitle(value) : !isValidSeoMetaDescription(value);

    if (stillInvalid) {
      value =
        issue.field === 'title'
          ? composeSeoTitle({
              businessName: businessData.businessName,
              industry: businessData.industry,
              city: businessData.city,
              state: businessData.state,
              pageKind,
              locationCity: options.locationCity,
              subjectTitle: options.subjectTitle,
            })
          : composeSeoMetaDescription({
              businessName: businessData.businessName,
              industry: businessData.industry,
              city: businessData.city,
              state: businessData.state,
              phone: businessData.phone,
              pageKind,
              locationCity: options.locationCity,
              subjectTitle: options.subjectTitle,
            });
    }

    if (issue.field === 'title') {
      seo.title = value;
    } else {
      seo.metaDescription = value;
    }
  }

  result.seo = seo;

  const remaining = validateSeoBlock(seo);
  if (remaining.length > 0) {
    console.warn(
      JSON.stringify({
        event: 'seo_metadata_validation_remaining',
        pageKind,
        issues: remaining,
        businessName: businessData?.businessName,
      }),
    );
  }

  return result;
}
