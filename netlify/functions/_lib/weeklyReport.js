// Shared weekly-report logic — used by the scheduled function (weekly-report.js)
// and the manual trigger (report-run.js). Computes the rollups, adds a
// Claude-written summary, emails the report, and stores a weekly snapshot for
// week-over-week deltas. Reads all config from env (see AGENT_API_DESIGN.md).

const nodemailer = require('nodemailer');
const { db } = require('./firebaseAdmin');
const { computeOverview, computeReportDetail } = require('./reports');

function money(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function signedMoney(n) {
  return (n > 0 ? '+' : n < 0 ? '-' : '') + money(Math.abs(n));
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function resolveNamespace(companyId) {
  try {
    const snap = await db().ref('companies/' + companyId + '/ns').get();
    if (snap.exists() && typeof snap.val() === 'string') return snap.val();
  } catch (e) { /* fall through */ }
  return companyId;
}

async function aiSummary(payload) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const prompt =
    'You are a financial analyst for a small construction / field-services business. ' +
    "Write a concise (4-6 sentence) plain-language summary of this week's financial snapshot for the owner. " +
    'Be concrete with figures, call out week-over-week changes when deltas are provided, and flag anything needing attention ' +
    '(large overdue balances, rising expenses, shrinking pipeline). No markdown headings or bullet symbols — just short paragraphs.\n\n' +
    'DATA:\n' + JSON.stringify(payload);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) { console.error('[weekly-report] Claude call failed:', r.status); return null; }
    const d = await r.json();
    if (d.stop_reason === 'refusal') return null;
    const block = (d.content || []).find((b) => b.type === 'text');
    return block ? String(block.text).trim() : null;
  } catch (e) {
    console.error('[weekly-report] Claude error:', e.message);
    return null;
  }
}

function buildEmail(company, overview, detail, deltas, summary) {
  const r = overview.receivables;
  const j = overview.jobs;
  const topCats = Object.entries(overview.expenses.byCategory)
    .filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const deltaLine = (label, cur, key) => {
    const d = deltas ? deltas[key] : null;
    const chg = (d != null && Math.abs(d) >= 0.005) ? ` (${signedMoney(d)} vs last week)` : '';
    return `<tr><td style="padding:4px 12px 4px 0;color:#555">${esc(label)}</td><td style="padding:4px 0;text-align:right;font-variant-numeric:tabular-nums"><strong>${esc(money(cur))}</strong>${esc(chg)}</td></tr>`;
  };

  const overdueRows = detail.overdue.slice(0, 8).map((o) =>
    `<tr><td style="padding:3px 12px 3px 0">${esc(o.number)} — ${esc(o.customer || o.jobName)}</td><td style="padding:3px 0;text-align:right">${esc(money(o.balance))}</td><td style="padding:3px 0 3px 12px;color:#a00">due ${esc(o.dueDate || '—')}</td></tr>`
  ).join('') || '<tr><td style="color:#2a7">Nothing overdue 🎉</td></tr>';

  const outstandingRows = detail.topOutstanding.map((o) =>
    `<tr><td style="padding:3px 12px 3px 0">${esc(o.jobName || o.customer)}</td><td style="padding:3px 0;text-align:right">${esc(money(o.outstanding))}</td></tr>`
  ).join('') || '<tr><td style="color:#555">None</td></tr>';

  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:640px;color:#111">
    <h2 style="margin:0 0 4px">Weekly Financial Report</h2>
    <div style="color:#777;font-size:13px;margin-bottom:16px">${esc(company)} · ${esc(new Date().toDateString())}</div>
    ${summary ? `<div style="background:#f6f7f9;border-radius:8px;padding:14px 16px;margin-bottom:18px;line-height:1.55">${esc(summary).replace(/\n/g, '<br>')}</div>` : ''}
    <table style="border-collapse:collapse;font-size:14px;margin-bottom:18px">
      ${deltaLine('Outstanding (A/R)', r.outstanding, 'outstanding')}
      ${deltaLine('Overdue', r.overdueAmount, 'overdueAmount')}
      ${deltaLine('Collected to date', r.paidTotal, 'paidTotal')}
      ${deltaLine('Pipeline value', j.pipelineValue, 'pipelineValue')}
      ${deltaLine('Expenses', overview.expenses.total, 'expenseTotal')}
      ${overview.labor.costAvailable ? deltaLine('Labor cost', overview.labor.cost, 'laborCost') : ''}
    </table>
    <div style="font-size:14px;margin-bottom:6px"><strong>Jobs:</strong> ${j.total} total · ${r.overdueCount} overdue invoice(s) · ${overview.estimates.count} open estimate(s) worth ${esc(money(overview.estimates.value))} · ${overview.labor.totalHours} hrs logged</div>
    <h3 style="margin:18px 0 6px;font-size:15px">Overdue invoices</h3>
    <table style="border-collapse:collapse;font-size:13px">${overdueRows}</table>
    <h3 style="margin:18px 0 6px;font-size:15px">Biggest outstanding balances</h3>
    <table style="border-collapse:collapse;font-size:13px">${outstandingRows}</table>
    ${topCats.length ? `<h3 style="margin:18px 0 6px;font-size:15px">Top expense categories</h3>
    <table style="border-collapse:collapse;font-size:13px">${topCats.map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0">${esc(k)}</td><td style="padding:3px 0;text-align:right">${esc(money(v))}</td></tr>`).join('')}</table>` : ''}
    <div style="color:#999;font-size:12px;margin-top:20px">Generated automatically. Reply to this email is not monitored.</div>
  </div>`;

  const text = [
    `Weekly Financial Report — ${company} — ${new Date().toDateString()}`,
    summary ? '\n' + summary + '\n' : '',
    `Outstanding (A/R): ${money(r.outstanding)}`,
    `Overdue: ${money(r.overdueAmount)} across ${r.overdueCount} invoice(s)`,
    `Collected to date: ${money(r.paidTotal)}`,
    `Pipeline value: ${money(j.pipelineValue)}`,
    `Expenses: ${money(overview.expenses.total)}`,
    overview.labor.costAvailable ? `Labor cost: ${money(overview.labor.cost)}` : '',
    `Hours logged: ${overview.labor.totalHours}`,
  ].filter(Boolean).join('\n');

  return { html, text };
}

