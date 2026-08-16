import OpenAI from 'openai';
import { env } from '../config/env.js';
import prisma from '../database/client.js';
import { AppError } from '../utils/AppError.js';

const DEFAULT_MAX_POST_LENGTH = 80;
const MIN_POST_LENGTH = 50;
const MAX_POST_LENGTH = 300;

/** Clamps the configured word limit to the allowed 50-300 range, defaulting to 80. */
function resolveMaxWords(maxPostLength) {
  const n = Number(maxPostLength);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_POST_LENGTH;
  return Math.min(MAX_POST_LENGTH, Math.max(MIN_POST_LENGTH, Math.round(n)));
}

/**
 * Fixed personality traits a business can be assigned. The trait set never
 * changes for a given business (see getBusinessPersonality) — this is the knob
 * that makes two businesses sound like two different owners while each one
 * still sounds like the same person post after post.
 */
const BUSINESS_PERSONALITIES = [
  'straight-talking and to the point, gets in and out without wasting words',
  'warm and chatty, talks to customers like neighbours they have known for years',
  'proud craftsman, quietly detail-obsessed about doing the job properly',
  'practical problem solver, always explains the why behind the work',
  'easygoing and good humoured, keeps things light without being unserious',
];

/**
 * Stable 32-bit hash of a string. Small and dependency-free — we only need a
 * deterministic bucket, not cryptographic strength.
 */
function hashString(value) {
  let hash = 0;
  const str = String(value ?? '');
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Personality for a business, derived from its name alone.
 *
 * Deterministic on purpose: the client's complaint was that posts read as if
 * different people wrote them. Anything random or time-based (Math.random, day
 * of year, post count) would reintroduce that drift on the very next run, so
 * the name — the one input that never changes — is the seed.
 */
export function getBusinessPersonality(businessName) {
  const name = String(businessName ?? '').trim();
  if (!name) return BUSINESS_PERSONALITIES[0];
  return BUSINESS_PERSONALITIES[hashString(name.toLowerCase()) % BUSINESS_PERSONALITIES.length];
}

function buildSystemPrompt({ businessName, city, postTypeLabel, industry, maxWords, personality }) {
  return `You are the voice of ${businessName}. You always write in the same consistent style. You are friendly, knowledgeable and local. You never sound corporate. You never use buzzwords. You speak like a real local business owner who knows their craft. Every post you write sounds like it came from the same person. Keep this voice consistent across all posts.

Your fixed personality, which never changes from post to post: ${personality}.

You are writing a Google Business Profile post for ${businessName} in ${city}.

Post type today: ${postTypeLabel}

INFORMATIONAL: Write helpful tips or advice related to ${industry}. Help readers understand or fix a small issue with their ${industry} system. Educational tone. One practical tip. Sound like an expert sharing knowledge.

PROMOTIONAL: Highlight a specific service or seasonal offer from ${businessName}. Create gentle urgency. Include a call to action like call us or book today. Mention the city naturally.

STORY: Write as the business owner sharing a real moment from today. Personal casual tone. Mention a real scenario that happens in a ${industry} business day. Sound genuine.

Rules for all types:

Under ${maxWords} words
Mention ${businessName} once naturally
Mention ${city} once
No hashtags
No emojis
No corporate buzzwords
Sound human not AI
Never start with the same word as previous posts
Make it specific to ${industry} not generic`;
}

const DRAFT_TEMPLATES = [
  (biz, keyword, city) =>
    `Had a pretty solid morning at ${biz} today. Got in early and knocked out a couple ${keyword} jobs before lunch. Days like this remind me why I got into this business in the first place. We are right here in ${city} same spot as always. The door is open if anyone needs anything, we are not going anywhere. Feels good to stay busy and do the kind of work people actually count on you for.`,

  (biz, keyword, city) =>
    `Kind of a slow start at ${biz} this morning but it picked up real quick after that. Did some ${keyword} work that turned out really good and the customers seemed happy about it which is all that matters at the end of the day. Still here in ${city} doing our thing every single day rain or shine. That consistency is what keeps people coming back I think.`,

  (biz, keyword, city) =>
    `Spent most of the morning at ${biz} organizing and getting everything ready for the rest of the week. The ${keyword} side of things has been keeping us busy lately and I am not complaining about that one bit. We are here in ${city} and honestly the local people around here have been really good to us since day one. Grateful for that more than they probably know.`,

  (biz, keyword, city) =>
    `Long day at ${biz} but honestly a really good one. Got through a bunch of ${keyword} work and even had a little time to clean up the shop and make it look right. Operating out of ${city} and it feels like things are finally picking up around here after a slow stretch. No complaints from me at all, just glad to be working.`,

  (biz, keyword, city) =>
    `Opened up ${biz} early this morning because I could not sleep anyway so I figured why not get a head start. Knocked out some ${keyword} projects before anyone else even showed up. ${city} mornings are real quiet and honestly that is when I get my best work done with no distractions. Already feeling productive and it is barely noon which is a nice change of pace.`,

  (biz, keyword, city) =>
    `Wrapping up the day here at ${biz} and it was a full one from start to finish. Multiple ${keyword} jobs back to back with barely any downtime in between. The kind of day where you do not even realize what time it is until you look up and it is dark outside. Love doing this work here in ${city}. Heading home tired but honestly pretty satisfied with how everything went.`,

  (biz, keyword, city) =>
    `Rainy day here in ${city} but ${biz} is still going strong inside. Weather like this actually gives us a chance to catch up on some ${keyword} stuff that we have been putting off for a while now. Got a lot accomplished today that I have been meaning to get around to for weeks. Sometimes a slow weather day turns into the most productive one you have had all month.`,

  (biz, keyword, city) =>
    `Had a customer come into ${biz} today who I had not seen in a really long time. That kind of thing always makes my day a little better. We talked about some ${keyword} they needed and got something set up for next week. Running a business in ${city} you really do get to know people on a personal level and that part of it never gets old for me.`,

  (biz, keyword, city) =>
    `${biz} was busy from the jump today and did not slow down. Phone ringing, people walking in, ${keyword} requests stacking up one after another. That is exactly the kind of problem I like having if I am being honest. Been building this thing up here in ${city} for a good while now and days like today make all the hard ones before it feel worth it.`,

  (biz, keyword, city) =>
    `Took a minute between jobs at ${biz} to just appreciate what we have going on here. Started from basically nothing and now we are handling ${keyword} steady every single week without a gap. ${city} has been good to us and the people here have really supported what we do. I try not to take any of that for granted because I know how quick things can change.`,

  (biz, keyword, city) =>
    `Ended up staying late at ${biz} tonight finishing up a ${keyword} project that I really wanted to get right. Could have easily left it for tomorrow morning but that is just not how I operate when it comes to this work. The people here in ${city} deserve that kind of effort and honestly I am happy to put it in every single time. Rather do it right than do it fast.`,

  (biz, keyword, city) =>
    `Midweek update from ${biz} and things are moving along nicely. Got a couple of ${keyword} jobs done ahead of schedule this week which honestly does not happen that often around here. Feeling really good about where we are at right now and the direction things are going. If you are anywhere in the ${city} area and need us for anything we are right here same as always.`,
];

/**
 * Maps a raw category string to a set of relevant marketing keywords and the
 * business type used to pick a call to action. New businesses automatically
 * get sensible keywords as long as their category matches one of these
 * patterns; anything unmatched falls back to using the category itself.
 *
 * All patterns use \b word boundaries — a bare substring like /car/i would
 * also match "pet care", "childcare", "daycare" etc. (any word containing
 * "car"), silently reclassifying an unrelated business as a car dealership.
 * That's not hypothetical: it's exactly how "pet care" got auto-dealer
 * keywords and used-car content in testing.
 */
const CATEGORY_FOCUS_MAP = [
  {
    match: /\bhvac\b|\bheating\b|\bcooling\b|\bair condition/i,
    seasonal: true,
    type: 'service',
    informationalTopics: [
      'signs your AC needs servicing',
      'how to lower energy bills this summer',
      'when to replace vs repair your AC',
    ],
  },
  {
    match: /\bcars?\b|\bauto(?:motive|mobiles?)?s?\b|\bvehicles?\b|\bdealers?(?:hips?)?\b/i,
    keywords: ['used cars', 'auto sales', 'vehicle financing', 'car dealership', 'test drive'],
    type: 'retail',
    informationalTopics: [
      'what to look for when buying a used car',
      'how to get the best financing rate',
      'questions to ask before buying',
    ],
  },
  {
    match: /\binternet marketing\b/i,
    keywords: [
      'digital marketing',
      'SEO services',
      'web design',
      'lead generation',
      'business growth',
    ],
    type: 'service',
    informationalTopics: [
      'how to improve your Google ranking',
      'why local SEO matters',
      'how to get more reviews',
    ],
  },
  {
    match: /\bmarketing\b|\bseo\b|\bdigital\b|\bmedia\b/i,
    keywords: [
      'digital marketing',
      'SEO services',
      'lead generation',
      'social media management',
      'business growth',
    ],
    type: 'service',
    informationalTopics: [
      'how to improve your Google ranking',
      'why local SEO matters',
      'how to get more reviews',
    ],
  },
  {
    match: /\bconsulting\b|\bbusiness service\b|\bsolutions\b/i,
    keywords: [
      'business consulting',
      'process optimization',
      'growth strategy',
      'client solutions',
    ],
    type: 'consulting',
  },
];

function getCategoryEntry(category) {
  const cat = String(category ?? '').trim();
  if (!cat) return null;
  return CATEGORY_FOCUS_MAP.find((entry) => entry.match.test(cat)) ?? null;
}

/**
 * Specific brands a business in each trade would realistically name on a job.
 * Mentioning a real unit or model is what makes a post read like it came from
 * someone who actually does the work, which is what the client asked for.
 */
const industryBrands = {
  hvac: ['Carrier', 'Lennox', 'Trane', 'Goodman', 'Rheem', 'York', 'American Standard', 'Bryant'],
  automotive: ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'BMW', 'Mercedes', 'Nissan', 'Hyundai'],
  plumbing: ['Kohler', 'Moen', 'Delta', 'American Standard', 'Rheem', 'Bradford White'],
  electrical: ['Siemens', 'Square D', 'Leviton', 'Lutron', 'Eaton'],
  general: [],
};

