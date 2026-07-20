// Web push notifications (Firebase Cloud Messaging).
//
// Two responsibilities:
//   1. Register this device: ask permission, get an FCM token, and store it at
//      ${DB_NS}/push_tokens/${uid}/${hash(token)} so the server can reach it.
//   2. Fan out: when the current user adds a note or daily-log entry, POST the
//      recipients to the api-push-send function, which looks up their tokens
//      and sends the actual push.
//
// Requirements / caveats:
//   • Only works with real Firebase Auth logins (FB_USER) — the token node is
//     write-guarded per uid in database.rules.json.
//   • Needs a public VAPID key (FIREBASE_CONFIG.vapidKey), served by
//     app-config.js from the FIREBASE_VAPID_KEY env var. If it is missing,
//     registration is skipped gracefully and no errors surface to the user.
//   • On iOS, web push only works once the app is installed to the Home Screen
//     (Add to Home Screen, iOS 16.4+). In a normal Safari tab it stays off.

const PUSH_ENDPOINT = '/.netlify/functions/api-push-send';

function pushSupported() {
  return typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && typeof window !== 'undefined'
    && 'PushManager' in window
    && 'Notification' in window;
}

// Stable identity used to match a person to their device tokens. Mirrors the
// name-based matching the in-app notifications already use (see
// buildNotifications), lowercased with non-alphanumerics collapsed.
function pushNameKey(name) {
  return String(name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function pushVapidKey() {
  try { return (typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG && FIREBASE_CONFIG.vapidKey) || ''; }
  catch (e) { return ''; }
}

function pushAuthUser() {
  try { return (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length && firebase.auth && firebase.auth().currentUser) || null; }
  catch (e) { return null; }
}

// A signed-in Firebase user is required to write the token node.
function pushLoggedIn() {
  return !!(typeof FB_USER !== 'undefined' && FB_USER && FB_USER.uid) && !!pushAuthUser();
}

// Whether it makes sense to show an "enable on this device" affordance.
function pushCanPrompt() {
  return pushSupported() && pushLoggedIn() && Notification.permission !== 'granted' && Notification.permission !== 'denied';
}

let _pushSWReg = null;
function registerPushSW() {
  if (_pushSWReg) return _pushSWReg;
  _pushSWReg = navigator.serviceWorker.register('/firebase-messaging-sw.js').catch((e) => {
    _pushSWReg = null;
    throw e;
  });
  return _pushSWReg;
}

async function pushHashKey(token) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    // Fallback: a short deterministic key from the token tail (SubtleCrypto
    // needs a secure context; this keeps things working if it is unavailable).
    return 't' + token.slice(-40).replace(/[^a-z0-9]/gi, '');
  }
}

let _pushForegroundBound = false;
function bindPushForeground(messaging) {
  if (_pushForegroundBound) return;
  _pushForegroundBound = true;
  try {
    messaging.onMessage((payload) => {
      const n = (payload && payload.notification) || {};
      const label = n.title ? (n.body ? n.title + ': ' + n.body : n.title) : (n.body || 'New notification');
      try { toast(label, 'note'); } catch (e) { /* toast may not be ready */ }
      try { if (typeof updateBellBadge === 'function') updateBellBadge(); } catch (e) {}
    });
  } catch (e) { /* messaging not available */ }
}

