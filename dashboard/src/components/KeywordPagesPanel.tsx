import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import { Button } from './ui/button';
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
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-800 p-4">
        <p className="mb-3 text-sm text-slate-400">
          Generate a separate page for each keyword in each chosen city. Pages start as drafts; nothing is public
          until you publish it. At most {MAX_PER_REQUEST} pages per run. Pages too similar to others on this site
          are refused.
        </p>
        <label className="mb-1 block text-xs font-medium text-slate-500">
          Keywords (one per line, or comma separated)
        </label>
        <textarea
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          placeholder={'dog boarding\ncat boarding'}
        />
        <p className="mb-1 mt-3 text-xs font-medium text-slate-500">Cities (this site&apos;s city pages)</p>
        {cities.length === 0 ? (
          <p className="text-sm text-amber-300">This site has no city pages yet. Add location pages first.</p>
        ) : (
          <div className="grid gap-1 sm:grid-cols-2">
            {cities.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={chosen.includes(c.id)}
                  onChange={(e) =>
                    setChosen((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)))
                  }
                />
                {c.city}, {c.county} County
              </label>
            ))}
          </div>
        )}
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className={`text-xs ${pageCount > MAX_PER_REQUEST ? 'text-red-400' : 'text-slate-500'}`}>
            {pageCount} page(s){pageCount > MAX_PER_REQUEST ? ` (max ${MAX_PER_REQUEST})` : ''}
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
          <p className="mt-3 text-xs text-slate-400">
            Writing page {Math.min(progress.done + 1, progress.total)} of {progress.total}… each page takes about a
            minute. You can leave this tab open; pages appear below as they are saved.
          </p>
        ) : null}
        {lastRun ? (
          <div className="mt-3 text-xs text-slate-400">
            Created {lastRun.created.length} · refused {lastRun.rejected.length} · skipped {lastRun.skipped.length}
            {lastRun.rejected.map((r) => (
              <span key={r.slug} className="block text-amber-300">
                Refused {r.keyword} / {r.city}: {r.reason}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {pages === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : pages.length === 0 ? (
        <p className="text-sm text-slate-500">No keyword pages yet.</p>
      ) : (
        <div className="space-y-2">
          {pages.map((p) => (
            <div key={p.id} className="rounded-lg border border-slate-800 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-white">
                  {p.keyword} · {p.locationPage.city}
                </p>
                <p className="font-mono text-xs text-slate-500">
                  /{siteSlug}/k/{p.slug} · {p.status} · overlap{' '}
                  {p.maxSimilarity != null ? `${Math.round(p.maxSimilarity * 100)}%` : 'n/a'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setPreview(p)}>
                  Preview
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingId((id) => (id === p.id ? null : p.id))}
                >
                  {editingId === p.id ? 'Done' : 'Edit'}
                </Button>
                {p.status === 'PUBLISHED' ? (
                  <>
                    <a
                      href={`${siteBaseUrl}/${siteSlug}/k/${p.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="self-center text-xs text-emerald-400 underline"
                    >
                      Live
                    </a>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
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
                    disabled={busy}
                    onClick={() => void run(() => setKeywordPagePublished(siteId, p.id, true))}
                  >
                    Publish
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  className="border-red-500/30 text-red-400"
                  onClick={() => {
                    if (window.confirm(`Delete the page "${p.keyword}" for ${p.locationPage.city}?`)) {
                      void run(() => deleteKeywordPage(siteId, p.id));
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
            {editingId === p.id ? (
              <div className="mt-3 border-t border-slate-800 pt-3">
                <PageTextEditor siteId={siteId} page={`keyword:${p.id}`} />
              </div>
            ) : null}
            </div>
          ))}
        </div>
      )}

      {preview && previewContent ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4 text-sm text-slate-300">
              <p className="text-xs text-slate-500">SEO title: {previewContent.seo?.title}</p>
              <h2 className="text-xl font-semibold text-white">{previewContent.h1}</h2>
              <p>{previewContent.intro}</p>
              {(previewContent.sections ?? []).map((s, i) => (
                <div key={i}>
                  <h3 className="font-semibold text-white">{s.heading}</h3>
                  {(s.paragraphs ?? []).map((para, j) => (
                    <p key={j} className="mt-2">
                      {para}
                    </p>
                  ))}
                </div>
              ))}
              {(previewContent.faqs ?? []).map((f, i) => (
                <p key={i}>
                  <strong className="text-white">{f.question}</strong> {f.answer}
                </p>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <Button type="button" variant="outline" onClick={() => setPreview(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
