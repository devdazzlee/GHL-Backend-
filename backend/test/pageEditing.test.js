import './helpers/env.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/database/client.js';
import { classifyRequest } from '../src/middleware/phase4Auth.js';
import {
  editableFields,
  keepServicesOnRegeneration,
  getPageEditor,
  revertPageEdit,
  savePageEdits,
  withRecordedEdits,
  withServicePageEdits,
} from '../src/services/siteContentEdits.service.js';
import { getStoredSiteImages, listImageSlots, setSiteImage } from '../src/services/siteImages.service.js';

// ---- In-memory stand-in for the Prisma calls these services make ----

let site;
let servicePages;

function stubPrisma(overrides = {}) {
  site = {
    id: 'site-1',
    slug: 'paws-denver',
    businessName: 'Paws Retreat',
    industry: 'Pet Boarding',
    city: 'Denver',
    contentEdits: null,
    imagesContent: null,
    blogContent: JSON.stringify({ posts: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] }),
    homeContent: JSON.stringify({
      hero: { heading: 'Welcome to Paws', subheading: 'Care you can trust', ctaUrl: 'contact', backgroundImage: 'x.jpg' },
      services: [
        { title: 'Dog Boarding', description: 'Short dog text', icon: 'dog' },
        { title: 'Cat Sitting', description: 'Short cat text', icon: 'cat' },
      ],
    }),
    servicesContent: JSON.stringify({
      intro: { heading: 'Our services', paragraphs: ['First paragraph.', 'Second paragraph.'] },
      services: [
        { title: 'Dog Boarding', shortDescription: 'Short dog text', fullDescription: 'Long dog text', icon: 'dog' },
        { title: 'Cat Sitting', shortDescription: 'Short cat text', fullDescription: 'Long cat text', icon: 'cat' },
      ],
    }),
    aboutContent: JSON.stringify({ story: { heading: 'Our story', paragraph1: 'We started small.' } }),
    contactContent: null,
    ...overrides,
  };
  servicePages = [
    { id: 'sp-1', siteId: 'site-1', serviceSlug: 'dog-boarding', content: JSON.stringify({ hero: { title: 'Dog boarding in Denver' }, overview: { paragraphs: ['Overview text.'] } }) },
  ];
  prisma.generatedSite.findUnique = async ({ where, select }) => {
    if (where.id !== site.id) return null;
    return select ? { imagesContent: site.imagesContent } : { ...site };
  };
  prisma.generatedSite.update = async ({ data }) => Object.assign(site, data);
  prisma.servicePage.findUnique = async ({ where }) =>
    servicePages.find((p) => p.siteId === where.siteId_serviceSlug.siteId && p.serviceSlug === where.siteId_serviceSlug.serviceSlug) ?? null;
  prisma.servicePage.update = async ({ where, data }) => Object.assign(servicePages.find((p) => p.id === where.id), data);
}

const json = (field) => JSON.parse(site[field]);

// ---- Text ----

describe('editable text fields', () => {
  it('lists readable text only (no links, icons, images or colours), including list items', () => {
    const fields = editableFields({
      hero: { heading: 'H', ctaUrl: 'contact', backgroundImage: 'x.jpg', accentColor: '#fff' },
      items: [{ title: 'T', icon: 'star', paragraphs: ['p1', 'p2', '  '] }],
      readTime: '5 min read',
    });
    assert.deepEqual(fields.map((f) => f.path), ['hero.heading', 'items.0.title', 'items.0.paragraphs.0', 'items.0.paragraphs.1']);
  });
});

