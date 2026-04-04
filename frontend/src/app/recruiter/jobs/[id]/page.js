'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import ApplicationTimeline from '@/components/ApplicationTimeline';

export default function ManageJobPage() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [applications, setApplications] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('applicants');
  const [notesByApplication, setNotesByApplication] = useState({});

  useEffect(() => {
    Promise.all([
      api.getJob(id),
      api.getJobApplications(id).catch(() => ({ applications: [] })),
      api.getCandidateRecommendations(id, 10).catch(() => ({ recommendations: [] })),
    ]).then(([jobData, appsData, candsData]) => {
      setJob(jobData);
      setApplications(appsData.applications || []);
      setCandidates(candsData.recommendations || []);
    }).finally(() => setLoading(false));
  }, [id]);

  const handleStatusChange = async (appId, newStatus) => {
    try {
      const note = notesByApplication[appId] || '';
      const response = await api.updateApplicationStatus(appId, newStatus, note);
      setApplications(prev => prev.map(a => {
        if (a.id !== appId) return a;

        const nextTimeline = [...(a.timeline || []), response.timelineEvent];

        return {
          ...a,
          status: newStatus,
          timeline: nextTimeline,
          transparency: {
            ...(a.transparency || {}),
            currentStage: newStatus,
            latestEventTitle: response.timelineEvent?.title || newStatus,
            latestEventAt: response.updatedAt,
            totalEvents: nextTimeline.length,
            progressPercent: { reviewed: 45, shortlisted: 75, rejected: 100, hired: 100 }[newStatus] || 20,
            hasRecruiterResponse: true,
            firstResponseHours: a.transparency?.firstResponseHours ?? 0,
          },
          updatedAt: response.updatedAt,
        };
      }));
      setNotesByApplication(prev => ({ ...prev, [appId]: '' }));
    } catch (err) {
      alert(err.message);
    }
  };

  const statusColors = {
    submitted: 'badge-info', reviewed: 'badge-warning',
    shortlisted: 'badge-primary', rejected: 'badge-error', hired: 'badge-success',
  };

  if (loading) return (
    <div className="container section">
      <div className="skeleton" style={{ height: '40px', width: '60%', marginBottom: '20px' }} />
      <div className="skeleton skeleton-card" />
    </div>
  );

  if (!job) return null;

  return (
    <div className="container section" id="manage-job-page">
      <Link href="/recruiter" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--space-lg)', display: 'inline-block' }}>
        ← Back to Dashboard
      </Link>

      <div className="section-header">
        <div>
          <h1>{job.title}</h1>
          <p style={{ color: 'var(--text-accent)', fontSize: '1.1rem', fontWeight: 500 }}>{job.company}</p>
        </div>
        <span className={`badge ${job.status === 'active' ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: '0.9rem', padding: '6px 16px' }}>
          {job.status}
        </span>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 'var(--space-xl)', display: 'inline-flex' }}>
        <button className={`tab ${activeTab === 'applicants' ? 'active' : ''}`} onClick={() => setActiveTab('applicants')}>
          📝 Applicants ({applications.length})
        </button>
        <button className={`tab ${activeTab === 'recommended' ? 'active' : ''}`} onClick={() => setActiveTab('recommended')}>
          🎯 Recommended ({candidates.length})
        </button>
      </div>

      {activeTab === 'applicants' && (
        applications.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📝</div>
            <div className="empty-state-title">No applications yet</div>
            <p>Share your job listing to start receiving applications.</p>
          </div>
        ) : (
          <div className="grid grid-2">
            {applications.map(app => (
              <div key={app.id} className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                  <div>
                    <p style={{ fontWeight: 600 }}>{app.candidate?.fullName || 'Applicant'}</p>
                    {app.candidate?.headline && (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '2px' }}>
                        {app.candidate.headline}
                      </p>
                    )}
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Applied {new Date(app.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`badge ${statusColors[app.status]}`}>{app.status}</span>
                </div>
                <div className="flex gap-md" style={{ marginBottom: 'var(--space-md)', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                  {app.candidate?.location && <span>📍 {app.candidate.location}</span>}
                  <span>⏱ {app.transparency?.hasRecruiterResponse ? `First reply in ${app.transparency.firstResponseHours ?? 0}h` : 'Awaiting first recruiter reply'}</span>
                </div>
                {app.coverLetter && (
                  <div style={{ background: 'var(--bg-glass)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    {app.coverLetter.slice(0, 200)}{app.coverLetter.length > 200 ? '...' : ''}
                  </div>
                )}
                <div style={{ marginBottom: 'var(--space-md)' }}>
                  <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}>Transparent update for the candidate</label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    placeholder="Example: We liked your Kafka experience and will confirm interviews by Friday."
                    value={notesByApplication[app.id] || ''}
                    onChange={(e) => setNotesByApplication(prev => ({ ...prev, [app.id]: e.target.value }))}
                  />
                </div>
                <div className="flex flex-wrap gap-xs">
                  {['reviewed', 'shortlisted', 'rejected', 'hired'].filter(s => s !== app.status).map(status => (
                    <button key={status} className={`btn btn-sm ${status === 'rejected' ? 'btn-danger' : status === 'hired' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => handleStatusChange(app.id, status)}>
                      {status === 'reviewed' ? '👀' : status === 'shortlisted' ? '⭐' : status === 'rejected' ? '✖' : '🎉'} {status}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 'var(--space-lg)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-sm)' }}>
                    Candidate-facing timeline
                  </div>
                  <ApplicationTimeline timeline={app.timeline || []} compact />
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {activeTab === 'recommended' && (
        candidates.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🎯</div>
            <div className="empty-state-title">No candidate recommendations</div>
            <p>Add more skills to your job listing to get better matches.</p>
          </div>
        ) : (
          <div className="grid grid-2">
            {candidates.map(c => (
              <div key={c.id} className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: '1.05rem' }}>{c.firstName} {c.lastName}</p>
                    {c.headline && <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{c.headline}</p>}
                  </div>
                  <div className={`match-score ${c.matchScore > 0.7 ? 'high' : ''}`}>
                    {c.matchPercent || Math.round(c.matchScore * 100)}% match
                  </div>
                </div>
                <div className="flex gap-md" style={{ marginTop: 'var(--space-md)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {c.location && <span>📍 {c.location}</span>}
                  <span>📊 {c.experienceYears} yrs exp</span>
                </div>
                <div className="flex gap-sm" style={{ marginTop: 'var(--space-sm)', flexWrap: 'wrap' }}>
                  {c.responseProbability && (
                    <span className="badge badge-primary">
                      Reply probability: {c.responseProbability.percent}%
                    </span>
                  )}
                  {c.activitySignal && (
                    <span className={`badge ${c.activitySignal.level === 'high' ? 'badge-success' : c.activitySignal.level === 'medium' ? 'badge-warning' : 'badge-neutral'}`}>
                      {c.activitySignal.label}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-xs" style={{ marginTop: 'var(--space-sm)' }}>
                  {(c.skills || []).slice(0, 6).map((s, i) => (
                    <span key={i} className="skill-tag">{typeof s === 'string' ? s : s.skillName || s.skill_name}</span>
                  ))}
                </div>
                {c.matchedSkills?.length > 0 && (
                  <div style={{ marginTop: 'var(--space-md)' }}>
                    <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      Strong overlap
                    </div>
                    <div className="flex flex-wrap gap-xs">
                      {c.matchedSkills.slice(0, 4).map((skill) => (
                        <span key={skill} className="skill-tag" style={{ background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.2)' }}>
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {c.missingSkills?.length > 0 && (
                  <div style={{ marginTop: 'var(--space-md)' }}>
                    <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      Gaps to probe in screening
                    </div>
                    <div className="flex flex-wrap gap-xs">
                      {c.missingSkills.slice(0, 4).map((skill) => (
                        <span key={skill} className="skill-tag" style={{ background: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.18)' }}>
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {c.recruiterReasons?.length > 0 && (
                  <div style={{ marginTop: 'var(--space-md)', display: 'grid', gap: '6px' }}>
                    {c.recruiterReasons.map((reason) => (
                      <div key={reason} style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-glass)', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                        {reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
