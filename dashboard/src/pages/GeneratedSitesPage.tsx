import { useCallback, useEffect, useState } from 'react';
import { Loader2, ExternalLink, MapPin, Minus, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import {
  addLocationPages,
  addLocationPagesByRadius,
  addPhase4Service,
  deletePhase4Service,
  deletePhase4Site,
  fetchPhase4Site,
  fetchPhase4SitesPaginated,
  fetchSiteContacts,
  regeneratePhase4Site,
  updatePhase4Site,
  type ContactSubmission,
  type Phase4GeneratedSite,
  type Phase4LocationInput,
  type Phase4LocationPage,
  type Phase4ServicePayload,
  type SiteStatus,
} from '../api/endpoints';
import { ErrorBanner, PageHeader, PaginatedPageLayout, Pagination, PaginationFooter, SuccessBanner } from '../components/ui';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { CardListSkeleton } from '../components/ui/skeleton';
import { SITE_BASE_URL } from '../config/config';
import { cn } from '../lib/utils';
import { formatDate } from '../utils/format';
import { DESIGN_CATALOG, DESIGN_VARIANT_COUNT, getDesignCatalogItem } from '../data/designCatalog';

type SiteTab = 'home' | 'about' | 'services' | 'contact' | 'blog' | 'locations' | 'contacts';
type EditTab = 'business' | 'colors' | 'regenerate' | 'status';

const SITE_URL = SITE_BASE_URL.replace(/\/$/, '');

function openSitePreview(slug: string, status?: SiteStatus) {
  if (status && status !== 'ACTIVE') {
    return;
  }
  window.open(`${SITE_URL}/${slug}`, '_blank', 'noopener,noreferrer');
}

type SiteExtraFields = {
  address?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  websiteUrl?: string | null;
  logoUrl?: string | null;
};

type SiteUpdatePayload = Parameters<typeof updatePhase4Site>[1] &
  SiteExtraFields & {
    industry?: string;
    logoUrl?: string | null;
  };

type SiteThemeFields = {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  heroStyle?: string;
  fontStyle?: string;
  theme?: SiteThemeFields;
};

type SiteWithTheme = Phase4GeneratedSite & SiteThemeFields & SiteExtraFields;

function normalizeColorHex(color: string | undefined | null, fallback: string) {
  const trimmed = String(color ?? '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  return fallback;
}

function getSiteTheme(site: SiteWithTheme) {
  return {
    primaryColor: site.theme?.primaryColor ?? site.primaryColor ?? '#1F2937',
    secondaryColor: site.theme?.secondaryColor ?? site.secondaryColor ?? '#F3F4F6',
    accentColor: site.theme?.accentColor ?? site.accentColor ?? '#6366F1',
    heroStyle: site.theme?.heroStyle ?? site.heroStyle ?? 'dark',
    fontStyle: site.theme?.fontStyle ?? site.fontStyle ?? 'modern',
  };
}

function ThemeColorSwatch({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="h-10 w-10 shrink-0 rounded-full border border-slate-700 shadow-inner"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="font-mono text-sm uppercase text-slate-200">{color}</p>
      </div>
    </div>
  );
}

function SiteThemeSection({ site }: { site: SiteWithTheme }) {
  const theme = getSiteTheme(site);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
      <p className="mb-3 text-sm font-medium text-white">Theme</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <ThemeColorSwatch label="Primary Color" color={theme.primaryColor} />
        <ThemeColorSwatch label="Secondary Color" color={theme.secondaryColor} />
        <ThemeColorSwatch label="Accent Color" color={theme.accentColor} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-full bg-slate-800 px-3 py-1 text-xs font-medium capitalize text-slate-200 ring-1 ring-inset ring-slate-700">
          Hero: {theme.heroStyle}
        </span>
        <span className="inline-flex items-center rounded-full bg-slate-800 px-3 py-1 text-xs font-medium capitalize text-slate-200 ring-1 ring-inset ring-slate-700">
          Font: {theme.fontStyle}
        </span>
        <span className="inline-flex items-center rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200 ring-1 ring-inset ring-slate-700">
          Design {site.designVariant ?? 1}/{DESIGN_VARIANT_COUNT}:{' '}
          {getDesignCatalogItem(site.designVariant).name}
        </span>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/40';

function SiteCard({
  site,
  onDetails,
  onEdit,
  onDelete,
}: {
  site: Phase4GeneratedSite;
  onDetails: (site: Phase4GeneratedSite) => void;
  onEdit: (site: Phase4GeneratedSite) => void;
  onDelete: (site: Phase4GeneratedSite) => void;
}) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-white">{site.businessName}</p>
          <p className="mt-0.5 text-sm capitalize text-slate-400">{site.industry}</p>
        </div>
        <SiteStatusBadge status={site.status} />
      </div>

      <dl className="mb-5 flex-1 space-y-2.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-slate-500">City</dt>
          <dd className="text-right text-slate-300">
            {site.city}, {site.state}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-slate-500">Slug</dt>
          <dd className="truncate font-mono text-xs text-slate-400" title={site.slug}>
            {site.slug}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-slate-500">Template</dt>
          <dd className="text-right text-slate-300">{site.template?.name ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-slate-500">Created</dt>
          <dd className="text-right text-slate-300">{formatDate(site.createdAt)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 min-w-[7.5rem]"
          onClick={() => void onDetails(site)}
        >
          View Details
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 min-w-[7.5rem]"
          disabled={site.status !== 'ACTIVE'}
          onClick={() => openSitePreview(site.slug, site.status)}
          title={
            site.status === 'ACTIVE'
              ? 'Preview site'
              : 'Only ACTIVE sites can be previewed publicly'
          }
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Preview
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 min-w-[7.5rem]"
          onClick={() => void onEdit(site)}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 min-w-[7.5rem] border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
          onClick={() => onDelete(site)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      </div>
    </div>
  );
}

function SiteStatusBadge({ status }: { status: SiteStatus }) {
  const styles: Record<SiteStatus, string> = {
    PENDING: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
    ACTIVE: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
    INACTIVE: 'bg-red-500/15 text-red-400 ring-red-500/30',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        styles[status],
      )}
    >
      {status}
    </span>
  );
}

function parseJsonContent(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

type ManagedService = {
  title: string;
  shortDescription: string;
  fullDescription?: string;
  icon: string;
};

function parseServicesFromContent(servicesContent: string | null | undefined): ManagedService[] {
  const parsed = parseJsonContent(servicesContent);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  const services = (parsed as { services?: unknown }).services;
  if (!Array.isArray(services)) return [];
  return services.map((item) => {
    const service = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    return {
      title: String(service.title ?? ''),
      shortDescription: String(service.shortDescription ?? service.description ?? ''),
      fullDescription: service.fullDescription != null ? String(service.fullDescription) : undefined,
      icon: String(service.icon ?? ''),
    };
  });
}

const emptyServiceForm: Phase4ServicePayload = {
  title: '',
  shortDescription: '',
  fullDescription: '',
  icon: '',
};

function ReadableValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-slate-600">—</span>;
  }

  if (typeof value === 'string') {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{value}</p>;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span className="text-sm text-slate-300">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    return (
      <div className="space-y-3">
        {value.map((item, index) => (
          <div
            key={index}
            className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"
          >
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Item {index + 1}
            </p>
            <ReadableValue value={item} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === 'object') {
    return (
      <dl className="space-y-3">
        {Object.entries(value as Record<string, unknown>).map(([key, val]) => (
          <div key={key}>
            <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              {key.replace(/([A-Z])/g, ' $1').trim()}
            </dt>
            <dd>
              <ReadableValue value={val} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return <span className="text-sm text-slate-300">{String(value)}</span>;
}

function PageContentPanel({
  content,
  className,
}: {
  content: string | null;
  className?: string;
}) {
  const parsed = parseJsonContent(content);

  if (!parsed) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">No content generated for this page.</p>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-slate-800 bg-slate-950/50 p-4',
        className,
      )}
    >
      <ReadableValue value={parsed} />
    </div>
  );
}

function emptyLocationRow(): Phase4LocationInput {
  return { city: '', county: '', state: 'NJ' };
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const normalized = normalizeColorHex(value, '#000000');
  const pickerValue = normalized.startsWith('#') ? normalized : `#${normalized}`;

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      <div className="flex gap-2">
        <input
          type="color"
          value={pickerValue}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-10 w-12 shrink-0 cursor-pointer rounded border border-slate-700 bg-slate-950 p-1"
          aria-label={`${label} picker`}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
          placeholder="#000000"
        />
      </div>
    </div>
  );
}

function ThemePreviewCircles({
  primaryColor,
  secondaryColor,
  accentColor,
}: {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
      <p className="text-xs font-medium text-slate-500">Live preview</p>
      <div className="flex items-center gap-3">
        {[
          { color: primaryColor, label: 'Primary' },
          { color: secondaryColor, label: 'Secondary' },
          { color: accentColor, label: 'Accent' },
        ].map((item) => (
          <div key={item.label} className="flex flex-col items-center gap-1">
            <span
              className="h-10 w-10 rounded-full border border-slate-700 shadow-inner"
              style={{ backgroundColor: item.color }}
              title={item.label}
            />
            <span className="text-[10px] text-slate-500">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GeneratedSitesPage() {
  const [sites, setSites] = useState<Phase4GeneratedSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SiteStatus>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [totalItems, setTotalItems] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedSite, setSelectedSite] = useState<SiteWithTheme | null>(null);
  const [activeTab, setActiveTab] = useState<SiteTab>('home');
  const [siteContacts, setSiteContacts] = useState<ContactSubmission[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [locationMode, setLocationMode] = useState<'manual' | 'radius'>('radius');
  const [locationRows, setLocationRows] = useState<Phase4LocationInput[]>([emptyLocationRow()]);
  const [radiusZip, setRadiusZip] = useState('');
  const [radiusMiles, setRadiusMiles] = useState('15');
  const [addingLocations, setAddingLocations] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Phase4GeneratedSite | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<SiteWithTheme | null>(null);
  const [editTab, setEditTab] = useState<EditTab>('business');
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [serviceForm, setServiceForm] = useState<Phase4ServicePayload>(emptyServiceForm);
  const [savingService, setSavingService] = useState(false);
  const [deleteServiceIndex, setDeleteServiceIndex] = useState<number | null>(null);
  const [deletingService, setDeletingService] = useState(false);

  function populateEditForms(siteData: SiteWithTheme) {
    setEditData({
      businessName: siteData.businessName || '',
      industry: siteData.industry || '',
      phone: siteData.phone || '',
      email: siteData.email || '',
      description: siteData.description || '',
      city: siteData.city || '',
      state: siteData.state || '',
      address: siteData.address || '',
      facebookUrl: siteData.facebookUrl || '',
      instagramUrl: siteData.instagramUrl || '',
      websiteUrl: siteData.websiteUrl || '',
      primaryColor: siteData.primaryColor || siteData.theme?.primaryColor || '#1F2937',
      secondaryColor: siteData.secondaryColor || siteData.theme?.secondaryColor || '#F3F4F6',
      accentColor: siteData.accentColor || siteData.theme?.accentColor || '#6366F1',
      heroStyle: siteData.heroStyle || siteData.theme?.heroStyle || 'dark',
      fontStyle: siteData.fontStyle || siteData.theme?.fontStyle || 'modern',
      designVariant: String(siteData.designVariant ?? 1),
      yearsInBusiness: siteData.yearsInBusiness || '',
      customersServed: siteData.customersServed || '',
      projectsCompleted: siteData.projectsCompleted || '',
      logoUrl: siteData.logoUrl || '',
      status: siteData.status || 'ACTIVE',
    });
  }

  const loadSites = useCallback(
    async (pageOverride?: number) => {
      const targetPage = pageOverride ?? page;
      setLoading(true);
      setError(null);
      try {
        const { sites: data, pagination } = await fetchPhase4SitesPaginated({
          page: targetPage,
          limit: pageSize,
          search: debouncedSearch || undefined,
          status: statusFilter === 'all' ? undefined : statusFilter,
        });
        setSites(data);
        setTotalItems(pagination.total);
        if (targetPage > pagination.totalPages && pagination.totalPages > 0) {
          setPage(pagination.totalPages);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load sites');
      } finally {
        setLoading(false);
        setInitialLoad(false);
      }
    },
    [page, pageSize, debouncedSearch, statusFilter],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, pageSize]);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  useEffect(() => {
    if (!detailOpen || activeTab !== 'contacts' || !selectedSite) {
      return;
    }

    let cancelled = false;
    setContactsLoading(true);

    void fetchSiteContacts(selectedSite.slug)
      .then((data) => {
        if (!cancelled) {
          setSiteContacts(data.contacts);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSiteContacts([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setContactsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detailOpen, activeTab, selectedSite?.slug]);

  async function openDetails(site: Phase4GeneratedSite) {
    setDetailOpen(true);
    setDetailLoading(true);
    setActiveTab('home');
    setSiteContacts([]);
    setError(null);
    try {
      const full = await fetchPhase4Site(site.slug);
      setSelectedSite(full);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load site details');
      setSelectedSite(site);
    } finally {
      setDetailLoading(false);
    }
  }

  async function openEdit(site: Phase4GeneratedSite) {
    setEditOpen(true);
    setEditTab('business');
    setEditSuccess(null);
    setEditLoading(true);
    setEditTarget(site);

    try {
      const fetched = await fetchPhase4Site(site.slug);
      const siteData = { ...site, ...fetched } as SiteWithTheme;
      setEditTarget(siteData);
      populateEditForms(siteData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load site for editing');
      populateEditForms(site as SiteWithTheme);
    } finally {
      setEditLoading(false);
    }
  }

  async function refreshAfterEdit(updated: Phase4GeneratedSite, message: string) {
    setSites((prev) =>
      prev.map((s) => (s.id === updated.id ? { ...s, ...updated, template: s.template } : s)),
    );
    if (selectedSite?.id === updated.id) {
      setSelectedSite((prev) => (prev ? { ...prev, ...updated } : prev));
    }
    setEditOpen(false);
    setEditTarget(null);
    setEditSuccess(null);
    setSuccess(message);
    await loadSites();
  }

  async function handleSaveBusiness(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget || savingBusiness) return;

    setSavingBusiness(true);
    setError(null);
    setEditSuccess(null);
    try {
      const updated = await updatePhase4Site(editTarget.id, {
        businessName: editData.businessName?.trim() ?? '',
        industry: editData.industry?.trim() ?? '',
        phone: editData.phone?.trim() || null,
        email: editData.email?.trim() || null,
        description: editData.description?.trim() || null,
        address: editData.address?.trim() || null,
        city: editData.city?.trim() ?? '',
        state: editData.state?.trim() || 'NJ',
        facebookUrl: editData.facebookUrl?.trim() || null,
        instagramUrl: editData.instagramUrl?.trim() || null,
        websiteUrl: editData.websiteUrl?.trim() || null,
      } as SiteUpdatePayload);
      await refreshAfterEdit(updated, 'Business info saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save business info');
    } finally {
      setSavingBusiness(false);
    }
  }

  async function handleSaveTheme(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget || savingTheme) return;

    setSavingTheme(true);
    setError(null);
    setEditSuccess(null);
    try {
      const updated = await updatePhase4Site(editTarget.id, {
        primaryColor: normalizeColorHex(editData.primaryColor, '#1F2937'),
        secondaryColor: normalizeColorHex(editData.secondaryColor, '#F3F4F6'),
        accentColor: normalizeColorHex(editData.accentColor, '#6366F1'),
        heroStyle: (editData.heroStyle === 'light' ? 'light' : 'dark') as 'dark' | 'light',
        fontStyle: (
          editData.fontStyle === 'classic' || editData.fontStyle === 'friendly'
            ? editData.fontStyle
            : 'modern'
        ) as 'modern' | 'classic' | 'friendly',
        designVariant: Math.min(50, Math.max(1, Number(editData.designVariant) || 1)),
        yearsInBusiness: editData.yearsInBusiness?.trim() || null,
        customersServed: editData.customersServed?.trim() || null,
        projectsCompleted: editData.projectsCompleted?.trim() || null,
        logoUrl: editData.logoUrl?.trim() || null,
      } as SiteUpdatePayload);
      await refreshAfterEdit(updated, 'Theme, design, and stats saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save theme');
    } finally {
      setSavingTheme(false);
    }
  }

  async function handleSaveStatus(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget || savingStatus) return;

    setSavingStatus(true);
    setError(null);
    setEditSuccess(null);
    try {
      const updated = await updatePhase4Site(editTarget.id, {
        status: (editData.status || 'ACTIVE') as SiteStatus,
      });
      await refreshAfterEdit(updated, 'Status updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save status');
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleRegenerateSite() {
    if (!editTarget || regenerating) return;

    setRegenerating(true);
    setError(null);
    setEditSuccess(null);
    try {
      const updated = await regeneratePhase4Site(editTarget.id);
      await refreshAfterEdit(updated, 'Site content and theme regenerated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate site');
    } finally {
      setRegenerating(false);
    }
  }

  async function handleAddLocationPages(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSite) return;

    if (locationMode === 'radius') {
      const zipCode = radiusZip.trim();
      const miles = Number(radiusMiles);
      if (!/^\d{5}(-\d{4})?$/.test(zipCode)) {
        setError('Enter a valid 5-digit ZIP code.');
        return;
      }
      if (!Number.isFinite(miles) || miles <= 0 || miles > 100) {
        setError('Radius must be between 1 and 100 miles.');
        return;
      }

      setAddingLocations(true);
      setError(null);
      setSuccess(null);
      try {
        const pages = await addLocationPagesByRadius(selectedSite.id, {
          zipCode,
          radiusMiles: miles,
        });
        const refreshed = await fetchPhase4Site(selectedSite.slug);
        setSelectedSite(refreshed);
        setLocationDialogOpen(false);
        setRadiusZip('');
        setActiveTab('locations');
        setSuccess(`Added ${pages.length} location page(s) within ${miles} miles of ${zipCode}.`);
        await loadSites();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add location pages by radius');
      } finally {
        setAddingLocations(false);
      }
      return;
    }

    const locations = locationRows
      .map((row) => ({
        city: row.city.trim(),
        county: row.county.trim(),
        state: row.state?.trim() || 'NJ',
      }))
      .filter((row) => row.city && row.county);

    if (locations.length === 0) {
      setError('Add at least one city and county.');
      return;
    }

    setAddingLocations(true);
    setError(null);
    setSuccess(null);
    try {
      await addLocationPages(selectedSite.id, locations);
      const refreshed = await fetchPhase4Site(selectedSite.slug);
      setSelectedSite(refreshed);
      setLocationDialogOpen(false);
      setLocationRows([emptyLocationRow()]);
      setActiveTab('locations');
      setSuccess(`Added ${locations.length} location page(s).`);
      await loadSites();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add location pages');
    } finally {
      setAddingLocations(false);
    }
  }

  async function handleDeleteSite(e: React.MouseEvent) {
    e.preventDefault();
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      await deletePhase4Site(deleteTarget.id);
      if (selectedSite?.id === deleteTarget.id) {
        setDetailOpen(false);
        setSelectedSite(null);
      }
      setSuccess(`"${deleteTarget.businessName}" deleted.`);
      setDeleteTarget(null);
      const nextPage = sites.length === 1 && page > 1 ? page - 1 : page;
      if (nextPage !== page) {
        setPage(nextPage);
      } else {
        await loadSites(nextPage);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete site');
    } finally {
      setDeleting(false);
    }
  }

  async function refreshSelectedSite(updated?: Phase4GeneratedSite) {
    if (!selectedSite) return;
    if (updated) {
      setSelectedSite((prev) => (prev ? { ...prev, ...updated } : prev));
      setSites((prev) =>
        prev.map((s) => (s.id === updated.id ? { ...s, ...updated, template: s.template } : s)),
      );
      return;
    }
    try {
      const full = await fetchPhase4Site(selectedSite.slug);
      setSelectedSite(full);
      setSites((prev) =>
        prev.map((s) => (s.id === full.id ? { ...s, ...full, template: s.template } : s)),
      );
    } catch {
      // keep current modal data if refresh fails
    }
  }

  async function handleAddService(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSite || savingService) return;

    setSavingService(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await addPhase4Service(selectedSite.id, {
        title: serviceForm.title.trim(),
        shortDescription: serviceForm.shortDescription.trim(),
        fullDescription: serviceForm.fullDescription.trim(),
        icon: serviceForm.icon.trim(),
      });
      await refreshSelectedSite(updated);
      setServiceForm(emptyServiceForm);
      setServiceDialogOpen(false);
      setSuccess('Service added.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add service');
    } finally {
      setSavingService(false);
    }
  }

  async function handleDeleteService() {
    if (!selectedSite || deleteServiceIndex == null || deletingService) return;

    setDeletingService(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await deletePhase4Service(selectedSite.id, deleteServiceIndex);
      await refreshSelectedSite(updated);
      setDeleteServiceIndex(null);
      setSuccess('Service removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete service');
    } finally {
      setDeletingService(false);
    }
  }

  const managedServices = selectedSite
    ? parseServicesFromContent(selectedSite.servicesContent)
    : [];

  const tabs: { id: SiteTab; label: string; content: string | null | undefined }[] =
    selectedSite
      ? [
          { id: 'home', label: 'Home', content: selectedSite.homeContent },
          { id: 'about', label: 'About', content: selectedSite.aboutContent },
          { id: 'services', label: 'Services', content: selectedSite.servicesContent },
          { id: 'contact', label: 'Contact', content: selectedSite.contactContent },
          { id: 'blog', label: 'Blog', content: selectedSite.blogContent },
          { id: 'locations', label: 'Location Pages', content: null },
          { id: 'contacts', label: 'Contacts', content: null },
        ]
      : [];

  const hasActiveFilters = debouncedSearch.length > 0 || statusFilter !== 'all';
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
              itemLabel="sites"
              pageSizeOptions={[6, 12, 24, 48]}
              onPageChange={(nextPage) => setPage(nextPage)}
              onPageSizeChange={(size) => setPageSize(size)}
            />
          </PaginationFooter>
        ) : null
      }
    >
      <PageHeader
        title="Generated Sites"
        description={`View AI-generated websites and manage location landing pages. ${DESIGN_VARIANT_COUNT} unique site designs available — each new site rotates to a different layout.`}
      />

      {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}
      {success ? <SuccessBanner message={success} /> : null}

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="relative w-full lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search business, industry, city, slug…"
            disabled={loading && initialLoad}
            className={`${inputClass} pl-9`}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="text-sm text-slate-400" htmlFor="site-status-filter">
            Status
          </label>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as 'all' | SiteStatus)}
            disabled={loading && initialLoad}
          >
            <SelectTrigger id="site-status-filter" className="w-full sm:w-[180px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-slate-500">
            {loading ? 'Loading…' : `${totalItems} site${totalItems === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      <div className="flex-1">
      {loading && sites.length === 0 ? (
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
                Loading sites…
              </div>
            </div>
          ) : null}

          {sites.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-16 text-center text-sm text-slate-500">
              {hasActiveFilters
                ? 'No sites match your filters.'
                : 'No generated sites yet. Sites are created via the site generation webhook.'}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sites.map((site) => (
                <SiteCard
                  key={site.id}
                  site={site}
                  onDetails={openDetails}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}
        </div>
      )}
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="flex h-[min(90vh,800px)] max-h-[min(90vh,800px)] max-w-3xl flex-col gap-3 overflow-hidden p-4 sm:p-6">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>{selectedSite?.businessName ?? 'Site details'}</DialogTitle>
            <DialogDescription>
              Generated website content and location pages
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex min-h-0 flex-1 items-center justify-center text-slate-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading site details…
            </div>
          ) : selectedSite ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              <div className="flex shrink-0 flex-wrap gap-1 border-b border-slate-800 pb-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'rounded-t-lg px-3 py-2 text-sm font-medium transition-colors',
                      activeTab === tab.id
                        ? 'bg-slate-800 text-emerald-400'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200',
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                <div className="mb-4 grid gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500">Industry</p>
                    <p className="text-sm capitalize text-slate-200">{selectedSite.industry}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Location</p>
                    <p className="text-sm text-slate-200">
                      {selectedSite.city}, {selectedSite.state}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Slug</p>
                    <p className="font-mono text-sm text-slate-300">{selectedSite.slug}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Status</p>
                    <div className="mt-1">
                      <SiteStatusBadge status={selectedSite.status} />
                    </div>
                  </div>
                  {selectedSite.phone ? (
                    <div>
                      <p className="text-xs text-slate-500">Phone</p>
                      <p className="text-sm text-slate-200">{selectedSite.phone}</p>
                    </div>
                  ) : null}
                  {selectedSite.email ? (
                    <div>
                      <p className="text-xs text-slate-500">Email</p>
                      <p className="text-sm text-slate-200">{selectedSite.email}</p>
                    </div>
                  ) : null}
                  {selectedSite.description ? (
                    <div className="sm:col-span-2">
                      <p className="text-xs text-slate-500">Description</p>
                      <p className="text-sm text-slate-300">{selectedSite.description}</p>
                    </div>
                  ) : null}
                </div>

                <div className="mb-4">
                  <SiteThemeSection site={selectedSite} />
                </div>

              {activeTab === 'services' ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-slate-400">
                      {managedServices.length} service{managedServices.length === 1 ? '' : 's'}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setServiceForm(emptyServiceForm);
                        setServiceDialogOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Add Service
                    </Button>
                  </div>

                  {managedServices.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-500">
                      No services yet. Add one to get started.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {managedServices.map((service, index) => (
                        <div
                          key={`${service.title}-${index}`}
                          className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4 sm:flex-row sm:items-start sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <p className="font-medium text-white">{service.title || 'Untitled'}</p>
                              {service.icon ? (
                                <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-400">
                                  {service.icon}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-sm text-slate-400">
                              {service.shortDescription || 'No description'}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                            onClick={() => setDeleteServiceIndex(index)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : activeTab === 'locations' ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-slate-400">
                      {selectedSite.locationPages?.length ?? 0} location page(s)
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setLocationRows([emptyLocationRow()]);
                        setLocationDialogOpen(true);
                      }}
                    >
                      <MapPin className="h-4 w-4" />
                      Add Location Pages
                    </Button>
                  </div>

                  {(selectedSite.locationPages?.length ?? 0) === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-500">
                      No location pages yet.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {selectedSite.locationPages?.map((page: Phase4LocationPage) => (
                        <div
                          key={page.id}
                          className="rounded-lg border border-slate-800 bg-slate-950/40 p-4"
                        >
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-medium text-white">
                                {page.city}, {page.county} County
                              </p>
                              <p className="font-mono text-xs text-slate-500">{page.slug}</p>
                            </div>
                            <span className="text-xs text-slate-500">
                              {formatDate(page.createdAt)}
                            </span>
                          </div>
                          <PageContentPanel content={page.content} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : activeTab === 'contacts' ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-400">
                    {contactsLoading
                      ? 'Loading submissions…'
                      : `${siteContacts.length} contact submission${siteContacts.length === 1 ? '' : 's'}`}
                  </p>

                  {contactsLoading ? (
                    <div className="flex items-center justify-center py-12 text-slate-400">
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Loading contacts…
                    </div>
                  ) : siteContacts.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-500">
                      No contact submissions yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {siteContacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="rounded-lg border border-slate-800 bg-slate-950/40 p-4"
                        >
                          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-white">{contact.name}</p>
                              <p className="text-sm text-slate-400">{contact.email}</p>
                              {contact.phone ? (
                                <p className="text-sm text-slate-500">{contact.phone}</p>
                              ) : null}
                            </div>
                            <span className="text-xs text-slate-500">
                              {formatDate(contact.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap text-slate-300">
                            {contact.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <PageContentPanel
                  content={tabs.find((t) => t.id === activeTab)?.content ?? null}
                />
              )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={serviceDialogOpen}
        onOpenChange={(open) => {
          setServiceDialogOpen(open);
          if (!open) setServiceForm(emptyServiceForm);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Service</DialogTitle>
            <DialogDescription>
              Add a service to this site. It will appear on the services and home pages.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleAddService(e)} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Title</label>
              <input
                type="text"
                required
                value={serviceForm.title}
                onChange={(e) => setServiceForm((f) => ({ ...f, title: e.target.value }))}
                className={inputClass}
                placeholder="AC Repair"
                disabled={savingService}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Short Description
              </label>
              <textarea
                required
                rows={2}
                value={serviceForm.shortDescription}
                onChange={(e) =>
                  setServiceForm((f) => ({ ...f, shortDescription: e.target.value }))
                }
                className={inputClass}
                placeholder="Fast, reliable AC repair for homes and businesses."
                disabled={savingService}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Full Description
              </label>
              <textarea
                required
                rows={4}
                value={serviceForm.fullDescription}
                onChange={(e) =>
                  setServiceForm((f) => ({ ...f, fullDescription: e.target.value }))
                }
                className={inputClass}
                placeholder="Detailed description of this service offering."
                disabled={savingService}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Icon</label>
              <input
                type="text"
                required
                value={serviceForm.icon}
                onChange={(e) => setServiceForm((f) => ({ ...f, icon: e.target.value }))}
                className={inputClass}
                placeholder="wrench or car"
                disabled={savingService}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setServiceDialogOpen(false)}
                disabled={savingService}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingService}>
                {savingService ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteServiceIndex != null}
        onOpenChange={(open) => {
          if (!open && !deletingService) setDeleteServiceIndex(null);
        }}
      >
        <AlertDialogContent
          onEscapeKeyDown={(e) => {
            if (deletingService) e.preventDefault();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete service?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{' '}
              {deleteServiceIndex != null && managedServices[deleteServiceIndex]
                ? `"${managedServices[deleteServiceIndex].title}"`
                : 'this service'}{' '}
              from the services and home pages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingService}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              loading={deletingService}
              disabled={deletingService}
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteService();
              }}
            >
              {deletingService ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent
          key={editTarget?.id}
          className="flex h-[min(85vh,720px)] max-h-[min(85vh,720px)] max-w-2xl flex-col overflow-hidden"
        >
          <DialogHeader className="shrink-0">
            <DialogTitle>Edit {editTarget?.businessName ?? 'site'}</DialogTitle>
            <DialogDescription>Update business info, theme, status, or regenerate content.</DialogDescription>
          </DialogHeader>

          {editTarget ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
              {editLoading ? (
                <div className="flex flex-1 items-center justify-center text-slate-400">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading site data…
                </div>
              ) : (
                <>
              {editSuccess ? (
                <div className="shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                  {editSuccess}
                </div>
              ) : null}

              <div className="flex shrink-0 flex-wrap gap-1 border-b border-slate-800 pb-1">
                {[
                  { id: 'business' as const, label: 'Business Info' },
                  { id: 'colors' as const, label: 'Colors & Theme' },
                  { id: 'regenerate' as const, label: 'Regenerate' },
                  { id: 'status' as const, label: 'Status' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setEditTab(tab.id)}
                    className={cn(
                      'rounded-t-lg px-3 py-2 text-sm font-medium transition-colors',
                      editTab === tab.id
                        ? 'bg-slate-800 text-emerald-400'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200',
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {editTab === 'business' ? (
                <form onSubmit={(e) => void handleSaveBusiness(e)} className="space-y-4">
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                    Changing business name, industry or city will regenerate all page content
                    automatically.
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Business Name
                    </label>
                    <input
                      type="text"
                      required
                      value={editData.businessName || ''}
                      onChange={(e) =>
                        setEditData((prev) => ({ ...prev, businessName: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Industry</label>
                    <input
                      type="text"
                      required
                      value={editData.industry || ''}
                      onChange={(e) =>
                        setEditData((prev) => ({ ...prev, industry: e.target.value }))
                      }
                      className={inputClass}
                      placeholder="hvac, automotive, plumbing"
                    />
                    <p className="mt-1 text-xs text-amber-400/80">
                      Changing industry will regenerate all page content automatically.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">Phone</label>
                      <input
                        type="text"
                        value={editData.phone || ''}
                        onChange={(e) =>
                          setEditData((prev) => ({ ...prev, phone: e.target.value }))
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">Email</label>
                      <input
                        type="email"
                        value={editData.email || ''}
                        onChange={(e) =>
                          setEditData((prev) => ({ ...prev, email: e.target.value }))
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Description
                    </label>
                    <textarea
                      rows={3}
                      value={editData.description || ''}
                      onChange={(e) =>
                        setEditData((prev) => ({ ...prev, description: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Full Address
                    </label>
                    <textarea
                      rows={2}
                      value={editData.address || ''}
                      onChange={(e) =>
                        setEditData((prev) => ({ ...prev, address: e.target.value }))
                      }
                      className={inputClass}
                      placeholder="123 Main St, Suite 100"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">City</label>
                      <input
                        type="text"
                        required
                        value={editData.city || ''}
                        onChange={(e) =>
                          setEditData((prev) => ({ ...prev, city: e.target.value }))
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">State</label>
                      <input
                        type="text"
                        required
                        value={editData.state || ''}
                        onChange={(e) =>
                          setEditData((prev) => ({ ...prev, state: e.target.value }))
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-1">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Facebook URL
                      </label>
                      <input
                        type="url"
                        value={editData.facebookUrl || ''}
                        onChange={(e) =>
                          setEditData((prev) => ({ ...prev, facebookUrl: e.target.value }))
                        }
                        className={inputClass}
                        placeholder="https://facebook.com/..."
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Instagram URL
                      </label>
                      <input
                        type="url"
                        value={editData.instagramUrl || ''}
                        onChange={(e) =>
                          setEditData((prev) => ({ ...prev, instagramUrl: e.target.value }))
                        }
                        className={inputClass}
                        placeholder="https://instagram.com/..."
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Website URL
                      </label>
                      <input
                        type="url"
                        value={editData.websiteUrl || ''}
                        onChange={(e) =>
                          setEditData((prev) => ({ ...prev, websiteUrl: e.target.value }))
                        }
                        className={inputClass}
                        placeholder="https://yourbusiness.com"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={savingBusiness}>
                      {savingBusiness ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Save Business Info
                    </Button>
                  </div>
                </form>
              ) : null}

              {editTab === 'colors' ? (
                <form onSubmit={(e) => void handleSaveTheme(e)} className="space-y-4">
                  <ThemePreviewCircles
                    primaryColor={editData.primaryColor || '#1F2937'}
                    secondaryColor={editData.secondaryColor || '#F3F4F6'}
                    accentColor={editData.accentColor || '#6366F1'}
                  />
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Logo URL</label>
                    <input
                      type="url"
                      value={editData.logoUrl || ''}
                      onChange={(e) =>
                        setEditData((prev) => ({ ...prev, logoUrl: e.target.value }))
                      }
                      className={inputClass}
                      placeholder="https://example.com/logo.png"
                    />
                    {editData.logoUrl ? (
                      <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                        <img
                          src={editData.logoUrl}
                          alt="Logo preview"
                          className="h-12 max-w-[120px] rounded object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <span className="text-xs text-slate-500">Logo preview</span>
                      </div>
                    ) : null}
                  </div>
                  <ColorField
                    label="Primary Color"
                    value={editData.primaryColor || '#1F2937'}
                    onChange={(primaryColor) =>
                      setEditData((prev) => ({ ...prev, primaryColor }))
                    }
                  />
                  <ColorField
                    label="Secondary Color"
                    value={editData.secondaryColor || '#F3F4F6'}
                    onChange={(secondaryColor) =>
                      setEditData((prev) => ({ ...prev, secondaryColor }))
                    }
                  />
                  <ColorField
                    label="Accent Color"
                    value={editData.accentColor || '#6366F1'}
                    onChange={(accentColor) =>
                      setEditData((prev) => ({ ...prev, accentColor }))
                    }
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Hero Style
                      </label>
                      <Select
                        value={editData.heroStyle || 'dark'}
                        onValueChange={(value: 'dark' | 'light') =>
                          setEditData((prev) => ({ ...prev, heroStyle: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Hero style" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dark">Dark</SelectItem>
                          <SelectItem value="light">Light</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Font Style
                      </label>
                      <Select
                        value={editData.fontStyle || 'modern'}
                        onValueChange={(value: 'modern' | 'classic' | 'friendly') =>
                          setEditData((prev) => ({ ...prev, fontStyle: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Font style" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="modern">Modern</SelectItem>
                          <SelectItem value="classic">Classic</SelectItem>
                          <SelectItem value="friendly">Friendly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Site design ({DESIGN_VARIANT_COUNT} available)
                    </label>
                    <Select
                      value={String(editData.designVariant || '1')}
                      onValueChange={(value) =>
                        setEditData((prev) => ({ ...prev, designVariant: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a design" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {DESIGN_CATALOG.map((item) => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            #{item.id} · {item.name} ({item.family})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-slate-500">
                      {getDesignCatalogItem(Number(editData.designVariant) || 1).description}
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Years in business
                      </label>
                      <input
                        type="text"
                        value={editData.yearsInBusiness || ''}
                        onChange={(e) =>
                          setEditData((prev) => ({ ...prev, yearsInBusiness: e.target.value }))
                        }
                        className={inputClass}
                        placeholder="e.g. 12"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Customers served
                      </label>
                      <input
                        type="text"
                        value={editData.customersServed || ''}
                        onChange={(e) =>
                          setEditData((prev) => ({ ...prev, customersServed: e.target.value }))
                        }
                        className={inputClass}
                        placeholder="e.g. 850+"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Projects completed
                      </label>
                      <input
                        type="text"
                        value={editData.projectsCompleted || ''}
                        onChange={(e) =>
                          setEditData((prev) => ({ ...prev, projectsCompleted: e.target.value }))
                        }
                        className={inputClass}
                        placeholder="e.g. 1200"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Stats only appear on the live site when filled. Empty fields stay hidden — no fake
                    numbers.
                  </p>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={savingTheme}>
                      {savingTheme ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Save Theme
                    </Button>
                  </div>
                </form>
              ) : null}

              {editTab === 'regenerate' ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
                    This will regenerate ALL page content and theme using AI. Current content will be
                    replaced.
                  </div>
                  <Button
                    type="button"
                    className="w-full py-6 text-base"
                    disabled={regenerating}
                    onClick={() => void handleRegenerateSite()}
                  >
                    {regenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Regenerate Site
                  </Button>
                </div>
              ) : null}

              {editTab === 'status' ? (
                <form onSubmit={(e) => void handleSaveStatus(e)} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
                    <Select
                      value={editData.status || 'ACTIVE'}
                      onValueChange={(value: SiteStatus) =>
                        setEditData((prev) => ({ ...prev, status: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PENDING">PENDING</SelectItem>
                        <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                        <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={savingStatus}>
                      {savingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Save Status
                    </Button>
                  </div>
                </form>
              ) : null}
              </div>
                </>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add location pages</DialogTitle>
            <DialogDescription>
              Generate SEO landing pages for cities served by {selectedSite?.businessName}. Use ZIP
              radius to add cities in range, or enter cities manually.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={locationMode === 'radius' ? 'default' : 'outline'}
              onClick={() => setLocationMode('radius')}
            >
              ZIP + radius
            </Button>
            <Button
              type="button"
              size="sm"
              variant={locationMode === 'manual' ? 'default' : 'outline'}
              onClick={() => setLocationMode('manual')}
            >
              Manual cities
            </Button>
          </div>

          <form onSubmit={handleAddLocationPages} className="space-y-4">
            {locationMode === 'radius' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">ZIP code</label>
                  <input
                    type="text"
                    required
                    value={radiusZip}
                    onChange={(e) => setRadiusZip(e.target.value)}
                    className={inputClass}
                    placeholder="07030"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Radius (miles)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={radiusMiles}
                    onChange={(e) => setRadiusMiles(e.target.value)}
                    className={inputClass}
                    placeholder="15"
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="max-h-[min(50vh,360px)] space-y-3 overflow-y-auto pr-1">
                  {locationRows.map((row, index) => (
                    <div
                      key={index}
                      className="grid gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3 sm:grid-cols-[1fr_1fr_auto]"
                    >
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">City</label>
                        <input
                          type="text"
                          required
                          value={row.city}
                          onChange={(e) => {
                            const next = [...locationRows];
                            next[index] = { ...next[index], city: e.target.value };
                            setLocationRows(next);
                          }}
                          className={inputClass}
                          placeholder="Hackensack"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">
                          County
                        </label>
                        <input
                          type="text"
                          required
                          value={row.county}
                          onChange={(e) => {
                            const next = [...locationRows];
                            next[index] = { ...next[index], county: e.target.value };
                            setLocationRows(next);
                          }}
                          className={inputClass}
                          placeholder="Bergen"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={locationRows.length <= 1}
                          onClick={() =>
                            setLocationRows((rows) => rows.filter((_, i) => i !== index))
                          }
                          aria-label="Remove row"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLocationRows((rows) => [...rows, emptyLocationRow()])}
                >
                  <Plus className="h-4 w-4" />
                  Add row
                </Button>
              </>
            )}

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocationDialogOpen(false)}
                disabled={addingLocations}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={addingLocations}>
                {addingLocations ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Generate pages
              </Button>
            </div>
          </form>
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
            <AlertDialogTitle>Delete generated site?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this site and all its location pages
              {deleteTarget ? ` for "${deleteTarget.businessName}".` : '.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              loading={deleting}
              disabled={deleting}
              onClick={(e) => void handleDeleteSite(e)}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PaginatedPageLayout>
  );
}
