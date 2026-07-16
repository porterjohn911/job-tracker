# Job Tracker

A browser-based job tracking app for construction/service work. It manages jobs, schedules, customers, photos, tasks, invoices, estimates, payments, referrals, bank imports, reports, maps, team access, and owner-level multi-company views.

The app is deployed as a static Netlify site. Most of the application runs directly in the browser. Firebase provides authentication, shared team data, and photo/file storage. A small Netlify function handles invoice and estimate email delivery.

## Current App Shape

This project used to be one very large `index.html` file. It has been split into smaller JavaScript modules under `src/app/`, while keeping backup files in the repo for safety.

### Current Source Of Truth

The production app is `index.html` plus the ordered runtime scripts it loads from `src/app/**`.

When changing app behavior, edit the focused files under nested folders such as `src/app/invoices/`, `src/app/views/`, `src/app/boot/`, `src/app/jobs/`, and `src/app/settings/`.

The older files below are rollback/reference material only and should not be reintroduced into `index.html`:

- `src/app.js`
- `src/app/04-invoices-email.js`
- `src/app/05-owner-reports-map-notifications.js`
- `src/app/07-modals-jobs-share.js`
- `src/app/08-invoice-editor-print.js`
- `src/app/09-settings-access-command-voice.js`
- `src/app/10-handlers-boot.js`

Run `npm run check` before pushing changes. It verifies that `index.html` loads the current modular runtime scripts, not the old generated source chunks.

Important entry files:

- `index.html` is the live production page Netlify serves.
- `index.legacy.html` is the old full-file backup kept for rollback/reference.
- `index.modular.html` is the modular test/reference page from the refactor.
- `waterfront-job-tracker-dev.html` is the dev sandbox page.
- `src/styles.css` contains the main app styling.
- `src/app.js` is the older monolithic app script kept as reference.
- `src/app/**/*.js` contains the current modular app code loaded by `index.html`.

## Deployment

Netlify serves the repository root directly.

- Publish directory: `.`
- Build command: no real build step, just a placeholder message
- Serverless functions directory: `netlify/functions`
- Unknown routes are redirected back to `index.html`

Because there is no build step, changes to HTML, CSS, and JavaScript files are deployed as-is after a PR is merged.

## Runtime Services

The app depends on these browser/service integrations:

- Firebase Auth for real user login.
- Firebase Realtime Database for shared job/company data.
- Firebase Storage for uploaded photos/files where supported.
- Leaflet for the map view.
- Netlify Functions for server-side invoice/estimate email sending.
- Google Workspace SMTP credentials in Netlify environment variables for outbound email.

Firebase config is loaded at runtime from Netlify environment variables through `netlify/functions/app-config.js` so deploy secret scanning does not flag committed source files.

Required Netlify environment variables:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_DB_URL`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_MEASUREMENT_ID`
- `SMTP_USER`
- `SMTP_PASS`

The Firebase web config values are public client configuration, but access protection still comes from Firebase Auth and Firebase Database/Storage rules.

## Data Model Overview

The app keeps data separated by company and environment.

- `ENV = 'prod'` uses live production data.
- `ENV = 'dev'` uses sandbox data.
- Company namespaces keep Waterfront Solutions, Manufactured Housing Solutions, and other companies separated.
- Local browser storage is still used as a local cache/fallback.
- Firebase is the shared team source when connected and authenticated.
- Company registry writes are owner-only, and Firebase rules validate company IDs, namespaces, labels, active flags, timestamps, and logo storage paths.

Core records include:

- Jobs
- Invoices
- Estimates
- Customers/job contacts
- Photos and attachments
- Tasks
- Documents
- Receipts
- Time entries
- Bank transactions
- Referrals/leads
- Team/user access records
- Company settings

## Module Loading Order

`index.html` loads plain browser scripts in a fixed order. These are not ES modules, so each file shares the same browser/global scope. Order matters.

Current script order:

1. `src/app/01-config-auth.js`
2. `src/app/02-state-utils-data.js`
3. `src/app/03-render-core.js`
4. `src/app/invoices/01-invoice-list.js`
5. `src/app/invoices/02-invoice-email-template.js`
6. `src/app/invoices/03-gmail-api.js`
7. `src/app/invoices/04-invoice-pdf-send.js`
8. `src/app/views/01-owner-dashboard.js`
9. `src/app/views/02-reports.js`
10. `src/app/views/03-map.js`
11. `src/app/views/04-notifications.js`
12. `src/app/views/05-jobs-detail-shell.js`
13. `src/app/views/06-detail-tabs-activity.js`
14. `src/app/06-referrals-time-bank.js`
15. `src/app/jobs/01-job-modal.js`
16. `src/app/modals/01-setup-modal.js`
17. `src/app/share/01-photo-helper.js`
18. `src/app/exports/01-csv-export.js`
19. `src/app/share/02-print-share.js`
20. `src/app/invoice-editor/01-defaults-open.js`
21. `src/app/invoice-editor/02-editor-modal.js`
22. `src/app/invoice-editor/03-print-renderer.js`
23. `src/app/settings/01-settings-modal.js`
24. `src/app/workspace/01-company-switcher.js`
25. `src/app/access/01-access-control.js`
26. `src/app/workspace/02-branding.js`
27. `src/app/command/01-command-palette.js`
28. `src/app/command/02-shortcuts-modal.js`
29. `src/app/voice/01-voice-dictation.js`
30. `src/app/keyboard/01-global-keyboard.js`
31. `src/app/boot/01-shell-events.js`
32. `src/app/boot/02-list-invoice-report-map-events.js`
33. `src/app/boot/03-calendar-detail-events.js`
34. `src/app/boot/04-job-asset-events.js`
35. `src/app/boot/05-financial-team-time-events.js`
36. `src/app/boot/06-attach-handlers.js`
37. `src/app/boot/07-boot.js`

