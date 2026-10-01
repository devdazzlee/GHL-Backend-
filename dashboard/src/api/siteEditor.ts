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

/** Who took a stock photo. PENDING while it is still being looked up on Pexels. */
export type PhotoCredit =
  | { status: 'KNOWN'; pexelsId: string; photographer: string | null; photographerUrl: string | null; pageUrl: string | null; alt: string | null }
  | { status: 'PENDING' | 'UNAVAILABLE'; pexelsId: string }
  | { status: 'NOT_STOCK' };

export interface ImageSlot {
  id: string;
  kind: 'hero' | 'about' | 'service' | 'blog';
  label: string;
  title: string | null;
  url: string | null;
  source: 'AUTO' | 'PICKED' | 'UPLOAD' | null;
  credit: PhotoCredit | null;
}

export interface SitePhoto {
  url: string;
  /** Where the photo appears, e.g. "Home page banner", "City page: Aurora". */
  usedIn: string[];
  credit: PhotoCredit;
}

export interface StockPhoto {
  url: string;
  thumb: string;
  alt: string;
  photographer: string;
  photographerUrl: string | null;
  pageUrl: string | null;
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

export async function listPhotoCredits(siteId: string): Promise<{ photos: SitePhoto[]; pending: number }> {
  const { data } = await api.get<Envelope<{ photos: SitePhoto[]; pending: number }>>(`/phase4/sites/${siteId}/photo-credits`, {
    timeout: 120000,
  });
  return data.data;
}

export async function searchStockPhotos(siteId: string, query: string): Promise<StockPhoto[]> {
  const { data } = await api.get<Envelope<{ photos: StockPhoto[] }>>(`/phase4/sites/${siteId}/stock-photos`, {
    params: { q: query },
  });
  return data.data.photos;
}

export type CityPhotoStatus = 'MATCHES_TOWN' | 'GENERIC' | 'MISMATCHED' | 'NO_PHOTO' | 'NOT_STOCK' | 'CHECKING' | 'UNKNOWN';

export interface CityPhotoRow {
  id: string;
  city: string;
  state: string;
  slug: string;
  imageUrl: string | null;
  status: CityPhotoStatus;
  /** Pexels' description of the photo. */
  description?: string | null;
  /** Other places the description names (for MISMATCHED). */
  names?: string[];
}

export interface CityPhotoReport {
  pages: CityPhotoRow[];
  summary: { matchesTown: number; generic: number; mismatched: number; checking: number };
}

export interface CityPhotoRepick {
  changed: Array<{ city: string; from: string | null; to: string | null; description: string | null }>;
  /** Towns whose search failed this time; their photo was left as it was. */
  failed: string[];
  remaining: number;
  stoppedEarly: boolean;
}

export async function getCityPhotoReport(siteId: string): Promise<CityPhotoReport> {
  const { data } = await api.get<Envelope<CityPhotoReport>>(`/phase4/sites/${siteId}/city-photos`);
  return data.data;
}

/** Changes live city pages: re-picks only the photos that show somewhere else. */
export async function repickMismatchedCityPhotos(siteId: string): Promise<CityPhotoRepick> {
  const { data } = await api.post<Envelope<CityPhotoRepick>>(`/phase4/sites/${siteId}/city-photos/repick`, {}, { timeout: 180000 });
  return data.data;
}
