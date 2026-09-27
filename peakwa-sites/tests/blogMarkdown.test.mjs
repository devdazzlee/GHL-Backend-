import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legacyPostBlocks, parseBlogMarkdown, parseInline, resolveHref } from '../src/lib/blogMarkdown.ts';

test('parses headings, paragraphs, lists and images from an edited body', () => {
  const blocks = parseBlogMarkdown(
    'First line\ncontinues here.\n\n## Why it matters\n\nSee [our services](services).\n\n- one\n- two [link](https://example.com)\n\n![A dog](https://res.cloudinary.com/x/dog.jpg)\n\n### Small print\n\nEnd.',
  );
  assert.deepEqual(
    blocks.map((b) => b.type),
    ['p', 'h2', 'p', 'ul', 'img', 'h3', 'p'],
  );
  assert.deepEqual(blocks[0], { type: 'p', parts: [{ text: 'First line continues here.' }] });
  assert.deepEqual(blocks[2].parts, [{ text: 'See ' }, { text: 'our services', href: 'services' }, { text: '.' }]);
  assert.equal(blocks[3].items.length, 2);
  assert.deepEqual(blocks[4], { type: 'img', alt: 'A dog', url: 'https://res.cloudinary.com/x/dog.jpg' });
});

test('never turns HTML or unsafe images into markup', () => {
  const blocks = parseBlogMarkdown('<script>alert(1)</script>\n\n![x](http://insecure.example.com/a.jpg)');
  assert.deepEqual(blocks.map((b) => b.type), ['p', 'p'], 'no image block for a non-https image');
  assert.deepEqual(blocks[0].parts, [{ text: '<script>alert(1)</script>' }], 'HTML stays plain text (React escapes it)');
});

test('links: site pages become site paths; external kept; script URLs dropped', () => {
  assert.equal(resolveHref('services', 'paws'), '/paws/services');
  assert.equal(resolveHref('/blog/my-post', 'paws'), '/paws/blog/my-post');
  assert.equal(resolveHref('/paws/contact', 'paws'), '/paws/contact');
  assert.equal(resolveHref('https://example.com/a', 'paws'), 'https://example.com/a');
  assert.equal(resolveHref('javascript:alert(1)', 'paws'), null);
  assert.deepEqual(parseInline('plain'), [{ text: 'plain' }]);
});

test('posts stored with the site render the same structure as before', () => {
  const blocks = legacyPostBlocks({
    title: 'T',
    introduction: 'Intro.',
    sections: [{ heading: 'H', paragraphs: ['P.'], subsections: [{ heading: 'S', paragraphs: ['Q.'] }] }],
    inlineImages: [{ afterSection: 0, url: 'https://img/1.jpg', alt: 'i' }],
    conclusion: 'Bye.',
  });
  assert.deepEqual(blocks.map((b) => b.type + (b.variant ? `:${b.variant}` : '')), ['p:lead', 'h2', 'p', 'h3', 'p', 'img', 'p:closing']);
});
