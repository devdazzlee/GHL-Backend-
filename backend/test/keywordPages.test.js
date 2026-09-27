import './helpers/env.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/database/client.js';
import {
  MAX_PAGES_PER_REQUEST,
  MIN_BODY_WORDS,
  countBodyWords,
  SIMILARITY_LIMIT,
  generateKeywordPages,
  getKeywordJob,
  parseKeywords,
  startKeywordGeneration,
  waitForKeywordJob,
} from '../src/services/keywordPage.service.js';
import { contentToText, textSimilarity } from '../src/services/textSimilarity.js';

const SITE = { id: 'site-1', slug: 'demo-pets-denver', businessName: 'Demo Pets', industry: 'Pet Boarding', city: 'Denver', state: 'CO', servicesContent: JSON.stringify({ services: [{ title: 'Dog Boarding' }, { title: 'Grooming' }] }) };
const CITIES = [
  { id: 'c1', siteId: 'site-1', city: 'Englewood', county: 'Arapahoe', state: 'CO', slug: 'englewood-arapahoe-county', content: JSON.stringify({ localIntro: 'Englewood sits along the South Platte River near Cornerstone Park.' }) },
  { id: 'c2', siteId: 'site-1', city: 'Lakewood', county: 'Jefferson', state: 'CO', slug: 'lakewood-jefferson-county', content: JSON.stringify({ localIntro: 'Lakewood borders Green Mountain and Belmar.' }) },
  { id: 'c3', siteId: 'other-site', city: 'Boulder', county: 'Boulder', state: 'CO', slug: 'boulder-boulder-county', content: '{}' },
];

let store;
function stubPrisma(initial = []) {
  store = [...initial];
  prisma.generatedSite.findUnique = async ({ where }) => (where.id === SITE.id || where.slug === SITE.slug ? SITE : null);
  prisma.locationPage.findMany = async ({ where }) =>
    CITIES.filter((c) => c.siteId === where.siteId && (!where.id?.in || where.id.in.includes(c.id)));
  prisma.keywordPage.findMany = async ({ where }) => store.filter((p) => p.siteId === where.siteId);
  prisma.keywordPage.create = async ({ data }) => {
    const row = { id: `kp-${store.length + 1}`, createdAt: new Date(), ...data };
    store.push(row);
    return row;
  };
}

// Deterministic "unique writer": different vocabulary per prompt, like real distinct copy.
function uniqueWriter() {
  let n = 0;
  return async (prompt) => {
    n += 1;
    let seed = [...prompt].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) + n * 9973;
    const word = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return `w${seed % 50000}`;
    };
    const para = (k) => Array.from({ length: k }, word).join(' ');
    return {
      seo: { title: para(6), metaDescription: para(20) },
      h1: para(8),
      intro: para(130),
      sections: Array.from({ length: 4 }, () => ({ heading: para(6), paragraphs: [para(90), para(90)] })),
      localNotes: [para(20), para(20), para(20)],
      faqs: Array.from({ length: 4 }, () => ({ question: para(10), answer: para(60) })),
      ctaHeading: para(5),
      ctaText: para(35),
    };
  };
}

describe('keyword parsing', () => {
  it('splits bulk paste, trims and dedupes case-insensitively', () => {
    assert.deepEqual(parseKeywords('dog boarding\nDog Boarding, cat sitting ;  puppy daycare \n\n'), ['dog boarding', 'cat sitting', 'puppy daycare']);
    assert.deepEqual(parseKeywords(['a b', 'A B']), ['a b']);
  });
  it('rejects empty and overlong input', () => {
    assert.throws(() => parseKeywords(''), (e) => e.code === 'INVALID_KEYWORD');
    assert.throws(() => parseKeywords('x'.repeat(81)), (e) => e.code === 'INVALID_KEYWORD');
  });
});

