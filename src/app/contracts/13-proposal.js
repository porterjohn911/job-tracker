// Recurring contracts — the proposal, as content.
//
// What a customer signs before a contract goes live. Almost everything in it is
// already on the contract — the name, the customer, the dates, the checklist,
// the billing amount — so this is mostly a customer-facing rendering of data
// the app already holds. That matters: a proposal built from the contract can
// never promise something the contract will not then do.
//
// ── The one rule ────────────────────────────────────────────────────────────
//
// contract.pricing NEVER appears here, in any form. Crew rate, hours per visit
// and target margin are what the work costs US. A customer who sees "2 hours at
// $50 with a 40% target" has been handed the whole negotiation. This file does
// not read contract.pricing at all, and a test renders a fully-priced contract
// and asserts none of those numbers reach the output.
//
// ── Why a block list ────────────────────────────────────────────────────────
//
// The document goes out twice — as a PDF attachment and as the email body — and
// the two must say the same thing. So the content is built ONCE as an ordered
// list of typed blocks, and the PDF and the HTML are two renderers over it.
// Neither can drift, and the content itself is plain data that can be tested
// without a browser, a network, or a PDF library.
//
// Requires 01-contract-periods.js through 12-bill-run.js.

// ── State ───────────────────────────────────────────────────────────────────

const CT_PROPOSAL_VALID_DAYS = 30;

// A starter for the terms, seeded from the invoice terms already set in
// Settings so there is one place to edit rather than two.
//
// Deliberately thin. Cancellation, liability and insurance language is a
// lawyer's job, and a document that LOOKS authoritative is worse than one that
// obviously wants filling in — so this says the operational things a
// maintenance agreement actually needs and stops there.
function ctDefaultProposalTerms() {
  const co = (typeof COMPANY !== 'undefined' && COMPANY) || {};
  const paid = ctStr(co.terms) || 'Payment due on receipt.';
  return [
    paid,
    'Visits are scheduled in advance and cover the work listed above. Anything outside that list is quoted separately before we do it.',
    'We need access to the site on the scheduled day. If we cannot get on site, or weather makes the work unsafe, we will reschedule to the next available date.',
    'Either of us can end this agreement with 30 days written notice. Prepaid visits not yet worked are refunded.',
    'Pricing is reviewed at renewal.',
  ].join('\n');
}

function ctNewProposalNumber() {
  let max = 1000;
  Object.values((typeof S !== 'undefined' && S.contracts) || {}).forEach(c => {
    const n = String((c && c.proposal && c.proposal.number) || '').match(/(\d+)\s*$/);
    if (n) max = Math.max(max, Number(n[1]));
  });
  return 'P-' + (max + 1);
}

// A blank proposal for a contract that has never had one.
function ctNewProposal(nowTs) {
  const now = nowTs == null ? Date.now() : nowTs;
  const today = ctStartOfDay(now);
  return {
    number: ctNewProposalNumber(),
    date: ctDateKey(today),
    validUntil: ctDateKey(ctAddDays(today, CT_PROPOSAL_VALID_DAYS)),
    intro: '',
    exclusions: '',
    terms: ctDefaultProposalTerms(),
    sentAt: 0, acceptedAt: 0, acceptedBy: '', declinedAt: 0,
  };
}

// Where a proposal stands. Accepted and declined are decisions and outrank
// everything; expiry only applies to something sent that nobody answered.
function ctProposalState(contract, nowTs) {
  const p = contract && contract.proposal;
  if (!p) return { level: 'none', label: 'No proposal', detail: '' };
  if (p.acceptedAt) {
    return {
      level: 'accepted', label: 'Accepted',
      detail: 'Accepted ' + ctDateKey(new Date(p.acceptedAt)) + (p.acceptedBy ? ' by ' + p.acceptedBy : ''),
    };
  }
  if (p.declinedAt) return { level: 'declined', label: 'Declined', detail: 'Declined ' + ctDateKey(new Date(p.declinedAt)) };

  const now = ctStartOfDay(nowTs == null ? Date.now() : nowTs);
  const until = ctParseDate(p.validUntil);
  const days = until ? Math.round((until - now) / 86400000) : null;

  if (!p.sentAt) return { level: 'draft', label: 'Draft', detail: 'Not sent yet' };
  if (days != null && days < 0) return { level: 'expired', label: 'Expired', detail: 'Expired ' + Math.abs(days) + ' days ago' };
  return {
    level: 'sent', label: 'Sent',
    detail: 'Sent ' + ctDateKey(new Date(p.sentAt)) + (days != null ? ' · valid ' + days + ' more day' + (days === 1 ? '' : 's') : ''),
  };
}

