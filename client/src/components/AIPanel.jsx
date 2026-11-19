import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const QUICK = [
  ['Explain', 'Explain what this file does.'],
  ['Find bugs', 'Review this file for bugs and suggest fixes.'],
  ['Improve', 'Suggest improvements to readability and performance.'],
  ['Add tests', 'Write tests for this file.'],
];

function Message({ m, onInsert }) {
  const parts = [];
  const re = /```([\w+-]*)\n([\s\S]*?)```/g;
  let last = 0, x;
  while ((x = re.exec(m.content))) {
    if (x.index > last) parts.push({ t: 'text', v: m.content.slice(last, x.index) });
    parts.push({ t: 'code', lang: x[1], v: x[2] });
    last = re.lastIndex;
  }
  if (last < m.content.length) parts.push({ t: 'text', v: m.content.slice(last) });
  return (
    <div className={`msg ${m.role}`}>
      {parts.map((p, i) => p.t === 'text'
        ? <div key={i} className="txt">{p.v}</div>
        : (
          <div key={i} className="codeblock">
            <div className="cb-head">
              <span>{p.lang || 'code'}</span>
              <span>
                <button onClick={() => navigator.clipboard?.writeText(p.v)}>Copy</button>
                {m.role === 'assistant' && <button onClick={() => onInsert(p.v)}>Insert at cursor</button>}
              </span>
            </div>
            <pre>{p.v}</pre>
          </div>
        ))}
    </div>
  );
}

export default function AIPanel({ sessionId, fileId, onInsert }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [messages, busy]);

  async function send(text) {
    if (!text.trim() || busy) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next); setInput(''); setBusy(true);
    try {
      const d = await api(`/sessions/${sessionId}/ai`, { method: 'POST', body: { messages: next, fileId } });
      setMessages([...next, { role: 'assistant', content: d.reply }]);
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: `⚠️ ${e.message}` }]);
    } finally { setBusy(false); }
  }

  return (
    <aside className="ai">
      <div className="panel-head"><b>✨ AI Assistant</b><button onClick={() => setMessages([])}>Clear</button></div>
      <div className="msgs">
        {messages.length === 0 && <p className="muted pad">Ask about the file you have open. The assistant sees the current file and your file list.</p>}
        {messages.map((m, i) => <Message key={i} m={m} onInsert={onInsert} />)}
        {busy && <div className="muted pad">Thinking…</div>}
        <div ref={end} />
      </div>
      <div className="quick">{QUICK.map(([l, q]) => <button key={l} disabled={busy || !fileId} onClick={() => send(q)}>{l}</button>)}</div>
      <form className="ai-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask AI…" />
        <button className="primary" disabled={busy}>Send</button>
      </form>
    </aside>
  );
}