describe('similarity measure', () => {
  it('scores a city-swapped template far above the limit and different writing far below', () => {
    const base = 'Our dog boarding in Englewood gives your pet a safe, clean and friendly place to stay while you travel, with daily walks, play time and updates sent to you every evening.';
    const swapped = base.replace('Englewood', 'Lakewood');
    const different = 'Before you book overnight care, visit the kennel, ask how staff handle anxious dogs, and check that vaccination records are required for every guest.';
    assert.ok(textSimilarity(base, swapped) > 0.5, 'city swap should look near-duplicate');
    assert.ok(textSimilarity(base, different) < 0.05, 'different writing should not');
  });

  it('a longer template with the town repeated in every sentence still scores well above the limit', () => {
    const sentences = [
      'Pet owners in TOWN trust our team for safe overnight boarding.',
      'Every guest from TOWN gets two long walks and supervised play each day.',
      'Our TOWN clients receive photo updates every evening so they never worry.',
      'Suites are cleaned twice daily and each has fresh water and soft bedding.',
      'Families across TOWN book early for holidays because spaces fill quickly.',
      'We check vaccination records before every stay to keep all dogs healthy.',
    ];
    const page = (town) => sentences.join(' ').replaceAll('TOWN', town);
    const score = textSimilarity(page('Englewood'), page('Lakewood'));
    assert.ok(score > SIMILARITY_LIMIT + 0.2, `template swap scored ${score.toFixed(2)}`);
  });
});

describe('generateKeywordPages', () => {
  beforeEach(() => stubPrisma());

  it('acceptance: 5 keywords x 2 cities -> 10 unique DRAFT pages under the overlap limit', async () => {
    const result = await generateKeywordPages(
      'site-1',
      { keywords: 'dog boarding\ncat boarding\npuppy daycare\ndog grooming\npet taxi', locationPageIds: ['c1', 'c2'] },
      { generateFn: uniqueWriter() },
    );
    assert.equal(result.created.length, 10);
    assert.equal(result.rejected.length, 0);
    assert.equal(new Set(result.created.map((p) => p.slug)).size, 10);
    assert.ok(result.created.every((p) => p.status === 'DRAFT'));
    // pairwise overlap across all ten pages
    const texts = result.created.map((p) => contentToText(p.content));
    for (let i = 0; i < texts.length; i += 1) {
      for (let j = i + 1; j < texts.length; j += 1) {
        assert.ok(textSimilarity(texts[i], texts[j]) <= SIMILARITY_LIMIT, `pages ${i} and ${j} overlap too much`);
      }
    }
    assert.ok(result.created.some((p) => p.slug === 'dog-boarding-englewood'));
  });

  it(`caps a request at ${MAX_PAGES_PER_REQUEST} pages`, async () => {
    await assert.rejects(
      generateKeywordPages('site-1', { keywords: 'a1,a2,a3,a4,a5,a6', locationPageIds: ['c1', 'c2'] }, { generateFn: uniqueWriter() }),
      (e) => e.code === 'TOO_MANY_PAGES',
    );
    assert.equal(store.length, 0);
  });

  it('only accepts this site\'s own cities', async () => {
    await assert.rejects(
      generateKeywordPages('site-1', { keywords: 'dog boarding', locationPageIds: ['c3'] }, { generateFn: uniqueWriter() }),
      (e) => e.code === 'INVALID_CITIES',
    );
  });

  it('rejects near-duplicate output (retries once, then refuses to save)', async () => {
    let calls = 0;
    const templateWriter = async () => {
      calls += 1;
      const p = Array(6).fill('We provide reliable pet boarding with daily walks, play time, clean suites and caring staff for every guest.').join(' ');
      return { h1: 'Pet boarding', intro: p, sections: [1, 2, 3, 4].map(() => ({ heading: 'Why us', paragraphs: [p, p] })), faqs: [{ question: 'Why?', answer: p }] };
    };
    const result = await generateKeywordPages('site-1', { keywords: 'dog boarding', locationPageIds: ['c1', 'c2'] }, { generateFn: templateWriter });
    assert.equal(result.created.length, 1, 'first page is fine');
    assert.equal(result.rejected.length, 1, 'the second, identical page is refused');
    assert.match(result.rejected[0].reason, /too similar/);
    assert.equal(calls, 4, 'one call for page 1, three attempts for page 2');
    assert.equal(store.length, 1);
  });

  it(`retries short drafts and refuses pages under ${MIN_BODY_WORDS} words`, async () => {
    const prompts = [];
    const shortWriter = async (prompt) => {
      prompts.push(prompt);
      const writer = uniqueWriter();
      const full = await writer(prompt + prompts.length);
      // Every paragraph cut to 20 words: far below the minimum.
      return { ...full, intro: full.intro.split(' ').slice(0, 20).join(' '), sections: full.sections.map((s) => ({ ...s, paragraphs: s.paragraphs.map((p) => p.split(' ').slice(0, 20).join(' ')) })) };
    };
    const result = await generateKeywordPages('site-1', { keywords: 'dog boarding', locationPageIds: ['c1'] }, { generateFn: shortWriter });
    assert.equal(result.created.length, 0);
    assert.match(result.rejected[0].reason, /too short/);
    assert.equal(prompts.length, 3);
    assert.match(prompts[1], /previous draft body was only \d+ words/);
    assert.equal(store.length, 0);
  });

  it('counts body words from intro, section paragraphs and FAQ answers only', () => {
    const c = { h1: 'one two', intro: 'a b c', sections: [{ heading: 'x y', paragraphs: ['d e', 'f'] }], localNotes: ['n n n'], faqs: [{ question: 'q q', answer: 'g h' }] };
    assert.equal(countBodyWords(c), 8);
    assert.equal(countBodyWords(JSON.stringify(c)), 8);
  });

  it('skips pages that already exist', async () => {
    stubPrisma([{ id: 'kp-0', siteId: 'site-1', slug: 'dog-boarding-englewood', content: '{}' }]);
    const result = await generateKeywordPages('site-1', { keywords: 'dog boarding', locationPageIds: ['c1', 'c2'] }, { generateFn: uniqueWriter() });
    assert.deepEqual(result.skipped.map((s) => s.slug), ['dog-boarding-englewood']);
    assert.deepEqual(result.created.map((p) => p.slug), ['dog-boarding-lakewood']);
  });
});

