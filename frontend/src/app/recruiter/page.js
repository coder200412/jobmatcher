'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import RecruiterTrustCard from '@/components/RecruiterTrustCard';

export default function RecruiterDashboard() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getMyJobs().catch(() => ({ jobs: [] })),
      api.getRecruiterDashboard().catch(() => null),
    ]).then(([jobsData, analyticsData]) => {
      setJobs(jobsData.jobs || []);
      setAnalytics(analyticsData);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="container section">
      <div className="skeleton" style={{ height: '40px', width: '50%', marginBottom: '30px' }} />
      <div className="grid grid-4">{[1,2,3,4].map(i => <div key={i} className="skeleton skeleton-card" />)}</div>
    </div>
  );

  return (
    <div className="container section" id="recruiter-dashboard">
      <div className="section-header">
        <div>
          <h1>Recruiter <span className="gradient-text">Dashboard</span></h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-xs)' }}>
            Welcome back, {user?.firstName}. Manage your job listings and candidates.
          </p>
        </div>
        <Link href="/recruiter/jobs/new" className="btn btn-primary">+ Post New Job</Link>
      </div>

      {/* Stats */}
      <div className="grid grid-4" style={{ marginBottom: 'var(--space-2xl)' }}>
        {[
          { icon: '📋', value: analytics?.totalJobs || jobs.length, label: 'Active Listings' },
          { icon: '👁', value: analytics?.totalViews || 0, label: 'Total Views' },
          { icon: '📝', value: analytics?.totalApplications || 0, label: 'Applications' },
          { icon: '📊', value: `${analytics?.avgCTR || 0}%`, label: 'Avg CTR' },
        ].map((stat, i) => (
          <div key={i} className="stat-card animate-fade-in" style={{ animationDelay: `${i * 0.1}s`, opacity: 0 }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 'var(--space-sm)' }}>{stat.icon}</div>
            <div className="stat-card-value">{stat.value}</div>
            <div className="stat-card-label">{stat.label}</div>
          </div>
        ))}
      </div>

      {analytics?.trustScore && (
        <div style={{ marginBottom: 'var(--space-2xl)' }}>
          <RecruiterTrustCard trust={analytics.trustScore} title="Your Recruiter Trust Score" />
        </div>
      )}

      {/* Job Listings */}
      <div className="section-header">
        <h2>Your Job Listings</h2>
      </div>

      {jobs.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-md)' }}>📋</div>
          <p style={{ color: 'var(--text-secondary)' }}>You haven&apos;t posted any jobs yet.</p>
          <Link href="/recruiter/jobs/new" className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-md)' }}>Post Your First Job</Link>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Position</th>
                <th>Company</th>
                <th>Status</th>
                <th>Views</th>
                <th>Applications</th>
                <th>Posted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id}>
                  <td><span style={{ fontWeight: 600 }}>{job.title}</span></td>
                  <td style={{ color: 'var(--text-secondary)' }}>{job.company}</td>
                  <td><span className={`badge ${job.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>{job.status}</span></td>
                  <td>{job.viewsCount}</td>
                  <td><span style={{ fontWeight: 600, color: 'var(--text-accent)' }}>{job.applicationsCount}</span></td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{new Date(job.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="flex gap-xs">
                      <Link href={`/recruiter/jobs/${job.id}`} className="btn btn-ghost btn-sm">View</Link>
                      <Link href={`/jobs/${job.id}`} className="btn btn-ghost btn-sm">🔗</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-Job Analytics */}
      {analytics?.jobMetrics && analytics.jobMetrics.length > 0 && (
        <div style={{ marginTop: 'var(--space-2xl)' }}>
          <h2 style={{ marginBottom: 'var(--space-lg)' }}>📊 Job Performance</h2>
          <div className="grid grid-2">
            {analytics.jobMetrics.map(m => (
              <div key={m.jobId} className="glass-card">
                <h4 style={{ marginBottom: 'var(--space-md)' }}>{m.title}</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-md)' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Views</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{m.viewsCount}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Applications</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-accent)' }}>{m.applicationsCount}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Unique Views</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{m.uniqueViewsCount}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>CTR</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--success)' }}>
                      {(m.clickThroughRate * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
