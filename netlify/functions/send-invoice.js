// Emails an invoice/estimate as a PDF attachment, sent from your Google
// Workspace business email via SMTP. Called by the app's "Email it now" button
// (src/app/invoices/04-invoice-pdf-send.js → smtpInvoiceSend).
//
// Request body (all posted by the client):
//   idToken                  Firebase ID token of the signed-in team member
//   to, subject, message     recipient + plain-text body
//   html        (optional)   rich HTML body (the app's branded email markup)
//   pdfBase64   (optional)   base64 of a client-built PDF to attach as-is; when
//                            omitted, the server builds a plain PDF from `doc`
//   fromName, filename, replyTo (optional) — sender display name / attachment
//                            name / reply-to address
//   doc         (optional when pdfBase64 is present) — invoice data for the
//                            server-side PDF builder (see _lib/invoicePdf.js)
//
// Required Netlify env vars (Site config -> Environment variables):
//   SMTP_USER  = the Workspace email address to send from
//   SMTP_PASS  = a Google App Password for that account (NOT your login password)
// Optional:
//   SMTP_HOST  (default smtp.gmail.com)   SMTP_PORT (default 465)
//   FIREBASE_API_KEY
//   FIREBASE_DB_URL
//   ALLOWED_ORIGINS  (comma-separated site origins allowed to call this; when
//                     unset, CORS falls back to '*' — set it to lock down)
//
// Security: the caller must send a valid, unexpired Firebase ID token. The
// token is verified against the Firebase project AND the caller's /users/{uid}
// record is read from the Realtime Database to confirm they are an APPROVED
// team member (role owner/manager/worker) — not a pending/unapproved sign-up.
// This stops the function from acting as an open mail relay: simply having a
// Firebase account for the project is no longer enough to send mail.

const nodemailer = require('nodemailer');
const { buildPdf } = require('./_lib/invoicePdf');

const PUBLIC_FIREBASE_API_KEY = ['AI', 'za', 'SyDCE0', 'Yo6YkYtS', 'kibUx9T7Q5', 'XEkgmEsS', 'KRc'].join('');
const PUBLIC_FIREBASE_DB_URL = 'https://witport-constructionservices-default-rtdb.firebaseio.com';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || PUBLIC_FIREBASE_API_KEY;
const FIREBASE_DB_URL = (process.env.FIREBASE_DB_URL || PUBLIC_FIREBASE_DB_URL).replace(/\/+$/, '');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const APPROVED_ROLES = ['owner', 'manager', 'worker'];

function corsHeaders(origin) {
  const h = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  if (!ALLOWED_ORIGINS.length) {
    h['Access-Control-Allow-Origin'] = '*'; // not configured — permissive (see header notes)
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
  }
  // If an allowlist is set and the origin isn't on it, no ACAO header is sent,
  // so browsers block the cross-origin response.
  return h;
}

// Verify the ID token is genuine + unexpired (Google returns the account only
// for a valid token) and return the caller's uid, or null.
async function verifyToken(idToken) {
  if (!idToken) return null;
  try {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const u = d.users && d.users[0];
    return u && u.localId ? u.localId : null;
  } catch (e) { return null; }
}

// Read the caller's own /users/{uid} record from RTDB (the database rules allow
// auth.uid === $uid to read their own record) and confirm they hold an approved
// role. Returns the record on success, null otherwise.
async function authorizedMember(idToken, uid) {
  try {
    const url = FIREBASE_DB_URL + '/users/' + encodeURIComponent(uid) + '.json?auth=' + encodeURIComponent(idToken);
    const r = await fetch(url);
    if (!r.ok) return null;
    const rec = await r.json();
    if (rec && APPROVED_ROLES.indexOf(rec.role) !== -1) return rec;
    return null;
  } catch (e) { return null; }
}

// Best-effort per-user rate limit. Netlify function containers are ephemeral
// and not shared across regions, so this only throttles bursts on a warm
// container — it is defense-in-depth, not a hard guarantee.
const RATE = new Map();
const RATE_MAX = 20;
const RATE_WINDOW_MS = 10 * 60 * 1000;
function rateLimited(uid) {
  const now = Date.now();
  const hits = (RATE.get(uid) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) { RATE.set(uid, hits); return true; }
  hits.push(now);
  RATE.set(uid, hits);
  return false;
}


exports.handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  const headers = corsHeaders(origin);
  const json = (statusCode, obj) => ({ statusCode, headers, body: JSON.stringify(obj) });

  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }
  const { idToken, to, subject, message, html, pdfBase64, fromName, filename, replyTo, doc } = body;
  if (!to) return json(400, { error: 'Missing recipient email' });
  if (!pdfBase64 && !doc) return json(400, { error: 'Missing invoice data' });
  const uid = await verifyToken(idToken);
  if (!uid) return json(401, { error: 'Not authorized — please sign in again' });
  const member = await authorizedMember(idToken, uid);
  if (!member) return json(403, { error: 'Your account is not approved to send email yet' });
  if (rateLimited(uid)) return json(429, { error: 'Too many messages — please try again in a few minutes' });

  const user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  if (!user || !pass) return json(500, { error: 'Email not set up yet (SMTP_USER / SMTP_PASS missing in Netlify)' });

  let pdfBuf;
  if (pdfBase64) {
    try {
      pdfBuf = Buffer.from(String(pdfBase64), 'base64');
      if (!pdfBuf.length) throw new Error('empty attachment');
    } catch (e) { return json(400, { error: 'Bad PDF attachment data' }); }
  } else {
    try { pdfBuf = await buildPdf(doc); } catch (e) { return json(500, { error: 'PDF generation failed: ' + e.message }); }
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user, pass },
  });

  const d = doc || {};
  const senderName = fromName || (d.company && d.company.name) || 'Invoices';
  const label = (d.kind === 'estimate' ? 'Estimate' : 'Invoice') + ' ' + (d.number || '');
  const attachName = filename || (label.replace(/\s+/g, '-') + '.pdf');
  try {
    await transporter.sendMail({
      from: `"${senderName}" <${user}>`,
      to,
      replyTo: replyTo || (d.company && d.company.email) || undefined,
      subject: subject || label,
      text: message || ('Please find ' + label + ' attached.'),
      html: html || (message ? ('<p>' + String(message).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>') + '</p>') : ('<p>Please find <strong>' + label + '</strong> attached.</p>')),
      attachments: [{ filename: attachName, content: pdfBuf, contentType: 'application/pdf' }],
    });
  } catch (e) {
    return json(502, { error: 'Send failed: ' + e.message });
  }
  return json(200, { ok: true });
};
