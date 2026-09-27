import api from './client';

export type BlogPostStatus = 'DRAFT' | 'PUBLISHED' | 'GENERATING';

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  imageUrl: string | null;
  category: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  faqs: Array<{ question: string; answer: string }>;
  links: Array<{ label: string; path: string }>;
  status: BlogPostStatus;
  source: 'IMPORTED' | 'MANUAL' | 'AUTO';
  wordCount: number;
  autoSlot: string | null;
  editedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface BlogSettings {
  blogEnabled: boolean;
  autoEnabled: boolean;
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  hour: number;
  timezone: string;
  nextSlot: { date: string; hour: number; timezone: string; dueNow: boolean } | null;
}

export type BlogPostInput = Partial<
  Pick<BlogPost, 'title' | 'excerpt' | 'body' | 'imageUrl' | 'category' | 'seoTitle' | 'seoDescription'>
> & { status?: 'DRAFT' | 'PUBLISHED' };

type Envelope<T> = { data: T };

const base = (siteId: string) => `/phase4/sites/${siteId}/blog`;

/** Copies the posts generated with the site into the editable list (safe to call every time). */
export async function importBlogPosts(siteId: string): Promise<void> {
  await api.post(`${base(siteId)}/import`, {}, { timeout: 120000 });
}

export async function getBlog(siteId: string): Promise<{ settings: BlogSettings; posts: BlogPost[] }> {
  const { data } = await api.get<Envelope<{ settings: BlogSettings; posts: BlogPost[] }>>(base(siteId));
  return data.data;
}

export async function saveBlogSettings(
  siteId: string,
  settings: Partial<Pick<BlogSettings, 'blogEnabled' | 'autoEnabled' | 'days' | 'hour' | 'timezone'>>,
): Promise<BlogSettings> {
  const { data } = await api.put<Envelope<{ settings: BlogSettings }>>(`${base(siteId)}/settings`, settings, {
    timeout: 120000,
  });
  return data.data.settings;
}

export async function createBlogPost(siteId: string, input: BlogPostInput): Promise<BlogPost> {
  const { data } = await api.post<Envelope<{ post: BlogPost }>>(`${base(siteId)}/posts`, input);
  return data.data.post;
}

export async function updateBlogPost(siteId: string, postId: string, input: BlogPostInput): Promise<BlogPost> {
  const { data } = await api.patch<Envelope<{ post: BlogPost }>>(`${base(siteId)}/posts/${postId}`, input);
  return data.data.post;
}

export async function deleteBlogPost(siteId: string, postId: string): Promise<void> {
  await api.delete(`${base(siteId)}/posts/${postId}`);
}

/** Stores an image for this site (Cloudinary) and returns its permanent URL. */
export async function uploadSiteImage(siteId: string, file: File, kind = 'blog'): Promise<string> {
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', file);
  const { data } = await api.post<Envelope<{ url: string }>>(`/phase4/sites/${siteId}/uploads`, form, {
    timeout: 120000,
  });
  return data.data.url;
}
