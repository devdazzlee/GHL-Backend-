/**
 * Alt text for stock photos. Pexels describes each photo ("Technician checking an air
 * conditioner"); that description is used as it is. Without one, the fallback says the
 * photo is a stock photo of the topic. Neither ever claims the photo shows the
 * business's own team, premises or work. A photo uploaded in the dashboard may well be
 * the business's own, so it is described by its topic alone.
 */

/** Pexels' description per photo number, as the backend sends it. */
export type PhotoDescriptions = Record<string, { alt?: string | null }>;

const PEXELS_ID_RX = /^https:\/\/images\.pexels\.com\/photos\/(\d+)\//i;

export function pexelsPhotoId(url: string | null | undefined): string | null {
  const match = PEXELS_ID_RX.exec(String(url ?? '').trim());
  return match ? match[1] : null;
}

/** "Stock photo: Dog Boarding" when the topic is known, else "Stock photo". */
export function illustrativeAlt(topic?: string | null): string {
  const clean = String(topic ?? '').replace(/\s+/g, ' ').trim();
  return clean ? `Stock photo: ${clean}` : 'Stock photo';
}

export function photoAlt(url: string | null | undefined, photos: PhotoDescriptions | undefined, topic?: string | null): string {
  const id = pexelsPhotoId(url);
  if (!id) return String(topic ?? '').replace(/\s+/g, ' ').trim();
  return String(photos?.[id]?.alt ?? '').trim() || illustrativeAlt(topic);
}
