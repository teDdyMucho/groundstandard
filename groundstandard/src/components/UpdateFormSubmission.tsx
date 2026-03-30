import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUp, RefreshCw, Search, Globe, Clock, ExternalLink, ChevronRight, Send, Zap, Copy, Check, FileText, Pencil, Save, X } from 'lucide-react';
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
  form_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  program: string | null;
};

type ParsedUrl = {
  url: string;
  purpose: string;
  trigger: string;
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
  return raw.replace(/_/g, ' ').replace(/^on /i, 'When ').replace(/^./, s => s.toUpperCase());
};

const friendlyPurpose = (raw: string): string => {
  if (!raw) return 'Integration webhook';
  return raw.replace(/—/g, '–').replace(/\s+/g, ' ').trim();
};

const purposeLabel = (raw: string): string => {
  const lower = raw.toLowerCase();
  if (lower.includes('highlevel') || lower.includes('crm')) return 'CRM Sync';
  if (lower.includes('redirect') && lower.includes('adult')) return 'Adult Redirect';
  if (lower.includes('redirect') && lower.includes('youth')) return 'Youth Redirect';
  if (lower.includes('redirect')) return 'Redirect';
  if (lower.includes('webhook')) return 'Webhook';
  if (lower.includes('notification') || lower.includes('notify')) return 'Notification';
  if (raw.length > 25) return raw.slice(0, 22) + '...';
  return raw;
};

