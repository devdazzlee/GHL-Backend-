import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countWords, READ_MORE_MIN_WORDS, shouldCollapse } from '../src/lib/readMore.ts';

const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

test('counts words across paragraphs, ignoring extra spaces', () => {
  assert.equal(countWords(['one  two', ' three ', '']), 3);
});

test('a typical 3-paragraph local guide (~280-350 words) is folded', () => {
  assert.equal(shouldCollapse([words(100), words(100), words(84)]), true);
});

test('a short guide is shown in full', () => {
  assert.equal(shouldCollapse([words(READ_MORE_MIN_WORDS)]), false);
  assert.equal(shouldCollapse([words(60), words(40)]), false);
  assert.equal(shouldCollapse([]), false);
});
