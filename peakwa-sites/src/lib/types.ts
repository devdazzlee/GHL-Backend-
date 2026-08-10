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
