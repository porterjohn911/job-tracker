// Managed entities — the view.
//
// The roster and one entity's page. Read-only, like every other render in this
// app: it returns an HTML string and the editor owns every write.
//
// Requires 02-entity-fees.js.

function meStatusStyle(status) {
  return {
    active: 'background:var(--green-700);color:#fff',
    paused: 'background:var(--surface-2, #e8e8e8);color:var(--text-2)',
    ended: 'background:transparent;color:var(--text-3);border:1px solid var(--border)',
  }[status] || 'background:var(--surface-2, #e8e8e8);color:var(--text-2)';
}

function meStatusLabel(status) {
  return { active: 'Active', paused: 'Paused', ended: 'Ended' }[status] || status;
}

const ME_BASIS_LABEL = {
  flat: 'Flat fee', percent: 'Percentage', costplus: 'Cost-plus', hourly: 'Hourly',
};

// What is still missing, in one sentence. Written as a sentence rather than a
// list of field names because the reason a fee cannot be computed is usually
// structural — "cross-company revenue is not live yet" is not something anyone
// fixes by filling in a box, and pretending otherwise wastes their time.
function meNeedsLine(fee) {
  if (!fee.needs.length) return '';
  const bits = fee.needs.slice();
  const last = bits.pop();
  return 'Needs ' + (bits.length ? bits.join(', ') + ' and ' + last : last) + '.';
}

function meEntityCard(row) {
  const e = row.entity, f = row.fee;
  const link = meLinkedLabel(e.companyId);
  const broken = meLinkBroken(e);
  const issues = meIssues(e);

  return `<div class="section" data-me="${esc(e.id)}" style="cursor:pointer;margin-bottom:0;padding:12px 14px">
    <div style="display:flex;align-items:flex-start;gap:10px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.name || 'Untitled entity')}</div>
        <div style="font-size:12px;color:var(--text-3);margin-top:2px">
          ${broken
            ? `<span style="color:var(--orange)">Linked to a company that no longer exists</span>`
            : (link ? esc(link) + ' · in this app' : 'Standalone')}
          · ${esc(ME_BASIS_LABEL[f.basis] || f.basis)}
        </div>
        <div style="font-size:12px;color:var(--text-2);margin-top:3px">${esc(f.label)}</div>
        ${issues.length
          ? `<div style="font-size:12px;color:var(--orange);margin-top:4px">⚠ ${esc(issues[0])}${issues.length > 1 ? ` <span style="color:var(--text-3)">+${issues.length - 1} more</span>` : ''}</div>`
          : ''}
      </div>
      <div style="text-align:right;flex-shrink:0">
        ${f.monthly != null
          ? `<div style="font-size:14px;font-weight:700">${money2(f.monthly)}</div>
             <div style="font-size:10.5px;color:var(--text-3)">a month</div>`
          : `<div style="font-size:11px;color:var(--text-3);max-width:104px;line-height:1.4">not yet computable</div>`}
        <span class="status-pill" style="${meStatusStyle(e.status)};margin-top:5px;display:inline-block">${meStatusLabel(e.status)}</span>
      </div>
    </div>
  </div>`;
}

// ── One entity ──────────────────────────────────────────────────────────────

function meDetail(entityId, nowTs) {
  const e = meGet(entityId);
  if (!e) return `<div class="tt-empty" style="padding:40px 16px"><p style="font-size:14px;color:var(--text-2)">That entity no longer exists.</p></div>`;
  const f = meFee(e, nowTs);
  const link = meLinkedLabel(e.companyId);
  const rev = meLinkedRevenue(e);
  const issues = meIssues(e);

  const contact = [e.contactName, e.contactEmail, e.contactPhone].filter(Boolean).join(' · ');
  const term = e.startDate
    ? esc(e.startDate) + (e.endDate ? ' to ' + esc(e.endDate) : ' — no end date')
    : 'No start date set';

  return `
    <div style="margin-bottom:12px">
      <button data-me-back style="background:none;border:none;padding:0;font-size:12.5px;color:var(--text-3);cursor:pointer">← All entities</button>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;font-weight:700">Managed entity</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">${esc(e.name || 'Untitled entity')}</div>
        <div style="font-size:12.5px;color:var(--text-3);margin-top:3px">${link ? esc(link) + ' · in this app' : 'Standalone — books held elsewhere'}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
        <span class="status-pill" style="${meStatusStyle(e.status)}">${meStatusLabel(e.status)}</span>
        <button class="btn-add" id="btn-me-edit">Edit</button>
      </div>
    </div>

    ${issues.length ? `<div style="background:rgba(234,140,20,0.10);border:1px solid var(--orange);border-radius:8px;padding:9px 11px;margin-bottom:14px">
      <div style="font-size:12px;font-weight:700;color:var(--orange);margin-bottom:3px">This entity will not do what you expect</div>
      <ul style="margin:0;padding-left:16px;font-size:12px;color:var(--text-2);line-height:1.55">
        ${issues.map(i => `<li>${esc(i)}</li>`).join('')}
      </ul>
    </div>` : ''}

    <div class="kpi-grid">
      <div class="kpi-card accent">
        <div class="kpi-label">Management fee</div>
        <div class="kpi-value">${f.monthly != null ? money2(f.monthly) : '—'}</div>
        <div class="kpi-sub">${f.monthly != null ? 'a month · ' + money2(f.annual) + ' a year' : esc(ME_BASIS_LABEL[f.basis] || f.basis) + ', not yet computable'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Basis</div>
        <div class="kpi-value" style="font-size:17px">${esc(ME_BASIS_LABEL[f.basis] || f.basis)}</div>
        <div class="kpi-sub">${esc(f.label)}</div>
      </div>
    </div>

    ${f.needs.length ? `<div class="section">
      <div class="section-hd">Not yet computable <span>${esc(ME_BASIS_LABEL[f.basis] || f.basis)}</span></div>
      <div style="font-size:12.5px;color:var(--text-2);line-height:1.6">${esc(meNeedsLine(f))}</div>
      ${f.estimate != null
        ? `<div style="margin-top:11px;padding:10px 12px;border-radius:8px;background:var(--surface-2);border:1px dashed var(--border-md)">
            <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;font-weight:700">Rough figure only</div>
            <div style="font-size:19px;font-weight:800;margin-top:2px">${money2(f.estimate)}</div>
            <div style="font-size:11.5px;color:var(--text-3);line-height:1.5;margin-top:3px">${esc(f.estimateNote)} Do not bill from this.</div>
          </div>`
        : (f.estimateNote ? `<div style="font-size:11.5px;color:var(--text-3);line-height:1.5;margin-top:8px">${esc(f.estimateNote)}</div>` : '')}
    </div>` : ''}

    <div class="section">
      <div class="section-hd">Details</div>
      <div style="font-size:12.5px;color:var(--text-2);line-height:1.8">
        <div><span style="color:var(--text-3)">Term</span> · ${term}</div>
        ${contact ? `<div><span style="color:var(--text-3)">Contact</span> · ${esc(contact)}</div>` : ''}
        ${link ? `<div><span style="color:var(--text-3)">Company data</span> · ${rev.cached
            ? rev.jobs + ' job' + (rev.jobs === 1 ? '' : 's') + ' cached on this device'
            : 'not cached on this device'}</div>` : ''}
        ${e.notes ? `<div style="margin-top:6px;color:var(--text-2)">${esc(e.notes)}</div>` : ''}
      </div>
    </div>
  `;
}

