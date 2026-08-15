import OpenAI from 'openai';
import { env } from '../config/env.js';
import prisma from '../database/client.js';

const DEFAULT_MAX_POST_LENGTH = 80;
const MIN_POST_LENGTH = 50;
const MAX_POST_LENGTH = 300;

/** Clamps the configured word limit to the allowed 50-300 range, defaulting to 80. */
function resolveMaxWords(maxPostLength) {
  const n = Number(maxPostLength);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_POST_LENGTH;
  return Math.min(MAX_POST_LENGTH, Math.max(MIN_POST_LENGTH, Math.round(n)));
}

function buildSystemPrompt({ businessName, city, postTypeLabel, industry, maxWords }) {
  return `You are writing a Google Business Profile post for ${businessName} in ${city}.

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
 * Rotates the post type across INFORMATIONAL / PROMOTIONAL / STORY using the
 * day of year plus a random seed, so a location isn't stuck writing "today I
 * did this" story posts on every run. seed is randomized by the caller (see
 * generatePostContent) so the same day of year doesn't always land on the
 * same type.
 */
export function getRotatedPostType(dayOfYear, seed) {
  const day = Number.isFinite(Number(dayOfYear)) ? Number(dayOfYear) : 0;
  const rotation = (((day + seed) % 3) + 3) % 3;
  if (rotation === 0) return 'INFORMATIONAL';
  if (rotation === 1) return 'PROMOTIONAL';
  return 'STORY';
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
function getPostTypeAngle(postTypeLabel, category, businessName, offerTerms) {
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

  const recentPosts = locationId
    ? await prisma.post.findMany({
        where: { locationId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { content: true },
      })
    : [];

  const recentPostsSummary =
    recentPosts.length > 0
      ? recentPosts.map((p) => p.content.slice(0, 80)).join(' | ')
      : '(none yet)';

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
  const typeAngle = getPostTypeAngle(postTypeLabel, categoryLabel, name, offerTerms);
  const cta = typeAngle.cta || getCTA(businessType, primaryKeyword, locationCity);

  const draft = pickTemplate(recentContents, name, primaryKeyword, locationCity, cta);

  const currentDayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long' });
  const seasonalContext = getSeasonalPromptContext(categoryLabel);
  const variationSeed = Math.floor(Math.random() * 100);

  if (!apiKey) {
    console.warn(
      JSON.stringify({ event: 'openai_skipped', reason: 'OPENAI_API_KEY not configured' }),
    );
    return draft;
  }

  const keywordStyle = variationSeed % 2 === 0 ? 'local' : 'service';
  const keywordStyleInstruction =
    keywordStyle === 'local'
      ? `Naturally include a local keyword phrase such as "${primaryKeyword} ${locationCity}" or "${primaryKeyword} in ${locationCity}" somewhere in the post.`
      : `Naturally include a service or brand style keyword phrase such as "certified ${categoryLabel} specialist" or "professional ${primaryKeyword} service" somewhere in the post.`;

  const toneInstruction = isInformational
    ? 'Write like a knowledgeable business owner sharing a genuinely useful tip — NOT a personal anecdote or story about today'
    : isPromotional
      ? 'Write with confident, inviting energy promoting a specific service or offer — NOT a personal anecdote or story about today'
      : 'First person casual tone like a real business owner texting a neighbor';

  const structureInstruction = isInformational
    ? 'Teach something specific and useful — a clear tip, then why it matters or what to do about it'
    : isPromotional
      ? 'Highlight the specific service or offer clearly, create gentle urgency, and end with a direct call to action'
      : 'Feel like a different moment and situation every time';

  const repeatAvoidanceInstruction = isInformational
    ? 'You must write something completely different from all of the above. Different opening line. Different specific tip or topic. Different structure. Do not repeat a tip or topic already covered above.'
    : isPromotional
      ? 'You must write something completely different from all of the above. Different opening word. Different service angle or offer framing. Different sentence structure.'
      : 'You must write something completely different from all of the above. Different opening word. Different scenario. Different angle. Different sentence structure. Pretend something genuinely new happened today at this business.';

  const userPrompt = `You are writing a Google Business Profile post for ${name}, a ${categoryLabel} business in ${locationCity}.

Today is ${currentDayOfWeek} in ${currentMonth}. Post number ${dayOfYear}. Variation seed ${variationSeed}. Post type today: ${postTypeLabel}.

${seasonalContext}

Business focus for this post: ${businessFocus}
${typeAngle.angle ? `\nPost type angle (${postTypeLabel}): ${typeAngle.angle}\n` : ''}
RECENT POSTS ALREADY WRITTEN — DO NOT REPEAT ANY OF THESE OPENINGS, THEMES, STRUCTURES OR IDEAS:
${recentPostsSummary}

${repeatAvoidanceInstruction}
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

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.8,
      max_tokens: Math.min(1000, Math.max(200, Math.round(maxWords * 2.2))),
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt({
            businessName: name,
            city: locationCity,
            postTypeLabel,
            industry: categoryLabel,
            maxWords,
          }),
        },
        { role: 'user', content: userPrompt },
      ],
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('OpenAI returned empty content');
    }

    const cleaned = content.replace(/^["']|["']$/g, '');

    const wrongBusiness = contentMentionsOtherBusiness(cleaned, name, otherBusinessNames);
    if (wrongBusiness) {
      console.warn(
        JSON.stringify({
          event: 'openai_wrong_business_name',
          expected: name,
          found: wrongBusiness,
          locationId,
        }),
      );
      return draft;
    }

    if (!contentIncludesBusinessName(cleaned, name)) {
      console.warn(
        JSON.stringify({
          event: 'openai_missing_business_name',
          businessName: name,
          locationId,
        }),
      );
      return draft;
    }

    console.info(
      JSON.stringify({
        event: 'openai_post_generated',
        businessName: name,
        locationId,
        postTypeLabel,
      }),
    );

    return cleaned;
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'openai_generate_failed',
        error: e?.message ?? String(e),
        businessName: name,
        locationId,
        postType,
        postTypeLabel,
      }),
    );
    return draft;
  }
}
