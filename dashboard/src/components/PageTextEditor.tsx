import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  generateServicePage,
  getPageEditor,
  listImageSlots,
  revertPageEdit,
  savePageEdits,
  setImageSlot,
  type EditableField,
  type ImageSlot,
  type PageEditorData,
} from '../api/siteEditor';
import { ImagePicker } from './ImagePicker';
import { PhotoCreditLine } from './PhotoCreditsPanel';
import { Button } from './ui/button';

const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white';

/** "services.2.shortDescription" -> "Services › 3 › Short description" */
function fieldLabel(path: string, skip = 0): string {
  return path
    .split('.')
    .slice(skip)
    .map((part) =>
      /^\d+$/.test(part)
        ? `#${Number(part) + 1}`
        : part.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()).replace(/ ([A-Z])/g, (m) => m.toLowerCase()),
    )
    .join(' › ');
}

interface EditorProps {
  siteId: string;
  /** home | about | services | contact | service:{slug} */
  page: string;
  /** Show only these fields (e.g. one service's texts). */
  filter?: (path: string) => boolean;
  /** Path segments to leave out of labels (e.g. 2 for "services.N."). */
  labelSkip?: number;
  /** Message when the page has no content yet; `action` creates it. */
  emptyAction?: { label: string; run: () => Promise<PageEditorData> };
}