describe('background generation jobs', () => {
  beforeEach(() => stubPrisma());

  it('validates before starting: bad input fails immediately with no AI call', async () => {
    let calls = 0;
    await assert.rejects(
      startKeywordGeneration('site-1', { keywords: 'a1,a2,a3,a4,a5,a6', locationPageIds: ['c1', 'c2'] }, { generateFn: async () => { calls += 1; return {}; } }),
      (e) => e.code === 'TOO_MANY_PAGES',
    );
    assert.equal(calls, 0);
  });

  it('runs in the background, reports progress and the result, and blocks a second run on the same site', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const writer = uniqueWriter();
    const job = await startKeywordGeneration(
      'site-1',
      { keywords: 'dog boarding', locationPageIds: ['c1', 'c2'] },
      { generateFn: async (p) => { await gate; return writer(p); } },
    );
    assert.equal(job.status, 'running');
    assert.equal(job.total, 2);
    await assert.rejects(
      startKeywordGeneration('site-1', { keywords: 'cat boarding', locationPageIds: ['c1'] }, { generateFn: writer }),
      (e) => e.status === 409 || e.statusCode === 409 || e.code === 'KEYWORD_JOB_RUNNING',
    );
    release();
    await waitForKeywordJob(job.id);
    const finished = getKeywordJob('site-1', job.id);
    assert.equal(finished.status, 'done');
    assert.equal(finished.done, 2);
    assert.equal(finished.result.created.length, 2);
    assert.throws(() => getKeywordJob('other-site', job.id), (e) => e.code === 'JOB_NOT_FOUND');
  });
});
