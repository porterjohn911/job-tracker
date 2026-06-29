import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'src', 'app', '05-owner-reports-map-notifications.js');
const indexPath = path.join(root, 'index.modular.html');
const outDir = path.join(root, 'src', 'app', 'views');

const chunks = [
  ['01-owner-dashboard.js', 1, 269, 'Owner dashboard, cross-company metrics, and owner chrome'],
  ['02-reports.js', 270, 425, 'Reports view'],
  ['03-map.js', 426, 507, 'Map view and geocoding'],
  ['04-notifications.js', 508, 585, 'Notifications and unread badge'],
  ['05-jobs-detail-shell.js', 586, 780, 'Jobs list, job cards, empty state, and detail shell'],
  ['06-detail-tabs-activity.js', 781, null, 'Job detail tabs and activity view'],
];

const source = await readFile(sourcePath, 'utf8');
const lines = source.split('\n');
await mkdir(outDir, { recursive: true });

for (const [file, start, end, description] of chunks) {
  const slice = lines.slice(start - 1, end == null ? undefined : end);
  const banner = [
    `// ${description}`,
    `// Generated from src/app/05-owner-reports-map-notifications.js lines ${start}-${end ?? lines.length}.`,
    '',
  ];
  await writeFile(path.join(outDir, file), `${banner.join('\n')}${slice.join('\n')}\n`);
}

const scriptTags = chunks
  .map(([file]) => `<script src="./src/app/views/${file}"></script>`)
  .join('\n');

const index = await readFile(indexPath, 'utf8');
const updated = index.replace(
  /<script src="\.\/src\/app\/05-owner-reports-map-notifications\.js"><\/script>/,
  scriptTags,
);

if (updated === index) {
  throw new Error('Could not replace src/app/05-owner-reports-map-notifications.js script tag in index.modular.html');
}

await writeFile(indexPath, updated);

console.log('Created owner/reports/map/jobs modules:');
for (const [file] of chunks) console.log(`  src/app/views/${file}`);
console.log('Updated index.modular.html to load the focused view files.');
console.log('src/app/05-owner-reports-map-notifications.js remains as the untouched source file for this split pass.');
