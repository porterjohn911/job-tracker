// Recurring contracts — the proposal, as a document.
//
// Two renderers over the block list built in 13-proposal.js: an HTML body for
// the email, and a PDF for the attachment. Neither invents content — if a
// section is not in the blocks it is not in either output, so the attachment
// and the email can never say different things.
//
// The PDF follows the same shape as the invoice one (letter, a white card on a
// pale ground, the brand band across the top) and reuses its helpers — the
// lib loader, the colour conversion, the image embedding — so a proposal looks
// like it came from the same company as the invoices. What it does not reuse is
// the invoice's layout code, which is built around line-item rows and totals; a
// proposal is prose, headings and lists.
//
// Page packing is the same discipline that fixed the invoice overprint bug:
// nothing is drawn until every block has been measured, and the wrapped line
// arrays produced by measuring are the ones drawn, so the two cannot drift.
//
// Requires 13-proposal.js.

// ── HTML ────────────────────────────────────────────────────────────────────

function ctPropBlockHTML(b) {
  switch (b.type) {
    case 'h':
      return `<div style="font-size:12px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#7aa898;margin:22px 0 8px">${esc(b.text)}</div>`;
    case 'para':
      return `<p style="margin:0 0 10px;font-size:${b.small ? '12.5' : '14'}px;line-height:1.6;color:${b.small ? '#3d6358' : '#0a1f18'}">${esc(b.text)}</p>`;
    case 'bullets':
      return `<ul style="margin:0 0 10px;padding-left:20px">${b.items.map(i => `<li style="font-size:14px;line-height:1.6;color:#0a1f18;margin-bottom:4px">${esc(i)}</li>`).join('')}</ul>`;
    case 'kv':
      return `<table style="width:100%;border-collapse:collapse;margin:0 0 10px">${b.rows.map(([k, v]) => `<tr>
        <td style="padding:7px 10px 7px 0;font-size:13px;color:#3d6358;vertical-align:top;white-space:nowrap;border-bottom:1px solid #eef3f1">${esc(k)}</td>
        <td style="padding:7px 0;font-size:13px;color:#0a1f18;font-weight:600;border-bottom:1px solid #eef3f1">${esc(v)}</td>
      </tr>`).join('')}</table>`;
    case 'price':
      return `<div style="background:#e6f7f1;color:#0a3d2e;padding:16px 18px;border-radius:10px;margin:12px 0;text-align:center">
        <div style="font-size:26px;font-weight:800;font-variant-numeric:tabular-nums">${esc(b.headline)}</div>
        <div style="font-size:12.5px;margin-top:3px;opacity:0.85">${esc(b.sub)}</div>
      </div>`;
    case 'sign':
      return `<div style="border-top:1px solid #eef3f1;margin-top:22px;padding-top:14px">
        <p style="margin:0;font-size:13px;line-height:1.6;color:#3d6358">To accept, reply to this email with <strong>Accepted</strong> and we will get you on the schedule. If anything here should be different, tell us and we will revise it.</p>
      </div>`;
    default:
      return '';
  }
}

function ctProposalHTML(contract, nowTs) {
  const blocks = ctProposalBlocks(contract, nowTs);
  const m = ctProposalMeta(contract, nowTs);
  const P = typeof invTheme === 'function' ? invTheme() : { band: '#0f5040' };
  const INK = typeof bandInk === 'function' ? bandInk(P.band) : '#ffffff';
  const logo = typeof brandLogoFull === 'function' ? brandLogoFull() : '';

  return `<div style="background:#f0faf6;padding:22px 0;font-family:'DM Sans',system-ui,-apple-system,Segoe UI,sans-serif">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">
      <div style="background:${esc(P.band)};color:${esc(INK)};padding:20px 24px">
        ${logo ? `<img src="${esc(logo)}" alt="${esc(m.companyName)}" style="max-height:44px;max-width:220px;display:block;margin-bottom:10px">` : ''}
        <div style="font-size:11px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;opacity:0.85">Proposal ${esc(m.number)}</div>
        <div style="font-size:20px;font-weight:800;margin-top:2px">${esc(m.title)}</div>
      </div>
      <div style="padding:22px 24px">
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
          <tr>
            <td style="font-size:12.5px;color:#3d6358;vertical-align:top">
              <div style="font-weight:700;color:#0a1f18">${esc(m.customerName || 'Prepared for you')}</div>
              ${m.customerAddress ? `<div>${esc(m.customerAddress)}</div>` : ''}
            </td>
            <td style="font-size:12.5px;color:#3d6358;text-align:right;vertical-align:top">
              <div>${esc(m.date)}</div>
              ${m.validUntil ? `<div>Valid until ${esc(m.validUntil)}</div>` : ''}
            </td>
          </tr>
        </table>
        ${blocks.map(ctPropBlockHTML).join('')}
      </div>
      <div style="background:#f7f9f8;padding:14px 24px;font-size:11.5px;color:#7aa898;text-align:center">
        ${esc(m.companyName)}${m.companyAddress ? ' · ' + esc(m.companyAddress) : ''}${m.companyPhone ? ' · ' + esc(m.companyPhone) : ''}
      </div>
    </div>
  </div>`;
}

