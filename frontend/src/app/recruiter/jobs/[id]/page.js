'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import ApplicationTimeline from '@/components/ApplicationTimeline';
import ApplicationRoundsTracker from '@/components/ApplicationRoundsTracker';

export default function ManageJobPage() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [applications, setApplications] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('applicants');
  const [notesByApplication, setNotesByApplication] = useState({});
  const [roundFeedback, setRoundFeedback] = useState({});
  const [savingRounds, setSavingRounds] = useState(false);

  const roundFeedbackKey = (appId, roundId) => `${appId}:${roundId}`;

  const refreshApplications = async () => {
    const appsData = await api.getJobApplications(id).catch(() => ({ applications: [] }));
    setApplications(appsData.applications || []);
  };

  useEffect(() => {
    Promise.all([
      api.getJob(id),
      api.getHiringRounds(id).catch(() => ({ rounds: [] })),
      api.getJobApplications(id).catch(() => ({ applications: [] })),
      api.getCandidateRecommendations(id, 10).catch(() => ({ recommendations: [] })),
    ]).then(([jobData, roundsData, appsData, candsData]) => {
      setJob(jobData);
      setRounds(roundsData.rounds || []);
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

  const handleRoundNameChange = (roundId, name) => {
    setRounds((prev) => prev.map((round) => (
      round.id === roundId ? { ...round, name } : round
    )));
  };

  const addRound = () => {
    setRounds((prev) => [
      ...prev,
      {
        id: `draft-${Date.now()}-${prev.length}`,
        name: '',
        order: prev.length + 1,
        isDraft: true,
      },
    ]);
  };

  const removeRound = (roundId) => {
    setRounds((prev) => prev
      .filter((round) => round.id !== roundId)
      .map((round, index) => ({ ...round, order: index + 1 })));
  };

  const saveRounds = async () => {
    const sanitized = rounds
      .map((round) => ({ ...round, name: round.name?.trim() }))
      .filter((round) => round.name);

    if (sanitized.length === 0) {
      try {
        setSavingRounds(true);
        await api.updateHiringRounds(id, []);
        setRounds([]);
        await refreshApplications();
      } catch (err) {
        alert(err.message);
      } finally {
        setSavingRounds(false);
      }
      return;
    }

    try {
      setSavingRounds(true);
      const response = await api.updateHiringRounds(
        id,
        sanitized.map((round) => ({
          ...(String(round.id || '').startsWith('draft-') ? {} : { id: round.id }),
          name: round.name,
        }))
      );
      setRounds(response.rounds || []);
      await refreshApplications();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingRounds(false);
    }
  };

  const handleRoundStatusChange = async (appId, roundId, status) => {
    const feedback = roundFeedback[roundFeedbackKey(appId, roundId)] || '';

    if (status === 'not_cleared' && !feedback.trim()) {
      alert('Please enter a valid reason before marking this round as not cleared.');
      return;
    }

    try {
      await api.updateApplicationRound(appId, roundId, {
        status,
        reason: status === 'not_cleared' ? feedback.trim() : undefined,
        note: status !== 'not_cleared' && feedback.trim() ? feedback.trim() : undefined,
      });
      setRoundFeedback((prev) => ({ ...prev, [roundFeedbackKey(appId, roundId)]: '' }));
      await refreshApplications();
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
          <p style={{ color: 'var(--text-secondary)', marginTop: '6px' }}>
            {job.applicationsCount || 0} of {job.positionsCount || 1} positions filled
            {' · '}
            {job.positionsRemaining || 0} remaining
          </p>
        </div>
        <span className={`badge ${job.status === 'active' ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: '0.9rem', padding: '6px 16px' }}>
          {job.status}
        </span>
      </div>

      {job.status === 'closed' && (
        <div className="glass-card" style={{ marginBottom: 'var(--space-xl)', borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.08)' }}>
          <strong style={{ display: 'block', marginBottom: '6px' }}>This listing has reached its application capacity.</strong>
          <span style={{ color: 'var(--text-secondary)' }}>
            The job is now hidden from job seekers and remains here for recruiter review only.
          </span>
        </div>
      )}

      <div className="glass-card" style={{ marginBottom: 'var(--space-xl)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-md)', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
          <div>
            <h3 style={{ marginBottom: '6px' }}>Hiring Rounds</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Define the stages for this job. Candidates will see which rounds they cleared and the reason if they do not clear one.
            </p>
          </div>
          <div className="flex gap-xs">
            <button type="button" className="btn btn-secondary btn-sm" onClick={addRound}>
              + Add Round
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={saveRounds} disabled={savingRounds}>
              {savingRounds ? 'Saving...' : 'Save Rounds'}
            </button>
          </div>
        </div>

        {rounds.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            No rounds configured yet. Add stages like Resume Screen, Technical Round, and HR Round.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
            {rounds.map((round, index) => (
              <div key={round.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 'var(--space-sm)', alignItems: 'center' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Round {index + 1}
                </div>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Technical Interview"
                  value={round.name || ''}
                  onChange={(e) => handleRoundNameChange(round.id, e.target.value)}
                />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeRound(round.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
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
                {app.rounds?.length > 0 ? (
                  <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-sm)' }}>
                        Hiring rounds
                      </div>
                      <ApplicationRoundsTracker
                        rounds={app.rounds}
                        compact
                        emptyMessage="No rounds configured yet."
                      />
                    </div>

                    <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
                      {app.rounds.map((round) => (
                        <div key={round.roundId} style={{ padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-glass)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-sm)', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                            <div style={{ fontWeight: 700 }}>
                              Round {round.order}: {round.name}
                            </div>
                            <span className={`badge ${round.status === 'cleared' ? 'badge-success' : round.status === 'not_cleared' ? 'badge-error' : 'badge-neutral'}`}>
                              {round.status === 'not_cleared' ? 'Not Cleared' : round.status.charAt(0).toUpperCase() + round.status.slice(1)}
                            </span>
                          </div>
                          <textarea
                            className="form-textarea"
                            rows={2}
                            placeholder={round.status === 'not_cleared'
                              ? 'Enter a valid reason for not clearing this round'
                              : 'Optional recruiter note for this round'}
                            value={roundFeedback[roundFeedbackKey(app.id, round.roundId)] || ''}
                            onChange={(e) => setRoundFeedback((prev) => ({
                              ...prev,
                              [roundFeedbackKey(app.id, round.roundId)]: e.target.value,
                            }))}
                          />
                          <div className="flex flex-wrap gap-xs" style={{ marginTop: 'var(--space-sm)' }}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleRoundStatusChange(app.id, round.roundId, 'pending')}>
                              Reset Pending
                            </button>
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => handleRoundStatusChange(app.id, round.roundId, 'cleared')}>
                              Mark Cleared
                            </button>
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => handleRoundStatusChange(app.id, round.roundId, 'not_cleared')}>
                              Mark Not Cleared
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginBottom: 'var(--space-md)' }}>
                      <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}>Final recruiter update</label>
                      <textarea
                        className="form-textarea"
                        rows={3}
                        placeholder="Optional summary note visible to the candidate."
                        value={notesByApplication[app.id] || ''}
                        onChange={(e) => setNotesByApplication(prev => ({ ...prev, [app.id]: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-wrap gap-xs">
                      {app.status !== 'hired' && (
                        <button className="btn btn-primary btn-sm" onClick={() => handleStatusChange(app.id, 'hired')}>
                          🎉 hired
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
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
                  </>
                )}
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
