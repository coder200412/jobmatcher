'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';

function ensureGoogleScript(onReady, onError) {
  if (typeof window === 'undefined') return () => {};

  if (window.google?.accounts?.id) {
    onReady();
    return () => {};
  }

  const existing = document.querySelector('script[data-google-identity="true"]');
  const handleLoad = () => onReady();
  const handleError = () => onError(new Error('Unable to load Google sign-in right now.'));

  if (existing) {
    existing.addEventListener('load', handleLoad, { once: true });
    existing.addEventListener('error', handleError, { once: true });

    return () => {
      existing.removeEventListener('load', handleLoad);
      existing.removeEventListener('error', handleError);
    };
  }

  const script = document.createElement('script');
  script.src = GOOGLE_IDENTITY_SCRIPT;
  script.async = true;
  script.defer = true;
  script.dataset.googleIdentity = 'true';
  script.addEventListener('load', handleLoad, { once: true });
  script.addEventListener('error', handleError, { once: true });
  document.head.appendChild(script);

  return () => {
    script.removeEventListener('load', handleLoad);
    script.removeEventListener('error', handleError);
  };
}

export default function GoogleAuthButton({
  mode = 'login',
  role = 'candidate',
  disabled = false,
  onSuccess,
  onError,
}) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  const containerRef = useRef(null);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  }, [onError, onSuccess]);

  useEffect(() => ensureGoogleScript(
    () => setScriptReady(true),
    (err) => {
      setScriptReady(false);
      onErrorRef.current?.(err);
    }
  ), []);

  const buttonText = useMemo(() => {
    if (mode === 'register') return 'signup_with';
    return 'signin_with';
  }, [mode]);

  useEffect(() => {
    if (!clientId || !scriptReady || !containerRef.current || !window.google?.accounts?.id) return;

    const container = containerRef.current;
    container.innerHTML = '';

    window.google.accounts.id.initialize({
      client_id: clientId,
      ux_mode: 'popup',
      auto_select: false,
      callback: async (response) => {
        try {
          await onSuccessRef.current?.(response.credential, role);
        } catch (err) {
          onErrorRef.current?.(err);
        }
      },
    });

    window.google.accounts.id.renderButton(container, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: buttonText,
      shape: 'pill',
      width: Math.max(container.offsetWidth || 320, 280),
      logo_alignment: 'left',
    });
  }, [buttonText, clientId, role, scriptReady]);

  if (!clientId) {
    return (
      <div className="auth-google-block">
        <button type="button" className="btn auth-google-fallback" disabled>
          <span aria-hidden="true">G</span>
          Continue with Google
        </button>
        <p className="auth-google-hint">Google sign-in will appear once a Google client ID is configured.</p>
      </div>
    );
  }

  return (
    <div className="auth-google-block">
      <div
        ref={containerRef}
        className={`auth-google-slot ${disabled ? 'is-disabled' : ''}`}
        aria-disabled={disabled ? 'true' : 'false'}
      />
    </div>
  );
}
