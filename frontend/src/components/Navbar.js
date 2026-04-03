'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

export default function Navbar() {
  const { user, logout } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (user) {
      api.getNotifications({ unreadOnly: 'true', limit: 1 })
        .then(data => setUnreadCount(data.unreadCount || 0))
        .catch(() => {});
    }
  }, [user]);

  return (
    <nav className="navbar" id="main-navbar">
      <div className="navbar-inner">
        <Link href="/" className="navbar-logo">
          ⚡ JobMatch
        </Link>

        <div className="navbar-links" id="nav-links">
          <Link href="/jobs" className="navbar-link">Jobs</Link>
          {user && (
            <>
              {user.role === 'candidate' && (
                <>
                  <Link href="/dashboard" className="navbar-link">Dashboard</Link>
                  <Link href="/dashboard/recommendations" className="navbar-link">For You</Link>
                </>
              )}
              {(user.role === 'recruiter' || user.role === 'admin') && (
                <>
                  <Link href="/recruiter" className="navbar-link">Dashboard</Link>
                  <Link href="/recruiter/jobs/new" className="navbar-link">Post Job</Link>
                </>
              )}
            </>
          )}
        </div>

        <div className="navbar-actions">
          {user ? (
            <>
              <Link href="/notifications" className="notification-bell" id="notification-bell" title="Notifications">
                🔔
                {unreadCount > 0 && (
                  <span className="notification-count">{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </Link>
              <div style={{ position: 'relative' }}>
                <button 
                  className="btn btn-ghost btn-sm" 
                  onClick={() => setMenuOpen(!menuOpen)}
                  id="user-menu-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <span style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: 'var(--gradient-primary)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 700,
                  }}>
                    {(user.firstName || user.email)[0].toUpperCase()}
                  </span>
                  <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                    {user.firstName || user.email.split('@')[0]}
                  </span>
                </button>
                {menuOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: '8px',
                    background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)', width: '200px', overflow: 'hidden',
                    boxShadow: 'var(--shadow-lg)', zIndex: 200, animation: 'fadeIn 0.2s ease',
                  }}>
                    <Link href="/profile" className="navbar-link" style={{ display: 'block', padding: '10px 16px', borderRadius: 0 }}
                      onClick={() => setMenuOpen(false)}>👤 Profile</Link>
                    <Link href="/notifications" className="navbar-link" style={{ display: 'block', padding: '10px 16px', borderRadius: 0 }}
                      onClick={() => setMenuOpen(false)}>🔔 Notifications</Link>
                    <div style={{ borderTop: '1px solid var(--border-default)' }} />
                    <button className="navbar-link" style={{ display: 'block', padding: '10px 16px', width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--error)' }}
                      onClick={() => { logout(); setMenuOpen(false); window.location.href = '/'; }}>
                      🚪 Sign Out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="btn btn-ghost btn-sm" id="login-btn">Sign In</Link>
              <Link href="/auth/register" className="btn btn-primary btn-sm" id="register-btn">Get Started</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
