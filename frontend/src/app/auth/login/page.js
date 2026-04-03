import { Suspense } from 'react';
import LoginPageClient from './LoginPageClient';

function LoginFallback() {
  return (
    <div className="auth-page">
      <div className="auth-card" id="login-card">
        <div className="skeleton" style={{ height: '2rem', marginBottom: 'var(--space-lg)' }} />
        <div className="skeleton" style={{ height: '1rem', marginBottom: 'var(--space-md)' }} />
        <div className="skeleton" style={{ height: '3rem', marginBottom: 'var(--space-md)' }} />
        <div className="skeleton" style={{ height: '3rem', marginBottom: 'var(--space-md)' }} />
        <div className="skeleton" style={{ height: '3rem' }} />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginPageClient />
    </Suspense>
  );
}
