import { useCallback, useEffect, useState } from 'react';
import { Loader2, Mail, Search, Trash2 } from 'lucide-react';
import {
  deleteContactSubmission,
  fetchContactsPaginated,
  sendContactToGhl,
  type ContactSubmission,
} from '../api/endpoints';

const GHL_STATUS_LABEL: Record<string, string> = {
  SENT: 'Sent to GHL',
  HELD_NO_LOCATION: 'Held: no GHL location mapped to this site',
  HELD_NO_KEY: 'Held: mapped GHL location has no API key',
  FAILED: 'Failed to send to GHL',
  SKIPPED_MOCK: 'Not sent (mock mode)',
};

function isFlagged(contact: ContactSubmission): boolean {
  return ['HELD_NO_LOCATION', 'HELD_NO_KEY', 'FAILED'].includes(contact.ghlStatus ?? '');
}
import {
  ErrorBanner,
  PageHeader,
  PaginatedPageLayout,
  Pagination,
  PaginationFooter,
  SuccessBanner,
} from '../components/ui';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { CardListSkeleton } from '../components/ui/skeleton';
import { cn } from '../lib/utils';
import { formatDate } from '../utils/format';

function messagePreview(message: string, max = 80) {
  const trimmed = message.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/40';

function ContactCard({
  contact,
  onSelect,
  onDelete,
}: {
  contact: ContactSubmission;
  onSelect: (contact: ContactSubmission) => void;
  onDelete: (contact: ContactSubmission) => void;
}) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
      <button type="button" onClick={() => onSelect(contact)} className="flex-1 text-left">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-white">{contact.name}</p>
            <p className="mt-0.5 truncate text-sm text-slate-400">{contact.email}</p>
            {isFlagged(contact) ? (
              <p className="mt-1 text-xs font-medium text-amber-300">Not in GHL</p>
            ) : null}
          </div>
          <span className="shrink-0 text-xs text-slate-500">{formatDate(contact.createdAt)}</span>
        </div>

        <dl className="mb-4 space-y-2.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-slate-500">Phone</dt>
            <dd className="text-right text-slate-300">{contact.phone ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-slate-500">Site</dt>
            <dd className="truncate text-right text-emerald-400/90">
              {contact.site?.businessName ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-slate-500">Message</dt>
            <dd className="line-clamp-3 text-slate-400">{messagePreview(contact.message, 120)}</dd>
          </div>
        </dl>
      </button>

      <div className="flex justify-end border-t border-slate-800 pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
          onClick={() => onDelete(contact)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      </div>
    </div>
  );
}

export function ContactSubmissionsPage() {
  const [contacts, setContacts] = useState<ContactSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [totalItems, setTotalItems] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selected, setSelected] = useState<ContactSubmission | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContactSubmission | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadContacts = useCallback(
    async (pageOverride?: number) => {
      const targetPage = pageOverride ?? page;
      setLoading(true);
      setError(null);
      try {
        const { contacts: data, pagination } = await fetchContactsPaginated({
          page: targetPage,
          limit: pageSize,
          search: debouncedSearch || undefined,
        });
        setContacts(data);
        setTotalItems(pagination.total);
        if (targetPage > pagination.totalPages && pagination.totalPages > 0) {
          setPage(pagination.totalPages);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load contact submissions');
      } finally {
        setLoading(false);
        setInitialLoad(false);
      }
    },
    [page, pageSize, debouncedSearch],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, pageSize]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  async function handleDelete() {
    if (!deleteTarget || deleting) return;

    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      await deleteContactSubmission(deleteTarget.id);
      if (selected?.id === deleteTarget.id) {
        setSelected(null);
      }
      setSuccess(`Submission from ${deleteTarget.name} deleted.`);
      setDeleteTarget(null);
      const nextPage = contacts.length === 1 && page > 1 ? page - 1 : page;
      if (nextPage !== page) {
        setPage(nextPage);
      } else {
        await loadContacts(nextPage);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete submission');
    } finally {
      setDeleting(false);
    }
  }

  const hasActiveFilters = debouncedSearch.length > 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);

  return (
    <PaginatedPageLayout
      footer={
        !initialLoad && totalItems > 0 ? (
          <PaginationFooter className={cn(loading && 'pointer-events-none opacity-60')}>
            <Pagination
              page={safePage}
              pageSize={pageSize}
              totalItems={totalItems}
              itemLabel="submissions"
              pageSizeOptions={[6, 12, 24, 48]}
              onPageChange={(nextPage) => setPage(nextPage)}
              onPageSizeChange={(size) => setPageSize(size)}
            />
          </PaginationFooter>
        ) : null
      }
    >
      <PageHeader
        title="Contact Submissions"
        description="View contact form submissions from all generated sites."
      />

      {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}
      {success ? <SuccessBanner message={success} /> : null}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, email, phone, site, message…"
            disabled={loading && initialLoad}
            className={inputClass}
          />
        </div>
        <p className="text-sm text-slate-400">
          {loading ? 'Loading…' : `${totalItems} submission${totalItems === 1 ? '' : 's'}`}
        </p>
      </div>

      <div className="flex-1">
        {loading && contacts.length === 0 ? (
          <CardListSkeleton count={6} />
        ) : (
          <div className="relative min-h-[12rem]">
            {loading ? (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-slate-950/70 backdrop-blur-[1px]"
                aria-live="polite"
                aria-busy="true"
              >
                <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-300">
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
                  Loading submissions…
                </div>
              </div>
            ) : null}

            {contacts.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-16 text-center">
                <Mail className="mx-auto mb-3 h-10 w-10 text-slate-600" />
                <p className="text-sm text-slate-500">
                  {hasActiveFilters
                    ? 'No submissions match your search.'
                    : 'No contact submissions yet.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {contacts.map((contact) => (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                    onSelect={setSelected}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.name ?? 'Contact submission'}</DialogTitle>
            <DialogDescription>
              {selected?.site?.businessName ?? 'Generated site'} ·{' '}
              {selected ? formatDate(selected.createdAt) : ''}
            </DialogDescription>
          </DialogHeader>

          {selected ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-slate-500">Email</p>
                  <p className="text-sm text-slate-200">{selected.email}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Phone</p>
                  <p className="text-sm text-slate-200">{selected.phone ?? '—'}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-slate-500">Site</p>
                  <p className="text-sm text-slate-200">
                    {selected.site?.businessName ?? '—'}
                    {selected.site?.slug ? (
                      <span className="ml-2 font-mono text-xs text-slate-500">
                        {selected.site.slug}
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500">GHL delivery</p>
                <p className={`text-sm ${isFlagged(selected) ? 'text-amber-300' : 'text-slate-200'}`}>
                  {selected.ghlStatus ? (GHL_STATUS_LABEL[selected.ghlStatus] ?? selected.ghlStatus) : 'Not recorded (older lead)'}
                </p>
                {selected.ghlError ? <p className="mt-1 text-xs text-slate-500">{selected.ghlError}</p> : null}
              </div>
              <div>
                <p className="mb-2 text-xs text-slate-500">Message</p>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4 text-sm whitespace-pre-wrap text-slate-300">
                  {selected.message}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                {selected.ghlStatus !== 'SENT' ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      const target = selected;
                      setSelected(null);
                      try {
                        await sendContactToGhl(target.id);
                      } finally {
                        await loadContacts();
                      }
                    }}
                  >
                    Send to GHL
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  onClick={() => {
                    setDeleteTarget(selected);
                    setSelected(null);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent
          onEscapeKeyDown={(e) => {
            if (deleting) e.preventDefault();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact submission?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the submission from{' '}
              {deleteTarget?.name ?? 'this contact'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              loading={deleting}
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PaginatedPageLayout>
  );
}
