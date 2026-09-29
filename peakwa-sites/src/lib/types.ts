export type SiteTheme = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  heroStyle: 'dark' | 'light';
  fontStyle: 'modern' | 'classic' | 'friendly';
};

export type GeneratedSite = {
  id: string;
  businessName: string;
  industry: string;
  city: string;
  state: string;
  phone: string | null;
  email: string | null;
  description: string | null;
  slug: string;
  homeContent: string | null;
  aboutContent: string | null;
  servicesContent: string | null;
  contactContent: string | null;
  blogContent: string | null;
  /** false = the whole blog is hidden (pages, links, sitemap). Null/true = shown. */
  blogEnabled?: boolean | null;
  status: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  heroStyle: string;
  fontStyle: string;
  designVariant?: number;
  yearsInBusiness?: string | null;
  customersServed?: string | null;
  projectsCompleted?: string | null;
  theme: SiteTheme;
  locationPages?: LocationPage[];
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  /** Only true when switched on in the dashboard; otherwise noindex. */
  searchIndexable?: boolean | null;
  /** The site's own domain; links move to it only once customDomainVerifiedAt is set. */
  customDomain?: string | null;
  customDomainVerifiedAt?: string | null;
};

export type LocationPage = {
  id: string;
  city: string;
  county: string;
  state: string;
  slug: string;
  content: string | null;
  imageUrl: string | null;
};

/** A published keyword + city page, as listed for links and the sitemap. */
export type KeywordPageSummary = {
  slug: string;
  keyword: string;
  title: string;
  locationPageId: string;
  publishedAt: string | null;
  locationPage: { slug: string; city: string };
};

export type KeywordPageContent = {
  seo?: { title?: string; metaDescription?: string };
  h1?: string;
  intro?: string;
  sections?: Array<{ heading?: string; paragraphs?: string[] }>;
  localNotes?: string[];
  faqs?: Array<{ question?: string; answer?: string }>;
  ctaHeading?: string;
  ctaText?: string;
};

export type KeywordPageDetail = {
  slug: string;
  keyword: string;
  publishedAt: string | null;
  content: KeywordPageContent;
  locationPage: { slug: string; city: string; county: string; state: string };
};

export type BlogPostSummary = {
  slug: string;
  title: string;
  excerpt: string | null;
  imageUrl: string | null;
  category: string | null;
  readTime: string;
  publishedAt: string | null;
  updatedAt: string | null;
  /** Position in the site's original posts: old /blog/{n} URLs redirect to this post. */
  legacyIndex: number | null;
};

/** managed=false: the site's blog has never been managed; use the posts in blogContent. */
export type PublishedBlog = {
  enabled: boolean;
  managed: boolean;
  posts: BlogPostSummary[];
};

export type PublishedBlogPost = {
  slug: string;
  title: string;
  excerpt: string | null;
  /** Markdown subset, see lib/blogMarkdown.ts */
  body: string;
  faqs: Array<{ question?: string; answer?: string }>;
  links: Array<{ label?: string; path?: string }>;
  imageUrl: string | null;
  category: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  readTime: string;
  publishedAt: string | null;
  updatedAt: string | null;
  related: Array<{ slug: string; title: string }>;
};
