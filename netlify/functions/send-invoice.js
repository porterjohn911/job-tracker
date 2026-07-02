// Emails an invoice/estimate as a PDF attachment, sent from your Google
// Workspace business email via SMTP. Called by the app's "Email it now" button.
//
// Required Netlify env vars (Site config -> Environment variables):
//   SMTP_USER  = your Workspace address (e.g. office@witportconstruction.com)
//   SMTP_PASS  = a Google App Password for that account (NOT your login password)
// Optional:
//   SMTP_HOST  (default smtp.gmail.com)   SMTP_PORT (default 465)
//   FIREBASE_API_KEY (defaults to the project's public web API key)
//   FIREBASE_DB_URL  (defaults to the project's Realtime Database URL)
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
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDCE0Yo6YkYtSkibUx9T7Q5XEkgmEsSKRc';
const FIREBASE_DB_URL = (process.env.FIREBASE_DB_URL || 'https://witport-constructionservices-default-rtdb.firebaseio.com').replace(/\/+$/, '');
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

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function buildPdf(doc) {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([612, 792]); // US Letter
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const M = 50, RIGHT = 612 - M;
  const dark = rgb(0.04, 0.12, 0.09), gray = rgb(0.35, 0.40, 0.38), line = rgb(0.85, 0.87, 0.86);
  const co = doc.company || {}, cust = doc.customer || {}, proj = doc.project || {};
  const isEst = doc.kind === 'estimate';
  let y = 792 - 50;

  const draw = (t, x, yy, sz, f, c) => page.drawText(String(t == null ? '' : t), { x, y: yy, size: sz, font: f || font, color: c || dark });
  const right = (t, xr, yy, sz, f, c) => { const s = String(t == null ? '' : t); const w = (f || font).widthOfTextAtSize(s, sz); page.drawText(s, { x: xr - w, y: yy, size: sz, font: f || font, color: c || dark }); };
  const wrap = (text, sz) => { const words = String(text).split(/\s+/); let ln = ''; const maxW = RIGHT - M; words.forEach(w => { const t = ln ? ln + ' ' + w : w; if (font.widthOfTextAtSize(t, sz) > maxW) { draw(ln, M, y, sz, font, gray); y -= sz + 3; ln = w; } else ln = t; }); if (ln) { draw(ln, M, y, sz, font, gray); y -= sz + 3; } };

  // Header
  draw(co.name || 'Company', M, y, 18, bold);
  right(isEst ? 'ESTIMATE' : 'INVOICE', RIGHT, y, 22, bold);
  let ly = y - 16;
  [co.address, co.phone, co.email, co.website, co.license ? ('Lic. ' + co.license) : ''].filter(Boolean).forEach(l => { draw(l, M, ly, 9, font, gray); ly -= 12; });
  right('#' + (doc.number || ''), RIGHT, y - 16, 11, font, gray);
  right('Date: ' + (doc.date || ''), RIGHT, y - 30, 9, font, gray);
  if (doc.dueDate) right((isEst ? 'Valid until: ' : 'Due: ') + doc.dueDate, RIGHT, y - 42, 9, font, gray);
  y = Math.min(ly, y - 50) - 8;
  page.drawLine({ start: { x: M, y }, end: { x: RIGHT, y }, thickness: 1.5, color: dark }); y -= 20;

  // Bill To / Project
  draw(isEst ? 'PREPARED FOR' : 'BILL TO', M, y, 8, bold, gray);
  draw('PROJECT', 330, y, 8, bold, gray); y -= 14;
  let by = y; [cust.name, cust.address, cust.phone, cust.email].filter(Boolean).forEach(l => { draw(l, M, by, 10, font); by -= 13; });
  let py = y; [proj.name, proj.address].filter(Boolean).forEach(l => { draw(l, 330, py, 10, font); py -= 13; });
  y = Math.min(by, py) - 16;

  // Items table
  draw('DESCRIPTION', M, y, 8, bold, gray); right('QTY', 380, y, 8, bold, gray); right('RATE', 470, y, 8, bold, gray); right('AMOUNT', RIGHT, y, 8, bold, gray);
  y -= 6; page.drawLine({ start: { x: M, y }, end: { x: RIGHT, y }, thickness: 0.5, color: line }); y -= 16;
  let sub = 0;
  (doc.items || []).forEach(it => {
    const amt = Number(it.qty || 0) * Number(it.rate || 0); sub += amt;
    draw(it.desc || '', M, y, 10, font); right(it.qty == null ? '' : it.qty, 380, y, 10); right(money(it.rate), 470, y, 10); right(money(amt), RIGHT, y, 10);
    y -= 16;
    if (y < 130) { page = pdf.addPage([612, 792]); y = 792 - 60; }
  });
  page.drawLine({ start: { x: M, y: y + 5 }, end: { x: RIGHT, y: y + 5 }, thickness: 0.5, color: line }); y -= 12;

  // Totals
  const tax = sub * (Number(doc.taxRate || 0) / 100), total = sub + tax, paid = Number(doc.paid || 0), bal = total - paid;
  right('Subtotal', RIGHT - 95, y, 10, font, gray); right(money(sub), RIGHT, y, 10); y -= 15;
  right('Tax (' + Number(doc.taxRate || 0) + '%)', RIGHT - 95, y, 10, font, gray); right(money(tax), RIGHT, y, 10); y -= 17;
  right('Total', RIGHT - 95, y, 12, bold); right(money(total), RIGHT, y, 12, bold); y -= 18;
  if (isEst) {
    right('Estimated Total', RIGHT - 120, y, 11, bold); right(money(total), RIGHT, y, 11, bold); y -= 16;
  } else {
    if (paid > 0) { right('Paid', RIGHT - 95, y, 10, font, gray); right('-' + money(paid), RIGHT, y, 10); y -= 15; }
    right('Balance Due', RIGHT - 120, y, 12, bold); right(money(Math.max(0, bal)), RIGHT, y, 12, bold); y -= 16;
  }
  y -= 12;

  if (doc.notes) { draw('NOTES', M, y, 8, bold, gray); y -= 13; wrap(doc.notes, 9); y -= 6; }
  if (doc.terms) { draw('TERMS', M, y, 8, bold, gray); y -= 13; wrap(doc.terms, 9); }

  return Buffer.from(await pdf.save());
}

