import './helpers/env.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/database/client.js';
import { classifyRequest } from '../src/middleware/phase4Auth.js';
import {
  CREDIT_LOOKUPS_PER_HOUR,
  CREDIT_LOOKUPS_PER_RUN,
  creditFromPexelsPhoto,
  fillMissingCredits,
  pexelsPhotoId,
  resetCreditLookupState,
} from '../src/services/photoCredits.service.js';
import {
  getSitePhotos,
  listImageSlots,
  listSitePhotoCredits,
  resetImagePickState,
  setSiteImage,
} from '../src/services/siteImages.service.js';

const pexelsUrl = (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&h=650&w=940`;
const pexelsPhoto = (id) => ({
  id: Number(id),
  url: `https://www.pexels.com/photo/photo-${id}/`,
  photographer: `Photographer ${id}`,
  photographer_url: `https://www.pexels.com/@p${id}`,
  alt: `Description of photo ${id}`,
  src: { large2x: pexelsUrl(id), medium: pexelsUrl(id) },
});

let site;
let cityPages;
let blogPosts;

function stubPrisma(imagesContent = null) {
  site = {
    id: 'site-1',
    slug: 'paws-denver',
    businessName: 'Paws Retreat',
    industry: 'Pet Boarding',
    city: 'Denver',
    imagesContent,
    blogContent: JSON.stringify({ posts: [] }),
    homeContent: JSON.stringify({ services: [{ title: 'Dog Boarding' }] }),
    servicesContent: null,
  };
  cityPages = [{ city: 'Aurora', imageUrl: pexelsUrl(500) }, { city: 'Lakewood', imageUrl: null }];
  blogPosts = [{ title: 'Winter care', imageUrl: pexelsUrl(600), body: `Intro\n\n![dog in snow](${pexelsUrl(601)})\n\n![own](https://res.cloudinary.com/demo/own.jpg)` }];
  prisma.generatedSite.findUnique = async ({ where, select }) => {
    if (where.id !== site.id) return null;
    return select ? { imagesContent: site.imagesContent } : { ...site, locationPages: cityPages };
  };
  prisma.generatedSite.update = async ({ data }) => Object.assign(site, data);
  prisma.locationPage.findMany = async () => cityPages;
  prisma.blogPost.findMany = async () => blogPosts;
}

/** A Pexels lookup stand-in that records which photo numbers were asked for. */
function fakeLookup({ missing = [], rateLimitAfter = Infinity } = {}) {
  const calls = [];
  const fn = async (id) => {
    calls.push(id);
    if (calls.length > rateLimitAfter) throw Object.assign(new Error('429'), { rateLimited: true });
    return missing.includes(id) ? null : pexelsPhoto(id);
  };
  return Object.assign(fn, { calls });
}

/** Auto picks that return each photo with its credit, like the real Pexels pick. */
const creditedPicker = async (_site, slot) => {
  const id = { hero: '100', about: '101' }[slot.id] ?? `10${2 + (slot.index ?? 0)}`;
  return { url: pexelsUrl(id), credit: creditFromPexelsPhoto(pexelsPhoto(id)) };
};

const settle = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

const stored = () => JSON.parse(site.imagesContent);

beforeEach(() => {
  resetImagePickState();
  resetCreditLookupState();
});

describe('photo numbers and credits', () => {
  it('reads the Pexels photo number from its URL; anything else is not a stock photo', () => {
    assert.equal(pexelsPhotoId(pexelsUrl(3807517)), '3807517');
    assert.equal(pexelsPhotoId('https://res.cloudinary.com/demo/image/upload/photos/123/x.jpg'), null);
    assert.equal(pexelsPhotoId('https://example.com/photos/123/'), null);
    assert.equal(pexelsPhotoId(null), null);
  });

  it('keeps photographer, links and description; drops links that are not https', () => {
    assert.deepEqual(creditFromPexelsPhoto(pexelsPhoto('7')), {
      pexelsId: '7',
      photographer: 'Photographer 7',
      photographerUrl: 'https://www.pexels.com/@p7',
      pageUrl: 'https://www.pexels.com/photo/photo-7/',
      alt: 'Description of photo 7',
    });
    const odd = creditFromPexelsPhoto({ id: 8, photographer: ' ', photographer_url: 'javascript:alert(1)', url: 'http://x', alt: '' });
    assert.deepEqual(odd, { pexelsId: '8', photographer: null, photographerUrl: null, pageUrl: null, alt: null });
  });
});

