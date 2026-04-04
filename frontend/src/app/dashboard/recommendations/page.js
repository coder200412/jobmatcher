'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [experiment, setExperiment] = useState(null);
  const [visibleCount, setVisibleCount] = useState(8);
  const loadMoreRef = useRef(null);

  useEffect(() => {
    api.getJobRecommendations(30)
      .then(data => {
        setRecommendations(data.recommendations || []);
        setExperiment(data.experiment || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleFeedback = async (jobId, action) => {
    try {
      await api.submitRecommendationFeedback(jobId, action);
      if (action === 'not_interested') {
        setRecommendations(prev => prev.filter(job => job.id !== jobId));
      }
    } catch {}
  };

  useEffect(() => {
    if (!loadMoreRef.current || visibleCount >= recommendations.length) {
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount((current) => Math.min(current + 6, recommendations.length));
      }
    }, { threshold: 0.2 });

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [visibleCount, recommendations.length]);

  return (
    <div className="container section" id="recommendations-page">
      <div className="section-header" style={{ flexDirection: 'column' }}>
        <h1>🎯 Jobs <span className="gradient-text">Recommended For You</span></h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-xs)' }}>
          Personalized matches based on your skills, experience, and preferences
        </p>
        {experiment && (
          <span className="badge badge-neutral" style={{ marginTop: 'var(--space-sm)' }}>
            Experiment variant: {experiment.variant}
          </span>
        )}
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
        <div>
          {recommendations[0]?.coldStartInsight && (
            <div className="glass-card" style={{ marginBottom: 'var(--space-xl)' }}>
              <h3 style={{ marginBottom: 'var(--space-sm)' }}>Cold-start onboarding boost</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>
                {recommendations[0].coldStartInsight.summary}
              </p>
              <div style={{ display: 'grid', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                {recommendations[0].coldStartInsight.nextBestActions.map((item) => (
                  <div key={item}>• {item}</div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-2">
          {recommendations.slice(0, visibleCount).map((job, i) => (
            <div key={job.id} className="job-card animate-fade-in" style={{ animationDelay: `${i * 0.04}s`, opacity: 0 }}>
              <div className="job-card-header">
                <div>
                  <Link href={`/jobs/${job.id}`} className="job-card-title" onClick={() => handleFeedback(job.id, 'click')}>
                    {job.title}
                  </Link>
                  <div className="job-card-company">{job.company}</div>
                </div>
                <div className={`match-score ${job.matchScore > 0.7 ? 'high' : ''}`}>
                  {job.matchPercent || Math.round(job.matchScore * 100)}% match
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

              {job.feedReasons?.length > 0 && (
                <div style={{ marginBottom: 'var(--space-sm)', display: 'grid', gap: '6px' }}>
                  {job.feedReasons.slice(0, 2).map((reason) => (
                    <div key={reason} style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      • {reason}
                    </div>
                  ))}
                </div>
              )}

              {job.missingSkills?.length > 0 && (
                <div style={{ marginBottom: 'var(--space-sm)' }}>
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Missing skills
                  </div>
                  <div className="flex flex-wrap gap-xs">
                    {job.missingSkills.slice(0, 3).map((skill) => (
                      <span key={skill} className="skill-tag" style={{ background: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.18)' }}>
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="job-card-skills">
                {(job.skills || []).slice(0, 5).map((s, si) => (
                  <span key={si} className="skill-tag">{typeof s === 'string' ? s : s.skillName}</span>
                ))}
              </div>
              <div className="flex gap-xs" style={{ marginTop: 'var(--space-md)', flexWrap: 'wrap' }}>
                <Link href={`/jobs/${job.id}`} className="btn btn-primary btn-sm" onClick={() => handleFeedback(job.id, 'click')}>
                  View Match
                </Link>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleFeedback(job.id, 'skip')}>
                  Skip
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleFeedback(job.id, 'not_interested')}>
                  Not Interested
                </button>
              </div>
            </div>
          ))}
        </div>
        {visibleCount < recommendations.length && (
          <div ref={loadMoreRef} style={{ marginTop: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading more personalized matches...
          </div>
        )}
        </div>
      )}
    </div>
  );
}
