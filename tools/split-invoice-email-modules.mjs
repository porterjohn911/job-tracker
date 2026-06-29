import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'src', 'app', '04-invoices-email.js');
const indexPath = path.join(root, 'index.modular.html');
const outDir = path.join(root, 'src', 'app', 'invoices');

const chunks = [
  ['01-invoice-list.js', 1, 222, 'Global invoice list, aging report, and job picker'],
  ['02-invoice-email-template.js', 223, 433, 'Invoice email HTML/text/EML and download helpers'],
  ['03-gmail-api.js', 434, 572, 'Gmail OAuth, MIME building, and Gmail API send helpers'],
  ['04-invoice-pdf-send.js', 573, null, 'Invoice PDF creation and send modal'],
];

const source = await readFile(sourcePath, 'utf8');
const lines = source.split('\n');
await mkdir(outDir, { recursive: true });

for (const [file, start, end, description] of chunks) {
  const slice = lines.slice(start - 1, end == null ? undefined : end);
  const banner = [
    `// ${description}`,
    `// Generated from src/app/04-invoices-email.js lines ${start}-${end ?? lines.length}.`,
    '',
  ];
  await writeFile(path.join(outDir, file), `${banner.join('\n')}${slice.join('\n')}\n`);
}

const scriptTags = chunks
  .map(([file]) => `<script src="./src/app/invoices/${file}"></script>`)
  .join('\n');

const index = await readFile(indexPath, 'utf8');
const updated = index.replace(
  /<script src="\.\/src\/app\/04-invoices-email\.js"><\/script>/,
  scriptTags,
);

if (updated === index) {
  throw new Error('Could not replace src/app/04-invoices-email.js script tag in index.modular.html');
}

await writeFile(indexPath, updated);

console.log('Created invoice/email modules:');
for (const [file] of chunks) console.log(`  src/app/invoices/${file}`);
console.log('Updated index.modular.html to load the invoice/email module files.');
console.log('src/app/04-invoices-email.js remains as the untouched source file for this split pass.');
