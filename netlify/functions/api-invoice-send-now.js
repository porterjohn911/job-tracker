// Agent-facing DIRECT SEND of an invoice/estimate (see AGENT_API_DESIGN.md §7).
//
//   POST /.netlify/functions/api-invoice-send-now
//   Authorization: Bearer sk_live_...   (scope invoices:send)
//   body: { jobId, invoiceId, kind?, to?, subject?, message? }
//
// Unlike api-invoice-send (which only QUEUES for owner approval), this actually
// builds the PDF and EMAILS it to the customer via SMTP, then marks the invoice
// sent. Gated behind the dedicated `invoices:send` scope. Requires SMTP_USER /
// SMTP_PASS (same creds the weekly report uses) and the company profile synced
// to {ns}/company (the app writes this when Settings are saved).

const nodemailer = require('nodemailer');
const { db } = require('./_lib/firebaseAdmin');
const { corsHeaders, jsonResponder, authenticateApiKey } = require('./_lib/apiKeyAuth');
const { buildPdf } = require('./_lib/invoicePdf');

function num(v) { return Number(v || 0); }

exports.handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  const json = jsonResponder(origin);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(origin), body: '{}' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  try {
    const authed = await authenticateApiKey(event, 'invoices:send');
    if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });
    const ns = authed.key.ns || authed.key.company;
    if (!ns) return json(500, { error: 'Key is not bound to a company' });

    // Strip stray whitespace from the credentials — the spaces Google shows in
    // an App Password ("abcd efgh ijkl mnop") or a trailing newline pasted into
    // Netlify are a classic cause of 535-5.7.8 BadCredentials.
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '');
    if (!user || !pass) return json(500, { error: 'Email not set up (SMTP_USER / SMTP_PASS missing in Netlify)' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }
    const jobId = String(body.jobId || '').trim();
    const invoiceId = String(body.invoiceId || '').trim();
    if (!jobId || !invoiceId) return json(400, { error: 'jobId and invoiceId are required' });
    const kind = body.kind === 'estimate' ? 'estimate' : 'invoice';
    const field = kind === 'estimate' ? 'estimates' : 'invoices';

    let job, company;
    try {
      const [jSnap, cSnap] = await Promise.all([
        db().ref(ns + '/jobs/' + jobId).get(),
        db().ref(ns + '/company').get(),
      ]);
      job = jSnap.val();
      company = cSnap.val();
    } catch (e) { return json(500, { error: 'Read failed: ' + e.message }); }
    if (!job) return json(404, { error: 'No job with id ' + jobId });
    if (!company) return json(409, { error: 'Company profile not synced to the cloud yet — open the app, go to Settings, and click Save once, then retry.' });

    const arr = Array.isArray(job[field]) ? job[field] : [];
    const idx = arr.findIndex((d) => d && d.id === invoiceId);
    if (idx < 0) return json(404, { error: 'No ' + kind + ' with id ' + invoiceId + ' on that job' });
    const inv = arr[idx];

    const to = (body.to ? String(body.to) : (job.customerEmail || '')).trim();
    if (!to) return json(400, { error: 'No recipient email — provide "to" or set the job customer email' });

    const doc = {
      kind,
      number: inv.number || '',
      date: inv.date || '',
      dueDate: inv.dueDate || '',
      taxRate: inv.taxRate,
      paid: num(inv.paid),
      notes: inv.notes || '',
      terms: inv.terms || company.terms || '',
      items: Array.isArray(inv.items) ? inv.items : [],
      company: {
        name: company.name || '', address: company.address || '', phone: company.phone || '',
        email: company.email || '', website: company.website || '', license: company.license || '',
      },
      customer: {
        name: job.customerName || '', address: job.billingAddress || job.address || '',
        phone: job.customerPhone || '', email: job.customerEmail || '',
      },
      project: { name: job.name || '', address: job.address || '' },
    };

    let pdfBuf;
    try { pdfBuf = await buildPdf(doc); } catch (e) { return json(500, { error: 'PDF build failed: ' + e.message }); }

    const label = (kind === 'estimate' ? 'Estimate' : 'Invoice') + ' ' + (inv.number || '');
    const subject = body.subject ? String(body.subject) : (label + ' from ' + (company.name || 'us'));
    const message = body.message ? String(body.message) : ('Please find ' + label + ' attached.');

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 465),
      secure: true,
      auth: { user, pass },
    });
    try {
      await transporter.sendMail({
        from: '"' + (company.name || 'Invoices') + '" <' + user + '>',
        to,
        replyTo: company.email || undefined,
        subject,
        text: message,
        html: '<p>' + String(message).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>') + '</p>',
        attachments: [{ filename: label.replace(/\s+/g, '-') + '.pdf', content: pdfBuf, contentType: 'application/pdf' }],
      });
    } catch (e) {
      return json(502, { error: 'Send failed: ' + e.message });
    }

    // Mark sent (mirrors the client: inv.sent + status).
    arr[idx] = { ...inv, sent: Date.now(), status: inv.status === 'draft' ? 'sent' : (inv.status || 'sent') };
    try { await db().ref(ns + '/jobs/' + jobId + '/' + field).set(arr); } catch (e) { /* email already sent; don't fail the call */ }

    db().ref(ns + '/activity').push({
      user: 'Agent · ' + (authed.key.label || authed.key.prefix || 'API key'),
      action: 'emailed ' + kind + ' ' + (inv.number || '') + ' to ' + to + ' for',
      job: job.name || '', jobId, time: Date.now(),
    }).catch(() => {});

    return json(200, { ok: true, sent: true, to, kind, number: inv.number || '' });
  } catch (e) {
    console.error('[api-invoice-send-now] unhandled:', e && e.stack ? e.stack : e);
    return json(500, { error: 'Unexpected server error: ' + ((e && e.message) || 'unknown') });
  }
};
