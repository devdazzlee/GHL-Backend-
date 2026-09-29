import './helpers/env.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/database/client.js';
import { classifyRequest } from '../src/middleware/phase4Auth.js';
import { dropServiceEdits, regenerateService } from '../src/services/serviceRegeneration.service.js';

const edit = (value, anchor) => ({ value, original: 'o', ...(anchor ? { anchor } : {}), editedAt: '2026-09-01' });

const EDITS = {
  services: {
    'services.0.shortDescription': edit('my boarding text', 'Dog Boarding'),
    'services.1.shortDescription': edit('my grooming text', 'Grooming'),
    'services.1.fullDescription': edit('my long grooming text', 'Grooming'),
    'hero.heading': edit('Our services'),
  },
  home: {
    'services.1.description': edit('home grooming blurb', 'Grooming'),
    'hero.heading': edit('Welcome!'),
  },
  about: { 'story.text': edit('our story') },
  'service:grooming': { 'overview': edit('page text') },
  'service:dog-boarding': { 'overview': edit('boarding page text') },
};

describe('dropping one service’s hand edits', () => {
  it('removes only that service’s edits (services list, home list, its own page)', () => {
    const { edits, removed } = dropServiceEdits(JSON.stringify(EDITS), 'Grooming', 'grooming');
    assert.equal(removed, 4);
    assert.deepEqual(Object.keys(edits.services).sort(), ['hero.heading', 'services.0.shortDescription']);
    assert.deepEqual(Object.keys(edits.home), ['hero.heading']);
    assert.deepEqual(edits.about, EDITS.about, 'other pages untouched');
    assert.equal(edits['service:grooming'], undefined);
    assert.deepEqual(edits['service:dog-boarding'], EDITS['service:dog-boarding'], 'other service pages untouched');
  });

  it('with no edits at all, nothing to drop', () => {
    assert.deepEqual(dropServiceEdits(null, 'Grooming', 'grooming'), { edits: {}, removed: 0 });
  });
});

describe('regenerating one service', () => {
  let site;
  let saved;
  let revalidated;
  let pageRegenerated;

  beforeEach(() => {
    saved = null;
    revalidated = [];
    pageRegenerated = [];
    site = {
      id: 'site-1',
      slug: 'paws-denver',
      servicesContent: JSON.stringify({
        intro: 'Services intro',
        services: [
          { title: 'Dog Boarding', shortDescription: 'b', fullDescription: 'B', icon: 'home' },
          { title: 'Grooming', shortDescription: 'g', fullDescription: 'G', icon: 'star' },
        ],
      }),
      homeContent: JSON.stringify({
        hero: { heading: 'Welcome!' },
        services: [
          { title: 'Dog Boarding', description: 'b', icon: 'home' },
          { title: 'Grooming', description: 'g', icon: 'star' },
        ],
      }),
      contentEdits: JSON.stringify(EDITS),
    };
    prisma.generatedSite.findUnique = async () => site;
    prisma.generatedSite.update = async ({ data }) => {
      saved = data;
      return { ...site, ...data };
    };
  });

  const deps = {
    generate: async (_site, title) => ({ shortDescription: `new short for ${title}`, fullDescription: `new full for ${title}`, icon: 'heart' }),
    regeneratePage: async (_site, slug) => {
      pageRegenerated.push(slug);
    },
    revalidateFn: async (slug) => {
      revalidated.push(slug);
    },
  };

  it('rewrites that service and its home line, keeps its name, leaves the other service alone', async () => {
    const result = await regenerateService('site-1', 'grooming', deps);
    const services = JSON.parse(saved.servicesContent);
    assert.equal(services.intro, 'Services intro');
    assert.deepEqual(services.services[0], { title: 'Dog Boarding', shortDescription: 'b', fullDescription: 'B', icon: 'home' });
    assert.deepEqual(services.services[1], {
      title: 'Grooming',
      shortDescription: 'new short for Grooming',
      fullDescription: 'new full for Grooming',
      icon: 'heart',
    });
    const home = JSON.parse(saved.homeContent);
    assert.equal(home.hero.heading, 'Welcome!');
    assert.deepEqual(home.services[0], { title: 'Dog Boarding', description: 'b', icon: 'home' });
    assert.deepEqual(home.services[1], { title: 'Grooming', description: 'new short for Grooming', icon: 'heart' });
    assert.equal(result.handEditsReplaced, 4);
    const edits = JSON.parse(saved.contentEdits);
    assert.ok(edits.services['services.0.shortDescription'], 'the other service’s edit is kept');
    assert.ok(edits.about['story.text'], 'other pages’ edits are kept');
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(pageRegenerated, ['grooming'], 'its own page is rebuilt');
    assert.deepEqual(revalidated, ['paws-denver', 'paws-denver']);
  });

  it('an unknown service is a 404 and nothing is saved', async () => {
    await assert.rejects(regenerateService('site-1', 'no-such-service', deps), (e) => e.statusCode === 404 && e.code === 'SERVICE_NOT_FOUND');
    assert.equal(saved, null);
  });

  it('if the AI fails, nothing is saved', async () => {
    const failing = { ...deps, generate: async () => { throw new Error('AI down'); } };
    await assert.rejects(regenerateService('site-1', 'grooming', failing), /AI down/);
    assert.equal(saved, null);
  });

  it('needs an admin', () => {
    assert.equal(classifyRequest('POST', '/sites/site-1/services/grooming/regenerate'), 'admin');
  });
});
