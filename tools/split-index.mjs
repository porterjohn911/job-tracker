import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const indexPath = path.join(root, 'index.html');
const srcDir = path.join(root, 'src');
const modularPath = path.join(root, 'index.modular.html');
const cssPath = path.join(srcDir, 'styles.css');
const appPath = path.join(srcDir, 'app.js');

const html = await readFile(indexPath, 'utf8');
const styleMatch = html.match(/<style>\n([\s\S]*?)\n<\/style>/);
const scriptMatch = html.match(/\n<script>\n([\s\S]*?)\n<\/script>\n<\/body>/);

if (!styleMatch) {
  throw new Error('Could not find the main <style> block in index.html');
}

if (!scriptMatch) {
  throw new Error('Could not find the main inline app <script> block in index.html');
}

await mkdir(srcDir, { recursive: true });

const css = `${styleMatch[1]}\n`;
const app = `${scriptMatch[1]}\n`;
const modular = html
  .replace(/<style>\n[\s\S]*?\n<\/style>/, '<link rel="stylesheet" href="./src/styles.css">')
  .replace(/\n<script>\n[\s\S]*?\n<\/script>\n<\/body>/, '\n<script src="./src/app.js"></script>\n</body>');

await writeFile(modularPath, modular);
await writeFile(cssPath, css);
await writeFile(appPath, app);

console.log('Created modular test files:');
console.log('  index.modular.html');
console.log('  src/styles.css');
console.log('  src/app.js');
console.log('Original index.html was read only and left unchanged.');