// The plain-text alternative. Every mail client that refuses HTML still gets
// the whole agreement, not a "view this in a browser" stub.
function ctProposalText(contract, nowTs) {
  const blocks = ctProposalBlocks(contract, nowTs);
  const m = ctProposalMeta(contract, nowTs);
  const out = [`${m.companyName} — Proposal ${m.number}`, m.title, ''];
  if (m.customerName) out.push('For: ' + m.customerName);
  out.push('Date: ' + m.date + (m.validUntil ? '   Valid until: ' + m.validUntil : ''), '');

  blocks.forEach(b => {
    if (b.type === 'h') out.push('', b.text.toUpperCase(), '');
    else if (b.type === 'para') out.push(b.text, '');
    else if (b.type === 'bullets') { b.items.forEach(i => out.push('  - ' + i)); out.push(''); }
    else if (b.type === 'kv') { b.rows.forEach(([k, v]) => out.push('  ' + k + ': ' + v)); out.push(''); }
    else if (b.type === 'price') out.push('  ' + b.headline + ' ' + b.sub, '');
    else if (b.type === 'sign') out.push('', 'To accept, reply to this email with "Accepted".');
  });
  out.push('', m.companyName, [m.companyAddress, m.companyPhone, m.companyEmail].filter(Boolean).join(' · '));
  return out.join('\n');
}

// ── PDF ─────────────────────────────────────────────────────────────────────

const CT_PDF = {
  cardX: 72, cardY: 36, cardW: 468, innerX: 96, innerW: 420,
  bandH: 104, footGap: 30,
};

// Measure every block, then pack, then draw. A block is never split across a
// page except a bullet list or a run of paragraph lines, which carry their own
// line arrays and can be broken between lines safely.
function ctMeasureProposal(pdf, blocks) {
  const W = CT_PDF.innerW;
  return blocks.map(b => {
    if (b.type === 'h') return { b, h: 26, lines: [] };
    if (b.type === 'para') {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(b.small ? 9 : 10.5);
      const lines = pdf.splitTextToSize(String(b.text || ''), W);
      return { b, lines, lh: b.small ? 12 : 14, h: lines.length * (b.small ? 12 : 14) + 8 };
    }
    if (b.type === 'bullets') {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10.5);
      const items = b.items.map(t => pdf.splitTextToSize(String(t || ''), W - 14));
      return { b, items, lh: 14, h: items.reduce((s, l) => s + l.length * 14 + 4, 0) + 8 };
    }
    if (b.type === 'kv') {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
      const rows = b.rows.map(([k, v]) => ({ k, lines: pdf.splitTextToSize(String(v || ''), W - 118) }));
      return { b, rows, lh: 13, h: rows.reduce((s, r) => s + Math.max(r.lines.length * 13, 15) + 9, 0) + 6 };
    }
    if (b.type === 'price') return { b, h: 66 };
    if (b.type === 'sign') return { b, h: 96 };
    return { b, h: 0 };
  });
}

