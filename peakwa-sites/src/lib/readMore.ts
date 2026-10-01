/**
 * When a long text block starts collapsed behind "Read more" (like 551 HVAC's guide
 * sections). Pure, for unit tests. The text is always in the page; this only decides
 * whether it is shown folded.
 */

/** Blocks up to this many words are short enough to show in full. */
export const READ_MORE_MIN_WORDS = 160;

export function countWords(paragraphs: string[]): number {
  return paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
}

export function shouldCollapse(paragraphs: string[], minWords = READ_MORE_MIN_WORDS): boolean {
  return countWords(paragraphs) > minWords;
}
