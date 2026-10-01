import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStockVideo, stockVideoLabel } from '../src/lib/stockVideo.ts';

const raw = {
  url: 'https://videos.pexels.com/video-files/42/1280.mp4',
  poster: 'https://images.pexels.com/videos/42/poster.jpeg',
  label: 'A hand setting a thermostat',
  width: 1280,
  height: 720,
};

test('reads the clip the backend sends; anything incomplete or not https means no video', () => {
  assert.deepEqual(parseStockVideo(raw), raw);
  assert.equal(parseStockVideo(null), null);
  assert.equal(parseStockVideo({ ...raw, url: 'http://videos.pexels.com/x.mp4' }), null);
  assert.equal(parseStockVideo({ ...raw, poster: undefined }), null);
  assert.deepEqual(parseStockVideo({ ...raw, label: '  ', width: 0 }), { ...raw, label: null, width: 1280 });
});

test('the screen-reader label says it is stock footage and what it shows', () => {
  assert.equal(stockVideoLabel({ label: 'A hand setting a thermostat' }, 'HVAC'), 'Stock video: A hand setting a thermostat');
  assert.equal(stockVideoLabel({ label: null }, ' HVAC '), 'Stock video: HVAC');
  assert.equal(stockVideoLabel({ label: null }), 'Stock video');
});
