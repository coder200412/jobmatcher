'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPageClient() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const verified = searchParams.get('verified');
  const verificationMessage = searchParams.get('message');
  const [form, setForm] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const email = searchParams.get('email') || '';
    setForm((current) => (
      current.email === email ? current : { ...current, email }
    ));
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(form.email, form.password);
      router.push(result.user.role === 'recruiter' ? '/recruiter' : '/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card" id="login-card">
        <Link href="/" className="navbar-logo" style={{ display: 'block', textAlign: 'center', marginBottom: 'var(--space-lg)', fontSize: '1.6rem' }}>
          ⚡ JobMatch
        </Link>
        <h1 style={{ fontSize: '1.6rem' }}>Welcome Back</h1>
        <p className="auth-subtitle">Sign in to continue to your dashboard</p>

        {error && (
          <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--error)', fontSize: '0.85rem', marginBottom: 'var(--space-md)' }}>
            {error}
          </div>
        )}

        {!error && verified === '1' && (
          <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--success)', fontSize: '0.85rem', marginBottom: 'var(--space-md)' }}>
            {verificationMessage || 'Email confirmed. You can now sign in with the same credentials you used during registration.'}
          </div>
        )}

        {!error && verified === '0' && verificationMessage && (
          <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--error)', fontSize: '0.85rem', marginBottom: 'var(--space-md)' }}>
            {verificationMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input type="email" className="form-input" placeholder="Enter your email" required id="login-email"
              value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input type="password" className="form-input" placeholder="Enter your password" required id="login-password"
              value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
          </div>
          <button type="submit" className="btn btn-primary" id="login-submit"
            style={{ width: '100%', marginTop: 'var(--space-md)' }} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-divider">or</div>

        <div style={{ background: 'var(--bg-glass)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 'var(--space-sm)' }}>Demo Accounts (password: password123)</p>
          <div className="flex flex-wrap gap-xs">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ email: 'alice@demo.com', password: 'password123' })}>
              👩‍💻 Alice (Candidate)
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ email: 'recruiter1@demo.com', password: 'password123' })}>
              👔 Sarah (Recruiter)
            </button>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Don&apos;t have an account?{' '}
          <Link href="/auth/register" style={{ color: 'var(--text-accent)', fontWeight: 600 }}>Sign up</Link>
        </p>
      </div>
    </div>
  );
}
