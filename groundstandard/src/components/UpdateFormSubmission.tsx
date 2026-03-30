import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUp, RefreshCw, Search, Globe, Clock, ExternalLink, ChevronRight, Send, ArrowRight, Users, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';

type UpdateFormSubmissionProps = {
  onBackToLaunch?: () => void;
};

type FormRow = {
  id: number;
  source_hostname: string | null;
  source_url: string | null;
  submitted_at: string | null;
  urls: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  program: string | null;
};

type ParsedUrl = {
  url: string;
  purpose: string;
  trigger: string;
};

type SubmissionEntry = {
  id: number;
  website: string;
  urls: ParsedUrl[];
  submittedAt: string;
  contactName: string;
  email: string | null;
  program: string | null;
};

// Convert raw trigger names to friendly labels
const friendlyTrigger = (raw: string): string => {
  const map: Record<string, string> = {
    'on_form_submit': 'When a form is submitted',
    'on_success_when_program_is_adult_or_both': 'After submission — Adult or Both program',
    'on_success_when_program_is_youth': 'After submission — Youth program',
    'on_success_when_program_is_adult': 'After submission — Adult program',
    'on_success': 'After successful submission',
    'on_error': 'When submission fails',
    'on_redirect': 'Redirect after submission',
  };
  if (map[raw]) return map[raw];
  // Auto-format unknown triggers: on_form_submit → On form submit
  return raw
    .replace(/_/g, ' ')
    .replace(/^on /i, 'When ')
    .replace(/^/, (s) => s.charAt(0).toUpperCase() + s.slice(1));
};

