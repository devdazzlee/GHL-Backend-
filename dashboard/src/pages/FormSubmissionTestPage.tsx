import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { createPhase4SiteAsAdmin, type Phase4SitePayload } from '../api/endpoints';
import { ErrorBanner, PageHeader, SuccessBanner } from '../components/ui';
import { Button } from '../components/ui/button';

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/40';

const labelClass = 'mb-1.5 block text-sm font-medium text-slate-300';

export function FormSubmissionTestPage() {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const form = new FormData(formEl);
    const payload: Phase4SitePayload = {
      businessName: String(form.get('businessName') ?? '').trim(),
      industry: String(form.get('industry') ?? '').trim(),
      city: String(form.get('city') ?? '').trim(),
      state: String(form.get('state') ?? '').trim() || undefined,
      phone: String(form.get('phone') ?? '').trim() || null,
      email: String(form.get('email') ?? '').trim() || null,
      description: String(form.get('description') ?? '').trim() || null,
    };

    if (!payload.businessName || !payload.industry || !payload.city) {
      setError('Business name, industry, and city are required.');
      setSubmitting(false);
      return;
    }

    try {
      const site = await createPhase4SiteAsAdmin(payload);
      formEl.reset();
      setSuccess(`Site generated successfully — slug: ${site.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit form');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Form Submission (Test)"
        description="Admin only. Generates a real site on production and spends AI credits. Requires the admin key."
        descriptionClassName="text-slate-400"
      />

      {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}
      {success ? <SuccessBanner message={success} /> : null}

      <section className="mx-auto max-w-xl rounded-xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6">
        <h2 className="mb-5 text-base font-semibold text-white">Intake form</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="businessName" className={labelClass}>
              Business name
            </label>
            <input
              id="businessName"
              name="businessName"
              type="text"
              required
              disabled={submitting}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="industry" className={labelClass}>
              Industry
            </label>
            <input
              id="industry"
              name="industry"
              type="text"
              required
              disabled={submitting}
              className={inputClass}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="city" className={labelClass}>
                City
              </label>
              <input
                id="city"
                name="city"
                type="text"
                required
                disabled={submitting}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="state" className={labelClass}>
                State
              </label>
              <input
                id="state"
                name="state"
                type="text"
                disabled={submitting}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="phone" className={labelClass}>
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              disabled={submitting}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              disabled={submitting}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="description" className={labelClass}>
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              disabled={submitting}
              className={inputClass}
            />
          </div>

          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {submitting ? 'Generating site…' : 'Submit to webhook'}
          </Button>

          {submitting ? (
            <p className="text-xs text-slate-500">
              Site generation can take 1–3 minutes. Please wait…
            </p>
          ) : null}
        </form>
      </section>
    </div>
  );
}
