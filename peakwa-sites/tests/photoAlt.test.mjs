import { test } from 'node:test';
import assert from 'node:assert/strict';
import { illustrativeAlt, pexelsPhotoId, photoAlt } from '../src/lib/photoAlt.ts';

const url = 'https://images.pexels.com/photos/3807517/pexels-photo-3807517.jpeg?auto=compress&w=940';
const photos = { 3807517: { alt: 'Technician checking an air conditioner' }, 42: { alt: '  ' } };

test("a stock photo's alt text is Pexels' own description of it", () => {
  assert.equal(pexelsPhotoId(url), '3807517');
  assert.equal(photoAlt(url, photos, 'AC Repair'), 'Technician checking an air conditioner');
});

test('without a description it says what the photo illustrates, never that it is the business', () => {
  assert.equal(photoAlt('https://images.pexels.com/photos/42/x.jpeg', photos, ' AC   Repair '), 'Stock photo: AC Repair');
  assert.equal(photoAlt('https://images.pexels.com/photos/9/x.jpeg', undefined, 'Pet boarding'), 'Stock photo: Pet boarding');
  assert.equal(illustrativeAlt(undefined), 'Stock photo');
});

test("an uploaded photo (maybe the business's own) is described by its topic alone", () => {
  assert.equal(pexelsPhotoId('https://res.cloudinary.com/demo/photos/3807517/x.jpg'), null);
  assert.equal(photoAlt('https://res.cloudinary.com/demo/photos/3807517/x.jpg', photos, 'Dog Boarding'), 'Dog Boarding');
});
