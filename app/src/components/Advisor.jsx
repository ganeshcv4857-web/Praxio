import { useEffect, useRef, useState } from 'react';
import * as db from '../lib/db.js';
import { askAdvisor } from '../lib/ai.js';
import { CAREER_BY_ID } from '../lib/careers.js';
import Markdown from './Markdown.jsx';

const starters = (topName) => [
  topName ? `Why is ${topName} my top match?` : 'Why did I get these matches?',
  'How do my top two matches compare day to day?',
  'Which of my answers matter most to these results?',
  'What could I try this month to test my top match?',
];

// Q&A over the student's recommendations. Sessions and messages persist in Supabase.
export default function Advisor({ userId, context, focusDomain, clearFocus }) {
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);
  // Set when send() creates a session, so the load effect doesn't clobber in-flight messages.
  const justCreated = useRef(null);

  useEffect(() => {
    db.listChatSessions(userId).then(setSessions).catch((e) => setError(e.message));
  }, [userId]);

  useEffect(() => {
    if (!activeId) return setMessages([]);
    if (justCreated.current === activeId) return;
    db.getChatMessages(activeId).then(setMessages).catch((e) => setError(e.message));
  }, [activeId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  // Arriving from a career card: prefill a focused question in a fresh conversation.
  useEffect(() => {
    if (!focusDomain) return;
    const name = CAREER_BY_ID[focusDomain]?.name;
    setActiveId(null);
    setInput(`Tell me more about ${name}: why does it fit me, and what would I actually do day to day?`);
    clearFocus();
  }, [focusDomain, clearFocus]);

  const send = async (text) => {
    const message = text.trim();
    if (!message || sending) return;
    setError('');
    setSending(true);
    setInput('');
    try {
      let sessionId = activeId;
      if (!sessionId) {
        const s = await db.createChatSession(userId, message.slice(0, 60));
        setSessions((cur) => [s, ...cur]);
        sessionId = s.id;
        justCreated.current = s.id;
        setActiveId(s.id);
      }
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const userMsg = await db.addChatMessage(userId, sessionId, 'user', message);
      setMessages((cur) => [...cur, userMsg]);

      const { reply } = await askAdvisor(context, history, message);
      const modelMsg = await db.addChatMessage(userId, sessionId, 'model', reply);
      setMessages((cur) => [...cur, modelMsg]);
    } catch (e) {
      setError(`The advisor couldn't answer right now (${e.message}). Your question was saved; try again in a moment.`);
    } finally {
      setSending(false);
    }
  };

  const remove = async (id) => {
    await db.deleteChatSession(id);
    setSessions((cur) => cur.filter((s) => s.id !== id));
    if (id === activeId) setActiveId(null);
  };

  const topName = context.shortlist[0]?.name;

  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <aside className="space-y-2">
        <button className="btn-primary w-full" onClick={() => setActiveId(null)}>New conversation</button>
        <ul className="space-y-1">
          {sessions.map((s) => (
            <li key={s.id} className="group flex items-center">
              <button
                onClick={() => setActiveId(s.id)}
                className={`min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-sm ${
                  s.id === activeId ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900'
                }`}
              >
                {s.title}
              </button>
              <button
                onClick={() => remove(s.id)}
                className="px-2 text-xs text-slate-600 opacity-0 hover:text-rose-300 group-hover:opacity-100"
                aria-label="Delete conversation"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="card flex min-h-[70vh] flex-col p-0">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.length === 0 && !sending && (
            <div className="py-10 text-center">
              <h2 className="text-lg font-semibold">Ask about your matches</h2>
              <p className="mt-1 text-sm text-slate-400">The advisor sees your answers and your scored shortlist, nothing else.</p>
              <div className="mx-auto mt-6 grid max-w-lg gap-2 sm:grid-cols-2">
                {starters(topName).map((q) => (
                  <button key={q} onClick={() => send(q)} className="rounded-xl border border-slate-700 p-3 text-left text-sm text-slate-300 hover:bg-slate-800">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-500 px-4 py-2 text-sm text-white">
                {m.content}
              </div>
            ) : (
              <div key={m.id} className="max-w-[92%] rounded-2xl rounded-bl-sm bg-slate-800/70 px-4 py-3">
                <Markdown content={m.content} />
              </div>
            )
          )}
          {sending && <div className="text-sm text-slate-500">Thinking…</div>}
          {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
          <div ref={endRef} />
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="flex gap-2 border-t border-slate-800 p-3"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
            rows={2}
            placeholder="Ask anything about your career matches…"
            className="input flex-1 resize-none"
          />
          <button className="btn-primary self-end" disabled={sending || !input.trim()}>Send</button>
        </form>
      </section>
    </div>
  );
}
