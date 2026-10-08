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
  const [showHistory, setShowHistory] = useState(false);
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

  const empty = messages.length === 0 && !sending;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-180px)] max-w-3xl flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 pt-2">
        <span className="text-sm text-slate-500">Advisor</span>
        <div className="flex gap-2">
          {sessions.length > 0 && (
            <button type="button" onClick={() => setShowHistory(!showHistory)} aria-expanded={showHistory}
              className="min-h-[40px] rounded-full bg-slate-900 px-4 text-sm text-slate-300 shadow-[var(--shadow)] hover:text-slate-100">
              History ({sessions.length})
            </button>
          )}
          {!empty && (
            <button type="button" onClick={() => { setActiveId(null); setShowHistory(false); }}
              className="min-h-[40px] rounded-full bg-slate-900 px-4 text-sm text-slate-300 shadow-[var(--shadow)] hover:text-slate-100">
              New chat
            </button>
          )}
        </div>
      </div>

      {showHistory && (
        <ul className="mb-6 rounded-3xl bg-slate-900 p-2 shadow-[var(--shadow)]">
          {sessions.map((s) => (
            <li key={s.id} className="group flex items-center">
              <button type="button" onClick={() => { setActiveId(s.id); setShowHistory(false); }}
                className={`min-h-[44px] min-w-0 flex-1 truncate rounded-2xl px-4 text-left text-[15px] ${s.id === activeId ? 'bg-slate-800 text-slate-100' : 'text-slate-300 hover:bg-slate-800/60'}`}>
                {s.title}
              </button>
              <button type="button" onClick={() => remove(s.id)} aria-label="Delete conversation"
                className="grid h-10 w-10 place-items-center rounded-full text-slate-500 opacity-60 hover:text-rose-300 group-hover:opacity-100">✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex-1 space-y-5 pb-6">
        {empty && (
          <div className="pb-6 pt-10">
            <h1 className="text-[clamp(36px,4.6vw,56px)] font-normal leading-[1.02] tracking-[-0.045em]">
              Ask anything about <span className="ser text-indigo-300">your matches.</span>
            </h1>
            <p className="mt-4 text-[17px] text-slate-400">The advisor sees your answers and your scored shortlist, nothing else.</p>
            <div className="mt-8 flex flex-wrap gap-2">
              {starters(topName).map((q) => (
                <button key={q} type="button" onClick={() => send(q)}
                  className="min-h-[46px] rounded-full bg-slate-900 px-5 text-left text-[15px] text-slate-200 shadow-[var(--shadow)] transition hover:bg-slate-800">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="ml-auto w-fit max-w-[85%] rounded-3xl rounded-br-lg bg-indigo-500 px-5 py-3 text-[15px] text-on-accent">{m.content}</div>
          ) : (
            <div key={m.id} className="max-w-[92%] rounded-3xl rounded-bl-lg bg-slate-900 px-5 py-4 shadow-[var(--shadow)]"><Markdown content={m.content} /></div>
          )
        )}
        {sending && <div className="text-sm text-slate-500">Thinking…</div>}
        {error && <p className="rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</p>}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="sticky bottom-24 flex items-end gap-2 rounded-[28px] bg-slate-900 p-2 shadow-[var(--shadow)] lg:bottom-6">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          rows={1}
          aria-label="Your question"
          placeholder="Ask anything about your career matches…"
          className="max-h-40 min-h-[48px] flex-1 resize-none bg-transparent px-4 py-3 text-[15px] text-slate-100 outline-none placeholder:text-slate-500"
        />
        <button type="submit" disabled={sending || !input.trim()} aria-label="Send"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-indigo-500 text-on-accent transition disabled:opacity-40">→</button>
      </form>
    </div>
  );
}
