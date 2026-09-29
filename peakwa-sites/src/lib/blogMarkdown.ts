import type { BlogPost } from '@/src/lib/content';

/**
 * Blog bodies edited in the dashboard use a small Markdown subset (same as
 * backend/src/services/blogMarkdown.js):
 *   ## Heading / ### Subheading, blank-line paragraphs, "- " bullets,
 *   [text](url) links, ![alt](url) images on their own line.
 * Anything else is shown as plain text; HTML is never interpreted.
 */

export type InlinePart = { text: string; href?: string };

export type ArticleBlock =
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; parts: InlinePart[]; variant?: 'lead' | 'closing' }
  | { type: 'ul'; items: InlinePart[][] }
  | { type: 'img'; url: string; alt: string };

const IMAGE_LINE = /^!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)$/;
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index) });
    parts.push({ text: match[1], href: match[2] });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts.filter((p) => p.text);
}

/**
 * Link targets: full http(s)/mailto/tel URLs are kept; anything else is a page
 * of this site ("services", "/blog/my-post" -> /{slug}/services, /{slug}/blog/my-post).
 * Returns null for targets that are not safe to link.
 */
/**
 * A link inside a post, as a site path. `base` is the site's link prefix: "/{slug}" on
 * the platform (the default), "" on the site's own domain. Links written with the old
 * /{slug}/ prefix keep working either way.
 */
export function resolveHref(href: string, siteSlug: string, base = `/${siteSlug}`): string | null {
  const value = href.trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  let path = value.replace(/^\/+/, '');
  if (path === siteSlug) path = '';
  else if (path.startsWith(`${siteSlug}/`)) path = path.slice(siteSlug.length + 1);
  return path ? `${base}/${path}` : base || '/';
}

export function parseBlogMarkdown(markdown: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  let paragraph: string[] = [];
  let list: InlinePart[][] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'p', parts: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: 'ul', items: list });
    list = [];
  };

  for (const raw of String(markdown ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const image = IMAGE_LINE.exec(line);
    if (line.startsWith('### ') || line.startsWith('## ') || image) {
      flushParagraph();
      flushList();
      if (image) blocks.push({ type: 'img', alt: image[1], url: image[2] });
      else if (line.startsWith('### ')) blocks.push({ type: 'h3', text: line.slice(4).trim() });
      else blocks.push({ type: 'h2', text: line.slice(3).trim() });
      continue;
    }
    if (line.startsWith('- ')) {
      flushParagraph();
      list.push(parseInline(line.slice(2).trim()));
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

function splitParagraphs(content: string): string[] {
  return content
    .split(/\n\n+|\.\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (/[.!?]$/.test(p) ? p : `${p}.`));
}

/** A post stored with the site (structured JSON, or an older flat string) as article blocks. */
export function legacyPostBlocks(post: BlogPost): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  const text = (t: string, variant?: 'lead' | 'closing'): ArticleBlock => ({ type: 'p', parts: [{ text: t }], variant });
  if (post.introduction) blocks.push(text(post.introduction, 'lead'));

  const inline = new Map<number, { url: string; alt?: string }>();
  for (const image of post.inlineImages ?? []) {
    if (typeof image?.afterSection === 'number' && image.url) inline.set(image.afterSection, { url: image.url, alt: image.alt });
  }

  const sections = (post.sections ?? []).filter((s) => s && (s.heading || s.paragraphs?.some((p) => p?.trim())));
  sections.forEach((section, i) => {
    if (section.heading) blocks.push({ type: 'h2', text: section.heading });
    for (const p of section.paragraphs ?? []) if (p?.trim()) blocks.push(text(p));
    for (const sub of section.subsections ?? []) {
      if (sub.heading) blocks.push({ type: 'h3', text: sub.heading });
      for (const p of sub.paragraphs ?? []) if (p?.trim()) blocks.push(text(p));
    }
    const image = inline.get(i);
    if (image) blocks.push({ type: 'img', url: image.url, alt: image.alt || section.heading || post.title || 'Article image' });
  });

  if (sections.length === 0 && post.content) for (const p of splitParagraphs(post.content)) blocks.push(text(p));
  if (post.conclusion) blocks.push(text(post.conclusion, 'closing'));
  return blocks;
}
