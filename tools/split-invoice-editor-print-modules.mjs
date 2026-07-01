import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'src', 'app', '08-invoice-editor-print.js');
const indexPath = path.join(root, 'index.modular.html');

const chunks = [
  {
    file: path.join('src', 'app', 'invoice-editor', '01-defaults-open.js'),
    start: '// ══ Invoice editor ══',
    end: 'function renderInvoiceModal',
    description: 'Invoice and estimate defaults plus editor launcher',
  },
  {
    file: path.join('src', 'app', 'invoice-editor', '02-editor-modal.js'),
    start: 'function renderInvoiceModal',
    end: '// ══ Printable invoice with company letterhead ══',
    description: 'Invoice and estimate editor modal',
  },
  {
    file: path.join('src', 'app', 'invoice-editor', '03-print-renderer.js'),
    start: '// ══ Printable invoice with company letterhead ══',
    end: null,
    description: 'Printable invoice and estimate renderer',
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
    '// Generated from src/app/08-invoice-editor-print.js.',
    '',
  ].join('\n');
  await writeFile(outPath, `${banner}${body}\n`);
}

const scriptTags = chunks
  .map((chunk) => `<script src="./${chunk.file.replaceAll(path.sep, '/')}"></script>`)
  .join('\n');

const index = await readFile(indexPath, 'utf8');
const originalTag = '<script src="./src/app/08-invoice-editor-print.js"></script>';
let replaced = false;
let updated = index.replace(originalTag, () => {
  replaced = true;
  return scriptTags;
});

if (!replaced) {
  const existingSplitBlock = /<script src="\.\/src\/app\/invoice-editor\/01-defaults-open\.js"><\/script>\n[\s\S]*?<script src="\.\/src\/app\/09-settings-access-command-voice\.js"><\/script>/;
  updated = index.replace(existingSplitBlock, () => {
    replaced = true;
    return `${scriptTags}\n<script src="./src/app/09-settings-access-command-voice.js"></script>`;
  });
}

if (!replaced) {
  throw new Error('Could not find invoice editor script block in index.modular.html');
}

await writeFile(indexPath, updated);

console.log('Created invoice editor modules:');
for (const chunk of chunks) console.log(`  ${chunk.file.replaceAll(path.sep, '/')}`);
console.log('Updated index.modular.html to load the focused invoice editor files.');
console.log('src/app/08-invoice-editor-print.js remains as the untouched source file for this split pass.');
