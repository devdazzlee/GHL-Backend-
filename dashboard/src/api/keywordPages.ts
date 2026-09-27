import api from './client';

export interface KeywordPageContent {
  seo?: { title?: string; metaDescription?: string };
  h1?: string;
  intro?: string;
  sections?: Array<{ heading?: string; paragraphs?: string[] }>;
  localNotes?: string[];
  faqs?: Array<{ question?: string; answer?: string }>;
  ctaHeading?: string;
  ctaText?: string;
}

export interface KeywordPage {
  id: string;
  keyword: string;
  slug: string;
  status: 'DRAFT' | 'PUBLISHED';
  content: string;
  maxSimilarity: number | null;
  similarTo: string | null;
  createdAt: string;
  publishedAt: string | null;
  locationPage: { city: string; county: string; state: string; slug: string };
}

export interface KeywordGenerationResult {
  created: KeywordPage[];
  rejected: Array<{ keyword: string; city: string; slug: string; reason: string }>;
  skipped: Array<{ keyword: string; city: string; slug: string; reason: string }>;
}

type Envelope<T> = { data: T };

export async function listKeywordPages(siteId: string): Promise<KeywordPage[]> {
  const { data } = await api.get<Envelope<{ pages: KeywordPage[] }>>(`/phase4/sites/${siteId}/keyword-pages`);
  return data.data.pages;
}

export async function generateKeywordPages(
  siteId: string,
  body: { keywords: string; locationPageIds: string[] },
): Promise<KeywordGenerationResult> {
  const { data } = await api.post<Envelope<KeywordGenerationResult>>(
    `/phase4/sites/${siteId}/keyword-pages`,
    body,
    { timeout: 300000 },
  );
  return data.data;
}

export async function setKeywordPagePublished(siteId: string, id: string, published: boolean): Promise<void> {
  await api.post(`/phase4/sites/${siteId}/keyword-pages/${id}/${published ? 'publish' : 'unpublish'}`);
}

export async function deleteKeywordPage(siteId: string, id: string): Promise<void> {
  await api.delete(`/phase4/sites/${siteId}/keyword-pages/${id}`);
}