async function ctBuildProposalPDF(contract, nowTs) {
  const { jsPDF } = await loadPDFLibs();
  const blocks = ctProposalBlocks(contract, nowTs);
  const m = ctProposalMeta(contract, nowTs);
  const P = typeof invTheme === 'function' ? invTheme() : { band: '#0f5040', primary: '#0f5040' };

  const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait', compress: true });
  const pageW = pdf.internal.pageSize.getWidth(), pageH = pdf.internal.pageSize.getHeight();
  const band = _hex2rgb(P.band), primary = _hex2rgb(P.primary);
  const dark = [10, 31, 24], mid = [61, 99, 88], muted = [122, 168, 152];
  const paper = [240, 250, 246], white = [255, 255, 255], rule = [238, 243, 241], tint = [230, 247, 241];
  const setColor = c => pdf.setTextColor(c[0], c[1], c[2]);
  const fill = c => pdf.setFillColor(c[0], c[1], c[2]);
  const stroke = c => pdf.setDrawColor(c[0], c[1], c[2]);

  const L = CT_PDF;
  const measured = ctMeasureProposal(pdf, blocks);
  const maxY = pageH - L.footGap - 24;
  const firstTop = L.cardY + L.bandH + 74;
  const contTop = L.cardY + 34;

  // Pack: a block that will not fit starts a new page. Lists and paragraphs are
  // allowed to break between their own lines so a long scope does not leave
  // half a page empty.
  const pages = [];
  let cur = { top: firstTop, items: [] }, y = firstTop;
  measured.forEach(mm => {
    const breakable = mm.b.type === 'para' || mm.b.type === 'bullets';
    if (y + mm.h > maxY && cur.items.length) {
      if (!breakable || y + (mm.lh || 14) * 2 > maxY) {
        cur.end = y;
        pages.push(cur);
        cur = { top: contTop, items: [] };
        y = contTop;
      }
    }
    cur.items.push(mm);
    y += mm.h;
  });
  cur.end = y;
  pages.push(cur);

  const logo = await _pdfImageData(typeof brandLogoFull === 'function' ? brandLogoFull() : '');

  pages.forEach((pg, idx) => {
    if (idx) pdf.addPage();
    // The card fits its content rather than always running to the foot of the
    // page. A signature block alone on a full-height card reads as a printing
    // mistake; page one keeps a floor so a short proposal still fills the sheet.
    const cardBottom = Math.min(pageH - L.footGap, Math.max(idx === 0 ? 660 : 210, (pg.end || 0) + 30));
    const footY = Math.min(cardBottom + 22, pageH - 14);
    fill(paper); pdf.rect(0, 0, pageW, pageH, 'F');
    fill(white); pdf.roundedRect(L.cardX, L.cardY, L.cardW, cardBottom - L.cardY, 9, 9, 'F');

    if (idx === 0) {
      fill(band);
      pdf.roundedRect(L.cardX, L.cardY, L.cardW, L.bandH, 9, 9, 'F');
      pdf.rect(L.cardX, L.cardY + L.bandH - 18, L.cardW, 18, 'F');
      const ink = (typeof bandInk === 'function' ? bandInk(P.band) : '#ffffff') === '#0a1f18' ? dark : white;
      if (logo) {
        const h = Math.min(34, logo.h), w = logo.w * (h / logo.h);
        try { pdf.addImage(logo.du, logo.fmt, L.innerX, L.cardY + 16, Math.min(w, 190), h); } catch (e) {}
      }
      setColor(ink);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
      pdf.text('PROPOSAL ' + (m.number || ''), L.innerX, L.cardY + (logo ? 66 : 40));
      pdf.setFontSize(17);
      pdf.text(pdf.splitTextToSize(m.title, L.innerW)[0], L.innerX, L.cardY + (logo ? 86 : 62));

      // Who it is for, and how long it stands.
      let hy = L.cardY + L.bandH + 26;
      setColor(dark); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11);
      pdf.text(m.customerName || 'Prepared for you', L.innerX, hy);
      setColor(mid); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5);
      if (m.customerAddress) pdf.text(pdf.splitTextToSize(m.customerAddress, 240)[0], L.innerX, hy + 13);
      const right = L.innerX + L.innerW;
      pdf.text(m.date || '', right, hy, { align: 'right' });
      if (m.validUntil) pdf.text('Valid until ' + m.validUntil, right, hy + 13, { align: 'right' });
      stroke(rule); pdf.setLineWidth(1);
      pdf.line(L.innerX, hy + 28, right, hy + 28);
    }

    let y2 = pg.top;
    pg.items.forEach(mm => {
      const b = mm.b;
      if (b.type === 'h') {
        setColor(muted); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5);
        pdf.text(String(b.text).toUpperCase(), L.innerX, y2 + 14);
        y2 += mm.h;
      } else if (b.type === 'para') {
        setColor(b.small ? mid : dark);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(b.small ? 9 : 10.5);
        mm.lines.forEach((ln, i) => pdf.text(ln, L.innerX, y2 + 10 + i * mm.lh));
        y2 += mm.h;
      } else if (b.type === 'bullets') {
        setColor(dark); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10.5);
        mm.items.forEach(lines => {
          fill(primary); pdf.circle(L.innerX + 3, y2 + 7, 1.8, 'F');
          lines.forEach((ln, i) => pdf.text(ln, L.innerX + 14, y2 + 10 + i * mm.lh));
          y2 += lines.length * mm.lh + 4;
        });
        y2 += 8;
      } else if (b.type === 'kv') {
        mm.rows.forEach(r => {
          const rowH = Math.max(r.lines.length * 13, 15);
          setColor(mid); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5);
          pdf.text(r.k, L.innerX, y2 + 10);
          setColor(dark); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
          r.lines.forEach((ln, i) => pdf.text(ln, L.innerX + 110, y2 + 10 + i * 13));
          stroke(rule); pdf.line(L.innerX, y2 + rowH + 5, L.innerX + L.innerW, y2 + rowH + 5);
          y2 += rowH + 9;
        });
        y2 += 6;
      } else if (b.type === 'price') {
        fill(tint); pdf.roundedRect(L.innerX, y2, L.innerW, 54, 8, 8, 'F');
        setColor([10, 61, 46]);
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(21);
        pdf.text(b.headline, L.innerX + L.innerW / 2, y2 + 26, { align: 'center' });
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5);
        pdf.text(b.sub, L.innerX + L.innerW / 2, y2 + 42, { align: 'center' });
        y2 += mm.h;
      } else if (b.type === 'sign') {
        stroke(rule); pdf.line(L.innerX, y2 + 6, L.innerX + L.innerW, y2 + 6);
        setColor(mid); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5);
        pdf.text('Accepted by', L.innerX, y2 + 26);
        pdf.text('Date', L.innerX + 250, y2 + 26);
        stroke([200, 214, 208]); pdf.setLineWidth(0.8);
        pdf.line(L.innerX, y2 + 56, L.innerX + 230, y2 + 56);
        pdf.line(L.innerX + 250, y2 + 56, L.innerX + L.innerW, y2 + 56);
        setColor(muted); pdf.setFontSize(8.5);
        pdf.text('Signature', L.innerX, y2 + 68);
        y2 += mm.h;
      }
    });

    setColor(muted); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
    const foot = [m.companyName, m.companyAddress, m.companyPhone, m.companyEmail].filter(Boolean).join('  ·  ');
    pdf.text(foot, pageW / 2, footY, { align: 'center' });
    if (pages.length > 1) pdf.text((idx + 1) + ' of ' + pages.length, pageW - 40, footY, { align: 'right' });
  });

  const blob = pdf.output('blob');
  return new File([blob], 'Proposal-' + (m.number || 'draft') + '.pdf', { type: 'application/pdf' });
}

