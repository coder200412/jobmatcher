'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchNotifications() {
      await Promise.resolve();

      try {
        const data = await api.getNotifications({ limit: 50 });
        if (cancelled) return;
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      } catch {
        if (cancelled) return;
        setNotifications([]);
        setUnreadCount(0);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchNotifications();

    return () => {
      cancelled = true;
    };
  }, []);

  const markAsRead = async (id) => {
    await api.markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    await api.markAllNotificationsRead();
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const typeIcons = {
    welcome: '🎉', application_update: '📝', new_job_match: '🎯', profile_view: '👁',
  };

  return (
    <div className="container section" id="notifications-page">
      <div className="section-header">
        <div>
          <h1>Notifications</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-xs)' }}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={markAllRead}>Mark All Read</button>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: '80px' }} />)}
        </div>
      ) : notifications.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔔</div>
          <div className="empty-state-title">No notifications</div>
          <p>You&apos;re all caught up! New notifications will appear here.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {notifications.map((n, i) => (
            <div key={n.id}
              className="glass-card animate-fade-in"
              style={{
                animationDelay: `${i * 0.03}s`, opacity: 0,
                padding: 'var(--space-md) var(--space-lg)',
                cursor: !n.isRead ? 'pointer' : 'default',
                borderLeft: !n.isRead ? '3px solid var(--accent-1)' : '3px solid transparent',
              }}
              onClick={() => !n.isRead && markAsRead(n.id)}
            >
              <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1.5rem' }}>{typeIcons[n.type] || '🔔'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ fontWeight: n.isRead ? 400 : 700, fontSize: '0.95rem' }}>{n.title}</p>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {new Date(n.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>{n.message}</p>
                  {n.data?.matchPercent ? (
                    <div className="flex gap-xs" style={{ marginTop: '8px', flexWrap: 'wrap' }}>
                      <span className="badge badge-primary">{n.data.matchPercent}% match</span>
                      {n.data.priorityScore ? <span className="badge badge-neutral">Priority {n.data.priorityScore}</span> : null}
                    </div>
                  ) : null}
                </div>
                {!n.isRead && (
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-1)', flexShrink: 0, marginTop: '6px' }} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
