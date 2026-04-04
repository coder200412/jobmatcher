'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function CandidateDashboard() {
  const { user } = useAuth();
  const [applications, setApplications] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [careerInsights, setCareerInsights] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getMyApplications().catch(() => ({ applications: [] })),
      api.getJobRecommendations(6).catch(() => ({ recommendations: [] })),
      api.getCareerInsights().catch(() => null),
    ]).then(([appsData, recsData, careerData]) => {
      setApplications(appsData.applications || []);
      setRecommendations(recsData.recommendations || []);
      setCareerInsights(careerData);
    }).finally(() => setLoading(false));
  }, []);

  const statusColors = {
    submitted: 'badge-info',
    reviewed: 'badge-warning',
    shortlisted: 'badge-primary',
    rejected: 'badge-error',
    hired: 'badge-success',
  };

  if (loading) return (
    <div className="container section">
      <div className="skeleton" style={{ height: '40px', width: '50%', marginBottom: '30px' }} />
      <div className="grid grid-4">{[1,2,3,4].map(i => <div key={i} className="skeleton skeleton-card" />)}</div>
    </div>
  );

  return (
    <div className="container section" id="candidate-dashboard">
      <div className="section-header">
        <div>
          <h1>Welcome back, <span className="gradient-text">{user?.firstName || 'there'}</span> 👋</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-xs)' }}>
            Here&apos;s your job search overview
          </p>
        </div>
        <Link href="/jobs" className="btn btn-primary">Browse Jobs →</Link>
      </div>

      {/* Stats */}
      <div className="grid grid-4" style={{ marginBottom: 'var(--space-2xl)' }}>
        {[
          { icon: '📝', value: applications.length, label: 'Applications' },
          { icon: '⏳', value: applications.filter(a => a.status === 'submitted').length, label: 'Pending' },
          { icon: '⭐', value: applications.filter(a => a.status === 'shortlisted').length, label: 'Shortlisted' },
          { icon: '🎯', value: recommendations.length, label: 'Matches' },
        ].map((stat, i) => (
          <div key={i} className="stat-card animate-fade-in" style={{ animationDelay: `${i * 0.1}s`, opacity: 0 }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 'var(--space-sm)' }}>{stat.icon}</div>
            <div className="stat-card-value">{stat.value}</div>
            <div className="stat-card-label">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Recent Applications */}
      <div style={{ marginBottom: 'var(--space-2xl)' }}>
        <div className="section-header">
          <h2>Recent Applications</h2>
          <Link href="/dashboard/applications" className="btn btn-ghost btn-sm">View All →</Link>
        </div>

        {applications.length === 0 ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-md)' }}>📋</div>
            <p style={{ color: 'var(--text-secondary)' }}>You haven&apos;t applied to any jobs yet.</p>
            <Link href="/jobs" className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-md)' }}>Find Jobs</Link>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Latest Update</th>
                  <th>Applied</th>
                </tr>
              </thead>
              <tbody>
                {applications.slice(0, 5).map(app => (
                  <tr key={app.id}>
                    <td><Link href={`/jobs/${app.jobId}`} style={{ fontWeight: 600 }}>{app.jobTitle}</Link></td>
                    <td style={{ color: 'var(--text-secondary)' }}>{app.jobCompany}</td>
                    <td><span className={`badge ${statusColors[app.status]}`}>{app.status}</span></td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      {app.transparency?.latestEventTitle || 'Awaiting recruiter review'}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{new Date(app.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {careerInsights && (
        <div className="glass-card" style={{ marginBottom: 'var(--space-2xl)' }}>
          <div className="section-header" style={{ marginBottom: 'var(--space-md)' }}>
            <h2>📈 Career Trajectory Predictor</h2>
            <span className="badge badge-primary">{careerInsights.currentLevel}</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>
            {careerInsights.guidance}
          </p>
          <div className="flex flex-wrap gap-xs" style={{ marginBottom: 'var(--space-md)' }}>
            {(careerInsights.nextRoles || []).map((role) => (
              <span key={role} className="skill-tag">{role}</span>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-lg)' }}>
            <div>
              <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Salary progression
              </div>
              <div style={{ fontWeight: 700 }}>
                {careerInsights.salaryProgressionLpa?.estimatedLow}–{careerInsights.salaryProgressionLpa?.estimatedHigh} {careerInsights.salaryProgressionLpa?.currency}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Market openings
              </div>
              <div style={{ fontWeight: 700 }}>{careerInsights.marketOpenings}</div>
            </div>
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div>
        <div className="section-header">
          <h2>🎯 Recommended For You</h2>
          <Link href="/dashboard/recommendations" className="btn btn-ghost btn-sm">View All →</Link>
        </div>

        {recommendations.length === 0 ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
            <p style={{ color: 'var(--text-secondary)' }}>Complete your profile and add skills to get personalized recommendations.</p>
            <Link href="/profile" className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-md)' }}>Update Profile</Link>
          </div>
        ) : (
          <div className="grid grid-3">
            {recommendations.slice(0, 6).map((job, i) => (
              <Link key={job.id} href={`/jobs/${job.id}`} className="job-card animate-fade-in" style={{ animationDelay: `${i * 0.05}s`, opacity: 0 }}>
                <div className="job-card-header">
                  <div>
                    <div className="job-card-title">{job.title}</div>
                    <div className="job-card-company">{job.company}</div>
                  </div>
                  <div className={`match-score ${job.matchScore > 0.7 ? 'high' : ''}`}>
                    {job.matchPercent || Math.round(job.matchScore * 100)}%
                  </div>
                </div>
                <div className="job-card-meta">
                  {job.location && <span>📍 {job.location}</span>}
                  <span>💼 {job.workType}</span>
                </div>
                {job.prioritySignal && (
                  <div style={{ marginBottom: 'var(--space-sm)' }}>
                    <span className={`badge ${job.prioritySignal.level === 'urgent' ? 'badge-success' : job.prioritySignal.level === 'strong' ? 'badge-primary' : 'badge-neutral'}`}>
                      {job.prioritySignal.label}
                    </span>
                  </div>
                )}
                {job.missingSkills?.length > 0 && (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>
                    Gap to close: {job.missingSkills.slice(0, 2).join(', ')}
                  </div>
                )}
                <div className="job-card-skills">
                  {(job.skills || []).slice(0, 3).map((s, si) => (
                    <span key={si} className="skill-tag">{typeof s === 'string' ? s : s.skillName}</span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
