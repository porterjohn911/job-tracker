// Visit reports — telling the customer what was done.
//
// A maintenance customer pays the same fee in a month when nothing broke as in
// a month when something did. By month four they start wondering what they are
// paying for, and that — not dissatisfaction — is what cancels maintenance
// agreements. The work was done; it was just invisible.
//
// So after a visit the customer gets the checklist that was ticked, who ticked
// it, and the photos. In a quiet month that email IS the product.
//
// It reuses the invoice email's branding helpers, so a report looks like it
// came from the same company as the invoices, and it posts to the same
// send-invoice function with attachment:false — the checklist and photos are
// the message, so there is nothing to attach.
//
// Requires 01-contract-periods.js through 08-sample-data.js, plus the invoice
// branding helpers (COMPANY, invTheme, bandInk, brandLogoFull, photoURL).

const CT_REPORT_MAX_PHOTOS = 6;

// ── Can this visit be reported on ───────────────────────────────────────────

// Where to send it. A contract's customer record is the authority; the job's
// own field is the fallback for a visit whose contract lost its customer link.
function ctVisitReportTo(job) {
  const contract = job && job.contractId ? ctGetContract(job.contractId) : null;
  const rec = contract && typeof S !== 'undefined' && S.customers ? S.customers[contract.customerId] : null;
  return ctStr((rec && rec.email) || (job && job.customerEmail) || '');
}

// A report needs something to report. An email saying nothing was done is worse
// than no email — it invites exactly the question it exists to prevent.
function ctVisitReportState(job) {
  if (!job) return { can: false, reason: 'No visit selected.' };
  const tasks = job.tasks || [];
  const done = tasks.filter(t => t && t.done);
  const photos = (job.photos || []).filter(p => photoURL(p));
  const to = ctVisitReportTo(job);

  if (!to) return { can: false, reason: 'No email address on this customer.', done, photos, to: '' };
  if (!done.length && !photos.length) {
    return { can: false, reason: 'Nothing ticked and no photos yet — there is nothing to report.', done, photos, to };
  }
  return {
    can: true, to, done, photos,
    // Surfaced in the composer rather than blocking. Whether a part-finished
    // visit is worth reporting is a judgement call, and the person sending it
    // is better placed to make it than a rule.
    outstanding: tasks.filter(t => t && !t.done),
    sentAt: Number(job.visitReportedAt || 0) || 0,
  };
}

// ── The email ───────────────────────────────────────────────────────────────

function ctVisitReportSubject(job) {
  const co = (typeof COMPANY !== 'undefined' && COMPANY) || {};
  const when = job.startDate ? fmtDate(job.startDate) : '';
  return (co.name ? co.name + ' — ' : '') + 'visit report' + (when ? ' for ' + when : '');
}

function ctVisitReportText(job, msg) {
  const st = ctVisitReportState(job);
  const co = (typeof COMPANY !== 'undefined' && COMPANY) || {};
  const lines = [];
  lines.push(job.customerName ? 'Hi ' + String(job.customerName).trim().split(/\s+/)[0] + ',' : 'Hi,');
  lines.push('');
  lines.push(msg || ('We were out on ' + (job.startDate ? fmtDate(job.startDate) : 'site') +
    (job.address ? ' at ' + job.address : '') + '. Here is what we did.'));
  lines.push('');
  st.done.forEach(t => lines.push('  - ' + (t.text || '') + (t.doneBy ? ' (' + t.doneBy + ')' : '')));
  if (st.photos.length) { lines.push(''); lines.push(st.photos.length + ' photo' + (st.photos.length === 1 ? '' : 's') + ' attached in the emailed version.'); }
  lines.push('');
  lines.push('Anything you would like us to look at next time, just reply to this message.');
  if (co.name) { lines.push(''); lines.push(co.name); }
  if (co.phone) lines.push(co.phone);
  return lines.join('\n');
}

