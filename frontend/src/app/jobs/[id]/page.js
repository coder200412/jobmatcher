'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import RecruiterTrustCard from '@/components/RecruiterTrustCard';

function formatSalary(min, max) {
  const fmt = (n) => `$${(n / 1000).toFixed(0)}K`;
  if (min && max) return `${fmt(min)} — ${fmt(max)} / year`;
  if (min) return `From ${fmt(min)} / year`;
  if (max) return `Up to ${fmt(max)} / year`;
  return 'Not specified';
}

export default function JobDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const router = useRouter();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [coverLetter, setCoverLetter] = useState('');
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [error, setError] = useState('');
  const [recruiterTrust, setRecruiterTrust] = useState(null);

  useEffect(() => {
    api.getJob(id)
      .then(async (jobData) => {
        setJob(jobData);
        if (jobData?.recruiterId) {
          const trust = await api.getRecruiterTrustScore(jobData.recruiterId).catch(() => null);
          setRecruiterTrust(trust);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleApply = async () => {
    setApplying(true);
    try {
      await api.applyToJob(id, { coverLetter });
      setApplied(true);
      setShowApplyModal(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  };

  if (loading) return (
    <div className="container section">
      <div className="skeleton" style={{ height: '40px', width: '60%', marginBottom: '20px' }} />
      <div className="skeleton" style={{ height: '24px', width: '40%', marginBottom: '40px' }} />
      <div className="skeleton" style={{ height: '300px' }} />
    </div>
  );

  if (error && !job) return (
    <div className="container section">
      <div className="empty-state">
        <div className="empty-state-icon">❌</div>
        <div className="empty-state-title">Job not found</div>
        <p>{error}</p>
        <Link href="/jobs" className="btn btn-primary" style={{ marginTop: 'var(--space-lg)' }}>Back to Jobs</Link>
      </div>
    </div>
  );

  if (!job) return null;

  return (
    <div className="container section" id="job-detail">
      {/* Back link */}
      <Link href="/jobs" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--space-lg)', display: 'inline-block' }}>
        ← Back to Jobs
      </Link>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 'var(--space-xl)', alignItems: 'start' }}>
        {/* Main Content */}
        <div className="animate-fade-in">
          <div style={{ marginBottom: 'var(--space-xl)' }}>
            <h1 style={{ marginBottom: 'var(--space-sm)' }}>{job.title}</h1>
            <p style={{ fontSize: '1.15rem', color: 'var(--text-accent)', fontWeight: 600 }}>{job.company}</p>
          </div>

          <div className="flex flex-wrap gap-md" style={{ marginBottom: 'var(--space-xl)' }}>
            {job.location && <div className="badge badge-neutral">📍 {job.location}</div>}
            <div className="badge badge-neutral">💼 {job.workType || job.work_type}</div>
            <div className="badge badge-neutral">📊 {job.experienceMin || job.experience_min}–{job.experienceMax || job.experience_max || '10'}+ years</div>
            <div className="badge badge-success">{formatSalary(job.salaryMin || job.salary_min, job.salaryMax || job.salary_max)}</div>
          </div>

          {/* Skills */}
          <div style={{ marginBottom: 'var(--space-xl)' }}>
            <h3 style={{ marginBottom: 'var(--space-md)' }}>Required Skills</h3>
            <div className="flex flex-wrap gap-sm">
              {(job.skills || []).map((skill, i) => (
                <span key={i} className="skill-tag" style={{ padding: '6px 16px', fontSize: '0.85rem' }}>
                  {typeof skill === 'string' ? skill : skill.skillName || skill.skill_name}
                  {(typeof skill === 'object' && (skill.isRequired || skill.is_required)) && ' ★'}
                </span>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="glass-card" style={{ marginBottom: 'var(--space-xl)' }}>
            <h3 style={{ marginBottom: 'var(--space-md)' }}>Job Description</h3>
            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {job.description}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="animate-fade-in delay-1" style={{ position: 'sticky', top: 'calc(var(--header-height) + var(--space-lg))' }}>
          {/* Apply Card */}
          <div className="glass-card" style={{ marginBottom: 'var(--space-lg)', textAlign: 'center' }}>
            {applied ? (
              <div>
                <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-md)' }}>✅</div>
                <h4 style={{ marginBottom: 'var(--space-sm)' }}>Application Submitted!</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Good luck with your application.</p>
                <Link href="/dashboard/applications" className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-md)' }}>
                  View My Applications
                </Link>
              </div>
            ) : (
              <>
                <h4 style={{ marginBottom: 'var(--space-md)' }}>Interested in this role?</h4>
                {user ? (
                  <button className="btn btn-primary btn-lg" style={{ width: '100%' }} id="apply-btn"
                    onClick={() => setShowApplyModal(true)}>
                    Apply Now 🚀
                  </button>
                ) : (
                  <Link href="/auth/login" className="btn btn-primary btn-lg" style={{ width: '100%' }}>
                    Sign in to Apply
                  </Link>
                )}
              </>
            )}
            {error && <p style={{ color: 'var(--error)', fontSize: '0.85rem', marginTop: 'var(--space-sm)' }}>{error}</p>}
          </div>

          {/* Job Info Card */}
          <div className="glass-card">
            <h4 style={{ marginBottom: 'var(--space-md)' }}>Job Details</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {[
                ['👁', 'Views', job.viewsCount || job.views_count || 0],
                ['📝', 'Applications', job.applicationsCount || job.applications_count || 0],
                ['📅', 'Posted', new Date(job.createdAt || job.created_at).toLocaleDateString()],
                ['🏷', 'Status', job.status],
              ].map(([icon, label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{icon} {label}</span>
                  <span style={{ fontWeight: 600 }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {recruiterTrust && (
            <div style={{ marginTop: 'var(--space-lg)' }}>
              <RecruiterTrustCard trust={recruiterTrust} title="Recruiter Trust Score" compact />
            </div>
          )}
        </div>
      </div>

      {/* Apply Modal */}
      {showApplyModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}
          onClick={() => setShowApplyModal(false)}>
          <div className="glass-card animate-fade-in" style={{ maxWidth: '500px', width: '100%', margin: 'var(--space-lg)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 'var(--space-md)' }}>Apply to {job.title}</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)', fontSize: '0.9rem' }}>at {job.company}</p>
            
            <div className="form-group">
              <label className="form-label">Cover Letter (optional)</label>
              <textarea className="form-textarea" placeholder="Tell them why you're a great fit..."
                value={coverLetter} onChange={e => setCoverLetter(e.target.value)} rows={6} id="cover-letter" />
            </div>

            <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowApplyModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleApply} disabled={applying} id="submit-application">
                {applying ? 'Submitting...' : 'Submit Application 🚀'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
