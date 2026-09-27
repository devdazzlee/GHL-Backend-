'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { API_URL } from '@/src/config/config';
import type { GeneratedSite } from '@/src/lib/types';
import { getTextColor, resolveTheme } from '@/src/lib/theme';

type ToastState = {
  type: 'success' | 'error';
  message: string;
} | null;

type ContactFormProps = {
  site: GeneratedSite;
  slug: string;
  heading?: string;
};

type ContactApiResponse = {
  success?: boolean;
  message?: string;
};

export function ContactForm({ site, slug, heading = 'Send us a message' }: ContactFormProps) {
  const theme = resolveTheme(site);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    setSubmitting(true);
    setToast(null);

    const form = new FormData(formEl);
    const payload = {
      name: String(form.get('name') ?? '').trim(),
      email: String(form.get('email') ?? '').trim(),
      phone: String(form.get('phone') ?? '').trim() || undefined,
      message: String(form.get('message') ?? '').trim(),
      // Honeypot: hidden from people, often filled by bots; the backend drops those.
      website: String(form.get('website') ?? ''),
    };

    try {
      const res = await fetch(
        `${API_URL}/phase4/sites/${encodeURIComponent(slug)}/contact`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      const data = (await res.json().catch(() => ({}))) as ContactApiResponse;

      if (!res.ok || data.success === false) {
        throw new Error(data.message || 'Something went wrong. Please try again.');
      }

      formEl.reset();
      setToast({
        type: 'success',
        message: data.message || 'Message sent successfully',
      });
    } catch (err) {
      setToast({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 left-1/2 z-50 flex w-[min(100%-2rem,28rem)] -translate-x-1/2 items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${
            toast.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              toast.type === 'success' ? 'bg-emerald-100' : 'bg-red-100'
            }`}
          >
            {toast.type === 'success' ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <X className="h-4 w-4 text-red-600" />
            )}
          </span>
          <p className="flex-1 pt-1 text-sm font-medium leading-snug">{toast.message}</p>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="shrink-0 rounded-md p-1 opacity-60 transition hover:opacity-100"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">{heading}</h2>
        {[
          { name: 'name', label: 'Name', type: 'text' },
          { name: 'email', label: 'Email', type: 'email' },
          { name: 'phone', label: 'Phone', type: 'tel' },
        ].map((field) => (
          <div key={field.name} className="relative">
            <input
              id={field.name}
              name={field.name}
              type={field.type}
              required={field.name !== 'phone'}
              placeholder=" "
              disabled={submitting}
              className="peer w-full rounded-xl border border-gray-200 bg-white px-4 pb-2 pt-6 text-gray-900 outline-none transition focus:border-transparent focus:ring-2 disabled:opacity-60"
              style={{ ['--tw-ring-color' as string]: theme.accentColor }}
            />
            <label
              htmlFor={field.name}
              className="pointer-events-none absolute left-4 top-4 text-sm text-gray-500 transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-focus:top-2 peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-xs"
            >
              {field.label}
            </label>
          </div>
        ))}
        <div className="relative">
          <textarea
            id="message"
            name="message"
            required
            rows={5}
            placeholder=" "
            disabled={submitting}
            className="peer w-full rounded-xl border border-gray-200 bg-white px-4 pb-2 pt-6 text-gray-900 outline-none transition focus:ring-2 disabled:opacity-60"
          />
          <label
            htmlFor="message"
            className="pointer-events-none absolute left-4 top-4 text-sm text-gray-500 transition-all peer-placeholder-shown:top-4 peer-focus:top-2 peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-xs"
          >
            Message
          </label>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition hover:opacity-90 disabled:opacity-60 sm:w-auto"
          style={{
            backgroundColor: theme.accentColor,
            color: getTextColor(theme.accentColor),
          }}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Send Message
        </button>
      </form>
    </>
  );
}
