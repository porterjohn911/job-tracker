// Shared invoice/estimate PDF builder (text/vector, US Letter). Extracted from
// send-invoice.js so the agent-facing direct-send endpoint produces the exact
// same PDF. Expects a `doc` shape:
//   { kind, number, date, dueDate, taxRate, paid, notes, terms,
//     items:[{desc,qty,rate}],
//     company:{name,address,phone,email,website,license},
//     customer:{name,address,phone,email},
//     project:{name,address} }

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function buildPdf(doc) {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([612, 792]);
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

  draw(co.name || 'Company', M, y, 18, bold);
  right(isEst ? 'ESTIMATE' : 'INVOICE', RIGHT, y, 22, bold);
  let ly = y - 16;
  [co.address, co.phone, co.email, co.website, co.license ? ('Lic. ' + co.license) : ''].filter(Boolean).forEach(l => { draw(l, M, ly, 9, font, gray); ly -= 12; });
  right('#' + (doc.number || ''), RIGHT, y - 16, 11, font, gray);
  right('Date: ' + (doc.date || ''), RIGHT, y - 30, 9, font, gray);
  if (doc.dueDate) right((isEst ? 'Valid until: ' : 'Due: ') + doc.dueDate, RIGHT, y - 42, 9, font, gray);
  y = Math.min(ly, y - 50) - 8;
  page.drawLine({ start: { x: M, y }, end: { x: RIGHT, y }, thickness: 1.5, color: dark }); y -= 20;

  draw(isEst ? 'PREPARED FOR' : 'BILL TO', M, y, 8, bold, gray);
  draw('PROJECT', 330, y, 8, bold, gray); y -= 14;
  let by = y; [cust.name, cust.address, cust.phone, cust.email].filter(Boolean).forEach(l => { draw(l, M, by, 10, font); by -= 13; });
  let py = y; [proj.name, proj.address].filter(Boolean).forEach(l => { draw(l, 330, py, 10, font); py -= 13; });
  y = Math.min(by, py) - 16;

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

module.exports = { money, buildPdf };
