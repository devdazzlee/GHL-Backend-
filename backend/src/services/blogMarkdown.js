/**
 * Blog post bodies are stored as a small Markdown subset so they can be edited
 * in a plain text box:
 *   ## Heading / ### Subheading
 *   paragraphs separated by a blank line
 *   "- " bullet lines
 *   [text](url) links inside text, ![alt](url) images on their own line
 * The renderer (peakwa-sites/src/lib/blogMarkdown.ts) parses the same subset.
 */

const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

function clean(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function paragraphsOf(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  const text = clean(value);
  return text ? text.split(/\n{2,}/).map(clean).filter(Boolean) : [];
}

function imageLine(alt, url) {
  const safeAlt = clean(alt).replace(/[[\]]/g, '');
  return `![${safeAlt}](${String(url).trim()})`;
}

/**
 * Structured post from the site generator (introduction, sections with
 * subsections, inlineImages after section N, conclusion) or a legacy flat
 * `content` string -> Markdown body.
 */
export function structuredPostToMarkdown(post) {
  const blocks = [];
  blocks.push(...paragraphsOf(post?.introduction));

  const inline = new Map();
  for (const image of Array.isArray(post?.inlineImages) ? post.inlineImages : []) {
    if (Number.isInteger(image?.afterSection) && image?.url) inline.set(image.afterSection, image);
  }

  const sections = Array.isArray(post?.sections) ? post.sections : [];
  sections.forEach((section, index) => {
    if (section?.heading) blocks.push(`## ${clean(section.heading)}`);
    blocks.push(...paragraphsOf(section?.paragraphs));
    for (const sub of Array.isArray(section?.subsections) ? section.subsections : []) {
      if (sub?.heading) blocks.push(`### ${clean(sub.heading)}`);
      blocks.push(...paragraphsOf(sub?.paragraphs));
    }
    const image = inline.get(index);
    if (image) blocks.push(imageLine(image.alt || section?.heading || '', image.url));
  });

  if (sections.length === 0 && post?.content) blocks.push(...paragraphsOf(post.content));
  blocks.push(...paragraphsOf(post?.conclusion));
  return blocks.join('\n\n');
}

/** Visible text only (no Markdown syntax, image lines or URLs). */
export function markdownToPlainText(markdown) {
  return clean(markdown)
    .split('\n')
    .filter((line) => !IMAGE_LINE.test(line.trim()))
    .map((line) =>
      line
        .replace(/^#{2,3}\s+/, '')
        .replace(/^-\s+/, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'),
    )
    .join('\n');
}

export function countMarkdownWords(markdown) {
  return markdownToPlainText(markdown).split(/\s+/).filter(Boolean).length;
}

export function slugifyTitle(title) {
  return (
    String(title ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/g, '') || 'post'
  );
}
