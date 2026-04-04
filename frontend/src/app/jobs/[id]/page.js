'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
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
  const [job, setJob] = useState(null);
  const [matchAnalysis, setMatchAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [coverLetter, setCoverLetter] = useState('');
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [error, setError] = useState('');
  const [recruiterTrust, setRecruiterTrust] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [reporting, setReporting] = useState(false);
  const [reportMessage, setReportMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    api.getJob(id)
      .then(async (jobData) => {
        if (cancelled) return;
        setJob(jobData);
        if (jobData?.recruiterId) {
          const trust = await api.getRecruiterTrustScore(jobData.recruiterId).catch(() => null);
          if (!cancelled) {
            setRecruiterTrust(trust);
          }
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!user || user.role !== 'candidate') {
      setMatchAnalysis(null);
      setReferrals([]);
      return;
    }

    let cancelled = false;
    Promise.all([
      api.getJobMatchAnalysis(id).catch(() => null),
      api.getReferralMatches(id, 4).catch(() => ({ referrals: [] })),
      api.submitRecommendationFeedback(id, 'click').catch(() => null),
    ]).then(([analysis, referralData]) => {
      if (cancelled) return;
      setMatchAnalysis(analysis);
      setReferrals(referralData?.referrals || []);
    }).catch(() => {
      if (!cancelled) {
        setMatchAnalysis(null);
        setReferrals([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id, user]);

  const handleApply = async () => {
    setApplying(true);
    try {
      await api.applyToJob(id, { coverLetter });
      if (user?.role === 'candidate') {
        await api.submitRecommendationFeedback(id, 'apply').catch(() => {});
      }
      setApplied(true);
      setShowApplyModal(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  };

  const handleReportJob = async (reason) => {
    setReporting(true);
    setReportMessage('');
    try {
      const response = await api.reportJob(id, { reason });
      setReportMessage(response.message);
      setJob((current) => current ? { ...current, credibility: response.credibility } : current);
    } catch (err) {
      setReportMessage(err.message);
    } finally {
      setReporting(false);
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

  const positionsCount = job.positionsCount || 1;
  const applicationsCount = job.applicationsCount || job.applications_count || 0;
  const positionsRemaining = job.positionsRemaining ?? Math.max(0, positionsCount - applicationsCount);
  const jobIsUnavailable = job.status !== 'active' || job.isFull || positionsRemaining <= 0;

  const sections = job.jobInsights?.sections || {};

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
            <div className="badge badge-neutral">👥 {positionsCount} positions · {positionsRemaining} left</div>
            <div className="badge badge-success">{formatSalary(job.salaryMin || job.salary_min, job.salaryMax || job.salary_max)}</div>
          </div>

          {jobIsUnavailable && (
            <div className="glass-card" style={{ marginBottom: 'var(--space-xl)', borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.08)' }}>
              <h3 style={{ marginBottom: '8px' }}>This job is no longer accepting applications</h3>
              <p style={{ color: 'var(--text-secondary)' }}>
                The available positions have already been filled. Job seekers will no longer see this listing in the open jobs feed.
              </p>
            </div>
          )}

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

          {matchAnalysis && (
            <div className="glass-card" style={{ marginBottom: 'var(--space-xl)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-md)', alignItems: 'flex-start', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ marginBottom: '6px' }}>Explainable Match Score</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Your profile matches {matchAnalysis.matchPercent}% of this opportunity.
                  </p>
                </div>
                {matchAnalysis.prioritySignal && (
                  <span className={`badge ${matchAnalysis.prioritySignal.level === 'urgent' ? 'badge-success' : matchAnalysis.prioritySignal.level === 'strong' ? 'badge-primary' : 'badge-neutral'}`}>
                    {matchAnalysis.prioritySignal.label}
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 'var(--space-sm)' }}>
                    You already cover
                  </div>
                  <div className="flex flex-wrap gap-xs">
                    {(matchAnalysis.matchedSkills || []).length > 0 ? matchAnalysis.matchedSkills.slice(0, 6).map((skill) => (
                      <span key={skill} className="skill-tag" style={{ background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.2)' }}>
                        {skill}
                      </span>
                    )) : <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Add more profile skills to improve the analysis.</span>}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 'var(--space-sm)' }}>
                    Skill gap
                  </div>
                  <div className="flex flex-wrap gap-xs">
                    {(matchAnalysis.missingSkills || []).length > 0 ? matchAnalysis.missingSkills.slice(0, 6).map((skill) => (
                      <span key={skill} className="skill-tag" style={{ background: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.18)' }}>
                        {skill}
                      </span>
                    )) : <span style={{ color: 'var(--success)', fontSize: '0.9rem' }}>You cover the listed skills well.</span>}
                  </div>
                </div>
              </div>

              {matchAnalysis.feedReasons?.length > 0 && (
                <div style={{ marginBottom: 'var(--space-lg)' }}>
                  <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 'var(--space-sm)' }}>
                    Why this role is showing up
                  </div>
                  <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
                    {matchAnalysis.feedReasons.map((reason) => (
                      <div key={reason} style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-glass)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        {reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {matchAnalysis.learningPath?.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 'var(--space-sm)' }}>
                    Learning path to close the gap
                  </div>
                  <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
                    {matchAnalysis.learningPath.map((item) => (
                      <div key={item.skill} style={{ padding: '14px', borderRadius: 'var(--radius-lg)', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.12)' }}>
                        <div style={{ fontWeight: 700, marginBottom: '6px' }}>{item.skill}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', display: 'grid', gap: '4px' }}>
                          {item.roadmap.map((step) => (
                            <div key={step}>• {step}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          <div className="glass-card" style={{ marginBottom: 'var(--space-xl)' }}>
            <h3 style={{ marginBottom: 'var(--space-md)' }}>Job Description</h3>
            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {job.description}
            </div>
          </div>

          {job.jobInsights && (
            <div className="glass-card" style={{ marginBottom: 'var(--space-xl)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap', marginBottom: 'var(--space-lg)' }}>
                <div>
                  <h3 style={{ marginBottom: '6px' }}>Cleaned Job Insights</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Structured highlights extracted from the description.
                  </p>
                </div>
                <span className="badge badge-neutral">{job.jobInsights.seniority}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-lg)' }}>
                <div>
                  <h4 style={{ marginBottom: 'var(--space-sm)' }}>Responsibilities</h4>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'grid', gap: '6px' }}>
                    {(sections.responsibilities || []).slice(0, 4).map((line) => <div key={line}>• {line}</div>)}
                  </div>
                </div>
                <div>
                  <h4 style={{ marginBottom: 'var(--space-sm)' }}>Qualifications</h4>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'grid', gap: '6px' }}>
                    {(sections.requirements || []).slice(0, 4).map((line) => <div key={line}>• {line}</div>)}
                  </div>
                </div>
                <div>
                  <h4 style={{ marginBottom: 'var(--space-sm)' }}>Benefits & Signals</h4>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'grid', gap: '6px' }}>
                    {(sections.benefits || []).slice(0, 4).map((line) => <div key={line}>• {line}</div>)}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 'var(--space-lg)' }}>
                <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 'var(--space-sm)' }}>
                  Keywords and likely next-step roles
                </div>
                <div className="flex flex-wrap gap-xs" style={{ marginBottom: 'var(--space-md)' }}>
                  {(job.jobInsights.keywords || []).map((keyword) => (
                    <span key={keyword} className="skill-tag">{keyword}</span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-xs">
                  {(job.jobInsights.nextRoleTrajectory || []).map((role) => (
                    <span key={role} className="badge badge-neutral">{role}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
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
                  jobIsUnavailable ? (
                    <button className="btn btn-secondary btn-lg" style={{ width: '100%' }} disabled>
                      Positions Filled
                    </button>
                  ) : (
                    <button className="btn btn-primary btn-lg" style={{ width: '100%' }} id="apply-btn"
                      onClick={() => setShowApplyModal(true)}>
                      Apply Now 🚀
                    </button>
                  )
                ) : (
                  <Link href="/auth/login" className="btn btn-primary btn-lg" style={{ width: '100%' }}>
                    Sign in to Apply
                  </Link>
                )}
              </>
            )}
            {error && <p style={{ color: 'var(--error)', fontSize: '0.85rem', marginTop: 'var(--space-sm)' }}>{error}</p>}
            {matchAnalysis?.prioritySignal && !applied && (
              <div style={{ marginTop: 'var(--space-md)', padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', color: 'var(--text-secondary)', fontSize: '0.88rem', textAlign: 'left' }}>
                <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>{matchAnalysis.prioritySignal.label}</strong>
                {matchAnalysis.prioritySignal.reason}
              </div>
            )}
          </div>

          {/* Job Info Card */}
          <div className="glass-card">
            <h4 style={{ marginBottom: 'var(--space-md)' }}>Job Details</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {[
                ['👁', 'Views', job.viewsCount || job.views_count || 0],
                ['📝', 'Applications', applicationsCount],
                ['👥', 'Positions', `${positionsCount} total · ${positionsRemaining} left`],
                ['🔥', 'Priority', job.priorityScore || job.priority_score || 0],
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

          {job.credibility && (
            <div className="glass-card" style={{ marginTop: 'var(--space-lg)' }}>
              <h4 style={{ marginBottom: 'var(--space-md)' }}>Community Trust Layer</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Credibility score</span>
                <span className={`badge ${job.credibility.score >= 80 ? 'badge-success' : job.credibility.score >= 60 ? 'badge-primary' : 'badge-warning'}`}>
                  {job.credibility.score}/100 · {job.credibility.label}
                </span>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', display: 'grid', gap: '6px' }}>
                <div>Verified recruiter: {job.credibility.verifiedRecruiter ? 'Yes' : 'Not yet'}</div>
                <div>User reports: {job.credibility.reportCount}</div>
              </div>
              {user && (
                <div style={{ marginTop: 'var(--space-md)' }}>
                  <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    Report this job
                  </div>
                  <div className="flex flex-wrap gap-xs">
                    {['spam', 'fake_company', 'misleading_description'].map((reason) => (
                      <button key={reason} type="button" className="btn btn-ghost btn-sm" disabled={reporting} onClick={() => handleReportJob(reason)}>
                        {reason.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                  {reportMessage && (
                    <div style={{ color: reportMessage.toLowerCase().includes('error') ? 'var(--error)' : 'var(--success)', fontSize: '0.82rem', marginTop: '8px' }}>
                      {reportMessage}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {user?.role === 'candidate' && referrals.length > 0 && (
            <div className="glass-card" style={{ marginTop: 'var(--space-lg)' }}>
              <h4 style={{ marginBottom: 'var(--space-md)' }}>Referral Matches</h4>
              <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
                {referrals.map((referral) => (
                  <div key={referral.id} style={{ padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-glass)' }}>
                    <div style={{ fontWeight: 700 }}>{referral.fullName}</div>
                    {referral.headline && <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{referral.headline}</div>}
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '4px' }}>{referral.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