/** Edits the text of one page. Only changed texts are sent; each edit can be undone. */
export function PageTextEditor({ siteId, page, filter, labelSkip = 0, emptyAction }: EditorProps) {
  const [data, setData] = useState<PageEditorData | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPageEditor(siteId, page).then(
      (d) => !cancelled && setData(d),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to load'),
    );
    return () => {
      cancelled = true;
    };
  }, [siteId, page]);

  async function run(action: () => Promise<PageEditorData>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      setData(await action());
      setDrafts({});
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return error ? <p className="text-sm text-red-400">{error}</p> : <Loader2 className="h-4 w-4 animate-spin text-slate-500" />;
  }
  if (!data.available) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
        {data.reason === 'not_generated' ? 'This page has not been created yet (it is written the first time someone opens it).' : 'No text on this page yet.'}
        {emptyAction ? (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(emptyAction.run)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {emptyAction.label}
          </Button>
        ) : null}
        {error ? <span className="text-red-400">{error}</span> : null}
      </div>
    );
  }

  const fields = data.fields.filter((f) => (filter ? filter(f.path) : true));
  const changed = Object.entries(drafts).filter(([path, value]) => value.trim() && value !== data.fields.find((f) => f.path === path)?.value);

  const renderField = (field: EditableField) => {
    const value = drafts[field.path] ?? field.value;
    const label = fieldLabel(field.path, labelSkip);
    if (field.readOnly) {
      return (
        <div key={field.path}>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="text-sm text-white">{field.value}</p>
          <p className="text-[11px] text-slate-600">Service names set the page address, so they are not edited here.</p>
        </div>
      );
    }
    const long = field.value.length > 90 || field.value.includes('\n');
    return (
      <div key={field.path}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="text-xs font-medium text-slate-500">
            {label}
            {field.edited ? <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">edited</span> : null}
          </label>
          {field.edited ? (
            <button
              type="button"
              className="text-[11px] text-slate-400 underline"
              disabled={busy}
              onClick={() => void run(() => revertPageEdit(siteId, page, field.path))}
            >
              Undo edit
            </button>
          ) : null}
        </div>
        {long ? (
          <textarea
            rows={Math.min(12, Math.max(3, Math.ceil(value.length / 90)))}
            value={value}
            onChange={(e) => setDrafts((d) => ({ ...d, [field.path]: e.target.value }))}
            className={inputClass}
          />
        ) : (
          <input value={value} onChange={(e) => setDrafts((d) => ({ ...d, [field.path]: e.target.value }))} className={inputClass} />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {fields.map(renderField)}
      <div className="flex items-center justify-end gap-3">
        {error ? <span className="text-sm text-red-400">{error}</span> : null}
        {saved && !error ? <span className="text-sm text-emerald-400">Saved. The live page updates within a minute.</span> : null}
        <Button
          type="button"
          size="sm"
          disabled={busy || changed.length === 0}
          onClick={() => void run(() => savePageEdits(siteId, page, changed.map(([path, value]) => ({ path, value }))))}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save {changed.length > 0 ? `${changed.length} change(s)` : ''}
        </Button>
      </div>
    </div>
  );
}

interface ImagesProps {
  siteId: string;
  /** Which slots to show, e.g. ["hero"]. */
  slotIds?: string[];
  kinds?: ImageSlot['kind'][];
  searchHint?: string;
}

const SOURCE_LABEL: Record<string, string> = { AUTO: 'picked automatically', PICKED: 'chosen', UPLOAD: 'uploaded' };

/** Current images for some slots, each with a "Change image" button. */
export function SiteImageSlots({ siteId, slotIds, kinds, searchHint }: ImagesProps) {
  const [slots, setSlots] = useState<ImageSlot[] | null>(null);
  const [picking, setPicking] = useState<ImageSlot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listImageSlots(siteId).then(
      (s) => !cancelled && setSlots(s),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to load images'),
    );
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  if (!slots) return error ? <p className="text-sm text-red-400">{error}</p> : <Loader2 className="h-4 w-4 animate-spin text-slate-500" />;
  const shown = slots.filter((s) => (slotIds ? slotIds.includes(s.id) : true) && (kinds ? kinds.includes(s.kind) : true));

  return (
    <div className="flex flex-wrap gap-4">
      {shown.map((slot) => (
        <div key={slot.id} className="w-56">
          <p className="mb-1 text-xs font-medium text-slate-500">{slot.label}</p>
          {slot.url ? (
            <img src={slot.url} alt="" className="h-32 w-56 rounded object-cover" />
          ) : (
            <div className="flex h-32 w-56 items-center justify-center rounded bg-slate-800 text-xs text-slate-500">No image</div>
          )}
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">{slot.source ? SOURCE_LABEL[slot.source] : ''}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => setPicking(slot)}>
              Change image
            </Button>
          </div>
          <PhotoCreditLine credit={slot.credit} />
        </div>
      ))}
      {picking ? (
        <ImagePicker
          siteId={siteId}
          title={picking.label}
          currentUrl={picking.url}
          initialQuery={picking.title ?? searchHint ?? ''}
          onClose={() => setPicking(null)}
          onChoose={async (image) => {
            const updated = await setImageSlot(siteId, picking.id, image);
            setSlots((current) => (current ?? []).map((s) => (s.id === updated.id ? updated : s)));
          }}
        />
      ) : null}
    </div>
  );
}

/** Services tab: page texts, then each service with its image, descriptions and detail page. */
export function ServicesEditor({ siteId, industry }: { siteId: string; industry: string }) {
  const [services, setServices] = useState<PageEditorData['services'] | null>(null);
  const [openDetail, setOpenDetail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPageEditor(siteId, 'services').then((d) => !cancelled && setServices(d.services ?? []), () => !cancelled && setServices([]));
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  if (!services) return <Loader2 className="h-4 w-4 animate-spin text-slate-500" />;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-800 p-4">
        <p className="mb-3 font-medium text-white">Services page</p>
        <PageTextEditor siteId={siteId} page="services" filter={(p) => !p.startsWith('services.')} />
      </div>
      {services.map((service) => (
        <div key={`${service.index}-${service.slug}`} className="rounded-lg border border-slate-800 p-4">
          <p className="font-medium text-white">{service.title}</p>
          <p className="mb-3 font-mono text-xs text-slate-500">/services/{service.slug}</p>
          <div className="mb-4">
            <SiteImageSlots siteId={siteId} slotIds={[`service:${service.index}`]} searchHint={`${service.title} ${industry}`} />
          </div>
          <PageTextEditor siteId={siteId} page="services" filter={(p) => p.startsWith(`services.${service.index}.`)} labelSkip={2} />
          <div className="mt-4 border-t border-slate-800 pt-3">
            <button
              type="button"
              className="text-sm text-slate-300 underline"
              onClick={() => setOpenDetail((s) => (s === service.slug ? null : service.slug))}
            >
              {openDetail === service.slug ? 'Hide' : 'Edit'} this service's own page text
            </button>
            {openDetail === service.slug ? (
              <div className="mt-3">
                <PageTextEditor
                  siteId={siteId}
                  page={`service:${service.slug}`}
                  emptyAction={{
                    label: 'Create this page now',
                    run: () => generateServicePage(siteId, service.slug),
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
