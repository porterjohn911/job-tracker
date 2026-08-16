// Recurring contracts — the bill run.
//
// Generation raises invoices as drafts, on purpose: paperwork is created by a
// schedule, but nothing goes to a customer without a person saying so. The
// consequence is a hole at the end of the money loop. Twenty contracts on
// monthly billing means twenty Agreement jobs opened, twenty invoices found,
// twenty sends — and nothing anywhere that says which ones were missed. A draft
// nobody sent is indistinguishable from a period that was not due, so the
// revenue simply does not arrive and no screen ever mentions it.
//
// This is that missing screen: every unsent draft in one list, checked for the
// things that make a send go wrong, sent in one press, with a per-invoice
// account of what happened.
//
// ── Why this does not call sendInvoicePDF ───────────────────────────────────
//
// The one-at-a-time path is right for one invoice and dangerous for twelve. Its
// last two fallbacks download the PDF and open a Gmail compose tab, so a single
// bulk press would produce twelve downloads and twelve browser tabs. It also
// reports failure by toast and returns normally, so a caller cannot tell a send
// from a failure — and it marks the invoice sent on the download fallback,
// where nothing was actually sent.
//
// So delivery here uses only the two channels that really deliver — the Gmail
// API or the SMTP function — reusing their builders unchanged, and THROWS when
// a send fails. If neither channel is available the run refuses to start and
// says why, rather than quietly degrading into a pile of downloads.
//
// Everything project-work touches is left alone: no shared send code is
// modified, and this file lives in src/app/contracts/, which project companies
// never load.
//
// Requires 01-contract-periods.js through 11-contract-revenue.js.

// ── What is waiting to go out ───────────────────────────────────────────────

// An invoice is in the run when nobody has sent it and nothing has been
// collected against it. `sent` is the authority rather than status alone: the
// send path stamps it, so an invoice that went out can never be picked up by a
// second run even if its status was edited afterwards.
function ctIsUnsentDraft(inv) {
  if (!inv || inv.sent) return false;
  const status = String(inv.status || 'draft').toLowerCase();
  return status === 'draft';
}

// The customer's address as it stands TODAY, not as it was when the Agreement
// job was opened. That job snapshots the email at creation, so a customer who
// changed address a year into a contract would otherwise be billed at the old
// one forever.
function ctBillRecipient(contract, job) {
  const cust = (typeof S !== 'undefined' && S.customers && S.customers[contract.customerId]) || null;
  return ctStr((cust && cust.email) || (job && job.customerEmail) || '');
}

// What a period's invoice ought to come to, from the contract as it reads now.
// Only the recurring part — add-ons ride on whichever invoice happened to be
// first in their run, so they are not a mismatch when they are missing.
function ctExpectedAmount(contract) {
  return Number((contract.billing && contract.billing.amount) || 0);
}

// Everything that would make this send go wrong, or land badly.
//
// Blocking checks stop the invoice being sent at all; there is no useful
// outcome from emailing nothing to nobody. Advisory ones are shown and left
// ticked, because they are judgement calls — billing a customer who is already
// behind is often exactly right, and sometimes exactly wrong.
// `nowTs` is threaded in rather than read from the clock, so every check in a
// row is answered against the same instant the rest of the row was built for.
function ctBillChecks(row, nowTs) {
  const blocking = [], advisory = [];

  if (!row.to) blocking.push('No email address for this customer');
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.to)) blocking.push('That email address does not look valid');
  if (row.calc.total <= 0.005) blocking.push('Nothing to charge — the invoice totals zero');

  const expected = ctExpectedAmount(row.contract);
  // Only worth mentioning when the invoice is SHORT of the contract. Over is
  // normal — that is an add-on riding along.
  if (expected > 0 && row.calc.total < expected - 0.005) {
    advisory.push('Invoice is ' + money2(expected - row.calc.total) + ' under the contract amount of ' + money2(expected));
  }
  if (row.overdue > 0.005) {
    advisory.push(money2(row.overdue) + ' is already overdue on this account');
  }
  // Generating a backlog produces invoices whose due dates are behind us. They
  // are still worth sending; the customer should just not be the one to
  // discover that the bill arrived pre-overdue.
  const due = ctParseDate(row.inv.dueDate);
  if (due) {
    const days = Math.round((due - ctStartOfDay(nowTs == null ? Date.now() : nowTs)) / 86400000);
    if (days < 0) advisory.push('Due date passed ' + Math.abs(days) + ' days ago — this arrives already overdue');
  }

  return { blocking, advisory };
}

