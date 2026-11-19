import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { api, getToken } from '../api.js';
import { useAuth } from '../auth.jsx';
import FileTree from '../components/FileTree.jsx';
import CodeEditor from '../components/CodeEditor.jsx';
import AIPanel from '../components/AIPanel.jsx';
import { colorFor, extOf, languageFor } from '../util.js';

export default function Workspace() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [session, setSession] = useState(null);
  const [members, setMembers] = useState([]);
  const [files, setFiles] = useState([]);
  const [online, setOnline] = useState([]);
  const [tabs, setTabs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [showAI, setShowAI] = useState(true);
  const [runExts, setRunExts] = useState([]);
  const [out, setOut] = useState(null);
  const [running, setRunning] = useState(false);
  const [stdin, setStdin] = useState('');
  const editorRef = useRef(null);

  // Load session + connect socket
  useEffect(() => {
    let sock;
    let alive = true;
    (async () => {
      try {
        const d = await api(`/sessions/${id}`);
        if (!alive) return;
        setSession(d.session); setMembers(d.members); setFiles(d.files);
        api('/runtimes').then((r) => alive && setRunExts(r.extensions)).catch(() => {});
        sock = io({ auth: { token: getToken() } });
        const join = () => sock.emit('session:join', { sessionId: id }, (r) => { if (r?.ok) setConnected(true); else setError(r?.error || 'Could not join'); });
        sock.on('connect', join);
        sock.on('disconnect', () => setConnected(false));
        sock.on('connect_error', (e) => setError(e.message === 'unauthorized' ? 'Your login is no longer valid.' : 'Connection error'));
        sock.on('files', setFiles);
        sock.on('members', setMembers);
        sock.on('presence', setOnline);
        sock.on('session:deleted', () => nav('/'));
        setSocket(sock);
      } catch (e) { setError(e.message); }
    })();
    return () => { alive = false; sock?.disconnect(); };
  }, [id, nav]);

  // Drop tabs for files that no longer exist
  useEffect(() => {
    const ids = new Set(files.filter((f) => f.type === 'file').map((f) => f.id));
    setTabs((t) => t.filter((x) => ids.has(x)));
    setActiveId((a) => (a && !ids.has(a) ? null : a));
  }, [files]);

  const fileById = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);
  const active = activeId ? fileById.get(activeId) : null;

  const open = useCallback((f) => { setTabs((t) => (t.includes(f.id) ? t : [...t, f.id])); setActiveId(f.id); }, []);
  const closeTab = (fid) => {
    setTabs((t) => {
      const n = t.filter((x) => x !== fid);
      if (activeId === fid) setActiveId(n[n.length - 1] || null);
      return n;
    });
  };
  const guard = (p) => p.catch((e) => alert(e.message));
  const create = (path, type) => guard(api(`/sessions/${id}/files`, { method: 'POST', body: { path, type } }).then((d) => type === 'file' && open(d.file)));
  const rename = (f, path) => guard(api(`/sessions/${id}/files/${f.id}`, { method: 'PATCH', body: { path } }));
  const remove = (f) => guard(api(`/sessions/${id}/files/${f.id}`, { method: 'DELETE' }));

  async function run() {
    if (!active) return;
    setRunning(true); setOut(null);
    try { setOut(await api(`/sessions/${id}/run`, { method: 'POST', body: { fileId: active.id, stdin } })); }
    catch (e) { setOut({ error: e.message }); } finally { setRunning(false); }
  }

  const insert = (text) => {
    const ed = editorRef.current;
    if (!ed) return;
    const sel = ed.getSelection();
    ed.executeEdits('ai', [{ range: sel, text, forceMoveMarkers: true }]);
    ed.focus();
  };

  if (error && !session) return <div className="center"><div className="card"><p className="error">{error}</p><Link to="/">← Back</Link></div></div>;
  if (!session) return <div className="center muted">Loading…</div>;

  const canRun = active && runExts.includes(extOf(active.path));
  const onlineIds = new Set(online.map((p) => p.userId));

  return (
    <div className="ws">
      <header className="topbar">
        <Link to="/" className="back">←</Link>
        <strong>{session.name}</strong>
        <span className="code" title="Share this code to invite teammates" onClick={() => navigator.clipboard?.writeText(session.code)}>
          Join code: <b>{session.code}</b> 📋
        </span>
        <span className={`dot ${connected ? 'on' : 'off'}`} title={connected ? 'Live' : 'Reconnecting…'} />
        <span className="spacer" />
        <div className="avatars">
          {members.map((m) => (
            <span key={m.id} className={`avatar ${onlineIds.has(m.id) ? '' : 'away'}`} style={{ background: colorFor(m.username) }}
              title={`${m.username}${m.isOwner ? ' (owner)' : ''} — ${onlineIds.has(m.id) ? 'online' : 'offline'}`}>
              {m.username[0].toUpperCase()}
            </span>
          ))}
        </div>
        <button className="primary" disabled={!canRun || running} onClick={run} title={canRun ? 'Run current file' : 'Open a runnable file (.js .py .sh …)'}>
          {running ? 'Running…' : '▶ Run'}
        </button>
        <button onClick={() => setShowAI((v) => !v)}>✨ AI</button>
        {session.ownerId === user.id && (
          <button className="danger" onClick={() => confirm('Delete this session for everyone?') && guard(api(`/sessions/${id}`, { method: 'DELETE' }))}>Delete</button>
        )}
      </header>
      {error && <div className="error banner">{error}</div>}
      <div className="body">
        <FileTree files={files} activeId={activeId} onOpen={open} onCreate={create} onRename={rename} onDelete={remove} />
        <section className="main">
          <div className="tabsbar">
            {tabs.map((tid) => {
              const f = fileById.get(tid);
              if (!f) return null;
              const here = online.filter((p) => p.fileId === tid && p.userId !== user.id);
              return (
                <div key={tid} className={`tab ${tid === activeId ? 'active' : ''}`} onClick={() => setActiveId(tid)}>
                  {f.path.split('/').pop()}
                  {here.map((p) => <i key={p.userId} className="pip" style={{ background: colorFor(p.username) }} title={`${p.username} is here`} />)}
                  <button onClick={(e) => { e.stopPropagation(); closeTab(tid); }}>×</button>
                </div>
              );
            })}
          </div>
          <div className="editor">
            {active
              ? <CodeEditor socket={socket} file={active} user={user} editorRef={editorRef} />
              : <div className="center muted">Open a file from the sidebar to start coding together.</div>}
          </div>
          <div className="status">
            {active ? `${languageFor(active.path)} · ${active.path}` : 'No file open'}
            <span className="spacer" />
            {online.length} online
          </div>
          <div className="output">
            <div className="panel-head">
              <b>Output</b>
              <input className="stdin" placeholder="stdin (optional)" value={stdin} onChange={(e) => setStdin(e.target.value)} />
              <button onClick={() => setOut(null)}>Clear</button>
            </div>
            <pre>
              {out?.error && <span className="err">{out.error}</span>}
              {out?.stdout}
              {out?.stderr && <span className="err">{out.stderr}</span>}
              {out && !out.error && <span className="muted">{`\n[exit ${out.code}${out.timedOut ? ', timed out' : ''} · ${out.durationMs}ms]`}</span>}
            </pre>
          </div>
        </section>
        {showAI && <AIPanel sessionId={id} fileId={active?.id} onInsert={insert} />}
      </div>
    </div>
  );
}
