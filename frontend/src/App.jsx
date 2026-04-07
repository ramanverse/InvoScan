import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, Upload, FileText, GitMerge, BarChart2,
  Settings, Zap, Clock, CheckCircle, AlertTriangle, Trash2, LogOut
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';

// Lazy load components
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const UploadInvoice = lazy(() => import('./pages/UploadInvoice.jsx'));
const InvoiceList = lazy(() => import('./pages/InvoiceList.jsx'));
const InvoiceDetail = lazy(() => import('./pages/InvoiceDetail.jsx'));
const Reconciliation = lazy(() => import('./pages/Reconciliation.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Signup = lazy(() => import('./pages/Signup.jsx'));

// Loading Page
const PageLoader = () => (
  <div className="flex items-center justify-center p-20">
    <Zap size={32} className="accent-text spin" />
  </div>
);

const navItems = [
  { path: '/', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
  { path: '/upload', icon: <Upload size={18} />, label: 'Upload Invoice' },
  { path: '/invoices', icon: <FileText size={18} />, label: 'Invoices' },
  { path: '/reconcile', icon: <GitMerge size={18} />, label: 'Reconciliation' },
  { path: '/reports', icon: <BarChart2 size={18} />, label: 'Reports' },
];

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="loading-screen">
      <Zap size={48} className="accent-text spin" />
    </div>
  );
  if (!user) return <Navigate to="/login" />;
  return children;
};

function AppContent() {
  const location = useLocation();
  const { user, loading, logout } = useAuth();

  // Keep the Render backend warm by pinging it every 10 minutes.
  // Render free tier spins down after 15 min of inactivity, causing
  // the first request (OCR upload) to time out while the server wakes up.
  useEffect(() => {
    if (!user) return;
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
    const ping = () => fetch(`${API_BASE}/ping`).catch(() => {});
    ping(); // immediate ping on login
    const interval = setInterval(ping, 10 * 60 * 1000); // every 10 min
    return () => clearInterval(interval);
  }, [user]);

  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup';

  const getPageMeta = () => {
    const map = {
      '/': { title: 'Dashboard', subtitle: 'Overview of your invoice processing pipeline' },
      '/upload': { title: 'Upload Invoices', subtitle: 'Upload PDF or image invoices for OCR extraction' },
      '/invoices': { title: 'Invoice Library', subtitle: 'All extracted and processed invoices' },
      '/reconcile': { title: 'Reconciliation Engine', subtitle: 'Match invoices against payment register' },
      '/reports': { title: 'Reports & Analytics', subtitle: 'Export and analyze reconciliation results' },
    };
    return map[location.pathname] || { title: 'InvoScan', subtitle: '' };
  };

  const meta = getPageMeta();

  if (isAuthPage) {
    if (user && !loading) return <Navigate to="/" />;
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Routes>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon"><Zap size={24} /></div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              title={item.label}
            >
              <span className="nav-icon">{item.icon}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          {user && (
            <button className="nav-link logout-btn" onClick={logout} title="Logout">
              <span className="nav-icon"><LogOut size={18} /></span>
            </button>
          )}
          <div className="sidebar-status" title="Backend connected · Port 5001">
            <div className="status-dot" />
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="main-content">
        <header className="main-header">
          <div>
            <div className="header-title">{meta.title}</div>
            <div className="header-subtitle">{meta.subtitle}</div>
          </div>
          <div className="header-actions">
            {user && (
              <div className="user-profile-header">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name} className="user-avatar-small" />
                ) : (
                  <div className="user-initials-small">{user.name?.charAt(0)}</div>
                )}
                <div className="user-info-stack">
                  <span className="user-name-header">{user.name}</span>
                  <div className="pro-sub-label">
                    <Zap size={8} fill="currentColor" />
                    PRO ACCOUNT
                  </div>
                </div>
                <button className="signout-header-btn" onClick={logout} title="Sign Out">
                  <LogOut size={16} />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="page-content fade-in">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/upload" element={<ProtectedRoute><UploadInvoice /></ProtectedRoute>} />
              <Route path="/invoices" element={<ProtectedRoute><InvoiceList /></ProtectedRoute>} />
              <Route path="/invoices/:id" element={<ProtectedRoute><InvoiceDetail /></ProtectedRoute>} />
              <Route path="/reconcile" element={<ProtectedRoute><Reconciliation /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