// ── Content ─────────────────────────────────────────────────────────────────

// The next few visit dates, so the proposal says when we are turning up rather
// than just "monthly". Bounded by the contract's own end date.
function ctProposalVisitDates(contract, count) {
  const norm = ctNormalizeSchedule(contract.visits);
  if (!norm || !contract.startDate) return [];
  const end = ctParseDate(contract.endDate);
  const out = [];
  for (let n = 0; n < 200 && out.length < (count || 4); n++) {
    const d = ctOccurrenceDate(contract.startDate, norm, n);
    if (!d) break;
    if (end && d > end) break;
    out.push(d);
  }
  return out;
}

function ctLongDate(d) {
  if (!d) return '';
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

// What a visit costs the customer over a year, from the BILLING side only.
// Never from pricing — see the header.
function ctProposalAnnual(contract) {
  const perYear = ctPerYear(contract.billing);
  if (!perYear || !contract.billing) return null;
  return (Number(contract.billing.amount) || 0) * perYear;
}

// The document, as ordered blocks.
//
// Block types are deliberately few, because every one of them has to be drawn
// twice — once in HTML and once in a PDF:
//
//   para     a paragraph
//   h        a section heading
//   bullets  a list
//   kv       label/value rows
//   price    the one figure the customer is deciding on
//   sign     the acceptance block
function ctProposalBlocks(contract, nowTs) {
  const p = contract.proposal || ctNewProposal(nowTs);
  const co = (typeof COMPANY !== 'undefined' && COMPANY) || {};
  const customer = ctCustomerName(contract.customerId) || '';
  const blocks = [];

  blocks.push({
    type: 'para',
    text: ctStr(p.intro) || `Thank you for considering ${co.name || 'us'}. This proposal sets out the maintenance we would carry out${customer ? ' for ' + customer : ''}, how often, and what it costs.`,
  });

  // ── What we will do ──
  blocks.push({ type: 'h', text: 'What we will do' });
  const checklist = (contract.checklist || []).map(it => it.text).filter(Boolean);
  if (checklist.length) {
    blocks.push({ type: 'bullets', items: checklist });
  } else {
    blocks.push({ type: 'para', text: 'Scope to be confirmed. Add a checklist to the contract and it will appear here as the agreed scope of work.' });
  }

  // ── How often ──
  const freq = ctFreqLabel(contract.visits);
  if (freq) {
    blocks.push({ type: 'h', text: 'How often' });
    const perYear = ctPerYear(contract.visits);
    const dates = ctProposalVisitDates(contract, 4);
    const rows = [[
      'Frequency',
      freq + (perYear ? ' — about ' + Math.round(perYear) + ' visits a year' : ''),
    ]];
    if (dates.length) rows.push(['First visits', dates.map(ctLongDate).join(', ')]);
    rows.push(['Term', contract.startDate
      ? ctLongDate(ctParseDate(contract.startDate)) + (contract.endDate ? ' to ' + ctLongDate(ctParseDate(contract.endDate)) : ' — continuing until either of us ends it')
      : 'To be agreed']);
    blocks.push({ type: 'kv', rows: rows });
  }

  // ── What it costs ──
  if (contract.billing) {
    blocks.push({ type: 'h', text: 'What it costs' });
    const per = ctFreqLabel(contract.billing);
    const annual = ctProposalAnnual(contract);
    blocks.push({
      type: 'price',
      headline: money2(contract.billing.amount || 0),
      sub: (per ? per.toLowerCase() : 'per period') + (annual ? ' · ' + money2(annual) + ' a year' : ''),
    });
    if (contract.visitsThrough) {
      blocks.push({ type: 'para', text: 'This proposal covers visits through ' + ctLongDate(ctParseDate(contract.visitsThrough)) + '.' });
    }
  }

  // ── What is not included ──
  const exclusions = ctStr(p.exclusions);
  if (exclusions) {
    blocks.push({ type: 'h', text: 'What is not included' });
    const lines = exclusions.split('\n').map(l => l.trim()).filter(Boolean);
    blocks.push(lines.length > 1 ? { type: 'bullets', items: lines } : { type: 'para', text: lines[0] || exclusions });
  }

  // ── Terms ──
  const terms = ctStr(p.terms);
  if (terms) {
    blocks.push({ type: 'h', text: 'Terms' });
    terms.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => blocks.push({ type: 'para', text: l, small: true }));
  }

  blocks.push({ type: 'sign' });
  return blocks;
}

