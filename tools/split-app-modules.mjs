import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const appPath = path.join(root, 'src', 'app.js');
const indexPath = path.join(root, 'index.modular.html');
const outDir = path.join(root, 'src', 'app');

const chunks = [
  ['01-config-auth.js', 1, 268, 'Environment, company configuration, and auth gates'],
  ['02-state-utils-data.js', 269, 498, 'State, utilities, local storage, Firebase, and time helpers'],
  ['03-render-core.js', 499, 828, 'Main render dispatcher, dashboard, schedule, and detail shell'],
  ['04-invoices-email.js', 829, 1639, 'Invoice lists, invoice email, Gmail, PDF, and send helpers'],
  ['05-owner-reports-map-notifications.js', 1640, 2774, 'Owner dashboards, reports, map, and notifications'],
  ['06-referrals-time-bank.js', 2775, 3205, 'Referrals, time tracking, payroll, and bank import'],
  ['07-modals-jobs-share.js', 3206, 3387, 'Core modals, job editor, CSV export, share, and print'],
  ['08-invoice-editor-print.js', 3388, 3773, 'Invoice editor and printable invoice rendering'],
  ['09-settings-access-command-voice.js', 3774, 4242, 'Settings, workspace switcher, access, command palette, shortcuts, and voice'],
  ['10-handlers-boot.js', 4243, null, 'Event wiring, global handlers, and boot sequence'],
];

const app = await readFile(appPath, 'utf8');
const lines = app.split('\n');
await mkdir(outDir, { recursive: true });

for (const [file, start, end, description] of chunks) {
  const slice = lines.slice(start - 1, end == null ? undefined : end);
  const banner = [
    `// ${description}`,
    `// Generated from src/app.js lines ${start}-${end ?? lines.length}.`,
    '',
  ];
  await writeFile(path.join(outDir, file), `${banner.join('\n')}${slice.join('\n')}\n`);
}

const scriptTags = chunks
  .map(([file]) => `<script src="./src/app/${file}"></script>`)
  .join('\n');

const index = await readFile(indexPath, 'utf8');
const updated = index.replace(
  /<script src="\.\/src\/app\.js"><\/script>/,
  scriptTags,
);

if (updated === index) {
  throw new Error('Could not replace src/app.js script tag in index.modular.html');
}

await writeFile(indexPath, updated);

console.log('Created ordered app modules:');
for (const [file] of chunks) console.log(`  src/app/${file}`);
console.log('Updated index.modular.html to load the ordered module files.');
console.log('src/app.js remains as the untouched source monolith for this split pass.');
