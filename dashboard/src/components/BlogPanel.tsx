import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  createBlogPost,
  deleteBlogPost,
  getBlog,
  importBlogPosts,
  saveBlogSettings,
  updateBlogPost,
  uploadSiteImage,
  type BlogPost,
  type BlogPostInput,
  type BlogSettings,
} from '../api/blog';
import { Button } from './ui/button';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
];
const POLL_MS = 15000;

interface Props {
  siteId: string;
  siteSlug: string;
  siteBaseUrl: string;
}

type Draft = BlogPostInput & { id?: string };

function hourLabel(hour: number) {
  const suffix = hour < 12 ? 'am' : 'pm';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:00 ${suffix}`;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white';
const labelClass = 'mb-1 block text-xs font-medium text-slate-500';

/** Blog for one site: on/off, automatic schedule, and post editing. */
export function BlogPanel({ siteId, siteSlug, siteBaseUrl }: Props) {
  const [settings, setSettings] = useState<BlogSettings | null>(null);
  const [form, setForm] = useState<BlogSettings | null>(null);
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (reloadKey === 0) await importBlogPosts(siteId);
        const blog = await getBlog(siteId);
        if (cancelled) return;
        setSettings(blog.settings);
        setForm((current) => current ?? blog.settings);
        setPosts(blog.posts);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the blog');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId, reloadKey]);

  // While an automatic post is being written, refresh until it is done.
  const writing = posts?.some((p) => p.status === 'GENERATING') ?? false;
  useEffect(() => {
    if (!writing) return;
    const timer = setInterval(() => setReloadKey((k) => k + 1), POLL_MS);
    return () => clearInterval(timer);
  }, [writing]);

  async function run<T>(action: () => Promise<T>, done?: string): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      if (done) setNotice(done);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
      return undefined;
    } finally {
      setBusy(false);
      setReloadKey((k) => k + 1);
    }
  }

  async function saveSchedule() {
    if (!form) return;
    const saved = await run(
      () =>
        saveBlogSettings(siteId, {
          autoEnabled: form.autoEnabled,
          days: form.days,
          hour: form.hour,
          timezone: form.timezone,
        }),
      'Schedule saved.',
    );
    if (saved) setForm(saved);
  }

  async function toggleBlog(enabled: boolean) {
    if (
      !enabled &&
      !window.confirm(
        'Turn the blog off for this site? The blog pages, its menu and footer links and its sitemap entries disappear, and automatic posts stop. Posts are kept and come back when you turn it on again.',
      )
    ) {
      return;
    }
    const saved = await run(() => saveBlogSettings(siteId, { blogEnabled: enabled }), enabled ? 'Blog turned on.' : 'Blog turned off.');
    if (saved) setForm((f) => (f ? { ...f, blogEnabled: saved.blogEnabled } : saved));
  }

  async function savePost() {
    if (!editing) return;
    const { id, ...input } = editing;
    const saved = await run(
      () => (id ? updateBlogPost(siteId, id, input) : createBlogPost(siteId, input)),
      id ? 'Post saved.' : 'Post created.',
    );
    if (saved) setEditing(null);
  }

  async function onUpload(file: File | undefined) {
    if (!file || !editing) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadSiteImage(siteId, file, 'blog');
      setEditing((d) => (d ? { ...d, imageUrl: url } : d));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  if (!settings || !form || posts === null) {
    return error ? (
      <p className="text-sm text-red-400">{error}</p>
    ) : (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading blog…
      </div>
    );
  }

  const daysValid = form.days.length >= 2 && form.days.length <= 3;
  const scheduleChanged =
    form.autoEnabled !== settings.autoEnabled ||
    form.hour !== settings.hour ||
    form.timezone !== settings.timezone ||
    form.days.join(',') !== settings.days.join(',');

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-white">Blog on this site</p>
            <p className="text-xs text-slate-500">
              {settings.blogEnabled
                ? 'Shown: blog pages, menu link and sitemap entries.'
                : 'Hidden: no blog pages, links or sitemap entries; no automatic posts.'}
            </p>
          </div>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void toggleBlog(!settings.blogEnabled)}>
            {settings.blogEnabled ? 'Turn blog off' : 'Turn blog on'}
          </Button>
        </div>

        <div className={`mt-4 border-t border-slate-800 pt-4 ${settings.blogEnabled ? '' : 'pointer-events-none opacity-50'}`}>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={form.autoEnabled}
              onChange={(e) => setForm({ ...form, autoEnabled: e.target.checked })}
            />
            Write and publish new posts automatically
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <p className={labelClass}>Days (choose 2 or 3)</p>
              <div className="flex flex-wrap gap-2">
                {DAY_NAMES.map((name, day) => {
                  const on = form.days.includes(day);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          days: on ? form.days.filter((d) => d !== day) : [...form.days, day].sort(),
                        })
                      }
                      className={`rounded-md border px-3 py-1 text-xs ${on ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200' : 'border-slate-700 text-slate-400'}`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              {!daysValid ? <p className="mt-1 text-xs text-red-400">Choose 2 or 3 days.</p> : null}
            </div>
            <div>
              <label className={labelClass}>Time</label>
              <select value={form.hour} onChange={(e) => setForm({ ...form, hour: Number(e.target.value) })} className={inputClass}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Time zone</label>
              <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className={inputClass}>
                {[...new Set([form.timezone, ...TIMEZONES])].map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              {settings.nextSlot
                ? `Next automatic post: ${settings.nextSlot.date} at ${hourLabel(settings.nextSlot.hour)} (${settings.nextSlot.timezone})${settings.nextSlot.dueNow ? ', due now: it will be written within 10 minutes' : ''}.`
                : 'Automatic posts are off.'}{' '}
              Each post is 1,000+ words with FAQs and links, on a topic this blog has not covered.
            </p>
            <Button type="button" disabled={busy || !daysValid || !scheduleChanged} onClick={() => void saveSchedule()}>
              Save schedule
            </Button>
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-400">{notice}</p> : null}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{posts.length} post(s)</p>
        <Button type="button" onClick={() => setEditing({ title: '', excerpt: '', body: '', imageUrl: null, status: 'DRAFT' })}>
          New post
        </Button>
      </div>

      <div className="space-y-2">
        {posts.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 p-3">
            <div className="min-w-0">
              <p className="font-medium text-white">{p.title}</p>
              <p className="font-mono text-xs text-slate-500">
                /{siteSlug}/blog/{p.slug} · {p.status === 'GENERATING' ? 'writing…' : p.status} · {p.source.toLowerCase()} ·{' '}
                {p.wordCount} words · published {formatDate(p.publishedAt)}
                {p.editedAt ? ` · edited ${formatDate(p.editedAt)}` : ''}
              </p>
            </div>
            {p.status === 'GENERATING' ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setEditing({
                      id: p.id,
                      title: p.title,
                      excerpt: p.excerpt ?? '',
                      body: p.body,
                      imageUrl: p.imageUrl,
                      status: p.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
                    })
                  }
                >
                  Edit
                </Button>
                {p.status === 'PUBLISHED' && settings.blogEnabled ? (
                  <a
                    href={`${siteBaseUrl}/${siteSlug}/blog/${p.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="self-center text-xs text-emerald-400 underline"
                  >
                    Live
                  </a>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  className="border-red-500/30 text-red-400"
                  onClick={() => {
                    if (window.confirm(`Delete "${p.title}"? It disappears from the site. Its topic will not be written again.`)) {
                      void run(() => deleteBlogPost(siteId, p.id), 'Post deleted.');
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setEditing(null)}>
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-semibold text-white">{editing.id ? 'Edit post' : 'New post'}</h3>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Title</label>
                <input value={editing.title ?? ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className={inputClass} />
                {editing.id ? <p className="mt-1 text-xs text-slate-500">Changing the title keeps the same web address.</p> : null}
              </div>
              <div>
                <label className={labelClass}>Summary (shown on the blog page)</label>
                <textarea rows={2} value={editing.excerpt ?? ''} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Image</label>
                <div className="flex flex-wrap items-start gap-3">
                  {editing.imageUrl ? (
                    <img src={editing.imageUrl} alt="" className="h-20 w-32 rounded object-cover" />
                  ) : (
                    <div className="flex h-20 w-32 items-center justify-center rounded bg-slate-800 text-xs text-slate-500">No image</div>
                  )}
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      value={editing.imageUrl ?? ''}
                      placeholder="https://…"
                      onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value || null })}
                      className={inputClass}
                    />
                    <div className="flex gap-2">
                      <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => void onUpload(e.target.files?.[0])} />
                      <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()}>
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Upload image
                      </Button>
                      {editing.imageUrl ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditing({ ...editing, imageUrl: null })}>
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <label className={labelClass}>Article</label>
                <textarea
                  rows={18}
                  value={editing.body ?? ''}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                  className={`${inputClass} font-mono text-xs leading-relaxed`}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Blank line between paragraphs · <code>## Heading</code> · <code>### Subheading</code> · <code>- list item</code> ·{' '}
                  <code>[link text](services)</code> · <code>![description](https://image-url)</code>
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={editing.status === 'PUBLISHED'}
                  onChange={(e) => setEditing({ ...editing, status: e.target.checked ? 'PUBLISHED' : 'DRAFT' })}
                />
                Published (visible on the site)
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="button" disabled={busy || uploading || !editing.title?.trim()} onClick={() => void savePost()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
