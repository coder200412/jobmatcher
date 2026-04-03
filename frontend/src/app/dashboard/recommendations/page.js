'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

function formatSalary(min, max) {
  const fmt = (n) => `$${(n / 1000).toFixed(0)}K`;
  if (min && max) return `${fmt(min)} — ${fmt(max)}`;
  if (min) return `From ${fmt(min)}`;
  return null;
}

export default function RecommendationsPage() {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getJobRecommendations(30)
      .then(data => setRecommendations(data.recommendations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container section" id="recommendations-page">
      <div className="section-header" style={{ flexDirection: 'column' }}>
        <h1>🎯 Jobs <span className="gradient-text">Recommended For You</span></h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-xs)' }}>
          Personalized matches based on your skills, experience, and preferences
        </p>
      </div>

      {loading ? (
        <div className="grid grid-2">{[1,2,3,4,5,6].map(i => <div key={i} className="skeleton skeleton-card" />)}</div>
      ) : recommendations.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🎯</div>
          <div className="empty-state-title">No recommendations yet</div>
          <p>Update your profile and add skills to get personalized job matches.</p>
          <Link href="/profile" className="btn btn-primary" style={{ marginTop: 'var(--space-md)' }}>Complete Profile</Link>
        </div>
      ) : (
        <div className="grid grid-2">
          {recommendations.map((job, i) => (
            <Link key={job.id} href={`/jobs/${job.id}`} className="job-card animate-fade-in" style={{ animationDelay: `${i * 0.04}s`, opacity: 0 }}>
              <div className="job-card-header">
                <div>
                  <div className="job-card-title">{job.title}</div>
                  <div className="job-card-company">{job.company}</div>
                </div>
                <div className={`match-score ${job.matchScore > 0.7 ? 'high' : ''}`}>
                  {Math.round(job.matchScore * 100)}% match
                </div>
              </div>

              <div className="job-card-meta">
                {job.location && <span>📍 {job.location}</span>}
                <span>💼 {job.workType}</span>
              </div>

              {formatSalary(job.salaryMin, job.salaryMax) && (
                <div className="job-card-salary" style={{ marginBottom: 'var(--space-sm)' }}>
                  {formatSalary(job.salaryMin, job.salaryMax)}
                </div>
              )}

              {/* Score Breakdown */}
              {job.scoreBreakdown && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', marginBottom: 'var(--space-sm)' }}>
                  {[
                    { label: 'Skills', val: job.scoreBreakdown.skills },
                    { label: 'Exp', val: job.scoreBreakdown.experience },
                    { label: 'Loc', val: job.scoreBreakdown.location },
                    { label: 'New', val: job.scoreBreakdown.recency },
                    { label: 'Hot', val: job.scoreBreakdown.popularity },
                  ].map(b => (
                    <div key={b.label} style={{ textAlign: 'center' }}>
                      <div className="progress-bar" style={{ marginBottom: '2px' }}>
                        <div className="progress-bar-fill" style={{ width: `${b.val}%` }} />
                      </div>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{b.label}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="job-card-skills">
                {(job.skills || []).slice(0, 5).map((s, si) => (
                  <span key={si} className="skill-tag">{typeof s === 'string' ? s : s.skillName}</span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