function ctVisitReportHTML(job, msg) {
  const st = ctVisitReportState(job);
  const co = (typeof COMPANY !== 'undefined' && COMPANY) || {};
  const P = typeof invTheme === 'function' ? invTheme() : { band: '#0a3d2e', link: '#0a3d2e' };
  const INK = typeof bandInk === 'function' ? bandInk(P.band) : { text: '#fff', muted: 'rgba(255,255,255,0.75)' };
  const logoFull = typeof brandLogoFull === 'function' ? brandLogoFull() : '';
  const logoSrc = typeof getBrandLogoSrc === 'function' ? getBrandLogoSrc() : '';
  const firstName = ((job.customerName || '').trim().split(/\s+/)[0]) || 'there';
  const contract = job.contractId ? ctGetContract(job.contractId) : null;

  const intro = msg
    ? esc(msg).replace(/\n/g, '<br>')
    : `We were out on <strong>${esc(job.startDate ? fmtDate(job.startDate) : 'site')}</strong>${job.address ? ' at ' + esc(job.address) : ''}. Here is what we took care of.`;

  const doneRows = st.done.map(t => `<tr>
    <td width="22" style="padding:7px 0;vertical-align:top;font-size:14px;color:#15803d">&#10003;</td>
    <td style="padding:7px 0;font-size:13.5px;color:#0a1f18;line-height:1.5">${esc(t.text || '')}${t.doneBy ? `<span style="color:#3d6358"> — ${esc(t.doneBy)}</span>` : ''}</td>
  </tr>`).join('');

  const photoCells = st.photos.slice(0, CT_REPORT_MAX_PHOTOS).map(p =>
    `<td width="50%" style="padding:4px"><img src="${esc(photoURL(p))}" alt="" width="264" style="display:block;width:100%;max-width:264px;height:auto;border-radius:8px"></td>`);
  const photoRows = [];
  for (let i = 0; i < photoCells.length; i += 2) {
    photoRows.push('<tr>' + photoCells.slice(i, i + 2).join('') + (photoCells.length % 2 && i + 2 > photoCells.length ? '<td width="50%"></td>' : '') + '</tr>');
  }

  const contactLine = [
    co.phone ? `<a href="tel:${esc(co.phone)}" style="color:${P.link};text-decoration:none">${esc(co.phone)}</a>` : '',
    co.email ? `<a href="mailto:${esc(co.email)}" style="color:${P.link};text-decoration:none">${esc(co.email)}</a>` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Visit report</title></head>
<body style="margin:0;padding:0;background:#f0faf6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a1f18">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f0faf6">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(10,61,46,0.08)">
      <tr><td style="background:${P.band};padding:26px 32px;text-align:center">
        ${logoFull
          ? `<img src="${logoFull}" alt="${esc(co.name || '')}" width="380" style="display:inline-block;width:100%;max-width:380px;height:auto">`
          : `${logoSrc ? `<img src="${logoSrc}" alt="${esc(co.name || '')}" width="72" height="72" style="display:inline-block;width:72px;height:72px;object-fit:contain">` : ''}
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:600;color:${INK.text};margin-top:8px">${esc(co.name || '')}</div>`}
        <div style="font-size:11.5px;color:${INK.muted};margin-top:10px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700">Visit Report</div>
      </td></tr>

      <tr><td style="padding:26px 32px 8px">
        <p style="margin:0 0 12px;font-size:15px">Hi ${esc(firstName)},</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#28453c">${intro}</p>
      </td></tr>

      ${doneRows ? `<tr><td style="padding:0 32px 6px">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#3d6358;margin-bottom:4px">What we did</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${doneRows}</table>
      </td></tr>` : ''}

      ${photoRows.length ? `<tr><td style="padding:16px 28px 4px">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#3d6358;margin:0 4px 6px">Photos</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${photoRows.join('')}</table>
      </td></tr>` : ''}

      <tr><td style="padding:20px 32px 26px">
        <p style="margin:0;font-size:13.5px;line-height:1.6;color:#28453c">Anything you would like us to look at next time, just reply to this message.</p>
      </td></tr>

      <tr><td style="background:#f7fbf9;padding:18px 32px;text-align:center;border-top:1px solid #e4efea">
        <div style="font-size:13px;font-weight:700;color:#0a1f18">${esc(co.name || '')}</div>
        ${contract ? `<div style="font-size:11.5px;color:#3d6358;margin-top:2px">${esc(contract.name || '')}</div>` : ''}
        ${contactLine ? `<div style="font-size:12px;margin-top:6px">${contactLine}</div>` : ''}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── Sending ─────────────────────────────────────────────────────────────────

async function ctSendVisitReport(job, opts) {
  const o = opts || {};
  const st = ctVisitReportState(job);
  if (!st.can) throw new Error(st.reason);

  // Same gate as the invoice send: _firebaseUser() swallows a throwing auth()
  // and an unconfigured Firebase, so an unsigned-in send fails with a sentence
  // someone can act on rather than an SDK error.
  const user = typeof _firebaseUser === 'function' ? _firebaseUser() : null;
  if (!user) throw new Error('Sign in with your team account to send email');
  const idToken = await user.getIdToken();

  const r = await fetch('/.netlify/functions/send-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idToken: idToken,
      to: o.to || st.to,
      subject: o.subject || ctVisitReportSubject(job),
      message: ctVisitReportText(job, o.message),
      html: ctVisitReportHTML(job, o.message),
      // The checklist and photos are the message. Nothing to attach.
      attachment: false,
      fromName: (typeof COMPANY !== 'undefined' && COMPANY.name) || '',
      replyTo: (typeof COMPANY !== 'undefined' && COMPANY.email) || undefined,
    }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.error || 'Could not send the visit report');

  // Stamped on the job so the account page and the route can show it went, and
  // so nobody sends the same visit twice without meaning to.
  job.visitReportedAt = Date.now();
  job.visitReportedTo = o.to || st.to;
  await writeJob(job);
  return { to: job.visitReportedTo };
}

// ── Composer ────────────────────────────────────────────────────────────────

function openVisitReportComposer(jobId) {
  const job = (typeof S !== 'undefined' && S.jobs && S.jobs[jobId]) || null;
  if (!job) return;
  const st = ctVisitReportState(job);

  const blocked = !st.can ? `<div style="background:rgba(234,140,20,0.10);border:1px solid var(--orange);border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12.5px;color:var(--text-2)">${esc(st.reason)}</div>` : '';

  const warn = st.can && st.outstanding && st.outstanding.length
    ? `<div style="background:rgba(234,140,20,0.08);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:12px">
        <div style="font-size:12px;font-weight:700;color:var(--orange);margin-bottom:3px">${st.outstanding.length} item${st.outstanding.length === 1 ? '' : 's'} still unticked</div>
        <div style="font-size:12px;color:var(--text-2);line-height:1.5">The report only lists what was ticked, so these will not appear: ${esc(st.outstanding.map(t => t.text).join(', '))}</div>
      </div>` : '';

  const already = st.sentAt
    ? `<div class="tt-hint" style="margin-bottom:12px">Already sent ${esc(fmtDate(new Date(st.sentAt)))} to ${esc(job.visitReportedTo || '')}. Sending again will send a second copy.</div>` : '';

  $('modal-root').innerHTML = `<div class="modal-bd" id="vr-bd" role="dialog" aria-modal="true" aria-label="Visit report"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">Send Visit Report</div><button class="modal-close" id="vr-close" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      ${blocked}${already}${warn}
      <div class="form-group"><label class="form-label">To</label><input class="form-input" type="email" id="vr-to" value="${esc(st.to || '')}" placeholder="customer@example.com"></div>
      <div class="form-group"><label class="form-label">Message <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-3);font-size:11px">optional — replaces the default opening line</span></label><textarea class="form-textarea" id="vr-msg" placeholder="We were out this morning and everything looked good…"></textarea></div>
      <div class="section-hd" style="margin-top:4px">Preview</div>
      <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;background:#f0faf6">
        <iframe id="vr-preview" title="Visit report preview" style="width:100%;height:340px;border:0;display:block"></iframe>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn-cancel" id="vr-cancel">Cancel</button>
      <button class="btn-save" id="vr-send" ${st.can ? '' : 'disabled'}>Send Report</button>
    </div>
  </div></div>`;

  const paint = () => {
    const frame = $('vr-preview');
    if (frame) frame.srcdoc = ctVisitReportHTML(job, ($('vr-msg').value || '').trim());
  };
  paint();
  $('vr-msg')?.addEventListener('input', paint);

  $('vr-close').onclick = $('vr-cancel').onclick = closeModal;
  $('vr-bd').onclick = e => { if (e.target === e.currentTarget) closeModal(); };

  $('vr-send').onclick = async () => {
    const to = ($('vr-to').value || '').trim();
    if (!to) { toast('Add an email address', ''); return; }
    const btn = $('vr-send');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      await ctSendVisitReport(job, { to: to, message: ($('vr-msg').value || '').trim() });
      closeModal();
      if (typeof render === 'function') render();
      toast('Visit report sent to ' + to);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Send Report';
      toast(e.message || 'Could not send the visit report', '');
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ctVisitReportTo, ctVisitReportState, ctVisitReportSubject,
    ctVisitReportText, ctVisitReportHTML, ctSendVisitReport, openVisitReportComposer,
  };
}
