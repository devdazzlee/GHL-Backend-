import type { GeneratedSite, LocationPage } from '@/src/lib/types';
import type {
  AboutContent,
  BlogContent,
  ContactContent,
  HomeContent,
  ServicesContent,
} from '@/src/lib/content';

/** Fixed sample business used for design catalog previews. */
export function buildDesignPreviewSite(designVariant: number): GeneratedSite {
  return {
    id: `design-preview-${designVariant}`,
    businessName: 'Summit Home Services',
    industry: 'Home Services',
    city: 'Austin',
    state: 'TX',
    phone: '(512) 555-0142',
    email: 'hello@summithome.example',
    description:
      'Summit Home Services is a locally owned team helping Austin homeowners with reliable repairs, upgrades, and seasonal maintenance.',
    slug: `design-preview/${designVariant}`,
    homeContent: null,
    aboutContent: null,
    servicesContent: null,
    contactContent: null,
    blogContent: null,
    status: 'ACTIVE',
    primaryColor: '#0f4c81',
    secondaryColor: '#f4f7fb',
    accentColor: '#e8a838',
    heroStyle: 'dark',
    fontStyle: 'modern',
    designVariant,
    yearsInBusiness: '12',
    customersServed: '2,400+',
    projectsCompleted: '3,100',
    theme: {
      primaryColor: '#0f4c81',
      secondaryColor: '#f4f7fb',
      accentColor: '#e8a838',
      heroStyle: 'dark',
      fontStyle: 'modern',
    },
    facebookUrl: 'https://facebook.com',
    instagramUrl: 'https://instagram.com',
    websiteUrl: 'https://x.com',
  };
}

export const DESIGN_PREVIEW_HOME: HomeContent = {
  hero: {
    heading: 'Trusted home care for Austin families',
    subheading:
      'From quick fixes to full-home upgrades — local technicians, clear pricing, and workmanship you can count on.',
    ctaButton: 'Get a Free Quote',
  },
  about: {
    heading: 'About Summit Home Services',
    paragraph1:
      'We started as a small neighborhood crew and grew into Austin’s go-to team for dependable home services. Every job is handled by trained pros who treat your house like their own.',
    paragraph2:
      'Today we help homeowners across Central Texas with plumbing, electrical, HVAC, and general repair — always with clear communication and clean workmanship.',
  },
  services: [
    {
      title: 'Plumbing Repair',
      description: 'Leak fixes, fixture installs, and drain clearing with same-week availability.',
      icon: 'wrench',
    },
    {
      title: 'Electrical Upgrades',
      description: 'Panel work, lighting, and safety checks for modern homes.',
      icon: 'zap',
    },
    {
      title: 'HVAC Tune-Ups',
      description: 'Seasonal maintenance to keep comfort systems running efficiently.',
      icon: 'flame',
    },
    {
      title: 'General Handyman',
      description: 'Mounting, patching, and punch-list projects done right the first time.',
      icon: 'tools',
    },
    {
      title: 'Water Heater Service',
      description: 'Repair and replacement for tank and tankless systems.',
      icon: 'droplets',
    },
    {
      title: 'Home Inspection Prep',
      description: 'Pre-sale fixes that help listings close with fewer surprises.',
      icon: 'home',
    },
  ],
  whyChooseUs: [
    {
      point: 'Local & accountable',
      detail: 'Austin-based crew with clear communication from quote to completion.',
    },
    {
      point: 'Upfront pricing',
      detail: 'Written estimates before work starts — no surprise invoices.',
    },
    {
      point: 'Quality materials',
      detail: 'We use durable parts and finish every job clean.',
    },
    {
      point: 'Flexible scheduling',
      detail: 'Evening and weekend windows when you need them.',
    },
  ],
  cta: {
    heading: 'Ready to book your project?',
    subtext: 'Tell us what you need and we’ll confirm a visit within one business day.',
    buttonText: 'Request Service',
  },
};

export const DESIGN_PREVIEW_ABOUT: AboutContent = {
  hero: {
    heading: 'About Summit Home Services',
    subheading: 'A local Austin team built on reliability, respect, and craftsmanship.',
  },
  story: {
    heading: 'Our Story',
    paragraph1:
      'We started as a small neighborhood crew and grew into Austin’s go-to team for dependable home services. Every job is handled by trained pros who treat your house like their own.',
    paragraph2:
      'From first calls to final walkthroughs, we keep homeowners informed and projects on schedule — so you always know what’s happening and why.',
  },
  mission: {
    heading: 'Our Mission',
    statement:
      'Deliver honest, high-quality home services that protect the places where Austin families live and gather.',
  },
  values: [
    {
      title: 'Integrity',
      description: 'We recommend only the work your home actually needs — nothing padded, nothing rushed.',
    },
    {
      title: 'Craftsmanship',
      description: 'Clean finishes, durable materials, and careful attention to the details that last.',
    },
    {
      title: 'Respect',
      description: 'We protect floors, explain options clearly, and leave every job site tidy.',
    },
  ],
  team: {
    heading: 'Meet the Team',
    description:
      'Licensed technicians, friendly coordinators, and local leadership focused on getting the job done right the first time.',
  },
};

