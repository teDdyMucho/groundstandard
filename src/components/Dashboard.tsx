import { useState, useMemo, useEffect, type FormEvent } from 'react';
import { Search, FileText, Clock, CheckCircle, RefreshCw, AlertCircle, X, Send, Plus, Filter, Eye, Edit3, Loader2, Sparkles, ArrowUp, Trash } from 'lucide-react';
import ChatWidget from './ChatWidget';
import { useResearchData } from '../hooks/useResearchData';
import type { ResearchArticle } from '../lib/supabase';
import { supabase } from '../lib/supabase';

export default function Dashboard() {
  const { articles, loading, error, refetch } = useResearchData();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set());

  // Back-to-top visibility
  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener('scroll', onScroll);
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  // Modal state for sending a Keyword to webhook
  const [showAddModal, setShowAddModal] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');
  const [bizName, setBizName] = useState('');
  const [city, setCity] = useState('');
  const [provState, setProvState] = useState('');
  const [callToAction, setCallToAction] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [keywordCount, setKeywordCount] = useState<string>('1');
  // Modal state to view article content
  const [showContentModal, setShowContentModal] = useState(false);
  const [contentToShow, setContentToShow] = useState<string>('');
  const [contentTitle, setContentTitle] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Chat widget moved to its own component (ChatWidget)
  const isBusy = sending;
  // Track which rows are in the process of sending a Write request
  const [writingIds, setWritingIds] = useState<Set<string>>(new Set());
  // Track which rows are sending a Rewrite request
  const [rewritingIds, setRewritingIds] = useState<Set<string>>(new Set());
  // Track rows being deleted
  const [deletingIds, setDeletingIds] = useState<Set<string | number>>(new Set());
  // Modal state for selecting word limit for Write
  const [showWriteModal, setShowWriteModal] = useState(false);
  const [articleToWrite, setArticleToWrite] = useState<ResearchArticle | null>(null);
  const [wordLimit, setWordLimit] = useState<number>(1000);
  // Modal state for Rewrite prompt
  const [showRewriteModal, setShowRewriteModal] = useState(false);
  const [articleToRewrite, setArticleToRewrite] = useState<ResearchArticle | null>(null);
  const [rewriteInstructions, setRewriteInstructions] = useState<string>('');
  // Additional keywords for Write (array of keyword strings) and per-keyword mention range derived from word limit
  const [extraKeywords, setExtraKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState<string>('');
  const mentionRange = useMemo(() => {
    const map: Record<number, { min: number; max: number }> = {
      500: { min: 2, max: 3 },
      1000: { min: 2, max: 3 },
      1500: { min: 3, max: 4 },
      2000: { min: 5, max: 6 },
      2500: { min: 6, max: 7 },
      3000: { min: 7, max: 9 },
    };

    return map[wordLimit] || { min: 2, max: 3 };
  }, [wordLimit]);

  const maxKeywords = useMemo(() => {
    const map: Record<number, number> = {
      500: 0,
      1000: 2,
      1500: 3,
      2000: 5,
      2500: 6,
      3000: 8,
    };
    return map[wordLimit] || 0;
  }, [wordLimit]);

  // Open modal to ask for rewrite prompt
  const handleOpenRewriteModal = (article: ResearchArticle) => {
    setArticleToRewrite(article);
    setRewriteInstructions('');
    setShowRewriteModal(true);
  };

  // Confirm rewrite with user-provided instructions
  const handleConfirmRewrite = async () => {
    if (!articleToRewrite) return;
    const a = articleToRewrite;
    setShowRewriteModal(false);
    setArticleToRewrite(null);
    await handleRewriteForArticle(a, rewriteInstructions.trim() || undefined);
  };

  // Optimistic placeholder rows inserted immediately after sending a keyword
  type OptimisticArticle = {
    id: string; // temp id
    title: string;
    keyword: string;
    doc_link: string | null;
    content?: string | null;
    status: string;
    _temp: true;
    createdTs: number;
  };

  // State for optimistic placeholders and persistence/polling hooks
  const [optimisticRows, setOptimisticRows] = useState<OptimisticArticle[]>([]);
  const STORAGE_KEY = 'gs_optimistic_rows_v1';
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as OptimisticArticle[] | null;
      if (!parsed || !Array.isArray(parsed)) return;
      const now = Date.now();
      const maxAgeMs = 2 * 60 * 60 * 1000; // keep at most 2 hours old placeholders
      const restored = parsed.filter(r => r && r._temp === true && typeof r.createdTs === 'number' && (now - r.createdTs) <= maxAgeMs);
      if (restored.length > 0) {
        setOptimisticRows(prev => (prev.length > 0 ? prev : restored));
      }
    } catch {
      // ignore storage errors
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(optimisticRows));
    } catch {
      // ignore storage errors
    }
  }, [optimisticRows]);
  useEffect(() => {
    if (optimisticRows.length === 0) return;
    const id = setInterval(() => { refetch(); }, 5000);
    return () => clearInterval(id);
  }, [optimisticRows.length, refetch]);

  // Copy full content from the View Content Modal
  const handleCopyContent = async () => {
    try {
      const html = String(contentToShow ?? '');
      const pre = html
        .replace(/<br\s*\/?>(?=\s*\n?)/gi, '\n')
        .replace(/<\/(p|div)>/gi, '\n\n')
        .replace(/<\/(h[1-6])>/gi, '\n\n')
        .replace(/<li[^>]*>/gi, '• ')
        .replace(/<\/(li)>/gi, '\n')
        .replace(/<\/?(ul|ol)[^>]*>/gi, '\n')
        .replace(/&nbsp;/gi, ' ')
        .replace(/<[^>]+>/g, '');
      const text = (() => { const ta = document.createElement('textarea'); ta.innerHTML = pre; return ta.value; })()
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure contexts
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error('Copy failed', e);
    }
  };

  // Send rewrite request directly to the provided webhook (optionally include instructions)
  const handleRewriteForArticle = async (article: ResearchArticle, instructions?: string) => {
    if (!article) return;
    const key = String(article.id ?? article.title);
    setRewritingIds(prev => new Set(prev).add(key));
    try {
      const url = '/api/rewrite';
      type RewritePayload = {
        id?: number | string;
        title?: string;
        keyword?: string;
        doc_link?: string | null;
        content?: string | null;
        status?: string;
        word_limit?: number;
        additional_keywords?: string[];
        mentions_per_keyword?: { min: number; max: number };
        action?: string;
        source?: string;
        instructions?: string;
      };
      const payloads: RewritePayload[] = [
        {
          id: article.id,
          title: article.title,
          keyword: article.keyword,
          doc_link: article.doc_link ?? null,
          content: (article as unknown as { content?: string }).content ?? null,
          status: (article as unknown as { status?: string }).status ?? undefined,
          word_limit: 1000,
          additional_keywords: [],
          mentions_per_keyword: { min: 2, max: 3 },
          action: 'rewrite',
          source: 'dashboard-rewrite',
          instructions: instructions || undefined,
        },
        { id: article.id, title: article.title, action: 'rewrite', instructions: instructions || undefined },
        { doc_link: article.doc_link ?? null, action: 'rewrite', instructions: instructions || undefined },
      ];
      let ok = false;
      let lastTxt = '';
      for (const body of payloads) {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
        });
        if (resp.ok) { ok = true; break; }
        lastTxt = await resp.text();
      }
      if (!ok) {
        throw new Error(`Rewrite webhook returned non-200. Last response: ${lastTxt || 'No body'}`);
      }
      setTimeout(() => { refetch(); }, 800);
    } catch (err) {
      console.error(err);
      if (err instanceof Error) {
        window.alert(`Failed to send rewrite request: ${err.message}`);
      } else {
        window.alert('Failed to send rewrite request');
      }
    } finally {
      setRewritingIds(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };
  

  const handleSendKeyword = async (e: FormEvent) => {
    e.preventDefault();
    if (!keywordInput.trim()) {
      setSendError('Please enter a keyword');
      setSendSuccess(false);
      return;
    }
    const parsed = parseInt((keywordCount || '1') as string, 10);
    const count = Math.min(10, Math.max(1, Number.isNaN(parsed) ? 1 : parsed));
    setSending(true);
    setSendError(null);
    setSendSuccess(false);
    // Insert optimistic placeholder rows immediately
    const kw = keywordInput.trim();
    const makeId = () => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `temp-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const now = Date.now();
    const newTemps: OptimisticArticle[] = Array.from({ length: count }).map((_, idx) => ({
      id: makeId(),
      title: 'Processing...€¦',
      keyword: kw,
      doc_link: null,
      content: null,
      status: 'processing',
      _temp: true,
      createdTs: now + idx // preserve order of creation
    }));
    setOptimisticRows(prev => [...newTemps, ...prev]);
    setToast(`Started processing ${count} article${count > 1 ? 's' : ''} for "${kw}"`);
    setTimeout(() => setToast(null), 3500);
    // Close modal right away; we will refetch in background
    setShowAddModal(false);
    try {
      const resp = await fetch('https://groundstandard.app.n8n.cloud/webhook/Research', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          keyword: kw,
          count,
          business_name: bizName || undefined,
          city: city || undefined,
          state: provState || undefined,
          call_to_action: callToAction || undefined,
        })
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Webhook error: ${resp.status} ${txt}`);
      }
      setSendSuccess(true);
      setKeywordInput('');
      setKeywordCount('1');
      setBizName('');
      setCity('');
      setProvState('');
      setCallToAction('');
      // Optionally refetch after a brief delay in case the webhook inserts into DB
      setTimeout(() => {
        refetch();
      }, 1200);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send keyword');
    } finally {
      setSending(false);
    }
  };

  // Chat reset now lives inside ChatWidget
  
  // Open modal to choose word limit for Write
  const handleWriteForArticle = (article: ResearchArticle) => {
    setArticleToWrite(article);
    setWordLimit(1000);
    setExtraKeywords([]);
    setNewKeyword('');
    setShowWriteModal(true);
  };

  const handleAddKeyword = () => {
    const trimmed = newKeyword.trim();
    if (!trimmed) return;
    if (extraKeywords.includes(trimmed)) return; // no duplicates
    if (extraKeywords.length >= maxKeywords) return; // max reached
    setExtraKeywords([...extraKeywords, trimmed]);
    setNewKeyword('');
  };

  const handleRemoveKeyword = (kw: string) => {
    setExtraKeywords(extraKeywords.filter(k => k !== kw));
  };

  // Confirm and send the selected article id + title + word limit to the Write webhook
  const handleConfirmWrite = async () => {
    if (!articleToWrite) return;
    const article = articleToWrite;
    const key = String(article.id ?? article.title);
    setShowWriteModal(false);
    setArticleToWrite(null);
    setWritingIds(prev => new Set(prev).add(key));
    try {
      const resp = await fetch('https://groundstandard.app.n8n.cloud/webhook/Write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: article.id,
          title: article.title,
          word_limit: wordLimit,
          additional_keywords: extraKeywords,
          mentions_per_keyword: { min: mentionRange.min, max: mentionRange.max },
        })
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Webhook error: ${resp.status} ${txt}`);
      }
      // After a successful request, refresh data to reflect any status changes
      setTimeout(() => { refetch(); }, 800);
    } catch (err) {
      console.error('Delete failed', err);
      const msg = err instanceof Error ? err.message : 'Failed to delete row';
      window.alert(msg);
    } finally {
      setWritingIds(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // Delete an article by id from Supabase
  const handleDeleteArticle = async (id: number | string, title?: string) => {
    if (id === undefined || id === null) return;
    const confirmed = window.confirm(`Delete this item${title ? `: "${title}"` : ''}? This cannot be undone.`);
    if (!confirmed) return;
    setDeletingIds(prev => new Set(prev).add(id));
    try {
      const { error: delError } = await supabase
        .from('Research')
        .delete()
        .eq('id', id);
      if (delError) throw delError;
      await refetch();
    } catch (err) {
      console.error('Delete failed', err);
      const msg = err instanceof Error ? err.message : 'Failed to delete row';
      window.alert(msg);
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const filteredArticles = useMemo(() => {
    if (!articles) return [];
    // Start with real articles
    const real = articles.filter(article => {
      const matchesSearch = article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          article.keyword.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || article.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
    // Add optimistic rows that match the filters
    const optimistic = optimisticRows.filter(row => {
      const matchesSearch = row.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           row.keyword.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
    // Merge and sort: optimistic first (newest first), then real by id desc
    type ViewArticle = (ResearchArticle & { _temp?: false; createdTs?: number }) | OptimisticArticle;
    const combined: ViewArticle[] = [...optimistic, ...real];
    combined.sort((a: ViewArticle, b: ViewArticle) => {
      const aTemp = !!a._temp;
      const bTemp = !!b._temp;
      if (aTemp && bTemp) return ((b as OptimisticArticle).createdTs || 0) - ((a as OptimisticArticle).createdTs || 0);
      if (aTemp) return -1;
      if (bTemp) return 1;
      const aId = typeof a.id === 'number' ? a.id : parseInt(String(a.id), 10) || 0;
      const bId = typeof b.id === 'number' ? b.id : parseInt(String(b.id), 10) || 0;
      return bId - aId; // newest first
    });
    return combined;
  }, [articles, searchTerm, statusFilter, optimisticRows]);

  const totalPages = Math.ceil(filteredArticles.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedArticles = filteredArticles.slice(startIndex, startIndex + itemsPerPage);

  const toggleSelectAllOnPage = () => {
    const idsOnPage = paginatedArticles
      .filter(a => !(a as any)._temp)
      .map(a => (a as any).id)
      .filter((id) => id !== undefined && id !== null);
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = idsOnPage.every(id => next.has(id));
      if (allSelected) {
        idsOnPage.forEach(id => next.delete(id));
      } else {
        idsOnPage.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const toggleSelectOne = (id: number | string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const idsToDelete = Array.from(selectedIds).filter(id => id !== undefined && id !== null);
    if (idsToDelete.length === 0) return;
    const confirmed = window.confirm(`Delete ${idsToDelete.length} selected item${idsToDelete.length > 1 ? 's' : ''}? This cannot be undone.`);
    if (!confirmed) return;
    setDeletingIds(prev => {
      const next = new Set(prev);
      idsToDelete.forEach(id => next.add(id));
      return next;
    });
    try {
      const { error: delError } = await supabase
        .from('Research')
        .delete()
        .in('id', idsToDelete as any);
      if (delError) throw delError;
      setSelectedIds(new Set());
      await refetch();
    } catch (err) {
      console.error('Bulk delete failed', err);
      const msg = err instanceof Error ? err.message : 'Failed to delete selected rows';
      window.alert(msg);
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        idsToDelete.forEach(id => next.delete(id));
        return next;
      });
    }
  };

  // Prune optimistic placeholders as real rows arrive for a given keyword
  // If we detect N real rows for a keyword, remove up to N placeholders for that keyword.
  useEffect(() => {
    if (!articles || optimisticRows.length === 0) return;
    const kwGroups: Record<string, number> = {};
    for (const a of articles) {
      kwGroups[a.keyword] = (kwGroups[a.keyword] || 0) + 1;
    }
    setOptimisticRows(prev => {
      const remaining: OptimisticArticle[] = [];
      const toRemoveCount: Record<string, number> = {};
      for (const row of prev) {
        const allow = kwGroups[row.keyword] || 0;
        const removedSoFar = toRemoveCount[row.keyword] || 0;
        if (removedSoFar < allow) {
          toRemoveCount[row.keyword] = removedSoFar + 1;
          continue; // drop this placeholder
        }
        remaining.push(row);
      }
      return remaining;
    });
  }, [articles, optimisticRows.length]);

  const stats = useMemo(() => {
    if (!articles) return { total: 0, newCount: 0, withLinks: 0, withoutLinks: 0 };
    
    const total = articles.length;
    const newCount = articles.filter(a => a.status === 'new').length;
    const withLinks = articles.filter(a => a.doc_link && a.doc_link.trim() !== '').length;
    const withoutLinks = total - withLinks;

    return { total, newCount, withLinks, withoutLinks };
  }, [articles]);

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      new: { color: 'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border-blue-300', label: 'New', icon: null },
      writing: { color: 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-800 border-gray-300', label: 'Writing', icon: Edit3 },
      Used: { color: 'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border-blue-300', label: 'Completed', icon: CheckCircle },
      error: { color: 'bg-gradient-to-r from-red-100 to-red-200 text-red-800 border-red-300', label: 'Error', icon: AlertCircle },
      processing: { color: 'bg-gradient-to-r from-red-100 to-red-200 text-red-800 border-red-300', label: 'Processing', icon: Loader2 }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.new;
    const IconComponent = config.icon;

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${config.color}`}>
        {IconComponent && (
          <IconComponent className={`w-3 h-3 ${status === 'processing' ? 'animate-spin' : ''}`} />
        )}
        {config.label}
      </span>
    );
  };

  const renderDocLink = (docLink: string | null) => {
    if (docLink === null) {
      return <span className="text-gray-400 text-sm font-medium">Click "Write" to generate document link</span>;
    }
    const trimmed = docLink.trim();
    if (!trimmed || trimmed.toUpperCase() === 'EMPTY') {
      return <span className="text-yellow-600 text-sm font-medium">EMPTY</span>;
    }
    const isUrl = /^https?:\/\//i.test(trimmed);
    if (isUrl) {
      return (
        <a href={trimmed} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
          {trimmed}
        </a>
      );
    }
    return <span className="text-gray-600 break-all">{trimmed}</span>;
  };

  const renderContentLink = (title: string, content?: string | null) => {
    const trimmed = (content ?? '').trim();
    if (!trimmed) {
      return <span className="text-gray-400 text-sm">Click "Write" to generate content</span>;
    }

    // Remove the first <h1>...</h1> so the modal header title isn't duplicated in the body
    const stripped = trimmed.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '').trim();

    // Start from the body HTML we actually want to show and normalize escaped newlines
    let htmlForModal = (stripped || trimmed)
      // webhook returns literal "\n\n" between paragraphs; turn into real blank lines
      .replace(/\\n\\n/g, '\n\n')
      .replace(/\\n/g, '\n');

    // Treat "H2:" markers from the generator as Word-style section headings.
    // We approximate the heading as the text from "H2:" up to the next period.
    // Example: "H2: Upgrade the Graphics Card. For individuals..." becomes
    // "<h2>Upgrade the Graphics Card</h2> For individuals..."
    htmlForModal = htmlForModal.replace(
      /H2:\s*(?:\d+\.\s*)?([^\.]+)\./g,
      (_match, heading) => `<h2 style="font-size: 1.5rem; font-weight: bold;">${String(heading).trim()}</h2>`
    );

    // Pattern 1: phrases like "Click here https://example.com" or "Click here: https://example.com"
    // Become a proper anchor where the visible text is the URL (not the words "Click here")
    htmlForModal = htmlForModal.replace(
      /(Click here)(?:\s*[:\-]\s*|\s+)(https?:\/\/[^\s<>"]+)/gi,
      (_match, _label, url) => `<a href="${String(url)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">${String(url)}<\/a>`
    );

    // Normalize any anchors whose inner text is literally "Click here" to display the actual URL
    htmlForModal = htmlForModal.replace(
      /<a([^>]*?)href="([^"]+)"([^>]*)>\s*(?:Click here|click here)\s*<\/a>/g,
      '<a$1href="$2"$3>$2<\/a>'
    );

    // Pattern 2: lines like
    //   https://example.com">Some label text
    // Become a proper anchor where the URL is the href and the trailing text is the label
    htmlForModal = htmlForModal.replace(
      /(https?:\/\/[^"\s<>]+)"?>\s*([^\n<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">$2<\/a>'
    );

    // Pattern 3: bare URLs with no trailing ">label
    // Use a callback so we can avoid touching URLs that are already inside an href attribute
    htmlForModal = htmlForModal.replace(
      /(https?:\/\/[^\s<>"]+)/g,
      (match, url, offset, full) => {
        const before = (full as string).slice(0, offset as number);
        if (before.endsWith('href="') || before.endsWith("href='")) {
          // Already part of an href, leave it as-is
          return match;
        }
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">${url}<\/a>`;
      }
    );

    // If there are no existing <p> tags, create paragraphs and bullet lists
    // from blank-line-separated blocks. This gives Word-like spacing.
    if (!/<p[\s>]/i.test(htmlForModal)) {
      const normalized = htmlForModal.replace(/\r\n/g, '\n');
      const blocks = normalized.split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);
      if (blocks.length > 0) {
        htmlForModal = blocks
          .map(block => {
            const lines = block.split(/\n+/).map(l => l.trim()).filter(Boolean);
            const allBullets = lines.length > 1 && lines.every(l => /^(?:[•\-]\s+)/.test(l));
            if (allBullets) {
              const items = lines.map(l => l.replace(/^([•\-]\s+)/, ''));
              return `<ul>${items.map(it => `<li>${it}</li>`).join('')}</ul>`;
            }
            const single = lines.length === 1 ? lines[0] : '';
            if (single) {
              const words = single.split(/\s+/);
              const caps = words.filter(w => /^(?:[A-Z][a-z]|THC|CBD|NJ|USA)/.test(w)).length;
              const looksLikeHeading = single.length < 90 && !/[.!?]$/.test(single) && (caps / Math.max(1, words.length)) >= 0.5;
              if (looksLikeHeading) {
                return `<h2 style="font-size:1.5rem;font-weight:800;">${single}</h2>`;
              }
            }
            return `<p>${block}</p>`;
          })
          .join('');
      } else if (normalized.trim()) {
        htmlForModal = `<p>${normalized.trim()}</p>`;
      }
    }

    return (
      <button
        type="button"
        onClick={() => {
          setContentTitle(title);
          setContentToShow(htmlForModal);
          setShowContentModal(true);
        }}
        className="text-indigo-600 hover:underline text-sm font-medium"
      >
        View content
      </button>
    );
  };

  // Chat logic lives in ChatWidget now

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-sm p-8 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Connection Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={refetch}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Modern Header */}
      <div className="bg-black/95 backdrop-blur-sm border-b border-gray-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-red-700 rounded-xl flex items-center justify-center shadow-lg">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    Article Dashboard
                  </h1>
                  <p className="text-sm text-gray-300">Create, monitor and manage your content</p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button 
                onClick={refetch}
                disabled={loading || isBusy}
                className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button 
                onClick={() => !isBusy && setShowAddModal(true)} 
                disabled={isBusy} 
                className="inline-flex items-center px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Article
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modern Add Article Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!sending) setShowAddModal(false); }} />
          <div className="relative bg-white/95 backdrop-blur-sm w-full max-w-lg mx-auto rounded-2xl shadow-2xl border border-gray-200 p-8 z-10 animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-red-700 rounded-xl flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-black">Create New Articles</h3>
                  <p className="text-sm text-gray-600">Generate articles from your keyword</p>
                </div>
              </div>
              <button
                onClick={() => { if (!sending) setShowAddModal(false); }}
                disabled={sending}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-all duration-200"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendKeyword} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-black mb-3">Generate Topic</label>
                <input
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  placeholder="Enter topic or subject to generate articles about..."
                  disabled={sending}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 disabled:opacity-50 transition-all duration-200 text-black placeholder-gray-500"
                />
              </div>
              {/* Optional business context fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-black mb-2">Name of business (optional)</label>
                  <input
                    type="text"
                    value={bizName}
                    onChange={(e) => setBizName(e.target.value)}
                    placeholder="Enter business name"
                    disabled={sending}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 disabled:opacity-50 transition-all duration-200 text-black placeholder-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-black mb-2">City (optional)</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Enter city"
                    disabled={sending}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 disabled:opacity-50 transition-all duration-200 text-black placeholder-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-black mb-2">State/Province (optional)</label>
                  <input
                    type="text"
                    value={provState}
                    onChange={(e) => setProvState(e.target.value)}
                    placeholder="Enter state or province"
                    disabled={sending}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 disabled:opacity-50 transition-all duration-200 text-black placeholder-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-black mb-2">Call to action (optional)</label>
                  <input
                    type="text"
                    value={callToAction}
                    onChange={(e) => setCallToAction(e.target.value)}
                    placeholder="Enter a call to action"
                    disabled={sending}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 disabled:opacity-50 transition-all duration-200 text-black placeholder-gray-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-3">Number of Articles? (max 10)</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const v = parseInt((keywordCount || '1'), 10);
                      const next = Math.max(1, (Number.isNaN(v) ? 1 : v) - 1);
                      setKeywordCount(String(next));
                    }}
                    disabled={sending}
                    className="w-10 h-10 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-xl text-black font-semibold disabled:opacity-50 transition-all duration-200 flex items-center justify-center"
                    aria-label="Decrement"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    step={1}
                    value={keywordCount}
                    onChange={(e) => setKeywordCount(e.target.value)}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value || '1', 10);
                      const clamped = Math.min(10, Math.max(1, Number.isNaN(v) ? 1 : v));
                      setKeywordCount(String(clamped));
                    }}
                    disabled={sending}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 disabled:opacity-50 transition-all duration-200 text-center font-semibold text-black"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = parseInt((keywordCount || '1'), 10);
                      const next = Math.min(10, (Number.isNaN(v) ? 1 : v) + 1);
                      setKeywordCount(String(next));
                    }}
                    disabled={sending}
                    className="w-10 h-10 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-xl text-black font-semibold disabled:opacity-50 transition-all duration-200 flex items-center justify-center"
                    aria-label="Increment"
                  >
                    +
                  </button>
                </div>
              </div>

              {sendError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-red-800">{sendError}</span>
                  </div>
                </div>
              )}
              {sendSuccess && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-green-800">Articles are being generated successfully!</span>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { if (!sending) setShowAddModal(false); }}
                  disabled={sending}
                  className="flex-1 px-6 py-3 border border-gray-300 rounded-xl text-sm font-semibold text-black bg-white hover:bg-gray-50 disabled:opacity-50 transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="flex-1 inline-flex items-center justify-center px-6 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Create Articles
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rewrite Prompt Modal */}
      {showRewriteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { setShowRewriteModal(false); setArticleToRewrite(null); setRewriteInstructions(''); }}
          />
          <div className="relative bg-white w-full max-w-lg mx-auto rounded-lg shadow-lg border p-6 z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Rewrite Article</h3>
              <button
                onClick={() => { setShowRewriteModal(false); setArticleToRewrite(null); setRewriteInstructions(''); }}
                className="p-2 rounded hover:bg-gray-100 text-gray-600"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {articleToRewrite && (
              <p className="text-sm text-gray-600 mb-3">{articleToRewrite.title}</p>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instructions or prompt</label>
                <textarea
                  value={rewriteInstructions}
                  onChange={(e) => setRewriteInstructions(e.target.value)}
                  rows={5}
                  placeholder="Describe how you want the content to be rewritten (tone, target audience, include/exclude parts, etc.)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setShowRewriteModal(false); setArticleToRewrite(null); setRewriteInstructions(''); }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRewrite}
                  className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700"
                >
                  Rewrite
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Write Options Modal */}
      {showWriteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { setShowWriteModal(false); setArticleToWrite(null); setExtraKeywords([]); setNewKeyword(''); }}
          />
          <div className="relative bg-white w-full max-w-sm mx-auto rounded-lg shadow-lg border p-6 z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Write Options</h3>
              <button
                onClick={() => { setShowWriteModal(false); setArticleToWrite(null); setExtraKeywords([]); setNewKeyword(''); }}
                className="p-2 rounded hover:bg-gray-100 text-gray-600"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Word limit</label>
                <select
                  value={wordLimit}
                  onChange={(e) => setWordLimit(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value={500}>500 words</option>
                  <option value={1000}>1000 words</option>
                  <option value={1500}>1500 words</option>
                  <option value={2000}>2000 words</option>
                  <option value={2500}>2500 words</option>
                  <option value={3000}>3000 words</option>
                </select>
              </div>
              {maxKeywords > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Additional keywords ({extraKeywords.length}/{maxKeywords})</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddKeyword(); } }}
                    placeholder="Enter keyword"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleAddKeyword}
                    disabled={extraKeywords.length >= maxKeywords || !newKeyword.trim()}
                    className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                    title="Add keyword"
                  >
                    +
                  </button>
                </div>
                {extraKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {extraKeywords.map((kw) => (
                      <span key={kw} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-800 rounded-md text-xs">
                        {kw}
                        <button
                          type="button"
                          onClick={() => handleRemoveKeyword(kw)}
                          className="text-gray-500 hover:text-gray-700"
                          aria-label="Remove"
                        >
                          
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setShowWriteModal(false); setArticleToWrite(null); setExtraKeywords([]); setNewKeyword(''); }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmWrite}
                  className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700"
                >
                  Write
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Content Modal */}
      {showContentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowContentModal(false)}
          />
          <div className="relative bg-white w-full max-w-2xl mx-auto rounded-lg shadow-lg border p-6 z-10 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{contentTitle || 'Article Content'}</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyContent}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-gray-800 text-white shadow-sm hover:bg-gray-700"
                  aria-label="Copy content"
                  title="Copy"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => setShowContentModal(false)}
                  className="p-2 rounded hover:bg-gray-100 text-gray-600"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="overflow-auto pr-1">
              <div
                className="prose prose-lg max-w-none text-gray-900 leading-relaxed prose-p:my-4 prose-h2:mt-6 prose-h2:mb-3 prose-h2:text-gray-900 prose-h2:font-extrabold prose-strong:font-semibold prose-ul:my-4 prose-ol:my-4 prose-li:my-1 prose-a:text-blue-600 prose-a:underline"
                dangerouslySetInnerHTML={{ __html: contentToShow }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="max-w-[81vw] mx-auto px-6 py-8">
        {/* Professional Analytics Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
          {/* Total Articles Card */}
          <div className="relative bg-white rounded-3xl p-8 border-2 border-gray-100 shadow-md hover:shadow-lg transition-all duration-500 group overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-50 to-blue-100 rounded-full -mr-16 -mt-16 opacity-50"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                    <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Total Articles</p>
                  </div>
                  <p className="text-4xl font-black text-black mb-2">{stats.total}</p>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-1 bg-gradient-to-r from-blue-600 to-blue-400 rounded-full"></div>
                    <span className="text-xs font-semibold text-gray-400">CONTENT LIBRARY</span>
                  </div>
                </div>
                <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  <FileText className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* New Items Card */}
          <div className="relative bg-white rounded-3xl p-8 border-2 border-gray-100 shadow-md hover:shadow-lg transition-all duration-500 group overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-red-50 to-red-100 rounded-full -mr-16 -mt-16 opacity-50"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-3 h-3 bg-red-600 rounded-full"></div>
                    <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">New Items</p>
                  </div>
                  <p className="text-4xl font-black text-black mb-2">{stats.newCount}</p>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-1 bg-gradient-to-r from-red-600 to-red-400 rounded-full"></div>
                    <span className="text-xs font-semibold text-gray-400">PENDING REVIEW</span>
                  </div>
                </div>
                <div className="w-16 h-16 bg-gradient-to-br from-red-600 to-red-700 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  <Clock className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* With Links Card */}
          <div className="relative bg-white rounded-3xl p-8 border-2 border-gray-100 shadow-md hover:shadow-lg transition-all duration-500 group overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-50 to-blue-100 rounded-full -mr-16 -mt-16 opacity-50"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                    <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">With Links</p>
                  </div>
                  <p className="text-4xl font-black text-black mb-2">{stats.withLinks}</p>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-1 bg-gradient-to-r from-blue-600 to-blue-400 rounded-full"></div>
                    <span className="text-xs font-semibold text-gray-400">LINKED CONTENT</span>
                  </div>
                </div>
                <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  <CheckCircle className="w-8 h-8 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Processing Card */}
          <div className="relative bg-white rounded-3xl p-8 border-2 border-gray-100 shadow-md hover:shadow-lg transition-all duration-500 group overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-red-50 to-red-100 rounded-full -mr-16 -mt-16 opacity-50"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-3 h-3 bg-red-600 rounded-full ${optimisticRows.length > 0 ? 'animate-pulse' : ''}`}></div>
                    <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Processing</p>
                  </div>
                  <p className="text-4xl font-black text-black mb-2">{optimisticRows.length}</p>
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-1 bg-gradient-to-r from-red-600 to-red-400 rounded-full ${optimisticRows.length > 0 ? 'animate-pulse' : ''}`}></div>
                    <span className="text-xs font-semibold text-gray-400">IN PROGRESS</span>
                  </div>
                </div>
                <div className="w-16 h-16 bg-gradient-to-br from-red-600 to-red-700 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  <Loader2 className={`w-8 h-8 text-white ${optimisticRows.length > 0 ? 'animate-spin' : ''}`} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Search & Filter Section */}
        <div className="bg-gradient-to-r from-white via-blue-50/30 to-white border-2 border-gray-100 rounded-3xl shadow-lg mb-8 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600/5 via-transparent to-red-600/5 p-1">
            <div className="bg-white rounded-[20px] p-6">
              <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between">
                <div className="flex-1 max-w-md">
                  <div className="relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-blue-400/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-blue-600 z-10" />
                      <input
                        type="text"
                        placeholder="Search articles, keywords..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-gradient-to-r from-gray-50 to-blue-50/50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white transition-all duration-300 text-black placeholder-gray-500 font-medium shadow-sm"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3 bg-gradient-to-r from-gray-50 to-blue-50/50 px-4 py-2 rounded-xl border border-gray-200">
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                    <Filter className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-bold text-gray-700">Filter:</span>
                  </div>
                  <div className="relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-red-600/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="relative px-4 py-2.5 bg-gradient-to-r from-gray-50 to-blue-50/50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-300 text-black font-bold min-w-[140px] shadow-sm hover:shadow-md"
                    >
                      <option value="all">All Statuses</option>
                      <option value="new">New</option>
                      <option value="writing">Writing</option>
                      <option value="Used">Completed</option>
                      <option value="processing">Processing</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Professional Table */}
        <div className="bg-gradient-to-r from-white via-gray-50/30 to-white border-2 border-gray-100 rounded-3xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600/5 via-transparent to-red-600/5 p-1">
            <div className="bg-white rounded-[20px] overflow-hidden">
            {paginatedArticles.length > 0 && selectedIds.size > 0 && (
              <div className="flex items-center justify-between px-6 pt-4 pb-2">
                <div className="text-sm text-gray-600">
                  <span className="font-medium">{selectedIds.size} selected</span>
                </div>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-900 shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <Trash className="w-4 h-4 mr-2" />
                  Delete selected
                </button>
              </div>
            )}
            {loading && paginatedArticles.length === 0 && rewritingIds.size === 0 && (
              <div className="flex items-center justify-center py-16">
                <div className="flex flex-col items-center space-y-4">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                  <span className="text-slate-600 font-medium">Loading articles...</span>
                </div>
              </div>
            )}
            
            {!loading && paginatedArticles.length === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-xl font-semibold text-black mb-2">No articles found</h3>
                <p className="text-gray-600 max-w-md mx-auto">
                  {searchTerm || statusFilter !== 'all' 
                    ? 'Try adjusting your search or filters to find what you\'re looking for' 
                    : 'Get started by creating your first article'}
                </p>
              </div>
            )}
            
            {paginatedArticles.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed">
                <thead className="bg-gradient-to-r from-blue-50/50 via-gray-50 to-red-50/50">
                  <tr className="border-b-[3px] border-gray-200">
                    <th className="w-[4%] px-4 py-6 text-center text-sm font-black text-gray-800 uppercase tracking-wider">
                      {selectedIds.size > 0 && (
                        <input
                          type="checkbox"
                          checked={paginatedArticles
                            .filter(a => !(a as any)._temp)
                            .every(a => selectedIds.has((a as any).id)) && paginatedArticles.filter(a => !(a as any)._temp).length > 0}
                          onChange={toggleSelectAllOnPage}
                        />
                      )}
                    </th>
                    <th className="w-[33%] px-8 py-6 text-left text-sm font-black text-gray-800 uppercase tracking-wider">
                      <div className="flex items-center gap-3 group">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-200">
                          <FileText className="w-4 h-4 text-white" />
                        </div>
                        <span className="bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">Article Title</span>
                      </div>
                    </th>
                    <th className="w-[14%] px-8 py-6 text-left text-sm font-black text-gray-800 uppercase tracking-wider">
                      <div className="flex items-center gap-3 group">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-200">
                          <Search className="w-4 h-4 text-white" />
                        </div>
                        <span className="bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">Keyword</span>
                      </div>
                    </th>
                    <th className="w-[24%] px-8 py-6 text-left text-sm font-black text-gray-800 uppercase tracking-wider">
                      <div className="flex items-center gap-3 group">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-200">
                          <Eye className="w-4 h-4 text-white" />
                        </div>
                        <span className="bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">Document Link</span>
                      </div>
                    </th>
                    <th className="w-[15%] px-8 py-6 text-left text-sm font-black text-gray-800 uppercase tracking-wider">
                      <div className="flex items-center gap-3 group">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-200">
                          <FileText className="w-4 h-4 text-white" />
                        </div>
                        <span className="bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">Content</span>
                      </div>
                    </th>
                    <th className="w-[11%] px-8 py-6 text-center text-sm font-black text-gray-800 uppercase tracking-wider">
                      <div className="flex items-center justify-center">
                        <span className="bg-gradient-to-r from-red-600 to-red-800 bg-clip-text text-transparent">Actions</span>
                      </div>
                                        </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                {paginatedArticles.map((article: (ResearchArticle & { _temp?: false; createdTs?: number }) | OptimisticArticle, index) => {
                  const rowKey = String((article as any).id ?? (article as any).title);
                  const isRewriting = rewritingIds.has(rowKey);
                  const isWritingRow = writingIds.has(rowKey);
                  return (
                  <tr key={`${article.id}`} className={`hover:bg-blue-50/50 transition-all duration-300 group border-l-4 border-transparent hover:border-blue-500 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <td className="px-4 py-6 text-center">
                      {!(article as any)._temp && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has((article as any).id)}
                          onChange={() => toggleSelectOne((article as any).id)}
                        />
                      )}
                    </td>
                    <td className="px-8 py-6">
                      {article._temp ? (
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-red-700 rounded-xl flex items-center justify-center shadow-lg">
                            <Loader2 className="w-5 h-5 animate-spin text-white" />
                          </div>
                          <div className="flex-1">
                            <div className="font-bold text-black text-base">Article is processing...</div>
                            <div className="text-sm text-gray-600 mt-1">Please wait while we generate your content</div>
                          </div>
                        </div>
                      ) : (
                        <div className="group cursor-pointer">
                          <div className="font-bold text-black text-base group-hover:text-blue-600 transition-colors duration-200 line-clamp-3 leading-relaxed">
                            {article.title}
                          </div>
                          <div className="text-xs text-gray-500 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            Click to view details
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex justify-start">
                        <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold bg-gradient-to-r from-blue-100 to-blue-200 text-blue-900 border-2 border-blue-300 shadow-sm">
                          {article.keyword}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      {article._temp ? (
                        <div className="space-y-3">
                          <div className="w-full h-5 bg-gray-200 rounded-lg animate-pulse" />
                          <div className="w-4/5 h-4 bg-gray-200 rounded-lg animate-pulse" />
                          <div className="w-3/5 h-3 bg-gray-200 rounded animate-pulse" />
                        </div>
                      ) : isWritingRow ? (
                        <div className="flex items-center gap-3">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.85)]" />
                          </span>
                          <span className="text-sm font-semibold text-blue-700">Writing link…</span>
                        </div>
                      ) : isRewriting ? (
                        <div className="flex items-center gap-3">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.85)]" />
                          </span>
                          <span className="text-sm font-semibold bg-gradient-to-r from-red-600 to-rose-500 bg-clip-text text-transparent animate-pulse">Updating link…</span>
                        </div>
                      ) : (
                        <div className="break-all">
                          {renderDocLink((article as any).doc_link)}
                        </div>
                      )}
                    </td>
                    <td className="px-8 py-6">
                      {article._temp ? (
                        <div className="w-28 h-10 bg-gray-200 rounded-xl animate-pulse" />
                      ) : isWritingRow ? (
                        <div className="flex items-center justify-center gap-3">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.85)]" />
                          </span>
                          <span className="text-sm font-semibold text-blue-700">Writing content…</span>
                        </div>
                      ) : isRewriting ? (
                        <div className="flex items-center justify-center gap-3">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.85)]" />
                          </span>
                          <span className="text-sm font-semibold bg-gradient-to-r from-red-600 to-rose-500 bg-clip-text text-transparent animate-pulse">Updating content…</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center">
                          {renderContentLink((article as any).title, (article as any).content)}
                        </div>
                      )}
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center justify-center">
                        {article._temp ? (
                          <div className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-gradient-to-r from-red-600 to-rose-600 shadow-sm">
                            <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                            Processing
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2 justify-center">
                            {article.status === 'new' ? (
                              (() => {
                                const isWriting = writingIds.has(String((article as any).id ?? (article as any).title));
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleWriteForArticle(article as ResearchArticle)}
                                    disabled={isWriting}
                                    className="group inline-flex items-center justify-center h-10 min-w-[40px] px-0 group-hover:px-3 text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isWriting ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Edit3 className="w-4 h-4" />
                                    )}
                                    <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-[120px] group-hover:opacity-100 transition-all duration-200 whitespace-nowrap font-semibold text-sm ml-0 group-hover:ml-2">Write</span>
                                  </button>
                                );
                              })()
                            ) : article.status === 'Used' ? (
                              (
                                <button
                                  type="button"
                                  onClick={() => handleOpenRewriteModal(article as ResearchArticle)}
                                  disabled={isRewriting}
                                  className="group inline-flex items-center justify-center h-10 min-w-[40px] px-0 group-hover:px-3 text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isRewriting ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="w-4 h-4" />
                                  )}
                                  <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-[120px] group-hover:opacity-100 transition-all duration-200 whitespace-nowrap font-semibold text-sm ml-0 group-hover:ml-2">Rewrite</span>
                                </button>
                              )
                            ) : (
                              <div className="flex items-center justify-center">
                                {getStatusBadge((article as any).status)}
                              </div>
                            )}
                            {/* Delete button for any non-temp row */}
                            <button
                              type="button"
                              onClick={() => handleDeleteArticle((article as any).id, (article as any).title)}
                              disabled={deletingIds.has((article as any).id)}
                              className="group inline-flex items-center justify-center h-10 min-w-[40px] px-0 group-hover:px-3 text-white bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-900 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50"
                              title="Delete"
                            >
                              {deletingIds.has((article as any).id) ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash className="w-4 h-4" />
                              )}
                              <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-[120px] group-hover:opacity-100 transition-all duration-200 whitespace-nowrap font-semibold text-sm ml-0 group-hover:ml-2">Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
            </div>
            )}
          </div>

          {/* Enhanced Professional Pagination */}
          {!loading && totalPages > 1 && (
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-8 py-6 border-t-2 border-gray-200 rounded-b-2xl">
              <div className="flex items-center justify-between">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-6 py-3 text-sm font-bold text-black bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-6 py-3 text-sm font-bold text-black bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                  >
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex sm:items-center sm:justify-between sm:flex-1">
                  <div className="bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm">
                    <p className="text-sm text-gray-600">
                      Showing <span className="font-bold text-black">{startIndex + 1}</span> to{' '}
                      <span className="font-bold text-black">{Math.min(startIndex + itemsPerPage, filteredArticles.length)}</span> of{' '}
                      <span className="font-bold text-blue-600">{filteredArticles.length}</span> results
                    </p>
                  </div>
                  <div>
                    <nav className="flex items-center space-x-3">
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="inline-flex items-center px-5 py-3 text-sm font-bold text-black bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                      >
                        Previous
                      </button>
                      <div className="flex items-center space-x-2">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`inline-flex items-center px-4 py-3 text-sm font-bold rounded-xl transition-all duration-200 shadow-sm ${
                              page === currentPage
                                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg border-2 border-blue-500 transform scale-110'
                                : 'text-black bg-white border-2 border-gray-300 hover:bg-gray-50 hover:border-blue-400'
                            }`}
                          >
                            {page}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="inline-flex items-center px-5 py-3 text-sm font-bold text-black bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                      >
                        Next
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
        
        {/* Back to Top Button */}
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

        {/* Floating Chat Widget (bottom-left) */}
        <ChatWidget webhookUrl="https://groundstandard.app.n8n.cloud/webhook/chat-bot" />
        {toast && (
          <div className="fixed top-6 right-6 z-50 animate-in slide-in-from-right-full duration-300">
            <div className="bg-white/90 backdrop-blur-sm border border-gray-200 text-black px-6 py-4 rounded-xl shadow-xl text-sm font-medium max-w-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  {toast}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
