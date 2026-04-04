const express = require('express');
const bcrypt = require('bcryptjs');
const { URLSearchParams } = require('url');
const { z } = require('zod');
const { pool, query } = require('../db');
const { generateTokens, verifyRefreshToken } = require('../auth');
const { publishEvent } = require('../kafka');
const { EventTypes, KafkaTopics, createEvent } = require('@jobmatch/shared');
const { generateVerificationToken, buildVerificationUrl, sendVerificationEmail } = require('../mailer');

const router = express.Router();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.enum(['candidate', 'recruiter']).default('candidate'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const googleAuthSchema = z.object({
  credential: z.string().min(1),
  role: z.enum(['candidate', 'recruiter']).optional(),
});

const verificationSchema = z.object({
  email: z.string().email(),
  token: z.string().regex(/^[a-f0-9]{64}$/i),
});

const resendCodeSchema = z.object({
  email: z.string().email(),
});

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function getVerificationMessage(email, delivery) {
  if (delivery.delivered) {
    return `Confirmation email sent to ${email}. Open it and click the confirm button to activate your account.`;
  }

  if (delivery.transport === 'console') {
    return 'Email delivery is not configured yet, so the confirmation link was logged in the user-service console for local development. Configure SMTP or Gmail credentials for real inbox delivery.';
  }

  const errorMessage = (delivery.error || '').toLowerCase();
  const looksLikeNetworkBlock =
    errorMessage.includes('timeout') ||
    errorMessage.includes('timed out') ||
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('ehostunreach') ||
    errorMessage.includes('enetunreach') ||
    errorMessage.includes('esocket');

  if (looksLikeNetworkBlock) {
    return 'Email sending is configured, but the server could not reach the mail provider. On Render this usually means outbound SMTP is blocked on the current instance type. Use an email API provider such as Resend, Brevo, or SendGrid, or switch to an instance type that allows SMTP traffic.';
  }

  return 'Email sending is configured, but the confirmation email could not be delivered from the server. Check the user-service deployment logs for the exact SMTP error and verify the Gmail or SMTP credentials.';
}

function buildLoginRedirect(email, verified, message, provider = 'local') {
  const frontendUrl =
    process.env.PUBLIC_FRONTEND_URL ||
    process.env.FRONTEND_URL ||
    'http://localhost:3006';
  const qs = new URLSearchParams({
    email,
    verified: verified ? '1' : '0',
  });

  if (message) {
    qs.set('message', message);
  }

  if (provider) {
    qs.set('provider', provider);
  }

  return `${frontendUrl}/auth/login?${qs.toString()}`;
}

function inferRecruiterVerification(email, role) {
  if (role !== 'recruiter') return false;
  const domain = String(email || '').split('@')[1]?.toLowerCase() || '';
  const freeEmailDomains = new Set([
    'gmail.com',
    'yahoo.com',
    'outlook.com',
    'hotmail.com',
    'icloud.com',
    'proton.me',
    'protonmail.com',
  ]);

  return Boolean(domain) && !freeEmailDomains.has(domain);
}

function splitDisplayName(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'Google',
    lastName: parts.slice(1).join(' ') || 'User',
  };
}

async function verifyGoogleCredential(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  if (!clientId) {
    const error = new Error('Google sign-in is not configured yet.');
    error.status = 503;
    throw error;
  }

  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
  );
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error_description || payload.error || 'Google sign-in could not be verified.');
    error.status = 401;
    throw error;
  }

  const validIssuer =
    payload.iss === 'accounts.google.com' ||
    payload.iss === 'https://accounts.google.com';

  if (!validIssuer || payload.aud !== clientId || payload.email_verified !== 'true' || !payload.email || !payload.sub) {
    const error = new Error('Google sign-in verification failed. Please try again with the same Google account.');
    error.status = 401;
    throw error;
  }

  return payload;
}

async function publishUserRegistered(user) {
  const event = createEvent(EventTypes.USER_REGISTERED, {
    userId: user.id,
    email: user.email,
    role: user.role,
    firstName: user.first_name,
    lastName: user.last_name,
  }, { source: 'user-service' });

  await publishEvent(KafkaTopics.USER_EVENTS, event);
}

