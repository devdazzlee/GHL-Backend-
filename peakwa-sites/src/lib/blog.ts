import { getPublishedBlog } from '@/src/lib/api';
import { parseJson, type BlogContent } from '@/src/lib/content';
import type { GeneratedSite } from '@/src/lib/types';

/** One post as the blog index, sitemap and related-post links need it. */
export type BlogListItem = {
  /** Path segment after /{site}/blog/ */
  key: string;
  title: string;
  excerpt: string | null;
  category: string | null;
  readTime: string | null;
  imageUrl: string | null;
  updatedAt: string | null;
};

export type BlogListing = {
  enabled: boolean;
  managed: boolean;
  posts: BlogListItem[];
};

export function isBlogEnabled(site: GeneratedSite): boolean {
  return site.blogEnabled !== false;
}

/**
 * Posts managed in the dashboard (BlogPost table) when the site has any;
 * otherwise the posts generated with the site, at their original /blog/{n} URLs.
 * `fallbackImages` fills in legacy posts that never had a stored cover.
 */
export async function getBlogListing(site: GeneratedSite, fallbackImages: Array<string | null> = []): Promise<BlogListing> {
  if (!isBlogEnabled(site)) return { enabled: false, managed: false, posts: [] };
  const blog = await getPublishedBlog(site.slug);
  if (!blog.enabled) return { enabled: false, managed: blog.managed, posts: [] };
  if (blog.managed) {
    return {
      enabled: true,
      managed: true,
      posts: blog.posts.map((p) => ({
        key: p.slug,
        title: p.title,
        excerpt: p.excerpt,
        category: p.category,
        readTime: p.readTime,
        imageUrl: p.imageUrl,
        updatedAt: p.updatedAt,
      })),
    };
  }
  const legacy = parseJson<BlogContent>(site.blogContent, {}).posts ?? [];
  return {
    enabled: true,
    managed: false,
    posts: legacy.map((post, index) => ({
      key: String(index),
      title: post.title ?? '',
      excerpt: post.excerpt ?? null,
      category: post.category ?? null,
      readTime: post.readTime ?? null,
      imageUrl: post.coverImageUrl || fallbackImages[index] || null,
      updatedAt: null,
    })),
  };
}
