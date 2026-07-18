// Shared Firebase Admin SDK initialization for the agent API endpoints.
//
// The Admin SDK talks to the Realtime Database server-side, bypassing the
// browser security rules in database.rules.json. That is intentional: OUR
// endpoints are the authorization layer for agent traffic (see
// AGENT_API_DESIGN.md §5). Every endpoint must still enforce the key's
// scopes/company before touching data.
//
// Required Netlify env vars (Site config -> Environment variables):
//   FIREBASE_SERVICE_ACCOUNT  = the service-account JSON, as a single string
//                               (the whole {...} downloaded from the Firebase
//                               console -> Project settings -> Service accounts).
//   FIREBASE_DB_URL           = the Realtime Database URL (optional; falls back
//                               to the project's public default below).
//
// This is the one high-value server secret in the design. Keep it in Netlify
// env only — never commit it, never expose it to the browser.

// firebase-admin v14 uses the modular subpath API — the legacy namespaced
// surface (admin.apps / admin.credential) is not exported and throws.
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getAuth } = require('firebase-admin/auth');

const PUBLIC_FIREBASE_DB_URL = 'https://witport-constructionservices-default-rtdb.firebaseio.com';

let cachedApp = null;

// Returns the initialized admin app, or throws a clear error if the service
// account is not configured. Reused across warm invocations.
function getAdminApp() {
  if (cachedApp) return cachedApp;
  const existing = getApps();
  if (existing.length) {
    cachedApp = existing[0];
    return cachedApp;
  }

  let raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || !raw.trim()) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not set — add the service-account JSON to Netlify env vars');
  }
  raw = raw.trim();
  // Tolerate a value accidentally wrapped in an extra pair of quotes on paste.
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1);
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON (check the paste was not truncated): ' + e.message);
  }
  if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is missing project_id/private_key/client_email — is this the service-account JSON?');
  }

  const databaseURL = (process.env.FIREBASE_DB_URL || PUBLIC_FIREBASE_DB_URL).replace(/\/+$/, '');

  cachedApp = initializeApp({
    credential: cert(serviceAccount),
    databaseURL,
  });
  return cachedApp;
}

function db() {
  return getDatabase(getAdminApp());
}

function auth() {
  return getAuth(getAdminApp());
}

module.exports = { getAdminApp, db, auth };