/**
 * Normalizes a free-text category to one of the industry keys used by
 * industryBrands / topicSeeds / QA_QUESTION_SETS.
 *
 * Uses \b word boundaries for the same reason CATEGORY_FOCUS_MAP does: a bare
 * /car/i would also match "pet care" and hand a grooming business a list of
 * car brands to name-drop.
 */
export function getIndustryKey(category) {
  const cat = String(category ?? '').trim();
  if (!cat) return 'general';
  if (/\bhvac\b|\bheating\b|\bcooling\b|\bair condition/i.test(cat)) return 'hvac';
  if (/\bcars?\b|\bauto(?:motive|mobiles?)?s?\b|\bvehicles?\b|\bdealers?(?:hips?)?\b/i.test(cat)) {
    return 'automotive';
  }
  if (/\bplumb/i.test(cat)) return 'plumbing';
  if (/\belectric/i.test(cat)) return 'electrical';
  return 'general';
}

/** Brands worth name-dropping for this category, or [] when the trade has none. */
export function getIndustryBrands(category) {
  return industryBrands[getIndustryKey(category)] ?? [];
}

/** How many times a post is regenerated before the requirement is declared unmet. */
const MAX_GENERATION_ATTEMPTS = 3;

/**
 * The brand actually present in the content, or null.
 *
 * Word-boundary matched: "York" must not be satisfied by "New York", and
 * "Ford" must not be satisfied by "afford" — both are realistic in this copy
 * ("New York" especially, for New Jersey businesses), and either would let a
 * post pass the brand gate without naming a brand at all.
 */
export function findMentionedBrand(content, brands) {
  const text = String(content ?? '');
  for (const brand of brands) {
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) {
      // "New York" is not the York brand.
      if (/^york$/i.test(brand) && /\bnew\s+york\b/i.test(text) && !/(?<!new\s)\byork\b/i.test(text)) {
        continue;
      }
      return brand;
    }
  }
  return null;
}

/**
 * Five post topics modelled on what top-ranked local businesses in this
 * industry publish. Returned in a stable order; callers pick from them by day
 * so the same business does not land on the same topic two runs running.
 */
const COMPETITOR_RESEARCH_MODEL = 'gpt-4o-mini';

