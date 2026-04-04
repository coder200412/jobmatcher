'use client';

import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';

function MessageBanner({ message }) {
  if (!message) return null;

  const isError = message.toLowerCase().startsWith('error');

  return (
    <div
      style={{
        padding: '10px 14px',
        background: isError ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
        border: `1px solid ${isError ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
        borderRadius: 'var(--radius-md)',
        color: isError ? 'var(--error)' : 'var(--success)',
        fontSize: '0.85rem',
        marginBottom: 'var(--space-md)',
      }}
    >
      {message}
    </div>
  );
}

function ResultList({ title, items = [], emptyText, tone = 'default' }) {
  return (
    <div>
      <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '6px' }}>
        {title}
      </div>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-xs">
          {items.map((item) => (
            <span
              key={item}
              className="skill-tag"
              style={tone === 'warning' ? { background: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.18)' } : undefined}
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{emptyText}</div>
      )}
    </div>
  );
}

export default function ResumeAnalyzerCard({
  title = 'AI Resume Analyzer',
  subtitle = 'Compare your resume with a target role to see exact skill gaps and ATS improvements.',
  jobs = [],
  initialResumeText = '',
}) {
  const [resumeText, setResumeText] = useState(initialResumeText || '');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [message, setMessage] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (!initialResumeText) return;
    setResumeText((current) => current || initialResumeText);
  }, [initialResumeText]);

  const selectableJobs = useMemo(() => {
    const uniqueJobs = new Map();
    for (const job of jobs) {
      if (!job?.id || uniqueJobs.has(job.id)) continue;
      uniqueJobs.set(job.id, {
        id: job.id,
        title: job.title || job.jobTitle || 'Untitled role',
        company: job.company || job.jobCompany || '',
      });
    }
    return Array.from(uniqueJobs.values());
  }, [jobs]);

  const handleResumeFile = async (file) => {
    if (!file) return;
    setMessage('');

    try {
      const text = await file.text();
      const normalized = text.trim();
      if (!normalized) {
        setMessage('Error: This file did not contain readable text. Paste the resume text directly for the most precise analysis.');
        return;
      }
      setResumeText(normalized.slice(0, 25000));
    } catch {
      setMessage('Error: Unable to read that file. Paste the resume text directly for the most precise analysis.');
    }
  };

  const analyzeResume = async () => {
    if (!resumeText.trim()) {
      setMessage('Error: Add resume text first.');
      return;
    }

    setAnalyzing(true);
    setMessage('');

    try {
      const result = await api.analyzeResume({
        resumeText,
        ...(selectedJobId ? { targetJobId: selectedJobId } : {}),
      });
      setAnalysisResult(result);
      setMessage('Resume analyzed successfully.');
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const analysis = analysisResult?.analysis;

  return (
    <div className="glass-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-md)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ marginBottom: '6px' }}>{title}</h3>
          <p style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>
        </div>
        {analysis?.matchPercent != null ? (
          <div className={`match-score ${analysis.matchPercent >= 80 ? 'high' : ''}`}>
            {analysis.matchPercent}% match
          </div>
        ) : null}
      </div>

      <MessageBanner message={message} />

      <div className="form-group">
        <label className="form-label">Target Job</label>
        <select
          className="form-select"
          value={selectedJobId}
          onChange={(e) => setSelectedJobId(e.target.value)}
        >
          <option value="">Auto-select the best matching job</option>
          {selectableJobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}{job.company ? ` - ${job.company}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Resume Text</label>
        <textarea
          className="form-textarea"
          rows={9}
          placeholder="Paste your resume here for a precise skill-gap and ATS analysis..."
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center', flexWrap: 'wrap', marginBottom: analysis ? 'var(--space-lg)' : 0 }}>
        <input
          type="file"
          accept=".txt,.md,text/plain"
          onChange={(e) => handleResumeFile(e.target.files?.[0])}
        />
        <button type="button" className="btn btn-primary" onClick={analyzeResume} disabled={analyzing}>
          {analyzing ? 'Analyzing...' : 'Analyze Resume'}
        </button>
      </div>

      {analysis ? (
        <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
          <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '4px' }}>
              Compared against {analysisResult?.targetJob?.title}{analysisResult?.targetJob?.company ? ` at ${analysisResult.targetJob.company}` : ''}
            </div>
            <div style={{ fontSize: '0.98rem', fontWeight: 600 }}>{analysis.summary}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--space-sm)' }}>
            {[
              { label: 'Skills', value: analysis.scoreBreakdown?.skills ?? 0 },
              { label: 'Keywords', value: analysis.scoreBreakdown?.keywords ?? 0 },
              { label: 'Achievements', value: analysis.scoreBreakdown?.achievements ?? 0 },
              { label: 'Experience', value: analysis.scoreBreakdown?.experience ?? 0 },
            ].map((item) => (
              <div key={item.label} style={{ padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.label}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '6px' }}>{item.value}%</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
            <ResultList
              title="Matched skills"
              items={analysis.matchedSkills || []}
              emptyText="No clear skill overlap detected yet."
            />
            <ResultList
              title="Missing required skills"
              items={analysis.missingRequiredSkills || []}
              emptyText="No required-skill gaps detected."
              tone="warning"
            />
            <ResultList
              title="Missing optional skills"
              items={analysis.missingOptionalSkills || []}
              emptyText="No optional-skill gaps detected."
              tone="warning"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-lg)' }}>
            <div>
              <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                ATS Optimization Tips
              </div>
              <div style={{ color: 'var(--text-secondary)', display: 'grid', gap: '6px', fontSize: '0.9rem' }}>
                {(analysis.atsOptimizationTips || []).map((tip) => <div key={tip}>• {tip}</div>)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Improvement Priorities
              </div>
              <div style={{ color: 'var(--text-secondary)', display: 'grid', gap: '6px', fontSize: '0.9rem' }}>
                {(analysis.improvementPriorities || []).map((tip) => <div key={tip}>• {tip}</div>)}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-lg)' }}>
            <div>
              <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Resume Strengths
              </div>
              <div style={{ color: 'var(--text-secondary)', display: 'grid', gap: '6px', fontSize: '0.9rem' }}>
                {(analysis.strengths || []).length > 0 ? (analysis.strengths || []).map((tip) => <div key={tip}>• {tip}</div>) : <div>No strong proof signals detected yet.</div>}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Experience Signal
              </div>
              <div style={{ color: 'var(--text-secondary)', display: 'grid', gap: '6px', fontSize: '0.9rem' }}>
                <div>Detected experience: {analysis.experienceSignal?.inferredYears != null ? `${analysis.experienceSignal.inferredYears}+ years` : 'Not clearly detected'}</div>
                <div>Role baseline: {analysis.experienceSignal?.requiredMinimum ?? 0}+ years</div>
                <div>Status: {analysis.experienceSignal?.fit || 'unclear'}</div>
              </div>
            </div>
          </div>

          {(analysis.extractedAchievements || []).length > 0 ? (
            <div>
              <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Detected Achievement Bullets
              </div>
              <div style={{ color: 'var(--text-secondary)', display: 'grid', gap: '6px', fontSize: '0.9rem' }}>
                {(analysis.extractedAchievements || []).map((item) => <div key={item}>• {item}</div>)}
              </div>
            </div>
          ) : null}

          {(analysis.learningPath || []).length > 0 ? (
            <div>
              <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
                Learning Path
              </div>
              <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
                {(analysis.learningPath || []).map((item) => (
                  <div key={item.skill} style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
                    <div style={{ fontWeight: 700, marginBottom: '6px' }}>{item.focusArea}</div>
                    <div style={{ display: 'grid', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      {(item.roadmap || []).map((step) => <div key={step}>• {step}</div>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
