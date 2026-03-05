import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ClipboardList, RefreshCw, Mail, MapPin, Phone, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

type FormSubmissionProps = {
  onBackToLaunch?: () => void;
};

export default function FormSubmission({ onBackToLaunch }: FormSubmissionProps) {
  const webhookUrl = '/api/form';
  const hasTriggeredOnceRef = useRef(false);

  type SubaccountRow = {
    location_id: string;
    subaccount_name: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
    country: string | null;
    date_added: string | null;
    created_at: string | null;
  };

  const [triggering, setTriggering] = useState(true);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [rows, setRows] = useState<SubaccountRow[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sendingLocationId, setSendingLocationId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [forms, setForms] = useState<any[]>([]);
  const [expandedFormIndex, setExpandedFormIndex] = useState<number | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [submittedRow, setSubmittedRow] = useState<SubaccountRow | null>(null);
  const [showIntegrationModal, setShowIntegrationModal] = useState(false);
  const [integrationApiKey, setIntegrationApiKey] = useState('');
  const [integrationFieldError, setIntegrationFieldError] = useState<string | null>(null);
  const [pendingRow, setPendingRow] = useState<SubaccountRow | null>(null);

  const sendSubaccountToWebhook = useCallback(async (row: SubaccountRow, privateIntegrationApiKey: string) => {
    setSendingLocationId(row.location_id);
    setSendError(null);
    setSendSuccess(null);
    setForms([]);
    setExpandedFormIndex(null);
    setShowResults(false);
    setSubmittedRow(null);
    try {
      const requestId = crypto?.randomUUID?.() ?? `${Date.now()}`;
      const res = await fetch('/api/form-submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Request-Id': requestId,
        },
        body: JSON.stringify({
          private_integration_api_key: privateIntegrationApiKey,
          location_id: row.location_id,
          subaccount_name: row.subaccount_name,
          email: row.email,
          phone: row.phone,
          city: row.city,
          country: row.country,
          date_added: row.date_added,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      let responseMessage = '';
      let responseOk = res.ok;
      let responseError = '';

      const mismatchPrefix = 'API_KEY_MISMATCH::';
      let parsedJson: unknown = null;

      if (contentType.includes('application/json')) {
        try {
          parsedJson = (await res.json()) as unknown;
          const json = parsedJson;
          const first = Array.isArray(json) ? (json[0] as any) : (json as any);

          if (first && typeof first === 'object') {
            if (typeof first.False === 'string' && first.False) {
              responseOk = false;
              responseError = String(first.False);
            }
            if (typeof first.True === 'string' && first.True) {
              responseOk = true;
              responseMessage = String(first.True);
            }
          }

          if (!responseMessage && first && typeof first === 'object') {
            if (typeof first.message === 'string') responseMessage = first.message;
            if (typeof first.error === 'string') responseError = first.error;
            if (first.ok === false || first.success === false) responseOk = false;
            if (first.code && String(first.code).toLowerCase().includes('api_key')) responseOk = false;
          }
        } catch {
          // fall back to text below
        }
      }

      if (!responseMessage && !responseError) {
        try {
          responseMessage = await res.text();
        } catch {
          responseMessage = '';
        }
      }

      const combined = `${responseError || ''} ${responseMessage || ''}`.toLowerCase();
      const looksLikeKeyMismatch =
        combined.includes('does not belong') ||
        combined.includes('not belong') ||
        combined.includes('invalid api key') ||
        combined.includes('invalid key') ||
        combined.includes('api key mismatch') ||
        combined.includes('api_key_mismatch');

      if (!res.ok || !responseOk || looksLikeKeyMismatch) {
        const base = responseError || responseMessage || `Send failed (${res.status})`;
        if (looksLikeKeyMismatch) {
          throw new Error(`${mismatchPrefix}${base.slice(0, 400)}`);
        }
        throw new Error(base.slice(0, 400));
      }

      const candidate = parsedJson;
      const maybeForms = Array.isArray(candidate)
        ? candidate
        : (candidate && typeof candidate === 'object' && Array.isArray((candidate as any).forms)
            ? (candidate as any).forms
            : null);
      if (Array.isArray(maybeForms)) {
        setForms(maybeForms as any[]);
      }

      setSelectedLocationId(row.location_id);
      setSendSuccess((responseMessage || 'Workflow completed.').slice(0, 400));
      setSubmittedRow(row);
      setShowResults(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to send subaccount';
      const mismatchPrefix = 'API_KEY_MISMATCH::';
      if (typeof msg === 'string' && msg.startsWith(mismatchPrefix)) {
        setSendError(null);
      } else {
        setSendError(msg);
      }
      throw new Error(msg);
    } finally {
      setSendingLocationId(null);
    }
  }, []);

  const openIntegrationModal = useCallback((row: SubaccountRow) => {
    setPendingRow(row);
    setIntegrationApiKey('');
    setIntegrationFieldError(null);
    setForms([]);
    setExpandedFormIndex(null);
    setShowResults(false);
    setSubmittedRow(null);
    setShowIntegrationModal(true);
  }, []);

  const resetResults = useCallback(() => {
    setShowResults(false);
    setSubmittedRow(null);
    setForms([]);
    setExpandedFormIndex(null);
    setSendError(null);
    setSendSuccess(null);
    setSelectedLocationId(null);
  }, []);

  const submitIntegration = useCallback(async () => {
    if (!pendingRow) return;
    const key = integrationApiKey.trim();
    if (!key) {
      setIntegrationFieldError('Please paste your Private Integration key.');
      return;
    }
    setIntegrationFieldError(null);
    setShowIntegrationModal(false);
    try {
      await sendSubaccountToWebhook(pendingRow, key);
      setPendingRow(null);
      setIntegrationApiKey('');
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Invalid API key';
      const mismatchPrefix = 'API_KEY_MISMATCH::';
      if (typeof raw === 'string' && raw.startsWith(mismatchPrefix)) {
        setIntegrationFieldError(raw.replace(mismatchPrefix, ''));
        setShowIntegrationModal(true);
        return;
      }
      setShowIntegrationModal(true);
    }
  }, [integrationApiKey, pendingRow, sendSubaccountToWebhook]);

  const loadRows = useCallback(async () => {
    setRowsLoading(true);
    setRowsError(null);
    try {
      const { data, error } = await supabase.rpc('rpc_ghl_subaccounts_list');
      if (error) throw error;
      setRows(Array.isArray(data) ? (data as SubaccountRow[]) : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load records';
      setRowsError(msg);
      setRows([]);
    } finally {
      setRowsLoading(false);
    }
  }, []);

  const triggerWorkflowThenLoad = useCallback(async () => {
    setTriggering(true);
    setTriggerError(null);
    setRows([]);
    try {
      const requestId = crypto?.randomUUID?.() ?? `${Date.now()}`;
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Request-Id': requestId,
        },
        body: JSON.stringify({ source: 'groundstandard-web' }),
      });
      if (!res.ok) {
        let detail = '';
        try {
          detail = await res.text();
        } catch {
          detail = '';
        }
        const suffix = detail ? `: ${detail.slice(0, 300)}` : '';
        throw new Error(`Workflow failed (${res.status})${suffix}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to trigger workflow';
      setTriggerError(msg);
    } finally {
      setTriggering(false);
    }

    await loadRows();
  }, [loadRows]);

  useEffect(() => {
    if (hasTriggeredOnceRef.current) return;
    hasTriggeredOnceRef.current = true;
    void triggerWorkflowThenLoad();
  }, [triggerWorkflowThenLoad]);

  const totalRows = rows.length;
  const hasAnyError = Boolean(triggerError || rowsError);

  const normalizedSearch = useMemo(() => searchTerm.trim().toLowerCase(), [searchTerm]);
  const tableRows = useMemo(() => {
    if (!normalizedSearch) return rows;
    return rows.filter((r) => {
      const haystack = [
        r.subaccount_name,
        r.email,
        r.phone,
        r.city,
        r.country,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [normalizedSearch, rows]);
  const filteredCount = tableRows.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      <div className="bg-black/95 backdrop-blur-sm border-b border-gray-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-lg">
                <ClipboardList className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Form Submission</h1>
                <p className="text-sm text-gray-300">Choose a subaccount to continue</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={triggerWorkflowThenLoad}
                disabled={triggering || rowsLoading}
                className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${(triggering || rowsLoading) ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              {onBackToLaunch && (
                <button
                  type="button"
                  onClick={onBackToLaunch}
                  className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {(triggering || rowsLoading) && (
          <div className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-2xl shadow-xl p-8 overflow-hidden">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-md">
                <ClipboardList className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-lg font-extrabold text-gray-900">Loading…</div>
                <div className="text-sm text-gray-600">
                  {triggering ? 'Running workflow and saving to database…' : 'Fetching latest records…'}
                </div>
              </div>
            </div>
            <div className="mt-6 h-2 w-full bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full w-2/3 bg-gradient-to-r from-blue-600 to-blue-700 rounded-full animate-pulse" />
            </div>
          </div>
        )}

        {!triggering && !rowsLoading && hasAnyError && (
          <div className="bg-white/90 backdrop-blur-sm border border-red-200 rounded-2xl shadow-xl p-6">
            <div className="text-sm font-extrabold text-red-800">Failed to load</div>
            {triggerError && <div className="text-sm text-red-700 mt-2">Workflow: {triggerError}</div>}
            {rowsError && <div className="text-sm text-red-700 mt-2">Records: {rowsError}</div>}
          </div>
        )}

        {!triggering && !rowsLoading && !hasAnyError && (
          <div className="space-y-4">
            <div className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-blue-600/5 via-transparent to-rose-600/5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-lg font-extrabold text-gray-900">{showResults ? 'Results' : 'Subaccounts'}</div>
                    {!showResults && (
                      <div className="text-sm text-gray-600">Showing: {filteredCount} / {totalRows}</div>
                    )}
                  </div>
                  {!showResults && (
                    <div className="w-full sm:w-[420px]">
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Search className="w-5 h-5 text-gray-400" />
                        </div>
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Search subaccount name, email, phone, city, country..."
                          className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-400 text-sm transition-all duration-200"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {(sendError || sendSuccess) && (
                <div className="px-6 pt-5">
                  {sendError && (
                    <div className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                      {sendError}
                    </div>
                  )}
                  {sendSuccess && (
                    <div className="rounded-xl border-2 border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
                      {sendSuccess}
                    </div>
                  )}
                </div>
              )}

              {showResults && (
                <div className="px-6 pt-5">
                  <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <div className="text-sm font-extrabold text-gray-900">Results</div>
                          <div className="text-xs text-gray-600 mt-1">
                            Subaccount: <span className="font-semibold text-gray-900">{submittedRow?.subaccount_name ?? '—'}</span>
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            {submittedRow?.email ?? '—'} · {submittedRow?.phone ?? '—'} · {[submittedRow?.city, submittedRow?.country].filter(Boolean).join(', ') || '—'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={resetResults}
                          className="inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl border border-gray-200 shadow-sm"
                        >
                          Choose another subaccount
                        </button>
                      </div>
                    </div>
                  </div>

                  {forms.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                      No forms returned by the webhook.
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-600/5 via-transparent to-rose-600/5">
                        <div className="text-sm font-extrabold text-gray-900">Forms</div>
                        <div className="text-xs text-gray-600 mt-1">Showing {forms.length} form{forms.length === 1 ? '' : 's'}</div>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {forms.map((f: any, idx: number) => {
                          const formName =
                            (typeof f?.name === 'string' && f.name) ||
                            (typeof f?.form_name === 'string' && f.form_name) ||
                            (typeof f?.formName === 'string' && f.formName) ||
                            `Form ${idx + 1}`;
                          const submissions =
                            (Array.isArray(f?.submissions) && f.submissions) ||
                            (Array.isArray(f?.responses) && f.responses) ||
                            (Array.isArray(f?.entries) && f.entries) ||
                            [];
                          const totalResponses =
                            (typeof f?.total_responses === 'number' && f.total_responses) ||
                            (typeof f?.totalResponses === 'number' && f.totalResponses) ||
                            submissions.length;
                          const expanded = expandedFormIndex === idx;

                          return (
                            <div key={f?.id ?? `${idx}-${formName}`}
                              className="bg-white"
                            >
                              <button
                                type="button"
                                onClick={() => setExpandedFormIndex((v) => (v === idx ? null : idx))}
                                className="w-full px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-extrabold text-gray-900">{formName}</div>
                                    <div className="text-xs text-gray-600 mt-1">Total responses: {totalResponses}</div>
                                  </div>
                                  <div className="text-xs font-bold text-gray-500">{expanded ? 'Hide' : 'View'}</div>
                                </div>
                              </button>

                              {expanded && (
                                <div className="px-5 pb-5">
                                  {submissions.length === 0 ? (
                                    <div className="text-sm text-gray-600">No submissions found.</div>
                                  ) : (
                                    <div className="space-y-4">
                                      {submissions.map((s: any, sIdx: number) => {
                                        const respondentName =
                                          (typeof s?.name === 'string' && s.name) ||
                                          (typeof s?.full_name === 'string' && s.full_name) ||
                                          (typeof s?.fullName === 'string' && s.fullName) ||
                                          '—';
                                        const respondentEmail = (typeof s?.email === 'string' && s.email) || '—';
                                        const respondentPhone =
                                          (typeof s?.phone === 'string' && s.phone) ||
                                          (typeof s?.phoneNumber === 'string' && s.phoneNumber) ||
                                          '—';
                                        const submittedAt =
                                          (typeof s?.submitted_at === 'string' && s.submitted_at) ||
                                          (typeof s?.submittedAt === 'string' && s.submittedAt) ||
                                          (typeof s?.date === 'string' && s.date) ||
                                          (typeof s?.created_at === 'string' && s.created_at) ||
                                          (typeof s?.createdAt === 'string' && s.createdAt) ||
                                          '—';
                                        const answers =
                                          (Array.isArray(s?.answers) && s.answers) ||
                                          (Array.isArray(s?.fields) && s.fields) ||
                                          (s && typeof s?.fields === 'object' && s.fields && !Array.isArray(s.fields)
                                            ? Object.entries(s.fields).map(([key, value]) => ({ key, value }))
                                            : []);

                                        return (
                                          <div key={s?.id ?? `${sIdx}-${respondentEmail}-${submittedAt}`}
                                            className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                                          >
                                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                              <div>
                                                <div className="text-sm font-extrabold text-gray-900">{respondentName}</div>
                                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-gray-700">
                                                  <div className="flex items-center gap-2">
                                                    <Mail className="w-4 h-4 text-gray-400" />
                                                    <span className="truncate">{respondentEmail}</span>
                                                  </div>
                                                  <div className="flex items-center gap-2">
                                                    <Phone className="w-4 h-4 text-gray-400" />
                                                    <span className="truncate">{respondentPhone}</span>
                                                  </div>
                                                  <div className="text-gray-600">{submittedAt}</div>
                                                </div>
                                              </div>
                                            </div>

                                            <div className="mt-4">
                                              <div className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">Answered fields</div>
                                              <div className="mt-2 space-y-2">
                                                {Array.isArray(answers) && answers.length > 0 ? (
                                                  answers.map((a: any, aIdx: number) => {
                                                    const label =
                                                      (typeof a?.label === 'string' && a.label) ||
                                                      (typeof a?.name === 'string' && a.name) ||
                                                      (typeof a?.key === 'string' && a.key) ||
                                                      `Field ${aIdx + 1}`;
                                                    const value =
                                                      typeof a?.value === 'string' || typeof a?.value === 'number'
                                                        ? String(a.value)
                                                        : typeof a === 'object' && 'value' in (a as any)
                                                          ? JSON.stringify((a as any).value)
                                                          : typeof a === 'string'
                                                            ? a
                                                            : JSON.stringify(a);
                                                    return (
                                                      <div key={`${label}-${aIdx}`} className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                                                        <div className="text-xs font-bold text-gray-700">{label}</div>
                                                        <div className="text-xs text-gray-600 mt-1 whitespace-pre-wrap break-words">{value || '—'}</div>
                                                      </div>
                                                    );
                                                  })
                                                ) : (
                                                  <div className="text-sm text-gray-600">No answered fields found.</div>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!showResults && (
                <>
                  <div className="p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {tableRows.length === 0 ? (
                        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-sm text-gray-600">
                          No records found.
                        </div>
                      ) : (
                        tableRows.map((r) => {
                          const isSelected = r.location_id === selectedLocationId;
                          return (
                            <div
                              key={r.location_id}
                              className={`text-left rounded-2xl border-2 bg-white shadow-sm transition-all duration-200 overflow-hidden ${
                                isSelected ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-gray-200 hover:border-blue-300 hover:shadow-lg'
                              }`}
                            >
                              <div className="p-5">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-base font-extrabold text-gray-900">
                                      {r.subaccount_name ?? 'Unnamed subaccount'}
                                    </div>
                                  </div>
                                  {isSelected && (
                                    <div className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-full border bg-blue-50 border-blue-200 text-blue-700">
                                      Selected
                                    </div>
                                  )}
                                </div>

                                <div className="mt-4 space-y-2">
                                  <div className="text-sm text-gray-700 flex items-center gap-2">
                                    <Mail className="w-4 h-4 text-gray-400" />
                                    <span className="truncate">{r.email ?? '—'}</span>
                                  </div>
                                  <div className="text-sm text-gray-700 flex items-center gap-2">
                                    <Phone className="w-4 h-4 text-gray-400" />
                                    <span className="truncate">{r.phone ?? '—'}</span>
                                  </div>
                                  <div className="text-sm text-gray-700 flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-gray-400" />
                                    <span className="truncate">{[r.city, r.country].filter(Boolean).join(', ') || '—'}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="px-5 pb-5">
                                <button
                                  type="button"
                                  onClick={() => openIntegrationModal(r)}
                                  disabled={Boolean(sendingLocationId)}
                                  className={`w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-extrabold rounded-xl shadow-md transition-all duration-200 ${
                                    isSelected
                                      ? 'text-white bg-blue-700 hover:bg-blue-800'
                                      : 'text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800'
                                  } ${sendingLocationId ? 'opacity-60 cursor-not-allowed' : ''}`}
                                >
                                  {sendingLocationId === r.location_id ? 'Sending…' : 'Choose'}
                                  <ArrowRight className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

          </div>
        )}
      </div>

      {sendingLocationId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-md">
                  <RefreshCw className="w-5 h-5 text-white animate-spin" />
                </div>
                <div>
                  <div className="text-lg font-extrabold text-gray-900">Processing…</div>
                  <div className="text-sm text-gray-600">Running workflow and validating integration key.</div>
                </div>
              </div>
              <div className="mt-6 h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full w-2/3 bg-gradient-to-r from-blue-600 to-blue-700 rounded-full animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      )}

      {showIntegrationModal && pendingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowIntegrationModal(false)} />
          <div className="relative w-full max-w-xl rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden">
            <div className="px-6 pt-5 pb-4 bg-gradient-to-r from-blue-600/5 via-transparent to-rose-600/5 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-extrabold text-gray-900">Private Integration</div>
                  <div className="text-sm text-gray-600 mt-1">For: <span className="font-semibold text-gray-900">{pendingRow.subaccount_name ?? 'Unnamed subaccount'}</span></div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIntegrationModal(false)}
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all duration-200"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-sm font-extrabold text-gray-900">How to get your key</div>
                <div className="mt-2 text-sm text-gray-700 space-y-1">
                  <div>1) Open your account settings</div>
                  <div>2) Go to <span className="font-semibold">Private Integrations</span></div>
                  <div>3) Create a new integration (or open an existing one)</div>
                  <div>4) Copy the API key and paste it below</div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Private Integration key</label>
                <input
                  type="password"
                  value={integrationApiKey}
                  onChange={(e) => setIntegrationApiKey(e.target.value)}
                  placeholder="Paste your key here"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-400 text-sm"
                  autoFocus
                />
                {integrationFieldError && (
                  <div className="mt-2 text-sm font-semibold text-red-700">{integrationFieldError}</div>
                )}
                <div className="mt-2 text-xs text-gray-500">This key is used only for this request and will be sent securely with the selected subaccount details.</div>
              </div>
            </div>

            <div className="px-6 pb-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowIntegrationModal(false)}
                className="px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl border border-gray-200 shadow-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitIntegration()}
                className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