/** Re-runs of the real search before research is declared unavailable. */
const MAX_RESEARCH_ATTEMPTS = 3;

/**
 * Normalizes a URL for comparison: host + path only, lowercased, no trailing
 * slash. The search tool appends `?utm_source=openai` to the URLs it reports,
 * and the model echoes them back with and without that parameter, so a raw
 * string compare would reject genuine sources.
 */
function normalizeUrl(url) {
  try {
    const u = new URL(String(url).trim());
    const path = u.pathname.replace(/\/$/, '');
    return `${u.host.toLowerCase().replace(/^www\./, '')}${path.toLowerCase()}`;
  } catch {
    return '';
  }
}

/**
 * Every URL the web search tool actually retrieved or cited for this response.
 *
 * Two sources, unioned: `web_search_call.action.sources` (what the search
 * fetched, requires the matching `include`) and `url_citation` annotations
 * (what the answer cited inline). This set is the ground truth we check ideas
 * against — the model can write any URL it likes into its JSON, but it cannot
 * fabricate one into this list.
 */
function extractSearchedUrls(response) {
  const found = new Map();

  for (const item of response?.output ?? []) {
    for (const source of item?.action?.sources ?? []) {
      const key = normalizeUrl(source?.url);
      if (key) found.set(key, source.url);
    }
    for (const content of item?.content ?? []) {
      for (const annotation of content?.annotations ?? []) {
        if (annotation?.type !== 'url_citation') continue;
        const key = normalizeUrl(annotation.url);
        if (key) found.set(key, annotation.url);
      }
    }
  }

  return found;
}

/** Pulls the JSON object out of a response that may have wrapped it in a code fence. */
function parseResearchJson(text) {
  const raw = String(text ?? '').trim();
  if (!raw) throw new Error('web search returned empty text');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1].trim() : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`no JSON object in response: ${raw.slice(0, 200)}`);
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * Researches what real, top-ranking competitors in this industry and city are
 * publishing, via live web search, and returns their topics with the source
 * each one came from.
 *
 * Throws on every failure path — no static list, no cached seeds, no silent
 * degradation. A post built on invented "research" is worse than no post,
 * because nobody downstream can tell the difference. Every returned idea is
 * verified against the URLs the search tool actually retrieved, so a topic can
 * only ship if a real page backs it.
 *
 * @returns {Promise<Array<{ topic: string, competitor: string, sourceUrl: string, evidence: string }>>}
 * @throws {AppError} when research is unavailable, unparseable, or unverifiable
 */
export async function getCompetitorPostIdeas(industry, city, options = {}) {
  const apiKey = env.OPENAI_API_KEY?.trim();
  const town = String(city ?? '').trim() || 'the local area';
  const key = getIndustryKey(industry);
  const trade = String(industry ?? '').trim() || 'local business';
  const season = getSeasonName(options.month ?? new Date().getMonth());

  if (!apiKey) {
    throw new AppError(
      'Competitor research requires OPENAI_API_KEY, which is not configured. Refusing to generate a post without real research.',
      500,
      { code: 'COMPETITOR_RESEARCH_NO_API_KEY', details: { industry: key, city: town } },
    );
  }

  const prompt = `Search the web for the top ranked ${trade} businesses near ${town}, New Jersey — the ones that actually rank on Google today. Open their websites, blogs, Google Business Profile posts or news coverage and identify what content they are publishing right now.

It is currently ${season}, so prefer topics that are seasonally relevant to ${season}.

Return the 5 strongest post topics you found, each taken from a real competitor page you actually opened. Cite your sources.

Reply with strict JSON only, in exactly this shape:
{"ideas":[{"topic":"the subject that competitor is posting about","competitor":"the real business name","sourceUrl":"the exact URL you found it on","evidence":"a short quote or description of the real content on that page"}]}

Rules:
- Every sourceUrl must be a real page you retrieved in this search. Never guess or construct a URL.
- Every competitor must be a real named business, not a placeholder.
- If you cannot find 5, return only the ones you genuinely found.`;

  // A search for "top ranked HVAC in Lodi" legitimately returns the client's
  // own listing, and treating your own posts as competitor research is exactly
  // the loop this feature exists to break.
  const selfName = String(options.excludeBusiness ?? '').trim().toLowerCase();
  const client = new OpenAI({ apiKey });

  /** Why each attempt failed, so an exhausted retry reports the whole history. */
  const attemptLog = [];

  // Retries are re-runs of the real search, never a substitute for it. The
  // search itself is reliable, but the model occasionally answers in prose
  // instead of the requested JSON; without a retry that costs the location its
  // post for the day.
  for (let attempt = 1; attempt <= MAX_RESEARCH_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await client.responses.create({
        model: COMPETITOR_RESEARCH_MODEL,
        tools: [{ type: 'web_search' }],
        include: ['web_search_call.action.sources'],
        input: prompt,
      });
    } catch (e) {
      attemptLog.push({ attempt, reason: `request failed: ${e?.message ?? String(e)}` });
      continue;
    }

    const searchedUrls = extractSearchedUrls(response);
    if (searchedUrls.size === 0) {
      attemptLog.push({ attempt, reason: 'no web retrieval happened (no sources or citations)' });
      continue;
    }

    let parsed;
    try {
      parsed = parseResearchJson(response.output_text);
    } catch (e) {
      attemptLog.push({ attempt, reason: `unreadable output: ${e?.message ?? String(e)}` });
      continue;
    }

    const candidates = Array.isArray(parsed?.ideas) ? parsed.ideas : [];
    const rejected = [];
    const ideas = [];
    const seenTopics = new Set();

    for (const candidate of candidates) {
      const topic = String(candidate?.topic ?? '').trim();
      const competitor = String(candidate?.competitor ?? '').trim();
      const sourceUrl = String(candidate?.sourceUrl ?? '').trim();
      const verifiedUrl = searchedUrls.get(normalizeUrl(sourceUrl));

      if (!topic || !competitor || !verifiedUrl) {
        rejected.push({ topic, competitor, sourceUrl, reason: !verifiedUrl ? 'url_not_retrieved' : 'incomplete' });
        continue;
      }

      const competitorKey = competitor.toLowerCase();
      if (selfName && (competitorKey.includes(selfName) || selfName.includes(competitorKey))) {
        rejected.push({ topic, competitor, sourceUrl, reason: 'is_the_business_itself' });
        continue;
      }

      const topicKey = topic.toLowerCase();
      if (seenTopics.has(topicKey)) {
        rejected.push({ topic, competitor, sourceUrl, reason: 'duplicate_topic' });
        continue;
      }
      seenTopics.add(topicKey);

      ideas.push({
        topic,
        competitor,
        sourceUrl: verifiedUrl,
        evidence: String(candidate?.evidence ?? '').trim(),
      });
    }

    if (ideas.length === 0) {
      attemptLog.push({
        attempt,
        reason: `${candidates.length} candidate(s) returned, none backed by a retrieved page`,
        rejected,
      });
      continue;
    }

    console.info(
      JSON.stringify({
        event: 'competitor_research_ok',
        industry: key,
        city: town,
        season,
        attempts: attempt,
        verifiedIdeas: ideas.length,
        rejectedIdeas: rejected.length,
        retrievedUrlCount: searchedUrls.size,
        sources: ideas.map((i) => ({ competitor: i.competitor, sourceUrl: i.sourceUrl })),
      }),
    );

    return ideas;
  }

  throw new AppError(
    `Competitor research for ${trade} in ${town} failed after ${MAX_RESEARCH_ATTEMPTS} attempts; no topic could be backed by a page the search actually retrieved. Nothing was published.`,
    502,
    {
      code: 'COMPETITOR_RESEARCH_UNVERIFIED',
      details: { industry: key, city: town, attempts: attemptLog },
    },
  );
}

