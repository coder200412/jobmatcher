'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import ApplicationTimeline from '@/components/ApplicationTimeline';

export default function ApplicationsPage() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.getMyApplications()
      .then(data => setApplications(data.applications || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const statusColors = {
    submitted: 'badge-info',
    reviewed: 'badge-warning',
    shortlisted: 'badge-primary',
    rejected: 'badge-error',
    hired: 'badge-success',
  };

  const filtered = filter === 'all' ? applications : applications.filter(a => a.status === filter);

  return (
    <div className="container section" id="applications-page">
      <div className="section-header">
        <h1>My Applications</h1>
        <Link href="/jobs" className="btn btn-primary btn-sm">Find More Jobs →</Link>
      </div>

      <div className="tabs" style={{ marginBottom: 'var(--space-xl)', display: 'inline-flex' }}>
        {['all', 'submitted', 'reviewed', 'shortlisted', 'rejected', 'hired'].map(s => (
          <button key={s} className={`tab ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
            {s.charAt(0).toUpperCase() + s.slice(1)} {s === 'all' ? `(${applications.length})` : `(${applications.filter(a => a.status === s).length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-2">{[1,2,3,4].map(i => <div key={i} className="skeleton skeleton-card" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No applications found</div>
          <p>Start applying to jobs to see your applications here.</p>
        </div>
      ) : (
        <div className="grid grid-2">
          {filtered.map((app, i) => (
            <div key={app.id} className="glass-card animate-fade-in" style={{ animationDelay: `${i * 0.05}s`, opacity: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-md)' }}>
                <div>
                  <Link href={`/jobs/${app.jobId}`} style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700 }}>
                    {app.jobTitle}
                  </Link>
                  <p style={{ color: 'var(--text-accent)', fontWeight: 500, marginTop: '2px' }}>{app.jobCompany}</p>
                </div>
                <span className={`badge ${statusColors[app.status]}`}>{app.status}</span>
              </div>
              <div className="flex gap-md" style={{ marginTop: 'var(--space-md)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {app.jobLocation && <span>📍 {app.jobLocation}</span>}
                <span>💼 {app.jobWorkType}</span>
                <span>📅 {new Date(app.createdAt).toLocaleDateString()}</span>
              </div>

              <div style={{
                marginTop: 'var(--space-md)',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 'var(--space-sm)',
              }}>
                <div style={{ padding: 'var(--space-sm)', borderRadius: 'var(--radius-md)', background: 'var(--bg-glass)' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Current Stage</div>
                  <div style={{ fontWeight: 700 }}>{app.transparency?.latestEventTitle || app.status}</div>
                </div>
                <div style={{ padding: 'var(--space-sm)', borderRadius: 'var(--radius-md)', background: 'var(--bg-glass)' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Recruiter Reply</div>
                  <div style={{ fontWeight: 700 }}>
                    {app.transparency?.hasRecruiterResponse
                      ? `${app.transparency.firstResponseHours}h`
                      : 'Pending'}
                  </div>
                </div>
                <div style={{ padding: 'var(--space-sm)', borderRadius: 'var(--radius-md)', background: 'var(--bg-glass)' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Timeline Updates</div>
                  <div style={{ fontWeight: 700 }}>{app.transparency?.totalEvents || app.timeline?.length || 0}</div>
                </div>
              </div>

              <div style={{ marginTop: 'var(--space-md)' }}>
                <div className="progress-bar">
                  <div className="progress-bar-fill" style={{
                    width: `${app.transparency?.progressPercent || 20}%`
                  }} />
                </div>
              </div>

              <div style={{ marginTop: 'var(--space-lg)' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-sm)' }}>
                  Application Transparency Timeline
                </div>
                <ApplicationTimeline
                  timeline={app.timeline || []}
                  compact
                  emptyMessage="The timeline will update the moment the recruiter takes action."
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