// Convert raw purpose text to cleaner display
const friendlyPurpose = (raw: string): string => {
  if (!raw) return 'Integration webhook';
  // Clean up common patterns
  return raw
    .replace(/—/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
};

// Get a short label for the purpose (for tags/badges)
const purposeLabel = (raw: string): string => {
  const lower = raw.toLowerCase();
  if (lower.includes('highlevel') || lower.includes('crm')) return 'CRM Sync';
  if (lower.includes('redirect') && lower.includes('adult')) return 'Adult Redirect';
  if (lower.includes('redirect') && lower.includes('youth')) return 'Youth Redirect';
  if (lower.includes('redirect')) return 'Redirect';
  if (lower.includes('webhook')) return 'Webhook';
  if (lower.includes('notification') || lower.includes('notify')) return 'Notification';
  if (lower.includes('email')) return 'Email';
  if (lower.includes('sms') || lower.includes('text')) return 'SMS';
  if (raw.length > 25) return raw.slice(0, 22) + '...';
  return raw;
};

// Color scheme per purpose type
const purposeColor = (raw: string): { bg: string; text: string; border: string } => {
  const lower = raw.toLowerCase();
  if (lower.includes('highlevel') || lower.includes('crm')) return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
  if (lower.includes('redirect') && lower.includes('adult')) return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
  if (lower.includes('redirect') && lower.includes('youth')) return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' };
  if (lower.includes('redirect')) return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' };
  return { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' };
};

export default function UpdateFormSubmission({ onBackToLaunch }: UpdateFormSubmissionProps) {
  const [rows, setRows] = useState<FormRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWebsite, setSelectedWebsite] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener('scroll', onScroll);
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('rpc_form_submissions_list');
      if (err) throw err;
      // Filter to only rows that have urls data
      const all = Array.isArray(data) ? (data as FormRow[]) : [];
      setRows(all.filter(r => r.urls && r.urls.trim() !== ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();

    // Realtime subscription — new submissions appear instantly
    const channel = supabase
      .channel('form_submissions_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'form_submissions' }, (payload) => {
        const row = payload.new as FormRow;
        if (row.urls && row.urls.trim() !== '') {
          setRows(prev => [row, ...prev]);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'form_submissions' }, (payload) => {
        const row = payload.new as FormRow;
        setRows(prev => {
          const exists = prev.some(r => r.id === row.id);
          if (row.urls && row.urls.trim() !== '') {
            return exists
              ? prev.map(r => r.id === row.id ? row : r)
              : [row, ...prev];
          }
          // If urls was cleared, remove it
          return exists ? prev.filter(r => r.id !== row.id) : prev;
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'form_submissions' }, (payload) => {
        const old = payload.old as { id: number };
        setRows(prev => prev.filter(r => r.id !== old.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadRows]);

  const normalizeHostname = useCallback((hostname: string) => hostname.replace(/^www\./i, ''), []);

  const getWebsite = useCallback((row: FormRow) => {
    if (row.source_hostname) return normalizeHostname(row.source_hostname);
    if (row.source_url) {
      try { return normalizeHostname(new URL(row.source_url).hostname); } catch { return null; }
    }
    return null;
  }, [normalizeHostname]);

  // Parse each row into a submission entry (1 submission = 1 card with multiple URLs)
  const submissions: SubmissionEntry[] = useMemo(() => {
    const result: SubmissionEntry[] = [];
    for (const row of rows) {
      const website = getWebsite(row) ?? 'Unknown';
      const contactName = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unknown';
      if (!row.urls) continue;
      let parsed: ParsedUrl[] = [];
      try {
        const raw = JSON.parse(row.urls);
        if (Array.isArray(raw)) parsed = raw;
      } catch { continue; }
      if (!parsed.length) continue;
      result.push({
        id: row.id,
        website,
        urls: parsed,
        submittedAt: row.submitted_at ?? '',
        contactName,
        email: row.email,
        program: row.program,
      });
    }
    return result;
  }, [rows, getWebsite]);

  const normalizedSearch = useMemo(() => searchTerm.trim().toLowerCase(), [searchTerm]);

  const websiteGroups = useMemo(() => {
    const map = new Map<string, SubmissionEntry[]>();
    for (const s of submissions) {
      const arr = map.get(s.website) ?? [];
      arr.push(s);
      map.set(s.website, arr);
    }
    const items = Array.from(map.entries()).map(([website, list]) => ({
      website,
      submissions: list,
      count: list.length,
      latestAt: list[0]?.submittedAt ?? '',
      uniqueContacts: new Set(list.map(s => s.email).filter(Boolean)).size,
      uniquePurposes: [...new Set(list.flatMap(s => s.urls.map(u => u.purpose)).filter(Boolean))],
    }));
    items.sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());
    return items;
  }, [submissions]);

  const filteredWebsites = useMemo(() => {
    if (!normalizedSearch) return websiteGroups;
    return websiteGroups.filter((g) => g.website.toLowerCase().includes(normalizedSearch));
  }, [normalizedSearch, websiteGroups]);

  const selectedSubmissions = useMemo(() => {
    if (!selectedWebsite) return [];
    const group = websiteGroups.find((g) => g.website === selectedWebsite);
    if (!group) return [];
    if (!normalizedSearch) return group.submissions;
    return group.submissions.filter(
      (s) => s.contactName.toLowerCase().includes(normalizedSearch) ||
        (s.email || '').toLowerCase().includes(normalizedSearch) ||
        s.urls.some(u => u.url.toLowerCase().includes(normalizedSearch) || u.purpose.toLowerCase().includes(normalizedSearch)),
    );
  }, [selectedWebsite, websiteGroups, normalizedSearch]);

  const formatDateTime = useCallback((value: string | null) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: 'numeric', minute: '2-digit' }).format(d);
  }, []);

  const timeAgo = useCallback((value: string | null) => {
    if (!value) return '';
    const d = new Date(value);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return formatDateTime(value);
  }, [formatDateTime]);

  // Stats for selected website
  const selectedStats = useMemo(() => {
    if (!selectedWebsite) return null;
    const group = websiteGroups.find(g => g.website === selectedWebsite);
    if (!group) return null;
    const contacts = group.uniqueContacts;
    const totalSubmissions = group.submissions.length;
    return { contacts, totalSubmissions };
  }, [selectedWebsite, websiteGroups]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50/40">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-cyan-200/30 blur-3xl" />
        <div className="absolute top-32 -right-56 h-[520px] w-[520px] rounded-full bg-blue-200/30 blur-3xl" />
        <div className="absolute -bottom-48 left-1/3 h-[520px] w-[520px] rounded-full bg-indigo-200/20 blur-3xl" />
      </div>

      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-gray-200/60 bg-white/70 backdrop-blur-sm">
        <div className="w-full px-4 sm:px-6 lg:px-10">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-md">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-gray-900">Form Integrations</h1>
                <p className="text-sm text-gray-600">See where your form submissions are being sent</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={loadRows} disabled={loading}
                className="inline-flex items-center px-4 py-2.5 text-sm font-semibold text-gray-800 bg-white/90 hover:bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              {onBackToLaunch && (
                <button type="button" onClick={onBackToLaunch}
                  className="inline-flex items-center px-4 py-2.5 text-sm font-semibold text-gray-800 bg-white/90 hover:bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="relative w-full px-4 sm:px-6 lg:px-10 py-10">
        <div className="bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-3xl shadow-[0_30px_80px_-30px_rgba(15,23,42,0.18)] overflow-hidden">
          {/* Toolbar */}
          <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-cyan-600/5 via-transparent to-blue-600/5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  {selectedWebsite && (
                    <button type="button" onClick={() => { setSelectedWebsite(null); setSearchTerm(''); }}
                      className="inline-flex items-center px-3 py-2 text-sm font-semibold text-gray-800 bg-white/90 hover:bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200">
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      All Websites
                    </button>
                  )}
                  <div className="text-lg font-extrabold text-gray-900">
                    {selectedWebsite ? (
                      <span className="flex items-center gap-2">
                        <Globe className="w-5 h-5 text-cyan-600" />
                        {selectedWebsite}
                      </span>
                    ) : 'Your Websites'}
                  </div>
                </div>
                <div className="text-sm text-gray-600 mt-0.5">
                  {selectedWebsite && selectedStats
                    ? <>{selectedStats.totalSubmissions} submission{selectedStats.totalSubmissions !== 1 ? 's' : ''} &middot; {selectedStats.contacts} contact{selectedStats.contacts !== 1 ? 's' : ''} captured</>
                    : <>{filteredWebsites.length} website{filteredWebsites.length !== 1 ? 's' : ''} with active integrations</>}
                </div>
              </div>
              <div className="relative min-w-[260px]">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="w-4 h-4 text-gray-400" />
                </div>
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={selectedWebsite ? 'Search integrations...' : 'Search website...'}
                  className="w-full pl-11 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-cyan-500/10 focus:border-cyan-500 bg-white text-gray-900 placeholder:text-gray-400 text-sm transition-all duration-200 shadow-sm" />
              </div>
            </div>
          </div>

          {error && (
            <div className="px-6 pt-5">
              <div className="rounded-2xl border border-red-200/70 bg-red-50/80 px-4 py-3 text-sm font-semibold text-red-800">{error}</div>
            </div>
          )}

          <div className="p-6">
            {loading && rows.length === 0 ? (
              <div className="text-center py-16 text-sm text-gray-500">Loading...</div>
            ) : !selectedWebsite ? (
              /* ───── Website List ───── */
              filteredWebsites.length === 0 ? (
                <div className="text-center py-16">
                  <Globe className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <div className="text-sm font-semibold text-gray-500">No integrations found yet</div>
                  <div className="text-xs text-gray-400 mt-1">When visitors submit forms on your websites, their integration data will show up here</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredWebsites.map((g) => {
                    return (
                      <button key={g.website} type="button"
                        onClick={() => { setSelectedWebsite(g.website); setSearchTerm(''); }}
                        className="w-full text-left rounded-2xl border border-gray-200/70 bg-white/90 shadow-sm hover:shadow-md hover:border-cyan-200 transition-all duration-200 px-5 py-4 group">
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2.5">
                              <Globe className="w-4 h-4 text-cyan-600 flex-shrink-0" />
                              <span className="text-sm font-extrabold text-gray-900 truncate">{g.website}</span>
                            </div>
                            <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-500">
                              <span className="flex items-center gap-1"><Send className="w-3 h-3" /> {g.count} submission{g.count !== 1 ? 's' : ''}</span>
                              <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {g.uniqueContacts} contact{g.uniqueContacts !== 1 ? 's' : ''}</span>
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {timeAgo(g.latestAt)}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {g.uniquePurposes.slice(0, 3).map((p) => {
                                const color = purposeColor(p);
                                return (
                                  <span key={p} className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md ${color.bg} ${color.text} ${color.border} border`}>
                                    {purposeLabel(p)}
                                  </span>
                                );
                              })}
                              {g.uniquePurposes.length > 3 && (
                                <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-md bg-gray-50 text-gray-500 border border-gray-200">
                                  +{g.uniquePurposes.length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-cyan-600 transition-colors flex-shrink-0" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )
            ) : (
              /* ───── All Submissions for Selected Website ───── */
              selectedSubmissions.length === 0 ? (
                <div className="text-center py-16">
                  <Zap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <div className="text-sm font-semibold text-gray-500">No submissions found</div>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedSubmissions.map((sub) => (
                    <div key={sub.id} className="rounded-2xl border border-gray-200/70 bg-white/95 shadow-sm overflow-hidden">
                      {/* Submission header */}
                      <div className="px-5 pt-4 pb-3 border-b border-gray-100 bg-gradient-to-r from-slate-50/50 via-white to-cyan-50/30">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-cyan-100 flex items-center justify-center flex-shrink-0">
                              <Users className="w-4 h-4 text-cyan-600" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-extrabold text-gray-900 truncate">{sub.contactName}</div>
                              <div className="text-[11px] text-gray-500 truncate">
                                {sub.email || 'No email'}
                                {sub.program && <span> &middot; {sub.program} program</span>}
                              </div>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-[11px] text-gray-400">{timeAgo(sub.submittedAt)}</div>
                            <div className="text-[10px] text-gray-300">{formatDateTime(sub.submittedAt)}</div>
                          </div>
                        </div>
                      </div>

                      {/* URLs sent to */}
                      <div className="p-5 space-y-3">
                        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Sent to {sub.urls.length} destination{sub.urls.length !== 1 ? 's' : ''}</div>
                        {sub.urls.map((u, i) => {
                          const color = purposeColor(u.purpose);
                          return (
                            <div key={i} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md ${color.bg} ${color.text} ${color.border} border`}>
                                  {purposeLabel(u.purpose)}
                                </span>
                                <span className="text-[11px] text-gray-400">{friendlyTrigger(u.trigger)}</span>
                              </div>
                              <div className="text-xs text-gray-700 font-semibold mb-2">{friendlyPurpose(u.purpose)}</div>
                              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                                <code className="text-[11px] text-gray-500 break-all font-mono flex-1 min-w-0">{u.url}</code>
                                {u.url && u.url.startsWith('http') && !u.url.includes('{{') && (
                                  <a href={u.url} target="_blank" rel="noopener noreferrer"
                                    className="p-1 text-gray-400 hover:text-cyan-600 transition-colors flex-shrink-0">
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>

        {/* Info card */}
        <div className="mt-6 rounded-2xl border border-cyan-200/60 bg-cyan-50/50 px-5 py-4">
          <div className="flex items-start gap-3">
            <Zap className="w-5 h-5 text-cyan-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-cyan-800">
              <span className="font-bold">What is this page?</span> Every time someone fills out a form on your website, the submission gets sent to different services — like your CRM, a thank-you page, or other tools. This page shows you exactly where each submission goes, how many times each integration was used, and who submitted most recently.
            </div>
          </div>
        </div>
      </div>

      {showScrollTop && (
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-40 inline-flex items-center justify-center w-12 h-12 rounded-full text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all duration-200"
          aria-label="Back to top">
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