describe('page text editing', () => {
  beforeEach(() => stubPrisma());

  it('lists readable text only; service titles are shown but read-only (they decide the URL)', async () => {
    const home = await getPageEditor('site-1', 'home');
    assert.deepEqual(
      home.fields.map((f) => f.path),
      ['hero.heading', 'hero.subheading', 'services.0.title', 'services.0.description', 'services.1.title', 'services.1.description'],
    );
    assert.equal(home.fields.find((f) => f.path === 'services.0.title').readOnly, true);
    const services = await getPageEditor('site-1', 'services');
    assert.ok(services.fields.some((f) => f.path === 'intro.paragraphs.1'));
  });

  it('saves an edited service description, mirrors it to the home page card and records it', async () => {
    const editor = await savePageEdits('site-1', 'services', [{ path: 'services.1.shortDescription', value: '  Cats stay calm with us.  ' }]);
    assert.equal(json('servicesContent').services[1].shortDescription, 'Cats stay calm with us.');
    assert.equal(json('homeContent').services[1].description, 'Cats stay calm with us.', 'home card follows');
    const edits = json('contentEdits');
    assert.deepEqual(
      { value: edits.services['services.1.shortDescription'].value, original: edits.services['services.1.shortDescription'].original, anchor: edits.services['services.1.shortDescription'].anchor },
      { value: 'Cats stay calm with us.', original: 'Short cat text', anchor: 'Cat Sitting' },
    );
    assert.equal(editor.fields.find((f) => f.path === 'services.1.shortDescription').edited, true);
  });

  it('refuses titles, links, unknown paths and empty text; never changes the page structure', async () => {
    for (const path of ['services.0.title', 'services.0.icon', 'hero.ctaUrl', 'hero.nope', 'services.9.shortDescription']) {
      await assert.rejects(savePageEdits('site-1', 'services', [{ path, value: 'x' }]), (e) => e.code === 'INVALID_EDIT', path);
    }
    await assert.rejects(savePageEdits('site-1', 'services', [{ path: 'intro.heading', value: '   ' }]), (e) => e.code === 'INVALID_EDIT');
    await assert.rejects(savePageEdits('site-1', 'settings', [{ path: 'a', value: 'b' }]), (e) => e.code === 'PAGE_NOT_FOUND');
  });

  it('undo puts the generated text back', async () => {
    await savePageEdits('site-1', 'about', [{ path: 'story.paragraph1', value: 'Edited story.' }]);
    await savePageEdits('site-1', 'about', [{ path: 'story.paragraph1', value: 'Edited twice.' }]);
    await revertPageEdit('site-1', 'about', 'story.paragraph1');
    assert.equal(json('aboutContent').story.paragraph1, 'We started small.');
    assert.deepEqual(json('contentEdits').about, {});
  });

  it('edits survive regeneration, follow their service when the order changes, and skip services that are gone', async () => {
    await savePageEdits('site-1', 'home', [{ path: 'hero.heading', value: 'Hand-written heading' }]);
    await savePageEdits('site-1', 'services', [
      { path: 'services.1.shortDescription', value: 'Edited cat text' },
      { path: 'services.0.fullDescription', value: 'Edited long dog text' },
    ]);
    // Regeneration: new wording everywhere, Cat Sitting now first, Dog Boarding gone.
    const regenerated = {
      homeContent: JSON.stringify({ hero: { heading: 'New generated heading', subheading: 'New sub' }, services: [{ title: 'Cat Sitting', description: 'gen' }] }),
      servicesContent: JSON.stringify({ services: [{ title: 'Cat Sitting', shortDescription: 'gen short', fullDescription: 'gen long' }, { title: 'Pet Taxi', shortDescription: 'gen', fullDescription: 'gen' }] }),
      theme: 'untouched',
    };
    const result = withRecordedEdits(site.contentEdits, regenerated);
    const home = JSON.parse(result.homeContent);
    const services = JSON.parse(result.servicesContent);
    assert.equal(home.hero.heading, 'Hand-written heading');
    assert.equal(home.hero.subheading, 'New sub');
    assert.equal(home.services[0].description, 'Edited cat text', 'home card edit followed Cat Sitting to index 0');
    assert.equal(services.services[0].shortDescription, 'Edited cat text');
    assert.equal(services.services[1].fullDescription, 'gen', 'the Dog Boarding edit does not land on Pet Taxi');
    assert.equal(result.theme, 'untouched');
  });

  it('regeneration keeps the services (and so their edits, pictures and URLs) unless the industry changed', async () => {
    await savePageEdits('site-1', 'services', [{ path: 'services.0.shortDescription', value: 'Hand-written dog text' }]);
    await savePageEdits('site-1', 'home', [{ path: 'hero.heading', value: 'Hand-written heading' }]);
    const regenerated = {
      homeContent: JSON.stringify({ hero: { heading: 'Generated heading', subheading: 'Generated sub' }, services: [{ title: 'Luxury Pet Boarding', description: 'gen' }] }),
      servicesContent: JSON.stringify({ intro: { heading: 'New intro' }, services: [{ title: 'Luxury Pet Boarding', shortDescription: 'gen' }] }),
    };
    const kept = withRecordedEdits(site.contentEdits, keepServicesOnRegeneration(site, 'pet boarding ', regenerated));
    const services = JSON.parse(kept.servicesContent);
    const home = JSON.parse(kept.homeContent);
    assert.deepEqual(services.services.map((s) => s.title), ['Dog Boarding', 'Cat Sitting']);
    assert.equal(services.services[0].shortDescription, 'Hand-written dog text');
    assert.equal(services.intro.heading, 'New intro', 'the rest of the page is regenerated');
    assert.equal(home.services[0].description, 'Hand-written dog text');
    assert.equal(home.hero.heading, 'Hand-written heading');
    assert.equal(home.hero.subheading, 'Generated sub');

    const newIndustry = keepServicesOnRegeneration(site, 'Plumbing', regenerated);
    assert.deepEqual(JSON.parse(newIndustry.servicesContent).services.map((s) => s.title), ['Luxury Pet Boarding']);
  });

  it('edits a service detail page and keeps the edit when that page is generated again', async () => {
    await savePageEdits('site-1', 'service:dog-boarding', [{ path: 'overview.paragraphs.0', value: 'Our own overview.' }]);
    assert.equal(JSON.parse(servicePages[0].content).overview.paragraphs[0], 'Our own overview.');
    const regenerated = withServicePageEdits(site.contentEdits, 'dog-boarding', { hero: { title: 'New' }, overview: { paragraphs: ['Generated again.'] } });
    assert.equal(regenerated.overview.paragraphs[0], 'Our own overview.');
    const missing = await getPageEditor('site-1', 'service:cat-sitting');
    assert.deepEqual({ available: missing.available, reason: missing.reason }, { available: false, reason: 'not_generated' });
  });
});

