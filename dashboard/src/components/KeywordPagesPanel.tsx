import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, Trash2 } from 'lucide-react';
import {
  deleteKeywordPage,
  getKeywordJob,
  listKeywordPages,
  setKeywordPagePublished,
  startKeywordGeneration,
  type KeywordGenerationResult,
  type KeywordJob,
  type KeywordPage,
  type KeywordPageContent,
} from '../api/keywordPages';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { PageTextEditor } from './PageTextEditor';

const MAX_PER_REQUEST = 10;
const POLL_MS = 4000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Props {
  siteId: string;
  siteSlug: string;
  siteBaseUrl: string;
  cities: Array<{ id: string; city: string; county: string }>;
}

function parseContent(raw: string): KeywordPageContent {
  try {
    return JSON.parse(raw) as KeywordPageContent;
  } catch {
    return {};
  }
}

function countKeywords(text: string): number {
  return new Set(
    text
      .split(/[\n,;]+/)
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean),
  ).size;
}

function StatusBadge({ status }: { status: string }) {
  const published = status === 'PUBLISHED';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide',
        published
          ? 'bg-emerald-500/15 text-emerald-300'
          : 'bg-slate-800 text-slate-400',
      )}
    >
      {published ? 'Published' : 'Draft'}
    </span>
  );
}