export const DESIGN_PREVIEW_SERVICES: ServicesContent = {
  hero: {
    heading: 'Our Services',
    subheading: 'Complete home-care coverage for Austin and nearby communities.',
  },
  intro:
    'Whether you need a quick repair or a full upgrade, Summit Home Services brings trained technicians, clear estimates, and reliable scheduling to every job.',
  services: (DESIGN_PREVIEW_HOME.services ?? []).map((s) => ({
    title: s.title,
    shortDescription: s.description,
    fullDescription: `${s.description} Our technicians arrive prepared, protect your home while they work, and walk you through what was done before they leave.`,
    icon: s.icon,
  })),
  cta: {
    heading: 'Need help choosing a service?',
    buttonText: 'Talk to our team',
  },
};

export const DESIGN_PREVIEW_CONTACT: ContactContent = {
  hero: {
    heading: 'Contact Us',
    subheading: 'Tell us what you need — we usually respond within one business day.',
  },
  intro: 'Call, email, or send a message. We’re happy to help Austin homeowners plan the next project.',
  formHeading: 'Send us a message',
  addressSection: {
    heading: 'Serving Austin, TX and surrounding cities',
  },
  hoursSection: {
    heading: 'Hours',
    description: 'Mon–Sat 8:00 AM – 6:00 PM · Emergency requests prioritized when capacity allows.',
  },
};

export const DESIGN_PREVIEW_BLOG: BlogContent = {
  posts: [
    {
      title: 'Spring home maintenance checklist for Austin homeowners',
      excerpt: 'Simple seasonal tasks that prevent costly repairs later in the year.',
      category: 'Maintenance',
      readTime: '4 min',
      introduction:
        'A short spring checklist helps catch small issues before Texas heat turns them into emergencies.',
    },
    {
      title: 'When to call a pro vs DIY for common household fixes',
      excerpt: 'Know which projects are safe to tackle yourself — and which need a technician.',
      category: 'Tips',
      readTime: '5 min',
      introduction:
        'Some jobs are weekend-friendly. Others can create safety or warranty risks if done incorrectly.',
    },
    {
      title: 'How upfront pricing helps you plan home service work',
      excerpt: 'Clear estimates remove surprises and keep projects on schedule.',
      category: 'Planning',
      readTime: '3 min',
      introduction:
        'Written estimates make it easier to compare options and schedule work around your family’s calendar.',
    },
    {
      title: 'Signs your water heater needs service soon',
      excerpt: 'Unusual noises, longer recovery times, and rusty water are early warning signs.',
      category: 'Plumbing',
      readTime: '4 min',
      introduction:
        'Catching water heater issues early can prevent flooding and unexpected cold showers.',
    },
  ],
};

export type PreviewServiceDetail = {
  overview: string;
  process: Array<{ step: string; description: string }>;
  benefits: Array<{ title: string; description: string }>;
  faqs: Array<{ question: string; answer: string }>;
  whyUs: string;
};

export const DESIGN_PREVIEW_SERVICE_DETAIL: PreviewServiceDetail = {
  overview:
    'This service is delivered by trained Summit technicians with clear pricing, careful job-site protection, and a final walkthrough so you know exactly what was completed.',
  process: [
    {
      step: 'Share what you need',
      description: 'Call or message us with the issue, preferred timing, and any photos that help.',
    },
    {
      step: 'Get a clear plan',
      description: 'We confirm scope, provide an estimate, and schedule a convenient visit window.',
    },
    {
      step: 'We complete the work',
      description: 'Technicians finish the job cleanly, answer questions, and leave your space tidy.',
    },
  ],
  benefits: [
    {
      title: 'Local response',
      description: 'Austin-area technicians familiar with local homes and codes.',
    },
    {
      title: 'Transparent estimates',
      description: 'Know the plan and pricing before work begins.',
    },
    {
      title: 'Clean job sites',
      description: 'We protect floors and clean up before we leave.',
    },
  ],
  faqs: [
    {
      question: 'How soon can you schedule this service?',
      answer: 'Most jobs are scheduled within 2–3 business days, with faster options when capacity allows.',
    },
    {
      question: 'Do you provide a written estimate?',
      answer: 'Yes. You’ll receive a clear estimate before we start so there are no surprises.',
    },
    {
      question: 'Are technicians background-checked?',
      answer: 'Yes. Every Summit technician completes screening and ongoing training.',
    },
  ],
  whyUs:
    'Homeowners choose Summit for dependable scheduling, respectful technicians, and workmanship that holds up long after the visit.',
};