/**
 * Picks one researched topic for this post. Keyed off dayOfYear so the choice
 * rotates predictably across the freshly researched set rather than at random.
 */
async function selectCompetitorTopic(industry, city, dayOfYear, options = {}) {
  const ideas = await getCompetitorPostIdeas(industry, city, options);
  const day = Number.isFinite(Number(dayOfYear)) ? Math.abs(Math.floor(Number(dayOfYear))) : 0;
  return ideas[day % ideas.length];
}

/** Month (0-11, per Date#getMonth) -> season name. October (9) is its own short "fall" window. */
function getSeasonName(month) {
  if ([5, 6, 7, 8].includes(month)) return 'summer';
  if ([10, 11, 0, 1].includes(month)) return 'winter';
  if ([2, 3, 4].includes(month)) return 'spring';
  return 'fall';
}

const HVAC_SEASONAL_KEYWORDS = {
  summer: ['AC repair', 'air conditioning', 'cooling', 'AC tune-up', 'central air', 'AC installation'],
  winter: ['furnace repair', 'heating repair', 'boiler service', 'heat pump', 'heating installation'],
  spring: ['AC maintenance', 'system checkup', 'seasonal tune-up', 'HVAC inspection'],
  fall: ['heating tune-up', 'furnace checkup', 'heat pump service', 'heating inspection'],
};

const SEASON_WEATHER_CONTEXT = {
  summer: 'hot summer weather with high heat and humidity',
  winter: 'cold winter weather with freezing temperatures',
  spring: 'mild spring weather with fluctuating temperatures',
  fall: 'cool fall weather as temperatures start dropping',
};

/**
 * Keyword list for a category, adjusted for the current season when the
 * category is HVAC (seasonal: true in CATEGORY_FOCUS_MAP) so a business never
 * gets told to talk about furnaces in July or AC installs in January. All
 * other business types keep the same fixed keyword list year round.
 */
export function getSeasonalKeywords(category, month = new Date().getMonth()) {
  const entry = getCategoryEntry(category);
  if (!entry) return null;
  if (entry.seasonal) return HVAC_SEASONAL_KEYWORDS[getSeasonName(month)];
  return entry.keywords;
}

function getBusinessFocus(category) {
  const keywords = getSeasonalKeywords(category);
  if (keywords) return keywords.join(', ');
  return String(category ?? '').trim() || 'local business services';
}

function getPrimaryKeyword(category) {
  const keywords = getSeasonalKeywords(category);
  if (keywords) return keywords[0];
  return String(category ?? '').trim() || 'our services';
}

function getBusinessType(category) {
  const entry = getCategoryEntry(category);
  return entry ? entry.type : 'service';
}

function getCTA(businessType, primaryKeyword, city) {
  if (businessType === 'retail') return 'Visit us today.';
  if (businessType === 'consulting') return 'Contact us for a free consultation.';
  return `Call us today for ${primaryKeyword} in ${city}.`;
}

const HVAC_SEASON_AVOID = {
  summer: 'furnaces, heating, boilers, or winter heating topics',
  winter: 'AC, air conditioning, or cooling topics',
  spring: 'peak-summer AC replacement or peak-winter furnace emergencies',
  fall: 'AC installation or cooling topics',
};

/**
 * Tells the model what season and weather it actually is so it never writes
 * about furnaces in summer or AC in winter. HVAC posts get an explicit
 * "don't mention X" guardrail; non-seasonal business types just get the
 * season/weather stated for color, with no restriction on keywords.
 */
function getSeasonalPromptContext(category, month = new Date().getMonth()) {
  const entry = getCategoryEntry(category);
  const season = getSeasonName(month);
  const weather = SEASON_WEATHER_CONTEXT[season];

  if (!entry?.seasonal) {
    return `It is currently ${season} (${weather}).`;
  }

  return `It is currently ${season} (${weather}). This is an HVAC business, so only reference ${HVAC_SEASONAL_KEYWORDS[season].join(', ')}. Do NOT mention ${HVAC_SEASON_AVOID[season]} — that is the wrong season and will confuse customers.`;
}

function getInformationalTopics(category) {
  const entry = getCategoryEntry(category);
  return entry?.informationalTopics ?? [];
}

/**
 * Rotates the post type across INFORMATIONAL / PROMOTIONAL / STORY / QANDA
 * using the day of year plus a random seed, so a location isn't stuck writing
 * "today I did this" story posts on every run. seed is randomized by the caller
 * (see generatePostContent) so the same day of year doesn't always land on the
 * same type.
 *
 * QANDA is in the rotation because Google discontinued the Q&A API on
 * 2025-11-03, so the Q&A section of a profile can no longer be written to by
 * software. Answering those same customer questions as ordinary posts is the
 * only automatic route left, and putting it in the rotation (rather than
 * publishing five Q&A posts at once) keeps it to roughly one a week without
 * flooding a profile that posts daily.
 */