When adding or moving code, be careful not to reference a function before the file that defines it has loaded.

## Folder Guide

`src/app/01-config-auth.js`
: Environment, company setup, Firebase config, authentication gate, role helpers, and company namespace setup.

`src/app/02-state-utils-data.js`
: Main app state, save/load helpers, Firebase sync, local storage fallback, formatting utilities, sorting/filtering helpers, and shared data functions.

`src/app/03-render-core.js`
: Main render routing and core page rendering logic.

`src/app/invoices/`
: Invoice/estimate list rendering, email templates, Gmail integration helpers, PDF creation, and sending logic.

`src/app/invoice-editor/`
: Invoice/estimate defaults, editor modal UI, line items, totals, print/PDF rendering, and editor-specific behavior.

`src/app/views/`
: Major screen views such as owner dashboard, reports, map, notifications, job details, and detail tabs/activity.

`src/app/jobs/`
: Job create/edit modal behavior and job form handling.

`src/app/boot/`
: Event wiring and startup. This is where many button clicks, form submits, delete/undo handlers, uploads, lists, map actions, reports actions, financial actions, team actions, and time-entry actions get connected after the page loads.

`src/app/share/`
: Photo handling, share helpers, print helpers, and export/share-related UI helpers.

`src/app/settings/`
: Company/app settings modal behavior.

`src/app/workspace/`
: Company switching and branding updates.

`src/app/access/`
: Team access and role-management UI helpers.

`src/app/command/`
: Command palette and keyboard shortcut modal.

`src/app/keyboard/`
: Global keyboard shortcuts.

`src/app/voice/`
: Voice dictation support.

`src/app/exports/`
: CSV export helpers.

`netlify/functions/send-invoice.js`
: Server-side email function for invoices/estimates. It uses dependencies from `package.json` and environment variables configured in Netlify.

`database.rules.json` and `storage.rules`
: Firebase security rules. These matter as much as app code because the browser app talks directly to Firebase.

`tools/`
: One-time refactor/splitting scripts used during the modular migration. These are not part of the live app runtime.

`.github/workflows/`
: GitHub Actions workflows used during the refactor and module-generation process. Review before deleting because some may still be useful for future automated checks.

## Backup And Safety Notes

The live app currently runs from `index.html` plus the modular scripts in `src/app/`.

Keep these files until the modular app has been stable long enough that rollback is no longer needed:

- `index.legacy.html`
- `index.modular.html`
- `src/app.js`
- refactor tools/workflows under `tools/` and `.github/workflows/`

They may look like bloat, but they are useful rollback/reference material until the app has been proven stable in production.

## Local Testing

Because the app is static, you can test most UI changes by serving the repo folder locally or by using a Netlify deploy preview.

Recommended checks before merging app changes:

1. Open the deploy preview or local page.
2. Sign in.
3. Switch company/workspace if the change touches company-specific behavior.
4. Create or edit a test job.
5. Create, edit, preview, and delete/undo a test invoice or estimate.
6. Upload and delete/undo a test photo if the change touches files/photos.
7. Check mobile width because the app is heavily used from phones.
8. Confirm the browser console has no new errors.

For JavaScript syntax checks, run `node --check` against changed `.js` files.

## Common Risk Areas

Be extra careful in these areas:

- Save and sync code, because bad writes can affect live team data.
- Invoice/estimate creation and deletion, because these records matter financially.
- Photo and attachment handling, because large base64 data can exceed browser/Firebase limits.
- Undo/delete flows, because duplicated or wrong restore handlers can bring records back incorrectly.
- Access control and command palette actions, because hidden UI is not the same as real permission enforcement.
- Firebase rules, because the app is client-side and rules are the real server-side guard.
- Script order in `index.html`, because modules currently share browser globals.

## Making Changes Safely

Use this pattern for future work:

1. Create a new branch.
2. Change one focused area at a time.
3. Keep `index.html` script order stable unless the change requires otherwise.
4. Test in a deploy preview before merging.
5. Merge only after the live-like preview works.
6. Keep rollback/reference files until the app has stayed stable through normal use.

## Possible Next Improvements

Good next cleanup/functionality passes:

- Move invoice attachment photos out of record data and into Firebase Storage.
- Add clearer invoice sending states, such as draft/prepared/sent, instead of marking items sent too early.
- Continue removing old refactor files only after production has stayed stable.
- Add a small automated smoke test that loads the app and checks the main buttons render.
- Add safer permission checks around owner-only/bank-related actions.
- Gradually convert shared global scripts into real ES modules once the current modular version has proven stable.

## Quick Glossary

- Production: the live app and live team data.
- Dev sandbox: separate data used for testing.
- Company namespace: the data bucket for one company.
- Owner workspace: cross-company dashboard/reporting mode.
- Firebase Auth: sign-in system.
- Firebase Realtime Database: shared app records.
- Firebase Storage: uploaded files/photos.
- Netlify Function: small server-side helper used for email sending.
