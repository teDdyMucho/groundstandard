export type ScrapeTarget = {
  id: string;
  name: string;
  url: string;
  status: 'ready' | 'queued' | 'running';
  pagesDiscovered: number;
  lastRun: string;
};

export type ScrapeResultRow = {
  id: string;
  pageTitle: string;
  pageUrl: string;
  metaDescription: string;
  statusCode: number;
  wordCount: number;
  updatedAt: string;
};

export type ScrapeActivity = {
  id: string;
  label: string;
  detail: string;
  createdAt: string;
  state: 'completed' | 'running' | 'queued';
};

export const mockScrapeTargets: ScrapeTarget[] = [
  {
    id: 'target-1',
    name: 'Jiu Jitsu Hub',
    url: 'https://jiujitsuhub.net',
    status: 'ready',
    pagesDiscovered: 24,
    lastRun: '2026-03-16T09:20:00.000Z',
  },
  {
    id: 'target-2',
    name: 'Paragon Simi Valley',
    url: 'https://www.paragonsimivalley.com',
    status: 'queued',
    pagesDiscovered: 18,
    lastRun: '2026-03-16T08:05:00.000Z',
  },
  {
    id: 'target-3',
    name: 'Ground Standard Demo',
    url: 'https://groundstandard.netlify.app',
    status: 'running',
    pagesDiscovered: 31,
    lastRun: '2026-03-16T10:10:00.000Z',
  },
];

export const mockScrapeResults: ScrapeResultRow[] = [
  {
    id: 'row-1',
    pageTitle: 'Homepage',
    pageUrl: 'https://jiujitsuhub.net/',
    metaDescription: 'High-converting jiu jitsu homepage with membership CTA.',
    statusCode: 200,
    wordCount: 814,
    updatedAt: '2026-03-16T09:18:00.000Z',
  },
  {
    id: 'row-2',
    pageTitle: 'Programs',
    pageUrl: 'https://jiujitsuhub.net/programs',
    metaDescription: 'Program overview for adults, kids, and beginners.',
    statusCode: 200,
    wordCount: 1122,
    updatedAt: '2026-03-16T09:14:00.000Z',
  },
  {
    id: 'row-3',
    pageTitle: 'Pricing',
    pageUrl: 'https://jiujitsuhub.net/prices',
    metaDescription: 'Pricing page with intro offer and lead capture form.',
    statusCode: 200,
    wordCount: 679,
    updatedAt: '2026-03-16T09:08:00.000Z',
  },
  {
    id: 'row-4',
    pageTitle: 'Contact',
    pageUrl: 'https://jiujitsuhub.net/contact',
    metaDescription: 'Contact page with address, map, and inquiry form.',
    statusCode: 200,
    wordCount: 421,
    updatedAt: '2026-03-16T09:02:00.000Z',
  },
];

export const mockScrapeActivity: ScrapeActivity[] = [
  {
    id: 'activity-1',
    label: 'Queue website crawl',
    detail: 'Preparing website targets and validating robots rules.',
    createdAt: '2026-03-16T10:03:00.000Z',
    state: 'completed',
  },
  {
    id: 'activity-2',
    label: 'Fetch live page HTML',
    detail: 'Mock fetch of homepage, pricing, and program URLs.',
    createdAt: '2026-03-16T10:08:00.000Z',
    state: 'running',
  },
  {
    id: 'activity-3',
    label: 'Normalize extracted metadata',
    detail: 'Preparing output schema for title, description, status code, and word count.',
    createdAt: '2026-03-16T10:11:00.000Z',
    state: 'queued',
  },
];
