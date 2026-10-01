import './helpers/env.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/database/client.js';
import { env } from '../src/config/env.js';
import { classifyRequest } from '../src/middleware/phase4Auth.js';
import { getStoredSiteImages, resetImagePickState, setSiteImage } from '../src/services/siteImages.service.js';
import {
  getSiteVideo,
  labelFromPageUrl,
  pickVideoFile,
  pickVideoIfMissing,
  readVideo,
  resetVideoPickState,
  setSiteVideo,
  videoForRenderer,
  videoFromPexels,
} from '../src/services/siteVideo.service.js';

const file = (width, height, extra = {}) => ({
  file_type: 'video/mp4',
  width,
  height,
  link: `https://videos.pexels.com/video-files/1/${width}.mp4`,
  ...extra,
});
const pexelsVideo = (id, extra = {}) => ({
  id,
  width: 1920,
  height: 1080,
  duration: 12,
  url: `https://www.pexels.com/video/a-hand-setting-a-thermostat-${id}/`,
  image: `https://images.pexels.com/videos/${id}/poster.jpeg`,
  user: { name: 'Jane  Doe', url: 'https://www.pexels.com/@jane' },
  video_files: [file(3840, 2160), file(1280, 720), file(640, 360)],
  ...extra,
});

let site;

function stubPrisma(imagesContent = null) {
  site = {
    id: 'site-1',
    slug: 'brightvale',
    businessName: 'Brightvale Heating & Air',
    industry: 'HVAC',
    imagesContent,
    blogContent: JSON.stringify({ posts: [] }),
    homeContent: JSON.stringify({ services: [{ title: 'AC Repair' }] }),
    servicesContent: null,
  };
  prisma.generatedSite.findUnique = async ({ where, select }) => {
    if (where.id !== site.id) return null;
    return select ? { imagesContent: site.imagesContent } : { ...site };
  };
  prisma.generatedSite.update = async ({ data }) => Object.assign(site, data);
}

const settle = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

beforeEach(() => {
  resetVideoPickState();
  resetImagePickState();
  env.PEXELS_API_KEY = 'test-key-not-real';
});

describe('choosing a clip', () => {
  it('plays an MP4 near 1280 px wide, never 4K', () => {
    assert.equal(pickVideoFile([file(3840, 2160), file(1920, 1080), file(1280, 720), file(640, 360)]).width, 1280);
    assert.equal(pickVideoFile([file(3840, 2160), file(640, 360), file(800, 450)]).width, 800, 'smaller beats 4K');
    assert.equal(pickVideoFile([file(3840, 2160)]), null);
    assert.equal(pickVideoFile([file(1280, 720, { file_type: 'video/webm' })]), null);
    assert.equal(pickVideoFile([file(1280, 720, { link: 'http://insecure/x.mp4' })]), null);
  });

  it('keeps short landscape clips with a poster; the label says what the clip shows', () => {
    const v = videoFromPexels(pexelsVideo(42));
    assert.deepEqual(
      { url: v.url, width: v.width, label: v.label, credit: v.credit },
      {
        url: 'https://videos.pexels.com/video-files/1/1280.mp4',
        width: 1280,
        label: 'A hand setting a thermostat',
        credit: { videographer: 'Jane Doe', videographerUrl: 'https://www.pexels.com/@jane', pageUrl: 'https://www.pexels.com/video/a-hand-setting-a-thermostat-42/' },
      },
    );
    assert.equal(videoFromPexels(pexelsVideo(1, { width: 1080, height: 1920 })), null, 'portrait');
    assert.equal(videoFromPexels(pexelsVideo(1, { duration: 95 })), null, 'too long to loop');
    assert.equal(videoFromPexels(pexelsVideo(1, { image: null })), null, 'no poster');
  });

  it('reads the label from the Pexels page name, or none', () => {
    assert.equal(labelFromPageUrl('https://www.pexels.com/video/man-with-2-dogs-in-a-park-12345/'), 'Man with 2 dogs in a park');
    assert.equal(labelFromPageUrl('https://www.pexels.com/video/12345/'), null);
    assert.equal(labelFromPageUrl(null), null);
  });
});

