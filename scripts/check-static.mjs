import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const index = readFileSync(join(root, 'index.html'), 'utf8');
const scriptRe = /<script\s+src="\.\/([^"]+)"[^>]*><\/script>/g;
const scripts = [...index.matchAll(scriptRe)].map((m) => m[1]);

const requiredFirst = [
  'src/app/01-config-auth.js',
  'src/app/02-state-utils-data.js',
  'src/app/03-render-core.js',
];
const legacyRuntimeFiles = new Set([
  'src/app.js',
  'src/app/04-invoices-email.js',
  'src/app/05-owner-reports-map-notifications.js',
  'src/app/07-modals-jobs-share.js',
  'src/app/08-invoice-editor-print.js',
  'src/app/09-settings-access-command-voice.js',
  'src/app/10-handlers-boot.js',
]);

// Recurring-contract code: syntax-checked like everything else, but held out of
// index.html until the feature is complete. See the loop below.
const unwiredPrefix = 'src/app/contracts/';
const unwiredScripts = [
  'src/app/contracts/01-contract-periods.js',
  'src/app/contracts/02-contract-store.js',
  'src/app/contracts/03-contract-list.js',
  'src/app/contracts/04-contract-editor.js',
];

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

requiredFirst.forEach((file, index) => {
  if (scripts[index] !== file) {
    fail(`Expected script ${index + 1} to be ${file}, got ${scripts[index] || '(missing)'}`);
  }
});

scripts.forEach((file) => {
  if (!existsSync(join(root, file))) fail(`Missing runtime script: ${file}`);
  if (legacyRuntimeFiles.has(file)) fail(`Legacy generated source is loaded by index.html: ${file}`);
  if (file.startsWith(unwiredPrefix)) {
    fail(
      `${file} is loaded by index.html, but ${unwiredPrefix} is still being built ` +
        `unwired. Nothing under that folder should reach production until the ` +
        `feature is finished — remove this guard in the same commit that wires it up.`,
    );
  }
});

// Feature code that lives in the repo but must NOT be loaded by the running app
// yet. Recurring contracts are built and tested in isolation first, so a
// half-finished feature cannot affect the live app: a file index.html never
// references is a file the browser never fetches. Its tests inject it directly.
//
// Deleting these four lines is what turns the feature on, which keeps that a
// deliberate, reviewable, single-commit decision.
for (const file of unwiredScripts) {
  if (!existsSync(join(root, file))) fail(`Missing unwired script: ${file}`);
  execFileSync('node', ['--check', file], { cwd: root, stdio: 'inherit' });
}

for (const file of scripts.filter((file) => file.endsWith('.js'))) {
  execFileSync('node', ['--check', file], { cwd: root, stdio: 'inherit' });
}

// The rules files are hand-maintained and deployed separately from the site
// (firebase.json has no "database" key), so a syntax error in one would not
// surface until someone ran a deploy. Parse them here instead.
for (const file of ['database.rules.json', 'firebase.json']) {
  try {
    JSON.parse(readFileSync(join(root, file), 'utf8'));
  } catch (err) {
    fail(`${file} is not valid JSON: ${err.message}`);
  }
}
for (const fn of [
  'netlify/functions/send-invoice.js',
  'netlify/functions/api-keys.js',
  'netlify/functions/api-invoices.js',
  'netlify/functions/api-jobs.js',
  'netlify/functions/api-schedule.js',
  'netlify/functions/api-invoice-send.js',
  'netlify/functions/api-invoice-send-now.js',
  'netlify/functions/api-pending-sends.js',
  'netlify/functions/api-overview.js',
  'netlify/functions/api-expenses.js',
  'netlify/functions/api-time.js',
  'netlify/functions/api-receivables.js',
  'netlify/functions/api-job-profit.js',
  'netlify/functions/api-transactions.js',
  'netlify/functions/api-push-send.js',
  'netlify/functions/weekly-report.js',
  'netlify/functions/report-run.js',
  'netlify/functions/mcp.js',
  'netlify/functions/_lib/firebaseAdmin.js',
  'netlify/functions/_lib/apiKeyAuth.js',
  'netlify/functions/_lib/reports.js',
  'netlify/functions/_lib/weeklyReport.js',
  'netlify/functions/_lib/invoicePdf.js',
  'firebase-messaging-sw.js',
]) {
  execFileSync('node', ['--check', fn], { cwd: root, stdio: 'inherit' });
}

const pdfSend = readFileSync(join(root, 'src/app/invoices/04-invoice-pdf-send.js'), 'utf8');
if (pdfSend.includes('html2canvas')) {
  fail('Invoice PDF path must not use html2canvas; keep PDFs text/vector based.');
}
