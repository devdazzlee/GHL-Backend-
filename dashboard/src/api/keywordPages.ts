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

export interface KeywordJob {
  id: string;
  status: 'running' | 'done' | 'failed';
  total: number;
  done: number;
  result: KeywordGenerationResult | null;
  error: string | null;
}

type Envelope<T> = { data: T };

export async function listKeywordPages(siteId: string): Promise<KeywordPage[]> {
  const { data } = await api.get<Envelope<{ pages: KeywordPage[] }>>(`/phase4/sites/${siteId}/keyword-pages`);
  return data.data.pages;
}

/** Starts a background run; poll getKeywordJob until it is no longer running. */
export async function startKeywordGeneration(
  siteId: string,
  body: { keywords: string; locationPageIds: string[] },
): Promise<KeywordJob> {
  const { data } = await api.post<Envelope<{ job: KeywordJob }>>(`/phase4/sites/${siteId}/keyword-pages`, body);
  return data.data.job;
}

export async function getKeywordJob(siteId: string, jobId: string): Promise<KeywordJob> {
  const { data } = await api.get<Envelope<{ job: KeywordJob }>>(`/phase4/sites/${siteId}/keyword-pages/jobs/${jobId}`);
  return data.data.job;
}

export async function setKeywordPagePublished(siteId: string, id: string, published: boolean): Promise<void> {
  await api.post(`/phase4/sites/${siteId}/keyword-pages/${id}/${published ? 'publish' : 'unpublish'}`);
}

export async function deleteKeywordPage(siteId: string, id: string): Promise<void> {
  await api.delete(`/phase4/sites/${siteId}/keyword-pages/${id}`);
}
