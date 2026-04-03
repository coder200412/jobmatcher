const nodemailer = require('nodemailer');
const dns = require('dns').promises;
const net = require('net');

let transporterConfigPromise = null;

const MAIL_TRANSPORT_TIMEOUTS = {
  connectionTimeout: 15000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
};

async function resolveTransportHost(hostname) {
  if (!hostname || net.isIP(hostname)) {
    return { host: hostname, servername: null };
  }

  try {
    const { address } = await dns.lookup(hostname, { family: 4 });
    return { host: address, servername: hostname };
  } catch (error) {
    console.warn(`⚠️  DNS lookup failed for ${hostname}, falling back to the hostname directly: ${error.message}`);
    return { host: hostname, servername: null };
  }
}

function buildTlsOptions(servername) {
  return servername ? { tls: { servername } } : {};
}

async function createSmtpTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass || pass === 'SET_YOUR_APP_PASSWORD_HERE') {
    return null;
  }

  const resolved = await resolveTransportHost(host);

  return {
    type: 'smtp',
    transporter: nodemailer.createTransport({
      host: resolved.host,
      port,
      secure: port === 465,
      auth: { user, pass },
      ...MAIL_TRANSPORT_TIMEOUTS,
      ...buildTlsOptions(resolved.servername),
    }),
    from: process.env.SMTP_FROM || user,
  };
}

async function createGmailAppPasswordTransport() {
  const user = process.env.GMAIL_USER;
  // Google often displays app passwords grouped with spaces, so normalize that input.
  const gmailAppPassword = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const pass = gmailAppPassword || process.env.SMTP_PASS;

  if (!user || !pass || pass === 'SET_YOUR_APP_PASSWORD_HERE') {
    return null;
  }

  const resolved = await resolveTransportHost('smtp.gmail.com');

  return {
    type: 'gmail-app-password',
    transporter: nodemailer.createTransport({
      host: resolved.host,
      port: 465,
      secure: true,
      auth: { user, pass },
      ...MAIL_TRANSPORT_TIMEOUTS,
      ...buildTlsOptions(resolved.servername || 'smtp.gmail.com'),
    }),
    from: process.env.SMTP_FROM || user,
  };
}

async function createGmailOAuthTransport() {
  const user = process.env.GMAIL_USER;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!user || !clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const resolved = await resolveTransportHost('smtp.gmail.com');

  return {
    type: 'gmail-oauth2',
    transporter: nodemailer.createTransport({
      host: resolved.host,
      port: 465,
      secure: true,
      auth: {
        type: 'OAuth2',
        user,
        clientId,
        clientSecret,
        refreshToken,
      },
      ...MAIL_TRANSPORT_TIMEOUTS,
      ...buildTlsOptions(resolved.servername || 'smtp.gmail.com'),
    }),
    from: process.env.SMTP_FROM || user,
  };
}

async function getTransporterConfig() {
  if (!transporterConfigPromise) {
    transporterConfigPromise = (async () => {
      const config =
        await createSmtpTransport() ||
        await createGmailAppPasswordTransport() ||
        await createGmailOAuthTransport();

      if (!config) {
        console.warn('⚠️  Email transport is not configured — confirmation links will be logged to the console');
      }

      return config;
    })().catch((error) => {
      transporterConfigPromise = null;
      throw error;
    });
  }

  return transporterConfigPromise;
}

function generateVerificationToken() {
  return require('crypto').randomBytes(32).toString('hex');
}

function buildVerificationUrl(email, token) {
  const apiUrl =
    process.env.PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:3000/api';
  const normalizedApiUrl = apiUrl.replace(/\/+$/, '').endsWith('/api')
    ? apiUrl.replace(/\/+$/, '')
    : `${apiUrl.replace(/\/+$/, '')}/api`;
  const qs = new URLSearchParams({
    email,
    token,
  });
  return `${normalizedApiUrl}/auth/verify-email?${qs.toString()}`;
}

function renderVerificationEmail(firstName, confirmationUrl) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a0a0f; color: #f0f0f5; margin: 0; padding: 0; }
      .container { max-width: 520px; margin: 0 auto; padding: 40px 24px; }
      .card { background: linear-gradient(145deg, rgba(124,58,237,0.08), rgba(59,130,246,0.06)); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 40px 32px; text-align: center; }
      .logo { font-size: 24px; font-weight: 800; background: linear-gradient(135deg, #7c3aed, #3b82f6, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 24px; }
      h2 { margin: 0 0 8px 0; font-size: 22px; color: #f0f0f5; }
      .subtitle { color: #9ca3af; font-size: 14px; margin-bottom: 32px; }
      .button-wrap { margin: 28px 0; }
      .button { display: inline-block; padding: 14px 28px; border-radius: 999px; background: linear-gradient(135deg, #7c3aed, #3b82f6); color: white !important; text-decoration: none; font-weight: 700; font-size: 15px; }
      .link { color: #93c5fd; word-break: break-all; font-size: 12px; line-height: 1.5; }
      .expire { color: #6b7280; font-size: 12px; margin-top: 24px; }
      .footer { text-align: center; padding: 24px; color: #6b7280; font-size: 12px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="card">
        <div class="logo">JobMatch</div>
        <h2>Confirm Your New Account</h2>
        <p class="subtitle">Hi ${firstName || 'there'}, welcome to JobMatch! Click the button below to confirm your email and activate your account.</p>
        <div class="button-wrap">
          <a class="button" href="${confirmationUrl}">Confirm Email</a>
        </div>
        <p class="expire">This confirmation link expires in 10 minutes. If you didn't create an account, you can ignore this email.</p>
        <p class="link">${confirmationUrl}</p>
      </div>
      <div class="footer">
        JobMatch — Intelligent Job Matching Platform
      </div>
    </div>
  </body>
  </html>`;
}

function logFallbackLink(toEmail, firstName, confirmationUrl, errorMessage) {
  console.log('━'.repeat(50));
  console.log('CONFIRMATION EMAIL (console fallback)');
  console.log(`To: ${toEmail}`);
  console.log(`Name: ${firstName}`);
  console.log(`Confirmation URL: ${confirmationUrl}`);
  if (errorMessage) {
    console.log(`Reason: ${errorMessage}`);
  }
  console.log('━'.repeat(50));
}

async function sendVerificationEmail(toEmail, firstName, confirmationUrl) {
  const config = await getTransporterConfig();
  const htmlContent = renderVerificationEmail(firstName, confirmationUrl);
  const textContent = `Hi ${firstName || 'there'}, confirm your JobMatch account by opening this link: ${confirmationUrl}. This link expires in 10 minutes.`;

  if (!config) {
    logFallbackLink(toEmail, firstName, confirmationUrl, 'Email transport not configured');
    return {
      delivered: false,
      transport: 'console',
      error: 'Email transport not configured',
    };
  }

  try {
    await config.transporter.sendMail({
      from: config.from,
      to: toEmail,
      subject: 'Confirm your new JobMatch account',
      html: htmlContent,
      text: textContent,
    });

    console.log(`📧 Confirmation email sent to ${toEmail} via ${config.type}`);
    return {
      delivered: true,
      transport: config.type,
      error: null,
    };
  } catch (error) {
    console.error(`❌ Failed to send confirmation email to ${toEmail}: ${error.message}`);
    logFallbackLink(toEmail, firstName, confirmationUrl, error.message);
    return {
      delivered: false,
      transport: config.type,
      error: error.message,
    };
  }
}

module.exports = { generateVerificationToken, buildVerificationUrl, sendVerificationEmail };
