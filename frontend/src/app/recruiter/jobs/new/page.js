'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';

const COMMON_SKILLS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'Go', 'Rust', 'React', 'Angular', 'Vue.js',
  'Next.js', 'Node.js', 'Express.js', 'Django', 'Spring Boot', 'PostgreSQL', 'MongoDB', 'Redis',
  'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Terraform', 'CI/CD',
  'Machine Learning', 'Data Science', 'HTML', 'CSS', 'Git', 'Linux', 'REST API', 'GraphQL', 'Microservices',
];

export default function PostJobPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: '', company: '', description: '', location: '', workType: 'onsite',
    salaryMin: '', salaryMax: '', currency: 'USD', experienceMin: '0', experienceMax: '',
    positionsCount: '1', status: 'active',
  });
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleSkill = (skill) => {
    setSelectedSkills(prev =>
      prev.find(s => s.skillName === skill)
        ? prev.filter(s => s.skillName !== skill)
        : [...prev, { skillName: skill, isRequired: true }]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = {
        ...form,
        salaryMin: form.salaryMin ? parseInt(form.salaryMin) : undefined,
        salaryMax: form.salaryMax ? parseInt(form.salaryMax) : undefined,
        experienceMin: parseInt(form.experienceMin),
        experienceMax: form.experienceMax ? parseInt(form.experienceMax) : undefined,
        positionsCount: Math.max(1, parseInt(form.positionsCount || '1')),
        skills: selectedSkills,
      };
      await api.createJob(data);
      router.push('/recruiter');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container section" id="post-job-page">
      <Link href="/recruiter" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--space-lg)', display: 'inline-block' }}>
        ← Back to Dashboard
      </Link>

      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: 'var(--space-sm)' }}>Post a New <span className="gradient-text">Job</span></h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-xl)' }}>
          Create a job listing to find the perfect candidates.
        </p>

        {error && (
          <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--error)', fontSize: '0.85rem', marginBottom: 'var(--space-md)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="glass-card" style={{ marginBottom: 'var(--space-lg)' }}>
            <h3 style={{ marginBottom: 'var(--space-lg)' }}>Basic Information</h3>
            
            <div className="form-group">
              <label className="form-label">Job Title *</label>
              <input type="text" className="form-input" placeholder="e.g. Senior React Developer" required
                value={form.title} onChange={e => setForm({...form, title: e.target.value})} id="job-title" />
            </div>

            <div className="form-group">
              <label className="form-label">Company *</label>
              <input type="text" className="form-input" placeholder="e.g. Google" required
                value={form.company} onChange={e => setForm({...form, company: e.target.value})} id="job-company" />
            </div>

            <div className="form-group">
              <label className="form-label">Description *</label>
              <textarea className="form-textarea" placeholder="Describe the role, responsibilities, and qualifications..." required
                value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={8} id="job-description"
                minLength={20} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
              <div className="form-group">
                <label className="form-label">Location</label>
                <input type="text" className="form-input" placeholder="e.g. San Francisco, CA"
                  value={form.location} onChange={e => setForm({...form, location: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Work Type</label>
                <select className="form-select" value={form.workType} onChange={e => setForm({...form, workType: e.target.value})}>
                  <option value="onsite">🏢 On-site</option>
                  <option value="hybrid">🔄 Hybrid</option>
                  <option value="remote">🏠 Remote</option>
                </select>
              </div>
            </div>
          </div>

          <div className="glass-card" style={{ marginBottom: 'var(--space-lg)' }}>
            <h3 style={{ marginBottom: 'var(--space-lg)' }}>Compensation & Experience</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-md)' }}>
              <div className="form-group">
                <label className="form-label">Min Salary ($)</label>
                <input type="number" className="form-input" placeholder="100000"
                  value={form.salaryMin} onChange={e => setForm({...form, salaryMin: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Max Salary ($)</label>
                <input type="number" className="form-input" placeholder="200000"
                  value={form.salaryMax} onChange={e => setForm({...form, salaryMax: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Currency</label>
                <select className="form-select" value={form.currency} onChange={e => setForm({...form, currency: e.target.value})}>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="INR">INR</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
              <div className="form-group">
                <label className="form-label">Min Experience (years)</label>
                <input type="number" className="form-input" placeholder="0" min="0"
                  value={form.experienceMin} onChange={e => setForm({...form, experienceMin: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Max Experience (years)</label>
                <input type="number" className="form-input" placeholder="10"
                  value={form.experienceMax} onChange={e => setForm({...form, experienceMax: e.target.value})} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Number of Positions</label>
              <input
                type="number"
                className="form-input"
                min="1"
                placeholder="1"
                value={form.positionsCount}
                onChange={e => setForm({ ...form, positionsCount: e.target.value })}
              />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '6px' }}>
                The job will automatically close and disappear from job seeker listings once this many applications are received.
              </p>
            </div>
          </div>

          <div className="glass-card" style={{ marginBottom: 'var(--space-lg)' }}>
            <h3 style={{ marginBottom: 'var(--space-md)' }}>Required Skills</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 'var(--space-md)' }}>
              Select the skills required for this position ({selectedSkills.length} selected)
            </p>
            <div className="flex flex-wrap gap-sm">
              {COMMON_SKILLS.map(skill => (
                <button key={skill} type="button"
                  className={`filter-chip ${selectedSkills.find(s => s.skillName === skill) ? 'active' : ''}`}
                  onClick={() => toggleSkill(skill)}>
                  {skill}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-md" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => router.push('/recruiter')}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-lg" disabled={loading} id="submit-job">
              {loading ? 'Publishing...' : 'Publish Job Listing 🚀'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
