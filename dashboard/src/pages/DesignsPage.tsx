import { useMemo, useState } from 'react';
import { ExternalLink, Eye, Palette, Search } from 'lucide-react';
import { PageHeader } from '../components/ui';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { SITE_BASE_URL } from '../config/config';
import {
  DESIGN_CATALOG,
  DESIGN_VARIANT_COUNT,
  designPreviewUrl,
  type DesignCatalogItem,
} from '../data/designCatalog';
import { cn } from '../lib/utils';

const FAMILIES = ['all', 'classic', 'split', 'bold', 'editorial', 'utility'] as const;

const familyMeta: Record<string, { badge: string; label: string; bar: string }> = {
  classic: {
    badge: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
    label: 'Classic',
    bar: 'from-sky-500 to-sky-300',
  },
  split: {
    badge: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
    label: 'Split',
    bar: 'from-violet-500 to-violet-300',
  },
  bold: {
    badge: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
    label: 'Bold',
    bar: 'from-rose-500 to-rose-300',
  },
  editorial: {
    badge: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
    label: 'Editorial',
    bar: 'from-amber-500 to-amber-300',
  },
  utility: {
    badge: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
    label: 'Utility',
    bar: 'from-emerald-500 to-emerald-300',
  },
};

function DesignCard({
  item,
  onPreview,
}: {
  item: DesignCatalogItem;
  onPreview: (item: DesignCatalogItem) => void;
}) {
  const meta = familyMeta[item.family] ?? familyMeta.classic!;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/80 transition duration-300 hover:-translate-y-0.5 hover:border-slate-600 hover:shadow-[0_18px_40px_-24px_rgba(16,185,129,0.35)]">
      <div className={cn('h-1.5 bg-gradient-to-r', meta.bar)} />

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">Design #{item.id}</p>
            <h2 className="mt-1 truncate text-sm font-semibold text-white">{item.name}</h2>
            <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">
              {item.heroMode.replace(/-/g, ' ')} · {item.servicesLayout}
            </p>
          </div>
          <span
            className={cn(
              'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset',
              meta.badge,
            )}
          >
            {meta.label}
          </span>
        </div>

        <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-slate-400">
          {item.description}
        </p>

        <div className="mt-4 flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => onPreview(item)}>
            <Eye className="h-4 w-4" />
            Preview
          </Button>
          <a
            href={designPreviewUrl(SITE_BASE_URL, item.id)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${item.name} in new tab`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900 px-3 text-slate-200 hover:bg-slate-800"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </article>
  );
}

export function DesignsPage() {
  const [family, setFamily] = useState<(typeof FAMILIES)[number]>('all');
  const [search, setSearch] = useState('');
  const [previewItem, setPreviewItem] = useState<DesignCatalogItem | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return DESIGN_CATALOG.filter((item) => {
      if (family !== 'all' && item.family !== family) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        String(item.id).includes(q) ||
        item.family.includes(q) ||
        item.heroMode.includes(q)
      );
    });
  }, [family, search]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: DESIGN_CATALOG.length };
    for (const item of DESIGN_CATALOG) {
      map[item.family] = (map[item.family] ?? 0) + 1;
    }
    return map;
  }, []);

  const previewHref = previewItem
    ? designPreviewUrl(SITE_BASE_URL, previewItem.id)
    : '';

  return (
    <div>
      <PageHeader
        title="Site Designs"
        description={`${DESIGN_VARIANT_COUNT} unique layouts. Click Preview to open the real sample site for that design.`}
      />

      <div className="mb-6 overflow-hidden rounded-2xl border border-slate-800 bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.12),transparent_45%),linear-gradient(180deg,#0b1220,#020617)] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/90">
              Design catalog
            </p>
            <p className="mt-2 max-w-xl text-sm text-slate-300">
              Preview loads one live sample site at a time (Summit Home Services) so it stays fast and reliable.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {FAMILIES.filter((f) => f !== 'all').map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFamily(f)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium capitalize transition',
                  family === f
                    ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                    : 'bg-slate-900/80 text-slate-400 ring-1 ring-slate-700 hover:text-slate-200',
                )}
              >
                {f} · {counts[f] ?? 0}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFamily('all')}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition',
                family === 'all'
                  ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                  : 'bg-slate-900/80 text-slate-400 ring-1 ring-slate-700 hover:text-slate-200',
              )}
            >
              All · {counts.all}
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="relative w-full lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, id, or family..."
            className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
          />
        </div>
        <div className="w-full sm:w-56">
          <label className="mb-1 block text-xs font-medium text-slate-500">Family</label>
          <Select
            value={family}
            onValueChange={(value) => setFamily(value as (typeof FAMILIES)[number])}
          >
            <SelectTrigger>
              <SelectValue placeholder="All families" />
            </SelectTrigger>
            <SelectContent>
              {FAMILIES.map((f) => (
                <SelectItem key={f} value={f}>
                  {f === 'all' ? `All (${counts.all})` : `${f} (${counts[f] ?? 0})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2 text-sm text-slate-400">
        <Palette className="h-4 w-4 text-emerald-400" />
        Showing {filtered.length} of {DESIGN_VARIANT_COUNT} designs
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 px-6 py-16 text-center text-sm text-slate-500">
          No designs match your filters.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <DesignCard key={item.id} item={item} onPreview={setPreviewItem} />
          ))}
        </div>
      )}

      <Dialog open={Boolean(previewItem)} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="flex h-[min(92vh,920px)] w-[calc(100%-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:w-full">
          <DialogHeader className="shrink-0 border-b border-slate-800 px-4 py-3 sm:px-5">
            <div className="flex flex-col gap-3 pr-8 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <DialogTitle className="text-base text-white">
                  {previewItem
                    ? `#${previewItem.id} · ${previewItem.name}`
                    : 'Design preview'}
                </DialogTitle>
                <DialogDescription className="mt-1 text-slate-400">
                  Live sample site (Summit Home Services). Keep peakwa-sites running on {SITE_BASE_URL}.
                </DialogDescription>
              </div>
              {previewItem ? (
                <a
                  href={previewHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm font-medium text-slate-200 hover:bg-slate-800"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open full page
                </a>
              ) : null}
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 bg-slate-950">
            {previewItem ? (
              <iframe
                key={previewItem.id}
                title={`Preview of ${previewItem.name}`}
                src={previewHref}
                className="h-full w-full border-0 bg-white"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