/** Keyword + city pages for one site: generate drafts, preview, publish, delete. */
export function KeywordPagesPanel({ siteId, siteSlug, siteBaseUrl, cities }: Props) {
  const [pages, setPages] = useState<KeywordPage[] | null>(null);
  const [keywords, setKeywords] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<KeywordGenerationResult | null>(null);
  const [preview, setPreview] = useState<KeywordPage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [progress, setProgress] = useState<KeywordJob | null>(null);

  useEffect(() => {
    let cancelled = false;
    listKeywordPages(siteId).then(
      (list) => {
        if (!cancelled) setPages(list);
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load keyword pages');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [siteId, reloadKey]);

  const pageCount = countKeywords(keywords) * chosen.length;
  const allCityIds = useMemo(() => cities.map((c) => c.id), [cities]);
  const allCitiesSelected = cities.length > 0 && chosen.length === cities.length;

  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
      return undefined;
    } finally {
      setBusy(false);
      setReloadKey((k) => k + 1);
    }
  }

  const previewContent = preview ? parseContent(preview.content) : null;

  return (
    <div className="space-y-8">
      <section className="space-y-5">
        <div>
          <p className="text-sm font-medium text-white">Generate keyword pages</p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
            One page per keyword × city. Drafts stay private until you publish. Max {MAX_PER_REQUEST}{' '}
            pages per run; pages too similar to existing ones are refused.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-500">
            Keywords <span className="font-normal text-slate-600">(one per line, or comma separated)</span>
          </label>
          <textarea
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
            placeholder={'dog boarding\ncat boarding'}
          />
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-500">Cities</p>
            {cities.length > 0 ? (
              <button
                type="button"
                className="text-xs text-emerald-400/90 hover:text-emerald-300"
                onClick={() => setChosen(allCitiesSelected ? [] : allCityIds)}
              >
                {allCitiesSelected ? 'Clear all' : 'Select all'}
              </button>
            ) : null}
          </div>
          {cities.length === 0 ? (
            <p className="text-sm text-amber-300/90">
              This site has no city pages yet. Add location pages first.
            </p>
          ) : (
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {cities.map((c) => {
                const checked = chosen.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors',
                      checked ? 'text-slate-100' : 'text-slate-400 hover:text-slate-200',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500/40"
                      checked={checked}
                      onChange={(e) =>
                        setChosen((prev) =>
                          e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                        )
                      }
                    />
                    <span>
                      {c.city}
                      <span className="text-slate-600"> · {c.county}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-800/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <span
            className={cn(
              'text-xs',
              pageCount > MAX_PER_REQUEST ? 'text-red-400' : 'text-slate-500',
            )}
          >
            {pageCount} page{pageCount === 1 ? '' : 's'}
            {pageCount > MAX_PER_REQUEST ? ` · max ${MAX_PER_REQUEST}` : ''}
          </span>
          <Button
            type="button"
            disabled={busy || pageCount === 0 || pageCount > MAX_PER_REQUEST}
            onClick={async () => {
              const result = await run(async () => {
                let job = await startKeywordGeneration(siteId, { keywords, locationPageIds: chosen });
                setProgress(job);
                while (job.status === 'running') {
                  await sleep(POLL_MS);
                  job = await getKeywordJob(siteId, job.id);
                  setProgress(job);
                  setReloadKey((k) => k + 1);
                }
                setProgress(null);
                if (job.status === 'failed' || !job.result) throw new Error(job.error ?? 'Generation failed');
                return job.result;
              });
              setProgress(null);
              if (result) setLastRun(result);
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Generate drafts
          </Button>
        </div>

        {progress ? (
          <p className="text-xs text-slate-400">
            Writing page {Math.min(progress.done + 1, progress.total)} of {progress.total}… each page
            takes about a minute. Leave this tab open; pages appear below as they save.
          </p>
        ) : null}

        {lastRun ? (
          <div className="space-y-1 text-xs text-slate-500">
            <p>
              Created {lastRun.created.length} · refused {lastRun.rejected.length} · skipped{' '}
              {lastRun.skipped.length}
            </p>
            {lastRun.rejected.map((r) => (
              <p key={r.slug} className="text-amber-300/90">
                Refused {r.keyword} / {r.city}: {r.reason}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div>
            <p className="text-sm font-medium text-white">
              {pages === null ? '…' : pages.length} keyword page
              {pages !== null && pages.length === 1 ? '' : 's'}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">Preview, edit, publish, or remove drafts.</p>
          </div>
        </div>

        {pages === null ? (
          <div className="flex min-h-[180px] items-center justify-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
            Loading keyword pages…
          </div>
        ) : pages.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">No keyword pages yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800/80">
            {pages.map((p) => {
              const editing = editingId === p.id;
              const liveUrl = `${siteBaseUrl}/${siteSlug}/k/${p.slug}`;
              const published = p.status === 'PUBLISHED';
              return (
                <li key={p.id} className="py-4 first:pt-0">
                  <div className="min-w-0 space-y-3">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-white">
                          {p.keyword}
                          <span className="font-normal text-slate-500"> · {p.locationPage.city}</span>
                        </p>
                        <StatusBadge status={p.status} />
                      </div>
                      <p className="truncate font-mono text-xs text-slate-600">
                        /{siteSlug}/k/{p.slug}
                        {p.maxSimilarity != null
                          ? ` · overlap ${Math.round(p.maxSimilarity * 100)}%`
                          : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 px-2.5"
                          onClick={() => setPreview(p)}
                        >
                          Preview
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 px-2.5"
                          onClick={() => setEditingId((id) => (id === p.id ? null : p.id))}
                        >
                          {editing ? 'Done' : 'Edit'}
                        </Button>
                        {published ? (
                          <>
                            <a
                              href={liveUrl}
                              target="_blank"
                              rel="noreferrer"
                              title="Open live page"
                              aria-label="Open live page"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-emerald-400 transition-colors hover:bg-slate-800 hover:text-emerald-300"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5"
                              disabled={busy}
                              onClick={() => void run(() => setKeywordPagePublished(siteId, p.id, false))}
                            >
                              Unpublish
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 px-2.5"
                            disabled={busy}
                            onClick={() => void run(() => setKeywordPagePublished(siteId, p.id, true))}
                          >
                            Publish
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          disabled={busy}
                          title="Delete page"
                          aria-label={`Delete ${p.keyword} for ${p.locationPage.city}`}
                          className="h-8 w-8 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete the page "${p.keyword}" for ${p.locationPage.city}?`,
                              )
                            ) {
                              void run(() => deleteKeywordPage(siteId, p.id));
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {editing ? (
                    <div className="mt-4 border-t border-slate-800/80 pt-4">
                      <PageTextEditor siteId={siteId} page={`keyword:${p.id}`} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-2xl gap-0 p-0 sm:p-0">
          <DialogHeader className="border-b border-slate-800/80 px-5 py-4 sm:px-6">
            <DialogTitle className="pr-2 text-base">
              {preview?.keyword}
              {preview ? (
                <span className="font-normal text-slate-500"> · {preview.locationPage.city}</span>
              ) : null}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {preview ? `/${siteSlug}/k/${preview.slug}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(70vh,640px)] space-y-5 overflow-y-auto px-5 py-5 text-sm text-slate-300 sm:px-6">
            {previewContent ? (
              <>
                {previewContent.seo?.title ? (
                  <p className="text-xs text-slate-500">SEO title: {previewContent.seo.title}</p>
                ) : null}
                {previewContent.h1 ? (
                  <h2 className="text-xl font-semibold text-white">{previewContent.h1}</h2>
                ) : null}
                {previewContent.intro ? (
                  <p className="leading-relaxed">{previewContent.intro}</p>
                ) : null}
                {(previewContent.sections ?? []).map((s, i) => (
                  <div key={i} className="space-y-2">
                    <h3 className="font-medium text-white">{s.heading}</h3>
                    {(s.paragraphs ?? []).map((para, j) => (
                      <p key={j} className="leading-relaxed">
                        {para}
                      </p>
                    ))}
                  </div>
                ))}
                {(previewContent.faqs ?? []).length > 0 ? (
                  <div className="space-y-4 border-t border-slate-800/80 pt-5">
                    <p className="text-sm font-medium text-white">FAQs</p>
                    {(previewContent.faqs ?? []).map((f, i) => (
                      <div key={i} className="space-y-1.5">
                        <p className="font-medium text-white">{f.question}</p>
                        <p className="leading-relaxed text-slate-300">{f.answer}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-slate-500">No preview content.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
