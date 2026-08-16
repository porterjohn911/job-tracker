// Recurring contracts — folding the nav down to what a maintenance day needs.
//
// The nav is thirteen tabs at a 64px minimum, which is 909px of bar inside a
// 430px phone. Five fit; eight sit off-screen behind a horizontal scroll whose
// scrollbar is hidden in CSS, so nothing on screen says they are there. On a
// maintenance company that means Invoices, Bank, Referrals, Map, Reports,
// Activity, Team and Time are, in practice, undiscoverable — and the ordering
// is the project-work one, so Referrals (lead-source tracking for project
// sales) outranks screens used every morning.
//
// So for maintenance and management companies the bar keeps the five tabs that
// side actually lives in and folds the rest behind More. Nothing is removed:
// everything in the sheet is still one tap away, and since the command palette
// learned about contracts it is also reachable by typing.
//
// ── Why this is gated ───────────────────────────────────────────────────────
//
// A project company keeps its thirteen-tab bar exactly as it is. It has a
// different set of screens it lives in and its own habits around them, and
// re-ordering someone's navigation is not a change to make on their behalf
// while they are working. ctApplyNavOverflow() returns immediately unless
// ctEnabled() — the same gate the Contracts tab itself uses.
//
// Requires 00-contract-gate.js.

// What a maintenance day is actually made of, in the order it is used. Home is
// the route and the money, Contracts is where the book lives, Schedule is the
// month, Jobs is the one-off repair booked between two dock visits.
//
// Customers is deliberately NOT here, and it was at first — six tabs measured
// 435px against a 430px bar, so the fold left a five-pixel scroll and achieved
// nothing. Of the six it is the one reached least often on its own: on a
// maintenance day you arrive at a customer through their contract, which names
// them, or by typing. It is one tap away in the sheet.
const CT_NAV_PRIMARY = ['dashboard', 'contracts', 'schedule', 'jobs'];

// A management company's day starts on its entities, not on a crew's route, so
// Entities takes the place Jobs holds for maintenance. Kept as its own list
// rather than a splice so each type's bar can be read at a glance.
const ME_NAV_PRIMARY = ['dashboard', 'entities', 'contracts', 'schedule'];

function ctNavPrimary() {
  return (typeof meCompanyManages === 'function' && meCompanyManages())
    ? ME_NAV_PRIMARY : CT_NAV_PRIMARY;
}

// Everything else, in the order it goes in the sheet. Read off the DOM rather
// than hardcoded, so a tab added to index.html later appears here on its own
// instead of vanishing.
function ctNavOverflowViews() {
  return [...document.querySelectorAll('.nav-btn[data-view]')]
    .map(b => b.dataset.view)
    .filter(v => ctNavPrimary().indexOf(v) < 0);
}

// The label already on the tab, so the sheet and the bar never disagree about
// what a view is called.
function ctNavLabel(view) {
  const btn = document.querySelector('.nav-btn[data-view="' + view + '"]');
  const txt = btn ? (btn.textContent || '').trim() : '';
  return txt || view;
}

function ctNavIcon(view) {
  const btn = document.querySelector('.nav-btn[data-view="' + view + '"] svg');
  return btn ? btn.outerHTML : '';
}

// Views the current user can actually open. A worker who cannot see Bank is
// not offered it in the sheet either — a sheet entry that only produces a toast
// saying no is worse than no entry.
//
// The test is the display the tab had BEFORE folding, not its display now:
// folding hides every overflow tab itself, so reading the live value would
// filter out the entire sheet — which is exactly what it did on the first
// attempt. `data-ct-prev` is stamped once, at the moment of hiding.
function ctNavSheetViews() {
  return ctNavOverflowViews().filter(v => {
    if (typeof canOpenView === 'function' && !canOpenView(v)) return false;
    const btn = document.querySelector('.nav-btn[data-view="' + v + '"]');
    if (!btn) return true;
    const prev = btn.dataset.ctPrev;
    return (prev === undefined ? btn.style.display : prev) !== 'none';
  });
}

function ctShowNavSheet() {
  const views = ctNavSheetViews();
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.innerHTML = `<div class="modal-bd" id="ct-nav-bd" role="dialog" aria-modal="true" aria-label="More"><div class="modal"><div class="modal-handle"></div>
    <div class="modal-head"><div class="modal-title">More</div><button class="modal-close" id="ct-nav-close" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      <div class="ct-nav-grid">
        ${views.map(v => `<button class="ct-nav-item${S.view === v ? ' active' : ''}" data-ct-nav="${esc(v)}">
          <span class="ct-nav-ico">${ctNavIcon(v)}</span>
          <span>${esc(ctNavLabel(v))}</span>
        </button>`).join('')}
      </div>
      <p class="ct-nav-hint">These are the screens a maintenance day does not usually start on. Everything here is also reachable from search.</p>
    </div>
  </div></div>`;

  const close = () => { root.innerHTML = ''; };
  document.getElementById('ct-nav-close').onclick = close;
  document.getElementById('ct-nav-bd').onclick = e => { if (e.target === e.currentTarget) close(); };
  root.querySelectorAll('[data-ct-nav]').forEach(b => {
    b.onclick = () => {
      const v = b.dataset.ctNav;
      close();
      if (typeof canOpenView === 'function' && !canOpenView(v)) return;
      S.view = v;
      S.detail = null;
      if (typeof render === 'function') render();
    };
  });
}

// Fold the bar. Idempotent: the More button is created once and then only ever
// updated, because the nav lives outside #content and survives every render.
function ctApplyNavOverflow() {
  if (typeof ctEnabled !== 'function' || !ctEnabled()) return;
  const nav = document.querySelector('.nav');
  if (!nav) return;
  // Lets the folded buttons shrink to share the bar instead of overflowing it,
  // so a longer label on some future tab cannot quietly bring the scroll back.
  nav.classList.add('ct-folded');

  // Stamp the display each tab had before folding, then hide it. The stamp is
  // what lets the sheet tell "hidden because it is folded" from "hidden because
  // this user may not open it", which are the same style once folding has run.
  ctNavOverflowViews().forEach(v => {
    const btn = nav.querySelector('.nav-btn[data-view="' + v + '"]');
    if (!btn) return;
    if (btn.dataset.ctPrev === undefined) btn.dataset.ctPrev = btn.style.display || '';
    btn.style.display = 'none';
  });

  let more = document.getElementById('ct-nav-more');
  if (!more) {
    more = document.createElement('button');
    more.id = 'ct-nav-more';
    more.className = 'nav-btn';
    more.type = 'button';
    more.setAttribute('aria-label', 'More views');
    more.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg><span>More</span>`;
    nav.appendChild(more);
  }
  // Reassigned on EVERY call, not just at creation. attachShellHandlers() binds
  // an onclick to every .nav-btn — including this one, which carries the class
  // to look like a tab — and would otherwise replace this handler on the next
  // render with one that reads an absent data-view and navigates to undefined.
  // It runs before this does, so assigning here wins.
  more.onclick = ctShowNavSheet;
  // render() toggles `.active` by data-view, which this button deliberately
  // does not have — so it is marked here instead, whenever the open view is one
  // it holds. Otherwise a nav bar with nothing lit says you are nowhere.
  more.classList.toggle('active', ctNavOverflowViews().indexOf(S.view) >= 0);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CT_NAV_PRIMARY, ME_NAV_PRIMARY, ctNavPrimary, ctNavOverflowViews, ctNavLabel, ctNavSheetViews,
    ctShowNavSheet, ctApplyNavOverflow,
  };
}
