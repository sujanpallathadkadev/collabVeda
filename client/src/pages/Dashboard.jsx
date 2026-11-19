import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { api('/sessions').then((d) => setSessions(d.sessions)).catch((e) => setError(e.message)); }, []);

  const create = async (e) => {
    e.preventDefault(); setError('');
    try { const d = await api('/sessions', { method: 'POST', body: { name } }); nav(`/s/${d.session.id}`); }
    catch (err) { setError(err.message); }
  };
  const join = async (e) => {
    e.preventDefault(); setError('');
    try { const d = await api('/sessions/join', { method: 'POST', body: { code } }); nav(`/s/${d.session.id}`); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="dash">
      <header className="topbar">
        <strong>⚡ CollabVeda</strong>
        <span className="spacer" />
        <span className="muted">Signed in as <b>{user.username}</b></span>
        <button onClick={logout}>Sign out</button>
      </header>
      <main>
        {error && <div className="error">{error}</div>}
        <div className="grid2">
          <form className="card" onSubmit={create}>
            <h2>Create a session</h2>
            <p className="muted">Start a shared workspace and invite teammates with a join code.</p>
            <input placeholder="Session name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
            <button className="primary">Create session</button>
          </form>
          <form className="card" onSubmit={join}>
            <h2>Join a session</h2>
            <p className="muted">Enter the 8-character code a teammate shared with you.</p>
            <input placeholder="ABCD2345" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} required style={{ letterSpacing: 3 }} />
            <button className="primary">Join session</button>
          </form>
        </div>
        <h2>Your sessions</h2>
        {sessions.length === 0 && <p className="muted">No sessions yet.</p>}
        <div className="list">
          {sessions.map((s) => (
            <Link key={s.id} to={`/s/${s.id}`} className="card row">
              <b>{s.name}</b>
              <span className="muted">{s.memberCount} member{s.memberCount === 1 ? '' : 's'} · code {s.code}{s.ownerId === user.id ? ' · owner' : ''}</span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
