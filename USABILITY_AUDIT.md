# Usability & Visual Audit

Automated audit of the job tracker UI, driven by Playwright + axe-core. It boots
the app fully offline (Firebase / Leaflet / fonts stubbed), walks all 12 nav
views on desktop and phone viewports, and records concrete usability/visual
faults.

## How to run

```bash
npm install
npx playwright install chromium   # once, to get the browser
npm run audit:ux
```

The suite always "passes" — it is a **reporting** harness, not a gate. It prints
a summary to the console and writes full detail (offending selectors, sizes,
node counts) to `test-results/usability-findings.json`.

- Test: `tests/usability-audit.spec.js`
- Offline stubs / view list: `tests/audit-stubs.js`

## What it checks

| # | Check | Standard |
|---|-------|----------|
| 1 | Viewport blocks pinch-zoom | WCAG 1.4.4 Resize Text |
| 2 | axe-core scan (contrast, ARIA, names, roles…) on every view | WCAG 2.0/2.1 A & AA |
| 3 | Interactive elements have an accessible name | WCAG 4.1.2 |
| 4 | Tap targets ≥ 40px on a 390px phone | WCAG 2.5.5 |
| 5 | No horizontal page overflow on a 360px phone | — |
| 6 | No duplicate DOM ids | — |
| 7 | No console/page errors while navigating | — |
| 8 | Form fields have programmatic labels (New Job modal) | WCAG 1.3.1 / 3.3.2 |
| 9 | Focus-indicator styling exists | WCAG 2.4.7 |

## Findings (latest run — 29 total: 3 high, 26 medium)

### High severity

1. **Pinch-zoom is disabled.** `index.html` viewport meta is
   `maximum-scale=1.0, user-scalable=no`. This stops users from zooming to read
   text — a direct WCAG 1.4.4 failure and a common complaint on phones.
   *Fix:* drop `maximum-scale`/`user-scalable=no` → `width=device-width, initial-scale=1`.

2. **Low color contrast (18 elements on the dashboard alone).** The worst
   offender is the sync-bar status text (`.sync-text`, white at **45% opacity**
   on dark green) — effectively unreadable. axe also flags the inactive nav
   button labels and other muted greys as below the 4.5:1 AA threshold.
   *Fix:* raise muted-text opacity/colors to hit 4.5:1 (3:1 for large text).

3. **Reports view has a scrollable region with no keyboard access.** The
   `#content` area becomes scrollable there but isn't focusable, so keyboard-only
   users can't scroll it (WCAG 2.1.1).
   *Fix:* add `tabindex="0"` (and a label) to the scroll container.

### Medium severity

4. **Tap targets under 40px, on every view.** The header icon buttons
   (command/search **36×36** and notifications **36×36**), the "Set name" and
   "Switch company" controls, and the per-view action buttons (New Job / New
   Invoice / Add Customer, all **~36px tall**), filter chips (**~28px**), and the
   calendar prev/next arrows (**34×34**) all fall below the 44–48px comfortable
   touch size. On a jobs-heavy phone screen 10 controls are undersized.
   *Fix:* bump min-height to 44px and pad icon buttons to ≥44×44.

5. **~10px horizontal overflow on a 360px phone.** The header row
   (`.header` padding + `.user-btn`) pushes the page to 370px wide, giving every
   screen a small sideways scroll/jiggle. *(Note: the nav bar's own horizontal
   scroll is intentional — `overflow-x:auto` — and is **not** counted here.)*
   *Fix:* let the brand text/user button shrink (`min-width:0`, smaller gap) at
   narrow widths.

6. **New Job modal: 15 fields have no programmatic label.** Text inputs rely on
   placeholder-only labels (which vanish on typing), and the selects
   (customer/stage/etc.) and date inputs have neither a `<label for>`, wrapping
   `<label>`, nor `aria-label` — screen readers announce them as unnamed.
   *Fix:* associate a `<label for>` or add `aria-label` to each field.

### Passed (no issues found)

- No empty/unnamed buttons or links.
- No duplicate DOM ids across any view.
- No console or page errors navigating all 12 views.
- Focus-indicator CSS rules are present.

> Severity is a rough triage aid, not a mandate. axe-core catches a broad class
> of automatable issues; it does **not** replace manual testing of flows, copy,
> or real assistive-tech use.
