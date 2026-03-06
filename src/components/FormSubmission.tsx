import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ClipboardList, Globe, Mail, Phone, RefreshCw, Search, ShieldCheck, ShieldX, FormInput, Link2, Clock, Copy, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';

type FormSubmissionProps = {
  onBackToLaunch?: () => void;
};

type FormSubmissionRow = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  program: string | null;
  consent: boolean | null;
  consent2: boolean | null;
  source_url: string | null;
  source_hostname: string | null;
  source_pathname: string | null;
  source_referrer: string | null;
  form_name: string | null;
  submitted_at: string | null;
};

export default function FormSubmission({ onBackToLaunch }: FormSubmissionProps) {
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [rows, setRows] = useState<FormSubmissionRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const formatDateTime = useCallback((value: string | null | undefined) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  }, []);

  const loadRows = useCallback(async () => {
    setRowsLoading(true);
    setRowsError(null);
    try {
      const { data, error } = await supabase.rpc('rpc_form_submissions_list');
      if (error) throw error;
      setRows(Array.isArray(data) ? (data as FormSubmissionRow[]) : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load records';
      setRowsError(msg);
      setRows([]);
    } finally {
      setRowsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const normalizedSearch = useMemo(() => searchTerm.trim().toLowerCase(), [searchTerm]);
  const filteredRows = useMemo(() => {
    if (!normalizedSearch) return rows;
    return rows.filter((r) => {
      const fullName = [r.first_name, r.last_name].filter(Boolean).join(' ');
      const haystack = [
        String(r.id),
        fullName,
        r.email,
        r.phone,
        r.program,
        r.form_name,
        r.source_url,
        r.source_hostname,
        r.source_pathname,
        r.source_referrer,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [normalizedSearch, rows]);

  const totalCount = rows.length;
  const filteredCount = filteredRows.length;

  const handleCopy = useCallback((value: string | null) => {
    if (!value) return;
    void navigator?.clipboard?.writeText?.(value);
  }, []);

  const getPrimarySourceText = useCallback((row: FormSubmissionRow) => {
    return (
      row.source_url ||
      row.source_referrer ||
      [row.source_hostname, row.source_pathname].filter(Boolean).join('') ||
      row.source_hostname ||
      row.source_pathname ||
      null
    );
  }, []);

  const downloadCsv = useCallback(() => {
    const escapeCsv = (value: unknown) => {
      const s = value === null || value === undefined ? '' : String(value);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const formatExcelDateTime = (value: string | null) => {
      if (!value) return '';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return value;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
    };

    const headers = [
      'Submitted At',
      'Website',
      'Form Name',
      'Program',
      'Full Name',
      'First Name',
      'Last Name',
      'Email',
      'Phone',
      'Consent',
      'Consent 2',
      'Primary Source',
      'Source URL',
      'Source Path',
      'Referrer',
    ];

    const lines = ['sep=,', headers.join(',')];
    for (const r of filteredRows) {
      const websiteLabel = r.source_hostname || (r.source_url ? new URL(r.source_url).hostname : null);
      const fullName = [r.first_name, r.last_name].filter(Boolean).join(' ');
      const primarySourceText = getPrimarySourceText(r);
      lines.push(
        [
          formatExcelDateTime(r.submitted_at),
          websiteLabel,
          r.form_name,
          r.program,
          fullName,
          r.first_name,
          r.last_name,
          r.email,
          r.phone,
          r.consent === true ? 'Yes' : r.consent === false ? 'No' : '',
          r.consent2 === true ? 'Yes' : r.consent2 === false ? 'No' : '',
          primarySourceText,
          r.source_url,
          r.source_pathname,
          r.source_referrer,
        ]
          .map(escapeCsv)
          .join(','),
      );
    }

    const csv = `${lines.join('\n')}\n`;
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const filename = `form-submissions-${y}-${m}-${d}.csv`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [filteredRows]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-blue-200/30 blur-3xl" />
        <div className="absolute top-32 -right-56 h-[520px] w-[520px] rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="absolute -bottom-48 left-1/3 h-[520px] w-[520px] rounded-full bg-rose-200/20 blur-3xl" />
      </div>

      <div className="sticky top-0 z-40 border-b border-gray-200/60 bg-white/70 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-md">
                <ClipboardList className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-gray-900">Form Submissions</h1>
                <p className="text-sm text-gray-600">Browse the contact responses captured from your forms</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadRows}
                disabled={rowsLoading}
                className="inline-flex items-center px-4 py-2.5 text-sm font-semibold text-gray-800 bg-white/90 hover:bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${rowsLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={downloadCsv}
                disabled={filteredRows.length === 0}
                className="inline-flex items-center px-4 py-2.5 text-sm font-semibold text-gray-800 bg-white/90 hover:bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50"
              >
                <Download className="w-4 h-4 mr-2" />
                Download CSV
              </button>
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

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-3xl shadow-[0_30px_80px_-30px_rgba(15,23,42,0.18)] overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-blue-600/5 via-transparent to-rose-600/5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-lg font-extrabold text-gray-900">Responses</div>
                <div className="text-sm text-gray-600">Showing: {filteredCount} / {totalCount}</div>
              </div>
              <div className="w-full sm:w-[520px]">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search name, email, phone, form name, website, URL, program..."
                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-400 text-sm transition-all duration-200 shadow-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {rowsError && (
            <div className="px-6 pt-5">
              <div className="rounded-2xl border border-red-200/70 bg-red-50/80 px-4 py-3 text-sm font-semibold text-red-800 shadow-sm">
                {rowsError}
              </div>
            </div>
          )}

          <div className="p-6">
            {filteredRows.length === 0 ? (
              <div className="bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-3xl shadow-sm p-6 text-sm text-gray-600">
                No records found.
              </div>
            ) : (
              <div className="space-y-6">
                {filteredRows.map((r) => {
                  const fullName = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unnamed contact';
                  const websiteLabel = r.source_hostname || (r.source_url ? new URL(r.source_url).hostname : null);
                  const consentOk = r.consent === true;
                  const consent2Ok = r.consent2 === true;
                  const primarySourceText = getPrimarySourceText(r);

                  return (
                    <div
                      key={r.id}
                      className="rounded-3xl border border-gray-200/70 bg-white/90 backdrop-blur-sm shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden"
                    >
                      <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 via-white to-indigo-50/30">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-extrabold text-gray-900">
                              <Globe className="w-4 h-4 text-gray-400" />
                              <span className="truncate">{websiteLabel ?? '—'}</span>
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-sm text-gray-700">
                              <FormInput className="w-4 h-4 text-gray-400" />
                              <span className="truncate">{r.form_name ?? '—'}</span>
                            </div>
                          </div>

                          <div className="shrink-0 text-xs text-gray-600 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <span className="whitespace-nowrap">{formatDateTime(r.submitted_at)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="p-6 pt-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="text-base font-extrabold text-gray-900 truncate">{fullName}</div>
                            <div className="mt-2 flex items-center gap-4 flex-wrap">
                              <div className="text-sm text-gray-700 flex items-center gap-2">
                                <Mail className="w-4 h-4 text-gray-400" />
                                <span className="truncate max-w-[280px]">{r.email ?? '—'}</span>
                              </div>
                              <div className="text-sm text-gray-700 flex items-center gap-2">
                                <Phone className="w-4 h-4 text-gray-400" />
                                <span className="truncate max-w-[220px]">{r.phone ?? '—'}</span>
                              </div>
                              <div className="text-sm text-gray-700 flex items-center gap-2">
                                <ClipboardList className="w-4 h-4 text-gray-400" />
                                <span className="truncate max-w-[220px]">{r.program ?? '—'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <div
                              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-2xl border text-xs font-extrabold ${
                                consentOk
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                  : 'bg-rose-50 border-rose-200 text-rose-700'
                              }`}
                            >
                              {consentOk ? <ShieldCheck className="w-4 h-4" /> : <ShieldX className="w-4 h-4" />}
                              Consent
                            </div>
                            <div
                              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-2xl border text-xs font-extrabold ${
                                consent2Ok
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                  : 'bg-rose-50 border-rose-200 text-rose-700'
                              }`}
                            >
                              {consent2Ok ? <ShieldCheck className="w-4 h-4" /> : <ShieldX className="w-4 h-4" />}
                              Consent 2
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                          <div className="text-xs text-gray-600 flex items-center gap-2 min-w-0">
                            <Link2 className="w-4 h-4 text-gray-400" />
                            <span className="truncate">{primarySourceText ?? '—'}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopy(primarySourceText)}
                            disabled={!primarySourceText}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl border border-gray-200 bg-white text-xs font-extrabold text-gray-800 shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50"
                          >
                            Copy Source
                            <Copy className="w-4 h-4 text-gray-400" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