// ---- Images ----

function countingPicker() {
  const calls = [];
  const fn = async (_site, slot) => {
    calls.push(slot.id);
    return `https://images.pexels.com/auto/${slot.id.replace(':', '-')}-${calls.length}.jpg`;
  };
  return Object.assign(fn, { calls });
}

describe('page images', () => {
  beforeEach(() => stubPrisma());

  it('picks each image once and then keeps it (no more daily random pictures)', async () => {
    const picker = countingPicker();
    const first = await getStoredSiteImages({ ...site }, { autoPickFn: picker });
    assert.equal(picker.calls.length, 7, 'hero, about, 2 services, 3 blog covers');
    const second = await getStoredSiteImages({ ...site }, { autoPickFn: picker });
    assert.equal(picker.calls.length, 7, 'nothing picked again');
    assert.deepEqual(second, first);
    assert.equal(first.services.length, 2);
  });

  it('a chosen image replaces the automatic one and stays through later reads', async () => {
    const picker = countingPicker();
    await getStoredSiteImages({ ...site }, { autoPickFn: picker });
    const slot = await setSiteImage('site-1', 'service:1', { url: 'https://res.cloudinary.com/demo/cat.jpg', source: 'UPLOAD' });
    assert.deepEqual({ url: slot.url, source: slot.source, title: slot.title }, { url: 'https://res.cloudinary.com/demo/cat.jpg', source: 'UPLOAD', title: 'Cat Sitting' });
    const images = await getStoredSiteImages({ ...site }, { autoPickFn: picker });
    assert.equal(images.services[1], 'https://res.cloudinary.com/demo/cat.jpg');
    assert.equal(picker.calls.length, 7);
  });

  it('images stay with their service when services are reordered; a new service gets its own', async () => {
    const picker = countingPicker();
    const before = await getStoredSiteImages({ ...site }, { autoPickFn: picker });
    const services = json('servicesContent');
    services.services = [services.services[1], services.services[0], { title: 'Pet Taxi', shortDescription: 'x' }];
    site.servicesContent = JSON.stringify(services);
    site.homeContent = JSON.stringify({ services: [] });
    const after = await getStoredSiteImages({ ...site }, { autoPickFn: picker });
    assert.equal(after.services[0], before.services[1], 'Cat Sitting kept its picture');
    assert.equal(after.services[1], before.services[0], 'Dog Boarding kept its picture');
    assert.deepEqual(picker.calls.slice(7), ['service:2'], 'only Pet Taxi was picked');
  });

  it('an automatic pick never overwrites an image chosen at the same moment', async () => {
    const snapshot = { ...site };
    await setSiteImage('site-1', 'hero', { url: 'https://res.cloudinary.com/demo/chosen.jpg' });
    // A renderer request that started before the choice was saved:
    await getStoredSiteImages(snapshot, { autoPickFn: countingPicker() });
    assert.equal(JSON.parse(site.imagesContent).hero.url, 'https://res.cloudinary.com/demo/chosen.jpg');
  });

  it('validates choices', async () => {
    await assert.rejects(setSiteImage('site-1', 'hero', { url: 'http://insecure.example.com/x.jpg' }), (e) => e.code === 'INVALID_IMAGE');
    await assert.rejects(setSiteImage('site-1', 'service:9', { url: 'https://a.b/c.jpg' }), (e) => e.code === 'IMAGE_SLOT_NOT_FOUND');
    await assert.rejects(setSiteImage('site-1', 'hero', { url: 'https://a.b/c.jpg', source: 'AUTO' }), (e) => e.code === 'INVALID_IMAGE');
  });

  it('lists slots with labels and sources for the dashboard', async () => {
    const slots = await listImageSlots('site-1', { autoPickFn: countingPicker() });
    assert.deepEqual(slots.slice(0, 4).map((s) => `${s.id}|${s.label}|${s.source}`), [
      'hero|Home page banner|AUTO',
      'about|About section|AUTO',
      'service:0|Service: Dog Boarding|AUTO',
      'service:1|Service: Cat Sitting|AUTO',
    ]);
  });
});

describe('editor routes and keys', () => {
  it('editing is admin-only; the renderer can still read images', () => {
    assert.equal(classifyRequest('GET', '/sites/abc/images'), 'renderer-readable');
    for (const [method, path] of [
      ['GET', '/sites/abc/editor/home'],
      ['PUT', '/sites/abc/editor/services'],
      ['POST', '/sites/abc/editor/service:dog/generate'],
      ['GET', '/sites/abc/image-slots'],
      ['PUT', '/sites/abc/image-slots/hero'],
      ['GET', '/sites/abc/stock-photos'],
    ]) {
      assert.equal(classifyRequest(method, path), 'admin', `${method} ${path}`);
    }
  });
});
