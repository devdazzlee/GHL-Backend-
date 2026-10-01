/** The site's short stock clip, as the backend sends it with the images. Pure, for unit tests. */
export type StockVideoData = {
  url: string;
  poster: string;
  /** What the clip shows (from its Pexels page), e.g. "A hand setting a thermostat". */
  label: string | null;
  width: number;
  height: number;
};

function https(value: unknown): string | null {
  return typeof value === 'string' && /^https:\/\/\S+$/i.test(value) ? value : null;
}

export function parseStockVideo(raw: unknown): StockVideoData | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  const url = https(v.url);
  const poster = https(v.poster);
  if (!url || !poster) return null;
  const label = typeof v.label === 'string' && v.label.trim() ? v.label.trim().slice(0, 200) : null;
  const width = Number(v.width) > 0 ? Number(v.width) : 1280;
  const height = Number(v.height) > 0 ? Number(v.height) : 720;
  return { url, poster, label, width, height };
}

/** Screen-reader label: says it is stock footage and what it shows, never that it is the business. */
export function stockVideoLabel(video: Pick<StockVideoData, 'label'>, topic?: string | null): string {
  const what = video.label || String(topic ?? '').replace(/\s+/g, ' ').trim();
  return what ? `Stock video: ${what}` : 'Stock video';
}
