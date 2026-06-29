import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'src', 'app', '07-modals-jobs-share.js');
const indexPath = path.join(root, 'index.modular.html');

const chunks = [
  {
    file: path.join('src', 'app', 'jobs', '01-job-modal.js'),
    start: '// ══ Modals ══',
    end: 'function showSetupModal()',
    description: 'Job modal and job create/edit/delete actions',
  },
  {
    file: path.join('src', 'app', 'modals', '01-setup-modal.js'),
    start: 'function showSetupModal()',
    end: '// ══ Helpers for photo backward compat ══',
    description: 'Firebase/team setup modal',
  },
  {
    file: path.join('src', 'app', 'exports', '01-csv-export.js'),
    start: '// ══ CSV export ══',
    end: '// ══ Share / Print ══',
    description: 'CSV export',
  },
  {
    file: path.join('src', 'app', 'share', '01-print-share.js'),
    start: '// ══ Helpers for photo backward compat ══',
    end: null,
    description: 'Photo compatibility, print summary, and native/share fallback',
  },
];

const source = await readFile(sourcePath, 'utf8');

function sliceBetween(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) throw new Error(`Missing start marker: ${startMarker}`);
  const end = endMarker == null ? text.length : text.indexOf(endMarker, start + startMarker.length);
  if (end === -1) throw new Error(`Missing end marker: ${endMarker}`);
  return text.slice(start, end).trimEnd();
}

for (const chunk of chunks) {
  const body = sliceBetween(source, chunk.start, chunk.end);
  const outPath = path.join(root, chunk.file);
  await mkdir(path.dirname(outPath), { recursive: true });
  const banner = [
    `// ${chunk.description}`,
    '// Generated from src/app/07-modals-jobs-share.js.',
    '',
  ].join('\n');
  await writeFile(outPath, `${banner}${body}\n`);
}

const scriptTags = chunks
  .map((chunk) => `<script src="./${chunk.file.replaceAll(path.sep, '/')}"></script>`)
  .join('\n');

const index = await readFile(indexPath, 'utf8');
const updated = index.replace(
  /<script src="\.\/src\/app\/07-modals-jobs-share\.js"><\/script>/,
  scriptTags,
);

if (updated === index) {
  throw new Error('Could not replace src/app/07-modals-jobs-share.js script tag in index.modular.html');
}

await writeFile(indexPath, updated);

console.log('Created modal/job/export/share modules:');
for (const chunk of chunks) console.log(`  ${chunk.file.replaceAll(path.sep, '/')}`);
console.log('Updated index.modular.html to load the focused files.');
console.log('src/app/07-modals-jobs-share.js remains as the untouched source file for this split pass.');
