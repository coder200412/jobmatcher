'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';

function formatSalary(min, max, currency = 'USD') {
  const fmt = (n) => `$${(n / 1000).toFixed(0)}K`;
  if (min && max) return `${fmt(min)} — ${fmt(max)}`;
  if (min) return `From ${fmt(min)}`;
  if (max) return `Up to ${fmt(max)}`;
  return null;
}

export default function JobsPage() {
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    q: searchParams.get('q') || '',
    location: '',
    workType: '',
    salaryMin: '',
    salaryMax: '',
  });

  const fetchJobs = async (p = page) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 12 };
      if (filters.q) params.q = filters.q;
      if (filters.location) params.location = filters.location;
      if (filters.workType) params.workType = filters.workType;
      if (filters.salaryMin) params.salaryMin = filters.salaryMin;
      if (filters.salaryMax) params.salaryMax = filters.salaryMax;
      
      const data = await api.searchJobs(params);
      setJobs(data.jobs || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchJobs(1); }, []); // eslint-disable-line

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchJobs(1);
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

      {/* Search & Filters */}
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

        {/* Filter chips */}
        <div className="filter-bar" id="filter-bar">
          {workTypes.map(wt => (
            <button key={wt.value} type="button"
              className={`filter-chip ${filters.workType === wt.value ? 'active' : ''}`}
              onClick={() => { setFilters({...filters, workType: wt.value}); setTimeout(() => fetchJobs(1), 0); }}>
              {wt.label}
            </button>
          ))}
          <select className="form-select" style={{ padding: '6px 30px 6px 12px', fontSize: '0.8rem', borderRadius: 'var(--radius-full)', background: 'var(--bg-glass)' }}
            value={filters.salaryMin} onChange={e => { setFilters({...filters, salaryMin: e.target.value}); setTimeout(() => fetchJobs(1), 0); }}>
            <option value="">Min Salary</option>
            <option value="50000">$50K+</option>
            <option value="100000">$100K+</option>
            <option value="150000">$150K+</option>
            <option value="200000">$200K+</option>
          </select>
        </div>
      </form>

      {/* Results */}
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
            <Link key={job.id} href={`/jobs/${job.id}`} className="job-card animate-fade-in" style={{ animationDelay: `${i * 0.05}s`, opacity: 0 }}>
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

      {/* Pagination */}
      {total > 12 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => { setPage(page-1); fetchJobs(page-1); }}>← Prev</button>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Page {page} of {Math.ceil(total/12)}</span>
          <button disabled={page >= Math.ceil(total/12)} onClick={() => { setPage(page+1); fetchJobs(page+1); }}>Next →</button>
        </div>
      )}
    </div>
  );
}
