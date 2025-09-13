import { useState, useMemo, type FormEvent } from 'react';
import { Search, BarChart3, FileText, Clock, CheckCircle, RefreshCw, AlertCircle, X, Send } from 'lucide-react';
import { useResearchData } from '../hooks/useResearchData';

export default function Dashboard() {
  const { articles, loading, error, refetch } = useResearchData();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  // Modal state for sending a Keyword to webhook
  const [showAddModal, setShowAddModal] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);
  // Modal state for Write Article webhook
  const [showWriteModal, setShowWriteModal] = useState(false);
  const [writeKeywordInput, setWriteKeywordInput] = useState('');
  const [writeSending, setWriteSending] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [writeSuccess, setWriteSuccess] = useState(false);
  const isBusy = sending || writeSending;

  const handleSendKeyword = async (e: FormEvent) => {
    e.preventDefault();
    if (!keywordInput.trim()) {
      setSendError('Please enter a keyword');
      setSendSuccess(false);
      return;
    }
    setSending(true);
    setSendError(null);
    setSendSuccess(false);
    try {
      const resp = await fetch('https://groundstandard.app.n8n.cloud/webhook/Research', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ keyword: keywordInput.trim() })
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Webhook error: ${resp.status} ${txt}`);
      }
      setSendSuccess(true);
      setKeywordInput('');
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

  const handleSendWriteKeyword = async (e: FormEvent) => {
    e.preventDefault();
    if (!writeKeywordInput.trim()) {
      setWriteError('Please enter a keyword');
      setWriteSuccess(false);
      return;
    }
    setWriteSending(true);
    setWriteError(null);
    setWriteSuccess(false);
    try {
      const resp = await fetch('https://groundstandard.app.n8n.cloud/webhook/Write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: writeKeywordInput.trim() })
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Webhook error: ${resp.status} ${txt}`);
      }
      setWriteSuccess(true);
      setWriteKeywordInput('');
      setTimeout(() => { refetch(); }, 1200);
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : 'Failed to send keyword');
    } finally {
      setWriteSending(false);
    }
  };

  const filteredArticles = useMemo(() => {
    if (!articles) return [];
    return articles.filter(article => {
      const matchesSearch = article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          article.keyword.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || article.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [articles, searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredArticles.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedArticles = filteredArticles.slice(startIndex, startIndex + itemsPerPage);

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
      new: { color: 'bg-blue-100 text-blue-800', label: 'New' },
      writing: { color: 'bg-yellow-100 text-yellow-800', label: 'Writing' },
      Used: { color: 'bg-green-100 text-green-800', label: 'Used' },
      error: { color: 'bg-red-100 text-red-800', label: 'Error' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.new;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const renderDocLink = (docLink: string | null) => {
    if (docLink === null) {
      return <span className="text-gray-400 text-sm font-medium">NULL</span>;
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Article Dashboard</h1>
              <p className="mt-1 text-sm text-gray-500">Monitor and manage your article content</p>
            </div>
            <div className="flex space-x-3">
              <button 
                onClick={refetch}
                disabled={loading || isBusy}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button onClick={() => !isBusy && setShowAddModal(true)} disabled={isBusy} className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50">
                <FileText className="w-4 h-4 mr-2" />
                Add Article
              </button>
              <button onClick={() => !isBusy && setShowWriteModal(true)} disabled={isBusy} className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50">
                <FileText className="w-4 h-4 mr-2" />
                Write Article
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add Article Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { if (!sending) setShowAddModal(false); }} />
          <div className="relative bg-white w-full max-w-md mx-auto rounded-lg shadow-lg border p-6 z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Send Keyword</h3>
              <button
                onClick={() => { if (!sending) setShowAddModal(false); }}
                disabled={sending}
                className="p-2 rounded hover:bg-gray-100 text-gray-600 disabled:opacity-50"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendKeyword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Keyword</label>
                <input
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  placeholder="Enter a keyword"
                  disabled={sending}
                  className="w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                />
              </div>

              {sendError && (
                <div className="text-sm text-red-600">{sendError}</div>
              )}
              {sendSuccess && (
                <div className="text-sm text-green-600">Keyword sent successfully.</div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { if (!sending) setShowAddModal(false); }}
                  disabled={sending}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send className={`w-4 h-4 mr-2 ${sending ? 'animate-pulse' : ''}`} />
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Write Article Modal */}
      {showWriteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { if (!writeSending) setShowWriteModal(false); }} />
          <div className="relative bg-white w-full max-w-md mx-auto rounded-lg shadow-lg border p-6 z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Write Article</h3>
              <button
                onClick={() => { if (!writeSending) setShowWriteModal(false); }}
                disabled={writeSending}
                className="p-2 rounded hover:bg-gray-100 text-gray-600 disabled:opacity-50"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendWriteKeyword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Keyword</label>
                <input
                  type="text"
                  value={writeKeywordInput}
                  onChange={(e) => setWriteKeywordInput(e.target.value)}
                  placeholder="Enter a keyword"
                  disabled={writeSending}
                  className="w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50"
                />
              </div>

              {writeError && (
                <div className="text-sm text-red-600">{writeError}</div>
              )}
              {writeSuccess && (
                <div className="text-sm text-green-600">Keyword sent successfully.</div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { if (!writeSending) setShowWriteModal(false); }}
                  disabled={writeSending}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={writeSending}
                  className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Send className={`w-4 h-4 mr-2 ${writeSending ? 'animate-pulse' : ''}`} />
                  {writeSending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6 border">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <FileText className="w-8 h-8 text-blue-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Articles</dt>
                  <dd className="text-2xl font-semibold text-gray-900">{stats.total}</dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Clock className="w-8 h-8 text-amber-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">New Items</dt>
                  <dd className="text-2xl font-semibold text-gray-900">{stats.newCount}</dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">With Links</dt>
                  <dd className="text-2xl font-semibold text-gray-900">{stats.withLinks}</dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <BarChart3 className="w-8 h-8 text-purple-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Without Links</dt>
                  <dd className="text-2xl font-semibold text-gray-900">{stats.withoutLinks}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border mb-6">
          <div className="p-6 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search articles or keywords..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Statuses</option>
                  <option value="new">New</option>
                  <option value="writing">Writing</option>
                  <option value="Used">Used</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mr-3" />
                <span className="text-gray-600">Loading articles...</span>
              </div>
            )}
            
            {!loading && paginatedArticles.length === 0 && (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No articles found</h3>
                <p className="text-gray-500">
                  {searchTerm || statusFilter !== 'all' 
                    ? 'Try adjusting your search or filters' 
                    : 'No articles have been added yet'}
                </p>
              </div>
            )}
            
            {!loading && paginatedArticles.length > 0 && (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Keyword
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Doc Link
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedArticles.map((article) => (
                  <tr key={article.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 font-medium line-clamp-2 max-w-md">
                        {article.title}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {article.keyword}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {renderDocLink(article.doc_link)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(article.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                    <span className="font-medium">{Math.min(startIndex + itemsPerPage, filteredArticles.length)}</span> of{' '}
                    <span className="font-medium">{filteredArticles.length}</span> results
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          page === currentPage
                            ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                            : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}