// Every unsent draft across every contract, with everything needed to send it.
//
// Sorted by customer so a customer with two agreements appears twice in a row
// rather than at opposite ends of the list — they are about to get two emails,
// and that should be visible before the press, not after.
function ctBillRunRows(nowTs) {
  const now = nowTs == null ? Date.now() : nowTs;
  const out = [];

  ctContractList().forEach(contract => {
    const job = (typeof S !== 'undefined' && S.jobs && S.jobs[ctBillingJobId(contract)]) || null;
    if (!job || !job.invoices) return;

    // Anything already sent and still owing, so "they are behind" can be said
    // before another invoice is added to the pile.
    const overdue = job.invoices.reduce((sum, inv) => {
      if (!inv.sent) return sum;
      const st = typeof invoiceStatus === 'function' ? invoiceStatus(inv) : '';
      return st === 'overdue' ? sum + calcInvoice(inv).balance : sum;
    }, 0);

    job.invoices.filter(ctIsUnsentDraft).forEach(inv => {
      const row = {
        contract, job, inv,
        calc: calcInvoice(inv),
        customer: ctCustomerName(contract.customerId) || ctStr(job.customerName) || 'No customer set',
        to: ctBillRecipient(contract, job),
        overdue: overdue,
      };
      const checks = ctBillChecks(row, now);
      row.blocking = checks.blocking;
      row.advisory = checks.advisory;
      row.sendable = checks.blocking.length === 0;
      out.push(row);
    });
  });

  return out.sort((a, b) =>
    a.customer.localeCompare(b.customer) ||
    String(a.inv.date || '').localeCompare(String(b.inv.date || '')) ||
    String(a.inv.number || '').localeCompare(String(b.inv.number || '')));
}

function ctBillRunTotals(rows) {
  const sendable = rows.filter(r => r.sendable);
  return {
    count: rows.length,
    sendable: sendable.length,
    blocked: rows.length - sendable.length,
    total: sendable.reduce((s, r) => s + r.calc.total, 0),
    customers: new Set(sendable.map(r => r.to)).size,
  };
}

// ── Delivery ────────────────────────────────────────────────────────────────

// Which channel actually delivers, or null when none does.
//
// Null is a hard stop for a bulk run, not something to work around. The
// one-at-a-time path degrades to a download and a compose tab, which is a
// reasonable last resort for one invoice and an unusable mess for twelve.
function ctBillChannel() {
  try {
    if (typeof gmailConnected === 'function' && gmailConnected()) return 'gmail';
  } catch (e) { /* fall through to SMTP */ }
  try {
    if (typeof _firebaseUser === 'function' && _firebaseUser()) return 'smtp';
  } catch (e) { /* no channel */ }
  return null;
}

function ctBillChannelLabel(channel) {
  return { gmail: 'your connected Gmail account', smtp: 'the company email account' }[channel] || '';
}