describe('credits for new picks', () => {
  beforeEach(() => stubPrisma());

  it('stores the credit with every automatic pick and gives the renderer the descriptions', async () => {
    const lookup = fakeLookup();
    const { images, photos } = await getSitePhotos({ ...site, locationPages: cityPages }, { autoPickFn: creditedPicker, lookup, revalidate: false });
    assert.equal(images.hero, pexelsUrl(100));
    assert.equal(stored().credits['100'].photographer, 'Photographer 100');
    assert.equal(photos['101'].alt, 'Description of photo 101');
    await settle();
    // Only the city page photo had no credit yet; it was looked up in the background.
    assert.deepEqual(lookup.calls, ['500']);
    assert.equal(stored().credits['500'].alt, 'Description of photo 500');
  });

  it('a photo chosen in the dashboard is credited by its number, and existing credits survive', async () => {
    await getSitePhotos({ ...site, locationPages: [] }, { autoPickFn: creditedPicker, revalidate: false });
    // The credit is looked up through the Pexels API in the background (no key in tests, so nothing is sent).
    const slot = await setSiteImage('site-1', 'about', { url: pexelsUrl(777) });
    assert.deepEqual(slot.credit, { status: 'PENDING', pexelsId: '777' });
    await settle();
    assert.ok(stored().credits['100'], 'earlier credits kept when a slot changes');
    assert.equal(stored().about.url, pexelsUrl(777));
  });
});

describe('credits for photos already on sites', () => {
  it('looks them up by number a few at a time, and never touches the images themselves', async () => {
    const services = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`S${i}`, { url: pexelsUrl(200 + i), source: 'AUTO' }]));
    stubPrisma(JSON.stringify({ hero: { url: pexelsUrl(1), source: 'PICKED' }, services }));
    const before = stored();
    const ids = [pexelsPhotoId(pexelsUrl(1)), ...Object.values(services).map((e) => pexelsPhotoId(e.url))];
    const lookup = fakeLookup({ missing: ['1'] });

    const first = await fillMissingCredits({ ...site }, ids, { lookup });
    assert.equal(lookup.calls.length, CREDIT_LOOKUPS_PER_RUN);
    assert.deepEqual(first, { added: CREDIT_LOOKUPS_PER_RUN, missing: ids.length - CREDIT_LOOKUPS_PER_RUN });
    assert.deepEqual(stored().credits['1'], { pexelsId: '1', unavailable: true }, 'a photo Pexels no longer has is not asked for again');

    await fillMissingCredits({ ...site }, ids, { lookup });
    assert.equal(lookup.calls.length, ids.length, 'the rest on the next run, none twice');
    const after = stored();
    assert.deepEqual({ hero: after.hero, services: after.services }, { hero: before.hero, services: before.services });
  });

  it('stops at the first 429 and waits out a cooldown', async () => {
    stubPrisma();
    const lookup = fakeLookup({ rateLimitAfter: 2 });
    const result = await fillMissingCredits({ ...site }, ['1', '2', '3', '4'], { lookup });
    assert.deepEqual(result, { added: 2, missing: 2 });
    await fillMissingCredits({ ...site, imagesContent: site.imagesContent }, ['1', '2', '3', '4'], { lookup });
    assert.equal(lookup.calls.length, 3, 'nothing sent during the cooldown');
  });
});

describe('the hourly budget', () => {
  it('caps lookups across all sites, so the daily posts keep their Pexels quota', async () => {
    stubPrisma();
    const lookup = fakeLookup();
    const ids = Array.from({ length: CREDIT_LOOKUPS_PER_HOUR + 20 }, (_, i) => String(1000 + i));
    for (let run = 0; run < 12; run += 1) {
      await fillMissingCredits({ ...site, id: 'site-1', imagesContent: site.imagesContent }, ids, { lookup });
    }
    assert.equal(lookup.calls.length, CREDIT_LOOKUPS_PER_HOUR);
  });
});

describe('dashboard credits', () => {
  it('slots show their credit; the credits list has every photo once with where it is used', async () => {
    stubPrisma();
    const lookup = fakeLookup();
    await getSitePhotos({ ...site, locationPages: [] }, { autoPickFn: creditedPicker, revalidate: false, background: false });
    await setSiteImage('site-1', 'service:0', { url: 'https://res.cloudinary.com/demo/upload.jpg', source: 'UPLOAD' });
    // The city page uses the same photo as the hero.
    cityPages[0].imageUrl = pexelsUrl(100);

    const slots = await listImageSlots('site-1', { autoPickFn: creditedPicker, lookup, revalidate: false });
    assert.equal(slots[0].credit.photographer, 'Photographer 100');
    assert.deepEqual(slots[2].credit, { status: 'NOT_STOCK' });

    const { photos, pending } = await listSitePhotoCredits('site-1', { autoPickFn: creditedPicker, lookup, revalidate: false });
    const hero = photos.find((p) => p.url === pexelsUrl(100));
    assert.deepEqual(hero.usedIn, ['Home page banner', 'City page: Aurora']);
    assert.equal(hero.credit.status, 'KNOWN');
    assert.deepEqual(
      photos.filter((p) => p.credit.status === 'PENDING').map((p) => p.usedIn[0]),
      ['Blog post cover: Winter care', 'Blog post image: Winter care'],
    );
    assert.equal(pending, 2);
    assert.equal(photos.find((p) => p.url.includes('own.jpg')).credit.status, 'NOT_STOCK');
    await settle();
    assert.deepEqual(lookup.calls, ['600', '601']);
  });

  it('the credits list is admin-only', () => {
    assert.equal(classifyRequest('GET', '/sites/abc/photo-credits'), 'admin');
  });
});
