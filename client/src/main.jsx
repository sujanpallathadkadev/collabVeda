import './monacoSetup.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import AuthPage from './pages/AuthPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Workspace from './pages/Workspace.jsx';
import './styles.css';

function Protected({ children }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="center muted">Loading…</div>;
  return user ? children : <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/" element={<Protected><Dashboard /></Protected>} />
        <Route path="/s/:id" element={<Protected><Workspace /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  </BrowserRouter>
);