async function completeVerification(client, email, token) {
  await client.query('BEGIN');

  const codeResult = await client.query(
    `SELECT * FROM user_service.verification_codes
     WHERE email = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1
     FOR UPDATE`,
    [email, token]
  );

  if (codeResult.rows.length === 0) {
    await client.query('ROLLBACK');
    const error = new Error('Invalid or expired confirmation link. Please request a new one.');
    error.status = 400;
    throw error;
  }

  const pending = codeResult.rows[0];

  const existing = await client.query('SELECT id FROM user_service.users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    await client.query('ROLLBACK');
    const error = new Error('Email already registered');
    error.status = 409;
    throw error;
  }

  const result = await client.query(
    `INSERT INTO user_service.users
      (email, password_hash, role, first_name, last_name, avatar_url, is_active, verified_recruiter, google_id, auth_provider)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $9)
     RETURNING id, email, role, first_name, last_name, avatar_url, auth_provider, created_at`,
    [
      pending.email,
      pending.password_hash,
      pending.role,
      pending.first_name,
      pending.last_name,
      pending.avatar_url || null,
      inferRecruiterVerification(pending.email, pending.role),
      pending.google_id || null,
      pending.auth_provider || 'local',
    ]
  );

  const user = result.rows[0];

  await client.query(
    'UPDATE user_service.verification_codes SET used = TRUE WHERE email = $1 AND used = FALSE',
    [email]
  );

  await client.query('COMMIT');

  return user;
}