// ── Sending ─────────────────────────────────────────────────────────────────

// Same rule as the bill run: only the channels that really deliver, and throw
// on failure. A proposal that silently did not send is a customer waiting for a
// quote that never arrives.
async function ctSendProposal(contractId, nowTs) {
  const c = ctGetContract(contractId);
  if (!c) throw new Error('That contract no longer exists');
  if (!c.proposal) throw new Error('Draft the proposal first');
  const m = ctProposalMeta(c, nowTs);
  if (!m.customerEmail) throw new Error('No email address on file for this customer');

  const channel = ctBillChannel();
  if (!channel) throw new Error('Sign in with your team account, or connect Gmail, to send');

  const subject = 'Proposal ' + (m.number || '') + ' from ' + (m.companyName || '');
  const html = ctProposalHTML(c, nowTs);
  const text = ctProposalText(c, nowTs);
  const file = await ctBuildProposalPDF(c, nowTs);

  if (channel === 'gmail') {
    const send = window.gmailApiSend || gmailApiSend;
    await send({ to: m.customerEmail, subject, htmlBody: html, textBody: text, fromName: m.companyName, attachments: [file] });
  } else {
    await smtpInvoiceSend({ to: m.customerEmail, subject, text, html, file, fromName: m.companyName, replyTo: m.companyEmail || '' });
  }

  // Stamped only after the send resolves, so a failure leaves it a draft.
  await ctSaveContract(Object.assign({}, c, {
    proposal: Object.assign({}, c.proposal, { sentAt: nowTs == null ? Date.now() : nowTs }),
  }));
  if (typeof logAct === 'function') {
    try { await logAct('emailed proposal ' + (m.number || '') + ' to ' + m.customerEmail + ' for', c.name); } catch (e) {}
  }
  return { to: m.customerEmail, number: m.number };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ctPropBlockHTML, ctProposalHTML, ctProposalText,
    ctMeasureProposal, ctBuildProposalPDF, ctSendProposal,
  };
}
