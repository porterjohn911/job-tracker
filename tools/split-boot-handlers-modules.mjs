import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'src', 'app', '10-handlers-boot.js');
const indexPath = path.join(root, 'index.modular.html');
const outDir = path.join(root, 'src', 'app', 'boot');

const source = await readFile(sourcePath, 'utf8');
const attachStart = source.indexOf('function attachHandlers(){');
if (attachStart === -1) throw new Error('Missing attachHandlers function');
const bodyStart = source.indexOf('\n', attachStart) + 1;
const bootStart = source.indexOf('\n}\n\ndocument.addEventListener', bodyStart);
if (bootStart === -1) throw new Error('Missing attachHandlers end / boot start');
const attachBody = source.slice(bodyStart, bootStart).trimEnd();
const bootCode = source.slice(bootStart + 3).trimStart();

function sliceBody(startMarker, endMarker) {
  const start = startMarker === null ? 0 : attachBody.indexOf(startMarker);
  if (start === -1) throw new Error(`Missing start marker: ${startMarker}`);
  const end = endMarker == null ? attachBody.length : attachBody.indexOf(endMarker, start + (startMarker || '').length);
  if (end === -1) throw new Error(`Missing end marker: ${endMarker}`);
  return attachBody.slice(start, end).trimEnd();
}

const handlerChunks = [
  {
    file: '01-shell-events.js',
    fn: 'attachShellHandlers',
    start: null,
    end: '  // Sort menu',
    description: 'Navigation, header, referrals, and primary shell handlers',
  },
  {
    file: '02-list-invoice-report-map-events.js',
    fn: 'attachListInvoiceReportMapHandlers',
    start: '  // Sort menu',
    end: '  // Calendar',
    description: 'Sort, bulk actions, invoices, reports, map, filters, and job opening handlers',
  },
  {
    file: '03-calendar-detail-events.js',
    fn: 'attachCalendarDetailHandlers',
    start: '  // Calendar',
    end: '  // Photos',
    description: 'Calendar, job detail, tabs, stage, and progress handlers',
  },
  {
    file: '04-job-asset-events.js',
    fn: 'attachJobAssetHandlers',
    start: '  // Photos',
    end: '  // Receipts & expenses',
    description: 'Photos, notes, tasks, logs, and documents handlers',
  },
  {
    file: '05-financial-team-time-events.js',
    fn: 'attachFinancialTeamTimeHandlers',
    start: '  // Receipts & expenses',
    end: null,
    description: 'Receipts, financials, communications, team, bank, and time handlers',
  },
];

await mkdir(outDir, { recursive: true });

for (const chunk of handlerChunks) {
  const body = sliceBody(chunk.start, chunk.end);
  const content = [
    `// ${chunk.description}`,
    '// Generated from src/app/10-handlers-boot.js.',
    '',
    `function ${chunk.fn}(){`,
    body,
    '}',
    '',
  ].join('\n');
  await writeFile(path.join(outDir, chunk.file), content);
}

const attachContent = [
  '// Main handler attachment orchestrator',
  '// Generated from src/app/10-handlers-boot.js.',
  '',
  'function attachHandlers(){',
  ...handlerChunks.map((chunk) => `  ${chunk.fn}();`),
  '}',
  '',
].join('\n');
await writeFile(path.join(outDir, '06-attach-handlers.js'), attachContent);

const bootContent = [
  '// Global keyboard listener and app boot sequence',
  '// Generated from src/app/10-handlers-boot.js.',
  '',
  bootCode,
  '',
].join('\n');
await writeFile(path.join(outDir, '07-boot.js'), bootContent);

const files = [
  ...handlerChunks.map((chunk) => chunk.file),
  '06-attach-handlers.js',
  '07-boot.js',
];
const scriptTags = files
  .map((file) => `<script src="./src/app/boot/${file}"></script>`)
  .join('\n');

const index = await readFile(indexPath, 'utf8');
const originalTag = '<script src="./src/app/10-handlers-boot.js"></script>';
let replaced = false;
let updated = index.replace(originalTag, () => {
  replaced = true;
  return scriptTags;
});

if (!replaced) {
  const existingSplitBlock = /<script src="\.\/src\/app\/boot\/01-shell-events\.js"><\/script>\n[\s\S]*?<\/body>/;
  updated = index.replace(existingSplitBlock, () => {
    replaced = true;
    return `${scriptTags}\n</body>`;
  });
}

if (!replaced) {
  throw new Error('Could not find boot/handler script block in index.modular.html');
}

await writeFile(indexPath, updated);

console.log('Created boot/handler modules:');
for (const file of files) console.log(`  src/app/boot/${file}`);
console.log('Updated index.modular.html to load the focused boot files.');
console.log('src/app/10-handlers-boot.js remains as the untouched source file for this split pass.');