// Runs the whole flow. Returns { ok, sent, reason }. Never throws for expected
// misconfiguration (missing REPORT_TO / SMTP) — it computes + snapshots anyway
// and reports why nothing was emailed.
async function generateAndSend() {
  const company = process.env.REPORT_COMPANY || 'wfs';
  const to = process.env.REPORT_TO;
  const ns = await resolveNamespace(company);

  const overview = await computeOverview(db(), ns, true); // admin can read pay rates -> include labor cost
  const detail = await computeReportDetail(db(), ns);

  const snaps = (await db().ref(ns + '/report_snapshots').get()).val() || {};
  const priorKey = Object.keys(snaps).sort().pop();
  const prior = priorKey ? snaps[priorKey] : null;
  const current = {
    outstanding: overview.receivables.outstanding,
    overdueAmount: overview.receivables.overdueAmount,
    paidTotal: overview.receivables.paidTotal,
    pipelineValue: overview.jobs.pipelineValue,
    expenseTotal: overview.expenses.total,
    laborCost: overview.labor.cost || 0,
  };
  const deltas = prior ? Object.fromEntries(
    Object.keys(current).map((k) => [k, current[k] - (prior[k] || 0)])
  ) : null;

  const summary = await aiSummary({
    company, current, deltas, overview,
    overdueTop: detail.overdue.slice(0, 5),
    topOutstanding: detail.topOutstanding,
  });

  const dateKey = new Date().toISOString().slice(0, 10);
  await db().ref(ns + '/report_snapshots/' + dateKey).set({ ...current, at: Date.now() });

  if (!to) {
    console.error('[weekly-report] REPORT_TO is not set — computed the report but cannot email it.');
    return { ok: true, sent: false, reason: 'REPORT_TO not set' };
  }
  // Strip stray whitespace from the credentials — the spaces Google shows in an
  // App Password ("abcd efgh ijkl mnop") or a trailing newline pasted into
  // Netlify are a classic cause of 535-5.7.8 BadCredentials.
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '');
  if (!user || !pass) {
    console.error('[weekly-report] SMTP_USER/SMTP_PASS not set — cannot email the report.');
    return { ok: true, sent: false, reason: 'SMTP not configured' };
  }

  const { html, text } = buildEmail(company, overview, detail, deltas, summary);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user, pass },
  });
  await transporter.sendMail({
    from: `"Job Tracker Reports" <${process.env.REPORT_FROM || user}>`,
    to,
    subject: `Weekly financial report — ${company} — ${dateKey}`,
    text,
    html,
  });

  console.log('[weekly-report] sent to', to);
  return { ok: true, sent: true, reason: 'sent', summaryIncluded: !!summary };
}

module.exports = { generateAndSend };
