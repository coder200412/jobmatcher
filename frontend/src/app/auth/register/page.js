'use client';

import { useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

export default function RegisterPage() {
  const [step, setStep] = useState('register'); // 'register' | 'check-email'
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '', role: 'candidate' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const result = await api.register(form);
      if (result.requiresVerification) {
        setStep('check-email');
        setMessage(result.message);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setMessage('');
    try {
      const result = await api.resendCode(form.email);
      setMessage(result.message || 'A new confirmation email has been sent. Check your inbox.');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card" id="register-card">
        <Link href="/" className="navbar-logo" style={{ display: 'block', textAlign: 'center', marginBottom: 'var(--space-lg)', fontSize: '1.6rem' }}>
          ⚡ Joblume
        </Link>

        {step === 'register' ? (
          <>
            <h1 style={{ fontSize: '1.6rem' }}>Create Account</h1>
            <p className="auth-subtitle">Join the intelligent job matching platform</p>

            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--error)', fontSize: '0.85rem', marginBottom: 'var(--space-md)' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleRegister}>
              {/* Role Selector */}
              <div className="form-group">
                <label className="form-label">I am a...</label>
                <div className="tabs" style={{ marginTop: '4px' }}>
                  <button type="button" className={`tab ${form.role === 'candidate' ? 'active' : ''}`}
                    onClick={() => setForm({...form, role: 'candidate'})}>
                    👩‍💻 Job Seeker
                  </button>
                  <button type="button" className={`tab ${form.role === 'recruiter' ? 'active' : ''}`}
                    onClick={() => setForm({...form, role: 'recruiter'})}>
                    👔 Recruiter
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                <div className="form-group">
                  <label className="form-label">First Name</label>
                  <input type="text" className="form-input" placeholder="John" required id="register-first-name"
                    value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name</label>
                  <input type="text" className="form-input" placeholder="Doe" required id="register-last-name"
                    value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className="form-input" placeholder="john@example.com" required id="register-email"
                  value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input type="password" className="form-input" placeholder="Minimum 8 characters" required minLength={8} id="register-password"
                  value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
              </div>

              <button type="submit" className="btn btn-primary" id="register-submit"
                style={{ width: '100%', marginTop: 'var(--space-md)' }} disabled={loading}>
                {loading ? 'Sending confirmation email...' : 'Create Account'}
              </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 'var(--space-lg)' }}>
              Already have an account?{' '}
              <Link href="/auth/login" style={{ color: 'var(--text-accent)', fontWeight: 600 }}>Sign in</Link>
            </p>
          </>
        ) : (
          /* ── Email Confirmation Step ───────────────── */
          <>
            <div style={{ textAlign: 'center', marginBottom: 'var(--space-lg)' }}>
              <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>📧</div>
              <h1 style={{ fontSize: '1.6rem' }}>Check Your Email</h1>
              <p className="auth-subtitle" style={{ marginBottom: 0 }}>
                We sent a confirmation link to
              </p>
              <p style={{ color: 'var(--text-accent)', fontWeight: 600, fontSize: '1rem' }}>
                {form.email}
              </p>
            </div>

            {message && (
              <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--success)', fontSize: '0.85rem', marginBottom: 'var(--space-md)', textAlign: 'center' }}>
                {message}
              </div>
            )}

            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--error)', fontSize: '0.85rem', marginBottom: 'var(--space-md)' }}>
                {error}
              </div>
            )}

            <div className="glass-card" style={{ textAlign: 'center', padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>
                Click the <strong>Confirm Email</strong> button inside the email to activate your account.
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                After confirming, sign in with the same email and password you used while registering.
              </p>
            </div>

            <div style={{ textAlign: 'center', marginTop: 'var(--space-lg)' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>
                Didn&apos;t receive the confirmation email?
              </p>
              <button className="btn btn-ghost btn-sm" onClick={handleResend} id="resend-code-btn">
                Resend Email
              </button>
              <span style={{ margin: '0 8px', color: 'var(--text-muted)' }}>·</span>
              <button className="btn btn-ghost btn-sm" onClick={() => { setStep('register'); setError(''); setMessage(''); }}>
                Change Email
              </button>
              <div style={{ marginTop: 'var(--space-md)' }}>
                <Link href="/auth/login" className="btn btn-primary btn-sm">
                  Go to Login
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
