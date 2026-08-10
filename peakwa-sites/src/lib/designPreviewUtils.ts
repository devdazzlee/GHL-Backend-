import { notFound } from 'next/navigation';
import { buildDesignPreviewSite } from '@/src/lib/designPreviewSample';
import { resolveDesignPreset } from '@/src/designs/presets';
import { resolveTheme } from '@/src/lib/theme';

export function parsePreviewDesignId(id: string): number {
  const designId = Number(id);
  if (!Number.isFinite(designId) || designId < 1 || designId > 50) notFound();
  return designId;
}

export function getPreviewContext(id: string) {
  const designId = parsePreviewDesignId(id);
  const site = buildDesignPreviewSite(designId);
  const theme = resolveTheme(site);
  const design = resolveDesignPreset(designId);
  return { designId, site, theme, design };
}

export function slugifyService(title: string): string {
  return title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}