export function getRotatedPostType(dayOfYear, seed) {
  const day = Number.isFinite(Number(dayOfYear)) ? Number(dayOfYear) : 0;
  const rotation = (((day + seed) % 4) + 4) % 4;
  if (rotation === 0) return 'INFORMATIONAL';
  if (rotation === 1) return 'PROMOTIONAL';
  if (rotation === 2) return 'STORY';
  return 'QANDA';
}

/**
 * The customer question this Q&A post answers, rotated by day so a business
 * works through its five common questions instead of repeating one.
 */
function selectQandAQuestion(industry, city, dayOfYear) {
  const questions = getQuestionsForIndustry(industry, city);
  const day = Number.isFinite(Number(dayOfYear)) ? Math.abs(Math.floor(Number(dayOfYear))) : 0;
  return questions[day % questions.length];
}

/**
 * Per-post-type angle so an INFORMATIONAL post reads like a tip, a
 * PROMOTIONAL post reads like an offer, and a STORY post reads like a real
 * moment. We never invent a specific discount amount or coupon — those come
 * from the location's saved offer config — so the copy stays honest on real
 * listings.
 *
 * INFORMATIONAL is grounded with every real signal we have on hand — business
 * name, category, and offer terms — and the model is explicitly told to work
 * out the business's actual trade from those signals before writing, rather
 * than trusting `category` alone. `category` is frequently a coarse fallback
 * label (e.g. "local business") for anything our lightweight classifier
 * doesn't recognize, and a vague category with no other anchor is what
 * previously produced generic filler (e.g. workplace-hydration tips) for a
 * marketing business. This applies uniformly to every business — there is no
 * per-category branching — so it holds up for categories we've never seen.
 */
function getPostTypeAngle(postTypeLabel, category, businessName, offerTerms, options = {}) {
  if (postTypeLabel === 'QANDA') {
    return {
      angle:
        `Answer this real customer question as the post: "${options.question}". Open by naming the question the way a customer would actually ask it, then answer it plainly and completely in the business's own voice. Never invent a price, a discount, or specific opening hours — for a cost question explain what the price depends on and invite them to call for a quote, and for an hours question point them to the profile or a phone call. This should read like the owner answering a question they get asked every week, not like a FAQ page. Do not wrap the question in quotation marks — write it as part of your own sentence.`,
      cta: '',
    };
  }
  if (postTypeLabel === 'INFORMATIONAL') {
    const topics = getInformationalTopics(category);
    const topicHint =
      topics.length > 0
        ? ` Good example topics for this business: ${topics.join('; ')}. Pick one of these (or a close variation) and go deep on it — do not just list all of them.`
        : ' Pick a genuinely useful, specific educational topic relevant to this business and go deep on it.';
    const knownSignals = [
      `business name: "${businessName}"`,
      category ? `category on file: "${category}"` : null,
      offerTerms ? `current offer/services on file: "${offerTerms}"` : null,
    ].filter(Boolean).join('; ');
    return {
      angle:
        `First, work out the SPECIFIC real-world trade or service this business actually performs. Use everything you know about it: ${knownSignals}. Do not take a vague category (like "local business" or "service") at face value — infer the real, specific service from the business name and any other signal available, the same way a person would guess what a business does from its name and details. Then write this as an educational tip or how-to post, NOT a personal story or daily-life anecdote — teach the reader something real and useful about that SPECIFIC service, not a generic tip that could apply to any small business (no generic workplace, productivity, or wellness advice unless that literally is the business's trade).${topicHint} Structure it like a quick, practical insight a real expert in that specific trade would share: state the tip clearly, then explain briefly why it matters or what to do about it.`,
      cta: '',
    };
  }
  if (postTypeLabel === 'PROMOTIONAL') {
    return {
      angle:
        'Highlight a specific service or seasonal offer from the business. Create gentle urgency. Invite people to call or book now. Do NOT invent a specific percentage, dollar amount, or coupon code.',
      cta: '',
    };
  }
  return {
    angle:
      'Write as the business owner sharing a real, specific moment or scenario from today at this business. Personal, casual tone.',
    cta: '',
  };
}

/**
 * Picks a random town from the location's service area for this post so
 * copy doesn't always name the same city (falls back to the location's home
 * city when serviceAreaTowns is empty or unset), and surfaces offerTerms —
 * real, business-specific context already saved on the location — for use as
 * an extra grounding signal in the prompt (see getPostTypeAngle).
 */
async function resolveLocationContext(locationId, fallbackCity) {
  if (!locationId) return { city: fallbackCity, offerTerms: null };

  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { serviceAreaTowns: true, offerTerms: true },
  });

  const towns = (location?.serviceAreaTowns ?? []).filter((t) => String(t ?? '').trim());
  const city = towns.length > 0 ? towns[Math.floor(Math.random() * towns.length)] : fallbackCity;
  const offerTerms = String(location?.offerTerms ?? '').trim() || null;

  return { city, offerTerms };
}

function pickTemplate(recentContents, businessName, keyword, city, cta) {
  const drafts = DRAFT_TEMPLATES.map((fn) => `${fn(businessName, keyword, city)} ${cta}`);
  const recentText = recentContents.join(' ').toLowerCase();

  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < drafts.length; i++) {
    const words = drafts[i].toLowerCase().split(/\s+/);
    let uniqueWords = 0;
    for (const w of words) {
      if (w.length > 4 && !recentText.includes(w)) {
        uniqueWords += 1;
      }
    }
    if (uniqueWords > bestScore) {
      bestScore = uniqueWords;
      bestIdx = i;
    }
  }

  return drafts[bestIdx];
}

async function getOtherBusinessNames(excludeName) {
  try {
    const rows = await prisma.business.findMany({
      where: { status: 'ACTIVE' },
      select: { name: true },
    });
    return rows.map((r) => r.name).filter((n) => n !== excludeName);
  } catch {
    return [];
  }
}

function contentMentionsOtherBusiness(content, businessName, otherNames) {
  const lower = content.toLowerCase();
  const self = businessName.trim().toLowerCase();
  for (const other of otherNames) {
    const o = other.trim().toLowerCase();
    if (!o || o === self) continue;
    if (lower.includes(o)) return other;
  }
  return null;
}

