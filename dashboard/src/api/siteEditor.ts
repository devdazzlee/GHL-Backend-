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

/** A Pexels clip as stored for the site (and as search results). */
export interface StockVideoClip {
  pexelsId: string;
  url: string;
  poster: string;
  width: number;
  height: number;
  duration: number;
  label: string | null;
  credit: { videographer: string | null; videographerUrl: string | null; pageUrl: string | null };
}

export type SiteVideoState =
  | ({ status: 'SHOWN'; source: 'AUTO' | 'PICKED' } & StockVideoClip)
  | { status: 'REMOVED' }
  | { status: 'NOT_PICKED_YET' };

export interface SiteVideoSlot {
  video: SiteVideoState;
  suggestedQuery: string;
}

export async function getSiteVideo(siteId: string): Promise<SiteVideoSlot> {
  const { data } = await api.get<Envelope<SiteVideoSlot>>(`/phase4/sites/${siteId}/video`);
  return data.data;
}

/** Show this Pexels clip ({ pexelsId }) or no video at all ({ remove: true }). */
export async function setSiteVideo(siteId: string, choice: { pexelsId: string } | { remove: true }): Promise<SiteVideoSlot> {
  const { data } = await api.put<Envelope<SiteVideoSlot>>(`/phase4/sites/${siteId}/video`, choice);
  return data.data;
}

export async function searchStockVideos(siteId: string, query: string): Promise<StockVideoClip[]> {
  const { data } = await api.get<Envelope<{ videos: StockVideoClip[] }>>(`/phase4/sites/${siteId}/stock-videos`, {
    params: { q: query },
  });
  return data.data.videos;
}