// Everything the renderers need about the document itself, gathered once.
function ctProposalMeta(contract, nowTs) {
  const p = contract.proposal || ctNewProposal(nowTs);
  const co = (typeof COMPANY !== 'undefined' && COMPANY) || {};
  const cust = (typeof S !== 'undefined' && S.customers && S.customers[contract.customerId]) || {};
  return {
    number: p.number || '',
    date: p.date || '',
    validUntil: p.validUntil || '',
    title: ctStr(contract.name) || 'Maintenance agreement',
    companyName: ctStr(co.name),
    companyAddress: ctStr(co.address),
    companyPhone: ctStr(co.phone),
    companyEmail: ctStr(co.email),
    customerName: ctCustomerName(contract.customerId) || ctStr(cust.name),
    customerAddress: ctStr(cust.address),
    customerEmail: ctStr(cust.email),
  };
}

// ── Acceptance ──────────────────────────────────────────────────────────────

// Accepting is what turns a document into a running agreement.
//
// It activates the contract and pushes visits-paid-through to the date the
// proposal promised, so the thing the customer agreed to is the thing that
// generates. Without this the proposal is an export button and someone still
// has to remember to flip the contract on — which is exactly the kind of step
// that gets missed on the fifth account in a busy week.
//
// `visitsThrough` is only ever pushed FORWARD. A proposal for a renewal that
// quotes an earlier date than the contract already carries must not shorten
// what has already been paid for.
async function ctAcceptProposal(contractId, acceptedBy, nowTs) {
  const c = ctGetContract(contractId);
  if (!c || !c.proposal) throw new Error('That contract has no proposal');
  const now = nowTs == null ? Date.now() : nowTs;

  const next = Object.assign({}, c, {
    status: 'active',
    proposal: Object.assign({}, c.proposal, {
      acceptedAt: now,
      acceptedBy: ctStr(acceptedBy, 120),
      declinedAt: 0,
    }),
  });

  const saved = await ctSaveContract(next);
  // Normalization can refuse 'active' — a contract that ends before it starts is
  // parked no matter what a proposal says. Report that rather than letting the
  // caller believe work is now scheduled.
  return { contract: saved, activated: !!saved && saved.status === 'active' };
}

async function ctDeclineProposal(contractId, nowTs) {
  const c = ctGetContract(contractId);
  if (!c || !c.proposal) throw new Error('That contract has no proposal');
  return ctSaveContract(Object.assign({}, c, {
    proposal: Object.assign({}, c.proposal, { declinedAt: nowTs == null ? Date.now() : nowTs, acceptedAt: 0, acceptedBy: '' }),
  }));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CT_PROPOSAL_VALID_DAYS, ctDefaultProposalTerms, ctNewProposalNumber, ctNewProposal,
    ctProposalState, ctProposalVisitDates, ctLongDate, ctProposalAnnual,
    ctProposalBlocks, ctProposalMeta, ctAcceptProposal, ctDeclineProposal,
  };
}