// Send one invoice, for real, and throw if it did not go.
//
// Deliberately built from the same pieces the single-invoice path uses — the
// same PDF builder, the same HTML and text bodies, the same two transports — so
// a bulk-sent invoice is byte-for-byte what a hand-sent one would have been.
// What it does NOT reuse is the fallback ladder underneath them.
//
// Tests replace this wholesale; everything above it is pure enough to check
// without a network.
async function ctDeliverInvoice(row, channel) {
  const j = row.job, inv = row.inv;
  const subject = 'Invoice ' + (inv.number || '') + ' from ' + ((typeof COMPANY !== 'undefined' && COMPANY.name) || '');
  const text = buildInvoiceEmailText(j, inv, '', 'invoice');
  const html = buildInvoiceEmailHTML(j, inv, '', 'invoice');
  const builder = window.buildInvoicePDFFile || buildInvoicePDFFile;
  const file = await builder(j, inv, 'invoice');

  if (channel === 'gmail') {
    const send = window.gmailApiSend || gmailApiSend;
    await send({
      to: row.to, subject: subject, htmlBody: html, textBody: text,
      fromName: (typeof COMPANY !== 'undefined' && COMPANY.name) || '', attachments: [file],
    });
  } else {
    await smtpInvoiceSend({
      to: row.to, subject: subject, text: text, html: html, file: file,
      fromName: (typeof COMPANY !== 'undefined' && COMPANY.name) || '',
      replyTo: (typeof COMPANY !== 'undefined' && COMPANY.email) || '',
    });
  }
}

// Send the selected invoices, one after another.
//
// Sequential on purpose. Twelve concurrent sends is twelve concurrent PDF
// builds and twelve concurrent SMTP connections, which is how a mail provider
// decides you are spam.
//
// One failure never stops the run. The whole point of a bill run is that it
// finishes; an address that bounces on invoice three must not silently cancel
// invoices four through twelve. Every outcome is recorded and handed back.
//
// The invoice is stamped and saved only AFTER the send resolves, so a failed
// send leaves it exactly where it was — in the run, ready to retry.
async function ctRunBilling(rows, opts) {
  const o = opts || {};
  const channel = o.channel || ctBillChannel();
  if (!channel) throw new Error('No email channel is connected');

  const results = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (typeof o.onProgress === 'function') o.onProgress(i, rows.length, row);
    try {
      await ctDeliverInvoice(row, channel);
      row.inv.sent = Date.now();
      row.inv.status = 'sent';
      await writeJob(row.job);
      if (typeof logAct === 'function') {
        try { await logAct('emailed invoice ' + (row.inv.number || '') + ' to ' + row.to + ' for', row.job.name); } catch (e) {}
      }
      results.push({ row: row, ok: true });
    } catch (e) {
      results.push({ row: row, ok: false, error: (e && e.message) || String(e) });
    }
  }

  const sent = results.filter(r => r.ok);
  return {
    results: results,
    sent: sent.length,
    failed: results.length - sent.length,
    total: sent.reduce((s, r) => s + r.row.calc.total, 0),
  };
}

// ── Rendering ───────────────────────────────────────────────────────────────

function ctBillRunButton(nowTs) {
  let rows;
  try { rows = ctBillRunRows(nowTs); } catch (e) { return ''; }
  if (!rows.length) return '';
  return `<button class="btn-cancel" id="btn-ct-bills" aria-label="Review unsent invoices">Bill Run · ${rows.length}</button>`;
}

