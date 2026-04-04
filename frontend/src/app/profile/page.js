'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import ResumeAnalyzerCard from '@/components/ResumeAnalyzerCard';

const COMMON_SKILLS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'Go', 'Rust', 'React', 'Angular', 'Vue.js',
  'Next.js', 'Node.js', 'Express.js', 'Django', 'Spring Boot', 'PostgreSQL', 'MongoDB', 'Redis',
  'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Terraform', 'CI/CD',
  'Machine Learning', 'Data Science', 'HTML', 'CSS', 'Git', 'Linux', 'REST API', 'GraphQL',
];

const COMMON_INTERESTS = ['Backend', 'Frontend', 'AI', 'Data', 'Cloud', 'DevOps', 'Security', 'Product', 'Leadership'];

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSkills, setSavingSkills] = useState(false);
  const [message, setMessage] = useState('');
  const [careerTrajectory, setCareerTrajectory] = useState(null);

  useEffect(() => {
    api.getProfile()
      .then(data => {
        setProfile(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    api.getCareerTrajectory()
      .then(setCareerTrajectory)
      .catch(() => {});
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const result = await api.updateProfile({
        firstName: profile.firstName,
        lastName: profile.lastName,
        headline: profile.headline,
        bio: profile.bio,
        location: profile.location,
        experienceYears: parseInt(profile.experienceYears) || 0,
        educationSchool: profile.educationSchool,
        currentCompany: profile.currentCompany,
        companyHistory: profile.companyHistory || [],
        careerGoal: profile.careerGoal,
        preferredRoles: profile.preferredRoles || [],
        interestTags: profile.interestTags || [],
      });
      updateUser(result);
      setMessage('Profile updated successfully! ✅');
      const trajectory = await api.getCareerTrajectory().catch(() => null);
      setCareerTrajectory(trajectory);
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleSkill = (skillName) => {
    const currentSkills = profile.skills || [];
    const exists = currentSkills.find(s => s.skillName === skillName);
    if (exists) {
      setProfile({ ...profile, skills: currentSkills.filter(s => s.skillName !== skillName) });
    } else {
      setProfile({ ...profile, skills: [...currentSkills, { skillName, proficiency: 'intermediate' }] });
    }
  };

  const saveSkills = async () => {
    setSavingSkills(true);
    try {
      await api.updateSkills(profile.skills);
      setMessage('Skills updated! ✅');
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSavingSkills(false);
    }
  };

  if (loading) return (
    <div className="container section">
      <div className="skeleton" style={{ height: '40px', width: '50%', marginBottom: '30px' }} />
      <div className="skeleton skeleton-card" />
    </div>
  );

  if (!profile) return null;

  return (
    <div className="container section" id="profile-page">
      <h1 style={{ marginBottom: 'var(--space-sm)' }}>Your <span className="gradient-text">Profile</span></h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-xl)' }}>
        Keep your profile up to date for better job recommendations.
      </p>

      {message && (
        <div style={{
          padding: '10px 14px',
          background: message.includes('Error') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
          border: `1px solid ${message.includes('Error') ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
          borderRadius: 'var(--radius-md)',
          color: message.includes('Error') ? 'var(--error)' : 'var(--success)',
          fontSize: '0.85rem',
          marginBottom: 'var(--space-lg)',
        }}>
          {message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 'var(--space-xl)', alignItems: 'start' }}>
        {/* Profile Form */}
        <form onSubmit={handleSave}>
          <div className="glass-card" style={{ marginBottom: 'var(--space-lg)' }}>
            <h3 style={{ marginBottom: 'var(--space-lg)' }}>Personal Information</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
              <div className="form-group">
                <label className="form-label">First Name</label>
                <input type="text" className="form-input" value={profile.firstName || ''}
                  onChange={e => setProfile({...profile, firstName: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Last Name</label>
                <input type="text" className="form-input" value={profile.lastName || ''}
                  onChange={e => setProfile({...profile, lastName: e.target.value})} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Headline</label>
              <input type="text" className="form-input" placeholder="e.g. Senior Full-Stack Developer"
                value={profile.headline || ''} onChange={e => setProfile({...profile, headline: e.target.value})} />
            </div>

            <div className="form-group">
              <label className="form-label">Bio</label>
              <textarea className="form-textarea" placeholder="Tell us about yourself..."
                value={profile.bio || ''} onChange={e => setProfile({...profile, bio: e.target.value})} rows={4} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
              <div className="form-group">
                <label className="form-label">Location</label>
                <input type="text" className="form-input" placeholder="San Francisco, CA"
                  value={profile.location || ''} onChange={e => setProfile({...profile, location: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Experience (years)</label>
                <input type="number" className="form-input" min="0" max="50"
                  value={profile.experienceYears || 0} onChange={e => setProfile({...profile, experienceYears: e.target.value})} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
              <div className="form-group">
                <label className="form-label">Education / College</label>
                <input type="text" className="form-input" placeholder="VIT-AP University"
                  value={profile.educationSchool || ''} onChange={e => setProfile({...profile, educationSchool: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Current Company</label>
                <input type="text" className="form-input" placeholder="Current employer"
                  value={profile.currentCompany || ''} onChange={e => setProfile({...profile, currentCompany: e.target.value})} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Career Goal</label>
              <input type="text" className="form-input" placeholder="Example: Become a backend engineer focused on scalable systems"
                value={profile.careerGoal || ''} onChange={e => setProfile({...profile, careerGoal: e.target.value})} />
            </div>

            <div className="form-group">
              <label className="form-label">Preferred Roles</label>
              <input type="text" className="form-input" placeholder="Backend Engineer, Platform Engineer"
                value={(profile.preferredRoles || []).join(', ')}
                onChange={e => setProfile({...profile, preferredRoles: e.target.value.split(',').map(v => v.trim()).filter(Boolean)})} />
            </div>

            <div className="form-group">
              <label className="form-label">Company History</label>
              <input type="text" className="form-input" placeholder="Company A, Company B"
                value={(profile.companyHistory || []).join(', ')}
                onChange={e => setProfile({...profile, companyHistory: e.target.value.split(',').map(v => v.trim()).filter(Boolean)})} />
            </div>

            <div className="form-group">
              <label className="form-label">Interests</label>
              <div className="flex flex-wrap gap-xs">
                {COMMON_INTERESTS.map((interest) => {
                  const selected = (profile.interestTags || []).includes(interest);
                  return (
                    <button
                      key={interest}
                      type="button"
                      className={`filter-chip ${selected ? 'active' : ''}`}
                      onClick={() => setProfile({
                        ...profile,
                        interestTags: selected
                          ? (profile.interestTags || []).filter((tag) => tag !== interest)
                          : [...(profile.interestTags || []), interest],
                      })}
                    >
                      {interest}
                    </button>
                  );
                })}
              </div>
            </div>

            {profile.verifiedRecruiter !== undefined && user?.role === 'recruiter' && (
              <div className="glass-card" style={{ background: 'var(--bg-glass)', marginTop: 'var(--space-md)' }}>
                <strong>Recruiter verification:</strong> {profile.verifiedRecruiter ? 'Verified company-domain recruiter' : 'Unverified recruiter profile'}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={saving} style={{ marginTop: 'var(--space-md)' }}>
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>

          <div className="glass-card" style={{ marginBottom: 'var(--space-lg)' }}>
            <ResumeAnalyzerCard
              title="AI Resume Analyzer"
              subtitle="Paste your resume and compare it against the most relevant role for a precise ATS and skill-gap analysis."
              initialResumeText={profile.resumeText || ''}
            />
          </div>
        </form>

        {/* Skills Panel */}
        <div style={{ position: 'sticky', top: 'calc(var(--header-height) + var(--space-lg))', display: 'grid', gap: 'var(--space-lg)' }}>
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
            <h3>Skills</h3>
            <span className="badge badge-primary">{(profile.skills || []).length} selected</span>
          </div>

          <div className="flex flex-wrap gap-xs" style={{ marginBottom: 'var(--space-lg)' }}>
            {COMMON_SKILLS.map(skill => (
              <button key={skill} type="button"
                className={`filter-chip ${(profile.skills || []).find(s => s.skillName === skill) ? 'active' : ''}`}
                onClick={() => toggleSkill(skill)}
                style={{ fontSize: '0.75rem' }}>
                {skill}
              </button>
            ))}
          </div>

          <button className="btn btn-primary" style={{ width: '100%' }} onClick={saveSkills} disabled={savingSkills}>
            {savingSkills ? 'Saving...' : 'Save Skills'}
          </button>
        </div>

        {careerTrajectory && (
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
              <h3>Career Trajectory</h3>
              <span className="badge badge-primary">{careerTrajectory.currentLevel}</span>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>
              {careerTrajectory.guidance}
            </p>
            <div className="flex flex-wrap gap-xs" style={{ marginBottom: 'var(--space-md)' }}>
              {(careerTrajectory.nextRoles || []).map((role) => (
                <span key={role} className="skill-tag">{role}</span>
              ))}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              Salary outlook: {careerTrajectory.salaryProgressionLpa?.estimatedLow}–{careerTrajectory.salaryProgressionLpa?.estimatedHigh} {careerTrajectory.salaryProgressionLpa?.currency}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