exports.handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  const headers = corsHeaders(origin);
  const json = (statusCode, obj) => ({ statusCode, headers, body: JSON.stringify(obj) });

  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }
  const { idToken, to, subject, message, doc } = body;
  if (!to) return json(400, { error: 'Missing recipient email' });
  if (!doc) return json(400, { error: 'Missing invoice data' });

  const uid = await verifyToken(idToken);
  if (!uid) return json(401, { error: 'Not authorized — please sign in again' });
  const member = await authorizedMember(idToken, uid);
  if (!member) return json(403, { error: 'Your account is not approved to send email yet' });
  if (rateLimited(uid)) return json(429, { error: 'Too many messages — please try again in a few minutes' });

  const user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  if (!user || !pass) return json(500, { error: 'Email not set up yet (SMTP_USER / SMTP_PASS missing in Netlify)' });

  let pdfBuf;
  try { pdfBuf = await buildPdf(doc); } catch (e) { return json(500, { error: 'PDF generation failed: ' + e.message }); }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user, pass },
  });

  const fromName = (doc.company && doc.company.name) || 'Invoices';
  const label = (doc.kind === 'estimate' ? 'Estimate' : 'Invoice') + ' ' + (doc.number || '');
  try {
    await transporter.sendMail({
      from: `"${fromName}" <${user}>`,
      to,
      replyTo: (doc.company && doc.company.email) || undefined,
      subject: subject || label,
      text: message || ('Please find ' + label + ' attached.'),
      html: message ? ('<p>' + String(message).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>') + '</p>') : ('<p>Please find <strong>' + label + '</strong> attached.</p>'),
      attachments: [{ filename: label.replace(/\s+/g, '-') + '.pdf', content: pdfBuf, contentType: 'application/pdf' }],
    });
  } catch (e) {
    return json(502, { error: 'Send failed: ' + e.message });
  }
  return json(200, { ok: true });
};
