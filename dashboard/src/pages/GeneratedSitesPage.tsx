import { useCallback, useEffect, useState } from 'react';
import { Loader2, ExternalLink, MapPin, Minus, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import {
  addLocationPages,
  addLocationPagesByRadius,
  previewRadiusTowns,
  type RadiusTown,
  addPhase4Service,
  deletePhase4LocationPage,
  regeneratePhase4Service,
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
import { useLocations } from '../contexts/LocationsContext';
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
import { BlogPanel } from '../components/BlogPanel';
import { SiteAddressPanel } from '../components/SiteAddressPanel';
import { CustomDomainPanel } from '../components/CustomDomainPanel';
import { OpeningHoursEditor } from '../components/OpeningHoursEditor';
import { PageTextEditor, PageTabPanel, ServicesEditor } from '../components/PageTextEditor';
import { PhotoCreditsPanel } from '../components/PhotoCreditsPanel';
import { SiteVideoPanel } from '../components/SiteVideoPanel';
import { CityPhotosPanel } from '../components/CityPhotosPanel';
import { uploadSiteImage } from '../api/blog';
import { KeywordPagesPanel } from '../components/KeywordPagesPanel';
import { cn } from '../lib/utils';
import { formatDate } from '../utils/format';
import { DESIGN_CATALOG, DESIGN_VARIANT_COUNT, getDesignCatalogItem } from '../data/designCatalog';

type SiteTab = 'home' | 'about' | 'services' | 'contact' | 'blog' | 'locations' | 'keywords' | 'contacts' | 'photos';
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
  /** Opening hours JSON for the business schema, or null when not set. */
  openingHours?: string | null;
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
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5 sm:p-6">
      <p className="mb-4 text-sm font-medium text-white">Theme</p>
      <div className="grid gap-5 sm:grid-cols-3">
        <ThemeColorSwatch label="Primary Color" color={theme.primaryColor} />
        <ThemeColorSwatch label="Secondary Color" color={theme.secondaryColor} />
        <ThemeColorSwatch label="Accent Color" color={theme.accentColor} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-full bg-slate-800 px-3 py-1.5 text-xs font-medium capitalize text-slate-200 ring-1 ring-inset ring-slate-700">
          Hero: {theme.heroStyle}
        </span>
        <span className="inline-flex items-center rounded-full bg-slate-800 px-3 py-1.5 text-xs font-medium capitalize text-slate-200 ring-1 ring-inset ring-slate-700">
          Font: {theme.fontStyle}
        </span>
        <span className="inline-flex items-center rounded-full bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 ring-1 ring-inset ring-slate-700">
          Design {site.designVariant ?? 1}/{DESIGN_VARIANT_COUNT}:{' '}
          {getDesignCatalogItem(site.designVariant).name}
        </span>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/40';

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

function humanizeKey(key: string) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function pickEntry(
  entries: [string, unknown][],
  names: string[],
): [string, unknown] | undefined {
  const set = new Set(names.map((n) => n.toLowerCase()));
  return entries.find(([key]) => set.has(key.toLowerCase()));
}

function isFaqLike(entries: [string, unknown][]) {
  const hasQ = entries.some(([k]) => /^(questions?|q)$/i.test(k));
  const hasA = entries.some(([k]) => /^(answers?|a)$/i.test(k));
  return hasQ && hasA;
}

function ReadableValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-slate-600">—</span>;
  }

  if (typeof value === 'string') {
    return <p className="min-w-0 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{value}</p>;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span className="text-sm text-slate-200">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    return (
      <ol className="space-y-5">
        {value.map((item, index) => (
          <li key={index} className="flex min-w-0 gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-semibold text-emerald-300">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <ReadableValue value={item} depth={depth + 1} />
            </div>
          </li>
        ))}
      </ol>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);

    if (isFaqLike(entries)) {
      const question = pickEntry(entries, ['question', 'questions', 'q']);
      const answer = pickEntry(entries, ['answer', 'answers', 'a']);
      const rest = entries.filter(([key]) => key !== question?.[0] && key !== answer?.[0]);

      return (
        <div className="min-w-0 w-full space-y-2">
          {question ? (
            <p className="text-sm font-medium leading-snug text-white">
              {String(question[1] ?? '')}
            </p>
          ) : null}
          {answer ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
              {String(answer[1] ?? '')}
            </p>
          ) : null}
          {rest.map(([key, val]) => (
            <div key={key} className="pt-1">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {humanizeKey(key)}
              </p>
              <ReadableValue value={val} depth={depth + 1} />
            </div>
          ))}
        </div>
      );
    }

    const flatScalars = entries.every(
      ([, v]) => v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
    );
    const hasLongText = entries.some(
      ([, v]) => typeof v === 'string' && v.trim().length > 48,
    );

    if (flatScalars && entries.length > 0 && !hasLongText) {
      return (
        <div className="grid w-full gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map(([key, val]) => (
            <div key={key} className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {humanizeKey(key)}
              </p>
              <p className="mt-1 text-sm text-slate-200">
                {val === null || val === undefined || val === '' ? '—' : String(val)}
              </p>
            </div>
          ))}
        </div>
      );
    }

    if (flatScalars && entries.length > 0) {
      return (
        <div className="w-full space-y-3">
          {entries.map(([key, val]) => (
            <div key={key} className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {humanizeKey(key)}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                {val === null || val === undefined || val === '' ? '—' : String(val)}
              </p>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className={cn('w-full space-y-5', depth > 0 && 'border-l border-slate-800 pl-4')}>
        {entries.map(([key, val]) => (
          <div key={key} className="min-w-0">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              {humanizeKey(key)}
            </p>
            <ReadableValue value={val} depth={depth + 1} />
          </div>
        ))}
      </div>
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
      <p className="py-10 text-center text-sm text-slate-500">No content generated for this page.</p>
    );
  }

  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    const sectionOrder = [
      'hero',
      'heading',
      'subheading',
      'intro',
      'summary',
      'description',
      'localStats',
      'stats',
      'process',
      'steps',
      'services',
      'faq',
      'cta',
    ];
    const keys = [
      ...sectionOrder.filter((k) => k in record),
      ...Object.keys(record).filter((k) => !sectionOrder.includes(k)),
    ];

    return (
      <div className={cn('divide-y divide-slate-800/80', className)}>
        {keys.map((key) => (
          <section key={key} className="py-5 first:pt-0 last:pb-0">
            <h4 className="mb-3 text-sm font-medium text-white">{humanizeKey(key)}</h4>
            <ReadableValue value={record[key]} />
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      <ReadableValue value={parsed} />
    </div>
  );
}

function emptyLocationRow(): Phase4LocationInput {
  return { city: '', county: '', state: '' };
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
  const [radiusPreview, setRadiusPreview] = useState<RadiusTown[] | null>(null);
  const [previewingTowns, setPreviewingTowns] = useState(false);

  async function handlePreviewTowns() {
    if (!selectedSite) return;
    setPreviewingTowns(true);
    setError(null);
    try {
      const { towns } = await previewRadiusTowns(selectedSite.id, {
        zipCode: radiusZip.trim(),
        radiusMiles: Number(radiusMiles),
      });
      setRadiusPreview(towns);
    } catch (err) {
      setRadiusPreview(null);
      setError(err instanceof Error ? err.message : 'Failed to preview towns');
    } finally {
      setPreviewingTowns(false);
    }
  }
  const [addingLocations, setAddingLocations] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Phase4GeneratedSite | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<SiteWithTheme | null>(null);
  const [editTab, setEditTab] = useState<EditTab>('business');
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [logoUploading, setLogoUploading] = useState(false);
  const { locations: ghlLocations } = useLocations();
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [serviceForm, setServiceForm] = useState<Phase4ServicePayload>(emptyServiceForm);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [locationEditMode, setLocationEditMode] = useState(false);
  const [deletingLocationId, setDeletingLocationId] = useState<string | null>(null);
  const [regeneratingService, setRegeneratingService] = useState<string | null>(null);
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
      openingHours: (siteData as SiteExtraFields).openingHours ?? '',
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
      searchIndexable: siteData.searchIndexable === true ? 'true' : 'false',
      leadLocationId: siteData.leadLocationId ?? '',
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
    setSelectedLocationId(null);
    setLocationEditMode(false);
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

    const identityChanged =
      (editData.businessName?.trim() ?? '') !== (editTarget.businessName ?? '') ||
      (editData.industry?.trim() ?? '') !== (editTarget.industry ?? '') ||
      (editData.city?.trim() ?? '') !== (editTarget.city ?? '');
    // Rewriting the site is never a side effect: ask. The URL stays the same either way.
    const regenerateContent =
      identityChanged &&
      window.confirm(
        [
          'Business name, industry or city changed.',
          '',
          'OK = also rewrite ALL page text with AI (replaces current text and colours; paid AI call).',
          'Cancel = save the new details only (page text keeps the old wording).',
          '',
          'The site URL stays the same either way.',
        ].join('\n'),
      );

    setSavingBusiness(true);
    setError(null);
    setEditSuccess(null);
    try {
      const updated = await updatePhase4Site(editTarget.id, {
        regenerateContent,
        businessName: editData.businessName?.trim() ?? '',
        industry: editData.industry?.trim() ?? '',
        phone: editData.phone?.trim() || null,
        email: editData.email?.trim() || null,
        description: editData.description?.trim() || null,
        address: editData.address?.trim() || null,
        city: editData.city?.trim() ?? '',
        // An emptied field keeps the site's current state (never a fixed default).
        state: editData.state?.trim() || editTarget.state,
        facebookUrl: editData.facebookUrl?.trim() || null,
        instagramUrl: editData.instagramUrl?.trim() || null,
        websiteUrl: editData.websiteUrl?.trim() || null,
        openingHours: editData.openingHours || null,
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
        searchIndexable: editData.searchIndexable === 'true',
        leadLocationId: editData.leadLocationId || null,
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
    if (
      !window.confirm(
        'Rewrite ALL page text, the blog and the colours for this site with AI? This replaces the current content and uses paid AI calls. The URL stays the same.',
      )
    ) {
      return;
    }

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
        // Empty county: looked up from ZIP data; empty state: the site's own state.
        county: row.county?.trim() || undefined,
        state: row.state?.trim() || undefined,
      }))
      .filter((row) => row.city);

    if (locations.length === 0) {
      setError('Add at least one city.');
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
      const addedTitle = serviceForm.title.trim();
      const wroteText = !serviceForm.shortDescription.trim() || !serviceForm.fullDescription.trim() || !serviceForm.icon.trim();
      setServiceForm(emptyServiceForm);
      setServiceDialogOpen(false);
      setSuccess(
        wroteText
          ? `Service "${addedTitle}" added with AI-written text. Its own page is being written now and will be ready in about a minute.`
          : 'Service added.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add service');
    } finally {
      setSavingService(false);
    }
  }

  /** Same URL key the site uses for a service page. */
  function serviceSlugOf(title: string) {
    return title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  async function handleRegenerateService(title: string) {
    if (!selectedSite || regeneratingService) return;
    if (
      !window.confirm(
        `Regenerate "${title}"?\n\nIts short and full description, icon and its own page are rewritten. Hand edits you made to this service are replaced.\n\nEverything else stays as it is: the other services, the other pages and all your other edits.`,
      )
    ) {
      return;
    }
    setRegeneratingService(title);
    setError(null);
    setSuccess(null);
    try {
      const result = await regeneratePhase4Service(selectedSite.id, serviceSlugOf(title));
      await refreshSelectedSite(result.site);
      setSuccess(
        `"${title}" regenerated${result.handEditsReplaced ? ` (${result.handEditsReplaced} hand edit${result.handEditsReplaced === 1 ? '' : 's'} to it replaced)` : ''}. Its own page is being rewritten and will be ready in about a minute.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate the service');
    } finally {
      setRegeneratingService(null);
    }
  }

  async function handleDeleteLocationPage(page: Phase4LocationPage) {
    if (!selectedSite || deletingLocationId) return;
    if (
      !window.confirm(
        `Delete the city page for ${page.city}?\n\nIts address (/${selectedSite.slug}/${page.slug}) will stop working (it answers "not found"), and any keyword pages for ${page.city} are deleted too. This can't be undone.`,
      )
    ) {
      return;
    }
    setDeletingLocationId(page.id);
    setError(null);
    setSuccess(null);
    try {
      const result = await deletePhase4LocationPage(selectedSite.id, page.id);
      if (selectedLocationId === page.id) {
        setSelectedLocationId(null);
        setLocationEditMode(false);
      }
      await refreshSelectedSite();
      setSuccess(
        `City page for ${result.city} deleted${result.keywordPagesDeleted ? `, with ${result.keywordPagesDeleted} keyword page${result.keywordPagesDeleted === 1 ? '' : 's'}` : ''}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete the city page');
    } finally {
      setDeletingLocationId(null);
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
          { id: 'keywords', label: 'Keyword Pages', content: null },
          { id: 'contacts', label: 'Contacts', content: null },
          { id: 'photos', label: 'Photo credits', content: null },
        ]
      : [];

  const locationPages = selectedSite?.locationPages ?? [];
  const activeLocationId =
    selectedLocationId && locationPages.some((p) => p.id === selectedLocationId)
      ? selectedLocationId
      : locationPages[0]?.id ?? null;
  const activeLocation = locationPages.find((p) => p.id === activeLocationId) ?? null;

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
        <DialogContent className="flex h-[min(92vh,920px)] w-[calc(100%-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:w-full">
          <DialogHeader className="shrink-0 border-b border-slate-800/80 px-5 py-4 pr-12 sm:px-6 sm:py-5">
            <DialogTitle className="text-xl sm:text-2xl">{selectedSite?.businessName ?? 'Site details'}</DialogTitle>
            <DialogDescription className="mt-1.5">
              Generated website content and location pages
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex min-h-0 flex-1 items-center justify-center text-slate-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading site details…
            </div>
          ) : selectedSite ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-slate-800/80 px-4 pt-3 sm:gap-2 sm:px-6">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'rounded-t-lg px-3.5 py-2.5 text-sm font-medium transition-colors',
                      activeTab === tab.id
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6">
                {activeTab === 'home' ? (
                  <>
                    <div className="mb-5 grid gap-4 rounded-xl border border-slate-800 bg-slate-950/40 p-5 sm:grid-cols-2 sm:gap-5 sm:p-6">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Industry</p>
                        <p className="mt-1.5 text-sm capitalize text-slate-200">{selectedSite.industry}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Location</p>
                        <p className="mt-1.5 text-sm text-slate-200">
                          {selectedSite.city}, {selectedSite.state}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Slug</p>
                        <p className="mt-1.5 font-mono text-sm text-slate-300">{selectedSite.slug}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</p>
                        <div className="mt-1.5">
                          <SiteStatusBadge status={selectedSite.status} />
                        </div>
                      </div>
                      {selectedSite.phone ? (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Phone</p>
                          <p className="mt-1.5 text-sm text-slate-200">{selectedSite.phone}</p>
                        </div>
                      ) : null}
                      {selectedSite.email ? (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Email</p>
                          <p className="mt-1.5 text-sm text-slate-200">{selectedSite.email}</p>
                        </div>
                      ) : null}
                      {selectedSite.description ? (
                        <div className="sm:col-span-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</p>
                          <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{selectedSite.description}</p>
                        </div>
                      ) : null}
                    </div>

                    <div className="mb-5">
                      <SiteThemeSection site={selectedSite} />
                    </div>
                  </>
                ) : null}

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
                          <div className="flex shrink-0 gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={regeneratingService !== null || !service.title}
                              onClick={() => void handleRegenerateService(service.title)}
                              title="Rewrite this service's texts, icon and its own page"
                            >
                              {regeneratingService === service.title ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                              )}
                              {regeneratingService === service.title ? 'Regenerating…' : 'Regenerate'}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                              disabled={regeneratingService !== null}
                              onClick={() => setDeleteServiceIndex(index)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="border-t border-slate-800 pt-6">
                    <p className="mb-1 font-medium text-white">Edit texts and images</p>
                    <p className="mb-4 text-xs text-slate-500">Changes show on the live site within a minute and are kept if the site content is regenerated.</p>
                    <ServicesEditor key={selectedSite.id} siteId={selectedSite.id} industry={selectedSite.industry} />
                  </div>
                </div>
              ) : activeTab === 'locations' ? (
                <div className="flex min-h-[420px] flex-col">
                  <div className="mb-5">
                    <CityPhotosPanel key={selectedSite.id} siteId={selectedSite.id} />
                  </div>
                  <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {locationPages.length} location
                        {locationPages.length === 1 ? '' : 's'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        City landing pages for local SEO. Select a city to review or edit its content.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setLocationRows([emptyLocationRow()]);
                        setLocationDialogOpen(true);
                      }}
                    >
                      <MapPin className="h-4 w-4" />
                      Add locations
                    </Button>
                  </div>

                  {locationPages.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
                      <MapPin className="h-8 w-8 text-slate-600" />
                      <p className="mt-3 text-sm font-medium text-slate-300">No location pages yet</p>
                      <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
                        Add cities this business serves to generate local landing pages.
                      </p>
                    </div>
                  ) : (
                    <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
                      <nav
                        className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:border-r lg:border-slate-800/80 lg:pr-4"
                        aria-label="Location pages"
                      >
                        {locationPages.map((page) => {
                          const selected = page.id === activeLocationId;
                          return (
                            <button
                              key={page.id}
                              type="button"
                              onClick={() => {
                                setSelectedLocationId(page.id);
                                setLocationEditMode(false);
                              }}
                              className={cn(
                                'shrink-0 rounded-lg px-3 py-2.5 text-left transition-colors lg:w-full',
                                selected
                                  ? 'bg-emerald-600/15 text-emerald-300'
                                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200',
                              )}
                            >
                              <span className="block text-sm font-medium leading-snug">
                                {page.city}
                              </span>
                              <span className="mt-0.5 block text-[11px] text-slate-500">
                                {page.county} County
                              </span>
                            </button>
                          );
                        })}
                      </nav>

                      {activeLocation ? (
                        <div className="min-w-0">
                          <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-slate-800/80 pb-4">
                            <div className="min-w-0">
                              <h3 className="text-lg font-medium text-white">
                                {activeLocation.city}, {activeLocation.county} County
                              </h3>
                              <p className="mt-1 font-mono text-xs text-slate-500">
                                /{selectedSite.slug}/{activeLocation.slug}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
                                Added {formatDate(activeLocation.createdAt)}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setLocationEditMode((v) => !v)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                {locationEditMode ? 'Done' : 'Edit'}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                                disabled={deletingLocationId !== null}
                                onClick={() => void handleDeleteLocationPage(activeLocation)}
                              >
                                {deletingLocationId === activeLocation.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                                Delete
                              </Button>
                            </div>
                          </div>

                          {locationEditMode ? (
                            <PageTextEditor
                              key={activeLocation.id}
                              siteId={selectedSite.id}
                              page={`location:${activeLocation.id}`}
                            />
                          ) : (
                            <PageContentPanel content={activeLocation.content} />
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : activeTab === 'blog' ? (
                <BlogPanel key={selectedSite.id} siteId={selectedSite.id} siteSlug={selectedSite.slug} siteBaseUrl={SITE_URL} />
              ) : activeTab === 'photos' ? (
                <PhotoCreditsPanel key={selectedSite.id} siteId={selectedSite.id} />
              ) : activeTab === 'keywords' ? (
                <KeywordPagesPanel
                  key={selectedSite.id}
                  siteId={selectedSite.id}
                  siteSlug={selectedSite.slug}
                  siteBaseUrl={SITE_URL}
                  cities={(selectedSite.locationPages ?? []).map((p: Phase4LocationPage) => ({
                    id: p.id,
                    city: p.city,
                    county: p.county,
                  }))}
                />
              ) : activeTab === 'contacts' ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-400">
                    {contactsLoading
                      ? 'Loading submissions…'
                      : `${siteContacts.length} contact submission${siteContacts.length === 1 ? '' : 's'}`}
                  </p>

                  {contactsLoading ? (
                    <div className="flex min-h-[180px] items-center justify-center gap-2 text-sm text-slate-400">
                      <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
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
              ) : activeTab === 'home' || activeTab === 'about' || activeTab === 'contact' ? (
                <PageTabPanel
                  key={`${selectedSite.id}-${activeTab}`}
                  siteId={selectedSite.id}
                  page={activeTab}
                  slotIds={
                    activeTab === 'contact'
                      ? undefined
                      : [activeTab === 'home' ? 'hero' : 'about']
                  }
                  searchHint={selectedSite.industry}

                  extra={activeTab === 'home' ? <SiteVideoPanel siteId={selectedSite.id} /> : undefined}
                />
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
              Type just the service name: its descriptions, icon and its own page are written for this business
              automatically. It appears on the home and services pages, the menu and the footer.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleAddService(e)} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Service name</label>
              <input
                type="text"
                required
                autoFocus
                value={serviceForm.title}
                onChange={(e) => setServiceForm((f) => ({ ...f, title: e.target.value }))}
                className={inputClass}
                placeholder="AC Repair"
                disabled={savingService}
              />
            </div>
            <details className="rounded-lg border border-slate-800 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-slate-400">
                Write the text myself (optional; anything left empty is written for you)
              </summary>
              <div className="mt-3 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Short Description
              </label>
              <textarea
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
                value={serviceForm.icon}
                onChange={(e) => setServiceForm((f) => ({ ...f, icon: e.target.value }))}
                className={inputClass}
                placeholder="wrench or car"
                disabled={savingService}
              />
            </div>
              </div>
            </details>
            {savingService ? (
              <p className="text-xs text-slate-400">Writing the service for this business… this takes about 10-20 seconds.</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setServiceDialogOpen(false)}
                disabled={savingService}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingService || !serviceForm.title.trim()}>
                {savingService ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {serviceForm.shortDescription.trim() && serviceForm.fullDescription.trim() && serviceForm.icon.trim()
                  ? 'Add service'
                  : 'Generate & add service'}
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
          className="flex h-[min(92vh,900px)] w-[calc(100%-1rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:w-full"
        >
          <DialogHeader className="shrink-0 border-b border-slate-800/80 px-5 py-4 pr-12 sm:px-6 sm:py-5">
            <DialogTitle className="text-xl sm:text-2xl">Edit {editTarget?.businessName ?? 'site'}</DialogTitle>
            <DialogDescription className="mt-1.5">
              Update business info, theme, status, or regenerate content.
            </DialogDescription>
          </DialogHeader>

          {editTarget ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {editLoading ? (
                <div className="flex flex-1 items-center justify-center text-slate-400">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading site data…
                </div>
              ) : (
                <>
              {editSuccess ? (
                <div className="mx-5 mt-4 shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 sm:mx-6">
                  {editSuccess}
                </div>
              ) : null}

              <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-slate-800/80 px-4 pt-3 sm:gap-2 sm:px-6">
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
                      'rounded-t-lg px-3.5 py-2.5 text-sm font-medium transition-colors',
                      editTab === tab.id
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
              {editTab === 'business' ? (
                <form onSubmit={(e) => void handleSaveBusiness(e)} className="space-y-5">
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-sm leading-relaxed text-amber-200">
                    Changing business name, industry or city will regenerate all page content
                    automatically.
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
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
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">Industry</label>
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
                    <p className="mt-1.5 text-xs text-amber-400/80">
                      Changing industry will regenerate all page content automatically.
                    </p>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">Phone</label>
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
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">Email</label>
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
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      Description
                    </label>
                    <textarea
                      rows={4}
                      value={editData.description || ''}
                      onChange={(e) =>
                        setEditData((prev) => ({ ...prev, description: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
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
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">City</label>
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
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">State</label>
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
                  <div className="grid gap-5 sm:grid-cols-1">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">
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
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">
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
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">
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
                  <OpeningHoursEditor
                    value={editData.openingHours || null}
                    disabled={savingBusiness}
                    onChange={(openingHours) => setEditData((prev) => ({ ...prev, openingHours: openingHours ?? '' }))}
                  />
                  <div className="flex justify-end border-t border-slate-800/80 pt-4">
                    <Button type="submit" disabled={savingBusiness}>
                      {savingBusiness ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Save Business Info
                    </Button>
                  </div>
                </form>
              ) : null}

              {editTab === 'business' && editTarget ? (
                <SiteAddressPanel
                  key={editTarget.id}
                  siteId={editTarget.id}
                  slug={editTarget.slug}
                  siteBaseUrl={SITE_URL}
                  onChanged={(updated) => void refreshAfterEdit(updated, 'Site address changed. Old links now redirect to the new address.')}
                />
              ) : null}

              {editTab === 'business' && editTarget ? (
                <CustomDomainPanel key={`domain-${editTarget.id}`} siteId={editTarget.id} slug={editTarget.slug} siteBaseUrl={SITE_URL} />
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
                    <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs text-slate-300 underline">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={logoUploading || !editTarget}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file || !editTarget) return;
                          setLogoUploading(true);
                          setError(null);
                          try {
                            const url = await uploadSiteImage(editTarget.id, file, 'logo');
                            setEditData((prev) => ({ ...prev, logoUrl: url }));
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Logo upload failed');
                          } finally {
                            setLogoUploading(false);
                          }
                        }}
                      />
                      {logoUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Upload a logo file (then save)
                    </label>
                    <p className="mt-1 text-[11px] text-slate-500">Shown in the site menu, footer and search-engine business details.</p>
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
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Lead destination (GHL location)
                    </label>
                    <select
                      value={editData.leadLocationId ?? ''}
                      onChange={(e) =>
                        setEditData((prev) => ({ ...prev, leadLocationId: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    >
                      <option value="">Not mapped: keep leads in Peakwa and flag them</option>
                      {ghlLocations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.businessName} ({loc.ghlLocationId})
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      Contact-form leads from this site go only to this location.
                    </p>
                  </div>
                  <label className="flex items-start gap-3 rounded-lg border border-slate-800 p-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={editData.searchIndexable === 'true'}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          searchIndexable: e.target.checked ? 'true' : 'false',
                        }))
                      }
                    />
                    <span>
                      <span className="block font-medium text-white">
                        Allow search engines to index this site
                      </span>
                      <span className="block text-xs text-slate-500">
                        Off by default: every page is noindex and left out of sitemaps. Turn on
                        only for a real business whose site is moving to its own domain.
                      </span>
                    </span>
                  </label>
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
        <DialogContent className="max-w-2xl gap-5 sm:p-6">
          <DialogHeader>
            <DialogTitle>Add location pages</DialogTitle>
            <DialogDescription>
              Generate SEO landing pages for cities served by {selectedSite?.businessName}. Use ZIP
              radius to add cities in range, or enter cities manually.
            </DialogDescription>
          </DialogHeader>

          <div
            className="grid w-full grid-cols-2 rounded-lg border border-slate-700/80 bg-slate-950/50 p-1"
            role="tablist"
            aria-label="Location entry mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={locationMode === 'radius'}
              onClick={() => setLocationMode('radius')}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                locationMode === 'radius'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              ZIP + radius
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={locationMode === 'manual'}
              onClick={() => setLocationMode('manual')}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                locationMode === 'manual'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              Manual cities
            </button>
          </div>

          <form onSubmit={handleAddLocationPages} className="space-y-5">
            {locationMode === 'radius' ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">ZIP code</label>
                    <input
                      type="text"
                      required
                      value={radiusZip}
                      onChange={(e) => setRadiusZip(e.target.value)}
                      className={inputClass}
                      placeholder="07030"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">
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
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={previewingTowns || !radiusZip.trim()}
                  onClick={() => void handlePreviewTowns()}
                >
                  {previewingTowns ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Preview towns
                </Button>
                {radiusPreview ? (
                  <div className="max-h-56 overflow-y-auto border-t border-slate-800 pt-3 text-xs">
                    <p className="mb-3 text-slate-400">
                      {radiusPreview.length} real towns in range (ZIP data, nearest first).
                      Generating adds up to 8 new pages per run; towns that already have a page are skipped.
                    </p>
                    <ul className="divide-y divide-slate-800/80">
                      {radiusPreview.map((t) => (
                        <li
                          key={`${t.city}-${t.county}-${t.state}`}
                          className="flex items-baseline justify-between gap-3 py-2"
                        >
                          <span className="min-w-0 text-slate-200">
                            {t.city}, {t.county} County, {t.state}
                          </span>
                          <span className="shrink-0 text-slate-500">
                            {t.miles} mi{t.hasPage ? ' · has page' : ''}
                            {t.isBusinessCity ? ' · business city' : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="max-h-[min(50vh,360px)] overflow-y-auto">
                  <div className="divide-y divide-slate-800/80">
                    {locationRows.map((row, index) => (
                      <div
                        key={index}
                        className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1.4fr_0.9fr_1.1fr_auto]"
                      >
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-xs font-medium text-slate-500">
                            City
                          </label>
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
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-xs font-medium text-slate-500">
                            State
                          </label>
                          <input
                            type="text"
                            value={row.state ?? ''}
                            onChange={(e) => {
                              const next = [...locationRows];
                              next[index] = { ...next[index], state: e.target.value };
                              setLocationRows(next);
                            }}
                            className={inputClass}
                            placeholder={selectedSite?.state || 'Site state'}
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-xs font-medium text-slate-500">
                            County <span className="font-normal text-slate-600">(optional)</span>
                          </label>
                          <input
                            type="text"
                            value={row.county ?? ''}
                            onChange={(e) => {
                              const next = [...locationRows];
                              next[index] = { ...next[index], county: e.target.value };
                              setLocationRows(next);
                            }}
                            className={inputClass}
                            placeholder="Found automatically"
                          />
                        </div>
                        <div className="flex items-end sm:justify-end">
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
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-slate-800 pt-4 sm:flex-row sm:justify-end">
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
