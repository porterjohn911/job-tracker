import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'src', 'app', '09-settings-access-command-voice.js');
const indexPath = path.join(root, 'index.modular.html');

const chunks = [
  {
    file: path.join('src', 'app', 'settings', '01-settings-modal.js'),
    start: '// ══ Company / settings modal ══',
    end: '// ══ Company Switcher ══',
    description: 'Company settings modal and Gmail panel',
  },
  {
    file: path.join('src', 'app', 'workspace', '01-company-switcher.js'),
    start: '// ══ Company Switcher ══',
    end: '// ══ Access control: lock screen + team/role manager ══',
    description: 'Company and owner workspace switcher',
  },
  {
    file: path.join('src', 'app', 'access', '01-access-control.js'),
    start: '// ══ Access control: lock screen + team/role manager ══',
    end: '// Apply the active company\'s logo + color theme',
    description: 'PIN lock screen and access control modal',
  },
  {
    file: path.join('src', 'app', 'workspace', '02-branding.js'),
    start: '// Apply the active company\'s logo + color theme',
    end: '// ══ Command Palette ══',
    description: 'Active company branding theme',
  },
  {
    file: path.join('src', 'app', 'command', '01-command-palette.js'),
    start: '// ══ Command Palette ══',
    end: '// ══ Keyboard shortcuts modal ══',
    description: 'Command palette items, filtering, rendering, and execution',
  },
  {
    file: path.join('src', 'app', 'command', '02-shortcuts-modal.js'),
    start: '// ══ Keyboard shortcuts modal ══',
    end: '// ══ Voice dictation (Web Speech API) ══',
    description: 'Keyboard shortcuts modal',
  },
  {
    file: path.join('src', 'app', 'voice', '01-voice-dictation.js'),
    start: '// ══ Voice dictation (Web Speech API) ══',
    end: '// ══ Global keyboard ══',
    description: 'Voice dictation helpers and microphone buttons',
  },
  {
    file: path.join('src', 'app', 'keyboard', '01-global-keyboard.js'),
    start: '// ══ Global keyboard ══',
    end: null,
    description: 'Global keyboard shortcuts',
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
    '// Generated from src/app/09-settings-access-command-voice.js.',
    '',
  ].join('\n');
  await writeFile(outPath, `${banner}${body}\n`);
}

const scriptTags = chunks
  .map((chunk) => `<script src="./${chunk.file.replaceAll(path.sep, '/')}"></script>`)
  .join('\n');

const index = await readFile(indexPath, 'utf8');
const originalTag = '<script src="./src/app/09-settings-access-command-voice.js"></script>';
let replaced = false;
let updated = index.replace(originalTag, () => {
  replaced = true;
  return scriptTags;
});

if (!replaced) {
  const existingSplitBlock = /<script src="\.\/src\/app\/settings\/01-settings-modal\.js"><\/script>\n[\s\S]*?<script src="\.\/src\/app\/10-handlers-boot\.js"><\/script>/;
  updated = index.replace(existingSplitBlock, () => {
    replaced = true;
    return `${scriptTags}\n<script src="./src/app/10-handlers-boot.js"></script>`;
  });
}

if (!replaced) {
  throw new Error('Could not find settings/access/command/voice script block in index.modular.html');
}

await writeFile(indexPath, updated);

console.log('Created settings/access/command/voice modules:');
for (const chunk of chunks) console.log(`  ${chunk.file.replaceAll(path.sep, '/')}`);
console.log('Updated index.modular.html to load the focused files.');
console.log('src/app/09-settings-access-command-voice.js remains as the untouched source file for this split pass.');