/**
 * Removes quotes that wrap the whole post, without touching quotes that are
 * part of it.
 *
 * The old `replace(/^["']|["']$/g, '')` stripped each end independently, so a
 * Q&A post opening with a quoted question ("Do you serve Ridgefield?" is a
 * question I hear often...) lost its opening quote and published with an
 * orphaned closing one. Only strip when the quote is genuinely a wrapper: same
 * character at both ends, and appearing exactly twice in the whole string.
 */
function stripWrappingQuotes(content) {
  const text = String(content ?? '').trim();
  const first = text[0];
  if ((first !== '"' && first !== "'") || text[text.length - 1] !== first) return text;
  const occurrences = text.split(first).length - 1;
  if (occurrences !== 2) return text;
  return text.slice(1, -1).trim();
}

function contentIncludesBusinessName(content, businessName) {
  const name = businessName.trim();
  if (!name) return true;
  return content.toLowerCase().includes(name.toLowerCase());
}

/**
 * @param {string} locationId - DB location id (used for recent-post context)
 * @param {string} businessName - exact business name that must appear in the post
 */
export async function generatePostContent(
  locationId,
  businessName,
  category,
  city,
  postType,
  dayOfYear,
  maxPostLength = DEFAULT_MAX_POST_LENGTH,
) {
  const apiKey = env.OPENAI_API_KEY?.trim();
  const maxWords = resolveMaxWords(maxPostLength);
  const name = String(businessName ?? '').trim() || 'Business';
  const fallbackCity = String(city ?? '').trim() || 'this area';
  const { city: locationCity, offerTerms } = await resolveLocationContext(locationId, fallbackCity);
  const categoryLabel = String(category ?? '').trim() || 'local business';

  // 10 rather than 5: the model needs enough prior copy to actually hear the
  // business's voice, not just enough to avoid repeating an opening line.
  const recentPosts = locationId
    ? await prisma.post.findMany({
        where: { locationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { content: true },
      })
    : [];

  const recentPostsSummary =
    recentPosts.length > 0
      ? recentPosts.map((p) => p.content.slice(0, 80)).join(' | ')
      : '(none yet)';

  // Longer excerpts for the voice sample — 80 characters is enough to spot a
  // repeated opening but too short to convey how the business actually sounds.
  const voiceSample =
    recentPosts.length > 0
      ? recentPosts.map((p, i) => `${i + 1}. ${p.content.slice(0, 220)}`).join('\n')
      : '(none yet — you are establishing this business\'s voice with this post)';

  // Post number about to be written, so "every 3rd post" counts real published
  // history rather than restarting each run.
  const existingPostCount = locationId ? await prisma.post.count({ where: { locationId } }) : 0;
  const postCount = existingPostCount + 1;

  const recentContents = recentPosts.map((p) => p.content);
  const previousOpeningWord = recentContents[0]
    ?.trim()
    .split(/\s+/)[0]
    ?.replace(/[^\w]/g, '')
    .toLowerCase();
  const otherBusinessNames = await getOtherBusinessNames(name);

  const businessType = getBusinessType(categoryLabel);
  const businessFocus = getBusinessFocus(categoryLabel);
  const primaryKeyword = getPrimaryKeyword(categoryLabel);

  const seed = Math.floor(Math.random() * 1000);
  const postTypeLabel = getRotatedPostType(dayOfYear, seed);
  const isInformational = postTypeLabel === 'INFORMATIONAL';
  const isPromotional = postTypeLabel === 'PROMOTIONAL';
  const isQandA = postTypeLabel === 'QANDA';
  const qandaQuestion = isQandA
    ? selectQandAQuestion(categoryLabel, locationCity, dayOfYear)
    : null;
  const typeAngle = getPostTypeAngle(postTypeLabel, categoryLabel, name, offerTerms, {
    question: qandaQuestion,
  });
  const cta = typeAngle.cta || getCTA(businessType, primaryKeyword, locationCity);

  const draft = pickTemplate(recentContents, name, primaryKeyword, locationCity, cta);

  const currentDayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long' });
  const seasonalContext = getSeasonalPromptContext(categoryLabel);
  const variationSeed = Math.floor(Math.random() * 100);

  // Every post now requires live competitor research, which requires the API
  // key. Falling back to a canned draft here would ship exactly the kind of
  // unresearched post this path exists to prevent.
  if (!apiKey) {
    throw new AppError(
      `Cannot generate a post for ${name}: OPENAI_API_KEY is not configured, so competitor research cannot run.`,
      500,
      { code: 'POST_GENERATION_NO_API_KEY', details: { businessName: name, locationId } },
    );
  }

  // Every 3rd post names a real unit/brand, so the feed reads like someone who
  // works on actual equipment. Trades with no meaningful brand list (general)
  // are skipped rather than handed an empty instruction.
  const brandsForIndustry = getIndustryBrands(categoryLabel);
  const shouldMentionBrand = postCount % 3 === 0 && brandsForIndustry.length > 0;
  const brandInstruction = shouldMentionBrand
    ? `\nIn this post naturally mention one of these specific brands or models relevant to this business: ${brandsForIndustry.join(', ')}. Integrate it naturally as if sharing a real job you worked on or a product you recommend. Do not list multiple brands, just mention one naturally.\n`
    : '';

  // Throws when research is unavailable or unverifiable — deliberately not
  // caught here, so the location fails loudly instead of posting on invented
  // "research".
  const competitorIdea = await selectCompetitorTopic(categoryLabel, locationCity, dayOfYear, {
    excludeBusiness: name,
  });
  const competitorTopic = competitorIdea.topic;
  const competitorInstruction = `\nPost topic inspiration from a top ranked business in this industry (${competitorIdea.competitor}, found at ${competitorIdea.sourceUrl}): ${competitorTopic}. Use this as inspiration but make the post specific to ${name} and ${locationCity}. Do not copy this topic directly, adapt it to feel authentic to this business.\n`;

  const keywordStyle = variationSeed % 2 === 0 ? 'local' : 'service';
  const keywordStyleInstruction =
    keywordStyle === 'local'
      ? `Naturally include a local keyword phrase such as "${primaryKeyword} ${locationCity}" or "${primaryKeyword} in ${locationCity}" somewhere in the post.`
      : `Naturally include a service or brand style keyword phrase such as "certified ${categoryLabel} specialist" or "professional ${primaryKeyword} service" somewhere in the post.`;

  const toneInstruction = isQandA
    ? 'Write like the owner answering a question a customer just asked, direct and helpful — NOT a personal anecdote or story about today'
    : isInformational
      ? 'Write like a knowledgeable business owner sharing a genuinely useful tip — NOT a personal anecdote or story about today'
      : isPromotional
        ? 'Write with confident, inviting energy promoting a specific service or offer — NOT a personal anecdote or story about today'
        : 'First person casual tone like a real business owner texting a neighbor';

  const structureInstruction = isQandA
    ? 'Lead with the customer question, then answer it fully and plainly so someone searching that question gets a complete answer'
    : isInformational
      ? 'Teach something specific and useful — a clear tip, then why it matters or what to do about it'
      : isPromotional
        ? 'Highlight the specific service or offer clearly, create gentle urgency, and end with a direct call to action'
        : 'Feel like a different moment and situation every time';

  const repeatAvoidanceInstruction = isQandA
    ? 'You must write something completely different from all of the above. Answer only the one question given below, and do not repeat a question already answered above.'
    : isInformational
      ? 'You must write something completely different from all of the above. Different opening line. Different specific tip or topic. Different structure. Do not repeat a tip or topic already covered above.'
      : isPromotional
        ? 'You must write something completely different from all of the above. Different opening word. Different service angle or offer framing. Different sentence structure.'
        : 'You must write something completely different from all of the above. Different opening word. Different scenario. Different angle. Different sentence structure. Pretend something genuinely new happened today at this business.';

  const userPrompt = `You are writing a Google Business Profile post for ${name}, a ${categoryLabel} business in ${locationCity}.

Today is ${currentDayOfWeek} in ${currentMonth}. Post number ${dayOfYear}. Variation seed ${variationSeed}. Post type today: ${postTypeLabel}.

${seasonalContext}

Business focus for this post: ${businessFocus}
${typeAngle.angle ? `\nPost type angle (${postTypeLabel}): ${typeAngle.angle}\n` : ''}
Previous posts from this business (maintain same voice and style):
${voiceSample}

VOICE RULE: match the voice, rhythm and personality of those previous posts exactly — a reader should believe the same person wrote all of them. Match the voice, never the content: the subject, opening and structure below must be new.

RECENT POSTS ALREADY WRITTEN — DO NOT REPEAT ANY OF THESE OPENINGS, THEMES, STRUCTURES OR IDEAS:
${recentPostsSummary}

${repeatAvoidanceInstruction}
${competitorInstruction}${brandInstruction}
${previousOpeningWord ? `\nHARD RULE: The most recent post started with the word "${previousOpeningWord}". Your post must NOT start with "${previousOpeningWord}" or any close variant of it — pick a completely different opening word.\n` : ''}
Local SEO requirement: ${keywordStyleInstruction}

Call to action requirement: End the post with a call to action that matches this meaning: "${cta}" (you may rephrase it slightly but keep the same intent and keep it at the very end).

Rules:
- ${toneInstruction}
- Must relate specifically to ${businessFocus} with real industry scenarios
- ${structureInstruction}
- Under ${maxWords} words
- Mention ${name} naturally once
- Include the local keyword and the call to action naturally, never like an ad
- Sound human not AI
- Current day: ${currentDayOfWeek}, Current month: ${currentMonth}
- ${seasonalContext}

Be creative. Surprise me with a fresh angle every single time.`;

  const client = new OpenAI({ apiKey });
  const systemPrompt = buildSystemPrompt({
    businessName: name,
    city: locationCity,
    postTypeLabel,
    industry: categoryLabel,
    maxWords,
    personality: getBusinessPersonality(name),
  });

  /** Attempts recorded for the failure report, so a rejection is never silent. */
  const attemptLog = [];

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    // Each retry states the miss explicitly — repeating the identical prompt
    // mostly reproduces the identical omission.
    const retryNudge =
      attempt > 1
        ? `\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED: ${attemptLog[attempt - 2].reason}. This attempt MUST fix that. The brand name must appear verbatim in the post text.`
        : '';

    let cleaned;
    try {
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.8,
        max_tokens: Math.min(1000, Math.max(200, Math.round(maxWords * 2.2))),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${userPrompt}${retryNudge}` },
        ],
      });

      const content = completion.choices[0]?.message?.content?.trim();
      if (!content) throw new Error('OpenAI returned empty content');
      cleaned = stripWrappingQuotes(content);
    } catch (e) {
      const reason = `generation request failed: ${e?.message ?? String(e)}`;
      attemptLog.push({ attempt, reason });
      console.error(
        JSON.stringify({
          event: 'openai_generate_failed',
          error: e?.message ?? String(e),
          businessName: name,
          locationId,
          postType,
          postTypeLabel,
          attempt,
        }),
      );
      continue;
    }

    const wrongBusiness = contentMentionsOtherBusiness(cleaned, name, otherBusinessNames);
    if (wrongBusiness) {
      const reason = `content named a different business ("${wrongBusiness}")`;
      attemptLog.push({ attempt, reason });
      console.warn(
        JSON.stringify({
          event: 'openai_wrong_business_name',
          expected: name,
          found: wrongBusiness,
          locationId,
          attempt,
        }),
      );
      continue;
    }

    if (!contentIncludesBusinessName(cleaned, name)) {
      const reason = `content never mentioned "${name}"`;
      attemptLog.push({ attempt, reason });
      console.warn(
        JSON.stringify({
          event: 'openai_missing_business_name',
          businessName: name,
          locationId,
          attempt,
        }),
      );
      continue;
    }

    // Hard gate: a post flagged for a brand mention does not ship without one.
    const brandFound = shouldMentionBrand ? findMentionedBrand(cleaned, brandsForIndustry) : null;
    if (shouldMentionBrand && !brandFound) {
      const reason = `brand mention required (post #${postCount}) but none of [${brandsForIndustry.join(', ')}] appeared`;
      attemptLog.push({ attempt, reason });
      console.warn(
        JSON.stringify({
          event: 'openai_brand_mention_missing',
          businessName: name,
          locationId,
          attempt,
          postCount,
          requiredBrands: brandsForIndustry,
        }),
      );
      continue;
    }

    console.info(
      JSON.stringify({
        event: 'openai_post_generated',
        businessName: name,
        locationId,
        postTypeLabel,
        postCount,
        personality: getBusinessPersonality(name),
        brandMentionRequested: shouldMentionBrand,
        brandMentioned: brandFound,
        qandaQuestion,
        attempts: attempt,
        competitorTopic,
        competitorName: competitorIdea.competitor,
        competitorSourceUrl: competitorIdea.sourceUrl,
        competitorEvidence: competitorIdea.evidence,
      }),
    );

    return cleaned;
  }

  // Every attempt was rejected. A brand-flagged post must never be published
  // without its brand, so fail loudly with the full attempt history rather than
  // returning the canned draft (which contains no brand either).
  if (shouldMentionBrand) {
    throw new AppError(
      `Post generation failed for ${name}: ${MAX_GENERATION_ATTEMPTS} attempts could not produce the required brand mention. Nothing was published.`,
      502,
      {
        code: 'POST_BRAND_MENTION_FAILED',
        details: {
          businessName: name,
          locationId,
          postCount,
          requiredBrands: brandsForIndustry,
          attempts: attemptLog,
        },
      },
    );
  }

  console.warn(
    JSON.stringify({
      event: 'openai_post_fell_back_to_draft',
      businessName: name,
      locationId,
      attempts: attemptLog,
    }),
  );
  return draft;
}

/**
 * The five questions customers actually ask each trade. Kept as templates so
 * the city is filled in per location rather than hardcoded per business.
 */
const QA_QUESTION_SETS = {
  hvac: [
    'Do you offer emergency AC repair?',
    'What brands do you service?',
    'How often should I service my HVAC?',
    'Do you serve {city}?',
    'How much does AC repair cost?',
  ],
  automotive: [
    'Do you buy cars?',
    'What types of vehicles do you sell?',
    'Do you offer financing?',
    'Do you serve {city}?',
    'Are your vehicles inspected?',
  ],
  general: [
    'What services do you offer?',
    'Do you serve the {city} area?',
    'How do I contact you?',
    'What are your hours?',
    'Do you offer free estimates?',
  ],
};

/** Questions for a category, with {city} resolved. Trades with no dedicated set fall back to general. */
function getQuestionsForIndustry(industry, city) {
  const key = getIndustryKey(industry);
  const questions = QA_QUESTION_SETS[key] ?? QA_QUESTION_SETS.general;
  const town = String(city ?? '').trim() || 'the local area';
  return questions.map((q) => q.replace(/\{city\}/g, town));
}

/**
 * Answers used when OpenAI is unavailable. Deliberately vague on specifics we
 * cannot know (price, hours) — a wrong answer on a live GBP listing is worse
 * than a general one, and these are published to customers.
 */
function buildFallbackAnswer(businessName, city) {
  return `Thanks for asking. ${businessName} handles this for customers across ${city} — give us a call and we will talk you through exactly what you need and what it involves.`;
}

/**
 * Generates 5 question-and-answer pairs for a business's GBP profile.
 *
 * Answers come from a single OpenAI call rather than five: it is cheaper, and
 * one call sees all five questions at once so the answers share a voice and do
 * not contradict each other on hours, coverage or services.
 *
 * @param {{ id?: string }|string|null} location - location record or id (used for logging)
 * @param {string} businessName
 * @param {string} industry - category label, matched via getIndustryKey
 * @param {string} city
 * @returns {Promise<Array<{ question: string, answer: string }>>}
 */
export async function generateGBPQandA(location, businessName, industry, city) {
  const locationId = typeof location === 'string' ? location : (location?.id ?? null);
  const name = String(businessName ?? '').trim() || 'Business';
  const town = String(city ?? '').trim() || 'this area';
  const categoryLabel = String(industry ?? '').trim() || 'local business';
  const questions = getQuestionsForIndustry(categoryLabel, town);
  const apiKey = env.OPENAI_API_KEY?.trim();

  const fallback = questions.map((question) => ({
    question,
    answer: buildFallbackAnswer(name, town),
  }));

  if (!apiKey) {
    console.warn(
      JSON.stringify({ event: 'qa_openai_skipped', reason: 'OPENAI_API_KEY not configured' }),
    );
    return fallback;
  }

  const personality = getBusinessPersonality(name);
  const brands = getIndustryBrands(categoryLabel);

  const systemPrompt = `You are the voice of ${name}. You always write in the same consistent style. You are friendly, knowledgeable and local. You never sound corporate. You never use buzzwords. You speak like a real local business owner who knows their craft. Every post you write sounds like it came from the same person. Keep this voice consistent across all posts.

Your fixed personality, which never changes: ${personality}.

You are answering the questions customers most often ask ${name}, a ${categoryLabel} business in ${town}. These answers appear publicly on the business's Google Business Profile, so they must be accurate and safe.`;

  const userPrompt = `Write a natural answer to each of these questions for ${name} in ${town}:

${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Rules:
- 2 to 3 sentences per answer, written in the business's own voice
- Specific to ${name} and ${categoryLabel}, never generic filler that could describe any business
- Mention ${town} where it reads naturally, not in every answer
- Never invent a price, a discount, or specific opening hours. For cost questions explain what the price depends on and invite them to call for a quote. For hours questions point them to the profile or a phone call.
${brands.length > 0 ? `- Where a question is about brands or equipment, it is fine to name real ones such as: ${brands.join(', ')}\n` : ''}- No hashtags, no emojis, no corporate buzzwords

Return strict JSON in exactly this shape and nothing else:
{"pairs":[{"question":"...","answer":"..."}]}`;

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) throw new Error('OpenAI returned empty Q&A content');

    const parsed = JSON.parse(raw);
    const pairs = Array.isArray(parsed?.pairs) ? parsed.pairs : [];

    // Pair the model's answers back onto our fixed question list by position:
    // the questions are ours to control, and this keeps the count at exactly 5
    // even if the model drops, reorders or reworded one.
    const result = questions.map((question, i) => {
      const answer = String(pairs[i]?.answer ?? '').trim();
      return { question, answer: answer || fallback[i].answer };
    });

    console.info(
      JSON.stringify({
        event: 'qa_generated',
        businessName: name,
        locationId,
        industry: getIndustryKey(categoryLabel),
        pairCount: result.length,
      }),
    );

    return result;
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'qa_generate_failed',
        error: e?.message ?? String(e),
        businessName: name,
        locationId,
      }),
    );
    return fallback;
  }
}
