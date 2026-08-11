/**
 * Content unit runner for site generation.
 * Each unit is generated until it meets the ContentContract — never ship under-min copy.
 * Length misses regenerate the SAME unit with concrete word-count feedback (not a separate expand patch).
 * Hard errors only for infra (missing API key / empty responses after retries).
 */

import OpenAI from 'openai';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import {
  LENGTH_CRITICAL_TEMPERATURE,
  LENGTH_PRIORITY_PREAMBLE,
  validateUnit,
  countWords,
  countBlogPostWords,
  scrubGeneratedContent,
} from './contentContract.js';

const OPENAI_CONTENT_MODEL = 'gpt-4o';
/** First attempt + length-feedback regenerations until contract is met. */
const MAX_UNIT_ATTEMPTS = 4;

export class ContentUnitError extends Error {
  constructor(message, { unitId, issues, cause, code } = {}) {
    super(message);
    this.name = 'ContentUnitError';
    this.unitId = unitId;
    this.issues = issues || [];
    this.code = code || 'CONTENT_UNIT_FAILED';
    this.cause = cause;
  }
}

function parseJsonContent(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error('Invalid JSON from OpenAI');
  }
}

function buildLengthFeedback(issues, previousContent) {
  const lines = (issues || []).map(
    (i) => `- ${i.field}: got ${i.words} words, MUST be at least ${i.minimum}`,
  );
  return [
    'LENGTH CORRECTION (VERY IMPORTANT — regenerate the FULL JSON for this unit):',
    'Your previous response was structurally usable but failed hard word floors:',
    ...lines,
    'Every listed field MUST reach its minimum. Prefer concrete local detail over filler.',
    'Do not shorten other fields to finish — meet every minimum.',
    previousContent
      ? `Previous draft JSON (fix the short fields, keep good parts): ${JSON.stringify(previousContent).slice(0, 6000)}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Generate one content unit that meets contract floors.
 * Length misses → regenerate same unit with feedback (site generation must succeed with valid length).
 */
export async function generateUnit({
  unitId,
  systemPrompt,
  userPrompt,
  maxTokens = 2500,
  temperature = LENGTH_CRITICAL_TEMPERATURE,
  normalize,
  validateAs,
}) {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError('OpenAI is not configured.', 503, { code: 'OPENAI_NOT_CONFIGURED' });
  }

  const client = new OpenAI({ apiKey });
  const validationId = validateAs || unitId;
  let lastInfraError;
  let lastIssues = [];
  let lastContent = null;

  for (let attempt = 1; attempt <= MAX_UNIT_ATTEMPTS; attempt += 1) {
    const lengthNote =
      attempt > 1 && lastIssues.length > 0
        ? `\n\n${buildLengthFeedback(lastIssues, lastContent)}`
        : '';

    try {
      const completion = await client.chat.completions.create({
        model: OPENAI_CONTENT_MODEL,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `${LENGTH_PRIORITY_PREAMBLE}\n\n${userPrompt}${lengthNote}`,
          },
        ],
      });

      const choice = completion.choices[0];
      const finishReason = choice?.finish_reason;
      const raw = choice?.message?.content?.trim();
      if (!raw) {
        throw new Error('OpenAI returned empty content');
      }

      let content = parseJsonContent(raw);
      content = scrubGeneratedContent(content);
      if (typeof normalize === 'function') {
        content = normalize(content);
      }

      const { ok, issues } = validateUnit(validationId, content);
      const wordsSummary = summarizeWords(validationId, content);

      console.info(
        JSON.stringify({
          event: 'content_unit_attempt',
          unitId,
          attempt,
          ok,
          issues,
          words: wordsSummary,
          finishReason,
          completionTokens: completion.usage?.completion_tokens ?? null,
          firstPassUnitOk: attempt === 1 && ok && finishReason !== 'length',
          usedLengthFeedback: attempt > 1,
        }),
      );

      if (finishReason === 'length') {
        lastIssues = [{ field: 'finish_reason', words: 0, minimum: 1 }];
        lastContent = content;
        console.warn(
          JSON.stringify({
            event: 'content_unit_truncated_retry',
            unitId,
            attempt,
          }),
        );
        continue;
      }

      if (!ok) {
        lastIssues = issues;
        lastContent = content;
        console.warn(
          JSON.stringify({
            event: 'content_unit_length_regenerate',
            unitId,
            attempt,
            issues,
          }),
        );
        continue;
      }

      return content;
    } catch (e) {
      // Parse/API errors — retry; do not treat as permanent failure yet.
      lastInfraError = e;
      console.warn(
        JSON.stringify({
          event: 'content_unit_infra_retry',
          unitId,
          attempt,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }

  // Last resort: if we have a draft, one more aggressive regenerate was already in the loop.
  // Only then surface infra failure — length should have been fixed by feedback regenerations.
  throw new ContentUnitError(
    `Unit "${unitId}" could not be completed after ${MAX_UNIT_ATTEMPTS} attempts${
      lastIssues.length
        ? `: ${lastIssues.map((i) => `${i.field}:${i.words}<${i.minimum}`).join(',')}`
        : ''
    }`,
    {
      unitId,
      issues: lastIssues,
      cause: lastInfraError,
      code: lastIssues.length ? 'CONTENT_UNIT_LENGTH_OR_SHAPE' : 'CONTENT_UNIT_INFRA',
    },
  );
}

function summarizeWords(unitId, content) {
  switch (unitId) {
    case 'blog.body':
      return { body: countBlogPostWords(content) };
    case 'blog.faqs':
    case 'servicePage.faqs':
    case 'seoExtra.faqs':
      return {
        faqAnswers: (content?.faqs || []).map((f) => countWords(f?.answer)),
      };
    case 'servicePage.overview':
    case 'servicePage.full':
      return {
        overview: countWords(content?.overview),
        faqAnswers: (content?.faqs || []).map((f) => countWords(f?.answer)),
      };
    case 'services.intro':
    case 'contact.intro':
      return { intro: countWords(content?.intro ?? content?.text) };
    case 'services.fullDescription':
      return { fullDescription: countWords(content?.fullDescription) };
    case 'home.about':
      return {
        paragraph1: countWords(content?.paragraph1),
        paragraph2: countWords(content?.paragraph2),
      };
    case 'location.fields':
      return {
        localIntro: countWords(content?.localIntro),
        whyLocal: countWords(content?.whyLocal),
        serviceArea: countWords(content?.serviceArea),
      };
    case 'seoExtra':
      return {
        paragraphs: (content?.paragraphs || []).map((p) => countWords(p)),
        links: Array.isArray(content?.links) ? content.links.length : 0,
        faqAnswers: (content?.faqs || []).map((f) => countWords(f?.answer)),
      };
    default:
      return {};
  }
}

/**
 * Run async tasks with a concurrency limit.
 * @template T
 * @param {Array<() => Promise<T>>} tasks
 * @param {number} limit
 * @returns {Promise<T[]>}
 */
export async function mapPool(tasks, limit = 3) {
  const results = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const i = next;
      next += 1;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