const purposeColor = (raw: string): { bg: string; text: string; border: string } => {
  const lower = raw.toLowerCase();
  if (lower.includes('highlevel') || lower.includes('crm')) return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
  if (lower.includes('redirect') && lower.includes('adult')) return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
  if (lower.includes('redirect') && lower.includes('youth')) return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' };
  if (lower.includes('redirect')) return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' };
  return { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' };
};

type SubmissionEntry = {
  id: number;
  contactName: string;
  email: string | null;
  phone: string | null;
  program: string | null;
  submittedAt: string;
};

type FormConfig = {
  formName: string;
  website: string;
  destinations: ParsedUrl[];
  lastUpdated: string;
  submissionCount: number;
  sourceRowId: number;
  entries: SubmissionEntry[];
};

type WebsiteGroup = {
  website: string;
  forms: FormConfig[];
  totalForms: number;
  lastUpdated: string;
};

export default function UpdateFormSubmission({ onBackToLaunch }: UpdateFormSubmissionProps) {
  const [rows, setRows] = useState<FormRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWebsite, setSelectedWebsite] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Editing state
  const [editingForm, setEditingForm] = useState<string | null>(null); // formName being edited
  const [editDestinations, setEditDestinations] = useState<ParsedUrl[]>([]);
  const [saving, setSaving] = useState(false);

  const copyUrl = useCallback((url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  }, []);

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
            return exists ? prev.map(r => r.id === row.id ? row : r) : [row, ...prev];
          }
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

  // Build form configs: group by website + form_name, deduplicate destinations
  const websiteGroups: WebsiteGroup[] = useMemo(() => {
    // First, group rows by website + form_name
    const formMap = new Map<string, { rows: FormRow[]; website: string; formName: string }>();

    for (const row of rows) {
      const website = getWebsite(row) ?? 'Unknown';
      const formName = row.form_name || 'Unnamed form';
      const key = `${website}::${formName}`;
      const group = formMap.get(key) ?? { rows: [], website, formName };
      group.rows.push(row);
      formMap.set(key, group);
    }

    // Build form configs with deduplicated destinations
    const siteMap = new Map<string, FormConfig[]>();

    for (const [, group] of formMap) {
      // Get the latest row (most recent submitted_at)
      const sorted = [...group.rows].sort((a, b) => new Date(b.submitted_at ?? 0).getTime() - new Date(a.submitted_at ?? 0).getTime());
      const latestRow = sorted[0];

      let destinations: ParsedUrl[] = [];
      try {
        const raw = JSON.parse(latestRow.urls ?? '[]');
        if (Array.isArray(raw)) destinations = raw;
      } catch { /* skip */ }

      const entries: SubmissionEntry[] = sorted.map(r => ({
        id: r.id,
        contactName: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown',
        email: r.email,
        phone: r.phone,
        program: r.program,
        submittedAt: r.submitted_at ?? '',
      }));

      const config: FormConfig = {
        formName: group.formName,
        website: group.website,
        destinations,
        lastUpdated: latestRow.submitted_at ?? '',
        submissionCount: group.rows.length,
        sourceRowId: latestRow.id,
        entries,
      };

      const siteConfigs = siteMap.get(group.website) ?? [];
      siteConfigs.push(config);
      siteMap.set(group.website, siteConfigs);
    }

    // Build final website groups
    const result: WebsiteGroup[] = [];
    for (const [website, forms] of siteMap) {
      forms.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
      result.push({
        website,
        forms,
        totalForms: forms.length,
        lastUpdated: forms[0]?.lastUpdated ?? '',
      });
    }
    result.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
    return result;
  }, [rows, getWebsite]);

  const normalizedSearch = useMemo(() => searchTerm.trim().toLowerCase(), [searchTerm]);

  const filteredWebsites = useMemo(() => {
    if (!normalizedSearch) return websiteGroups;
    return websiteGroups.filter(g => g.website.toLowerCase().includes(normalizedSearch));
  }, [normalizedSearch, websiteGroups]);

  const selectedForms = useMemo(() => {
    if (!selectedWebsite) return [];
    const group = websiteGroups.find(g => g.website === selectedWebsite);
    if (!group) return [];
    if (!normalizedSearch) return group.forms;
    return group.forms.filter(f =>
      f.formName.toLowerCase().includes(normalizedSearch) ||
      f.destinations.some(d => d.purpose.toLowerCase().includes(normalizedSearch) || d.url.toLowerCase().includes(normalizedSearch)),
    );
  }, [selectedWebsite, websiteGroups, normalizedSearch]);

  const startEdit = useCallback((form: FormConfig) => {
    setEditingForm(form.formName);
    setEditDestinations(form.destinations.map(d => ({ ...d })));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingForm(null);
    setEditDestinations([]);
  }, []);

  const saveEdit = useCallback(async (form: FormConfig) => {
    setSaving(true);
    try {
      const updatedUrls = JSON.stringify(editDestinations);
      const { error: err } = await supabase
        .from('form_submissions')
        .update({ urls: updatedUrls })
        .eq('id', form.sourceRowId);
      if (err) throw err;
      // Update local state
      setRows(prev => prev.map(r => r.id === form.sourceRowId ? { ...r, urls: updatedUrls } : r));
      setEditingForm(null);
      setEditDestinations([]);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [editDestinations]);

  const updateDestination = useCallback((idx: number, field: keyof ParsedUrl, value: string) => {
    setEditDestinations(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d));
  }, []);

  const addDestination = useCallback(() => {
    setEditDestinations(prev => [...prev, { url: '', purpose: '', trigger: 'on_form_submit' }]);
  }, []);

  const removeDestination = useCallback((idx: number) => {
    setEditDestinations(prev => prev.filter((_, i) => i !== idx));
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
    const d2 = new Date(value);
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' }).format(d2);
  }, []);

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
                <p className="text-sm text-gray-600">Manage where your forms send data to</p>
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
                    <button type="button" onClick={() => { setSelectedWebsite(null); setSearchTerm(''); cancelEdit(); }}
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
                  {selectedWebsite
                    ? <>{selectedForms.length} form{selectedForms.length !== 1 ? 's' : ''} configured</>
                    : <>{filteredWebsites.length} website{filteredWebsites.length !== 1 ? 's' : ''} with active forms</>}
                </div>
              </div>
              <div className="relative min-w-[260px]">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="w-4 h-4 text-gray-400" />
                </div>
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={selectedWebsite ? 'Search forms...' : 'Search website...'}
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
                  <div className="text-sm font-semibold text-gray-500">No forms configured yet</div>
                  <div className="text-xs text-gray-400 mt-1">Forms will appear here automatically when added to your websites</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredWebsites.map((g) => {
                    const allPurposes = [...new Set(g.forms.flatMap(f => f.destinations.map(d => d.purpose)).filter(Boolean))];
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
                              <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {g.totalForms} form{g.totalForms !== 1 ? 's' : ''}</span>
                              <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> {allPurposes.length} destination{allPurposes.length !== 1 ? 's' : ''}</span>
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {timeAgo(g.lastUpdated)}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {g.forms.slice(0, 4).map((f) => (
                                <span key={f.formName} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md bg-cyan-50 text-cyan-700 border border-cyan-200">
                                  <FileText className="w-2.5 h-2.5" />
                                  {f.formName}
                                </span>
                              ))}
                              {g.forms.length > 4 && (
                                <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-md bg-gray-50 text-gray-500 border border-gray-200">
                                  +{g.forms.length - 4} more
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
              /* ───── Forms for Selected Website ───── */
              selectedForms.length === 0 ? (
                <div className="text-center py-16">
                  <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <div className="text-sm font-semibold text-gray-500">No forms found</div>
                </div>
              ) : (
                <div className="space-y-5">
                  {selectedForms.map((form) => {
                    const isEditing = editingForm === form.formName;
                    return (
                      <div key={form.formName} className="rounded-2xl border border-gray-200/70 bg-white/95 shadow-sm overflow-hidden">
                        {/* Form header */}
                        <div className="px-5 pt-4 pb-3 border-b border-gray-100 bg-gradient-to-r from-slate-50/50 via-white to-cyan-50/30">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-9 h-9 rounded-xl bg-cyan-100 flex items-center justify-center flex-shrink-0">
                                <FileText className="w-4 h-4 text-cyan-600" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-extrabold text-gray-900 truncate">{form.formName}</div>
                                <div className="text-[11px] text-gray-500">
                                  {form.destinations.length} destination{form.destinations.length !== 1 ? 's' : ''} &middot; Last updated {timeAgo(form.lastUpdated)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {isEditing ? (
                                <>
                                  <button type="button" onClick={cancelEdit} disabled={saving}
                                    className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-200 disabled:opacity-50">
                                    <X className="w-3.5 h-3.5 mr-1" /> Cancel
                                  </button>
                                  <button type="button" onClick={() => saveEdit(form)} disabled={saving}
                                    className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-700 rounded-lg shadow-sm disabled:opacity-50">
                                    <Save className="w-3.5 h-3.5 mr-1" /> {saving ? 'Saving...' : 'Save'}
                                  </button>
                                </>
                              ) : (
                                <button type="button" onClick={() => startEdit(form)}
                                  className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 rounded-lg border border-cyan-200 transition-all">
                                  <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Destinations */}
                        <div className="p-5 space-y-3">
                          {isEditing ? (
                            /* ── Edit mode ── */
                            <>
                              {editDestinations.map((d, i) => (
                                <div key={i} className="rounded-xl border border-cyan-200 bg-cyan-50/30 p-4 space-y-2.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Destination {i + 1}</span>
                                    <button type="button" onClick={() => removeDestination(i)}
                                      className="text-xs text-red-500 hover:text-red-700 font-semibold">Remove</button>
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">URL</label>
                                    <input type="text" value={d.url} onChange={(e) => updateDestination(i, 'url', e.target.value)}
                                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 bg-white text-xs font-mono" />
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div>
                                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Purpose</label>
                                      <input type="text" value={d.purpose} onChange={(e) => updateDestination(i, 'purpose', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 bg-white text-sm" />
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Trigger</label>
                                      <input type="text" value={d.trigger} onChange={(e) => updateDestination(i, 'trigger', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 bg-white text-sm" />
                                    </div>
                                  </div>
                                </div>
                              ))}
                              <button type="button" onClick={addDestination}
                                className="w-full py-2.5 text-xs font-semibold text-cyan-700 bg-white border-2 border-dashed border-cyan-300 rounded-xl hover:bg-cyan-50 transition">
                                + Add Destination
                              </button>
                            </>
                          ) : (
                            /* ── View mode ── */
                            form.destinations.map((d, i) => {
                              const color = purposeColor(d.purpose);
                              const isWebhook = /hooks|webhook|api|crm|leadconnector|zapier|integromat|make\.com/i.test(d.url);
                              const isRedirect = !isWebhook && d.url.startsWith('http');
                              return (
                                <div key={i} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md ${color.bg} ${color.text} ${color.border} border`}>
                                      {purposeLabel(d.purpose)}
                                    </span>
                                    <span className="text-[11px] text-gray-400">{friendlyTrigger(d.trigger)}</span>
                                  </div>
                                  <div className="text-xs text-gray-700 font-semibold mb-2">{friendlyPurpose(d.purpose)}</div>
                                  <div className={`flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-1.5 ${isRedirect ? 'cursor-pointer hover:border-cyan-300' : ''} transition-colors`}
                                    onClick={isRedirect ? () => copyUrl(d.url) : undefined}>
                                    <Send className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                    <code className="text-[11px] text-gray-500 break-all font-mono flex-1 min-w-0">{d.url}</code>
                                    {isRedirect && (
                                      <>
                                        <button type="button" className={`p-1 flex-shrink-0 transition-colors ${copiedUrl === d.url ? 'text-green-500' : 'text-gray-400 hover:text-cyan-600'}`}>
                                          {copiedUrl === d.url ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                        {!d.url.includes('{{') && (
                                          <a href={d.url} target="_blank" rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="p-1 text-gray-400 hover:text-cyan-600 transition-colors flex-shrink-0">
                                            <ExternalLink className="w-3 h-3" />
                                          </a>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}

                          {/* ── Form Data / Submission History ── */}
                          {form.entries.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-gray-100">
                              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                                Form Data ({form.entries.length} {form.entries.length === 1 ? 'entry' : 'entries'})
                              </div>
                              <div className="space-y-2">
                                {form.entries.map((entry) => (
                                  <div key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-gray-50/80 border border-gray-100">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                      <div className="w-7 h-7 rounded-full bg-cyan-100 flex items-center justify-center flex-shrink-0">
                                        <span className="text-[10px] font-bold text-cyan-700">
                                          {entry.contactName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                        </span>
                                      </div>
                                      <div className="min-w-0">
                                        <div className="text-xs font-bold text-gray-800 truncate">{entry.contactName}</div>
                                        <div className="text-[11px] text-gray-500 truncate">
                                          {[entry.email, entry.phone].filter(Boolean).join(' · ') || 'No contact info'}
                                          {entry.program && <span className="text-gray-400"> · {entry.program}</span>}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-[11px] text-gray-400 flex-shrink-0 text-right">
                                      <div>{timeAgo(entry.submittedAt)}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
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
