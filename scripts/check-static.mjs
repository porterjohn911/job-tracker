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
});

for (const file of scripts.filter((file) => file.endsWith('.js'))) {
  execFileSync('node', ['--check', file], { cwd: root, stdio: 'inherit' });
}
for (const fn of [
  'netlify/functions/send-invoice.js',
  'netlify/functions/api-keys.js',
  'netlify/functions/api-invoices.js',
  'netlify/functions/api-jobs.js',
  'netlify/functions/api-schedule.js',
  'netlify/functions/api-invoice-send.js',
  'netlify/functions/api-pending-sends.js',
  'netlify/functions/api-overview.js',
  'netlify/functions/_lib/firebaseAdmin.js',
  'netlify/functions/_lib/apiKeyAuth.js',
]) {
  execFileSync('node', ['--check', fn], { cwd: root, stdio: 'inherit' });
}

const pdfSend = readFileSync(join(root, 'src/app/invoices/04-invoice-pdf-send.js'), 'utf8');
if (pdfSend.includes('html2canvas')) {
  fail('Invoice PDF path must not use html2canvas; keep PDFs text/vector based.');
}
