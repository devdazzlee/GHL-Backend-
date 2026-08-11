export type SeoContent = { title?: string; metaDescription?: string };

/** Bottom-of-page keyword SEO block (generated on every marketing page). */
export type SeoExtraContent = {
  heading?: string;
  paragraphs?: string[];
  links?: Array<{ label?: string; href?: string }>;
  faqs?: Array<{ question?: string; answer?: string }>;
};

export type HomeContent = {
  hero?: { heading?: string; subheading?: string; ctaButton?: string };
  about?: { heading?: string; paragraph1?: string; paragraph2?: string };
  services?: Array<{ title?: string; description?: string; icon?: string }>;
  whyChooseUs?: Array<{ point?: string; detail?: string }>;
  cta?: { heading?: string; subtext?: string; buttonText?: string };
  seoExtra?: SeoExtraContent;
  seo?: SeoContent;
};

export type AboutContent = {
  hero?: { heading?: string; subheading?: string };
  story?: { heading?: string; paragraph1?: string; paragraph2?: string };
  team?: { heading?: string; description?: string };
  mission?: { heading?: string; statement?: string };
  values?: Array<{ title?: string; description?: string }>;
  seoExtra?: SeoExtraContent;
  seo?: SeoContent;
};

export type ServicesContent = {
  hero?: { heading?: string; subheading?: string };
  intro?: string;
  services?: Array<{
    title?: string;
    shortDescription?: string;
    fullDescription?: string;
    icon?: string;
  }>;
  cta?: { heading?: string; buttonText?: string };
  seoExtra?: SeoExtraContent;
  seo?: SeoContent;
};

export type ContactContent = {
  hero?: { heading?: string; subheading?: string };
  intro?: string;
  formHeading?: string;
  addressSection?: { heading?: string };
  hoursSection?: { heading?: string; description?: string };
  seoExtra?: SeoExtraContent;
  seo?: SeoContent;
};

export type BlogSubsection = { heading?: string; paragraphs?: string[] };

export type BlogSection = {
  heading?: string;
  paragraphs?: string[];
  subsections?: BlogSubsection[];
};

export type BlogFaq = { question?: string; answer?: string };

export type BlogInternalLink = { label?: string; path?: string };

export type BlogPost = {
  title?: string;
  excerpt?: string;
  /** Legacy flat body for posts generated before the structured format. */
  content?: string;
  category?: string;
  readTime?: string;
  introduction?: string;
  sections?: BlogSection[];
  conclusion?: string;
  faqs?: BlogFaq[];
  internalLinks?: BlogInternalLink[];
  seo?: SeoContent;
};

export type BlogContent = {
  posts?: BlogPost[];
  seoExtra?: SeoExtraContent;
  seo?: SeoContent;
};

export type LocationContent = {
  hero?: { heading?: string; subheading?: string };
  localIntro?: string;
  whyLocal?: string;
  serviceArea?: string;
  cta?: { heading?: string; buttonText?: string };
  seoExtra?: SeoExtraContent;
  seo?: SeoContent;
};

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}
