# Modular Refactor Branch

This branch is for safely splitting the single-file app without touching the production `index.html`.

## Current safety rule

`index.html` remains the original live file. Do not replace it until the modular version has been tested.

## Generate the modular test files

From the repo root, run:

```bash
node tools/split-index.mjs
```

That creates:

```text
index.modular.html
src/styles.css
src/app.js
```

The generated `index.modular.html` points to the extracted CSS and JS files. The original `index.html` is read only by the script and is left unchanged.

## Why this first step is conservative

This is a mechanical split only. It does not yet change app behavior, storage, sync, invoices, or UI logic. Once the modular page is confirmed to run, the next cleanup passes can split `src/app.js` into focused modules such as data, Firebase, invoices, jobs, photos, time, bank, and UI helpers.
