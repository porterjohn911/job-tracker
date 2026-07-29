# Firebase Storage CORS (needed for invoice PDFs)

## Why this is needed

Anything the invoice **PDF** embeds has to be *downloaded* by the browser first —
`fetch()` in `urlToDataURL()` (`src/app/invoices/04-invoice-pdf-send.js`) — because
a PDF cannot reference a remote image by URL the way an HTML email can. That fetch
is a cross-origin request to `firebasestorage.googleapis.com`, and the browser
blocks it unless the Storage bucket returns CORS headers for this site's origin.

This is why an image can appear in the emailed HTML (which just points an `<img>`
at the URL) while being missing from the attached PDF.

Affected today:

- **Job photos attached to an invoice** — uploaded to Storage, so they are remote
  URLs and are skipped when the fetch fails.
- **The emailed logo image** — the HTML email links to the hosted logo copy.

Not affected (they need no fetch):

- The **logo in the PDF** — an inline copy is saved at upload time
  (`invoiceLogoData`), so it embeds with no network request.
- Photos added directly in the invoice editor — stored as `data:` URLs.

## The fix

Save this as `cors.json`, replacing the origin with the site's real URL (no
trailing slash). Add every origin the app is served from:

```json
[
  {
    "origin": ["https://YOUR-SITE.netlify.app"],
    "method": ["GET"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```

Apply it to the bucket (project `witport-constructionservices`; confirm the exact
bucket name in Firebase Console → Storage, it is usually
`witport-constructionservices.appspot.com` or `...firebasestorage.app`):

```bash
gcloud storage buckets update gs://YOUR-BUCKET --cors-file=cors.json

# or with the older tool:
gsutil cors set cors.json gs://YOUR-BUCKET
```

Verify:

```bash
gcloud storage buckets describe gs://YOUR-BUCKET --format="default(cors_config)"
```

Then re-send an invoice. The photos should appear, and the "photos were left off
the PDF" warning should stop.

## Note

CORS controls *reading* files from the browser. It is unrelated to who is allowed
to upload — that is enforced by `storage.rules`, which requires a signed-in
non-anonymous user for the `logos/` and job asset paths.