// ── The roster ──────────────────────────────────────────────────────────────

function renderEntities(nowTs) {
  const now = nowTs == null ? Date.now() : nowTs;
  if (typeof S !== 'undefined' && S.meDetail) return meDetail(S.meDetail, now);

  const book = meBook(now);
  const q = ((typeof S !== 'undefined' && S.meSearch) || '').trim().toLowerCase();
  const rows = book.rows.filter(r => !q ||
    (r.entity.name + ' ' + meLinkedLabel(r.entity.companyId) + ' ' + (r.entity.notes || '')).toLowerCase().includes(q));

  const head = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;font-weight:700">Management</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">Entities</div>
      </div>
      <button class="btn-add" id="btn-me-add" aria-label="Add managed entity">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
        Add Entity
      </button>
    </div>`;

  if (!book.total) {
    return head + `<div class="section" style="text-align:center;padding:34px 20px">
      <p style="font-size:14px;color:var(--text-2);margin-bottom:4px">No managed entities yet.</p>
      <p style="font-size:12.5px;color:var(--text-3);line-height:1.6">A managed entity is a business this company runs — either one that already exists in this app, or one whose books are kept elsewhere. Each carries its own fee arrangement, and everything management does gets attached to them.</p>
    </div>`;
  }

  return head + `
    <div class="kpi-grid">
      <div class="kpi-card accent"><div class="kpi-label">Fees a month</div><div class="kpi-value">${money2(book.monthly)}</div><div class="kpi-sub">${book.billable.length} of ${book.activeCount} active entit${book.activeCount === 1 ? 'y' : 'ies'}</div></div>
      <div class="kpi-card"><div class="kpi-label">Not yet computable</div><div class="kpi-value" style="color:${book.pendingCount ? 'var(--orange)' : 'var(--green-700)'}">${book.pendingCount}</div><div class="kpi-sub">${book.pendingCount ? 'need data the app has not got' : 'every fee is known'}</div></div>
    </div>

    ${book.pendingCount ? `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:14px">
      <div style="font-size:12.5px;color:var(--text-2);line-height:1.55">The ${money2(book.monthly)} above counts only the ${book.billable.length} entit${book.billable.length === 1 ? 'y' : 'ies'} whose fee can be worked out from what the app holds. Percentage, cost-plus and hourly fees are stored but not computed yet — adding them in would make this a confident guess rather than a figure.</div>
    </div>` : ''}

    ${book.broken ? `<div style="background:rgba(224,92,26,0.10);border:1px solid var(--orange);border-radius:8px;padding:10px 12px;margin-bottom:14px">
      <div style="font-size:12.5px;font-weight:700;color:var(--orange);margin-bottom:2px">Broken link${book.broken === 1 ? '' : 's'}</div>
      <div style="font-size:12.5px;color:var(--text-2);line-height:1.5">${book.broken} entit${book.broken === 1 ? 'y is' : 'ies are'} linked to a company that is no longer in the switcher. Their fees will not compute until the link is fixed or cleared.</div>
    </div>` : ''}

    <div style="margin:6px 0 12px">
      <input class="form-input" id="me-search" value="${esc((typeof S !== 'undefined' && S.meSearch) || '')}" placeholder="Search entities…" style="width:100%">
    </div>

    ${rows.length === 0
      ? `<div class="section" style="text-align:center;padding:28px 20px"><p style="font-size:13px;color:var(--text-3)">No entities match that search.</p></div>`
      : `<div style="display:flex;flex-direction:column;gap:8px">${rows.map(meEntityCard).join('')}</div>`}
  `;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    meStatusStyle, meStatusLabel, ME_BASIS_LABEL, meNeedsLine,
    meEntityCard, meDetail, renderEntities,
  };
}
