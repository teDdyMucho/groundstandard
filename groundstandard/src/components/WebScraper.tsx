import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowUp, CheckCircle2, ExternalLink, Globe, Loader2, Search, Send, Sparkles } from 'lucide-react';

type WebScraperProps = {
  onBackToLaunch?: () => void;
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type DynamicScraperResult = {
  website: string;
  payload: JsonValue;
  error?: string | null;
};

function isRecord(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatLabel(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPrimitive(value: string | number | boolean | null) {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function collectSearchText(value: JsonValue): string {
  if (value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(collectSearchText).join(' ');
  return Object.entries(value)
    .map(([key, nested]) => `${key} ${collectSearchText(nested)}`)
    .join(' ');
}

function findPrimaryUrl(value: JsonValue): string | null {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPrimaryUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (isRecord(value)) {
    const prioritizedKeys = ['website', 'url', 'link', 'page_url', 'pageUrl', 'source_url', 'sourceUrl'];
    for (const key of prioritizedKeys) {
      const candidate = value[key];
      if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) return candidate;
    }
    for (const nested of Object.values(value)) {
      const found = findPrimaryUrl(nested);
      if (found) return found;
    }
  }
  return null;
}

function findSummaryEntries(value: JsonValue): Array<{ label: string; value: string }> {
  if (!isRecord(value)) return [];
  const preferredKeys = ['likely_new_business', 'estimated_age', 'founding_year', 'confidence', 'reason', 'status', 'result', 'message'];
  const entries: Array<{ label: string; value: string }> = [];

  for (const key of preferredKeys) {
    const raw = value[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      entries.push({ label: formatLabel(key), value: formatPrimitive(raw) });
    }
  }

  if (entries.length > 0) return entries;

  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      entries.push({ label: formatLabel(key), value: formatPrimitive(raw) });
    }
    if (entries.length >= 4) break;
  }

  return entries;
}

function RenderJsonValue({ label, value, depth = 0 }: { label?: string; value: JsonValue; depth?: number }) {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const isLink = typeof value === 'string' && /^https?:\/\//i.test(value);

    return (
      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
        {label && <div className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500 mb-2">{formatLabel(label)}</div>}
        {isLink ? (
          <a href={String(value)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 break-all hover:underline">
            <span>{String(value)}</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </a>
        ) : (
          <div className="text-sm text-gray-800 break-words whitespace-pre-wrap">{formatPrimitive(value)}</div>
        )}
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        {label && <div className="px-4 py-3 border-b border-gray-100 text-[11px] font-extrabold uppercase tracking-wider text-gray-500 bg-slate-50">{formatLabel(label)}</div>}
        <div className="p-4 space-y-3">
          {value.length === 0 ? (
            <div className="text-sm text-gray-500">Empty list</div>
          ) : (
            value.map((item, index) => (
              <div key={`${label ?? 'item'}-${index}`} className={`${depth > 1 ? '' : 'rounded-2xl border border-gray-100 bg-slate-50/60'} p-3`}>
                <RenderJsonValue value={item} depth={depth + 1} />
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  const entries = Object.entries(value);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {label && <div className="px-4 py-3 border-b border-gray-100 text-[11px] font-extrabold uppercase tracking-wider text-gray-500 bg-slate-50">{formatLabel(label)}</div>}
      <div className="p-4 grid grid-cols-1 xl:grid-cols-2 gap-3">
        {entries.length === 0 ? (
          <div className="text-sm text-gray-500">No fields</div>
        ) : (
          entries.map(([key, nested]) => <RenderJsonValue key={key} label={key} value={nested} depth={depth + 1} />)
        )}
      </div>
    </div>
  );
}

export default function WebScraper({ onBackToLaunch }: WebScraperProps) {
  const [query, setQuery] = useState('');
  const [websiteInput, setWebsiteInput] = useState('https://growproagency.com');
  const [results, setResults] = useState<DynamicScraperResult[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'overview' | 'details' | 'raw'>('overview');
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener('scroll', onScroll);
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const normalizeWebsite = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const submittedWebsiteCount = useMemo(
    () =>
      websiteInput
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean).length,
    [websiteInput],
  );

  const filteredResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return results;
    return results.filter((row) =>
      `${row.website} ${row.error ?? ''} ${collectSearchText(row.payload)}`.toLowerCase().includes(normalized),
    );
  }, [query, results]);

  const selectedResult = filteredResults[selectedResultIndex] ?? filteredResults[0] ?? null;

  const handleSubmit = async () => {
    const websites = websiteInput
      .split(/\r?\n|,/)
      .map(normalizeWebsite)
      .filter(Boolean);

    if (!websites.length) {
      setSubmitError('Please enter at least one website.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const responses = await Promise.all(
        websites.map(async (website) => {
          const response = await fetch('/api/scrapper', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ website }),
          });

          const text = await response.text();
          let parsed: JsonValue;

          try {
            parsed = text ? (JSON.parse(text) as JsonValue) : null;
          } catch {
            parsed = { raw_output: text || 'Empty response' };
          }

          if (!response.ok) {
            return {
              website,
              payload: parsed,
              error: `Request failed with status ${response.status}`,
            };
          }

          return {
            website,
            payload: parsed,
            error: null,
          };
        }),
      );

      setResults(responses);
      setSelectedResultIndex(0);
      setActiveTab('overview');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to call scraper webhook.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDateTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-blue-200/30 blur-3xl" />
        <div className="absolute top-32 -right-56 h-[520px] w-[520px] rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="absolute -bottom-48 left-1/3 h-[520px] w-[520px] rounded-full bg-rose-200/20 blur-3xl" />
      </div>

      <div className="sticky top-0 z-40 border-b border-gray-200/60 bg-white/70 backdrop-blur-sm">
        <div className="w-full px-4 sm:px-6 lg:px-10">
          <div className="flex justify-between items-center py-4 gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded-2xl flex items-center justify-center shadow-md">
                <Globe className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-gray-900">Web Scraper</h1>
                <p className="text-sm text-gray-600">Submit any website to your n8n workflow and review dynamic webhook responses with a cleaner layout</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onBackToLaunch && (
                <button
                  type="button"
                  onClick={onBackToLaunch}
                  className="inline-flex items-center px-4 py-2.5 text-sm font-semibold text-gray-800 bg-white/90 hover:bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="relative w-full px-4 sm:px-6 lg:px-10 py-10">
        <div className="grid grid-cols-1 xl:grid-cols-[400px_minmax(0,1fr)] gap-6">
          <div className="space-y-6">
            <div className="rounded-3xl border border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-[0_30px_80px_-30px_rgba(15,23,42,0.18)] overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-violet-600/5 via-transparent to-fuchsia-600/5">
                <div className="text-lg font-extrabold text-gray-900">Website Input</div>
                <div className="text-sm text-gray-600">Add one website per line or separate multiple websites with commas</div>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Websites</label>
                  <textarea
                    value={websiteInput}
                    onChange={(e) => setWebsiteInput(e.target.value)}
                    rows={10}
                    placeholder={'https://growproagency.com\nhttps://example.com'}
                    className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 bg-white text-gray-900 placeholder:text-gray-400 text-sm shadow-sm resize-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full inline-flex items-center justify-center px-5 py-3 text-sm font-extrabold rounded-2xl text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending to Webhook...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Analyze Websites
                    </>
                  )}
                </button>
                {submitError && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                    {submitError}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-[0_30px_80px_-30px_rgba(15,23,42,0.18)] overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-emerald-600/5 via-transparent to-cyan-600/5 flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-emerald-600" />
                <div>
                  <div className="text-lg font-extrabold text-gray-900">Run Summary</div>
                  <div className="text-sm text-gray-600">Adaptive rendering for any webhook response shape</div>
                </div>
              </div>
              <div className="p-6 grid grid-cols-1 gap-4">
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Webhook Route</div>
                  <div className="mt-2 text-sm font-bold text-gray-900 break-all">/api/scrapper</div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Submitted Websites</div>
                  <div className="mt-2 text-2xl font-black text-gray-900">{submittedWebsiteCount}</div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Results Rendered</div>
                  <div className="mt-2 text-2xl font-black text-gray-900">{filteredResults.length}</div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Status</div>
                  <div className="mt-2 text-sm font-bold text-gray-900">{isSubmitting ? 'Running webhook...' : 'Ready'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-[0_30px_80px_-30px_rgba(15,23,42,0.18)] overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-blue-600/5 via-transparent to-rose-600/5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-lg font-extrabold text-gray-900">Webhook Responses</div>
                    <div className="text-sm text-gray-600">Each website gets its own polished result card based on the actual returned data</div>
                  </div>
                  <div className="w-full max-w-md">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="w-4 h-4 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search websites, fields, and values..."
                        className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 bg-white text-gray-900 placeholder:text-gray-400 text-sm shadow-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {filteredResults.length === 0 ? (
                  <div className="rounded-3xl border border-gray-200/70 bg-white/95 px-4 py-10 text-center text-sm text-gray-500">
                    No results yet. Submit one or more websites to the webhook.
                  </div>
                ) : (
                  <>
                    <div className="rounded-3xl border border-gray-200/70 bg-slate-50/80 p-3">
                      <div className="flex gap-3 overflow-x-auto pb-1">
                        {filteredResults.map((row, index) => (
                          <button
                            key={`${row.website}-${index}`}
                            type="button"
                            onClick={() => {
                              setSelectedResultIndex(index);
                              setActiveTab('overview');
                            }}
                            className={`min-w-[220px] rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${
                              selectedResultIndex === index
                                ? 'border-blue-300 bg-white shadow-sm'
                                : 'border-gray-200 bg-white/70 hover:bg-white hover:border-blue-200'
                            }`}
                          >
                            <div className="text-sm font-extrabold text-gray-900 truncate">{row.website}</div>
                            <div className="mt-1 text-xs text-gray-600 truncate">{findPrimaryUrl(row.payload) || 'Webhook response ready'}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {selectedResult && (
                      <div className="rounded-3xl border border-gray-200/70 bg-white/95 shadow-sm overflow-hidden">
                        <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-emerald-600/5 via-transparent to-cyan-600/5 flex items-start justify-between gap-4 flex-wrap">
                          <div className="flex items-start gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-sm">
                              <Globe className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <div className="text-lg font-extrabold text-gray-900 break-all">{selectedResult.website}</div>
                              <div className="text-sm text-gray-600 break-all">{findPrimaryUrl(selectedResult.payload) || 'Dynamic webhook payload view'}</div>
                            </div>
                          </div>
                          {selectedResult.error ? (
                            <div className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
                              Error Response
                            </div>
                          ) : (
                            <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                              Webhook Loaded
                            </div>
                          )}
                        </div>

                        <div className="px-6 pt-5">
                          <div className="flex gap-2 flex-wrap border-b border-gray-100">
                            {[
                              { id: 'overview', label: 'Overview' },
                              { id: 'details', label: 'Details' },
                              { id: 'raw', label: 'Raw Data' },
                            ].map((tab) => (
                              <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id as 'overview' | 'details' | 'raw')}
                                className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${
                                  activeTab === tab.id
                                    ? 'border-blue-600 text-blue-700'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="p-6">
                          {selectedResult.error ? (
                            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm font-semibold text-red-700">
                              {selectedResult.error}
                            </div>
                          ) : activeTab === 'overview' ? (
                            <div className="space-y-5">
                              {findSummaryEntries(selectedResult.payload).length > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                                  {findSummaryEntries(selectedResult.payload).map((entry) => (
                                    <div key={entry.label} className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
                                      <div className="text-xs font-bold uppercase tracking-wider text-gray-500">{entry.label}</div>
                                      <div className="mt-2 text-sm font-bold text-gray-900 break-words">{entry.value}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="rounded-3xl border border-gray-200 bg-slate-50/50 p-4">
                                <RenderJsonValue value={selectedResult.payload} />
                              </div>
                            </div>
                          ) : activeTab === 'details' ? (
                            <div className="rounded-3xl border border-gray-200 bg-slate-50/50 p-4">
                              <RenderJsonValue value={selectedResult.payload} />
                            </div>
                          ) : (
                            <div className="rounded-3xl border border-gray-200 bg-slate-950 text-slate-100 overflow-hidden">
                              <div className="px-4 py-3 border-b border-slate-800 text-xs font-bold uppercase tracking-wider text-slate-400">
                                Raw JSON Payload
                              </div>
                              <pre className="p-4 text-xs sm:text-sm overflow-auto whitespace-pre-wrap break-words">
                                {JSON.stringify(selectedResult.payload, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200/60 bg-white/80 backdrop-blur-sm shadow-[0_30px_80px_-30px_rgba(15,23,42,0.18)] overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-emerald-600/5 via-transparent to-cyan-600/5 flex items-center gap-3">
                <Globe className="w-5 h-5 text-emerald-600" />
                <div>
                  <div className="text-lg font-extrabold text-gray-900">Viewer Notes</div>
                  <div className="text-sm text-gray-600">Tabbed pages make each website feel like a separate system view inside the same project template</div>
                </div>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
                    <div>
                      <div className="text-sm font-extrabold text-gray-900">Tab-style website view</div>
                      <div className="mt-1 text-sm text-gray-600">Pick a website from the top result tabs, then switch between overview, details, and raw data</div>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                    <div>
                      <div className="text-sm font-extrabold text-gray-900">Dynamic response-safe</div>
                      <div className="mt-1 text-sm text-gray-600">No fixed schema is required. The renderer adapts automatically to the webhook output per website</div>
                    </div>
                  </div>
                </div>
                {results.length > 0 && (
                  <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 md:col-span-2">
                    <div className="text-sm font-extrabold text-gray-900">Latest refresh</div>
                    <div className="mt-1 text-sm text-gray-600">{formatDateTime(new Date().toISOString())}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-40 inline-flex items-center justify-center w-12 h-12 rounded-full text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl transition-all duration-200"
          aria-label="Back to top"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