function ctBillRow(row, i) {
  const blocked = !row.sendable;
  const flags = row.blocking.concat(row.advisory);
  return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
    <input type="checkbox" class="ct-bill-pick" data-ct-bill="${i}" ${blocked ? 'disabled' : 'checked'}
      aria-label="Send invoice ${esc(row.inv.number || '')}" style="margin-top:2px;flex-shrink:0;width:17px;height:17px;accent-color:var(--green-700)">
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(row.customer)}</div>
      <div style="font-size:11.5px;color:var(--text-3)">${esc(row.inv.number || 'Invoice')} · ${esc(row.contract.name || 'Contract')}${row.to ? ' · ' + esc(row.to) : ''}</div>
      ${flags.map(f => `<div style="font-size:11.5px;color:var(--orange);margin-top:2px">${blocked && row.blocking.indexOf(f) >= 0 ? '⚠ ' : ''}${esc(f)}</div>`).join('')}
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:13px;font-weight:700;color:${blocked ? 'var(--text-3)' : 'var(--text)'}">${money2(row.calc.total)}</div>
      ${row.inv.dueDate ? `<div style="font-size:10.5px;color:var(--text-3)">due ${esc(row.inv.dueDate)}</div>` : ''}
    </div>
  </div>`;
}

function ctBillResultPanel(result) {
  if (!result) return '';
  const failed = result.results.filter(r => !r.ok);
  return `<div style="background:${failed.length ? 'rgba(224,92,26,0.10)' : 'var(--green-50)'};border:1px solid ${failed.length ? 'var(--orange)' : 'var(--green-700)'};border-radius:8px;padding:11px 13px;margin-bottom:14px">
    <div style="font-size:13px;font-weight:700;color:${failed.length ? 'var(--orange)' : 'var(--green-700)'};margin-bottom:3px">
      ${result.sent} invoice${result.sent === 1 ? '' : 's'} sent${result.sent ? ' · ' + money2(result.total) : ''}${failed.length ? ' · ' + failed.length + ' failed' : ''}
    </div>
    ${failed.length
      ? `<div style="font-size:12px;color:var(--text-2);line-height:1.6;margin-top:5px">These were not sent and are still in the list:</div>
         <ul style="margin:4px 0 0;padding-left:16px;font-size:12px;color:var(--text-2);line-height:1.6">
           ${failed.map(f => `<li><strong>${esc(f.row.customer)}</strong> — ${esc(f.error)}</li>`).join('')}
         </ul>`
      : `<div style="font-size:12px;color:var(--text-2);line-height:1.5">Every selected invoice went out. They now show as sent on their contracts.</div>`}
  </div>`;
}

function renderBillRun(nowTs) {
  const now = nowTs == null ? Date.now() : nowTs;
  const rows = ctBillRunRows(now);
  const t = ctBillRunTotals(rows);
  const channel = ctBillChannel();
  const result = (typeof S !== 'undefined' && S.ctBillResult) || null;

  const back = `<div style="margin-bottom:12px">
    <button data-ct-bill-back style="background:none;border:none;padding:0;font-size:12.5px;color:var(--text-3);cursor:pointer">← All contracts</button>
  </div>`;

  const head = `<div style="margin-bottom:14px">
    <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;font-weight:700">Recurring Work</div>
    <div style="font-size:20px;font-weight:700;margin-top:2px">Bill Run</div>
  </div>`;

  if (!rows.length) {
    return back + head + ctBillResultPanel(result) + `<div class="section" style="text-align:center;padding:34px 20px">
      <p style="font-size:14px;color:var(--text-2);margin-bottom:4px">Nothing is waiting to go out.</p>
      <p style="font-size:12.5px;color:var(--text-3)">Invoices appear here as drafts once a contract's billing period comes due. Press <strong>Generate</strong> on the Contracts tab to raise the ones that are owed.</p>
    </div>`;
  }

  // Said before anything can be pressed, not after it fails. Without a channel
  // this screen can review but not send, and pretending otherwise would end in
  // a pile of downloaded PDFs.
  const noChannel = !channel
    ? `<div style="background:rgba(224,92,26,0.10);border:1px solid var(--orange);border-radius:8px;padding:11px 13px;margin-bottom:14px">
        <div style="font-size:12.5px;font-weight:700;color:var(--orange);margin-bottom:2px">No way to send yet</div>
        <div style="font-size:12.5px;color:var(--text-2);line-height:1.5">Sign in with your team account, or connect Gmail on the Invoices tab. Sending in bulk needs a real email channel — you can still review the list below.</div>
      </div>`
    : '';

  return back + head + ctBillResultPanel(result) + noChannel + `
    <div class="kpi-grid">
      <div class="kpi-card accent"><div class="kpi-label">Ready to send</div><div class="kpi-value">${money2(t.total)}</div><div class="kpi-sub">${t.sendable} invoice${t.sendable === 1 ? '' : 's'} to ${t.customers} customer${t.customers === 1 ? '' : 's'}</div></div>
      <div class="kpi-card"><div class="kpi-label">Held back</div><div class="kpi-value" style="color:${t.blocked ? 'var(--orange)' : 'var(--green-700)'}">${t.blocked}</div><div class="kpi-sub">${t.blocked ? 'need fixing first' : 'nothing blocked'}</div></div>
    </div>

    <div class="section">
      <div class="section-hd">Unsent invoices <span>${t.count} draft${t.count === 1 ? '' : 's'}</span></div>
      ${rows.map(ctBillRow).join('')}
      <div id="ct-bill-status" style="font-size:12px;color:var(--text-3);margin-top:10px;min-height:17px"></div>
      <button class="btn-save" id="ct-bill-send" style="width:100%;margin-top:6px${(!channel || !t.sendable) ? ';opacity:.45;cursor:not-allowed' : ''}" ${(!channel || !t.sendable) ? 'disabled' : ''}>
        Send <span id="ct-bill-count">${t.sendable}</span> invoice${t.sendable === 1 ? '' : 's'}
      </button>
      ${channel ? `<div style="font-size:11px;color:var(--text-3);margin-top:7px;text-align:center">Sends from ${esc(ctBillChannelLabel(channel))}, one at a time, with the PDF attached.</div>` : ''}
    </div>
  `;
}

// ── Handlers ────────────────────────────────────────────────────────────────

// Wired from attachContractHandlers() like the rest of this tab. Kept here so
// the send loop and the button that starts it stay in one file.
function ctAttachBillRunHandlers() {
  const picks = () => [...document.querySelectorAll('.ct-bill-pick')];

  const refresh = () => {
    const n = picks().filter(el => el.checked).length;
    const label = document.getElementById('ct-bill-count');
    const btn = document.getElementById('ct-bill-send');
    if (label) label.textContent = String(n);
    if (btn) btn.disabled = !n || !ctBillChannel();
  };
  picks().forEach(el => el.addEventListener('change', refresh));

  document.getElementById('ct-bill-send')?.addEventListener('click', async () => {
    const rows = ctBillRunRows();
    const chosen = picks().filter(el => el.checked).map(el => rows[Number(el.dataset.ctBill)]).filter(Boolean);
    if (!chosen.length) return;

    const total = chosen.reduce((s, r) => s + r.calc.total, 0);
    const people = new Set(chosen.map(r => r.to)).size;
    // Emailing customers is not undoable, so the count, the money and the
    // number of people it reaches are all stated before it happens.
    if (!confirm(`Send ${chosen.length} invoice${chosen.length === 1 ? '' : 's'} totalling ${money2(total)} to ${people} customer${people === 1 ? '' : 's'}?\n\nThis emails them straight away.`)) return;

    const btn = document.getElementById('ct-bill-send');
    const status = document.getElementById('ct-bill-status');
    btn.disabled = true;
    picks().forEach(el => { el.disabled = true; });

    let out;
    try {
      out = await ctRunBilling(chosen, {
        onProgress: (i, n, row) => {
          if (status) status.textContent = `Sending ${i + 1} of ${n} — ${row.customer}…`;
        },
      });
    } catch (e) {
      if (status) status.textContent = '';
      btn.disabled = false;
      picks().forEach(el => { el.disabled = false; });
      toast((e && e.message) || 'Could not start the bill run', '');
      return;
    }

    S.ctBillResult = out;
    if (typeof render === 'function') render();
    toast(out.failed
      ? out.sent + ' sent, ' + out.failed + ' failed'
      : 'Sent ' + out.sent + ' invoice' + (out.sent === 1 ? '' : 's') + ' · ' + money2(out.total));
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ctIsUnsentDraft, ctBillRecipient, ctExpectedAmount, ctBillChecks,
    ctBillRunRows, ctBillRunTotals, ctBillChannel, ctDeliverInvoice, ctRunBilling,
    ctBillRunButton, renderBillRun, ctAttachBillRunHandlers,
  };
}