// ── POST /api/auth/register ───────────────────────────
// Step 1: Register → sends confirmation link by email
router.post('/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const email = normalizeEmail(data.email);

    // Check if user already exists and is verified
    const existing = await query('SELECT id FROM user_service.users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered. Please sign in.' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 12);

    // Generate confirmation token
    const token = generateVerificationToken();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete any old codes for this email
    await query('DELETE FROM user_service.verification_codes WHERE email = $1', [email]);

    // Store verification code with registration data
    await query(
      `INSERT INTO user_service.verification_codes (email, code, first_name, last_name, password_hash, role, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [email, token, data.firstName.trim(), data.lastName.trim(), passwordHash, data.role, expiresAt]
    );

    // Send confirmation email
    const confirmationUrl = buildVerificationUrl(email, token);
    const delivery = await sendVerificationEmail(email, data.firstName.trim(), confirmationUrl);

    res.status(200).json({
      requiresVerification: true,
      message: getVerificationMessage(email, delivery),
      email,
      deliveryMethod: delivery.transport,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.issues });
    }
    next(err);
  }
});

// ── POST /api/auth/verify-email ───────────────────────
// Step 2: User confirms via clicked email link or API token → account is created
router.post('/verify-email', async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { email: rawEmail, token } = verificationSchema.parse(req.body);
    const email = normalizeEmail(rawEmail);
    const user = await completeVerification(client, email, token);
    const tokens = generateTokens(user);

    await publishUserRegistered(user);

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
      },
      ...tokens,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.issues });
    }
    return res.status(err.status || 500).json({ error: err.message || 'Unable to verify email' });
  } finally {
    client.release();
  }
});

router.get('/verify-email', async (req, res) => {
  const client = await pool.connect();

  try {
    const { email: rawEmail, token } = verificationSchema.parse(req.query);
    const email = normalizeEmail(rawEmail);
    const user = await completeVerification(client, email, token);
    await publishUserRegistered(user);
    const successMessage = user.auth_provider === 'google'
      ? 'Your email has been confirmed. Continue with Google on the login page to access your account.'
      : 'Your email has been confirmed. Sign in with the same credentials you used when registering.';
    return res.redirect(buildLoginRedirect(email, true, successMessage, user.auth_provider || 'local'));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const parsedEmail = typeof req.query.email === 'string' ? normalizeEmail(req.query.email) : '';
    const message = err instanceof z.ZodError
      ? 'The confirmation link is invalid.'
      : (err.message || 'Unable to confirm your email.');
    return res.redirect(buildLoginRedirect(parsedEmail, false, message));
  } finally {
    client.release();
  }
});

// ── POST /api/auth/resend-code ────────────────────────
router.post('/resend-code', async (req, res, next) => {
  try {
    const { email: rawEmail } = resendCodeSchema.parse(req.body);
    const email = normalizeEmail(rawEmail);

    // Check if there's a pending registration
    const pending = await query(
      `SELECT * FROM user_service.verification_codes
       WHERE email = $1 AND used = FALSE
       ORDER BY created_at DESC LIMIT 1`,
      [email]
    );

    if (pending.rows.length === 0) {
      return res.status(400).json({ error: 'No pending registration found. Please register again.' });
    }

    // Generate new confirmation token
    const token = generateVerificationToken();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Update with new confirmation token
    await query(
      'UPDATE user_service.verification_codes SET code = $1, expires_at = $2 WHERE id = $3',
      [token, expiresAt, pending.rows[0].id]
    );

    const confirmationUrl = buildVerificationUrl(email, token);
    const delivery = await sendVerificationEmail(email, pending.rows[0].first_name, confirmationUrl);

    res.json({
      message: getVerificationMessage(email, delivery),
      deliveryMethod: delivery.transport,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.issues });
    }
    next(err);
  }
});

router.post('/google/register', async (req, res, next) => {
  try {
    const { credential, role = 'candidate' } = googleAuthSchema.parse(req.body);
    const googleProfile = await verifyGoogleCredential(credential);
    const email = normalizeEmail(googleProfile.email);

    const existing = await query('SELECT id FROM user_service.users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered. Use Google sign-in on the login page.' });
    }

    const derivedName = splitDisplayName(googleProfile.name);
    const firstName = googleProfile.given_name || derivedName.firstName;
    const lastName = googleProfile.family_name || derivedName.lastName;
    const token = generateVerificationToken();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await query('DELETE FROM user_service.verification_codes WHERE email = $1', [email]);
    await query(
      `INSERT INTO user_service.verification_codes
        (email, code, first_name, last_name, password_hash, role, google_id, auth_provider, avatar_url, expires_at)
       VALUES ($1, $2, $3, $4, NULL, $5, $6, 'google', $7, $8)`,
      [email, token, firstName, lastName, role, googleProfile.sub, googleProfile.picture || null, expiresAt]
    );

    const confirmationUrl = buildVerificationUrl(email, token);
    const delivery = await sendVerificationEmail(email, firstName, confirmationUrl);

    return res.status(200).json({
      requiresVerification: true,
      provider: 'google',
      email,
      message: getVerificationMessage(email, delivery),
      deliveryMethod: delivery.transport,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.issues });
    }
    next(err);
  }
});

router.post('/google', async (req, res, next) => {
  try {
    const { credential, role = 'candidate' } = googleAuthSchema.parse(req.body);
    const googleProfile = await verifyGoogleCredential(credential);
    const email = normalizeEmail(googleProfile.email);

    const existingResult = await query(
      `SELECT id, email, password_hash, role, first_name, last_name, is_active, avatar_url, google_id
       FROM user_service.users
       WHERE email = $1`,
      [email]
    );

    let user = existingResult.rows[0];

    if (!user) {
      const pending = await query(
        `SELECT id
         FROM user_service.verification_codes
         WHERE email = $1 AND used = FALSE AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [email]
      );

      if (pending.rows.length > 0) {
        return res.status(403).json({ error: 'Please confirm your email before signing in with Google.' });
      }

      return res.status(404).json({ error: 'No Google account is registered with this email yet. Use Create Account with Google first.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    if (!user.google_id || !user.avatar_url) {
      const updated = await query(
        `UPDATE user_service.users
         SET google_id = COALESCE(google_id, $1),
             avatar_url = COALESCE(avatar_url, $2),
             auth_provider = CASE
               WHEN password_hash IS NULL OR password_hash = '' THEN 'google'
               ELSE auth_provider
             END,
             updated_at = NOW()
         WHERE id = $3
         RETURNING id, email, role, first_name, last_name, is_active, avatar_url`,
        [googleProfile.sub, googleProfile.picture || null, user.id]
      );
      user = updated.rows[0];
    }

    const tokens = generateTokens(user);

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
        avatarUrl: user.avatar_url,
      },
      ...tokens,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.issues });
    }
    next(err);
  }
});

// ── POST /api/auth/login ──────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const email = normalizeEmail(data.email);

    const result = await query(
      `SELECT id, email, password_hash, role, first_name, last_name, is_active
       FROM user_service.users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      const pending = await query(
        `SELECT id
         FROM user_service.verification_codes
         WHERE email = $1 AND used = FALSE AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [email]
      );

      if (pending.rows.length > 0) {
        return res.status(403).json({ error: 'Please confirm your email before signing in.' });
      }

      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    if (!user.password_hash) {
      return res.status(400).json({ error: 'This account uses Google sign-in. Continue with Google to access it.' });
    }

    const isValid = await bcrypt.compare(data.password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const tokens = generateTokens(user);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
      },
      ...tokens,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.issues });
    }
    next(err);
  }
});

// ── POST /api/auth/refresh ────────────────────────────
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const decoded = verifyRefreshToken(refreshToken);
    const result = await query(
      'SELECT id, email, role FROM user_service.users WHERE id = $1 AND is_active = true',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const tokens = generateTokens(result.rows[0]);
    res.json(tokens);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

module.exports = router;
