import React, { useState, useEffect, useRef, type FormEvent } from 'react';
import { RefreshCw, X, Send, Download, Bot, User, Sparkles } from 'lucide-react';

interface ChatWidgetProps {
  webhookUrl: string;
}

type ChatMsg = { role: 'user' | 'bot'; text: string; ts: number };

const ChatWidget: React.FC<ChatWidgetProps> = ({ webhookUrl }) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [articleText, setArticleText] = useState('');
  const [copied, setCopied] = useState(false);
  const [sessionId, setSessionId] = useState<string>(() => (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `sess-${Date.now()}`);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // HTML -> plain text normalization
  const decodeHtmlEntities = (s: string) => s
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

  const normalizeWebhookReply = (raw: string) => {
    let text = raw.trim();
    const iframeMatch = text.match(/<iframe[^>]*srcdoc=("|')([\s\S]*?)(\1)[\s\S]*?>/i);
    if (iframeMatch) text = iframeMatch[2];
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      text = text.slice(1, -1);
    }
    text = decodeHtmlEntities(text);
    text = text.replace(/<[^>]*>/g, '');
    return text;
  };

  const copyArticle = async () => {
    try {
      const text = (latestArticle ?? '').toString();
      if (!text) return;
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
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

  // Parse various webhook response shapes into plain text and optional article
  const extractReply = (raw: string): { botText: string; article: string } => {
    let botText = '';
    let article = '';
    try {
      const parsed: unknown = JSON.parse(raw);
      const dig = (node: unknown): void => {
        if (node == null) return;
        if (typeof node === 'string') {
          if (!botText) botText = node;
          return;
        }
        if (Array.isArray(node)) {
          for (const item of node) dig(item);
          return;
        }
        if (typeof node === 'object') {
          const nodeObj = node as Record<string, unknown>;
          // Common shapes: {message, article} or {output: {message, article}}
          const maybe = nodeObj.output && typeof nodeObj.output === 'object' ? nodeObj.output as Record<string, unknown> : nodeObj;
          if (!botText && typeof maybe.message === 'string') botText = maybe.message;
          if (!article && typeof maybe.article === 'string') article = maybe.article;
          // In case nested deeper
          for (const key of Object.keys(nodeObj)) {
            if (typeof nodeObj[key] === 'object') dig(nodeObj[key]);
          }
        }
      };
      dig(parsed);
    } catch {
      // not JSON; treat as plain text
      botText = raw;
    }
    return { botText: normalizeWebhookReply(botText || raw), article: article ? normalizeWebhookReply(article) : '' };
  };

  // Latest article comes from webhook 'article' field
  const latestArticle = articleText;

  const downloadAsWord = () => {
    if (!latestArticle) return;
    // Basic HTML wrapped as .doc; MS Word will open it
    const esc = (s: string) => s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Article</title></head><body><pre style="white-space:pre-wrap;font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#111827;">${esc(latestArticle)}</pre></body></html>`;
    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    a.download = `article-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setMessages([]);
    setError(null);
    const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `sess-${Date.now()}`;
    setSessionId(id);
    setArticleText('');
  };

  const send = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setMessages((m) => [...m, { role: 'user', text, ts: Date.now() }]);
    setInput('');

    // start typing indicator
    const typingId = Date.now() + 1;
    setMessages((m) => [...m, { role: 'bot', text: '...typing', ts: typingId }]);

    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: sessionId })
      });
      const raw = await resp.text();
      const { botText, article } = extractReply(raw);
      if (!resp.ok) throw new Error(`Chat error: ${resp.status} ${botText || raw}`);
      // replace typing indicator with final bot message
      setMessages((m) => m.filter(msg => !(msg.role === 'bot' && msg.text === '...typing' && msg.ts === typingId)));
      setMessages((m) => [...m, { role: 'bot', text: botText, ts: Date.now() }]);
      if (article) setArticleText(article);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send message';
      setError(msg);
      setMessages((m) => m.filter(mm => !(mm.role === 'bot' && mm.text === '...typing')));
      setMessages((m) => [...m, { role: 'bot', text: `Error: ${msg}`, ts: Date.now() }]);
    } finally {
      setSending(false);
    }
  };

  // Auto-scroll to the newest message
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    // Use requestAnimationFrame to ensure DOM has painted
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages, open]);

  return (
    <div className="fixed bottom-6 left-6 z-40">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-700 hover:to-red-800 transition-all duration-300 hover:scale-105"
          aria-label="Open AI Assistant"
        >
          <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold">AI Assistant</div>
            <div className="text-xs text-white/80">Ask me anything</div>
          </div>
        </button>
      ) : (
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-2xl shadow-2xl overflow-hidden resize flex flex-col" style={{ width: '48vw', height: '60vh', minWidth: 600, minHeight: 360, maxWidth: '90vw', maxHeight: '85vh', resize: 'both' }}>
          {/* Modern Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-black to-gray-800">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-red-700 rounded-xl flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-lg font-bold text-white">AI Assistant</span>
                <div className="text-sm text-gray-300">Powered by advanced AI</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={reset}
                className="p-2.5 rounded-xl hover:bg-white/10 text-gray-300 hover:text-white transition-all duration-200"
                title="Reset conversation"
                aria-label="Reset conversation"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2.5 rounded-xl hover:bg-white/10 text-gray-300 hover:text-white transition-all duration-200"
                aria-label="Close chat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body: split left chat / right article preview */}
          <div className="flex flex-1 min-h-0">
            {/* Left: Chat */}
            <div className="w-1/2 flex flex-col bg-gradient-to-b from-gray-50 to-white">
              <div ref={chatScrollRef} className="flex-1 px-6 py-4 space-y-4 overflow-y-auto">
                {messages.length === 0 && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Bot className="w-8 h-8 text-gray-600" />
                    </div>
                    <div className="text-sm font-medium text-black mb-1">Welcome to AI Assistant</div>
                    <div className="text-xs text-gray-500">Start a conversation to generate articles</div>
                  </div>
                )}
                {messages.map((m, i) => {
                  const time = new Date(m.ts);
                  const ts = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const isTyping = m.role === 'bot' && m.text === '...typing';
                  return (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex items-start gap-3 max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          m.role === 'user' 
                            ? 'bg-gradient-to-br from-blue-600 to-blue-700' 
                            : 'bg-gradient-to-br from-red-600 to-red-700'
                        }`}>
                          {m.role === 'user' ? (
                            <User className="w-4 h-4 text-white" />
                          ) : (
                            <Bot className="w-4 h-4 text-white" />
                          )}
                        </div>
                        <div className={`px-4 py-3 rounded-2xl shadow-sm ${
                          m.role === 'user' 
                            ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white' 
                            : 'bg-white border border-gray-200 text-black'
                        }`}>
                          {isTyping ? (
                            <div className="flex items-center gap-1">
                              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                          ) : (
                            <pre className="whitespace-pre-wrap break-words text-sm">{m.text}</pre>
                          )}
                          {!isTyping && (
                            <div className={`mt-2 text-xs ${m.role === 'user' ? 'text-blue-100' : 'text-gray-500'}`}>{ts}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <form onSubmit={send} className="flex items-center gap-3 px-4 py-4 border-t border-gray-200 bg-white/50 backdrop-blur-sm">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask me to write an article..."
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all duration-200 placeholder-gray-500 text-black"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="inline-flex items-center justify-center w-12 h-12 rounded-xl text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  <Send className={`w-5 h-5 ${sending ? 'animate-pulse' : ''}`} />
                </button>
              </form>
            </div>

            {/* Right: Article preview and download */}
            <div className="w-1/2 flex flex-col border-l border-gray-200 bg-gradient-to-b from-white to-gray-50">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-red-600 to-red-700 rounded-lg flex items-center justify-center">
                    <Download className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-black">Generated Article</h4>
                    <div className="text-xs text-gray-600">Ready to download</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={copyArticle}
                    disabled={!latestArticle}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-black bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-all duration-200"
                    title="Copy to clipboard"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={downloadAsWord}
                    disabled={!latestArticle}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 shadow-lg hover:shadow-xl transition-all duration-200"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-6">
                {latestArticle ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                    <pre className="whitespace-pre-wrap break-words text-sm text-black leading-relaxed">{latestArticle}</pre>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Download className="w-8 h-8 text-gray-400" />
                    </div>
                    <div className="text-sm font-medium text-black mb-1">No article generated yet</div>
                    <div className="text-xs text-gray-500">Ask the AI to write an article for you</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="px-6 pb-4">
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                <div className="text-xs font-medium text-red-800">{error}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatWidget;