// Ask permission (when interactive), obtain a token, and persist it.
// Returns true on success. Never throws — surfaces problems via toast only
// when the user explicitly triggered it (interactive).
async function ensurePushToken(interactive) {
  if (!pushSupported()) {
    if (interactive) toast('This device or browser does not support push notifications', '');
    return false;
  }
  if (!pushLoggedIn()) {
    if (interactive) toast('Sign in first to enable notifications', '');
    return false;
  }
  let perm = Notification.permission;
  if (perm === 'denied') {
    if (interactive) toast('Notifications are blocked — turn them on in your browser settings', '');
    return false;
  }
  if (perm === 'default') {
    if (!interactive) return false;
    try { perm = await Notification.requestPermission(); } catch (e) { perm = 'default'; }
  }
  if (perm !== 'granted') return false;

  const vapidKey = pushVapidKey();
  if (!vapidKey) {
    if (interactive) toast('Push is not configured yet (missing server VAPID key)', '');
    console.warn('[push] FIREBASE_CONFIG.vapidKey is missing — set FIREBASE_VAPID_KEY in Netlify env.');
    return false;
  }
  if (typeof firebase === 'undefined' || !firebase.messaging) {
    if (interactive) toast('Messaging library not loaded', '');
    return false;
  }

  try {
    const reg = await registerPushSW();
    const messaging = firebase.messaging();
    const token = await messaging.getToken({ vapidKey, serviceWorkerRegistration: reg });
    if (!token) return false;

    const hash = await pushHashKey(token);
    const ua = String(navigator.userAgent || '').slice(0, 180);
    await firebase.database().ref(DB_NS + '/push_tokens/' + FB_USER.uid + '/' + hash).set({
      token,
      name: S.user || FB_USER.name || '',
      nameKey: pushNameKey(S.user || FB_USER.name || ''),
      ua,
      ts: Date.now(),
    });
    try { localStorage.setItem(LS('push_enabled'), '1'); } catch (e) {}
    bindPushForeground(messaging);
    if (interactive) toast('Notifications enabled on this device', 'note');
    return true;
  } catch (e) {
    console.warn('[push] token registration failed:', e && e.message ? e.message : e);
    if (interactive) toast('Could not enable notifications: ' + ((e && e.message) || 'unknown'), '');
    return false;
  }
}

// Called once the user is booted and (optionally) already granted permission.
// Silently refreshes the stored token so rotations are captured.
function initPush() {
  if (!pushSupported() || !pushLoggedIn()) return;
  try {
    if (Notification.permission === 'granted') {
      ensurePushToken(false);
    } else if (typeof firebase !== 'undefined' && firebase.messaging) {
      // Still bind the foreground handler so an already-open tab reacts even
      // before this device has been granted permission on a later visit.
    }
  } catch (e) { /* non-fatal */ }
}

// User-triggered entry point (e.g. the "Enable on this device" button).
function enablePushNotifications() {
  return ensurePushToken(true);
}

// Resolve who should be pinged for an event on `job` given the entry `text`.
// Mirrors the in-app rules: the assigned member, plus anyone @-mentioned,
// excluding the person who wrote it.
function pushRecipientsFor(job, text) {
  const out = new Set();
  const actor = pushNameKey(S.user);
  if (job && job.assigned) out.add(pushNameKey(job.assigned));

  const atTokens = new Set(
    String(text || '').toLowerCase().match(/@([a-z0-9][a-z0-9._-]*)/g)?.map((s) => s.slice(1).replace(/[._-]+$/, '')) || [],
  );
  if (atTokens.size && Array.isArray(S.members)) {
    S.members.forEach((m) => {
      const parts = String(m || '').toLowerCase().split(/\s+/).filter(Boolean);
      if (parts.some((p) => atTokens.has(p))) out.add(pushNameKey(m));
    });
  }
  out.delete(actor);
  out.delete('');
  return [...out];
}

// Fire-and-forget push for a note or daily-log entry. Safe to call even if the
// sender's own device has no push support — sending only needs a valid ID
// token, not a local token.
async function notifyPush(opts) {
  try {
    const { event, job, text } = opts || {};
    if (!job) return;
    const user = pushAuthUser();
    if (!user) return; // needs a signed-in Firebase user for the ID token
    const recipients = pushRecipientsFor(job, text);
    if (!recipients.length) return;

    const who = S.user || FB_USER && FB_USER.name || 'Someone';
    const snippet = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const title = event === 'log' ? who + ' added a daily log' : who + ' added a note';
    const body = (job.name ? job.name + ': ' : '') + snippet;

    const idToken = await user.getIdToken();
    await fetch(PUSH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
      body: JSON.stringify({
        ns: DB_NS,
        jobId: job.id,
        event,
        title,
        body,
        url: '/',
        actor: pushNameKey(S.user),
        recipients,
      }),
    });
  } catch (e) {
    console.debug('[push] notify skipped:', e && e.message ? e.message : e);
  }
}