describe('automatic pick', () => {
  beforeEach(() => stubPrisma());

  it('picks once from a search for the trade, then keeps it', async () => {
    const queries = [];
    const search = async (q) => {
      queries.push(q);
      return [1, 2, 3, 4, 5, 6, 7].map((id) => videoFromPexels(pexelsVideo(id)));
    };
    assert.equal(await pickVideoIfMissing({ ...site }, { search }), true);
    const stored = readVideo(site);
    assert.equal(stored.source, 'AUTO');
    assert.ok(['1', '2', '3', '4', '5'].includes(stored.pexelsId), 'one of the top five');
    assert.equal(await pickVideoIfMissing({ ...site }, { search }), false);
    assert.deepEqual(queries, ['HVAC']);
  });

  it('the renderer gets nothing on the first render, the clip after the background pick', async () => {
    const search = async () => [videoFromPexels(pexelsVideo(9))];
    assert.equal(getSiteVideo({ ...site }, { search, revalidate: false }), null);
    await settle();
    assert.deepEqual(getSiteVideo({ ...site }, { search, revalidate: false }), {
      url: 'https://videos.pexels.com/video-files/1/1280.mp4',
      poster: 'https://images.pexels.com/videos/9/poster.jpeg',
      label: 'A hand setting a thermostat',
      width: 1280,
      height: 720,
    });
  });

  it('backs off after a 429 and never picks without a key', async () => {
    let calls = 0;
    const limited = async () => {
      calls += 1;
      throw Object.assign(new Error('429'), { rateLimited: true });
    };
    assert.equal(await pickVideoIfMissing({ ...site }, { search: limited }), false);
    assert.equal(await pickVideoIfMissing({ ...site }, { search: limited }), false);
    assert.equal(calls, 1, 'nothing sent during the cooldown');
    resetVideoPickState();
    env.PEXELS_API_KEY = '';
    assert.equal(await pickVideoIfMissing({ ...site }, { search: limited }), false);
    assert.equal(calls, 1);
  });
});

describe('dashboard choices', () => {
  beforeEach(() => stubPrisma());

  it('a chosen clip is looked up on Pexels by its number; removing it means no video, never re-picked', async () => {
    const lookedUp = [];
    const lookup = async (id) => {
      lookedUp.push(id);
      return videoFromPexels(pexelsVideo(Number(id)));
    };
    const chosen = await setSiteVideo('site-1', { pexelsId: '77', url: 'https://evil.example/x.mp4' }, { lookup });
    assert.deepEqual(lookedUp, ['77']);
    assert.equal(chosen.video.status, 'SHOWN');
    assert.equal(readVideo(site).url, 'https://videos.pexels.com/video-files/1/1280.mp4', 'link from Pexels, not from the request');

    const removed = await setSiteVideo('site-1', { remove: true }, { lookup });
    assert.deepEqual(removed.video, { status: 'REMOVED' });
    assert.equal(videoForRenderer(readVideo(site)), null);
    let searched = false;
    await pickVideoIfMissing({ ...site }, { search: async () => ((searched = true), []) });
    assert.equal(searched, false);
  });

  it('refuses anything that is not a Pexels video number or not a usable clip', async () => {
    const lookup = async () => null;
    await assert.rejects(setSiteVideo('site-1', { pexelsId: 'abc' }, { lookup }), (e) => e.code === 'INVALID_VIDEO');
    await assert.rejects(setSiteVideo('site-1', {}, { lookup }), (e) => e.code === 'INVALID_VIDEO');
    await assert.rejects(setSiteVideo('site-1', { pexelsId: '5' }, { lookup }), (e) => e.code === 'INVALID_VIDEO');
    await assert.rejects(setSiteVideo('missing', { remove: true }, { lookup }), (e) => e.code === 'SITE_NOT_FOUND');
  });

  it('changing a page photo keeps the video, and the video keeps the photos', async () => {
    await getStoredSiteImages({ ...site }, { autoPickFn: async (_s, slot) => `https://images.pexels.com/photos/1/${slot.id}.jpg`, background: false });
    await setSiteVideo('site-1', { pexelsId: '5' }, { lookup: async () => videoFromPexels(pexelsVideo(5)) });
    await setSiteImage('site-1', 'hero', { url: 'https://res.cloudinary.com/demo/own.jpg', source: 'UPLOAD' });
    const stored = JSON.parse(site.imagesContent);
    assert.equal(stored.video.pexelsId, '5');
    assert.equal(stored.hero.url, 'https://res.cloudinary.com/demo/own.jpg');
    assert.ok(stored.about.url);
  });

  it('video settings are admin-only; the renderer gets the clip with the images', () => {
    for (const [method, path] of [
      ['GET', '/sites/abc/video'],
      ['PUT', '/sites/abc/video'],
      ['GET', '/sites/abc/stock-videos'],
    ]) {
      assert.equal(classifyRequest(method, path), 'admin', `${method} ${path}`);
    }
    assert.equal(classifyRequest('GET', '/sites/abc/images'), 'renderer-readable');
  });
});
