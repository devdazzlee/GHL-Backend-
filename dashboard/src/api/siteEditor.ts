import api from './client';

export interface EditableField {
  path: string;
  value: string;
  readOnly: boolean;
  edited: boolean;
}

export interface PageEditorData {
  page: string;
  available: boolean;
  reason?: 'not_generated' | 'empty';
  fields: EditableField[];
  /** Only for page "services": the services in page order. */
  services?: Array<{ index: number; title: string; slug: string }>;
}

export interface ImageSlot {
  id: string;
  kind: 'hero' | 'about' | 'service' | 'blog';
  label: string;
  title: string | null;
  url: string | null;
  source: 'AUTO' | 'PICKED' | 'UPLOAD' | null;
}

export interface StockPhoto {
  url: string;
  thumb: string;
  alt: string;
  photographer: string;
}

type Envelope<T> = { data: T };

const editorUrl = (siteId: string, page: string) => `/phase4/sites/${siteId}/editor/${encodeURIComponent(page)}`;

export async function getPageEditor(siteId: string, page: string): Promise<PageEditorData> {
  const { data } = await api.get<Envelope<PageEditorData>>(editorUrl(siteId, page));
  return data.data;
}

export async function savePageEdits(
  siteId: string,
  page: string,
  edits: Array<{ path: string; value: string }>,
): Promise<PageEditorData> {
  const { data } = await api.put<Envelope<PageEditorData>>(editorUrl(siteId, page), { edits });
  return data.data;
}

export async function revertPageEdit(siteId: string, page: string, path: string): Promise<PageEditorData> {
  const { data } = await api.post<Envelope<PageEditorData>>(`${editorUrl(siteId, page)}/revert`, { path });
  return data.data;
}

/** Creates a service's detail page now (AI, about a minute) so its text can be edited. */
export async function generateServicePage(siteId: string, serviceSlug: string): Promise<PageEditorData> {
  const { data } = await api.post<Envelope<PageEditorData>>(`${editorUrl(siteId, `service:${serviceSlug}`)}/generate`, {}, {
    timeout: 180000,
  });
  return data.data;
}

export async function listImageSlots(siteId: string): Promise<ImageSlot[]> {
  const { data } = await api.get<Envelope<{ slots: ImageSlot[] }>>(`/phase4/sites/${siteId}/image-slots`, {
    timeout: 120000,
  });
  return data.data.slots;
}

export async function setImageSlot(
  siteId: string,
  slotId: string,
  image: { url: string; source: 'PICKED' | 'UPLOAD' },
): Promise<ImageSlot> {
  const { data } = await api.put<Envelope<{ slot: ImageSlot }>>(
    `/phase4/sites/${siteId}/image-slots/${encodeURIComponent(slotId)}`,
    image,
  );
  return data.data.slot;
}

export async function searchStockPhotos(siteId: string, query: string): Promise<StockPhoto[]> {
  const { data } = await api.get<Envelope<{ photos: StockPhoto[] }>>(`/phase4/sites/${siteId}/stock-photos`, {
    params: { q: query },
  });
  return data.data.photos;
}
