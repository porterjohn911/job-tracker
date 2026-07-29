// Shared SMTP helpers used by every server-side email path:
//   send-invoice.js          (app "Email it now")
//   api-invoice-send-now.js  (agent direct send)
//   api-smtp-test.js         (owner/agent connection test)
//   _lib/weeklyReport.js      (scheduled report)
//
// Centralizing this fixes two long-standing gotchas:
//   1. `secure` was hardcoded true, so setting SMTP_PORT=587 (STARTTLS) silently
//      broke auth. We now derive secure from the port (465 = implicit TLS).
//   2. App Passwords pasted with the spaces Google shows them with ("abcd efgh
//      ijkl mnop") failed auth. We strip whitespace from the password.

const nodemailer = require('nodemailer');

// Read + normalize SMTP settings from env. Returns { host, port, secure, user,
// pass } or null when creds are missing.
function smtpConfig() {
  const user = (process.env.SMTP_USER || '').trim();
  // Gmail App Passwords are 16 chars with no spaces; Google *displays* them
  // grouped ("abcd efgh ijkl mnop"), and pasting that verbatim is the #1 cause
  // of 535 auth failures. Strip all whitespace so either form works.
  const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
  if (!user || !pass) return null;
  const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = Number(process.env.SMTP_PORT || 465);
  // Port 465 = implicit TLS (secure). 587/25 = STARTTLS (secure:false, upgraded
  // by nodemailer). Deriving this from the port instead of hardcoding true is
  // what lets SMTP_PORT=587 work at all.
  const secure = port === 465;
  return { host, port, secure, user, pass };
}

// Build a nodemailer transport from env, or return null if creds are missing.
function makeTransport() {
  const cfg = smtpConfig();
  if (!cfg) return null;
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

// Turn a raw nodemailer/SMTP error into a message that tells the user what to
// actually fix, while preserving the underlying detail.
function describeSmtpError(e) {
  const code = e && (e.code || '');
  const respCode = e && (e.responseCode || 0);
  const raw = (e && (e.response || e.message)) || 'unknown error';

  if (code === 'EAUTH' || respCode === 535 || respCode === 534) {
    return 'SMTP authentication rejected (' + (respCode || code) + '). For Gmail / '
      + 'Google Workspace: SMTP_PASS must be a 16-character App Password (NOT the '
      + 'account login password), and 2-Step Verification must be ON for the '
      + 'SMTP_USER account. Workspace admins must also leave "SMTP AUTH" enabled. '
      + 'Server said: ' + raw;
  }
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'EDNS') {
    return 'Could not reach the SMTP server (' + code + '). Check SMTP_HOST / '
      + 'SMTP_PORT — defaults are smtp.gmail.com and 465. Use port 465 (implicit '
      + 'TLS) or 587 (STARTTLS). Detail: ' + raw;
  }
  if (code === 'EENVELOPE') {
    return 'The server rejected the sender or recipient address. Detail: ' + raw;
  }
  return 'Send failed (' + (code || respCode || 'error') + '): ' + raw;
}

module.exports = { smtpConfig, makeTransport, describeSmtpError };
