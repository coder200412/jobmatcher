'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

function formatSalary(min, max) {
  const fmt = (n) => `$${(n / 1000).toFixed(0)}K`;
  if (min && max) return `${fmt(min)} — ${fmt(max)}`;
  if (min) return `From ${fmt(min)}`;
  if (max) return `Up to ${fmt(max)}`;
  return null;
}

export default function JobsPageClient() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    q: '',
    location: '',
    workType: '',
    salaryMin: '',
    salaryMax: '',
  });

  useEffect(() => {
    const nextQuery = searchParams.get('q') || '';
    setFilters((current) => (
      current.q === nextQuery ? current : { ...current, q: nextQuery }
    ));
  }, [searchParams]);

  const fetchJobs = async (nextFilters, p = page) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 12 };
      if (nextFilters.q) params.q = nextFilters.q;
      if (nextFilters.location) params.location = nextFilters.location;
      if (nextFilters.workType) params.workType = nextFilters.workType;
      if (nextFilters.salaryMin) params.salaryMin = nextFilters.salaryMin;
      if (nextFilters.salaryMax) params.salaryMax = nextFilters.salaryMax;

      const data = await api.searchJobs(params);
      setJobs(data.jobs || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchJobs(filters, 1);
    setPage(1);
  }, [filters.q]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = async (e) => {
    e.preventDefault();
    setPage(1);
    await fetchJobs(filters, 1);
  };

  const applyQuickFilter = (nextFilters) => {
    setFilters(nextFilters);
    setPage(1);
    void fetchJobs(nextFilters, 1);
  };

  const workTypes = [
    { value: '', label: 'All Types' },
    { value: 'remote', label: '🏠 Remote' },
    { value: 'hybrid', label: '🔄 Hybrid' },
    { value: 'onsite', label: '🏢 On-site' },
  ];

  return (
    <div className="container section" id="jobs-page">
      <div className="section-header" style={{ flexDirection: 'column', textAlign: 'center' }}>
        <h1>Find Your Next <span className="gradient-text">Opportunity</span></h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-sm)' }}>
          {total} jobs available
        </p>
      </div>

      <form onSubmit={handleSearch}>
        <div className="search-container" id="job-search-bar" style={{ marginBottom: 'var(--space-lg)' }}>
          <span style={{ fontSize: '1.2rem' }}>🔍</span>
          <input type="text" className="form-input" placeholder="Search jobs, skills, companies..."
            value={filters.q} onChange={e => setFilters({...filters, q: e.target.value})}
            style={{ flex: 1 }} id="job-search-input" />
          <input type="text" className="form-input" placeholder="📍 Location"
            value={filters.location} onChange={e => setFilters({...filters, location: e.target.value})}
            style={{ flex: 0.6, borderLeft: '1px solid var(--border-default)', borderRadius: 0 }} />
          <button type="submit" className="btn btn-primary" id="job-search-btn">Search</button>
        </div>

        <div className="filter-bar" id="filter-bar">
          {workTypes.map(wt => (
            <button key={wt.value} type="button"
              className={`filter-chip ${filters.workType === wt.value ? 'active' : ''}`}
              onClick={() => applyQuickFilter({ ...filters, workType: wt.value })}>
              {wt.label}
            </button>
          ))}
          <select className="form-select" style={{ padding: '6px 30px 6px 12px', fontSize: '0.8rem', borderRadius: 'var(--radius-full)', background: 'var(--bg-glass)' }}
            value={filters.salaryMin} onChange={e => applyQuickFilter({ ...filters, salaryMin: e.target.value })}>
            <option value="">Min Salary</option>
            <option value="50000">$50K+</option>
            <option value="100000">$100K+</option>
            <option value="150000">$150K+</option>
            <option value="200000">$200K+</option>
          </select>
        </div>
      </form>

      {loading ? (
        <div className="grid grid-2">
          {[1,2,3,4].map(i => (
            <div key={i} className="skeleton skeleton-card" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">No jobs found</div>
          <p>Try adjusting your search criteria or filters.</p>
        </div>
      ) : (
        <div className="grid grid-2" id="jobs-grid">
          {jobs.map((job, i) => (
            <Link key={job.id} href={`/jobs/${job.id}`} className="job-card animate-fade-in" style={{ animationDelay: `${i * 0.05}s`, opacity: 0 }}
              onClick={() => user?.role === 'candidate' ? api.submitRecommendationFeedback(job.id, 'click').catch(() => {}) : undefined}>
              <div className="job-card-header">
                <div>
                  <div className="job-card-title">{job.title}</div>
                  <div className="job-card-company">{job.company}</div>
                </div>
                {job.matchScore && (
                  <div className={`match-score ${job.matchScore > 0.7 ? 'high' : ''}`}>
                    {Math.round(job.matchScore * 100)}% match
                  </div>
                )}
              </div>

              <div className="job-card-meta">
                {job.location && <span>📍 {job.location}</span>}
                <span>💼 {job.workType || job.work_type}</span>
                {(job.experienceMin !== undefined || job.experience_min !== undefined) && (
                  <span>📊 {job.experienceMin || job.experience_min}–{job.experienceMax || job.experience_max || '10'}+ yrs</span>
                )}
                <span>👥 {job.positionsRemaining ?? Math.max(0, (job.positionsCount || 1) - (job.applicationsCount || 0))} spots left</span>
              </div>

              <div className="flex gap-xs" style={{ marginBottom: 'var(--space-sm)', flexWrap: 'wrap' }}>
                <span className="badge badge-neutral">👥 {job.positionsCount || 1} positions</span>
                {(job.priorityScore || job.priority_score) ? (
                  <span className="badge badge-primary">🔥 Priority {job.priorityScore || job.priority_score}</span>
                ) : null}
                {job.credibility ? (
                  <span className={`badge ${job.credibility.score >= 80 ? 'badge-success' : job.credibility.score >= 60 ? 'badge-neutral' : 'badge-warning'}`}>
                    {job.credibility.label}
                  </span>
                ) : null}
              </div>

              {formatSalary(job.salaryMin || job.salary_min, job.salaryMax || job.salary_max) && (
                <div className="job-card-salary" style={{ marginBottom: 'var(--space-sm)' }}>
                  {formatSalary(job.salaryMin || job.salary_min, job.salaryMax || job.salary_max)}
                </div>
              )}

              <div className="job-card-skills">
                {(job.skills || []).slice(0, 5).map((skill, si) => (
                  <span key={si} className="skill-tag">
                    {typeof skill === 'string' ? skill : skill.skillName || skill.skill_name}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}

      {total > 12 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => { const nextPage = page - 1; setPage(nextPage); void fetchJobs(filters, nextPage); }}>← Prev</button>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Page {page} of {Math.ceil(total/12)}</span>
          <button disabled={page >= Math.ceil(total/12)} onClick={() => { const nextPage = page + 1; setPage(nextPage); void fetchJobs(filters, nextPage); }}>Next →</button>
        </div>
      )}
    </div>
  );
}
