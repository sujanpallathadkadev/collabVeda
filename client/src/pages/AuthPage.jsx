import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function AuthPage() {
  const { user, authenticate } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ username: '', email: '', identifier: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  if (user) return <Navigate to={loc.state?.from || '/'} replace />;

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await authenticate(mode, mode === 'login'
        ? { identifier: f.identifier, password: f.password }
        : { username: f.username, email: f.email, password: f.password });
      nav(loc.state?.from || '/', { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="center">
      <form className="card auth" onSubmit={submit}>
        <h1>⚡ CollabVeda</h1>
        <p className="muted">Collaborative, AI-assisted coding for your team.</p>
        <div className="tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Sign in</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Create account</button>
        </div>
        {mode === 'register' ? (
          <>
            <input placeholder="Username" value={f.username} onChange={set('username')} autoComplete="username" required />
            <input type="email" placeholder="Email" value={f.email} onChange={set('email')} autoComplete="email" required />
          </>
        ) : (
          <input placeholder="Username or email" value={f.identifier} onChange={set('identifier')} autoComplete="username" required />
        )}
        <input type="password" placeholder="Password (min 8 chars)" value={f.password} onChange={set('password')}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : undefined} required />
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
      </form>
    </div>
  );
}
