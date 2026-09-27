import './helpers/env.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/database/client.js';
import { classifyRequest } from '../src/middleware/phase4Auth.js';
import {
  MIN_POST_WORDS,
  buildBlogSettingsUpdate,
  deleteBlogPost,
  getPublicBlog,
  getPublicBlogPost,
  importLegacyPosts,
  localParts,
  nextAutoSlot,
  pickNewTopics,
  resetAutoPostState,
  runDueAutoPosts,
  settingsFromSite,
  titleSimilarity,
  updateBlogPost,
  updateBlogSettings,
} from '../src/services/blog.service.js';
import { countMarkdownWords, slugifyTitle, structuredPostToMarkdown } from '../src/services/blogMarkdown.js';

// ---- In-memory stand-in for the Prisma calls the blog service makes ----

function matches(row, where = {}) {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return cond.some((c) => matches(row, c));
    const value = row[key] ?? null;
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('not' in cond) return value !== cond.not;
      if ('startsWith' in cond) return String(value ?? '').startsWith(cond.startsWith);
      if ('in' in cond) return cond.in.includes(value);
    }
    return value === cond;
  });
}

function unique(rows, row) {
  const clash = rows.some(
    (r) =>
      r.id !== row.id &&
      r.siteId === row.siteId &&
      (r.slug === row.slug || (row.autoSlot != null && r.autoSlot === row.autoSlot)),
  );
  if (clash) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

let sites;
let posts;
let nextId;

function stubPrisma(siteRows) {
  sites = siteRows.map((s) => ({ ...s }));
  posts = [];
  nextId = 1;
  prisma.generatedSite.findUnique = async ({ where }) => sites.find((s) => (where.id ? s.id === where.id : s.slug === where.slug)) ?? null;
  prisma.generatedSite.findMany = async ({ where }) => sites.filter((s) => matches(s, where));
  prisma.generatedSite.update = async ({ where, data }) => Object.assign(sites.find((s) => s.id === where.id), data);
  prisma.locationPage.findMany = async () => [{ city: 'Englewood' }, { city: 'Lakewood' }];
  prisma.blogPost = {
    count: async ({ where }) => posts.filter((p) => matches(p, where)).length,
    findMany: async ({ where }) => posts.filter((p) => matches(p, where)).map((p) => ({ ...p })),
    findFirst: async ({ where }) => {
      const row = posts.find((p) => matches(p, where));
      return row ? { ...row } : null;
    },
    create: async ({ data }) => {
      const row = { id: `bp-${nextId++}`, createdAt: new Date(), editedAt: null, publishedAt: null, deletedAt: null, legacyIndex: null, autoSlot: null, ...data };
      unique(posts, row);
      posts.push(row);
      return { ...row };
    },
    update: async ({ where, data }) => {
      const row = posts.find((p) => p.id === where.id);
      unique(posts, { ...row, ...data });
      Object.assign(row, data);
      return { ...row };
    },
    delete: async ({ where }) => {
      posts = posts.filter((p) => p.id !== where.id);
    },
  };
  prisma.$transaction = async (ops) => Promise.all(ops);
}

// ---- Fixtures ----

const words = (n, seed) => Array.from({ length: n }, (_, i) => `${seed}${i}`).join(' ');

function legacyPost(n) {
  return {
    title: ['How often should you board your dog', 'Preparing your cat for a kennel stay', 'Choosing a pet sitter for the holidays'][n],
    excerpt: 'Short summary.',
    category: 'Tips',
    coverImageUrl: `https://images.example.com/legacy-${n}.jpg`,
    introduction: words(80, `intro${n}w`),
    sections: [{ heading: `Section ${n}`, paragraphs: [words(60, `s${n}p`)], subsections: [{ heading: 'Detail', paragraphs: [words(40, `d${n}p`)] }] }],
    inlineImages: [{ afterSection: 0, url: `https://images.example.com/inline-${n}.jpg`, alt: 'Inline' }],
    conclusion: words(30, `c${n}w`),
    faqs: [{ question: 'Q?', answer: 'A.' }],
    internalLinks: [{ label: 'Our services', path: 'services' }],
    seo: { title: 'SEO', metaDescription: 'Meta' },
  };
}

// Mon 6 Oct 2025 15:30 UTC = 09:30 in Denver (MDT).
const MONDAY_0930_DENVER = new Date('2025-10-06T15:30:00Z');
const MONDAY_0730_DENVER = new Date('2025-10-06T13:30:00Z');
const THURSDAY_0930_DENVER = new Date('2025-10-09T15:30:00Z');

function site(overrides = {}) {
  return {
    id: 'site-1',
    slug: 'paws-denver',
    businessName: 'Paws Retreat',
    industry: 'Pet Boarding',
    city: 'Denver',
    state: 'Colorado',
    createdAt: new Date('2025-08-01T00:00:00Z'),
    servicesContent: JSON.stringify({ services: [{ title: 'Dog Boarding' }] }),
    blogContent: JSON.stringify({ posts: [legacyPost(0), legacyPost(1), legacyPost(2)] }),
    blogEnabled: null,
    blogAutoEnabled: true,
    blogAutoDays: '1,4',
    blogAutoHour: 9,
    blogTimezone: 'America/Denver',
    ...overrides,
  };
}

/** A writer whose every post is long, distinct text (like real separate articles). */
function fakeWriter() {
  let n = 0;
  const calls = [];
  const fn = async (_site, topic) => {
    n += 1;
    calls.push(topic.title);
    return {
      title: topic.title,
      excerpt: `About ${topic.title}`,
      category: topic.category,
      introduction: words(180, `auto${n}i`),
      sections: [0, 1, 2, 3].map((k) => ({ heading: `Part ${k}`, paragraphs: [words(240, `auto${n}s${k}`)], subsections: [{ heading: 'More', paragraphs: [words(120, `auto${n}h${k}`)] }] })),
      conclusion: words(140, `auto${n}c`),
      faqs: [1, 2, 3, 4, 5].map((k) => ({ question: `Question ${k}?`, answer: words(70, `auto${n}f${k}`) })),
      internalLinks: [{ label: 'See our services', path: 'services' }, { label: 'Contact us', path: 'contact' }],
      coverImageUrl: `https://images.example.com/auto-${n}.jpg`,
      seo: { title: `${topic.title} | Paws Retreat`, metaDescription: 'Meta description' },
    };
  };
  return Object.assign(fn, { calls });
}

const topics = (...titles) => async () => titles.map((title) => ({ title, excerpt: 'x', category: 'Tips' }));
const noRevalidate = async () => ({ ok: true });

// ---- Tests ----

describe('blog markdown', () => {
  it('turns a generated post into editable Markdown with headings, images and conclusion', () => {
    const md = structuredPostToMarkdown(legacyPost(0));
    assert.match(md, /^intro0w0 /);
    assert.match(md, /\n\n## Section 0\n\n/);
    assert.match(md, /\n\n### Detail\n\n/);
    assert.match(md, /\n\n!\[Inline\]\(https:\/\/images\.example\.com\/inline-0\.jpg\)\n\n/);
    assert.ok(md.trimEnd().endsWith('c0w29'));
  });

  it('counts only visible words', () => {
    assert.equal(countMarkdownWords('## Two words\n\none two [three four](/x)\n\n![alt text](https://a.b/c.jpg)\n\n- five'), 7);
  });

  it('makes URL-safe slugs', () => {
    assert.equal(slugifyTitle('Dogs & Cats: Winter Care Tips!'), 'dogs-and-cats-winter-care-tips');
  });
});

describe('topic de-duplication', () => {
  const ignore = ['Paws Retreat', 'Denver', 'Colorado'];
  it('treats a reworded title as the same topic', () => {
    assert.ok(titleSimilarity('Winter dog boarding tips for Denver pet owners', 'Top tips for winter dog boarding in Denver', ignore) >= 0.5);
  });
  it('treats a different subject as a new topic', () => {
    assert.ok(titleSimilarity('What to pack for your dog\'s boarding stay', 'How to choose a dog boarding facility', ignore) < 0.5);
  });
  it('drops candidates that repeat history or each other', () => {
    const picked = pickNewTopics(
      [{ title: 'How often should you board your dog?' }, { title: 'Senior cats and long kennel stays' }, { title: 'Long kennel stays for senior cats' }],
      ['How often should you board your dog'],
      ignore,
    );
    assert.deepEqual(picked.map((t) => t.title), ['Senior cats and long kennel stays']);
  });
});

describe('schedule settings', () => {
  it('validates days (2-3), hour and time zone', () => {
    assert.throws(() => buildBlogSettingsUpdate({ days: [1] }), (e) => e.code === 'INVALID_BLOG_DAYS');
    assert.throws(() => buildBlogSettingsUpdate({ days: [1, 2, 3, 4] }), (e) => e.code === 'INVALID_BLOG_DAYS');
    assert.throws(() => buildBlogSettingsUpdate({ hour: 24 }), (e) => e.code === 'INVALID_BLOG_HOUR');
    assert.throws(() => buildBlogSettingsUpdate({ timezone: 'Mars/Olympus' }), (e) => e.code === 'INVALID_TIMEZONE');
    assert.deepEqual(buildBlogSettingsUpdate({ days: [4, 1, 1], hour: 7, timezone: 'America/Chicago' }), { blogAutoDays: '1,4', blogAutoHour: 7, blogTimezone: 'America/Chicago' });
  });

  it('reads the local day and hour in the site time zone', () => {
    assert.deepEqual(localParts(MONDAY_0930_DENVER, 'America/Denver'), { date: '2025-10-06', weekday: 1, hour: 9 });
  });

  it('defaults to off, and blog on when never set', () => {
    const s = settingsFromSite({});
    assert.equal(s.blogEnabled, true);
    assert.equal(s.autoEnabled, false);
    assert.equal(nextAutoSlot(s, MONDAY_0930_DENVER), null);
  });

  it('reports the next slot, skipping used ones', () => {
    const s = settingsFromSite(site());
    assert.deepEqual(nextAutoSlot(s, MONDAY_0930_DENVER), { date: '2025-10-06', hour: 9, timezone: 'America/Denver', dueNow: true });
    assert.equal(nextAutoSlot(s, MONDAY_0930_DENVER, new Set(['2025-10-06'])).date, '2025-10-09');
  });
});

describe('import of the posts generated with the site', () => {
  beforeEach(() => stubPrisma([site({ blogAutoEnabled: false })]));

  it('copies them once, published, keeping old /blog/{n} positions and stored images', async () => {
    assert.equal((await importLegacyPosts('site-1')).imported, 3);
    assert.equal((await importLegacyPosts('site-1')).imported, 0);
    assert.equal(posts.length, 3);
    assert.deepEqual(posts.map((p) => p.legacyIndex), [0, 1, 2]);
    assert.ok(posts.every((p) => p.status === 'PUBLISHED' && p.source === 'IMPORTED'));
    assert.equal(posts[0].imageUrl, 'https://images.example.com/legacy-0.jpg');
    assert.equal(posts[0].slug, 'how-often-should-you-board-your-dog');
  });

  it('stores a cover image for posts that had none (no more daily random picture)', async () => {
    sites[0].blogContent = JSON.stringify({ posts: [{ ...legacyPost(0), coverImageUrl: null }] });
    await importLegacyPosts('site-1', { coverImageFn: async () => 'https://images.example.com/picked-once.jpg' });
    assert.equal(posts[0].imageUrl, 'https://images.example.com/picked-once.jpg');
  });
});

describe('automatic posts (acceptance: schedule -> publish -> edit -> next run leaves the edit alone)', () => {
  beforeEach(() => {
    resetAutoPostState();
    stubPrisma([site()]);
  });

  it('does nothing before the scheduled hour or on other days', async () => {
    const writer = fakeWriter();
    const deps = { suggestTopicsFn: topics('Senior dog care in cold weather'), writePostFn: writer, revalidateFn: noRevalidate };
    assert.equal((await runDueAutoPosts(MONDAY_0730_DENVER, deps))[0].status, 'not_due');
    assert.equal((await runDueAutoPosts(new Date('2025-10-07T15:30:00Z'), deps))[0].status, 'not_due');
    assert.equal(writer.calls.length, 0);
    assert.equal(posts.length, 0);
  });

  it('publishes on schedule, keeps the dashboard edit through the next scheduled run', async () => {
    const writer = fakeWriter();
    let revalidated = 0;
    const deps = {
      suggestTopicsFn: topics('How often should you board your dog?', 'Senior dog care in cold weather', 'Crate training before a first stay'),
      writePostFn: writer,
      revalidateFn: async () => {
        revalidated += 1;
      },
    };

    // Monday 09:30 in Denver: due.
    const [first] = await runDueAutoPosts(MONDAY_0930_DENVER, deps);
    assert.equal(first.status, 'published');
    assert.deepEqual(writer.calls, ['Senior dog care in cold weather'], 'the repeated topic was skipped before writing');
    const auto = posts.find((p) => p.source === 'AUTO');
    assert.equal(auto.status, 'PUBLISHED');
    assert.equal(auto.autoSlot, '2025-10-06');
    assert.equal(auto.slug, 'senior-dog-care-in-cold-weather');
    assert.ok(countMarkdownWords(auto.body) >= MIN_POST_WORDS);
    assert.equal(JSON.parse(auto.faqs).length, 5);
    assert.ok(JSON.parse(auto.links).length >= 2);
    assert.equal(auto.imageUrl, 'https://images.example.com/auto-1.jpg');
    assert.equal(posts.filter((p) => p.source === 'IMPORTED').length, 3, 'original posts were imported first');
    assert.equal(revalidated, 1);

    // The same slot again (next tick, or a second server): nothing new.
    assert.equal((await runDueAutoPosts(new Date('2025-10-06T16:40:00Z'), deps))[0].status, 'already_done');
    assert.equal(writer.calls.length, 1);

    // Edit it from the dashboard.
    await updateBlogPost('site-1', auto.id, { title: 'Cold-weather care for senior dogs (edited)', body: 'Edited body text.', imageUrl: 'https://res.cloudinary.com/demo/edited.jpg' });
    const edited = { ...posts.find((p) => p.id === auto.id) };
    assert.equal(edited.slug, 'senior-dog-care-in-cold-weather', 'URL unchanged by a title edit');
    assert.ok(edited.editedAt);

    // Thursday 09:30: the next scheduled run writes a new post and leaves the edit alone.
    const [second] = await runDueAutoPosts(THURSDAY_0930_DENVER, deps);
    assert.equal(second.status, 'published');
    assert.equal(second.post.slug, 'crate-training-before-a-first-stay');
    assert.deepEqual(posts.find((p) => p.id === auto.id), edited);
    assert.equal(posts.filter((p) => p.source === 'AUTO').length, 2);
  });

  it('refuses a topic already covered, even by a deleted post, releases the slot and gives up after 3 tries', async () => {
    await importLegacyPosts('site-1');
    await deleteBlogPost('site-1', posts[0].id);
    const writer = fakeWriter();
    const deps = { suggestTopicsFn: topics('How often should you board your dog', 'Preparing your cat for a kennel stay'), writePostFn: writer, revalidateFn: noRevalidate };
    for (let i = 0; i < 3; i += 1) {
      const [r] = await runDueAutoPosts(MONDAY_0930_DENVER, deps);
      assert.equal(r.status, 'failed');
      assert.match(r.error, /repeats an earlier post/);
    }
    assert.equal((await runDueAutoPosts(MONDAY_0930_DENVER, deps))[0].status, 'gave_up');
    assert.equal(writer.calls.length, 0);
    assert.equal(posts.filter((p) => p.source === 'AUTO').length, 0, 'no half-written post left behind');
  });

  it('a retitled post still blocks its original topic', async () => {
    await importLegacyPosts('site-1');
    await updateBlogPost('site-1', posts[0].id, { title: 'Something else entirely' });
    const writer = fakeWriter();
    const deps = { suggestTopicsFn: topics('How often should you board your dog', 'Crate training before a first stay'), writePostFn: writer, revalidateFn: noRevalidate };
    const [r] = await runDueAutoPosts(MONDAY_0930_DENVER, deps);
    assert.equal(r.status, 'published');
    assert.deepEqual(writer.calls, ['Crate training before a first stay']);
    assert.equal(r.post.topic, 'Crate training before a first stay');
  });

  it('rejects a post under the word minimum and tries the next topic', async () => {
    const full = fakeWriter();
    let n = 0;
    const writer = async (s, topic) => {
      n += 1;
      const post = await full(s, topic);
      return n === 1 ? { ...post, sections: post.sections.slice(0, 1) } : post;
    };
    const deps = { suggestTopicsFn: topics('Short topic one', 'Crate training before a first stay'), writePostFn: writer, revalidateFn: noRevalidate };
    const [r] = await runDueAutoPosts(MONDAY_0930_DENVER, deps);
    assert.equal(r.status, 'published');
    assert.equal(r.post.title, 'Crate training before a first stay');
  });

  it('does not run when the blog or automatic posts are off', async () => {
    stubPrisma([site({ blogEnabled: false }), site({ id: 'site-2', slug: 's2', blogAutoEnabled: false })]);
    const results = await runDueAutoPosts(MONDAY_0930_DENVER, { suggestTopicsFn: topics('x'), writePostFn: fakeWriter(), revalidateFn: noRevalidate });
    assert.equal(results.length, 0);
  });
});

describe('what the site renderer sees', () => {
  beforeEach(() => stubPrisma([site({ blogAutoEnabled: false })]));

  it('unmanaged sites keep using the posts stored with the site', async () => {
    assert.deepEqual(await getPublicBlog('paws-denver'), { enabled: true, managed: false, posts: [] });
  });

  it('shows published posts only; drafts, deleted and in-progress posts stay hidden', async () => {
    await importLegacyPosts('site-1');
    await updateBlogPost('site-1', posts[1].id, { status: 'DRAFT' });
    await deleteBlogPost('site-1', posts[2].id);
    posts.push({ id: 'claim', siteId: 'site-1', slug: 'writing-x', title: 'Writing…', body: '', status: 'GENERATING', autoSlot: 'x', deletedAt: null });
    const blog = await getPublicBlog('paws-denver');
    assert.deepEqual(blog.posts.map((p) => p.slug), ['how-often-should-you-board-your-dog']);
    assert.equal(blog.posts[0].legacyIndex, 0);
    await assert.rejects(getPublicBlogPost('paws-denver', posts[1].slug), (e) => e.code === 'BLOG_POST_NOT_FOUND');
    const post = await getPublicBlogPost('paws-denver', 'how-often-should-you-board-your-dog');
    assert.equal(post.faqs.length, 1);
    assert.match(post.readTime, /min read/);
  });

  it('turning the blog off hides everything', async () => {
    await importLegacyPosts('site-1');
    await updateBlogSettings('site-1', { blogEnabled: false });
    assert.deepEqual(await getPublicBlog('paws-denver'), { enabled: false, managed: true, posts: [] });
    await assert.rejects(getPublicBlogPost('paws-denver', posts[0].slug), (e) => e.code === 'BLOG_POST_NOT_FOUND');
  });
});

describe('editing validation', () => {
  beforeEach(async () => {
    stubPrisma([site({ blogAutoEnabled: false })]);
    await importLegacyPosts('site-1');
  });

  it('accepts https images only and requires a title', async () => {
    await assert.rejects(updateBlogPost('site-1', posts[0].id, { imageUrl: 'http://insecure.example.com/a.jpg' }), (e) => e.code === 'INVALID_BLOG_POST');
    await assert.rejects(updateBlogPost('site-1', posts[0].id, { title: '  ' }), (e) => e.code === 'INVALID_BLOG_POST');
    await assert.rejects(updateBlogPost('site-1', posts[0].id, { status: 'LIVE' }), (e) => e.code === 'INVALID_BLOG_POST');
  });

  it('cannot edit posts of another site', async () => {
    await assert.rejects(updateBlogPost('site-1', 'nope', { title: 'x' }), (e) => e.code === 'BLOG_POST_NOT_FOUND');
  });
});

describe('blog routes and keys', () => {
  it('renderer may read published blog routes; everything else is admin-only', () => {
    assert.equal(classifyRequest('GET', '/sites/abc/published-blog'), 'renderer-readable');
    assert.equal(classifyRequest('GET', '/sites/abc/published-blog/some-post'), 'renderer-readable');
    assert.equal(classifyRequest('GET', '/sites/abc/blog'), 'admin');
    assert.equal(classifyRequest('PATCH', '/sites/abc/blog/posts/1'), 'admin');
    assert.equal(classifyRequest('POST', '/sites/abc/uploads'), 'admin');
  });
});
