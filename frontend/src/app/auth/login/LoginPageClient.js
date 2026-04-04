'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import GoogleAuthButton from '@/components/GoogleAuthButton';
import { useAuth } from '@/lib/auth-context';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPageClient() {
  const { login, authenticateWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const verified = searchParams.get('verified');
  const verificationMessage = searchParams.get('message');
  const provider = searchParams.get('provider');
  const [form, setForm] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

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

  const handleGoogleLogin = async (credential) => {
    setError('');
    setGoogleLoading(true);

    try {
      const result = await authenticateWithGoogle(credential);
      router.push(result.user.role === 'recruiter' ? '/recruiter' : '/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card" id="login-card">
        <Link href="/" className="navbar-logo" style={{ display: 'block', textAlign: 'center', marginBottom: 'var(--space-lg)', fontSize: '1.6rem' }}>
          ⚡ Workvanta
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
            {verificationMessage || (provider === 'google'
              ? 'Email confirmed. Continue with Google to access your account.'
              : 'Email confirmed. You can now sign in with the same credentials you used during registration.')}
          </div>
        )}

        {!error && verified === '0' && verificationMessage && (
          <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--error)', fontSize: '0.85rem', marginBottom: 'var(--space-md)' }}>
            {verificationMessage}
          </div>
        )}

        <GoogleAuthButton
          mode="login"
          disabled={loading || googleLoading}
          onSuccess={handleGoogleLogin}
          onError={(err) => setError(err.message)}
        />

        <div className="auth-divider">or continue with email</div>

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

        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Don&apos;t have an account?{' '}
          <Link href="/auth/register" style={{ color: 'var(--text-accent)', fontWeight: 600 }}>Sign up</Link>
        </p>
      </div>
    </div>
  );
}
