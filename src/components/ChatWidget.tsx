import React, { useState, useEffect, useRef, type FormEvent } from 'react';
import { MessageCircle, RefreshCw, X, Send, Download } from 'lucide-react';

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
  const [sessionId, setSessionId] = useState<string>(() => (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? (crypto as any).randomUUID() : `sess-${Date.now()}`);
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
      const parsed: any = JSON.parse(raw);
      const dig = (node: any) => {
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
          // Common shapes: {message, article} or {output: {message, article}}
          const maybe = node.output && typeof node.output === 'object' ? node.output : node;
          if (!botText && typeof maybe.message === 'string') botText = maybe.message;
          if (!article && typeof maybe.article === 'string') article = maybe.article;
          // In case nested deeper
          for (const key of Object.keys(node)) {
            if (typeof (node as any)[key] === 'object') dig((node as any)[key]);
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
    const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? (crypto as any).randomUUID() : `sess-${Date.now()}`;
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
    <div className="fixed bottom-4 left-4 z-40">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-3 rounded-full shadow-md bg-indigo-600 text-white hover:bg-indigo-700"
          aria-label="Open chat"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm font-medium">Chat</span>
        </button>
      ) : (
        <div className="bg-white border rounded-xl shadow-xl overflow-hidden resize flex flex-col" style={{ width: '48vw', height: '60vh', minWidth: 600, minHeight: 360, maxWidth: '90vw', maxHeight: '85vh', resize: 'both' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
            <div className="flex items-center gap-2 min-w-0">
              <MessageCircle className="w-5 h-5 text-indigo-600 shrink-0" />
              <span className="text-sm font-semibold text-gray-900 shrink-0">Assistant</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={reset}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
                title="Reset conversation"
                aria-label="Reset conversation"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
                aria-label="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body: split left chat / right article preview */}
          <div className="flex flex-1 min-h-0">
            {/* Left: Chat */}
            <div className="w-1/2 flex flex-col">
              <div ref={chatScrollRef} className="flex-1 px-4 py-3 space-y-2 overflow-y-auto bg-white">
                {messages.length === 0 && (
                  <div className="text-xs text-gray-500">Start a conversation below…</div>
                )}
                {messages.map((m, i) => {
                  const time = new Date(m.ts);
                  const ts = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const isTyping = m.role === 'bot' && m.text === '...typing';
                  return (
                    <div key={i} className={`text-sm flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`inline-block px-4 py-2 rounded-2xl shadow-sm max-w-[90%] ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                        {isTyping ? (
                          <div className="flex items-center gap-1">
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        ) : (
                          <pre className="whitespace-pre-wrap break-words">{m.text}</pre>
                        )}
                        {!isTyping && (
                          <div className={`mt-1 text-[10px] ${m.role === 'user' ? 'text-indigo-100' : 'text-gray-500'}`}>{ts}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <form onSubmit={send} className="flex items-center gap-2 px-3 py-2 border-t bg-white">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message…"
                  className="flex-1 border rounded-2xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="inline-flex items-center px-3 py-2 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Send className={`w-4 h-4 ${sending ? 'animate-pulse' : ''}`} />
                </button>
              </form>
            </div>

            {/* Right: Article preview and download */}
            <div className="w-1/2 flex flex-col border-l group">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
                <h4 className="text-sm font-semibold text-gray-900">AI Article</h4>
                <button
                  type="button"
                  onClick={copyArticle}
                  disabled={!latestArticle}
                  className="mr-2 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white bg-gray-800 hover:bg-gray-700 disabled:opacity-50 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Copy"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={downloadAsWord}
                  disabled={!latestArticle}
                  className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {latestArticle ? (
                  <pre className="whitespace-pre-wrap break-words text-sm text-gray-800">{latestArticle}</pre>
                ) : (
                  <div className="text-xs text-gray-500">No article yet. Send a prompt to generate one.</div>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="px-4 pb-3 text-xs text-red-600">{error}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatWidget;