function locationPayload(city: string, subheading: string) {
  return JSON.stringify({
    heroHeading: `Home Services in ${city}`,
    heroSubheading: subheading,
    localIntro: `${city} homeowners trust Summit Home Services for plumbing, electrical, HVAC, and handyman work with clear communication from quote to completion.`,
    whyLocal: `We know ${city} neighborhoods, common home styles, and how to schedule around busy local families.`,
    serviceArea: `We regularly serve ${city} and nearby communities across Central Texas.`,
    localStats: {
      yearsServing: '12',
      customersServed: '2,400+',
      responseTime: 'Same-week',
    },
    process: [
      { step: 'Contact us', description: `Tell us what ${city} home project you need help with.` },
      { step: 'We assess', description: 'We confirm scope, timing, and a clear estimate.' },
      { step: 'We deliver', description: 'Local technicians complete the work and follow up.' },
    ],
    faqs: [
      {
        question: `Do you serve all of ${city}?`,
        answer: `Yes. We serve ${city} neighborhoods and surrounding areas throughout the week.`,
      },
      {
        question: 'Can I get an estimate before booking?',
        answer: 'Absolutely — we provide written estimates before work begins.',
      },
    ],
    cta: {
      heading: `Need service in ${city}?`,
      buttonText: 'Request a visit',
    },
  });
}

export const DESIGN_PREVIEW_LOCATIONS: LocationPage[] = [
  {
    id: 'loc-1',
    city: 'Round Rock',
    county: 'Williamson',
    state: 'TX',
    slug: 'round-rock',
    content: locationPayload('Round Rock', 'Reliable home services for Round Rock neighborhoods.'),
    imageUrl:
      'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
  {
    id: 'loc-2',
    city: 'Cedar Park',
    county: 'Williamson',
    state: 'TX',
    slug: 'cedar-park',
    content: locationPayload('Cedar Park', 'Fast local response across Cedar Park.'),
    imageUrl:
      'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
  {
    id: 'loc-3',
    city: 'Georgetown',
    county: 'Williamson',
    state: 'TX',
    slug: 'georgetown',
    content: locationPayload('Georgetown', 'Trusted technicians serving Georgetown homes.'),
    imageUrl:
      'https://images.pexels.com/photos/259588/pexels-photo-259588.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
];

export const DESIGN_PREVIEW_IMAGES = {
  hero:
    'https://images.pexels.com/photos/5691622/pexels-photo-5691622.jpeg?auto=compress&cs=tinysrgb&w=1600',
  about:
    'https://images.pexels.com/photos/6474471/pexels-photo-6474471.jpeg?auto=compress&cs=tinysrgb&w=1200',
  blog: [
    'https://images.pexels.com/photos/4246120/pexels-photo-4246120.jpeg?auto=compress&cs=tinysrgb&w=1000',
    'https://images.pexels.com/photos/5691633/pexels-photo-5691633.jpeg?auto=compress&cs=tinysrgb&w=1000',
    'https://images.pexels.com/photos/5691606/pexels-photo-5691606.jpeg?auto=compress&cs=tinysrgb&w=1000',
    'https://images.pexels.com/photos/4489749/pexels-photo-4489749.jpeg?auto=compress&cs=tinysrgb&w=1000',
  ],
  services: [
    'https://images.pexels.com/photos/8486915/pexels-photo-8486915.jpeg?auto=compress&cs=tinysrgb&w=800',
    'https://images.pexels.com/photos/5691659/pexels-photo-5691659.jpeg?auto=compress&cs=tinysrgb&w=800',
    'https://images.pexels.com/photos/4489749/pexels-photo-4489749.jpeg?auto=compress&cs=tinysrgb&w=800',
    'https://images.pexels.com/photos/5691633/pexels-photo-5691633.jpeg?auto=compress&cs=tinysrgb&w=800',
    'https://images.pexels.com/photos/5691606/pexels-photo-5691606.jpeg?auto=compress&cs=tinysrgb&w=800',
    'https://images.pexels.com/photos/5691641/pexels-photo-5691641.jpeg?auto=compress&cs=tinysrgb&w=800',
  ],
};
